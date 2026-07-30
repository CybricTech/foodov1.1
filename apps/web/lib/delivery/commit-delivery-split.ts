/**
 * The delivery-fee split, deferred from payment time to dispatch time.
 *
 * The Paystack webhook deliberately skips these wallet rows because at payment
 * time nobody knows who will ride. They are written the moment the lane is
 * committed — which used to be only the merchant's picker click, and is now
 * also the T−10 timer and the merchant's Mark Ready.
 *
 * Extracted verbatim from /api/dashboard/orders/dispatch so there is exactly one
 * implementation of "who gets what share of the delivery fee". The amounts and
 * the rounding are unchanged; only the clock moved earlier.
 *
 * ── On cancellation ────────────────────────────────────────────────────────
 * These rows are a LEDGER, not the balance. `recompute_restaurant_wallet`
 * (migration 059) derives pending_balance_kobo from orders excluding
 * status IN ('cancelled','pending'), so a cancelled order leaves the balance
 * correct with no reversal needed. What's left behind is a misleading audit
 * trail for a delivery that never happened, which {@link voidDeliverySplit}
 * clears. Do not "fix" the balance — it was never wrong.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDeliveryCommissionPct } from "@foodo/utils";

export interface DeliverySplitInput {
  orderId: string;
  restaurantId: string;
  orderNumber: string | number;
  deliveryFeeKobo: number;
  dispatchType: string;
}

export interface DeliverySplitResult {
  outcome: "written" | "skipped" | "error";
  reason?: string;
}

/**
 * Idempotent: skips entirely if a `logistics_fee` row already exists for the
 * order. That covers both a repeat call and legacy orders created under the old
 * code path that locked the split at payment time.
 */
export async function commitDeliverySplit(
  supabase: SupabaseClient,
  input: DeliverySplitInput
): Promise<DeliverySplitResult> {
  const { orderId, restaurantId, orderNumber, deliveryFeeKobo, dispatchType } = input;

  if (deliveryFeeKobo <= 0) return { outcome: "skipped", reason: "no delivery fee" };

  const { data: existingLogistics } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("type", "logistics_fee")
    .limit(1);

  if (existingLogistics && existingLogistics.length > 0) {
    return { outcome: "skipped", reason: "split already written" };
  }

  // Delivery commission rate: merchant override, else platform default (10%).
  const [{ data: settings }, { data: restaurantRate }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("delivery_commission_pct, settlement_hold_hours")
      .single(),
    supabase
      .from("restaurants")
      .select("delivery_commission_pct" as never)
      .eq("id", restaurantId)
      .single(),
  ]);

  const commissionPct = resolveDeliveryCommissionPct(
    (restaurantRate as unknown as { delivery_commission_pct?: number | null } | null)
      ?.delivery_commission_pct,
    (settings as unknown as { delivery_commission_pct?: number } | null)
      ?.delivery_commission_pct
  );
  const holdHours = Number(
    (settings as unknown as { settlement_hold_hours?: number } | null)
      ?.settlement_hold_hours ?? 24
  );

  // Split: Foodo provides rider  → Foodo keeps 100%
  //        Restaurant/3rd-party → Foodo keeps commissionPct
  const foodoCutKobo =
    dispatchType === "platform_rider"
      ? deliveryFeeKobo
      : Math.round(deliveryFeeKobo * commissionPct);
  const restaurantShareKobo = deliveryFeeKobo - foodoCutKobo;

  const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  const walletRows: Array<Record<string, unknown>> = [];

  if (restaurantShareKobo > 0) {
    walletRows.push({
      restaurant_id: restaurantId,
      order_id: orderId,
      type: "order_credit",
      direction: "credit",
      amount_kobo: restaurantShareKobo,
      status: "pending",
      available_at: availableAt,
      // Prefix is load-bearing: voidDeliverySplit finds this row by it, because
      // `order_credit` is shared with the order's food revenue. Keep them in step.
      description: `Delivery share (${dispatchType}) — Order #${orderNumber}`,
    });
  }

  if (foodoCutKobo > 0) {
    walletRows.push({
      restaurant_id: restaurantId,
      order_id: orderId,
      type: "logistics_fee",
      direction: "debit",
      amount_kobo: foodoCutKobo,
      status: "settled",
      description:
        dispatchType === "platform_rider"
          ? `Delivery fee (platform rider, 100%) — Order #${orderNumber}`
          : `Delivery commission (${(commissionPct * 100).toFixed(0)}%, ${dispatchType}) — Order #${orderNumber}`,
    });
  }

  if (walletRows.length > 0) {
    const { error: walletErr } = await supabase
      .from("wallet_transactions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(walletRows as any);
    if (walletErr) {
      return { outcome: "error", reason: walletErr.message };
    }
  }

  if (restaurantShareKobo > 0) {
    await supabase.rpc("increment_wallet_pending", {
      p_restaurant_id: restaurantId,
      p_amount_kobo: restaurantShareKobo,
    });
  }

  return { outcome: "written" };
}

/**
 * Description prefix on the delivery-share credit written above.
 *
 * `order_credit` is NOT ours alone — it is also the merchant's main food
 * revenue row, written by the Paystack webhook, the Monnify webhook,
 * /api/checkout/status and the test-order helper. Deleting by type would
 * destroy the payment credit for the order along with our delivery share.
 * (Balances would survive, since recompute derives them from orders and skips
 * cancelled ones — but the ledger and /api/admin/settlements/record, which
 * reads type='order_credit', would not.)
 *
 * So the delivery share is identified by this prefix, and it must stay in step
 * with the description written in commitDeliverySplit.
 */
const DELIVERY_SHARE_PREFIX = "Delivery share (";

/**
 * Clear the split's ledger rows for an order that was cancelled after the lane
 * was committed — a window that barely existed when booking happened at Ready,
 * and is now up to a full lead time wide.
 *
 * Balance-neutral by construction: the derived wallet already excludes
 * cancelled orders. This is audit-trail hygiene, and it removes ONLY the two
 * rows this module wrote.
 */
export async function voidDeliverySplit(
  supabase: SupabaseClient,
  orderId: string,
  restaurantId: string
): Promise<void> {
  // logistics_fee is written nowhere else, so type alone identifies it.
  const { data: feeRows } = await supabase
    .from("wallet_transactions")
    .delete()
    .eq("order_id", orderId)
    .eq("type", "logistics_fee")
    .select("id");

  // The delivery share shares its type with the order's food revenue, hence the
  // description filter. Narrow beats tidy here: leaving a stray row behind is a
  // cosmetic problem, deleting the payment credit is a data-loss one.
  const { data: shareRows } = await supabase
    .from("wallet_transactions")
    .delete()
    .eq("order_id", orderId)
    .eq("type", "order_credit")
    .like("description", `${DELIVERY_SHARE_PREFIX}%`)
    .select("id");

  const removed = (feeRows?.length ?? 0) + (shareRows?.length ?? 0);
  if (removed === 0) return;

  // Re-derive rather than decrementing: recompute is the authoritative path and
  // cannot drift, whereas a decrement mirroring the original increment can.
  await supabase.rpc("recompute_restaurant_wallet", {
    p_restaurant_id: restaurantId,
  });
}
