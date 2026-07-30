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
const TOKEN_REFRESH_MARGIN_MS = 60_000;
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

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = "BoltApiError";
    this.code = code;
    this.status = status;
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
    const errObj = parsed as { code?: string; error?: string; message?: string } | null;
    const code = errObj?.code ?? errObj?.error ?? null;
    throw new BoltApiError(
      `Bolt ${path} failed: ${res.status} ${code ?? text.slice(0, 200)}`,
      code,
      res.status
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
  /** A closed enum — "motorbike" is a literal value, not a display name. */
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

/** Cancel a ride. Only possible before the passenger is picked up. */
export async function cancelRide(env: BoltEnvironment, rideId: number): Promise<void> {
  await boltFetch("/rides/cancel", { env, method: "POST", body: { ride_id: rideId } });
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Category selection                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * `vehicle_category` is a closed enum in Bolt's schema and "motorbike" is one
 * of its literal values, so this is an exact match rather than a name search.
 *
 * The only category we will ever book. Food goes by bike, and silently
 * substituting a car would multiply the cost of a delivery whose fee was
 * quoted for a bike.
 */
export const MOTORBIKE_CATEGORY = "motorbike";

export function isMotorbikeCategory(c: BoltCategoryEstimate): boolean {
  return c.vehicle_category === MOTORBIKE_CATEGORY;
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
        categoryName: category.vehicle_category ?? MOTORBIKE_CATEGORY,
        etaSeconds: eta,
      };
    }
  }
  return null;
}
