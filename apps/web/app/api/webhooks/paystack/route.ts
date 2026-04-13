import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

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

  // 5. Create the order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
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
      order_number: `ORD-${Date.now()}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("[webhook] Order creation failed:", JSON.stringify(orderError));
    return NextResponse.json({ error: "Order creation failed" }, { status: 500 });
  }

  console.log(`[webhook] Order created: id=${order.id}, number=${order.order_number}`);

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

  // 7. Upsert CRM customer record
  const totalKobo =
    (meta.subtotal_kobo as number) + (meta.delivery_fee_kobo as number) + ((meta.vat_kobo as number) || 0);

  await supabase.rpc("upsert_customer", {
    p_restaurant_id: restaurantId,
    p_phone: meta.customer_phone as string,
    p_full_name: meta.customer_name as string,
    p_email: (meta.customer_email as string) || undefined,
    p_order_total_kobo: totalKobo,
  });

  // 8. Update payment with order_id
  await supabase
    .from("payments")
    .update({ order_id: order.id })
    .eq("id", existingPayment.id);

  // 9. Credit merchant wallet
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("service_charge_pct, service_charge_fixed_kobo, settlement_hold_hours")
    .single();

  const pct = settings?.service_charge_pct ?? 0.03;
  const fixedFee = settings?.service_charge_fixed_kobo ?? 0;
  const holdHours = settings?.settlement_hold_hours ?? 24;

  const subtotalKobo = meta.subtotal_kobo as number;
  const deliveryFeeKobo = meta.delivery_fee_kobo as number;

  // Determine who bears the service fee.
  // If service_fee_kobo is in metadata the customer already paid it at checkout —
  // merchant gets the full subtotal and we do NOT debit them again.
  // Legacy orders (no service_fee_kobo in meta) fall back to deducting from merchant.
  const metaServiceFeeKobo = (meta.service_fee_kobo as number) || 0;
  const customerPaidServiceFee = metaServiceFeeKobo > 0;

  const serviceChargeKobo = customerPaidServiceFee
    ? metaServiceFeeKobo
    : Math.round(subtotalKobo * Number(pct)) + Number(fixedFee);

  // When customer paid: merchant credit = full subtotal (no deduction)
  // When merchant pays: merchant credit = subtotal minus service charge
  const restaurantCreditKobo = customerPaidServiceFee
    ? subtotalKobo
    : subtotalKobo - serviceChargeKobo;

  const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

  // Ensure wallet exists
  await supabase
    .from("restaurant_wallets")
    .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id" });

  // Build wallet transaction rows — only debit service charge when merchant bears the fee
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
      description: `Order #${order.order_number} — net revenue`,
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
    {
      restaurant_id: restaurantId,
      order_id: order.id,
      type: "logistics_fee",
      direction: "debit",
      amount_kobo: deliveryFeeKobo,
      status: "settled",
      description: `Delivery fee — Order #${order.order_number}`,
    },
  ];

  await supabase.from("wallet_transactions").insert(walletRows);

  // Update wallet pending_balance and total_earned
  await supabase.rpc("increment_wallet_pending", {
    p_restaurant_id: restaurantId,
    p_amount_kobo: restaurantCreditKobo,
  });

  // 10. Trigger SMS notifications via Edge Function (fire-and-forget)
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Customer confirmation SMS
  fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      restaurantId,
      phone: meta.customer_phone,
      eventType: "order_confirmed",
      orderId: order.id,
      orderNumber: order.order_number,
    }),
  }).catch(console.error);

  // Merchant new order SMS
  fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      restaurantId,
      eventType: "new_order_merchant",
      orderId: order.id,
      orderNumber: order.order_number,
    }),
  }).catch(console.error);

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
