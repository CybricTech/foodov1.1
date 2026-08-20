/**
 * The one order payload every paid-checkout path inserts.
 *
 * Three routes turn the same payment metadata into an order — the Paystack
 * webhook, the Monnify webhook, and the checkout status poll that covers a
 * webhook which never arrived (plus the reconciliation cron, which replays that
 * poll). They used to be three hand-maintained copies of one object literal,
 * and copies drift. Twice now the status poll was the one left behind:
 *
 *   - it omitted the discount/loyalty fields, which over-settled the merchant;
 *   - it omitted delivery_lat/delivery_lng, so AR-2151 reached dispatch with no
 *     coordinates, Bolt refused to book it (it will not send a rider to an
 *     unresolved point) and the order fell back to manual Telegram dispatch —
 *     ~9 minutes after the customer had paid.
 *
 * The metadata is written in exactly one place (/api/checkout/initialize), so
 * reading it belongs in exactly one place too. Anything a paid order needs from
 * that metadata goes here, once, where it cannot reach two paths out of three.
 */

/**
 * Payment metadata as written by /api/checkout/initialize.
 *
 * Deliberately indexed rather than fully typed: it round-trips through the
 * payment provider as JSON, so the values are whatever came back over the wire
 * and each field is narrowed at the point it is read.
 */
export type CheckoutMetadata = Record<string, unknown>;

export interface OrderPayloadParams {
  restaurantId: string;
  /** The payments row this order is being created for. */
  paymentId: string;
}

/**
 * Build the `orders` insert payload from a successful payment's metadata.
 *
 * The returned `order_number` is only a fallback: the BEFORE INSERT trigger
 * replaces it with the proper per-restaurant prefix + sequence (e.g. AR-2151).
 * It exists so the insert still succeeds if that trigger is ever missing.
 */
export function buildOrderPayloadFromMetadata(
  meta: CheckoutMetadata,
  { restaurantId, paymentId }: OrderPayloadParams
) {
  const subtotalKobo = meta.subtotal_kobo as number;
  const deliveryFeeKobo = meta.delivery_fee_kobo as number;
  const vatKobo = (meta.vat_kobo as number) || 0;
  const serviceFeeKobo = (meta.service_fee_kobo as number) || 0;
  // Discount/loyalty are merchant-funded: they reduce total_kobo (what the
  // customer actually paid), which is what settlement nets off — so the
  // merchant bears the cost, not the platform.
  const discountKobo = (meta.discount_kobo as number) || 0;

  const totalKobo =
    subtotalKobo + deliveryFeeKobo + vatKobo + serviceFeeKobo - discountKobo;

  return {
    restaurant_id: restaurantId,
    payment_id: paymentId,
    customer_phone: meta.customer_phone as string,
    customer_name: meta.customer_name as string,
    customer_email: (meta.customer_email as string) || null,
    fulfillment_type: meta.fulfillment_type as "delivery" | "pickup",
    delivery_address: (meta.delivery_address as string) || null,
    // The parts delivery_address was glued from. Stored separately so dispatch
    // can compose the address deliberately rather than parse a string back
    // apart, and so a bad pick is detectable — see @foodo/utils
    // composeDeliveryAddress and migration 20260820140000.
    delivery_base_address: (meta.delivery_base_address as string) || null,
    delivery_apt_unit: (meta.delivery_apt_unit as string) || null,
    delivery_place_id: (meta.delivery_place_id as string) || null,
    special_instructions: (meta.special_instructions as string) || null,
    // Pre-order slot (087): stamped onto the order; activated_at stays NULL so
    // the order sits in the Scheduled bucket until the activation cron (or a
    // merchant pull-forward) flips it into the live queue.
    scheduled_for: (meta.scheduled_for as string) || null,
    status: "confirmed" as const,
    payment_status: "paid" as const,
    subtotal_kobo: subtotalKobo,
    delivery_fee_kobo: deliveryFeeKobo,
    vat_kobo: vatKobo,
    service_fee_kobo: serviceFeeKobo,
    discount_id: (meta.discount_id as string) || null,
    discount_code: (meta.discount_code as string) || null,
    discount_kobo: discountKobo,
    loyalty_redeemed: (meta.loyalty_redeemed as boolean) || false,
    loyalty_stamps_spent: (meta.loyalty_stamps_spent as number) || null,
    total_kobo: totalKobo,
    subtotal: subtotalKobo,
    total_amount: totalKobo,
    delivery_distance_km: (meta.delivery_distance_km as number) || null,
    delivery_fee_kobo_calculated: deliveryFeeKobo || 0,
    // Exact destination coordinates the fee was priced from (picked suggestion
    // or device GPS). Powers rider navigation deep-links to the precise pin —
    // and without them Bolt cannot book a ride at all.
    delivery_lat: (meta.delivery_lat as number) ?? null,
    delivery_lng: (meta.delivery_lng as number) ?? null,
    // Free-delivery promos declare the rider; stamping it now lets settlement
    // attribute the waived delivery fee (platform_rider => merchant-funded).
    dispatch_type: (meta.dispatch_type as string) || null,
    order_number: `FD-${Date.now()}`,
  };
}

/** A cart line as it round-trips through payment metadata. */
export interface CheckoutMetadataItem {
  menuItemId: string;
  name: string;
  priceKobo: number;
  quantity: number;
  selectedOptions?: Array<{
    optionId: string;
    optionName: string;
    choices: Array<{
      choiceId: string;
      choiceName: string;
      priceModifierKobo: number;
      quantity?: number;
    }>;
  }>;
  /** Per-item customer note from the storefront item sheet ("no coconut"). */
  specialRequest?: string;
}

/**
 * Build the `order_items` insert rows from a successful payment's metadata.
 *
 * Same reasoning as the order payload above, and the same three call sites:
 * both webhooks and the status poll each kept a hand-written copy of this map.
 * The copies cost us a customer's safety — `specialRequest` had to be added in
 * three places to work, so it went into none, and a line-item note reading
 * "without coconut" never reached the kitchen on an order for someone with a
 * coconut allergy. One builder means a new per-item field cannot land on two
 * payment paths out of three.
 */
export function buildOrderItemsFromMetadata(
  meta: CheckoutMetadata,
  { restaurantId, orderId }: { restaurantId: string; orderId: string }
) {
  const items = (meta.items as CheckoutMetadataItem[] | undefined) ?? [];

  return items.map((item) => ({
    order_id: orderId,
    restaurant_id: restaurantId,
    menu_item_id: item.menuItemId,
    item_name: item.name,
    item_price: item.priceKobo,
    item_price_kobo: item.priceKobo,
    quantity: item.quantity,
    selected_options: (item.selectedOptions ??
      []) as unknown as import("@foodo/database").Json,
    // Trimmed to null so an all-whitespace note doesn't render an empty
    // "Special request" callout on the kitchen ticket.
    special_request: item.specialRequest?.trim() || null,
    line_total: item.priceKobo * item.quantity,
    line_total_kobo: item.priceKobo * item.quantity,
  }));
}

/**
 * Build the `customer_addresses` upsert for a delivery order.
 *
 * Returns null for pickup (nothing to save). The coordinates matter as much as
 * the row itself: a saved address WITH them re-prices a repeat order straight
 * from lat/lng, while one without falls back to geocoding the free text — the
 * exact path that resolved a street to the wrong district and undercharged the
 * delivery (GD-1331). Saving the address but dropping its coordinates quietly
 * re-arms that bug for every future order the customer places.
 *
 * Upsert on (customer_id, address).
 */
export function buildSavedAddressFromMetadata(
  meta: CheckoutMetadata,
  { restaurantId, customerId }: { restaurantId: string; customerId: string }
) {
  const address = (meta.delivery_address as string) || null;
  if (!address) return null;

  return {
    customer_id: customerId,
    restaurant_id: restaurantId,
    address,
    lat: (meta.delivery_lat as number) ?? null,
    lng: (meta.delivery_lng as number) ?? null,
  };
}
