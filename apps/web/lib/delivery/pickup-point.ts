/**
 * Reading and writing a store's rider pickup point.
 *
 * Shared by the merchant route (own store) and the admin route (any store) so
 * the rules below hold no matter who is setting it — the two callers differ
 * only in how they establish who is allowed to act.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { readBoltSettings } from "@/lib/bolt/book-ride";
import { getPlaceDetails } from "@/lib/bolt";
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
  candidates: PickupCandidate[];
}

export type PickupResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

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
 * The pickup labels reachable around a store, for the picker to offer.
 *
 * Gated on a verified address for the same reason booking is: probing around a
 * coordinate nobody confirmed would offer a merchant a tidy list of streets
 * near the wrong place, which is worse than offering nothing.
 */
export async function getPickupOptions(restaurantId: string): Promise<PickupResult<PickupOptions>> {
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
  try {
    ({ candidates, centreLabel } = await findPickupCandidates(settings.environment, centre));
  } catch (err) {
    console.error(`[pickup] candidate probe failed restaurant=${restaurantId}:`, err);
    return { ok: false, status: 502, error: "Could not reach Bolt to check pickup options" };
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
      candidates,
    },
  };
}

/**
 * Sets — or with null coordinates, clears — the pickup point.
 *
 * Two things are deliberately not taken on trust from the caller:
 *
 *  - **The label.** It is re-resolved from Bolt for the exact point being saved,
 *    so what we store is what a rider will actually be told, not what a stale
 *    picker happened to be showing.
 *  - **The distance.** A point far from the storefront would be dispatched to
 *    faithfully (Bolt honours our coordinate exactly) while delivery pricing
 *    carried on measuring from the storefront, so the two would silently drift
 *    apart. MAX_PICKUP_OFFSET_M keeps that gap immaterial.
 */
export async function setPickupPoint(
  restaurantId: string,
  point: { lat: number; lng: number } | null
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

  const settings = await readBoltSettings(supabase);
  let label: string | null = null;
  try {
    const detail = await getPlaceDetails(settings.environment, point.lat, point.lng);
    label = detail?.place?.address ?? null;
  } catch (err) {
    // Not fatal: the point is still valid and the rider still gets sent there.
    // Only the cached display label is missing, and the next probe refreshes it.
    console.error(`[pickup] label lookup failed restaurant=${restaurantId}:`, err);
  }

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
