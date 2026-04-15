import { createServiceClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const supabase = createServiceClient();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { count: totalMerchants },
    { count: newMerchants },
    { data: revenueData },
    { count: totalOrders },
    { data: platformFees },
    { data: logisticsFees },
    { count: pendingSettlements },
  ] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("payments")
      .select("amount_kobo")
      .eq("paystack_status", "success")
      .gte("paid_at", thirtyDaysAgo),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled"),
    supabase
      .from("orders")
      .select("service_fee_kobo")
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled"),
    supabase
      .from("wallet_transactions")
      .select("amount_kobo")
      .eq("type", "logistics_fee")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("settlements")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]),
  ]);

  const totalGmv = (revenueData ?? []).reduce(
    (sum: number, p: { amount_kobo: number | null }) => sum + (p.amount_kobo ?? 0),
    0
  );

  const totalPlatformRevenue = (platformFees ?? []).reduce(
    (sum: number, t: { service_fee_kobo: number | null }) => sum + (t.service_fee_kobo ?? 0),
    0
  );

  const totalLogisticsFees = (logisticsFees ?? []).reduce(
    (sum: number, t: { amount_kobo: number | null }) => sum + (t.amount_kobo ?? 0),
    0
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-black-900 mb-6">Platform Overview</h1>
      <p className="text-black-500 text-sm mb-6">Last 30 days</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <AdminMetric label="GMV" value={formatKobo(totalGmv)} />
        <AdminMetric label="Orders" value={(totalOrders ?? 0).toLocaleString()} />
        <AdminMetric
          label="Active Merchants"
          value={(totalMerchants ?? 0).toLocaleString()}
        />
        <AdminMetric
          label="New Merchants"
          value={(newMerchants ?? 0).toLocaleString()}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <AdminMetric label="Platform Revenue" value={formatKobo(totalPlatformRevenue)} />
        <AdminMetric label="Logistics Fees" value={formatKobo(totalLogisticsFees)} />
        <AdminMetric
          label="Pending Settlements"
          value={(pendingSettlements ?? 0).toLocaleString()}
        />
      </div>
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
      <p className="text-xs text-black-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-black-900 mt-1">{value}</p>
    </div>
  );
}
