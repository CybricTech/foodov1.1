import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

/**
 * Update a store's location.
 *
 * Address, coordinates and place_id are written as one unit and only ever
 * originate from a picked Google place (see components/shared/address-picker).
 * Coordinates can no longer be typed, because a coordinate that disagrees with
 * its address silently misprices every delivery — api/delivery/fee measures
 * distance from restaurants.latitude/longitude — and would send a rider to the
 * wrong pickup once Bolt booking is live.
 *
 * Sending only max_delivery_radius_km leaves an existing confirmed address
 * untouched.
 */
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || profile.role !== "merchant_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { address, latitude, longitude, place_id, max_delivery_radius_km } = body as {
    address?: string;
    latitude?: number;
    longitude?: number;
    place_id?: string;
    max_delivery_radius_km?: number | null;
  };

  const update: Record<string, unknown> = {
    max_delivery_radius_km: max_delivery_radius_km ?? null,
  };

  const hasAddressUpdate =
    latitude !== undefined ||
    longitude !== undefined ||
    place_id !== undefined ||
    address !== undefined;

  if (hasAddressUpdate) {
    // All four travel together — a partial address update is exactly the drift
    // this route exists to prevent.
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
        { error: "Pick an address from the suggestions to set your location" },
        { status: 400 }
      );
    }

    update.address = address.trim();
    update.latitude = latitude;
    update.longitude = longitude;
    update.place_id = place_id;
    update.location_verified_at = new Date().toISOString();
  }

  const { error } = await serviceClient
    .from("restaurants")
    .update(update)
    .eq("id", profile.restaurant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
