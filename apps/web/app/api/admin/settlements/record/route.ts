import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return null;

  return { user, serviceClient };
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurant_id, period_date, bank_reference, receipt_url } = body as {
    restaurant_id?: string;
    period_date?: string;
    bank_reference?: string;
    receipt_url?: string;
  };

  if (!restaurant_id || !period_date || !bank_reference) {
    return NextResponse.json(
      { error: "restaurant_id, period_date, and bank_reference are required" },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_date)) {
    return NextResponse.json({ error: "period_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const { data: settings, error: settingsErr } = await auth.serviceClient
    .from("platform_settings")
    .select("merchant_charge_pct, delivery_commission_pct")
    .single();

  if (settingsErr || !settings) {
    return NextResponse.json({ error: "Failed to load platform settings" }, { status: 500 });
  }

  // WAT = UTC+1
  const dayStart = `${period_date}T00:00:00+01:00`;
  const dayEnd = `${period_date}T23:59:59.999+01:00`;

  const { data: existing } = await auth.serviceClient
    .from("settlements")
    .select("id")
    .eq("restaurant_id", restaurant_id)
    .eq("period_date", period_date)
    .eq("settlement_type", "manual")
    .neq("status", "failed")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A manual settlement already exists for this restaurant and date" },
      { status: 409 }
    );
  }

  const { data: unsettledOrders, error: ordersErr } = await auth.serviceClient
    .from("orders")
    .select("id, subtotal_kobo, vat_kobo, delivery_fee_kobo, service_fee_kobo, total_kobo")
    .eq("restaurant_id", restaurant_id)
    .is("settlement_id", null)
    .neq("status", "cancelled")
    .neq("status", "pending")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  if (!unsettledOrders || unsettledOrders.length === 0) {
    return NextResponse.json(
      { error: "No unsettled orders found for this restaurant on the given date" },
      { status: 404 }
    );
  }

  const orderCount = unsettledOrders.length;
  const merchantChargePct = Number(settings.merchant_charge_pct ?? 0.01);
  let grossTotal = 0;
  let totalDeliveryFee = 0;
  let merchantChargeTotal = 0;

  for (const o of unsettledOrders) {
    const orderTotal = o.total_kobo ?? (
      (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0) + (o.service_fee_kobo ?? 0)
    );
    grossTotal += (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
    totalDeliveryFee += o.delivery_fee_kobo ?? 0;
    merchantChargeTotal += Math.round(orderTotal * merchantChargePct);
  }

  const deliveryCommission = Math.round(totalDeliveryFee * settings.delivery_commission_pct);
  const netPayout = grossTotal - merchantChargeTotal - deliveryCommission;

  const now = new Date().toISOString();

  const { data: settlement, error: insertErr } = await auth.serviceClient
    .from("settlements")
    .insert({
      restaurant_id,
      settlement_type: "manual",
      status: "paid",
      amount_kobo: netPayout,
      bank_reference,
      receipt_url: receipt_url ?? null,
      recorded_by: auth.user.id,
      period_date,
      order_count: orderCount,
      gross_total_kobo: grossTotal,
      service_fee_total_kobo: 0,
      merchant_charge_total_kobo: merchantChargeTotal,
      delivery_commission_kobo: deliveryCommission,
      initiated_at: now,
      paid_at: now,
    })
    .select("id")
    .single();

  if (insertErr || !settlement) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to create settlement" }, { status: 500 });
  }

  const orderIds = unsettledOrders.map((o) => o.id);
  const { error: lockErr } = await auth.serviceClient
    .from("orders")
    .update({ settlement_id: settlement.id })
    .in("id", orderIds);

  if (lockErr) {
    return NextResponse.json({ error: lockErr.message }, { status: 500 });
  }

  // Create settlement_debit wallet transaction
  await auth.serviceClient.from("wallet_transactions").insert({
    restaurant_id,
    settlement_id: settlement.id,
    type: "settlement_debit",
    direction: "debit",
    amount_kobo: netPayout,
    status: "settled",
    description: `Settlement paid — ${orderCount} order${orderCount !== 1 ? "s" : ""} · Ref: ${bank_reference}`,
  });

  // Debit the wallet: decrement pending_balance_kobo, increment total_withdrawn_kobo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (auth.serviceClient.rpc as any)("debit_wallet_for_settlement", {
    p_restaurant_id: restaurant_id,
    p_amount_kobo: netPayout,
  });

  await auth.serviceClient.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "manual_settlement_recorded",
    target_type: "settlement",
    target_id: settlement.id,
    metadata: {
      restaurant_id,
      period_date,
      bank_reference,
      order_count: orderCount,
      gross_total_kobo: grossTotal,
      merchant_charge_total_kobo: merchantChargeTotal,
      delivery_commission_kobo: deliveryCommission,
      net_payout_kobo: netPayout,
    },
  });

  return NextResponse.json({
    settlement_id: settlement.id,
    restaurant_id,
    period_date,
    bank_reference,
    order_count: orderCount,
    gross_total_kobo: grossTotal,
    merchant_charge_total_kobo: merchantChargeTotal,
    delivery_commission_kobo: deliveryCommission,
    net_payout_kobo: netPayout,
  });
}
