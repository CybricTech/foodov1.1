/**
 * Where could a rider be told to go, near this store?
 *
 * Bolt names a pickup by reverse-geocoding the coordinate we send — it has no
 * venue name for any of our stores. The label is therefore the nearest road to
 * the pin, and it changes at small distances: By Sophie's Confectionary reads
 * "Bala Sokoto Way" at its storefront centroid and "260 Adamu Ciroma Crescent"
 * 30 metres east, which is its own stored address.
 *
 * So rather than asking a merchant to reason about coordinates, we probe the
 * ground around their store and offer them the labels that are actually
 * reachable. They pick the street their entrance is on; we store the point that
 * produces it.
 *
 * Every probe is a reverse geocode, not a booking — nothing here costs money or
 * dispatches anyone.
 */
import { getPlaceDetails, type BoltEnvironment } from "@/lib/bolt";

/**
 * How far from the storefront a pickup point may sit.
 *
 * Wide enough for the far kerb, a gate, or the other side of a divided road;
 * narrow enough that the fare Bolt quotes from the pickup point still matches
 * the fee we quoted the customer from restaurants.latitude/longitude.
 */
export const MAX_PICKUP_OFFSET_M = 150;

/** Rings probed around the storefront, in metres. */
const RINGS = [30, 60, 100];

const DIRECTIONS: [string, number, number][] = [
  ["north", 0, 1],
  ["north-east", 1, 1],
  ["east", 1, 0],
  ["south-east", 1, -1],
  ["south", 0, -1],
  ["south-west", -1, -1],
  ["west", -1, 0],
  ["north-west", -1, 1],
];

const M_PER_DEG_LAT = 111_320;

/** How many probes run at once. Enough to stay well inside a request timeout. */
const CONCURRENCY = 6;

export interface PickupCandidate {
  /** What a rider would be told if collected from this point. */
  label: string;
  lat: number;
  lng: number;
  /** Metres from the storefront centroid. 0 for the storefront itself. */
  distanceM: number;
  /** "east", "north-west", … Empty for the storefront itself. */
  direction: string;
}

export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

function offset(lat: number, lng: number, north: number, east: number) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return { lat: lat + north / M_PER_DEG_LAT, lng: lng + east / mPerDegLng };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    })
  );
  return results;
}

/**
 * Probes the storefront and a ring grid around it, returning one entry per
 * distinct label — represented by the closest point that produces it.
 *
 * The storefront's own label always comes first, even when a nearer ring point
 * shares it, because that is the "change nothing" option. Everything else is
 * ordered by distance, so the smallest useful move is the most prominent.
 *
 * Probes that error are dropped rather than failing the whole call: a partial
 * list of real options is more useful than none, and the storefront label is
 * fetched separately so the list is never empty on a single transient failure.
 */
export async function findPickupCandidates(
  env: BoltEnvironment,
  centre: { lat: number; lng: number }
): Promise<{ candidates: PickupCandidate[]; centreLabel: string | null }> {
  const points: { lat: number; lng: number; distanceM: number; direction: string }[] = [];

  for (const ring of RINGS) {
    for (const [direction, east, north] of DIRECTIONS) {
      // Normalise diagonals so every point on a ring sits the same distance out.
      const scale = east && north ? Math.SQRT1_2 : 1;
      const p = offset(centre.lat, centre.lng, north * ring * scale, east * ring * scale);
      points.push({ ...p, distanceM: ring, direction });
    }
  }

  const [centreResult, ringResults] = await Promise.all([
    getPlaceDetails(env, centre.lat, centre.lng).catch(() => null),
    mapWithConcurrency(points, CONCURRENCY, async (p) => {
      const detail = await getPlaceDetails(env, p.lat, p.lng).catch(() => null);
      return detail?.place?.address ? { ...p, label: detail.place.address } : null;
    }),
  ]);

  const centreLabel = centreResult?.place?.address ?? null;

  const byLabel = new Map<string, PickupCandidate>();
  if (centreLabel) {
    byLabel.set(centreLabel, {
      label: centreLabel,
      lat: centre.lat,
      lng: centre.lng,
      distanceM: 0,
      direction: "",
    });
  }

  for (const r of ringResults) {
    if (!r) continue;
    const existing = byLabel.get(r.label);
    if (existing && existing.distanceM <= r.distanceM) continue;
    byLabel.set(r.label, {
      label: r.label,
      lat: r.lat,
      lng: r.lng,
      distanceM: r.distanceM,
      direction: r.direction,
    });
  }

  const candidates = [...byLabel.values()].sort((a, b) => a.distanceM - b.distanceM);
  return { candidates, centreLabel };
}
