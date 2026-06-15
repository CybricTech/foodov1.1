import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // 1. Verify HMAC-SHA512 signature
  const signature = request.headers.get("x-paystack-signature");
  const secret = process.env.PAYSTACK_SECRET_KEY!;
  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 2. Route to the correct event handler
  if (
    event.event === "transfer.success" ||
    event.event === "transfer.failed" ||
    event.event === "transfer.reversed"
  ) {
    await handleTransferEvent(createServiceClient(), event);
    return NextResponse.json({ received: true });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const charge = event.data;
  const paystackRef = charge.reference as string;

  const supabase = createServiceClient();

  // 3. Idempotency check
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, paystack_status, order_id, restaurant_id, metadata")
    .eq("paystack_ref", paystackRef)
    .single();

  if (!existingPayment) {
    console.log(`[webhook] Unknown paystack_ref: ${paystackRef}`);
    // Unknown reference — return 200 to prevent Paystack retries
    return NextResponse.json({ received: true });
  }

  // Only skip if order was already created (not just payment marked success)
  if (existingPayment.paystack_status === "success" && existingPayment.order_id) {
    console.log(`[webhook] Already processed ref=${paystackRef}, order_id=${existingPayment.order_id}`);
    return NextResponse.json({ received: true });
  }

  console.log(`[webhook] Processing ref=${paystackRef}, payment_id=${existingPayment.id}, prior_status=${existingPayment.paystack_status}`);

  const meta = existingPayment.metadata as Record<string, unknown>;
  const restaurantId = existingPayment.restaurant_id;

  // 4. Update payment record (only if not already success)
  if (existingPayment.paystack_status !== "success") {
    await supabase
      .from("payments")
      .update({
        paystack_status: "success",
        paid_at: new Date().toISOString(),
        metadata: {
          ...(meta ?? {}),
          paystack_channel: charge.channel,
          paystack_fees: charge.fees,
        } as import("@foodo/database").Json,
      })
      .eq("id", existingPayment.id);
  }

  // 4.5 Re-verify restaurant is still accepting orders at payment time.
  // Covers the race condition where a merchant closes the store after the
  // customer reached checkout but before Paystack fires this webhook.
  // We still create the order (payment was already collected) but log it
  // prominently so the team can follow up if needed.
  const { data: restStatus } = await supabase
    .from("restaurants")
    .select("is_active, accepts_orders")
    .eq("id", restaurantId)
    .single();

  if (!restStatus?.is_active || !restStatus?.accepts_orders) {
    console.warn(
      `[webhook] STORE_CLOSED_AT_PAYMENT: restaurant=${restaurantId} ` +
      `is_active=${restStatus?.is_active} accepts_orders=${restStatus?.accepts_orders} ` +
      `ref=${paystackRef} — order will still be created since payment was collected`
    );
  }

  // 5. Create the order
  // Fallback order number in case the DB trigger is missing or fails.
  // The BEFORE INSERT trigger (if present) will override this with the
  // proper prefix + sequence format (e.g. TC-1001).
  const fallbackOrderNumber = `FD-${Date.now()}`;

  const orderPayload = {
    restaurant_id: restaurantId,
    payment_id: existingPayment.id,
    customer_phone: meta.customer_phone as string,
    customer_name: meta.customer_name as string,
    customer_email: (meta.customer_email as string) || null,
    fulfillment_type: meta.fulfillment_type as "delivery" | "pickup",
    delivery_address: (meta.delivery_address as string) || null,
    special_instructions: (meta.special_instructions as string) || null,
    status: "confirmed" as const,
    payment_status: "paid" as const,
    subtotal_kobo: meta.subtotal_kobo as number,
    delivery_fee_kobo: meta.delivery_fee_kobo as number,
    vat_kobo: (meta.vat_kobo as number) || 0,
    service_fee_kobo: (meta.service_fee_kobo as number) || 0,
    discount_id: (meta.discount_id as string) || null,
    discount_code: (meta.discount_code as string) || null,
    discount_kobo: (meta.discount_kobo as number) || 0,
    loyalty_redeemed: (meta.loyalty_redeemed as boolean) || false,
    loyalty_stamps_spent: (meta.loyalty_stamps_spent as number) || null,
    total_kobo:
      (meta.subtotal_kobo as number) +
      (meta.delivery_fee_kobo as number) +
      ((meta.vat_kobo as number) || 0) +
      ((meta.service_fee_kobo as number) || 0) -
      ((meta.discount_kobo as number) || 0),
    subtotal: meta.subtotal_kobo as number,
    total_amount:
      (meta.subtotal_kobo as number) +
      (meta.delivery_fee_kobo as number) +
      ((meta.vat_kobo as number) || 0) +
      ((meta.service_fee_kobo as number) || 0) -
      ((meta.discount_kobo as number) || 0),
    delivery_distance_km: (meta.delivery_distance_km as number) || null,
    delivery_fee_kobo_calculated: (meta.delivery_fee_kobo as number) || 0,
    // Exact destination coordinates the fee was priced from (picked suggestion
    // or device GPS). Powers rider navigation deep-links to the precise pin.
    delivery_lat: (meta.delivery_lat as number) ?? null,
    delivery_lng: (meta.delivery_lng as number) ?? null,
    // Free-delivery promos declare the rider; stamping it now lets settlement
    // attribute the waived delivery fee (platform_rider => merchant-funded).
    dispatch_type: (meta.dispatch_type as string) || null,
    order_number: fallbackOrderNumber,
  };

  const orderResult = await supabase
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(orderPayload as any)
    .select("id, order_number")
    .single();

  // If the insert failed, log the full payload and error for debugging
  if (orderResult.error || !orderResult.data) {
    console.error("[webhook] Order creation failed:", JSON.stringify(orderResult.error));
    console.error("[webhook] Order payload:", JSON.stringify(orderPayload));
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }

  const order = orderResult.data;

  console.log(`[webhook] Order created: id=${order.id}, number=${order.order_number}`);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: meta.customer_phone as string,
    event: "order created",
    properties: {
      order_id: order.id,
      order_number: order.order_number,
      restaurant_id: restaurantId,
      fulfillment_type: meta.fulfillment_type,
      total_kobo: (meta.subtotal_kobo as number) + (meta.delivery_fee_kobo as number) + ((meta.vat_kobo as number) || 0) + ((meta.service_fee_kobo as number) || 0) - ((meta.discount_kobo as number) || 0),
      subtotal_kobo: meta.subtotal_kobo,
      delivery_fee_kobo: meta.delivery_fee_kobo,
      discount_kobo: (meta.discount_kobo as number) || 0,
      discount_code: (meta.discount_code as string) || null,
      item_count: (meta.items as unknown[])?.length ?? 0,
      payment_provider: "paystack",
    },
  });
  await posthog.shutdown();

  // 6. Create order items (snapshot)
  const items = (meta.items as Array<{
    menuItemId: string;
    name: string;
    priceKobo: number;
    quantity: number;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      choices: Array<{ choiceId: string; choiceName: string; priceModifierKobo: number }>;
    }>;
  }>) ?? [];

  const menuItemIds = items.map((i) => i.menuItemId);

  const { data: menuItems } = await supabase
    .from("menu_items")
    .select("id, price_kobo, prep_time_minutes")
    .in("id", menuItemIds);

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
        selected_options: item.selectedOptions as import("@foodo/database").Json,
        line_total: item.priceKobo * item.quantity,
        line_total_kobo: item.priceKobo * item.quantity,
      }))
    );
  }

  const menuPrepMap = new Map(
    (menuItems ?? []).map((m) => [m.id, (m as unknown as { prep_time_minutes?: number | null }).prep_time_minutes ?? null])
  );
  const prepTimes = items
    .map((item) => menuPrepMap.get(item.menuItemId))
    .filter((p): p is number => p != null);
  const maxPrepMinutes = prepTimes.length > 0 ? Math.max(...prepTimes) : 20;
  const bufferMinutes = meta.fulfillment_type === "delivery" ? 30 : 0;
  const etaMs = (maxPrepMinutes + bufferMinutes) * 60 * 1000;
  const estimatedDeliveryAt = new Date(Date.now() + etaMs).toISOString();

  await supabase
    .from("orders")
    .update({ estimated_delivery_at: estimatedDeliveryAt })
    .eq("id", order.id);

  // Accrue loyalty (earn + redeem) now that order_items exist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("loyalty_accrue_for_order", { p_order_id: order.id });

  // 6b. Record discount redemption (the order was already paid at the
  // discounted price, so we always honor it) and advance the usage counter
  // atomically so concurrent limits hold.
  const discountId = (meta.discount_id as string) || null;
  const discountKobo = (meta.discount_kobo as number) || 0;
  if (discountId && discountKobo > 0) {
    await supabase.from("discount_redemptions").insert({
      restaurant_id: restaurantId,
      discount_id: discountId,
      order_id: order.id,
      customer_phone: meta.customer_phone as string,
      amount_kobo: discountKobo,
    });
    await supabase.rpc("redeem_discount", { p_discount_id: discountId });
  }

  // 7. Upsert CRM customer record
  const totalKobo =
    (meta.subtotal_kobo as number) +
    (meta.delivery_fee_kobo as number) +
    ((meta.vat_kobo as number) || 0) +
    ((meta.service_fee_kobo as number) || 0);

  await supabase.rpc("upsert_customer", {
    p_restaurant_id: restaurantId,
    p_phone: meta.customer_phone as string,
    p_full_name: meta.customer_name as string,
    p_email: (meta.customer_email as string) || undefined,
    p_order_total_kobo: totalKobo,
  });

  // 7.5 Save delivery address for returning customer lookup
  const deliveryAddress = (meta.delivery_address as string) || null;
  if (deliveryAddress) {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("phone", meta.customer_phone as string)
      .single();

    if (customerRow) {
      await supabase
        .from("customer_addresses")
        .upsert(
          {
            customer_id: customerRow.id,
            restaurant_id: restaurantId,
            address: deliveryAddress,
            // Coordinate-back the saved address so re-selecting it re-prices
            // from lat/lng with zero geocoding (eliminates the wrong-street snap).
            lat: (meta.delivery_lat as number) ?? null,
            lng: (meta.delivery_lng as number) ?? null,
          },
          { onConflict: "customer_id, address" }
        );
    }
  }

  // 8. Update payment with order_id
  await supabase
    .from("payments")
    .update({ order_id: order.id })
    .eq("id", existingPayment.id);

  // 9. Credit merchant wallet + fetch data needed for email notifications
  const [{ data: settings }, { data: restaurantRow }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("service_charge_pct, service_charge_fixed_kobo, merchant_charge_pct, settlement_hold_hours, admin_alert_email")
      .single(),
    supabase
      .from("restaurants")
      .select("name, notification_email")
      .eq("id", restaurantId)
      .single(),
  ]);

  const pct = settings?.service_charge_pct ?? 0.03;
  const fixedFee = settings?.service_charge_fixed_kobo ?? 0;
  const merchantChargePct = Number(settings?.merchant_charge_pct ?? 0.01);
  const holdHours = settings?.settlement_hold_hours ?? 24;

  const subtotalKobo = meta.subtotal_kobo as number;
  const deliveryFeeKobo = meta.delivery_fee_kobo as number;
  const vatKobo = (meta.vat_kobo as number) || 0;

  // Merchant-funded discount: the subtotal portion lowers the merchant's
  // credit; any free-delivery portion is absorbed via the dispatch logistics
  // flow (delivery fee is not part of merchant credit). discount_subtotal_kobo
  // is the subtotal reduction; discount_kobo is the full customer benefit.
  const discountTotalKobo = (meta.discount_kobo as number) || 0;
  const discountSubtotalKobo = (meta.discount_subtotal_kobo as number) || 0;
  const netSubtotalKobo = subtotalKobo - discountSubtotalKobo;

  // Determine who bears the service fee.
  // If service_fee_kobo is in metadata the customer already paid it at checkout —
  // merchant gets the full (net) subtotal and we do NOT debit them again.
  // Legacy orders (no service_fee_kobo in meta) fall back to deducting from merchant.
  const metaServiceFeeKobo = (meta.service_fee_kobo as number) || 0;
  const customerPaidServiceFee = metaServiceFeeKobo > 0;

  const serviceChargeKobo = customerPaidServiceFee
    ? metaServiceFeeKobo
    : Math.round(netSubtotalKobo * Number(pct)) + Number(fixedFee);

  // Merchant charge: % of the actual Paystack transaction amount (post-discount).
  // This is the merchant's share of payment processing costs, deducted at settlement.
  const orderTotalKobo =
    subtotalKobo +
    deliveryFeeKobo +
    vatKobo +
    (customerPaidServiceFee ? metaServiceFeeKobo : 0) -
    discountTotalKobo;
  const merchantChargeKobo = Math.round(orderTotalKobo * merchantChargePct);

  // Restaurant credit at payment time = subtotal + VAT − merchant charge.
  // The delivery fee split is intentionally deferred: the merchant picks the
  // dispatch type (platform_rider vs own_rider) per-order from the frontline,
  // and the dispatch route writes the corresponding wallet rows at that point.
  // - VAT is collected on behalf of the restaurant (they remit to FIRS)
  // - Customer service fee goes to Foodo directly; not deducted from restaurant
  // - Legacy orders (no service_fee in meta): deduct service charge from restaurant instead
  const restaurantCreditKobo = customerPaidServiceFee
    ? netSubtotalKobo + vatKobo - merchantChargeKobo
    : netSubtotalKobo + vatKobo - serviceChargeKobo - merchantChargeKobo;

  const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  // Ensure wallet exists
  await supabase
    .from("restaurant_wallets")
    .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id" });

  // Build wallet transaction rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletRows: any[] = [
    {
      restaurant_id: restaurantId,
      order_id: order.id,
      type: "order_credit",
      direction: "credit",
      amount_kobo: restaurantCreditKobo,
      status: "pending",
      available_at: availableAt,
      description: `Order #${order.order_number} — net revenue (subtotal${vatKobo > 0 ? ' + VAT' : ''})`,
    },
    // Service charge debit (only when merchant bears the fee in legacy orders)
    ...(customerPaidServiceFee
      ? []
      : [
          {
            restaurant_id: restaurantId,
            order_id: order.id,
            type: "service_charge",
            direction: "debit",
            amount_kobo: serviceChargeKobo,
            status: "settled",
            description: `Platform fee (${(Number(pct) * 100).toFixed(1)}% + ₦${(Number(fixedFee) / 100).toFixed(0)} fixed) on Order #${order.order_number}`,
          },
        ]),
    // NOTE: logistics_fee (delivery fee split) is NOT created here.
    // It is deferred to the dispatch route, which writes it once the merchant
    // picks the dispatch type (platform_rider vs own_rider) for this order.
    // Merchant's share of payment processing (% of total Paystack amount)
    ...(merchantChargeKobo > 0
      ? [
          {
            restaurant_id: restaurantId,
            order_id: order.id,
            type: "merchant_charge",
            direction: "debit",
            amount_kobo: merchantChargeKobo,
            status: "settled",
            description: `Merchant charge (${(merchantChargePct * 100).toFixed(1)}% of ₦${(orderTotalKobo / 100).toFixed(0)} total) — Order #${order.order_number}`,
          },
        ]
      : []),
  ];

  await supabase.from("wallet_transactions").insert(walletRows);

  // Update wallet pending_balance and total_earned
  await supabase.rpc("increment_wallet_pending", {
    p_restaurant_id: restaurantId,
    p_amount_kobo: restaurantCreditKobo,
  });

  // 10. Trigger SMS + email notifications — awaited together so serverless doesn't
  //     terminate before the dispatches complete.
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const smsRequests: Promise<unknown>[] = [
    // Customer confirmation SMS
    fetch(edgeFnUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        phone: meta.customer_phone,
        eventType: "order_confirmed",
        orderId: order.id,
        orderNumber: order.order_number,
      }),
    }).catch(console.error),

    // Merchant new order SMS
    fetch(edgeFnUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        eventType: "new_order_merchant",
        orderId: order.id,
        orderNumber: order.order_number,
      }),
    }).catch(console.error),

    // Merchant new order PUSH (Expo) — fire-and-forget alongside the SMS.
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        orderId: order.id,
        orderNumber: order.order_number,
        totalKobo: orderTotalKobo,
        customerName: meta.customer_name as string,
      }),
    }).catch(console.error),
  ];

  await Promise.allSettled(smsRequests);

  // 11. Trigger email notifications via Edge Function (fire-and-forget)
  const edgeEmailUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  const restaurantName = (restaurantRow as unknown as { name?: string; notification_email?: string | null } | null)?.name ?? "Your Restaurant";
  const adminAlertEmail = (settings as unknown as { admin_alert_email?: string | null } | null)?.admin_alert_email ?? null;

  // Resolve merchant email: notification_email → merchant_owner profile → skip
  const restaurantNotificationEmail = (restaurantRow as unknown as { name?: string; notification_email?: string | null } | null)?.notification_email ?? null;
  let merchantEmail: string | null = restaurantNotificationEmail;
  if (!merchantEmail) {
    const { data: ownerProfile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("restaurant_id", restaurantId)
      .eq("role", "merchant_owner")
      .single();
    merchantEmail = (ownerProfile as unknown as { email?: string | null } | null)?.email ?? null;
  }

  // Map meta items to the shape the email template expects
  const metaItems = (meta.items as Array<{
    menuItemId: string;
    name: string;
    priceKobo: number;
    quantity: number;
    selectedOptions: Array<{
      optionId: string;
      optionName: string;
      choices: Array<{ choiceId: string; choiceName: string; priceModifierKobo: number; quantity?: number }>;
    }>;
  }>) ?? [];

  const emailItems = metaItems.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    price: item.priceKobo,
    options: item.selectedOptions?.length
      ? item.selectedOptions.map((opt) => ({
          optionName: opt.optionName,
          choices: opt.choices.map((c) => ({
            choiceName: c.choiceName,
            priceModifier: c.priceModifierKobo,
            quantity: c.quantity,
          })),
        }))
      : undefined,
  }));

  const orderEmailProps = {
    restaurantName,
    orderNumber: order.order_number,
    customerName: meta.customer_name as string,
    customerPhone: meta.customer_phone as string,
    fulfillmentType: meta.fulfillment_type as "delivery" | "pickup",
    deliveryAddress: (meta.delivery_address as string) ?? null,
    specialInstructions: (meta.special_instructions as string) ?? null,
    items: emailItems,
    subtotalKobo: meta.subtotal_kobo as number,
    deliveryFeeKobo: meta.delivery_fee_kobo as number,
    vatKobo: (meta.vat_kobo as number) || 0,
    serviceFeeKobo: (meta.service_fee_kobo as number) || 0,
    totalKobo:
      (meta.subtotal_kobo as number) +
      (meta.delivery_fee_kobo as number) +
      ((meta.vat_kobo as number) || 0) +
      ((meta.service_fee_kobo as number) || 0),
    createdAt: new Date().toISOString(),
  };

  // Await all notifications with allSettled so failures don't block each other
  // and the webhook doesn't return before they're dispatched (fire-and-forget
  // in serverless kills pending fetches when the response is returned).
  const notificationRequests: Promise<unknown>[] = [];

  if (merchantEmail) {
    notificationRequests.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_merchant", to: merchantEmail, props: orderEmailProps }),
      }).then((r) => { if (!r.ok) console.error(`[webhook] merchant email failed: ${r.status}`); })
       .catch((e) => console.error("[webhook] merchant email error:", e))
    );
  }

  if (adminAlertEmail) {
    notificationRequests.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_admin", to: adminAlertEmail, props: orderEmailProps }),
      }).then((r) => { if (!r.ok) console.error(`[webhook] admin email failed: ${r.status}`); })
       .catch((e) => console.error("[webhook] admin email error:", e))
    );
  }

  await Promise.allSettled(notificationRequests);

  return NextResponse.json({ received: true });
}

// ── Transfer events (settlement payouts) ─────────────────────────────────────
// Replicates supabase/functions/paystack-transfer-webhook/index.ts but runs
// inside the Next.js route so a single webhook URL handles all Paystack events.

async function handleTransferEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: { event: string; data: Record<string, unknown> }
) {
  const transferCode = event.data?.transfer_code as string | undefined;
  if (!transferCode) return;

  if (event.event === "transfer.success") {
    await supabase
      .from("settlements")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("paystack_transfer_code", transferCode);
    return;
  }

  if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
    const { data: settlement } = await supabase
      .from("settlements")
      .update({
        status: "failed",
        failure_reason: (event.data?.reason as string) ?? "Transfer failed",
      })
      .eq("paystack_transfer_code", transferCode)
      .select("restaurant_id, amount_kobo")
      .single();

    if (settlement) {
      await supabase.rpc("restore_failed_settlement", {
        p_restaurant_id: settlement.restaurant_id,
        p_amount_kobo: settlement.amount_kobo,
      });
    }
  }
}
