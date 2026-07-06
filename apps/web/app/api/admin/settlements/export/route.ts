import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { resolveDeliveryCommissionPct } from "@foodo/utils";
import {
  summarizeSettlement,
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

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date query param required (YYYY-MM-DD)" }, { status: 400 });
  }

  const { data: settings, error: settingsErr } = await auth.serviceClient
    .from("platform_settings")
    .select("merchant_charge_pct, delivery_commission_pct")
    .single();

  if (settingsErr || !settings) {
    return NextResponse.json({ error: "Failed to load platform settings" }, { status: 500 });
  }

  // WAT = UTC+1
  const dayStart = `${date}T00:00:00+01:00`;
  const dayEnd = `${date}T23:59:59.999+01:00`;

  const { data: orders, error: ordersErr } = await auth.serviceClient
    .from("orders")
    .select(
      `
      id,
      restaurant_id,
      subtotal_kobo,
      vat_kobo,
      delivery_fee_kobo,
      service_fee_kobo,
      total_kobo,
      dispatch_type,
      fulfillment_type,
      delivery_assignments (dispatch_type),
      restaurants (name, bank_account_name, bank_account_number, bank_code, logistics_default, delivery_commission_pct)
    ` as never
    )
    .is("settlement_id", null)
    .neq("status", "cancelled")
    .neq("status", "pending")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd);

  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "No unsettled orders found for this date" }, { status: 404 });
  }

  type ExportOrderRow = RawSettlementOrder & {
    restaurant_id: string;
    restaurants: {
      name: string;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_code: string | null;
      logistics_default: string | null;
      delivery_commission_pct: number | null;
    } | null;
  };

  // Group by restaurant, then compute each group with the SINGLE canonical
  // settlement formula (dispatch-aware, per-merchant commission rate) — the
  // exact math the record route and the payout cron use. The CSV must never
  // disagree with the amount that would actually be paid.
  const grouped: Record<string, ExportOrderRow[]> = {};
  for (const o of orders as unknown as ExportOrderRow[]) {
    (grouped[o.restaurant_id] ??= []).push(o);
  }

  const merchantChargePct = Number(settings.merchant_charge_pct ?? 0.01);

  const header = [
    "Restaurant",
    "Bank Account Name",
    "Bank Account Number",
    "Bank Code",
    "Order Count",
    "Gross Total (NGN)",
    "Merchant Charge (NGN)",
    "Delivery Commission (NGN)",
    "Commission Rate",
    "Net Payout (NGN)",
  ].join(",");

  const rows = Object.values(grouped).map((groupOrders) => {
    const restaurant = groupOrders[0].restaurants;
    const deliveryCommissionPct = resolveDeliveryCommissionPct(
      restaurant?.delivery_commission_pct,
      settings.delivery_commission_pct
    );
    const { computed } = summarizeSettlement(
      groupOrders,
      restaurant?.logistics_default ?? null,
      { merchantChargePct, deliveryCommissionPct }
    );

    return [
      escapeCSV(restaurant?.name ?? "Unknown"),
      escapeCSV(restaurant?.bank_account_name ?? ""),
      escapeCSV(restaurant?.bank_account_number ?? ""),
      escapeCSV(restaurant?.bank_code ?? ""),
      String(computed.orderCount),
      (computed.grossTotal / 100).toFixed(2),
      (computed.merchantChargeTotal / 100).toFixed(2),
      (computed.deliveryCommissionTotal / 100).toFixed(2),
      `${(deliveryCommissionPct * 100).toFixed(1)}%`,
      (computed.netPayout / 100).toFixed(2),
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="foodo-payout-${date}.csv"`,
    },
  });
}
