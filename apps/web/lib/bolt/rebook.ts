/**
 * Auto re-book after a failed ride.
 *
 * Re-booking continues until a ride completes — the deliberate choice, since a
 * customer with a paid order still needs their food. It is not, however,
 * unbounded in practice:
 *
 *   - an admin can stop it per-order from the Riders page
 *     (orders.bolt_autobook_stopped_at)
 *   - it stops once the order is delivered or cancelled
 *   - it stops after MAX_AUTOBOOK_AGE_MS, so an order nobody is watching can't
 *     keep buying rides overnight
 *
 * Every attempt alerts the Telegram group, so a store burning through rides is
 * visible immediately rather than at month-end reconciliation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRideAttempt, readBoltSettings } from "@/lib/bolt/book-ride";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram";

/**
 * A delivery still unfulfilled two hours after dispatch is an operational
 * problem, not a dispatch problem. Past this point the order is surfaced on the
 * Riders page for a human instead of quietly booking more rides.
 */
const MAX_AUTOBOOK_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Statuses from which an order still wants a rider.
 *
 * Before migration 101 this was the single status 'assigned_to_rider'. Now the
 * rider is tracked on orders.dispatch_state and orders.status keeps following
 * the food, so a failed ride can need re-booking while the order reads
 * 'preparing'. 'assigned_to_rider' is kept for orders dispatched before 101.
 */
const REBOOKABLE_STATUSES = new Set([
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
]);

export type RebookDecision =
  | { rebooked: true; state: "booked" | "shadow" }
  | { rebooked: false; reason: string };

export async function handleFailedRide(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    attempt: number;
    failedState: string;
    reason?: string | null;
  }
): Promise<RebookDecision> {
  const { data: orderData } = await supabase
    .from("orders")
    .select("order_number, status, bolt_autobook_stopped_at, bolt_booking_claimed_at, restaurant_id")
    .eq("id", params.orderId)
    .single();

  const order = orderData as {
    order_number: string | number;
    status: string;
    bolt_autobook_stopped_at: string | null;
    bolt_booking_claimed_at: string | null;
    restaurant_id: string;
  } | null;

  if (!order) return { rebooked: false, reason: "order not found" };

  const orderLabel = escapeTelegramHtml(order.order_number);
  const stateLabel = escapeTelegramHtml(params.failedState);

  const halt = async (reason: string): Promise<RebookDecision> => {
    await sendTelegramMessage(
      `⚠️ <b>Ride failed — needs attention</b>\n` +
        `Order #${orderLabel} · attempt ${params.attempt} · ${stateLabel}\n` +
        `Not re-booking: ${escapeTelegramHtml(reason)}\n` +
        `Handle it on the Riders page.`
    );
    return { rebooked: false, reason };
  };

  // Since migration 101 a rider can be sought while the food is still cooking,
  // so "still wants a rider" is no longer a single status — it's any status
  // short of the order being over. 'assigned_to_rider' remains for pre-101 rows.
  if (!REBOOKABLE_STATUSES.has(order.status)) {
    // Delivered or cancelled while the ride was failing. Nothing to re-book,
    // and no need to page anyone.
    return { rebooked: false, reason: `order is ${order.status}` };
  }

  if (order.bolt_autobook_stopped_at) {
    return halt("auto re-book was stopped by an admin");
  }

  const startedAt = order.bolt_booking_claimed_at
    ? new Date(order.bolt_booking_claimed_at).getTime()
    : null;
  if (startedAt && Date.now() - startedAt > MAX_AUTOBOOK_AGE_MS) {
    return halt("order has been awaiting a rider for over 2 hours");
  }

  const settings = await readBoltSettings(supabase);
  if (!settings.enabled) {
    return halt("Bolt booking is disabled");
  }

  const result = await createRideAttempt(
    supabase,
    params.orderId,
    settings,
    `rebook:${params.failedState}`
  );

  if (result.outcome === "booked") {
    await sendTelegramMessage(
      `🔁 <b>Ride re-booked</b>\n` +
        `Order #${orderLabel} · attempt ${params.attempt} failed (${stateLabel})\n` +
        `A replacement ride has been booked automatically.`
    );
    return { rebooked: true, state: "booked" };
  }

  if (result.outcome === "shadow") {
    // Unreachable in practice — shadow mode books nothing, so there is no ride
    // to fail. Handled anyway so a mid-flight switch into shadow pages a human
    // rather than claiming a ride was booked when none was.
    return halt("shadow mode is on — book the replacement ride manually");
  }

  if (result.outcome === "skipped") {
    return { rebooked: false, reason: "another re-book is already in flight" };
  }

  return halt(result.reason);
}
