import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getPickupOptions, setPickupPoint } from "@/lib/delivery/pickup-point";

/**
 * A merchant choosing where riders should collect from.
 *
 * GET  — the pickup labels reachable around their store, so they can pick the
 *        street their entrance is actually on.
 * PATCH— saves one (or clears it, reverting to the storefront coordinate).
 *
 * Kept separate from /api/merchant/location because the two answer different
 * questions: that route sets where the business *is* (and prices deliveries
 * from it), this one sets where a bike should *stop*. Changing the address
 * clears the pickup point automatically — a database trigger handles that, so
 * it holds regardless of which path performed the write.
 */
async function requireMerchant(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || profile.role !== "merchant_owner") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { restaurantId: profile.restaurant_id as string };
}

export async function GET(request: NextRequest) {
  const auth = await requireMerchant(request);
  if (auth.error) return auth.error;

  const result = await getPickupOptions(auth.restaurantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireMerchant(request);
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
