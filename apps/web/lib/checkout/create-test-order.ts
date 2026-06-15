import type { SupabaseClient } from "@supabase/supabase-js";

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
 *
 * Loyalty earn/redeem happens automatically via the orders trigger (it fires on
 * the paid insert using customer_phone + loyalty_redeemed/loyalty_stamps_spent).
 *
 * Intentionally NOT done (test-merchant behaviour): wallet_transactions rows and
 * customer SMS/email. The merchant's pending balance + settlements are derived
 * from `orders` (recompute_restaurant_wallet + the canonical net formula), so
 * payout figures stay correct; we just don't spam notifications on every test.
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

  const orderPayload = {
    restaurant_id: restaurantId,
    payment_id: paymentId,
    customer_phone: meta.customer_phone as string,
    customer_name: meta.customer_name as string,
    customer_email: str("customer_email"),
    fulfillment_type: meta.fulfillment_type as "delivery" | "pickup",
    delivery_address: str("delivery_address"),
    special_instructions: str("special_instructions"),
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

  // Order items snapshot.
  const items =
    (meta.items as Array<{
      menuItemId: string;
      name: string;
      priceKobo: number;
      quantity: number;
      selectedOptions: unknown;
    }>) ?? [];

  if (items.length > 0) {
    await supabase.from("order_items").insert(
      items.map((item) => ({
        order_id: order.id,
        restaurant_id: restaurantId,
        menu_item_id: item.menuItemId,
        item_name: item.name,
        item_price: item.priceKobo,
        item_price_kobo: item.priceKobo,
        quantity: item.quantity,
        selected_options: item.selectedOptions as never,
        line_total: item.priceKobo * item.quantity,
        line_total_kobo: item.priceKobo * item.quantity,
      })) as never
    );
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
  await supabase
    .from("orders")
    .update({
      estimated_delivery_at: new Date(Date.now() + (maxPrep + buffer) * 60_000).toISOString(),
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

  // Accrue loyalty (earn + redeem) now that order_items exist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("loyalty_accrue_for_order", { p_order_id: order.id });

  return { orderId: order.id, orderNumber: order.order_number };
}
