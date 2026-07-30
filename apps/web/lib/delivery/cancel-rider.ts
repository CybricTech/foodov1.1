/**
 * Stand down a rider that was requested for an order that is no longer happening.
 *
 * Booking at T−10 instead of at Mark Ready widens the cancel-after-request
 * window from "almost never" to a full lead time on every platform order. So
 * cancelling an order now has to reach out and stop the ride, on whichever lane
 * it went down:
 *
 *   Bolt lane    cancel the ride through the API. Bolt refuses once the food is
 *                aboard (DRIVING_WITH_CLIENT → INVALID_STATE_FOR_CANCELLATION);
 *                that is surfaced, not swallowed — someone has to go and tell a
 *                driver who is already moving.
 *   Manual lane  no API to call. Post a stand-down note to the same Telegram
 *                group that was asked to book it, because a human is holding
 *                that request.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BoltApiError, cancelRide, type BoltEnvironment } from "@/lib/bolt";
import { escapeTelegramHtml, sendTelegramMessage } from "@/lib/telegram";
import { isDispatchStateLive } from "@foodo/utils";
import { setDispatchState } from "@/lib/delivery/request-rider";
import { voidDeliverySplit } from "@/lib/delivery/commit-delivery-split";

export interface StandDownResult {
  outcome: "stood_down" | "nothing_to_do" | "needs_human";
  lane?: "bolt" | "manual";
  reason?: string;
}

interface RideRow {
  id: string;
  bolt_ride_id: number | null;
  state: string;
  environment: string;
}

/** Bolt states where the ride is over already — nothing to cancel. */
const FINISHED_RIDE_STATES = new Set([
  "COMPLETED",
  "CANCELLED",
  "CLIENT_CANCELLED",
  "CLIENT_DID_NOT_SHOW",
  "NO_DRIVER_FOUND",
  "PAYMENT_BOOKING_FAILED",
  "CREATE_FAILED",
  "SHADOW",
]);

/**
 * Called when an order is cancelled. Safe to call for any order — it works out
 * whether a rider was ever asked for and does nothing if not.
 *
 * @param actorId  admin/user who cancelled, for the audit trail. NULL for
 *                 system-initiated cancellations.
 */
export async function standDownRiderForOrder(
  supabase: SupabaseClient,
  orderId: string,
  actorId: string | null = null
): Promise<StandDownResult> {
  const { data: orderData } = await supabase
    .from("orders")
    .select("id, order_number, restaurant_id, dispatch_state, rider_requested_at, dispatch_type")
    .eq("id", orderId)
    .single();

  const order = orderData as {
    id: string;
    order_number: string | number;
    restaurant_id: string;
    dispatch_state: string | null;
    rider_requested_at: string | null;
    dispatch_type: string | null;
  } | null;

  if (!order) return { outcome: "nothing_to_do", reason: "order not found" };

  // Stop the timer regardless — a cancelled order must never be picked up by a
  // later cron tick.
  await supabase
    .from("orders")
    .update({ rider_request_due_at: null })
    .eq("id", orderId);

  // The split's ledger rows describe a delivery that is not going to happen.
  // Balance-neutral (recompute already excludes cancelled orders); this is the
  // audit trail catching up.
  if (order.rider_requested_at) {
    await voidDeliverySplit(supabase, orderId, order.restaurant_id).catch((err) =>
      console.error(`[stand-down] void split failed order=${order.order_number}:`, err)
    );
  }

  if (!order.rider_requested_at || !isDispatchStateLive(order.dispatch_state)) {
    await setDispatchState(supabase, orderId, "cancelled");
    return { outcome: "nothing_to_do", reason: "no live rider request" };
  }

  /* ── Bolt lane ──────────────────────────────────────────────────────────── */
  const { data: rideData } = await supabase
    .from("bolt_rides")
    .select("id, bolt_ride_id, state, environment")
    .eq("order_id", orderId)
    .order("attempt", { ascending: false })
    .limit(1);

  const ride = (rideData as RideRow[] | null)?.[0] ?? null;

  if (ride?.bolt_ride_id && !FINISHED_RIDE_STATES.has(ride.state)) {
    const env: BoltEnvironment =
      ride.environment === "production" ? "production" : "sandbox";
    const now = new Date().toISOString();

    try {
      await cancelRide(env, ride.bolt_ride_id);
    } catch (err) {
      const e = err as BoltApiError;
      // Past pickup Bolt will not cancel. Page the group: there is a driver
      // holding food for an order that no longer exists.
      await sendTelegramMessage(
        `⚠️ <b>Could not cancel ride</b> — order #${escapeTelegramHtml(order.order_number)}\n` +
          `Bolt ride ${ride.bolt_ride_id}: ${escapeTelegramHtml(e.message)}\n` +
          `The driver may already have the food. Call them.`
      );
      await setDispatchState(supabase, orderId, "cancelled");
      return { outcome: "needs_human", lane: "bolt", reason: e.message };
    }

    await supabase
      .from("bolt_rides")
      .update({ state: "CANCELLED", cancelled_at: now, updated_at: now })
      .eq("id", ride.id);

    // An order that was cancelled must not be auto-re-booked.
    await supabase
      .from("orders")
      .update({ bolt_autobook_stopped_at: now, bolt_autobook_stopped_by: actorId })
      .eq("id", orderId);

    await setDispatchState(supabase, orderId, "cancelled");

    await supabase.from("audit_logs").insert({
      actor_id: actorId,
      action: "bolt_ride_cancelled",
      target_type: "order",
      target_id: orderId,
      metadata: {
        bolt_ride_id: ride.bolt_ride_id,
        previous_state: ride.state,
        trigger: "order_cancelled",
      },
    });

    return { outcome: "stood_down", lane: "bolt" };
  }

  /* ── Manual lane ────────────────────────────────────────────────────────── */
  // A human in the group is holding a request to book this. Tell them not to.
  await sendTelegramMessage(
    `❌ <b>CANCEL rider request</b> — order #${escapeTelegramHtml(order.order_number)}\n` +
      `This order has been cancelled. Do not book it; cancel it in Bolt if you already did.`
  );

  await setDispatchState(supabase, orderId, "cancelled");
  return { outcome: "stood_down", lane: "manual" };
}
