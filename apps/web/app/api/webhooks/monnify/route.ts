import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verifyMonnifyWebhookSignature,
  nairaToKobo,
} from "@/lib/monnify";

/**
 * Monnify webhook handler.
 *
 * Monnify sends every event type to a single configured URL. We discriminate
 * on `eventType` and delegate to the appropriate handler. Signature is verified
 * before any DB work; idempotency is enforced via uniqueness on
 * `payments.monnify_ref` (transactions) and
 * `settlements.monnify_disbursement_reference` (disbursements).
 *
 * Always return 200 to Monnify after the signature passes — even on internal
 * errors — to avoid retry storms. Failures are logged for manual replay.
 */

type MonnifyEvent = {
  eventType: string;
  eventData: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // 1. Verify signature
  const signature = request.headers.get("monnify-signature");
  if (!verifyMonnifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: MonnifyEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServiceClient();

  try {
    switch (event.eventType) {
      case "SUCCESSFUL_TRANSACTION":
        await handleSuccessfulTransaction(supabase, event.eventData);
        break;

      case "SUCCESSFUL_DISBURSEMENT":
      case "FAILED_DISBURSEMENT":
      case "REVERSED_DISBURSEMENT":
        await handleDisbursementEvent(supabase, event.eventType, event.eventData);
        break;

      default:
        // Unhandled event types — acknowledge so Monnify doesn't retry.
        console.log(`[monnify-webhook] ignoring eventType=${event.eventType}`);
    }
  } catch (err) {
    console.error("[monnify-webhook] handler failed:", err);
    // Still 200 — Monnify retries indefinitely on non-2xx and we'd rather
    // surface the failure in our logs than have it amplified.
  }

  return NextResponse.json({ received: true });
}

/* ────────────────────────────────────────────────────────────────────────── */
/* SUCCESSFUL_TRANSACTION                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

async function handleSuccessfulTransaction(
  supabase: ReturnType<typeof createServiceClient>,
  data: Record<string, unknown>
) {
  const paymentReference = data.paymentReference as string | undefined;
  const transactionReference = data.transactionReference as string | undefined;
  if (!paymentReference) {
    console.warn("[monnify-webhook] missing paymentReference, ignoring");
    return;
  }

  const paymentMethod = data.paymentMethod as string | undefined;
  const feeNgn = data.fee != null ? Number(data.fee) : null;

  // Idempotency check — match by our reference (monnify_ref).
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, monnify_status, order_id, restaurant_id, metadata" as never)
    .eq("monnify_ref" as never, paymentReference)
    .single();

  if (!existingPayment) {
    console.log(`[monnify-webhook] unknown paymentReference: ${paymentReference}`);
    return;
  }
  const ep = existingPayment as unknown as {
    id: string;
    monnify_status: string | null;
    order_id: string | null;
    restaurant_id: string;
    metadata: Record<string, unknown> | null;
  };

  if (ep.monnify_status === "success" && ep.order_id) {
    console.log(
      `[monnify-webhook] already processed ref=${paymentReference}, order_id=${ep.order_id}`
    );
    return;
  }

  console.log(
    `[monnify-webhook] processing ref=${paymentReference}, payment_id=${ep.id}, prior_status=${ep.monnify_status}`
  );

  const meta = (ep.metadata as Record<string, unknown>) ?? {};
  const restaurantId = ep.restaurant_id as string;

  // Update payment record (only if not already success)
  if (ep.monnify_status !== "success") {
    const updatePayload = {
      monnify_status: "success",
      paid_at: new Date().toISOString(),
      metadata: {
        ...meta,
        monnify_channel: paymentMethod,
        monnify_fees_kobo: feeNgn != null ? nairaToKobo(feeNgn) : null,
        monnify_transaction_reference: transactionReference,
      } as import("@foodo/database").Json,
    } as unknown as Record<string, unknown>;

    await supabase.from("payments").update(updatePayload).eq("id", ep.id);
  }

  // Re-verify restaurant is still accepting orders. Covers race where merchant
  // closed store between checkout and webhook firing. We still create the order
  // (payment was collected) but log loudly for follow-up.
  const { data: restStatus } = await supabase
    .from("restaurants")
    .select("is_active, accepts_orders")
    .eq("id", restaurantId)
    .single();

  if (!restStatus?.is_active || !restStatus?.accepts_orders) {
    console.warn(
      `[monnify-webhook] STORE_CLOSED_AT_PAYMENT: restaurant=${restaurantId} ` +
        `is_active=${restStatus?.is_active} accepts_orders=${restStatus?.accepts_orders} ` +
        `ref=${paymentReference} — order will still be created since payment was collected`
    );
  }

  // Create the order — fallback order number; BEFORE INSERT trigger overrides
  // with the proper prefix + sequence format if present.
  const fallbackOrderNumber = `FD-${Date.now()}`;

  const orderPayload = {
    restaurant_id: restaurantId,
    payment_id: ep.id,
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
    total_kobo:
      (meta.subtotal_kobo as number) +
      (meta.delivery_fee_kobo as number) +
      ((meta.vat_kobo as number) || 0) +
      ((meta.service_fee_kobo as number) || 0),
    subtotal: meta.subtotal_kobo as number,
    total_amount:
      (meta.subtotal_kobo as number) +
      (meta.delivery_fee_kobo as number) +
      ((meta.vat_kobo as number) || 0) +
      ((meta.service_fee_kobo as number) || 0),
    delivery_distance_km: (meta.delivery_distance_km as number) || null,
    delivery_fee_kobo_calculated: (meta.delivery_fee_kobo as number) || 0,
    order_number: fallbackOrderNumber,
  };

  const orderResult = await supabase
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(orderPayload as any)
    .select("id, order_number")
    .single();

  if (orderResult.error || !orderResult.data) {
    console.error("[monnify-webhook] order creation failed:", JSON.stringify(orderResult.error));
    console.error("[monnify-webhook] order payload:", JSON.stringify(orderPayload));
    throw new Error("Order creation failed");
  }

  const order = orderResult.data;
  console.log(`[monnify-webhook] order created: id=${order.id}, number=${order.order_number}`);

  // Order items snapshot
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
    (menuItems ?? []).map((m) => [
      m.id,
      (m as unknown as { prep_time_minutes?: number | null }).prep_time_minutes ?? null,
    ])
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

  // Upsert CRM customer record
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

  // Save delivery address for returning customer lookup
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
          },
          { onConflict: "customer_id, address" }
        );
    }
  }

  // Link payment to order
  await supabase
    .from("payments")
    .update({ order_id: order.id })
    .eq("id", ep.id);

  // Credit merchant wallet + load data needed for email notifications
  const [{ data: settings }, { data: restaurantRow }] = await Promise.all([
    supabase
      .from("platform_settings")
      .select(
        "service_charge_pct, service_charge_fixed_kobo, merchant_charge_pct, settlement_hold_hours, admin_alert_email"
      )
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
  const metaServiceFeeKobo = (meta.service_fee_kobo as number) || 0;
  const customerPaidServiceFee = metaServiceFeeKobo > 0;

  const serviceChargeKobo = customerPaidServiceFee
    ? metaServiceFeeKobo
    : Math.round(subtotalKobo * Number(pct)) + Number(fixedFee);

  const orderTotalKobo =
    subtotalKobo +
    deliveryFeeKobo +
    vatKobo +
    (customerPaidServiceFee ? metaServiceFeeKobo : 0);
  const merchantChargeKobo = Math.round(orderTotalKobo * merchantChargePct);

  const restaurantCreditKobo = customerPaidServiceFee
    ? subtotalKobo + vatKobo - merchantChargeKobo
    : subtotalKobo + vatKobo - serviceChargeKobo - merchantChargeKobo;

  const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  await supabase
    .from("restaurant_wallets")
    .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id" });

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
      description: `Order #${order.order_number} — net revenue (subtotal${vatKobo > 0 ? " + VAT" : ""})`,
    },
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
  await supabase.rpc("increment_wallet_pending", {
    p_restaurant_id: restaurantId,
    p_amount_kobo: restaurantCreditKobo,
  });

  // Notifications — SMS + email
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`;
  const edgeEmailUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const smsRequests: Promise<unknown>[] = [
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
  ];

  await Promise.allSettled(smsRequests);

  const restaurantName =
    (restaurantRow as unknown as { name?: string; notification_email?: string | null } | null)?.name ?? "Your Restaurant";
  const adminAlertEmail =
    (settings as unknown as { admin_alert_email?: string | null } | null)?.admin_alert_email ?? null;

  const restaurantNotificationEmail =
    (restaurantRow as unknown as { name?: string; notification_email?: string | null } | null)?.notification_email ?? null;
  let merchantEmail: string | null = restaurantNotificationEmail;
  if (!merchantEmail) {
    const { data: ownerProfile } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("restaurant_id", restaurantId)
      .eq("role", "merchant_owner")
      .single();
    merchantEmail =
      (ownerProfile as unknown as { email?: string | null } | null)?.email ?? null;
  }

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
    totalKobo,
    createdAt: new Date().toISOString(),
  };

  const notificationRequests: Promise<unknown>[] = [];

  if (merchantEmail) {
    notificationRequests.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_merchant", to: merchantEmail, props: orderEmailProps }),
      })
        .then((r) => {
          if (!r.ok) console.error(`[monnify-webhook] merchant email failed: ${r.status}`);
        })
        .catch((e) => console.error("[monnify-webhook] merchant email error:", e))
    );
  }

  if (adminAlertEmail) {
    notificationRequests.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_admin", to: adminAlertEmail, props: orderEmailProps }),
      })
        .then((r) => {
          if (!r.ok) console.error(`[monnify-webhook] admin email failed: ${r.status}`);
        })
        .catch((e) => console.error("[monnify-webhook] admin email error:", e))
    );
  }

  await Promise.allSettled(notificationRequests);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Disbursement events (settlement payouts)                                  */
/* ────────────────────────────────────────────────────────────────────────── */

async function handleDisbursementEvent(
  supabase: ReturnType<typeof createServiceClient>,
  eventType: string,
  data: Record<string, unknown>
) {
  // Monnify disbursement webhooks echo our `reference` (sent on the request).
  // They also provide their internal `transactionReference`. We match settlements
  // by our reference (monnify_disbursement_reference).
  const ourRef = (data.reference ?? data.paymentReference) as string | undefined;
  const theirRef = data.transactionReference as string | undefined;
  if (!ourRef) {
    console.warn("[monnify-webhook] disbursement event missing reference");
    return;
  }

  if (eventType === "SUCCESSFUL_DISBURSEMENT") {
    const successPayload = {
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(theirRef ? { monnify_transaction_reference: theirRef } : {}),
    } as unknown as Record<string, unknown>;

    await supabase
      .from("settlements")
      .update(successPayload)
      .eq("monnify_disbursement_reference" as never, ourRef);
    return;
  }

  if (eventType === "FAILED_DISBURSEMENT" || eventType === "REVERSED_DISBURSEMENT") {
    const failureReason =
      (data.failureReason as string) ??
      (data.responseMessage as string) ??
      "Disbursement failed";

    const failurePayload = {
      status: "failed",
      failure_reason: failureReason,
      ...(theirRef ? { monnify_transaction_reference: theirRef } : {}),
    } as unknown as Record<string, unknown>;

    const { data: settlement } = await supabase
      .from("settlements")
      .update(failurePayload)
      .eq("monnify_disbursement_reference" as never, ourRef)
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
