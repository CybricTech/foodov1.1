import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPickupOptions, setPickupPoint } from "@/lib/delivery/pickup-point";

/**
 * Admin override for a store's rider pickup point.
 *
 * Same rules as /api/merchant/pickup-point — the shared service enforces the
 * distance cap and re-resolves the label from Bolt — but for any store. Exists
 * because the merchants most likely to need a pickup point are the least likely
 * to go looking for the setting: support sees the rider complaints first.
 */
async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { userId: user.id };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const result = await getPickupOptions(restaurantId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, latitude, longitude } = body as {
    restaurantId?: string;
    latitude?: number | null;
    longitude?: number | null;
  };

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: before } = await serviceClient
    .from("restaurants")
    .select("pickup_lat, pickup_lng, pickup_label")
    .eq("id", restaurantId)
    .single();

  const point =
    latitude == null && longitude == null
      ? null
      : { lat: latitude as number, lng: longitude as number };

  const result = await setPickupPoint(restaurantId, point);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await serviceClient.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "merchant_pickup_point_updated",
    target_type: "restaurant",
    target_id: restaurantId,
    metadata: {
      before: before ?? null,
      after: point
        ? { pickup_lat: point.lat, pickup_lng: point.lng, pickup_label: result.data.label }
        : null,
    },
  });

  return NextResponse.json({ success: true, ...result.data });
}
