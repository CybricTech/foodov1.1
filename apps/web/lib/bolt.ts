/**
 * Bolt Ride Booker API client.
 *
 * Wraps every Bolt call so the auth + token cache dance isn't repeated at each
 * call site. Public functions throw BoltApiError on API errors; callers decide
 * how to surface them (the booking engine falls back to the Telegram note).
 *
 * Auth model: OAuth2 client_credentials → POST https://oidc.bolt.eu/token →
 * bearer token. Cached in-memory (per-instance L1) and in Postgres
 * (`bolt_auth_tokens` singleton, shared L2), matching lib/monnify.ts.
 *
 * Two things the API docs are emphatic about, both encoded here:
 *   - `scope` must be exactly "ridebooker:api". Omit it and the token call
 *     still succeeds, but every subsequent API call fails NOT_AUTHORIZED.
 *   - Money is in major units (12.5 = ₦12.50). Everything in our DB is kobo,
 *     so nothing leaves this module without passing through toKobo().
 */
import { createServiceClient } from "@/lib/supabase/server";

const OIDC_TOKEN_URL = "https://oidc.bolt.eu/token";
const OAUTH_SCOPE = "ridebooker:api";

const PROD_BASE = "https://node.bolt.eu/ride-booker-api/reseller";
const SANDBOX_BASE = "https://node.bolt.eu/ride-booker-api-sandbox/reseller";

// Refresh this far ahead of stated expiry so a token can't lapse mid-request.
// Bolt's own guidance: proactively refresh at ~80% of expires_in (~8 minutes
// of a 10-minute token) rather than waiting for a 401. 120s margin matches
// that on a 600s token; the 401-retry in boltFetch is the backstop if a
// request is ever in flight right as this window closes.
const TOKEN_REFRESH_MARGIN_MS = 120_000;
// Fallback only — we trust the API's expires_in when it's well-formed.
const TOKEN_DEFAULT_TTL_MS = 3500 * 1000;

export type BoltEnvironment = "sandbox" | "production";

/**
 * Bolt's ride states, plus three of our own for rides that never reached Bolt.
 * @see supabase/migrations/095_bolt_ride_booking.sql
 */
export const BOLT_TERMINAL_STATES = [
  "COMPLETED",
  "CANCELLED",
  "CLIENT_CANCELLED",
  "CLIENT_DID_NOT_SHOW",
  "NO_DRIVER_FOUND",
  "PAYMENT_BOOKING_FAILED",
  "CREATE_FAILED",
] as const;

/** Terminal states where the ride did not deliver and a re-book is warranted. */
export const BOLT_FAILED_STATES = [
  "CANCELLED",
  "CLIENT_CANCELLED",
  "CLIENT_DID_NOT_SHOW",
  "NO_DRIVER_FOUND",
  "PAYMENT_BOOKING_FAILED",
] as const;

export function isTerminalState(state: string): boolean {
  return (BOLT_TERMINAL_STATES as readonly string[]).includes(state);
}

export function isFailedState(state: string): boolean {
  return (BOLT_FAILED_STATES as readonly string[]).includes(state);
}

export class BoltApiError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  /**
   * The x-bolt-tracking response header. Bolt's own docs ask for this when
   * you contact them about a failed request — worth keeping even though
   * nothing here currently surfaces it further than the thrown error.
   */
  readonly trackingId: string | null;

  constructor(
    message: string,
    code: string | null = null,
    status: number | null = null,
    trackingId: string | null = null
  ) {
    super(message);
    this.name = "BoltApiError";
    this.code = code;
    this.status = status;
    this.trackingId = trackingId;
  }
}

/** Bolt quotes fares in major units; our DB is kobo throughout. */
export function toKobo(amount: number): number {
  return Math.round(amount * 100);
}

function clientId(): string {
  const v = process.env.BOLT_CLIENT_ID;
  if (!v) throw new BoltApiError("BOLT_CLIENT_ID is not configured");
  return v;
}

function clientSecret(): string {
  const v = process.env.BOLT_CLIENT_SECRET;
  if (!v) throw new BoltApiError("BOLT_CLIENT_SECRET is not configured");
  return v;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Authentication                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

type CachedToken = { token: string; expiresAt: number };
let memCache: CachedToken | null = null;

/** Drops the in-memory token so the next call re-authenticates. */
export function invalidateBoltToken(): void {
  memCache = null;
}

/**
 * Returns a valid Bolt access token. Cache chain: in-memory → Postgres →
 * oidc.bolt.eu. Safe under concurrent refresh — racing instances each end up
 * with a valid token and the upsert simply lands on whichever finished last.
 */
export async function getBoltAccessToken(): Promise<string> {
  const now = Date.now();

  if (memCache && memCache.expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
    return memCache.token;
  }

  // L2: Postgres-backed cache, so cold starts across the fleet share a token.
  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (supabase as any)
      .from("bolt_auth_tokens")
      .select("access_token, expires_at")
      .eq("id", "singleton")
      .maybeSingle();

    const row = cached as { access_token?: string; expires_at?: string } | null;
    if (row?.access_token && row.expires_at) {
      const expiresAt = new Date(row.expires_at).getTime();
      if (expiresAt > now + TOKEN_REFRESH_MARGIN_MS) {
        memCache = { token: row.access_token, expiresAt };
        return row.access_token;
      }
    }
  } catch (err) {
    // A cache miss costs one auth round-trip; failing the parent request
    // because the cache is unavailable would be worse.
    console.error("[bolt] token cache read failed:", err);
  }

  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "client_credentials",
    scope: OAUTH_SCOPE,
  });

  let res: Response;
  try {
    res = await fetch(OIDC_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch (err) {
    throw new BoltApiError(
      `Bolt auth request failed: ${err instanceof Error ? err.message : "network error"}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BoltApiError(`Bolt auth failed: ${res.status} ${text.slice(0, 200)}`, null, res.status);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const token = data.access_token;
  if (!token) throw new BoltApiError("Bolt auth: missing access_token in response");

  const ttlMs = data.expires_in
    ? Math.max(60_000, data.expires_in * 1000 - TOKEN_REFRESH_MARGIN_MS)
    : TOKEN_DEFAULT_TTL_MS;
  const expiresAt = now + ttlMs;

  memCache = { token, expiresAt };

  try {
    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("bolt_auth_tokens").upsert(
      {
        id: "singleton",
        access_token: token,
        expires_at: new Date(expiresAt).toISOString(),
        refreshed_at: new Date(now).toISOString(),
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.error("[bolt] token cache write failed:", err);
  }

  return token;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Transport                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Builds a full URL for the active environment.
 *
 * Production and sandbox differ in two ways — the host path and an extra
 * `/sandbox/` segment — and sandbox additionally requires a `uuid` query
 * param identifying the sandbox instance on every call.
 */
function buildUrl(
  path: string,
  env: BoltEnvironment,
  version: "v1" | "v2",
  query: Record<string, string | number | undefined> = {}
): string {
  const base = env === "sandbox" ? SANDBOX_BASE : PROD_BASE;
  const segment = env === "sandbox" ? `/${version}/sandbox` : `/${version}`;
  const url = new URL(`${base}${segment}${path}`);

  if (env === "sandbox") {
    const uuid = process.env.BOLT_SANDBOX_UUID;
    if (!uuid) throw new BoltApiError("BOLT_SANDBOX_UUID is not configured");
    url.searchParams.set("uuid", uuid);
  }
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Authenticated fetch with one automatic retry on 401, in case the token was
 * revoked or expired early. Mirrors lib/monnify.ts authedFetch.
 */
async function boltFetch<T>(
  path: string,
  opts: {
    env: BoltEnvironment;
    method?: "GET" | "POST";
    version?: "v1" | "v2";
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  }
): Promise<T> {
  const { env, method = "GET", version = "v1", body, query } = opts;
  const url = buildUrl(path, env, version, query);

  const doFetch = async () => {
    const token = await getBoltAccessToken();
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  };

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401) {
      invalidateBoltToken();
      res = await doFetch();
    }
  } catch (err) {
    throw new BoltApiError(
      `Bolt request failed (${path}): ${err instanceof Error ? err.message : "network error"}`
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body — surfaced verbatim in the error below.
  }

  if (!res.ok) {
    // Bolt's error body is { code: <number>, message: "RIDE_BOOKER_API_..." } —
    // `message` carries the actual human-readable identifier (e.g.
    // RIDE_BOOKER_API_AREA_NOT_SERVICED); `code` is an opaque number that means
    // nothing on its own. Both are also echoed as response headers. Reading
    // only `code` (as this used to) throws away the one field that explains
    // what actually went wrong — every failure this system has ever logged
    // said something like "404 30000" instead of "404
    // RIDE_BOOKER_API_AREA_NOT_SERVICED".
    const errObj = parsed as { code?: number | string; message?: string } | null;
    const identifier =
      errObj?.message ?? res.headers.get("x-bolt-error-message") ?? null;
    const numericCode =
      errObj?.code != null
        ? String(errObj.code)
        : res.headers.get("x-bolt-error-code");
    const trackingId = res.headers.get("x-bolt-tracking");

    throw new BoltApiError(
      `Bolt ${path} failed: ${res.status} ${identifier ?? numericCode ?? text.slice(0, 200)}` +
        (identifier && numericCode ? ` (code ${numericCode})` : ""),
      identifier ?? numericCode,
      res.status,
      trackingId
    );
  }

  return parsed as T;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Types                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * A stop is coordinates only.
 *
 * GeoPointWithAddress does define an optional `address`, but its own schema
 * says: "THIS FIELD IS OPTIONAL & YOU SHOULD NOT USE IT UNLESS YOU HAVE BEEN
 * ADVISED BY US TO DO SO." Omitting it also makes the estimate and create
 * payloads trivially identical, which the single-use fare_id requires.
 */
export interface BoltStop {
  lat: number;
  lng: number;
}

export interface BoltEstimationPrice {
  /** Display string, e.g. "10.50–12.50€". Not parseable — use the numbers. */
  amount: string;
  minimum_amount?: number;
  maximum_amount?: number;
  currency_code?: string;
}

export interface BoltEstimation {
  payment_method?: string;
  fare_id?: string;
  /** Seconds until pickup. */
  eta?: number | null;
  price?: BoltEstimationPrice;
}

export interface BoltCategoryEstimate {
  /**
   * Documented as a closed enum with "motorbike" a literal value — but this
   * Nigerian Business account's real /rides/estimations response never
   * returns that. Confirmed live on 2026-07-31 against a real Copper Pot
   * estimate: the bike option (name "Send Motorbike") comes back as
   * vehicle_category: "other" with vehicle_option.type: "delivery_motorbike".
   * See isMotorbikeCategory — matches has already silently failed every
   * production booking attempt tonight for this reason, always falling back
   * to Telegram, never because no bike was actually available.
   */
  vehicle_category?: string;
  vehicle_option?: { type?: string; name?: string; seats?: number };
  seats?: number;
  estimations?: BoltEstimation[];
}

export interface BoltVehicle {
  car_model?: string;
  car_reg_number?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_picture?: string;
  fleet_company_name?: string;
}

export interface BoltRideDetails {
  ride_id: number;
  state: string;
  created?: string;
  start_time?: string;
  finish_time?: string;
  eta_to_client?: number | null;
  eta_to_destination?: number | null;
  note_to_driver?: string;
  user?: { name?: string; phone?: string };
  vehicle?: BoltVehicle | null;
  payment_method?: string;
  /** Bolt-hosted live tracking page for this ride. */
  tracking_url?: string | null;
}

export interface BoltReceipt {
  ride_id: number;
  amount: number;
  currency_code: string;
  invoice_url?: string | null;
  fare_breakdown?: {
    type: "booking_fee" | "ride_fee" | "cancellation_fee" | "toll_road" | "other";
    amount: number;
  }[];
}

export interface BoltLocation {
  ride_id: number;
  location: { lat: number; lng: number };
  bearing?: number;
}

/**
 * A named stop inside a Bolt-defined custom area (airport ranks, mall bays).
 * Curated by Bolt, not something a reseller can populate — the only place in
 * the whole API where a pickup carries a human name rather than a street.
 */
export interface BoltCustomLocation {
  lat: number;
  lng: number;
  address: string;
  name: string;
}

export interface BoltPlaceDetails {
  place: { lat: number; lng: number; address: string };
  custom_area?: {
    name: string;
    /** When true, only the listed points may be used as stops in this zone. */
    is_restricted: boolean;
    points?: BoltCustomLocation[];
  } | null;
}

export interface BoltHistoryRide {
  ride_id: number;
  created?: string;
  state?: string;
  user?: { name?: string; phone?: string };
  vehicle?: BoltVehicle | null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Endpoints                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Time and price estimates per vehicle category. The only endpoint on
 * /reseller/v2/. Returns a fare_id per category+payment-method pair, which is
 * single-use and expires after 5 minutes — so create the ride immediately, and
 * with byte-identical stops, or Bolt rejects it as INVALID_FARE_ID.
 */
export async function estimateRide(
  env: BoltEnvironment,
  stops: BoltStop[]
): Promise<BoltCategoryEstimate[]> {
  const data = await boltFetch<{ categories?: BoltCategoryEstimate[] }>("/rides/estimations", {
    env,
    method: "POST",
    version: "v2",
    body: { stops, payment_methods: ["business"] },
  });
  return data?.categories ?? [];
}

/**
 * Paginated list of past rides on the account.
 *
 * Explicitly documented as returning data in no particular order, so callers
 * must page through and match on ride_id rather than assuming recency.
 */
export async function getRidesHistory(
  env: BoltEnvironment,
  opts: { page?: number; itemsPerPage?: number } = {}
): Promise<{ rides: BoltHistoryRide[]; pagination?: { total_pages?: number; current_page?: number } }> {
  return boltFetch("/rides/history", {
    env,
    query: { page: opts.page, items_per_page: opts.itemsPerPage },
  });
}

export async function createRide(
  env: BoltEnvironment,
  params: {
    fareId: string;
    stops: BoltStop[];
    riderName: string;
    riderPhone: string;
    noteToDriver: string;
  }
): Promise<{ ride_id: number }> {
  return boltFetch<{ ride_id: number }>("/rides/create", {
    env,
    method: "POST",
    body: {
      fare_id: params.fareId,
      stops: params.stops,
      user: { name: params.riderName, phone: params.riderPhone },
      note_to_driver: params.noteToDriver,
    },
  });
}

/** Current ride state, driver and ETA. Not intended for frequent polling. */
export async function getRideDetails(
  env: BoltEnvironment,
  rideId: number
): Promise<BoltRideDetails> {
  return boltFetch<BoltRideDetails>("/rides/details", { env, query: { ride_id: rideId } });
}

/** Live driver location. Active rides only. */
export async function getRideLocation(
  env: BoltEnvironment,
  rideId: number
): Promise<BoltLocation> {
  return boltFetch<BoltLocation>("/rides/location", { env, query: { ride_id: rideId } });
}

/**
 * Final price breakdown. Usually available within moments of COMPLETED, but
 * can take 24h+ when a ride is under review, so callers must tolerate a 404 /
 * error here and retry later rather than blocking the delivery.
 */
export async function getRideReceipt(
  env: BoltEnvironment,
  rideId: number
): Promise<BoltReceipt> {
  return boltFetch<BoltReceipt>("/rides/receipt", { env, query: { ride_id: rideId } });
}

/**
 * The address Bolt resolves for a coordinate — i.e. what a driver would be told
 * if we booked a pickup there.
 *
 * Bolt has no venue name for any of our stores: all 14 with coordinates
 * reverse-geocode to a street, none to a business. The label is simply the
 * nearest road to the point we send, which means it moves with the pin — often
 * within 30m. That makes this endpoint the feedback loop for choosing a pickup
 * point: probe a candidate, see what the rider would be told, before committing.
 *
 * `is_pickup` is not cosmetic — Bolt evaluates pickup and dropoff areas
 * differently, and `custom_area` comes back only when the point falls inside a
 * zone with defined stop points (none of our stores do, as of 2026-08-20).
 */
export async function getPlaceDetails(
  env: BoltEnvironment,
  lat: number,
  lng: number,
  isPickup = true
): Promise<BoltPlaceDetails> {
  return boltFetch<BoltPlaceDetails>("/rides/place/details", {
    env,
    method: "POST",
    body: { lat, lng, is_pickup: isPickup, language: "en" },
  });
}

/** Cancel a ride. Only possible before the passenger is picked up. */
export async function cancelRide(env: BoltEnvironment, rideId: number): Promise<void> {
  await boltFetch("/rides/cancel", { env, method: "POST", body: { ride_id: rideId } });
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Category selection                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The only category we will ever book. Food goes by bike, and silently
 * substituting a car would multiply the cost of a delivery whose fee was
 * quoted for a bike.
 *
 * Matches two shapes on purpose. The documented one — vehicle_category as a
 * literal "motorbike" — is kept in case some market/account genuinely returns
 * it. But this account's real production response never does: the bike
 * option ("Send Motorbike") comes back as vehicle_category: "other" with
 * vehicle_option.type: "delivery_motorbike", confirmed by calling
 * /rides/estimations directly on 2026-07-31. Matching only the documented
 * shape meant selectMotorbikeFare returned null on every single real booking
 * attempt — read as "no motorbike available" and silently fell back to
 * Telegram every time, when a bike was in fact on offer the whole night.
 */
export const MOTORBIKE_CATEGORY = "motorbike";
const MOTORBIKE_VEHICLE_OPTION_TYPE = "delivery_motorbike";

export function isMotorbikeCategory(c: BoltCategoryEstimate): boolean {
  return (
    c.vehicle_category === MOTORBIKE_CATEGORY ||
    c.vehicle_option?.type === MOTORBIKE_VEHICLE_OPTION_TYPE
  );
}

/**
 * Picks the motorbike estimate to book, or null when no motorbike is
 * available. Null is a legitimate outcome — the caller falls back to the
 * manual Telegram flow rather than booking a different vehicle.
 *
 * Estimates are a range; we record the upper bound so the recorded estimate is
 * never optimistic against the fare that eventually lands.
 */
export function selectMotorbikeFare(
  categories: BoltCategoryEstimate[]
): {
  fareId: string;
  estimateKobo: number | null;
  categoryName: string;
  etaSeconds: number | null;
} | null {
  for (const category of categories) {
    if (!isMotorbikeCategory(category)) continue;

    for (const est of category.estimations ?? []) {
      // A null ETA means the category has no availability right now.
      const eta = est.eta ?? null;
      if (!est.fare_id || eta === null) continue;

      const price = est.price?.maximum_amount ?? est.price?.minimum_amount ?? null;
      return {
        fareId: est.fare_id,
        estimateKobo: price !== null ? toKobo(price) : null,
        // Prefer the human name ("Send Motorbike") over vehicle_category,
        // which for this shape is just "other" — meaningless in logs and the
        // riders console.
        categoryName:
          category.vehicle_option?.name ?? category.vehicle_category ?? MOTORBIKE_CATEGORY,
        etaSeconds: eta,
      };
    }
  }
  return null;
}
