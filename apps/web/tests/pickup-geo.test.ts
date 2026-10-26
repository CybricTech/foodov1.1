import { describe, expect, it } from "vitest";
import { clampWithin, metresBetween, offsetMetres } from "@/lib/delivery/pickup-geo";

// Abuja-ish — the latitude matters because a degree of longitude shrinks with it.
const STORE = { lat: 9.0765, lng: 7.3986 };

describe("clampWithin", () => {
  it("leaves a point inside the limit untouched", () => {
    const p = offsetMetres(STORE.lat, STORE.lng, 40, -30);
    expect(clampWithin(STORE, p, 148)).toEqual(p);
  });

  it("pulls a far point back onto the limit, in the direction it was dragged", () => {
    const far = offsetMetres(STORE.lat, STORE.lng, 300, 400); // 500 m north-east
    const snapped = clampWithin(STORE, far, 148);

    // The server measures with metresBetween; a snapped pin must pass its 150 m check.
    expect(metresBetween(STORE, snapped)).toBeLessThanOrEqual(150);
    expect(metresBetween(STORE, snapped)).toBeGreaterThanOrEqual(147);

    // Same bearing: still 3:4 north:east.
    const north = (snapped.lat - STORE.lat) * 111_320;
    const east = (snapped.lng - STORE.lng) * 111_320 * Math.cos((STORE.lat * Math.PI) / 180);
    expect(north / east).toBeCloseTo(0.75, 3);
  });
});
