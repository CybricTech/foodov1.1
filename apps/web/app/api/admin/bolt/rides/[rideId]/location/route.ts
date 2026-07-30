import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { BoltApiError, getRideLocation, type BoltEnvironment } from "@/lib/bolt";

export const dynamic = "force-dynamic";

/**
 * Where is the driver right now?
 *
 * Deliberately on demand rather than polled: Bolt's docs warn against frequent
 * polling, and a live position only matters during an escalation — "the food
 * is late, where is the rider" — not on every render of the Riders page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rideId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { rideId } = await params;
  const serviceClient = createServiceClient();

  const { data: ride } = await serviceClient
    .from("bolt_rides")
    .select("id, bolt_ride_id, state, environment")
    .eq("id", rideId)
    .single();

  if (!ride) return NextResponse.json({ error: "Ride not found" }, { status: 404 });
  if (!ride.bolt_ride_id) {
    return NextResponse.json({ error: "This ride was never booked with Bolt" }, { status: 409 });
  }

  const env: BoltEnvironment = ride.environment === "production" ? "production" : "sandbox";

  try {
    const loc = await getRideLocation(env, ride.bolt_ride_id);
    const lat = loc?.location?.lat ?? null;
    const lng = loc?.location?.lng ?? null;

    if (lat !== null && lng !== null) {
      await serviceClient
        .from("bolt_rides")
        .update({
          driver_lat: lat,
          driver_lng: lng,
          location_updated_at: new Date().toISOString(),
        })
        .eq("id", rideId);
    }

    return NextResponse.json({ lat, lng });
  } catch (err) {
    const e = err as BoltApiError;
    // Location is only available for active rides — a finished ride 4xx'ing
    // here is expected, not an outage.
    return NextResponse.json({ error: e.message, code: e.code ?? null }, { status: 502 });
  }
}
