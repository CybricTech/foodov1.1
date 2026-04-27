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
      restaurants (name, bank_account_name, bank_account_number, bank_code)
    `
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

  // Group by restaurant
  const grouped: Record<
    string,
    {
      name: string;
      bankAccountName: string;
      bankAccountNumber: string;
      bankCode: string;
      orderCount: number;
      grossTotal: number;
      totalDeliveryFee: number;
      merchantChargeTotal: number;
    }
  > = {};

  const merchantChargePct = Number(settings.merchant_charge_pct ?? 0.01);
  const commissionPct = settings.delivery_commission_pct;

  for (const o of orders) {
    const rid = o.restaurant_id;
    const restaurant = o.restaurants as {
      name: string;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_code: string | null;
    } | null;

    if (!grouped[rid]) {
      grouped[rid] = {
        name: restaurant?.name ?? "Unknown",
        bankAccountName: restaurant?.bank_account_name ?? "",
        bankAccountNumber: restaurant?.bank_account_number ?? "",
        bankCode: restaurant?.bank_code ?? "",
        orderCount: 0,
        grossTotal: 0,
        totalDeliveryFee: 0,
        merchantChargeTotal: 0,
      };
    }

    const orderTotal = o.total_kobo ?? (
      (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0) + (o.service_fee_kobo ?? 0)
    );

    grouped[rid].orderCount++;
    grouped[rid].grossTotal +=
      (o.subtotal_kobo ?? 0) + (o.vat_kobo ?? 0) + (o.delivery_fee_kobo ?? 0);
    grouped[rid].totalDeliveryFee += o.delivery_fee_kobo ?? 0;
    grouped[rid].merchantChargeTotal += Math.round(orderTotal * merchantChargePct);
  }

  const header = [
    "Restaurant",
    "Bank Account Name",
    "Bank Account Number",
    "Bank Code",
    "Order Count",
    "Gross Total (NGN)",
    "Merchant Charge (NGN)",
    "Delivery Commission (NGN)",
    "Net Payout (NGN)",
  ].join(",");

  const rows = Object.values(grouped).map((g) => {
    const deliveryCommission = Math.round(g.totalDeliveryFee * commissionPct);
    const netPayout = g.grossTotal - g.merchantChargeTotal - deliveryCommission;

    return [
      escapeCSV(g.name),
      escapeCSV(g.bankAccountName),
      escapeCSV(g.bankAccountNumber),
      escapeCSV(g.bankCode),
      String(g.orderCount),
      (g.grossTotal / 100).toFixed(2),
      (g.merchantChargeTotal / 100).toFixed(2),
      (deliveryCommission / 100).toFixed(2),
      (netPayout / 100).toFixed(2),
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
