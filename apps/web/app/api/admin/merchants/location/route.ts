import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Admin override for a store's address.
 *
 * Same contract as /api/merchant/location: address, coordinates and place_id
 * are written as one unit and only ever come from a picked Google place. Exists
 * so support can correct a merchant who mis-set their own location — e.g. a
 * store whose stored pin sat ~20km from its address, quietly mispricing every
 * delivery quote it issued.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, address, latitude, longitude, place_id } = body as {
    restaurantId?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    place_id?: string;
  };

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    typeof place_id !== "string" ||
    !place_id ||
    typeof address !== "string" ||
    !address.trim()
  ) {
    return NextResponse.json(
      { error: "Pick an address from the suggestions to set the location" },
      { status: 400 }
    );
  }

  const { data: before } = await serviceClient
    .from("restaurants")
    .select("address, latitude, longitude")
    .eq("id", restaurantId)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient.from("restaurants") as any)
    .update({
      address: address.trim(),
      latitude,
      longitude,
      place_id,
      location_verified_at: new Date().toISOString(),
    })
    .eq("id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "merchant_location_updated",
    target_type: "restaurant",
    target_id: restaurantId,
    metadata: {
      before: before ?? null,
      after: { address: address.trim(), latitude, longitude, place_id },
    },
  });

  return NextResponse.json({ success: true });
}
