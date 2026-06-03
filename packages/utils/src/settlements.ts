/**
 * Settlement math — THE single source of truth for merchant payout figures.
 *
 * Every surface that shows or records "what we owe / paid a merchant" MUST use
 * these helpers so the merchant wallet, the admin settlement views, and the
 * settlement records that drive the actual bank transfer can never diverge.
 *
 * ── Foodo's fee model ──────────────────────────────────────────────────────
 * `order_total` (orders.total_kobo) = the amount the customer ACTUALLY paid via
 * the payment gateway, AFTER any discount = subtotal_net + VAT + delivery_fee +
 * customer service_fee. We settle off this — never off `subtotal_kobo`, which is
 * stored PRE-discount. Paying off the pre-discount subtotal would settle the
 * merchant for money the customer never paid (a merchant-funded discount) → a
 * direct platform loss. This is the bug that made "net" exceed what Paystack
 * collected.
 *
 *   • Customer service fee — charged to the CUSTOMER at checkout:
 *         ₦200 fixed + 1% of order_total.  100% Foodo revenue; never paid to the merchant.
 *   • Merchant charge — charged to the MERCHANT, deducted at settlement:
 *         merchant_charge_pct (1%) × order_total  (the same gateway total).
 *         i.e. both sides pay 1% of the processed amount; only the customer
 *         additionally pays the ₦200 fixed component.
 *
 * ── Payout ─────────────────────────────────────────────────────────────────
 *   gross           = order_total − service_fee    (merchant's share pre-Foodo-fees:
 *                                                    subtotal_net + VAT + delivery)
 *   merchant_charge = round(order_total × merchant_charge_pct)
 *   delivery_commission (delivery orders only — pickup has no delivery fee):
 *       - platform_rider           → 100% of the delivery fee  (Foodo provided & paid the rider)
 *       - own_rider / third_party  → round(delivery_fee × delivery_commission_pct)  (10%)
 *       - un-dispatched (null)     → 0 (commission isn't known until the rider type is picked)
 *   net = gross − merchant_charge − delivery_commission
 *       = order_total − service_fee − merchant_charge − delivery_commission
 *
 * Every term subtracted from order_total is ≥ 0, so net can NEVER exceed what the
 * customer paid — the platform cannot pay out more than it collected.
 *
 * All amounts are in kobo (integer). Rounding is per-order (Math.round) so the
 * sum of per-order nets equals the settlement total exactly.
 */

export interface FeeSettings {
  /** Foodo's payment-processing cut as a fraction of order total (e.g. 0.01 = 1%). */
  merchantChargePct: number;
  /** Commission on own/third-party delivery fees as a fraction (e.g. 0.10 = 10%). */
  deliveryCommissionPct: number;
}

/** The order fields required to compute a settlement net. */
export interface SettleableOrder {
  subtotal_kobo: number | null;
  vat_kobo: number | null;
  delivery_fee_kobo: number | null;
  service_fee_kobo: number | null;
  total_kobo?: number | null;
  /** Resolved dispatch type (see {@link resolveDispatchType}). */
  dispatch_type: string | null;
  /** Optional — when "delivery", commission may apply; pickup never has a delivery fee. */
  fulfillment_type?: string | null;
}

export const PLATFORM_RIDER = "platform_rider";
export const OWN_RIDER = "own_rider";
export const THIRD_PARTY = "third_party";

/**
 * Resolve an order's effective dispatch type using the canonical priority:
 *   1. orders.dispatch_type            (set by the dispatch route — source of truth)
 *   2. delivery_assignments.dispatch_type  (legacy fallback)
 *   3. restaurant.logistics_default    (merchant's default rider type)
 *   4. null                            (un-dispatched — no commission yet)
 */
export function resolveDispatchType(
  orderDispatchType: string | null | undefined,
  assignments: Array<{ dispatch_type: string | null }> | null | undefined,
  logisticsDefault: string | null | undefined
): string | null {
  return (
    orderDispatchType ??
    (assignments && assignments.length > 0 ? assignments[0].dispatch_type : null) ??
    logisticsDefault ??
    null
  );
}

/**
 * Foodo's slice of an order's delivery fee, dispatch-aware. See module docs.
 * Returns 0 when there is no delivery fee (pickup) or the order is un-dispatched.
 */
export function deliveryCommissionFor(
  order: Pick<SettleableOrder, "delivery_fee_kobo" | "dispatch_type">,
  deliveryCommissionPct: number
): number {
  const fee = order.delivery_fee_kobo ?? 0;
  if (fee <= 0) return 0;
  if (order.dispatch_type === PLATFORM_RIDER) return fee;
  if (order.dispatch_type === OWN_RIDER || order.dispatch_type === THIRD_PARTY) {
    return Math.round(fee * deliveryCommissionPct);
  }
  return 0;
}

/**
 * Payment-gateway processing fee Paystack deducts from each transaction BEFORE
 * remitting funds to the platform. This is Foodo's cost, NOT the merchant's — it
 * is never subtracted from the merchant net (see {@link computeOrderNet}); it
 * only affects Foodo's own revenue/reconciliation views.
 *
 * Rate: a flat 1.4% of the processed amount, no flat per-transaction component,
 * capped at ₦2,000. This is a negotiated Paystack rate, verified against the
 * Paystack settlement export docs/Hurdle_payouts_1780508359481.csv — from
 * 13 May 2026 onward, 17 of 18 daily payouts reconcile to 1.4% × gross to the
 * kobo (the lone outlier carried a higher-fee international card). The cap only
 * bites above ~₦142k/transaction, so it never triggers for normal orders.
 *
 * (Before 13 May 2026 Paystack billed the standard 1.5% + ₦100/txn ≈ 2.03%
 * effective; we don't retro-model that older regime. The Monnify-specific
 * 1.5%/₦2,000 model is separate and lives in the web app's lib/monnify.ts.)
 */
export const GATEWAY_FEE_PCT = 0.014;
export const GATEWAY_FEE_CAP_KOBO = 200000; // ₦2,000

/** Paystack's processing fee on a single transaction total (kobo in, kobo out). */
export function gatewayFee(totalKobo: number): number {
  return Math.min(Math.round(totalKobo * GATEWAY_FEE_PCT), GATEWAY_FEE_CAP_KOBO);
}

export interface OrderNet {
  /** subtotal + VAT + delivery_fee */
  gross: number;
  /** gross + service_fee (the amount the customer was charged at the gateway) */
  orderTotal: number;
  /** Foodo's payment-processing cut */
  merchantCharge: number;
  /** Foodo's delivery commission (dispatch-aware) */
  deliveryCommission: number;
  /** What the merchant is owed: gross − merchantCharge − deliveryCommission */
  net: number;
}

/** Compute the canonical fee breakdown + net payout for a single order. */
export function computeOrderNet(order: SettleableOrder, settings: FeeSettings): OrderNet {
  const subtotal = order.subtotal_kobo ?? 0;
  const vat = order.vat_kobo ?? 0;
  const deliveryFee = order.delivery_fee_kobo ?? 0;
  const serviceFee = order.service_fee_kobo ?? 0;

  // The amount the customer actually paid (post-discount). Fall back to the
  // component sum only when total_kobo isn't stored (legacy rows, no discounts).
  const orderTotal = order.total_kobo ?? subtotal + vat + deliveryFee + serviceFee;
  // Merchant's gross = everything the customer paid except the (Foodo-owned)
  // service fee. Using order_total here makes discounts flow through correctly.
  const gross = orderTotal - serviceFee;

  const merchantCharge = Math.round(orderTotal * settings.merchantChargePct);
  const deliveryCommission = deliveryCommissionFor(order, settings.deliveryCommissionPct);
  const net = gross - merchantCharge - deliveryCommission;

  return { gross, orderTotal, merchantCharge, deliveryCommission, net };
}

export interface SettlementTotals {
  orderCount: number;
  grossTotal: number;
  merchantChargeTotal: number;
  deliveryCommissionTotal: number;
  serviceFeeTotal: number;
  /** Sum of per-order nets — the amount to transfer to the merchant. */
  netPayout: number;
}

/** Aggregate the canonical breakdown across a set of orders (e.g. one day's block). */
export function computeSettlementTotals(
  orders: SettleableOrder[],
  settings: FeeSettings
): SettlementTotals {
  const totals: SettlementTotals = {
    orderCount: orders.length,
    grossTotal: 0,
    merchantChargeTotal: 0,
    deliveryCommissionTotal: 0,
    serviceFeeTotal: 0,
    netPayout: 0,
  };

  for (const o of orders) {
    const n = computeOrderNet(o, settings);
    totals.grossTotal += n.gross;
    totals.merchantChargeTotal += n.merchantCharge;
    totals.deliveryCommissionTotal += n.deliveryCommission;
    totals.serviceFeeTotal += o.service_fee_kobo ?? 0;
    totals.netPayout += n.net;
  }

  return totals;
}
