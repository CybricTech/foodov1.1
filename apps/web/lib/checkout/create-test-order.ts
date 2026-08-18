import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOrderItemsFromMetadata,
  type CheckoutMetadataItem,
} from "./order-payload";

/**
 * Create a fully-formed PAID order for a TEST merchant (is_test) without going
 * through the payment gateway — the only thing a test order skips is the real
 * charge. It mirrors the webhook's order finalization so a test order is
 * indistinguishable from a real one everywhere it matters:
 *   • order row (paid + confirmed) with all totals, discount + loyalty fields
 *   • order_items snapshot
 *   • estimated_delivery_at from item prep times (+delivery buffer)
 *   • discount redemption + usage counter
 *   • CRM customer upsert + saved delivery address
 *   • payment.order_id link
 *   • wallet ledger rows (order_credit + merchant_charge), so the test order
 *     shows in Wallet → Activity exactly like a real one
 *
 * Loyalty accrual (earn + redeem) is recorded via loyalty_accrue_for_order once
 * order_items exist.
 *
 * The ONLY thing a test order skips vs a real order is the CUSTOMER SMS/email —
 * there's no point texting a fake buyer. The MERCHANT alert (WhatsApp/SMS via
 * send-sms, plus push) DOES fire, so the notification path can be rehearsed
 * end-to-end from the storefront. Pending balance + settlements are derived
 * from `orders` (recompute_restaurant_wallet + canonical net), so payout
 * figures are correct regardless.
 *
 * GATING: callers MUST confirm restaurant.is_test before invoking this. It is
 * never reachable for a real merchant.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

type Meta = Record<string, unknown>;

export async function createTestOrder(
  supabase: AnyClient,
  { paymentId, restaurantId, meta }: { paymentId: string; restaurantId: string; meta: Meta }
): Promise<{ orderId: string; orderNumber: string }> {
  const num = (k: string) => (meta[k] as number) || 0;
  const str = (k: string) => (meta[k] as string) || null;

  const totalKobo =
    num("subtotal_kobo") +
    num("delivery_fee_kobo") +
    num("vat_kobo") +
    num("service_fee_kobo") -
    num("discount_kobo");

  // Pre-order slot (087): mirrored from the real webhooks so a test merchant
  // can exercise the full scheduled-order loop without money moving.
  const scheduledFor = str("scheduled_for");

  const orderPayload = {
    restaurant_id: restaurantId,
    payment_id: paymentId,
    customer_phone: meta.customer_phone as string,
    customer_name: meta.customer_name as string,
    customer_email: str("customer_email"),
    fulfillment_type: meta.fulfillment_type as "delivery" | "pickup",
    delivery_address: str("delivery_address"),
    special_instructions: str("special_instructions"),
    scheduled_for: scheduledFor,
    status: "confirmed" as const,
    payment_status: "paid" as const,
    subtotal_kobo: num("subtotal_kobo"),
    delivery_fee_kobo: num("delivery_fee_kobo"),
    vat_kobo: num("vat_kobo"),
    service_fee_kobo: num("service_fee_kobo"),
    discount_id: str("discount_id"),
    discount_code: str("discount_code"),
    discount_kobo: num("discount_kobo"),
    loyalty_redeemed: (meta.loyalty_redeemed as boolean) || false,
    loyalty_stamps_spent: (meta.loyalty_stamps_spent as number) || null,
    total_kobo: totalKobo,
    subtotal: num("subtotal_kobo"),
    total_amount: totalKobo,
    delivery_distance_km: (meta.delivery_distance_km as number) ?? null,
    delivery_fee_kobo_calculated: num("delivery_fee_kobo"),
    delivery_lat: (meta.delivery_lat as number) ?? null,
    delivery_lng: (meta.delivery_lng as number) ?? null,
    dispatch_type: str("dispatch_type"),
    order_number: `FD-${Date.now()}`,
  };

  const { data: order, error } = await supabase
    .from("orders")
    .insert(orderPayload as never)
    .select("id, order_number")
    .single();
  if (error || !order) {
    throw new Error(`Test order insert failed: ${error?.message ?? "unknown"}`);
  }

  // Order items snapshot — same builder as the real payment paths, so a test
  // order exercises per-item special requests exactly like a live one.
  const items = (meta.items as CheckoutMetadataItem[] | undefined) ?? [];

  const orderItemRows = buildOrderItemsFromMetadata(meta, {
    restaurantId,
    orderId: order.id,
  });

  if (orderItemRows.length > 0) {
    await supabase.from("order_items").insert(orderItemRows as never);
  }

  // Estimated ready time from the longest item prep (+ delivery buffer).
  const { data: menuItems } = await supabase
    .from("menu_items")
    .select("id, prep_time_minutes")
    .in("id", items.map((i) => i.menuItemId));
  const prepMap = new Map(
    (menuItems ?? []).map((m: { id: string; prep_time_minutes: number | null }) => [
      m.id,
      m.prep_time_minutes,
    ])
  );
  const prepTimes = items
    .map((i) => prepMap.get(i.menuItemId))
    .filter((p): p is number => p != null);
  const maxPrep = prepTimes.length > 0 ? Math.max(...prepTimes) : 20;
  const buffer = meta.fulfillment_type === "delivery" ? 30 : 0;
  // Scheduled orders count prep from the SLOT, not from payment — otherwise
  // the late-orders cron would flag every pre-order "late" before activation.
  const etaBaseMs = scheduledFor ? new Date(scheduledFor).getTime() : Date.now();
  await supabase
    .from("orders")
    .update({
      estimated_delivery_at: new Date(etaBaseMs + (maxPrep + buffer) * 60_000).toISOString(),
    })
    .eq("id", order.id);

  // Discount redemption + usage counter (mirrors the webhook).
  const discountId = str("discount_id");
  const discountKobo = num("discount_kobo");
  if (discountId && discountKobo > 0) {
    await supabase.from("discount_redemptions").insert({
      restaurant_id: restaurantId,
      discount_id: discountId,
      order_id: order.id,
      customer_phone: meta.customer_phone as string,
      amount_kobo: discountKobo,
    } as never);
    await supabase.rpc("redeem_discount", { p_discount_id: discountId } as never);
  }

  // CRM customer upsert (excludes the Foodo service fee from order total).
  await supabase.rpc("upsert_customer", {
    p_restaurant_id: restaurantId,
    p_phone: meta.customer_phone as string,
    p_full_name: meta.customer_name as string,
    p_email: (meta.customer_email as string) || undefined,
    p_order_total_kobo:
      num("subtotal_kobo") + num("delivery_fee_kobo") + num("vat_kobo") + num("service_fee_kobo"),
  } as never);

  // Save delivery address for returning-customer lookup.
  const deliveryAddress = str("delivery_address");
  if (deliveryAddress) {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("phone", meta.customer_phone as string)
      .single();
    if (customerRow) {
      await supabase.from("customer_addresses").upsert(
        {
          customer_id: customerRow.id,
          restaurant_id: restaurantId,
          address: deliveryAddress,
          lat: (meta.delivery_lat as number) ?? null,
          lng: (meta.delivery_lng as number) ?? null,
        } as never,
        { onConflict: "customer_id, address" }
      );
    }
  }

  // Link the payment to the order + mark it settled (no real charge happened).
  await supabase
    .from("payments")
    .update({ order_id: order.id } as never)
    .eq("id", paymentId);

  // Wallet ledger — mirror the webhook so the test order shows in Wallet →
  // Activity exactly like a real order. The order_credit reflects the
  // merchant-funded discount/loyalty (via discount_subtotal) and the merchant
  // charge; delivery-fee split is deferred to dispatch, as for real orders.
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("service_charge_pct, service_charge_fixed_kobo, merchant_charge_pct, settlement_hold_hours")
    .single();
  const s = (settings ?? {}) as {
    service_charge_pct?: number;
    service_charge_fixed_kobo?: number;
    merchant_charge_pct?: number;
    settlement_hold_hours?: number;
  };
  const metaServiceFeeKobo = num("service_fee_kobo");
  const customerPaidServiceFee = metaServiceFeeKobo > 0;
  const netSubtotalKobo = num("subtotal_kobo") - num("discount_subtotal_kobo");
  const vatKobo = num("vat_kobo");
  const pct = Number(s.service_charge_pct ?? 0.03);
  const fixedFee = Number(s.service_charge_fixed_kobo ?? 0);
  const merchantChargePct = Number(s.merchant_charge_pct ?? 0.01);
  const holdHours = Number(s.settlement_hold_hours ?? 24);
  const serviceChargeKobo = customerPaidServiceFee
    ? metaServiceFeeKobo
    : Math.round(netSubtotalKobo * pct) + fixedFee;
  const orderTotalKobo =
    num("subtotal_kobo") +
    num("delivery_fee_kobo") +
    vatKobo +
    (customerPaidServiceFee ? metaServiceFeeKobo : 0) -
    num("discount_kobo");
  const merchantChargeKobo = Math.round(orderTotalKobo * merchantChargePct);
  const restaurantCreditKobo = customerPaidServiceFee
    ? netSubtotalKobo + vatKobo - merchantChargeKobo
    : netSubtotalKobo + vatKobo - serviceChargeKobo - merchantChargeKobo;
  const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  await supabase
    .from("restaurant_wallets")
    .upsert({ restaurant_id: restaurantId } as never, { onConflict: "restaurant_id" });

  const walletRows: Record<string, unknown>[] = [
    {
      restaurant_id: restaurantId,
      order_id: order.id,
      type: "order_credit",
      direction: "credit",
      amount_kobo: restaurantCreditKobo,
      status: "pending",
      available_at: availableAt,
      description: `Order #${order.order_number} — net revenue (subtotal${vatKobo > 0 ? " + VAT" : ""})`,
    },
  ];
  if (merchantChargeKobo > 0) {
    walletRows.push({
      restaurant_id: restaurantId,
      order_id: order.id,
      type: "merchant_charge",
      direction: "debit",
      amount_kobo: merchantChargeKobo,
      status: "settled",
      description: `Merchant charge — Order #${order.order_number}`,
    });
  }
  await supabase.from("wallet_transactions").insert(walletRows as never);

  // Accrue loyalty (earn + redeem) now that order_items exist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("loyalty_accrue_for_order", { p_order_id: order.id });

  // ── Merchant alert (NOT the customer's) ─────────────────────────────────
  // Deliberately fired for test orders too. The customer notification stays
  // skipped — no point texting a fake buyer — but the merchant alert is the
  // single most important thing to be able to rehearse, and skipping it left
  // the WhatsApp/push path with no way to exercise it end-to-end from the
  // storefront: the only is_test merchant was also the only safe one to order
  // from. Fire-and-forget; a notification failure must never fail the order.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    const notify = (fn: string, body: Record<string, unknown>) =>
      fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }).catch(console.error);

    void notify("send-sms", {
      restaurantId,
      eventType: "new_order_merchant",
      orderId: order.id,
      orderNumber: order.order_number,
    });
    void notify("send-push", {
      restaurantId,
      orderId: order.id,
      orderNumber: order.order_number,
      totalKobo: orderTotalKobo,
      customerName: str("customer_name") ?? "Test Order",
    });
  }

  return { orderId: order.id, orderNumber: order.order_number };
}
