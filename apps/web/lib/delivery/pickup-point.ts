/**
 * Reading and writing a store's rider pickup point.
 *
 * Shared by the merchant route (own store) and the admin route (any store) so
 * the rules below hold no matter who is setting it — the two callers differ
 * only in how they establish who is allowed to act.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { readBoltSettings } from "@/lib/bolt/book-ride";
import { getPlaceDetails, type BoltEnvironment } from "@/lib/bolt";
import {
  findPickupCandidates,
  metresBetween,
  MAX_PICKUP_OFFSET_M,
  type PickupCandidate,
} from "@/lib/delivery/pickup-candidates";

interface RestaurantPickupRow {
  latitude: number | null;
  longitude: number | null;
  location_verified_at: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
}

export interface PickupOptions {
  /** Where riders are sent today — the pickup point if set, else the storefront. */
  current: { lat: number; lng: number; label: string | null; isStorefront: boolean };
  /**
   * The verified store address coordinate (restaurants.latitude/longitude) — the
   * centre the distance cap is measured from, and what riders get when no pickup
   * point is set. Returned even when a pickup point exists, so a map can draw
   * the allowed circle around the right spot.
   */
  storefront: { lat: number; lng: number; label: string | null };
  /** How far from `storefront` a pickup point may sit, so clients needn't hard-code it. */
  maxOffsetM: number;
  /** Empty when the caller asked to skip the probe (`candidates=0`). */
  candidates: PickupCandidate[];
}

export type PickupResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

type Point = { lat: number; lng: number };

async function loadRestaurant(restaurantId: string): Promise<RestaurantPickupRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("restaurants")
    .select("latitude, longitude, location_verified_at, pickup_lat, pickup_lng, pickup_label")
    .eq("id", restaurantId)
    .single();
  return (data as RestaurantPickupRow | null) ?? null;
}

/**
 * Every check a candidate pickup point must pass, in one place.
 *
 * Both previewing and saving go through this, so a pin the preview accepts is
 * exactly a pin the save accepts — if the two carried their own copies, the map
 * could tell a merchant "riders will be sent here" for a point the save then
 * refused.
 */
function validatePickupPoint(
  restaurant: RestaurantPickupRow,
  point: Point
): PickupResult<{ distanceM: number }> {
  if (
    typeof point.lat !== "number" ||
    typeof point.lng !== "number" ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    return { ok: false, status: 400, error: "Invalid pickup coordinates" };
  }

  if (!restaurant.location_verified_at || restaurant.latitude == null || restaurant.longitude == null) {
    return {
      ok: false,
      status: 400,
      error: "Confirm the store address first — the pickup point is measured from it.",
    };
  }

  const distanceM = metresBetween(
    { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude) },
    point
  );
  if (distanceM > MAX_PICKUP_OFFSET_M) {
    return {
      ok: false,
      status: 400,
      error: `A pickup point must be within ${MAX_PICKUP_OFFSET_M}m of the store address (that one is ${distanceM}m away).`,
    };
  }

  return { ok: true, data: { distanceM } };
}

/**
 * What Bolt will call this exact point — the street a rider is told.
 *
 * Null when Bolt can't be reached or has no address for it. Never fatal: the
 * rider is still sent to the coordinate; only the words they're given are
 * unknown to us.
 */
async function lookupBoltLabel(
  env: BoltEnvironment,
  restaurantId: string,
  point: Point
): Promise<string | null> {
  try {
    const detail = await getPlaceDetails(env, point.lat, point.lng);
    return detail?.place?.address ?? null;
  } catch (err) {
    console.error(`[pickup] label lookup failed restaurant=${restaurantId}:`, err);
    return null;
  }
}

/**
 * The store's pickup state, plus (optionally) the labels reachable around it.
 *
 * Gated on a verified address for the same reason booking is: probing around a
 * coordinate nobody confirmed would offer a merchant a tidy list of streets
 * near the wrong place, which is worse than offering nothing.
 *
 * `includeCandidates: false` skips the ring probe (two dozen Bolt lookups, a
 * few seconds) and makes one lookup for the storefront label instead. The map
 * picker uses it to draw immediately; the street list asks for the full probe.
 */
export async function getPickupOptions(
  restaurantId: string,
  { includeCandidates = true }: { includeCandidates?: boolean } = {}
): Promise<PickupResult<PickupOptions>> {
  const restaurant = await loadRestaurant(restaurantId);
  if (!restaurant) return { ok: false, status: 404, error: "Restaurant not found" };

  if (!restaurant.location_verified_at || restaurant.latitude == null || restaurant.longitude == null) {
    return {
      ok: false,
      status: 400,
      error: "Confirm the store address first — pickup options are measured from it.",
    };
  }

  const supabase = createServiceClient();
  const settings = await readBoltSettings(supabase);

  const centre = { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude) };

  let candidates: PickupCandidate[] = [];
  let centreLabel: string | null = null;
  if (includeCandidates) {
    try {
      ({ candidates, centreLabel } = await findPickupCandidates(settings.environment, centre));
    } catch (err) {
      console.error(`[pickup] candidate probe failed restaurant=${restaurantId}:`, err);
      return { ok: false, status: 502, error: "Could not reach Bolt to check pickup options" };
    }
  } else {
    centreLabel = await lookupBoltLabel(settings.environment, restaurantId, centre);
  }

  const hasPoint = restaurant.pickup_lat != null && restaurant.pickup_lng != null;

  return {
    ok: true,
    data: {
      current: hasPoint
        ? {
            lat: Number(restaurant.pickup_lat),
            lng: Number(restaurant.pickup_lng),
            label: restaurant.pickup_label,
            isStorefront: false,
          }
        : { ...centre, label: centreLabel, isStorefront: true },
      storefront: { ...centre, label: centreLabel },
      maxOffsetM: MAX_PICKUP_OFFSET_M,
      candidates,
    },
  };
}

/**
 * What a rider would be told if collected from `point` — without saving it.
 *
 * Exists because the label is the whole point of the feature and it can't be
 * predicted client-side: Bolt reverse-geocodes our coordinate to the nearest
 * road, and that flips between streets within ~30 m. A merchant dragging a pin
 * needs to see the name before committing, not discover it from the next
 * confused rider.
 *
 * Runs the same validation as setPickupPoint, so an accepted preview is a
 * promise the save will accept too.
 */
export async function previewPickupPoint(
  restaurantId: string,
  point: Point
): Promise<PickupResult<{ label: string | null; distanceM: number }>> {
  const restaurant = await loadRestaurant(restaurantId);
  if (!restaurant) return { ok: false, status: 404, error: "Restaurant not found" };

  const check = validatePickupPoint(restaurant, point);
  if (!check.ok) return check;

  const settings = await readBoltSettings(createServiceClient());
  const label = await lookupBoltLabel(settings.environment, restaurantId, point);

  return { ok: true, data: { label, distanceM: check.data.distanceM } };
}

/**
 * Sets — or with null coordinates, clears — the pickup point.
 *
 * Two things are deliberately not taken on trust from the caller:
 *
 *  - **The label.** It is re-resolved from Bolt for the exact point being saved,
 *    so what we store is what a rider will actually be told, not what a stale
 *    picker (or an earlier preview) happened to be showing.
 *  - **The distance.** A point far from the storefront would be dispatched to
 *    faithfully (Bolt honours our coordinate exactly) while delivery pricing
 *    carried on measuring from the storefront, so the two would silently drift
 *    apart. MAX_PICKUP_OFFSET_M keeps that gap immaterial.
 */
export async function setPickupPoint(
  restaurantId: string,
  point: Point | null
): Promise<PickupResult<{ label: string | null; distanceM: number }>> {
  const restaurant = await loadRestaurant(restaurantId);
  if (!restaurant) return { ok: false, status: 404, error: "Restaurant not found" };

  const supabase = createServiceClient();

  if (point === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("restaurants") as any)
      .update({
        pickup_lat: null,
        pickup_lng: null,
        pickup_label: null,
        pickup_point_set_at: null,
      })
      .eq("id", restaurantId);
    if (error) return { ok: false, status: 500, error: error.message };
    return { ok: true, data: { label: null, distanceM: 0 } };
  }

  const check = validatePickupPoint(restaurant, point);
  if (!check.ok) return check;
  const { distanceM } = check.data;

  // A failed lookup still saves: the point is valid and the rider still gets
  // sent there. Only the cached display label is missing, and the next probe
  // refreshes it.
  const settings = await readBoltSettings(supabase);
  const label = await lookupBoltLabel(settings.environment, restaurantId, point);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("restaurants") as any)
    .update({
      pickup_lat: point.lat,
      pickup_lng: point.lng,
      pickup_label: label,
      pickup_point_set_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  if (error) return { ok: false, status: 500, error: error.message };

  return { ok: true, data: { label, distanceM } };
}

/**
 * Reads `{ lat, lng }` out of an untrusted JSON body for the preview routes.
 *
 * Only checks shape; range and distance are validatePickupPoint's job, so the
 * error a caller sees for an out-of-range point is the same whichever route
 * they hit.
 */
export function parsePreviewPoint(body: unknown): Point | null {
  if (!body || typeof body !== "object") return null;
  const { lat, lng } = body as { lat?: unknown; lng?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}
