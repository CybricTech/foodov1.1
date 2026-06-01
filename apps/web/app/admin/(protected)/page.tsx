import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";
import { SystemHealthWidget } from "@/components/admin/system-health-widget";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createServiceClient();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartISO = todayStart.toISOString();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const ACTIVE_STATUSES = [
    "pending",
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "assigned_to_rider",
    "in_transit",
  ];

  const [
    // today
    { data: todayPayments },
    { count: todayOrders },
    { count: activeOrders },
    // 30-day
    { data: revenueData },
    { count: totalOrders },
    { count: cancelledOrders30d },
    { data: platformFees },
    { data: logisticsFees },
    // platform status
    { count: totalMerchants },
    { count: newMerchants },
    { count: pendingSettlements },
  ] = await Promise.all([
    // Today's GMV
    supabase
      .from("payments")
      .select("amount_kobo")
      .or("paystack_status.eq.success,monnify_status.eq.success")
      .gte("paid_at", todayStartISO),

    // Today's orders (non-cancelled)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStartISO)
      .neq("status", "cancelled"),

    // Active orders right now (in-flight)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ACTIVE_STATUSES),

    // 30-day GMV
    supabase
      .from("payments")
      .select("amount_kobo")
      .or("paystack_status.eq.success,monnify_status.eq.success")
      .gte("paid_at", thirtyDaysAgo),

    // 30-day orders (non-cancelled)
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled"),

    // 30-day cancelled orders — for cancellation rate
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .eq("status", "cancelled"),

    // 30-day platform revenue (service fees)
    supabase
      .from("orders")
      .select("service_fee_kobo")
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled"),

    // 30-day logistics fees
    supabase
      .from("wallet_transactions")
      .select("amount_kobo")
      .eq("type", "logistics_fee")
      .gte("created_at", thirtyDaysAgo),

    // Active merchants (all-time)
    supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    // New merchants (last 30d)
    supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),

    // Pending settlements — matches settlements page: pending + processing
    supabase
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]),
  ]);

  const todayGmv = (todayPayments ?? []).reduce(
    (sum: number, p: { amount_kobo: number | null }) => sum + (p.amount_kobo ?? 0),
    0
  );

  const totalGmv30d = (revenueData ?? []).reduce(
    (sum: number, p: { amount_kobo: number | null }) => sum + (p.amount_kobo ?? 0),
    0
  );

  const totalPlatformRevenue = (
    (platformFees ?? []) as Array<{ service_fee_kobo: number | null }>
  ).reduce((sum, t) => sum + (t.service_fee_kobo ?? 0), 0);

  const totalLogisticsFees = (logisticsFees ?? []).reduce(
    (sum: number, t: { amount_kobo: number | null }) => sum + (t.amount_kobo ?? 0),
    0
  );

  const orders30d = totalOrders ?? 0;
  const cancelled30d = cancelledOrders30d ?? 0;
  const totalPlaced30d = orders30d + cancelled30d;
  const cancellationRate =
    totalPlaced30d > 0
      ? ((cancelled30d / totalPlaced30d) * 100).toFixed(1)
      : "0.0";

  const avgOrderValue =
    orders30d > 0 ? formatKobo(Math.round(totalGmv30d / orders30d)) : "—";

  return (
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Platform Overview</h1>
        <p className="text-black-500 text-sm mt-1">Live snapshot · {now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      {/* Today */}
      <section>
        <SectionHeader label="Today" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AdminMetric label="GMV Today" value={formatKobo(todayGmv)} />
          <AdminMetric
            label="Orders Today"
            value={(todayOrders ?? 0).toLocaleString()}
          />
          <AdminMetric
            label="Active Orders"
            value={(activeOrders ?? 0).toLocaleString()}
            sub="in-flight right now"
            accent={activeOrders ? "purple" : undefined}
          />
        </div>
      </section>

      {/* 30-day performance */}
      <section>
        <SectionHeader label="Last 30 Days" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AdminMetric label="GMV" value={formatKobo(totalGmv30d)} />
          <AdminMetric
            label="Orders"
            value={orders30d.toLocaleString()}
          />
          <AdminMetric
            label="Platform Revenue"
            value={formatKobo(totalPlatformRevenue)}
          />
          <AdminMetric
            label="Logistics Fees"
            value={formatKobo(totalLogisticsFees)}
          />
        </div>
      </section>

      {/* Platform status */}
      <section>
        <SectionHeader label="Platform Status" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AdminMetric
            label="Active Merchants"
            value={(totalMerchants ?? 0).toLocaleString()}
          />
          <AdminMetric
            label="New Merchants"
            value={(newMerchants ?? 0).toLocaleString()}
            sub="last 30 days"
          />
          <AdminMetric
            label="Avg Order Value"
            value={avgOrderValue}
            sub="last 30 days"
          />
          <AdminMetric
            label="Cancellation Rate"
            value={`${cancellationRate}%`}
            sub="last 30 days"
            accent={parseFloat(cancellationRate) > 15 ? "red" : undefined}
          />
        </div>
      </section>

      {/* Actionable */}
      <section>
        <SectionHeader label="Requires Attention" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/admin/settlements" className="block hover:opacity-90 transition-opacity">
            <AdminMetric
              label="Pending Settlements"
              value={(pendingSettlements ?? 0).toLocaleString()}
              sub="pending + processing · click to manage"
              accent={(pendingSettlements ?? 0) > 0 ? "purple" : undefined}
            />
          </Link>
          <Link href="/admin/disputes" className="block hover:opacity-90 transition-opacity">
            <AdminMetric
              label="Cancelled Orders (30d)"
              value={cancelled30d.toLocaleString()}
              sub="click to review disputes"
              accent={cancelled30d > 0 ? "red" : undefined}
            />
          </Link>
        </div>
      </section>

      {/* System health */}
      <section>
        <SectionHeader label="Infrastructure" />
        <SystemHealthWidget />
      </section>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-black-500 uppercase tracking-widest mb-3">
      {label}
    </p>
  );
}

function AdminMetric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "purple" | "red";
}) {
  const valueColor =
    accent === "purple"
      ? "text-purple-600"
      : accent === "red"
        ? "text-cinnabar-600"
        : "text-black-900";

  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
      <p className="text-xs text-black-500 font-medium">{label}</p>
      <p className={`text-xl font-extrabold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-black-400 mt-0.5">{sub}</p>}
    </div>
  );
}
