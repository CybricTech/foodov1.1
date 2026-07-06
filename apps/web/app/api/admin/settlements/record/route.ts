import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";
import { resolveDeliveryCommissionPct } from "@foodo/utils";
import {
  summarizeSettlement,
  SETTLEMENT_ORDER_COLUMNS,
  type RawSettlementOrder,
} from "@/lib/settlements/build-settlement";

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

  // Logistics default resolves dispatch_type for any order that wasn't
  // explicitly dispatched; delivery_commission_pct is the merchant's negotiated
  // override of the platform rate (mirrors the admin/wallet UIs exactly).
  const { data: restaurantLogistics } = await auth.serviceClient
    .from("restaurants")
    .select("logistics_default, delivery_commission_pct" as never)
    .eq("id", restaurant_id)
    .single();

  const { data: unsettledOrdersRaw, error: ordersErr } = await auth.serviceClient
    .from("orders")
    .select(SETTLEMENT_ORDER_COLUMNS)
    .eq("restaurant_id", restaurant_id)
    .is("settlement_id", null)
    .neq("status", "cancelled")
    .neq("status", "pending")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  if (!unsettledOrdersRaw || unsettledOrdersRaw.length === 0) {
    return NextResponse.json(
      { error: "No unsettled orders found for this restaurant on the given date" },
      { status: 404 }
    );
  }

  const restaurantRates = restaurantLogistics as {
    logistics_default: string | null;
    delivery_commission_pct: number | null;
  } | null;
  const logisticsDefault = restaurantRates?.logistics_default ?? null;

  const feeSettings = {
    merchantChargePct: Number(settings.merchant_charge_pct ?? 0.01),
    deliveryCommissionPct: resolveDeliveryCommissionPct(
      restaurantRates?.delivery_commission_pct,
      settings.delivery_commission_pct
    ),
  };

  // Resolve dispatch_type per order + compute the payout with the SINGLE
  // canonical formula shared by every settlement surface (manual + automated).
  // This guarantees the recorded amount (which drives the bank transfer) equals
  // what the admin preview, the merchant wallet, and the cron all show.
  const { orders: unsettledOrders, computed } = summarizeSettlement(
    unsettledOrdersRaw as unknown as RawSettlementOrder[],
    logisticsDefault,
    feeSettings
  );

  const orderCount = computed.orderCount;
  const grossTotal = computed.grossTotal;
  const merchantChargeTotal = computed.merchantChargeTotal;
  const deliveryCommission = computed.deliveryCommissionTotal;
  const netPayout = computed.netPayout;

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
      service_fee_total_kobo: computed.serviceFeeTotal,
      merchant_charge_total_kobo: merchantChargeTotal,
      delivery_commission_kobo: deliveryCommission,
      // canonical_net_kobo == amount_kobo for new settlements: the recorded
      // figure IS the canonical figure. They only diverge for legacy records
      // written before the formula was unified (see migration 059).
      canonical_net_kobo: netPayout,
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

  // Mark the order_credit txns linked to those orders as settled
  // so the Activity feed shows them as "Paid" instead of "Pending".
  await auth.serviceClient
    .from("wallet_transactions")
    .update({ status: "settled" })
    .in("order_id", orderIds)
    .eq("type", "order_credit");

  // Re-derive the wallet counters from the source of truth (orders + paid
  // settlements) rather than incrementally mutating them — this is what keeps
  // pending_balance / total_withdrawn / total_earned permanently consistent
  // with the settlement records and the order ledger.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (auth.serviceClient.rpc as any)("recompute_restaurant_wallet", {
    p_restaurant_id: restaurant_id,
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
      delivery_commission_pct_applied: feeSettings.deliveryCommissionPct,
      net_payout_kobo: netPayout,
    },
  });

  // Fire-and-forget payout confirmation email to merchant
  const { data: restaurantRow } = await auth.serviceClient
    .from("restaurants")
    .select("name, notification_email")
    .eq("id", restaurant_id)
    .single();

  const notificationEmail = (restaurantRow as unknown as Record<string, unknown>)?.notification_email as string | null;

  if (notificationEmail) {
    fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template: "settlement_payout",
          to: notificationEmail,
          props: {
            restaurantName: restaurantRow?.name ?? "Restaurant",
            periodDate: period_date,
            orderCount,
            grossTotalKobo: grossTotal,
            netPayoutKobo: netPayout,
            bankReference: bank_reference,
            settlementId: settlement.id,
          },
        }),
      }
    ).catch(console.error);
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: auth.user.id,
    event: "settlement recorded",
    properties: {
      settlement_id: settlement.id,
      restaurant_id,
      period_date,
      order_count: orderCount,
      gross_total_kobo: grossTotal,
      net_payout_kobo: netPayout,
      merchant_charge_total_kobo: merchantChargeTotal,
      delivery_commission_kobo: deliveryCommission,
    },
  });
  await posthog.shutdown();

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
