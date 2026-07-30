/**
 * Close out a delivery.
 *
 * Shared by the admin Riders page (manual cost entry) and the Bolt webhook
 * (fare from the receipt), so both write the same fields in the same order.
 *
 * Fixes a divergence bug in the original admin route: the orders UPDATE is
 * filtered on status = 'assigned_to_rider' but its row count was never checked,
 * so an order in any other state silently no-op'd while the assignment was
 * still flipped to 'delivered' — leaving orders and delivery_assignments
 * disagreeing, and the caller told everything succeeded. The assignment is now
 * only touched when the order actually transitioned.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MarkDeliveredResult =
  | { ok: true; deliveredAt: string }
  | { ok: false; reason: "not_in_assigned_state" | "error"; message?: string };

/**
 * Statuses a platform-lane order can legally be delivered from.
 *
 * Was just 'assigned_to_rider'. Since migration 101 the rider lives on
 * orders.dispatch_state and orders.status keeps tracking the food, so a
 * platform order reaches its doorstep from 'ready_for_pickup' (rider collected
 * before we saw the pickup event) or 'in_transit' (the normal path).
 * 'assigned_to_rider' stays for orders dispatched before 101.
 *
 * 'confirmed' and 'preparing' are also here — not for the normal path, but for
 * Bolt's own documented delivery guarantees: webhooks are "neither ordered nor
 * deduplicated", and Bolt states outright that a COMPLETED event can arrive
 * before DRIVING_WITH_CLIENT. Since we re-fetch current state on every webhook
 * rather than trusting its payload, a COMPLETED that lands before we ever
 * observed the pickup means we jump straight from whatever the food's status
 * still is — 'preparing', or even 'confirmed' if the T-10 timer fired before
 * the merchant clicked Start Preparing — directly to 'delivered', skipping
 * in_transit. That single missed SMS is a far smaller problem than the
 * alternative: without this, the order would sit at 'preparing' forever, with
 * a COMPLETED Bolt ride nobody would think to go looking for.
 */
const DELIVERABLE_FROM = [
  "confirmed",
  "preparing",
  "assigned_to_rider",
  "ready_for_pickup",
  "in_transit",
];

export async function markOrderDelivered(
  supabase: SupabaseClient,
  params: {
    orderId: string;
    /** Omit to leave the existing cost untouched (e.g. receipt not ready yet). */
    deliveryCostKobo?: number | null;
    source: "bolt" | "manual";
    deliveredAt?: string;
  }
): Promise<MarkDeliveredResult> {
  const deliveredAt = params.deliveredAt ?? new Date().toISOString();

  const update: Record<string, unknown> = {
    status: "delivered",
    dispatch_state: "delivered",
    delivered_at: deliveredAt,
  };
  if (params.deliveryCostKobo !== undefined && params.deliveryCostKobo !== null) {
    update.delivery_cost_kobo = params.deliveryCostKobo;
    update.delivery_cost_source = params.source;
  }

  const { data: updated, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", params.orderId)
    .in("status", DELIVERABLE_FROM)
    .select("id");

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  if (!updated || updated.length === 0) {
    // Already delivered, cancelled, or never dispatched. Leave the assignment
    // alone — flipping it here is what produced the divergence.
    return { ok: false, reason: "not_in_assigned_state" };
  }

  await supabase
    .from("delivery_assignments")
    .update({ status: "delivered", delivered_at: deliveredAt })
    .eq("order_id", params.orderId);

  return { ok: true, deliveredAt };
}

/**
 * Recompute an order's delivery cost from its Bolt rides.
 *
 * Sums every ride that carried a fare rather than taking the completed one:
 * a cancelled or no-show attempt costs nothing today, but if Bolt ever charges
 * a cancellation fee, summing bills it correctly and "take the completed one"
 * would quietly under-report the true cost of the delivery.
 */
export async function recomputeDeliveryCost(
  supabase: SupabaseClient,
  orderId: string
): Promise<number | null> {
  const { data } = await supabase
    .from("bolt_rides")
    .select("fare_kobo")
    .eq("order_id", orderId)
    .not("fare_kobo", "is", null);

  const rows = (data as { fare_kobo: number }[] | null) ?? [];
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, r) => sum + (r.fare_kobo ?? 0), 0);

  await supabase
    .from("orders")
    .update({ delivery_cost_kobo: total, delivery_cost_source: "bolt" })
    .eq("id", orderId);

  return total;
}
