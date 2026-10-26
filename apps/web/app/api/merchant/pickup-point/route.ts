import { NextRequest, NextResponse } from "next/server";
import { requireMerchantOwner } from "@/lib/api/require-merchant-owner";
import { getPickupOptions, setPickupPoint } from "@/lib/delivery/pickup-point";

/**
 * A merchant choosing where riders should collect from.
 *
 * GET  — where riders go today, the store address it's measured from, the
 *        allowed offset, and the pickup labels reachable around the store.
 *        `?candidates=0` skips that probe (a few seconds of Bolt lookups) for
 *        callers that only need the map.
 * PATCH— saves one (or clears it, reverting to the storefront coordinate).
 *
 * See ./preview for asking what a pin would be called before saving it.
 *
 * Kept separate from /api/merchant/location because the two answer different
 * questions: that route sets where the business *is* (and prices deliveries
 * from it), this one sets where a bike should *stop*. Changing the address
 * clears the pickup point automatically — a database trigger handles that, so
 * it holds regardless of which path performed the write.
 */
export async function GET(request: NextRequest) {
  const auth = await requireMerchantOwner(request);
  if (auth.error) return auth.error;

  const result = await getPickupOptions(auth.restaurantId, {
    includeCandidates: request.nextUrl.searchParams.get("candidates") !== "0",
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMerchantOwner(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { latitude, longitude } = body as { latitude?: number | null; longitude?: number | null };

  // Both null is the documented way to revert to the storefront coordinate.
  const point =
    latitude == null && longitude == null
      ? null
      : { lat: latitude as number, lng: longitude as number };

  const result = await setPickupPoint(auth.restaurantId, point);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ success: true, ...result.data });
}
