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

function ngn(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "orders" ? "orders" : "summary";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: "from and to query params required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // WAT = UTC+1 day bounds
  const fromISO = `${from}T00:00:00+01:00`;
  const toISO = `${to}T23:59:59.999+01:00`;

  let csv: string;

  if (type === "summary") {
    const { data, error } = await auth.serviceClient.rpc("finance_summary", {
      p_from: fromISO,
      p_to: toISO,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const s = data?.[0];
    if (!s) return NextResponse.json({ error: "No data for range" }, { status: 404 });

    const header = [
      "From",
      "To",
      "Orders",
      "GMV (NGN)",
      "Avg Order Value (NGN)",
      "Service Fees (NGN)",
      "Merchant Charge (NGN)",
      "Delivery Margin (NGN)",
      "Net Revenue (NGN)",
      "Gateway Fees (NGN)",
      "Kitchyn Net (NGN)",
      "Take Rate (%)",
      "VAT Collected (NGN)",
      "Merchant-funded Discounts (NGN)",
      "Refund Count",
      "Refunds (NGN)",
    ].join(",");
    const row = [
      from,
      to,
      String(s.order_count),
      ngn(s.gmv_kobo),
      ngn(s.avg_order_value_kobo),
      ngn(s.service_fees_kobo),
      ngn(s.merchant_charge_kobo),
      ngn(s.delivery_margin_kobo),
      ngn(s.net_revenue_kobo),
      ngn(s.gateway_fees_kobo),
      ngn(s.foodo_net_kobo),
      (s.take_rate * 100).toFixed(2),
      ngn(s.vat_collected_kobo),
      ngn(s.discounts_kobo),
      String(s.refund_count),
      ngn(s.refunds_kobo),
    ].join(",");
    csv = [header, row].join("\n");
  } else {
    const { data, error } = await auth.serviceClient.rpc("finance_order_economics", {
      p_from: fromISO,
      p_to: toISO,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No orders in range" }, { status: 404 });
    }

    const header = [
      "Order ID",
      "Date (WAT)",
      "Merchant",
      "Status",
      "Payment Status",
      "Dispatch Type",
      "Fulfillment",
      "Order Total (NGN)",
      "Service Fee (NGN)",
      "Merchant Charge (NGN)",
      "Delivery Margin (NGN)",
      "Gateway Fee (NGN)",
      "Kitchyn Net (NGN)",
      "Platform Delivery Pending",
    ].join(",");
    const rows = data.map((o) =>
      [
        o.order_id,
        o.wat_date,
        escapeCSV(o.restaurant_name),
        o.status,
        o.payment_status,
        o.dispatch_type ?? "",
        o.fulfillment_type ?? "",
        ngn(o.order_total_kobo),
        ngn(o.service_fee_kobo),
        ngn(o.merchant_charge_kobo),
        ngn(o.delivery_margin_kobo),
        ngn(o.gateway_fee_kobo),
        ngn(o.foodo_net_kobo),
        o.platform_delivery_pending ? "yes" : "no",
      ].join(",")
    );
    csv = [header, ...rows].join("\n");
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="kitchyn-finance-${type}-${from}-${to}.csv"`,
    },
  });
}
