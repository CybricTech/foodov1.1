/**
 * Distance maths for pickup points, with no server imports.
 *
 * Lives apart from pickup-candidates.ts (which pulls in the Bolt client and its
 * credentials) so the map picker in the browser can measure a dragged pin with
 * exactly the same formula the server uses to accept or reject it. If the two
 * measured differently, a pin the map showed as inside the circle could be
 * refused on save.
 */

const M_PER_DEG_LAT = 111_320;

/** Great-circle distance in whole metres — the figure the 150 m cap is checked against. */
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

/** A point `north` and `east` metres from (lat, lng). Flat-earth, fine at pickup scale. */
export function offsetMetres(lat: number, lng: number, north: number, east: number) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return { lat: lat + north / M_PER_DEG_LAT, lng: lng + east / mPerDegLng };
}

/**
 * Pulls `point` back along the line from `centre` until it sits `maxM` out.
 *
 * Used when a pin is dragged past the limit: keeping the direction the merchant
 * dragged in is a better guess at what they meant than jumping back to where
 * the pin started.
 */
export function clampWithin(
  centre: { lat: number; lng: number },
  point: { lat: number; lng: number },
  maxM: number
): { lat: number; lng: number } {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((centre.lat * Math.PI) / 180);
  const north = (point.lat - centre.lat) * M_PER_DEG_LAT;
  const east = (point.lng - centre.lng) * mPerDegLng;
  const d = Math.hypot(north, east);
  if (d <= maxM || d === 0) return point;
  const scale = maxM / d;
  return offsetMetres(centre.lat, centre.lng, north * scale, east * scale);
}
