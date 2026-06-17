/**
 * Shared settlement summariser.
 *
 * Both payout paths — the admin's MANUAL record route and the AUTOMATED cron
 * engine — must turn "a set of unsettled orders" into the exact same payout
 * figures. They select orders differently (manual = one calendar day; cron = a
 * rolling hold window), but the moment they have rows, they MUST agree to the
 * kobo. So the selection lives in each route; the *math* lives here, on top of
 * the canonical @foodo/utils formula. There is no second formula.
 *
 * See packages/utils/src/settlements.ts for the canonical net definition and
 * supabase migration 059/080 for its SQL mirror (foodo_order_net_kobo).
 */
import {
  computeSettlementTotals,
  resolveDispatchType,
  type FeeSettings,
  type SettleableOrder,
  type SettlementTotals,
} from "@foodo/utils";

/** Raw order row as selected from Supabase (snake_case, nullable columns). */
export interface RawSettlementOrder {
  id: string;
  subtotal_kobo: number | null;
  vat_kobo: number | null;
  delivery_fee_kobo: number | null;
  service_fee_kobo: number | null;
  total_kobo: number | null;
  dispatch_type: string | null;
  fulfillment_type: string | null;
  delivery_assignments?: Array<{ dispatch_type: string | null }> | null;
}

export interface SettlementSummary {
  /** Normalised orders with dispatch_type resolved via the canonical priority. */
  orders: (SettleableOrder & { id: string })[];
  /** Canonical aggregate totals (gross, charges, commission, netPayout). */
  computed: SettlementTotals;
  /** Ids of the orders included — exactly the rows to lock to the settlement. */
  orderIds: string[];
}

/**
 * Normalise raw order rows + the merchant's logistics default into the
 * canonical {@link SettleableOrder} shape, resolve each order's effective
 * dispatch type, and aggregate with the single source-of-truth formula.
 */
export function summarizeSettlement(
  rawOrders: RawSettlementOrder[],
  logisticsDefault: string | null,
  feeSettings: FeeSettings
): SettlementSummary {
  const orders = rawOrders.map((o) => ({
    id: o.id,
    subtotal_kobo: o.subtotal_kobo ?? 0,
    vat_kobo: o.vat_kobo ?? 0,
    delivery_fee_kobo: o.delivery_fee_kobo ?? 0,
    service_fee_kobo: o.service_fee_kobo ?? 0,
    total_kobo: o.total_kobo ?? null,
    fulfillment_type: o.fulfillment_type ?? null,
    dispatch_type: resolveDispatchType(
      o.dispatch_type,
      o.delivery_assignments ?? null,
      logisticsDefault
    ),
  }));

  const computed = computeSettlementTotals(orders, feeSettings);
  const orderIds = orders.map((o) => o.id);

  return { orders, computed, orderIds };
}

/** The columns every settlement selection must pull so the summary is complete. */
export const SETTLEMENT_ORDER_COLUMNS =
  `id, subtotal_kobo, vat_kobo, delivery_fee_kobo, service_fee_kobo, total_kobo, ` +
  `dispatch_type, fulfillment_type, delivery_assignments (dispatch_type)`;
