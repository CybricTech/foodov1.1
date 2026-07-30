/**
 * Applies a Bolt ride state to our database.
 *
 * Shared by the webhook and the reconciliation cron so there is one state
 * machine, not two that drift.
 *
 * Bolt's webhooks are explicitly documented as neither ordered nor
 * deduplicated — a COMPLETED can arrive before DRIVING_WITH_CLIENT, and any
 * event can arrive twice. Rather than tracking sequence numbers, this refuses
 * to move a ride that has already reached a terminal state. That single guard
 * makes duplicates idempotent and out-of-order events harmless.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRideReceipt,
  isFailedState,
  isTerminalState,
  toKobo,
  type BoltEnvironment,
  type BoltRideDetails,
} from "@/lib/bolt";
import {
  markOrderDelivered,
  recomputeDeliveryCost,
} from "@/lib/delivery/mark-order-delivered";
import { setDispatchState } from "@/lib/delivery/request-rider";
import { dispatchStateForBoltState } from "@foodo/utils";

export interface BoltRideRow {
  id: string;
  order_id: string;
  restaurant_id: string;
  attempt: number;
  bolt_ride_id: number | null;
  state: string;
  fare_kobo: number | null;
  environment: string;
}

export type ApplyResult =
  | { action: "ignored"; reason: string }
  | { action: "updated"; state: string }
  | { action: "delivered"; state: string; fareKobo: number | null }
  | { action: "failed"; state: string };

/**
 * @param details fresh from GET /rides/details — never the webhook payload's
 *   own `state`, which Bolt's docs say to treat only as "something changed".
 */
export async function applyRideState(
  supabase: SupabaseClient,
  ride: BoltRideRow,
  details: BoltRideDetails,
  env: BoltEnvironment
): Promise<ApplyResult> {
  const nextState = details.state;

  if (isTerminalState(ride.state)) {
    // Already settled. A late or duplicate event must not resurrect it.
    return { action: "ignored", reason: `ride already terminal (${ride.state})` };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    state: nextState,
    updated_at: now,
  };

  // Driver details live under `vehicle`, not a separate `driver` object.
  if (details.vehicle?.driver_name) patch.driver_name = details.vehicle.driver_name;
  if (details.vehicle?.driver_phone) patch.driver_phone = details.vehicle.driver_phone;

  // Before pickup the useful ETA is to the restaurant; after it, to the
  // customer. Showing "arriving in 3 min" while the rider is still collecting
  // the food is worse than showing nothing.
  const eta =
    nextState === "DRIVING_WITH_CLIENT"
      ? details.eta_to_destination
      : details.eta_to_client;
  if (eta !== undefined && eta !== null) patch.eta_seconds = eta;

  // Bolt's own live-tracking page. Kept the first time it appears so the
  // customer's "on its way" SMS can carry it and the riders console can open
  // the same page the customer is looking at.
  if (details.tracking_url) patch.tracking_url = details.tracking_url;

  // Timeline stamps. Bolt reports real times for the ride itself; fall back to
  // now() only when it doesn't, so durations aren't distorted by a late webhook.
  if (nextState === "DRIVER_ON_ROUTE_TO_CLIENT") patch.driver_assigned_at = now;
  if (nextState === "DRIVING_WITH_CLIENT") patch.picked_up_at = details.start_time ?? now;
  if (nextState === "COMPLETED") patch.completed_at = details.finish_time ?? now;
  if (isFailedState(nextState)) patch.cancelled_at = now;

  // ── Completed: pull the fare and close the order ──────────────────────────
  if (nextState === "COMPLETED" && ride.bolt_ride_id) {
    let fareKobo: number | null = null;
    try {
      const receipt = await getRideReceipt(env, ride.bolt_ride_id);
      if (typeof receipt?.amount === "number") {
        fareKobo = toKobo(receipt.amount);
        patch.fare_kobo = fareKobo;
        patch.currency_code = receipt.currency_code ?? null;
        patch.invoice_url = receipt.invoice_url ?? null;
        patch.fare_breakdown = receipt.fare_breakdown ?? null;
      }
    } catch (err) {
      // Receipts are usually instant but can take 24h+ when a ride is under
      // review. Not having one yet must never hold up the delivery — the
      // reconciliation cron backfills it.
      console.warn(
        `[bolt] receipt not ready ride=${ride.bolt_ride_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    await supabase.from("bolt_rides").update(patch).eq("id", ride.id);

    // The delivery happened regardless of whether the receipt has landed.
    const result = await markOrderDelivered(supabase, {
      orderId: ride.order_id,
      deliveryCostKobo: fareKobo,
      source: "bolt",
    });

    if (result.ok && fareKobo !== null) {
      // Re-sum across attempts: a re-booked order's cost is every fare it
      // incurred, not just the last one.
      await recomputeDeliveryCost(supabase, ride.order_id);
    }

    return { action: "delivered", state: nextState, fareKobo };
  }

  await supabase.from("bolt_rides").update(patch).eq("id", ride.id);

  // ── Project onto the order's rider track (migration 101) ──────────────────
  // orders.dispatch_state mirrors the ride so every surface can show rider
  // progress on the manual and API lanes alike. Deliberately NOT written
  // through delivery_assignments.status — 'picked_up' there maps to an
  // orders.status that violates the table's check constraint (migration 095).
  const dispatchState = dispatchStateForBoltState(nextState);
  if (dispatchState) {
    await setDispatchState(supabase, ride.order_id, dispatchState);
  }

  // DRIVING_WITH_CLIENT is the rider leaving the restaurant with the food —
  // Bolt's "client" is the pickup point. THIS is what moves the food's own
  // status, and it is the only place that does so for a platform order: the
  // request itself happens up to a lead time before the food is even ready.
  if (nextState === "DRIVING_WITH_CLIENT") {
    await markOrderInTransit(
      supabase,
      ride.order_id,
      details.tracking_url ?? null
    );
  }

  if (isFailedState(nextState)) {
    return { action: "failed", state: nextState };
  }

  return { action: "updated", state: nextState };
}

/**
 * Advance a platform-lane order to in_transit and tell the customer.
 *
 * The "on its way" SMS used to fire at dispatch, which was true when dispatch
 * meant "the food is cooked and leaving". Under time-driven requests dispatch
 * can happen while the food is still in the pan, so the message moved here — to
 * the moment a rider actually has it.
 */
async function markOrderInTransit(
  supabase: SupabaseClient,
  orderId: string,
  trackingUrl: string | null
): Promise<void> {
  const { data: updated } = await supabase
    .from("orders")
    .update({ status: "in_transit" })
    .eq("id", orderId)
    .in("status", ["preparing", "ready_for_pickup", "assigned_to_rider"])
    .select("id, order_number, restaurant_id, customer_phone");

  const order = (updated as Array<{
    id: string;
    order_number: string | number;
    restaurant_id: string;
    customer_phone: string | null;
  }> | null)?.[0];

  // No row = already in_transit/delivered/cancelled. Duplicate webhooks are
  // routine, so this is the dedup for the SMS as much as for the status.
  if (!order?.customer_phone) return;

  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      restaurantId: order.restaurant_id,
      phone: order.customer_phone,
      eventType: "order_in_transit",
      orderId: order.id,
      orderNumber: order.order_number,
      // Omitted when absent, so the message falls back to its plain wording
      // rather than shipping a dangling "Track your rider:".
      ...(trackingUrl ? { trackingUrl } : {}),
    }),
  }).catch(console.error);
}
