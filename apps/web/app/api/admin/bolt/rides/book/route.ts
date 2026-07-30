import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/api/require-admin";
import { createRideAttempt, readBoltSettings } from "@/lib/bolt/book-ride";

/**
 * Manually book (or re-book) a Bolt ride for an order, from the Riders console.
 *
 * The escape hatch for everything the automatic path bails out of: a store
 * whose address wasn't confirmed at dispatch time, a moment when no motorbike
 * was available, or a run of failures that hit the auto-rebook cutoff.
 *
 * Booking by hand also clears any admin stop, since asking for a ride is an
 * explicit statement that this order should be served.
 */

/** Statuses from which an order can still legitimately be given a rider. */
const BOOKABLE_STATUSES = new Set([
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
]);
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { order_id } = body as { order_id?: string };
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: order } = await serviceClient
    .from("orders")
    .select("id, status, order_number, restaurant_id")
    .eq("id", order_id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  // Since migration 101 a rider can be booked while the food is still cooking,
  // so "awaiting a rider" spans several statuses rather than the single
  // 'assigned_to_rider' (which is kept for orders dispatched before 101).
  if (!BOOKABLE_STATUSES.has(order.status)) {
    return NextResponse.json(
      { error: `Order is ${order.status} — only orders awaiting a rider can be booked` },
      { status: 409 }
    );
  }

  const settings = await readBoltSettings(serviceClient);
  if (!settings.enabled) {
    return NextResponse.json(
      { error: "Bolt booking is disabled in platform settings" },
      { status: 409 }
    );
  }

  // Ensure the latch is held, so the reconciliation cron doesn't read this
  // order as an un-booked one while the ride is being created.
  await serviceClient
    .from("orders")
    .update({
      bolt_booking_claimed_at: new Date().toISOString(),
      bolt_autobook_stopped_at: null,
      bolt_autobook_stopped_by: null,
    })
    .eq("id", order_id);

  const result = await createRideAttempt(serviceClient, order_id, settings, "admin:manual");

  await serviceClient.from("audit_logs").insert({
    actor_id: auth.userId,
    action: "bolt_ride_booked",
    target_type: "order",
    target_id: order_id,
    metadata: { order_number: order.order_number, outcome: result.outcome },
  });

  if (result.outcome === "fallback") {
    return NextResponse.json({ error: result.reason }, { status: 422 });
  }
  if (result.outcome === "skipped") {
    return NextResponse.json({ error: "A booking is already in flight" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, ...result });
}
