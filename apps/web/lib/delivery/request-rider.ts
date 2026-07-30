/**
 * "This order now needs a rider" — the single chokepoint.
 *
 * `dispatchRideForOrder` already established one place to decide Bolt-vs-
 * Telegram. This sits one level above it so the *lane commit* and the *delivery
 * split* happen in one place too, instead of being duplicated across every
 * caller that can now trigger a request:
 *
 *   1. the T−10 cron                      (/api/cron/request-due-riders)
 *   2. Mark Ready at a platform merchant  (early-ready: whichever comes first)
 *   3. the hybrid picker → Platform Rider (/api/dashboard/orders/dispatch)
 *   4. an admin re-book                   (/api/admin/bolt/rides/book)
 *
 * Callers 1 and 2 race by construction — that is the "whichever comes first"
 * rule — so the outer latch is what makes exactly-once true. See §4 below.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeRiderRequestDueAt,
  laneForPolicy,
  resolveDispatchPolicy,
  resolveRiderRequestLeadMinutes,
  type DispatchPolicy,
  type DispatchState,
} from "@foodo/utils";
import { dispatchRideForOrder } from "@/lib/delivery/dispatch-ride";
import { commitDeliverySplit } from "@/lib/delivery/commit-delivery-split";

export type RiderRequestOutcome =
  /** A rider was asked for — Bolt booking or Telegram note, decided downstream. */
  | { outcome: "requested"; lane: "platform_rider" }
  /** Another caller holds the latch and owns the outcome. */
  | { outcome: "skipped"; reason: string }
  /** This order never wants a platform rider (in_house, pickup, hybrid-unchosen). */
  | { outcome: "not_applicable"; reason: string }
  /** Could not proceed. Nothing was claimed; a later trigger may retry. */
  | { outcome: "failed"; reason: string };

export interface DispatchSettings {
  /** Master switch for the whole time-driven mechanism. */
  timedRequestEnabled: boolean;
  /** Platform default lead, minutes. Merchants may override. */
  leadMinutes: number;
}

export async function readDispatchSettings(
  supabase: SupabaseClient
): Promise<DispatchSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("timed_rider_request_enabled, rider_request_lead_minutes")
    .single();

  const row = data as {
    timed_rider_request_enabled?: boolean;
    rider_request_lead_minutes?: number;
  } | null;

  return {
    timedRequestEnabled: row?.timed_rider_request_enabled ?? false,
    leadMinutes: resolveRiderRequestLeadMinutes(null, row?.rider_request_lead_minutes),
  };
}

interface OrderRow {
  id: string;
  order_number: string | number;
  restaurant_id: string;
  status: string;
  fulfillment_type: string;
  delivery_fee_kobo: number | null;
  dispatch_type: string | null;
  dispatch_state: string | null;
  estimated_delivery_at: string | null;
}

interface RestaurantRow {
  dispatch_policy: string | null;
  rider_request_lead_minutes: number | null;
}

/** Statuses past which asking for a rider makes no sense. */
const CLOSED_STATUSES = new Set(["delivered", "completed", "cancelled"]);

/**
 * Ask for a rider for one order, exactly once.
 *
 * @param source short label recorded on the order and in logs, identifying the
 *   trigger: "cron:due", "ready:platform", "dispatch:new", "admin:rebook".
 */
export async function requestRiderForOrder(
  supabase: SupabaseClient,
  orderId: string,
  source: string,
  opts: { lane?: "platform_rider" } = {}
): Promise<RiderRequestOutcome> {
  /* ── 1. Load the order and its merchant's policy ────────────────────────── */
  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, order_number, restaurant_id, status, fulfillment_type, delivery_fee_kobo, " +
        "dispatch_type, dispatch_state, estimated_delivery_at"
    )
    .eq("id", orderId)
    .single();

  const order = orderData as OrderRow | null;
  if (orderErr || !order) {
    return { outcome: "failed", reason: "order not found" };
  }

  /* ── 2. Guards ──────────────────────────────────────────────────────────── */
  if (order.fulfillment_type !== "delivery") {
    await setDispatchState(supabase, orderId, "not_required");
    return { outcome: "not_applicable", reason: "pickup order" };
  }

  if (CLOSED_STATUSES.has(order.status)) {
    return { outcome: "not_applicable", reason: `order is ${order.status}` };
  }

  const { data: restaurantData } = await supabase
    .from("restaurants")
    .select("dispatch_policy, rider_request_lead_minutes")
    .eq("id", order.restaurant_id)
    .single();

  const restaurant = restaurantData as RestaurantRow | null;
  const policy = resolveDispatchPolicy(restaurant?.dispatch_policy);

  // The lane. A hybrid merchant has no lane until they pick one, so hybrid is
  // only ever requested through `opts.lane` — the picker passing its choice in.
  const lane = opts.lane ?? laneForPolicy(policy);

  if (lane !== "platform_rider") {
    await setDispatchState(supabase, orderId, "not_required");
    return {
      outcome: "not_applicable",
      reason: lane === null ? "hybrid merchant has not chosen" : "merchant rides in-house",
    };
  }

  /* ── 3. Claim the outer latch ───────────────────────────────────────────── */
  // Atomic: only the first of any number of concurrent callers flips
  // rider_requested_at from NULL. This is what makes "the T−10 cron OR Mark
  // Ready, whichever comes first" produce exactly one rider, not two.
  const { data: claimed, error: claimErr } = await supabase
    .from("orders")
    .update({
      rider_requested_at: new Date().toISOString(),
      rider_request_source: source,
    })
    .eq("id", orderId)
    .is("rider_requested_at", null)
    .select("id");

  if (claimErr) {
    // 42703 = migration 101 not applied here. Fail CLOSED: without the latch we
    // could request two riders for one order, and each one costs real money.
    console.error(`[rider-request] claim failed order=${orderId}: ${claimErr.message}`);
    return { outcome: "failed", reason: "could not claim rider request" };
  }

  if (!claimed || claimed.length === 0) {
    return { outcome: "skipped", reason: "already requested" };
  }

  /* ── 4. Commit the lane ─────────────────────────────────────────────────── */
  // From here the order is on the platform lane and the money follows it. Done
  // before the ride is sought, not after, so a booking that fails still leaves
  // a consistent, settleable order for the riders console to work on.
  await supabase
    .from("orders")
    .update({ dispatch_type: "platform_rider", dispatch_state: "requested" })
    .eq("id", orderId);

  const { error: assignErr } = await supabase.from("delivery_assignments").insert({
    order_id: orderId,
    restaurant_id: order.restaurant_id,
    dispatch_type: "platform_rider",
    rider_id: null,
    status: "assigned",
  });

  // 23505 = unique_violation on delivery_assignments(order_id) (migration 063):
  // an assignment already exists, which is fine and idempotent.
  if (assignErr && (assignErr as { code?: string }).code !== "23505") {
    console.error(
      `[rider-request] assignment failed order=${order.order_number}: ${assignErr.message}`
    );
  }

  const split = await commitDeliverySplit(supabase, {
    orderId,
    restaurantId: order.restaurant_id,
    orderNumber: order.order_number,
    deliveryFeeKobo: order.delivery_fee_kobo ?? 0,
    dispatchType: "platform_rider",
  });

  if (split.outcome === "error") {
    // Money is the one thing worth shouting about; the rider still gets asked
    // for, because a customer waiting on food should not pay for our ledger
    // problem. The riders console and settlement review surface the gap.
    console.error(
      `[rider-request] delivery split failed order=${order.order_number}: ${split.reason}`
    );
  }

  /* ── 5. Go get the rider ────────────────────────────────────────────────── */
  // Bolt API or Telegram note — decided by dispatchRideForOrder from
  // platform_settings, and invisible from here on purpose.
  await dispatchRideForOrder(
    supabase,
    orderId,
    order.restaurant_id,
    order.order_number,
    source
  ).catch((err) => {
    console.error(`[rider-request] dispatch threw order=${order.order_number}:`, err);
  });

  console.log(
    `[rider-request] requested order=${order.order_number} policy=${policy} source=${source}`
  );

  return { outcome: "requested", lane: "platform_rider" };
}

/**
 * Set the rider-side state without disturbing orders.status.
 *
 * Never walks a terminal state backwards — webhooks are documented as neither
 * ordered nor deduplicated, so a late 'booked' must not undo a 'picked_up'.
 */
const TERMINAL_DISPATCH_STATES = new Set<DispatchState>([
  "delivered",
  "cancelled",
  "failed",
]);

export async function setDispatchState(
  supabase: SupabaseClient,
  orderId: string,
  state: DispatchState
): Promise<void> {
  const { data } = await supabase
    .from("orders")
    .select("dispatch_state")
    .eq("id", orderId)
    .single();

  const current = (data as { dispatch_state: string | null } | null)?.dispatch_state;
  if (current === state) return;
  if (current && TERMINAL_DISPATCH_STATES.has(current as DispatchState)) return;

  await supabase.from("orders").update({ dispatch_state: state }).eq("id", orderId);
}

/**
 * Recompute and store when this order's rider should be requested.
 *
 * Called wherever the merchant sets or revises their prep estimate. A no-op once
 * the request has already gone out — a merchant revising the ETA after the rider
 * is on the road cannot un-send him; that lands in the riders console instead.
 */
export async function refreshRiderRequestDueAt(
  supabase: SupabaseClient,
  orderId: string,
  order: {
    fulfillment_type: string;
    estimated_delivery_at: string | null;
    rider_requested_at?: string | null;
  },
  policy: DispatchPolicy,
  restaurantLeadMinutes: number | null | undefined,
  platformLeadMinutes: number | null | undefined
): Promise<Date | null> {
  if (order.rider_requested_at) return null;

  const leadMinutes = resolveRiderRequestLeadMinutes(
    restaurantLeadMinutes,
    platformLeadMinutes
  );

  const dueAt = computeRiderRequestDueAt({
    policy,
    fulfillmentType: order.fulfillment_type,
    estimatedReadyAt: order.estimated_delivery_at,
    leadMinutes,
  });

  await supabase
    .from("orders")
    .update({
      rider_request_due_at: dueAt ? dueAt.toISOString() : null,
      // 'pending' = a delivery order on the platform lane that has not been
      // requested yet. Anything else keeps whatever it already had.
      ...(dueAt ? { dispatch_state: "pending" } : {}),
    })
    .eq("id", orderId)
    .is("rider_requested_at", null);

  return dueAt;
}
