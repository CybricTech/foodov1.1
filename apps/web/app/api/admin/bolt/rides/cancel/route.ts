import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { BoltApiError, cancelRide, type BoltEnvironment } from "@/lib/bolt";

/**
 * Cancel an in-flight Bolt ride from the Riders console.
 *
 * Bolt only permits cancellation before the passenger is picked up; past
 * DRIVING_WITH_CLIENT it returns INVALID_STATE_FOR_CANCELLATION, which is
 * surfaced to the admin rather than swallowed.
 *
 * Cancelling by hand also sets the admin stop on the order — an admin killing
 * a ride does not want the auto-rebook loop to immediately book another one.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ride_id } = body as { ride_id?: string };
  if (!ride_id) {
    return NextResponse.json({ error: "ride_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: ride } = await serviceClient
    .from("bolt_rides")
    .select("id, order_id, bolt_ride_id, state, environment")
    .eq("id", ride_id)
    .single();

  if (!ride) return NextResponse.json({ error: "Ride not found" }, { status: 404 });
  if (!ride.bolt_ride_id) {
    return NextResponse.json({ error: "This ride was never booked with Bolt" }, { status: 409 });
  }

  const env: BoltEnvironment = ride.environment === "production" ? "production" : "sandbox";

  try {
    await cancelRide(env, ride.bolt_ride_id);
  } catch (err) {
    const e = err as BoltApiError;
    return NextResponse.json(
      { error: e.message, code: e.code ?? null },
      { status: e.status === 400 || e.status === 409 ? 409 : 502 }
    );
  }

  const now = new Date().toISOString();

  await serviceClient
    .from("bolt_rides")
    .update({ state: "CANCELLED", cancelled_at: now, updated_at: now })
    .eq("id", ride_id);

  // Stop the loop: an admin who cancels wants the order held, not re-booked.
  await serviceClient
    .from("orders")
    .update({ bolt_autobook_stopped_at: now, bolt_autobook_stopped_by: auth.userId })
    .eq("id", ride.order_id);

  await serviceClient.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "bolt_ride_cancelled",
    target_type: "order",
    target_id: ride.order_id,
    metadata: { bolt_ride_id: ride.bolt_ride_id, previous_state: ride.state },
  });

  return NextResponse.json({ ok: true });
}
