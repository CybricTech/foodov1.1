import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyMonnifyTransaction, nairaToKobo } from "@/lib/monnify";
import { getPostHogClient } from "@/lib/posthog";

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref) return NextResponse.json({ error: "Missing ref" }, { status: 400 });

  const pid = request.nextUrl.searchParams.get("pid");
  const provider = request.nextUrl.searchParams.get("provider") === "paystack"
    ? "paystack"
    : "monnify";
  const isPaystack = provider === "paystack";
  const refColumn = isPaystack ? "paystack_ref" : "monnify_ref";
  const statusColumn = isPaystack ? "paystack_status" : "monnify_status";

  const supabase = createServiceClient();

  // ── Fast path: webhook already processed ─────────────────────────────────
  // Select both status columns so the rejected check works for either provider.
  let { data: payment } = await supabase
    .from("payments")
    .select("id, order_id, monnify_status, paystack_status, restaurant_id, metadata" as never)
    .eq(refColumn as never, ref)
    .maybeSingle();

  // ── Reference mismatch fallback (Monnify only) ────────────────────────────
  // The Monnify SDK can assign a different paymentReference than our pre-
  // generated ref. The pending page passes &pid=<paymentId> so we can look
  // up by DB id and patch monnify_ref. Paystack always uses our reference so
  // this fallback doesn't apply.
  if (!payment && pid && !isPaystack) {
    const { data: byId } = await supabase
      .from("payments")
      .select("id, order_id, monnify_status, paystack_status, restaurant_id, metadata" as never)
      .eq("id", pid)
      .maybeSingle();

    if (byId) {
      await supabase
        .from("payments")
        .update({ monnify_ref: ref } as never)
        .eq("id", pid);
      payment = byId;
    }
  }

  if (!payment) return NextResponse.json({ orderId: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentRow = payment as any;
  if (paymentRow.order_id) return NextResponse.json({ orderId: paymentRow.order_id });
  const currentStatus = isPaystack ? paymentRow.paystack_status : paymentRow.monnify_status;
  if (currentStatus === "rejected") {
    return NextResponse.json({ orderId: null, status: "rejected" });
  }

  // ── Webhook hasn't fired yet — verify with the gateway directly ──────────
  // This catches the race where the gateway redirects the customer back
  // before the webhook fires.
  let verifyChannel: string | undefined;
  let verifyFeesKobo: number | undefined;
  let verifyTxnRef: string | undefined;

  if (isPaystack) {
    try {
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );
      if (!verifyRes.ok) return NextResponse.json({ orderId: null });
      const vd = (await verifyRes.json()) as {
        data?: { status?: string; channel?: string; fees?: number };
      };
      const status = vd.data?.status;
      if (status === "failed" || status === "abandoned" || status === "reversed") {
        await supabase
          .from("payments")
          .update({ paystack_status: "rejected" } as never)
          .eq("id", paymentRow.id);
        return NextResponse.json({ orderId: null, status: "rejected" });
      }
      if (status !== "success") return NextResponse.json({ orderId: null });
      verifyChannel = vd.data?.channel;
      verifyFeesKobo = vd.data?.fees;
    } catch (err) {
      console.error("[status] Paystack verify failed:", err);
      getPostHogClient().captureException(err, undefined, { payment_provider: "paystack", ref });
      return NextResponse.json({ orderId: null });
    }
  } else {
    try {
      const verified = await verifyMonnifyTransaction(ref);
      if (!verified) {
        return NextResponse.json({ orderId: null });
      }
      const TERMINAL_FAILURES = ["FAILED", "EXPIRED", "REVERSED"];
      if (TERMINAL_FAILURES.includes(verified.paymentStatus)) {
        await supabase
          .from("payments")
          .update({ monnify_status: "rejected" } as never)
          .eq("id", paymentRow.id);
        return NextResponse.json({ orderId: null, status: "rejected" });
      }
      if (verified.paymentStatus !== "PAID") {
        return NextResponse.json({ orderId: null });
      }
      verifyChannel = verified.paymentMethod ?? undefined;
      verifyFeesKobo = verified.fee != null ? nairaToKobo(verified.fee) : undefined;
      verifyTxnRef = verified.transactionReference;
    } catch (err) {
      console.error("[status] Monnify verify failed:", err);
      getPostHogClient().captureException(err, undefined, { payment_provider: "monnify", ref });
      return NextResponse.json({ orderId: null });
    }
  }

  // ── Atomically claim processing rights ───────────────────────────────────
  // Only proceed if the payment is still "pending". If the webhook beat us
  // here it will have already flipped status → "success", so the conditional
  // update matches 0 rows and we fall through to re-check order_id.
  const claimMetadataPatch = isPaystack
    ? { paystack_channel: verifyChannel, paystack_fees: verifyFeesKobo }
    : {
        monnify_channel: verifyChannel,
        monnify_fees_kobo: verifyFeesKobo,
        monnify_transaction_reference: verifyTxnRef,
      };

  const claimPayload = {
    [statusColumn]: "success",
    paid_at: new Date().toISOString(),
    metadata: {
      ...((paymentRow.metadata as Record<string, unknown>) ?? {}),
      ...claimMetadataPatch,
    },
  } as unknown as Record<string, unknown>;

  const { data: claimed } = await supabase
    .from("payments")
    .update(claimPayload)
    .eq("id", paymentRow.id)
    .eq(statusColumn as never, "pending")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    // Webhook beat us to it — return whatever order_id it just set (may still be null
    // if it's mid-flight; the pending page will pick it up on the next poll).
    const { data: latest } = await supabase
      .from("payments")
      .select("order_id")
      .eq("id", paymentRow.id)
      .single();
    return NextResponse.json({ orderId: latest?.order_id ?? null });
  }

  // ── We own this payment — create the order now ────────────────────────────
  // Mirrors the webhook's SUCCESSFUL_TRANSACTION handler exactly. When the
  // Monnify webhook eventually fires it will find monnify_status="success" AND
  // order_id IS SET and return early (idempotency guard in the webhook route),
  // so nothing is duplicated.

  const meta = paymentRow.metadata as Record<string, unknown>;
  const restaurantId = paymentRow.restaurant_id;

  const orderPayload = {
    restaurant_id: restaurantId,
    payment_id: paymentRow.id,
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
    // Discount/loyalty are merchant-funded: they reduce total_kobo (what the
    // customer paid), which is what settlement nets off — so the merchant bears
    // the cost. Must mirror the webhooks; previously this path omitted the
    // discount and would have over-settled the merchant.
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
    order_number: `FD-${Date.now()}`,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderResult = await supabase
    .from("orders")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(orderPayload as any)
    .select("id, order_number")
    .single();

  if (orderResult.error || !orderResult.data) {
    console.error("[status] Order creation failed:", orderResult.error);
    if (orderResult.error) {
      getPostHogClient().captureException(orderResult.error, undefined, {
        context: "order_creation",
        restaurant_id: restaurantId,
      });
    }
    return NextResponse.json({ orderId: null });
  }

  const order = orderResult.data;

  // Order items
  const items = (meta.items as Array<{
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

  // ETA
  const menuItemIds = items.map((i) => i.menuItemId);
  const { data: menuItems } = await supabase
    .from("menu_items")
    .select("id, prep_time_minutes")
    .in("id", menuItemIds);
  const menuPrepMap = new Map(
    (menuItems ?? []).map((m) => [
      m.id,
      (m as unknown as { prep_time_minutes?: number | null }).prep_time_minutes ?? null,
    ])
  );
  const prepTimes = items
    .map((i) => menuPrepMap.get(i.menuItemId))
    .filter((p): p is number => p != null);
  const maxPrepMinutes = prepTimes.length > 0 ? Math.max(...prepTimes) : 20;
  // estimated_delivery_at is the "ready" time only — we no longer add a
  // delivery travel buffer because deliveries are handled by 3rd-party riders
  // whose timing we can't control. The customer is shown a ready estimate.
  const estimatedDeliveryAt = new Date(
    Date.now() + maxPrepMinutes * 60 * 1000
  ).toISOString();

  // ETA update + link payment → order (parallel, non-blocking for client response)
  await Promise.all([
    supabase
      .from("orders")
      .update({ estimated_delivery_at: estimatedDeliveryAt })
      .eq("id", order.id),
    supabase
      .from("payments")
      .update({ order_id: order.id })
      .eq("id", paymentRow.id),
  ]);

  // Accrue loyalty (earn + redeem) now that order_items exist.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.rpc as any)("loyalty_accrue_for_order", { p_order_id: order.id });

  // CRM
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

  // Save delivery address
  const deliveryAddress = (meta.delivery_address as string) || null;
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
        },
        { onConflict: "customer_id, address" }
      );
    }
  }

  // Wallet
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
            description: `Merchant charge (${(merchantChargePct * 100).toFixed(1)}%) on Order #${order.order_number}`,
          },
        ]
      : []),
  ];

  await supabase.from("wallet_transactions").insert(walletRows);
  await supabase.rpc("increment_wallet_pending", {
    p_restaurant_id: restaurantId,
    p_amount_kobo: restaurantCreditKobo,
  });

  // Notifications — fire-and-forget (must still be awaited before serverless exits)
  const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-sms`;
  const edgeEmailUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const restaurantName =
    (restaurantRow as unknown as { name?: string } | null)?.name ?? "Your Restaurant";
  const adminAlertEmail =
    (settings as unknown as { admin_alert_email?: string | null } | null)?.admin_alert_email ??
    null;

  let merchantEmail: string | null =
    (restaurantRow as unknown as { notification_email?: string | null } | null)
      ?.notification_email ?? null;
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

  const orderEmailProps = {
    restaurantName,
    orderNumber: order.order_number,
    customerName: meta.customer_name as string,
    customerPhone: meta.customer_phone as string,
    fulfillmentType: meta.fulfillment_type as "delivery" | "pickup",
    deliveryAddress: (meta.delivery_address as string) ?? null,
    specialInstructions: (meta.special_instructions as string) ?? null,
    items: metaItems.map((item) => ({
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
    })),
    subtotalKobo: meta.subtotal_kobo as number,
    deliveryFeeKobo: meta.delivery_fee_kobo as number,
    vatKobo: (meta.vat_kobo as number) || 0,
    serviceFeeKobo: (meta.service_fee_kobo as number) || 0,
    totalKobo,
    createdAt: new Date().toISOString(),
  };

  const notifications: Promise<unknown>[] = [
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

  if (merchantEmail) {
    notifications.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_merchant", to: merchantEmail, props: orderEmailProps }),
      }).catch(console.error)
    );
  }

  if (adminAlertEmail) {
    notifications.push(
      fetch(edgeEmailUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: "new_order_admin", to: adminAlertEmail, props: orderEmailProps }),
      }).catch(console.error)
    );
  }

  await Promise.allSettled(notifications);

  const posthog = getPostHogClient();
  const customerDistinctId = meta.customer_phone as string;
  posthog.identify({
    distinctId: customerDistinctId,
    properties: {
      $set: {
        name: meta.customer_name as string,
        phone: customerDistinctId,
        ...(meta.customer_email ? { email: meta.customer_email as string } : {}),
      },
    },
  });
  posthog.capture({
    distinctId: customerDistinctId,
    event: "order placed",
    properties: {
      order_id: order.id,
      order_number: order.order_number,
      restaurant_id: restaurantId,
      fulfillment_type: meta.fulfillment_type as string,
      item_count: (meta.items as unknown[]).length,
      subtotal_kobo: meta.subtotal_kobo as number,
      delivery_fee_kobo: meta.delivery_fee_kobo as number,
      vat_kobo: (meta.vat_kobo as number) || 0,
      service_fee_kobo: (meta.service_fee_kobo as number) || 0,
      total_kobo: totalKobo,
      payment_provider: isPaystack ? "paystack" : "monnify",
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ orderId: order.id });
}
