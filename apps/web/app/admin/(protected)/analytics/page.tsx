import { createServiceClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const supabase = createServiceClient();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: payments },
    { data: orders },
    { count: cancelledCount },
    { data: restaurants },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select("amount_kobo, restaurant_id")
      .eq("paystack_status", "success")
      .gte("paid_at", thirtyDaysAgo),

    supabase
      .from("orders")
      .select("restaurant_id, total_kobo, status")
      .gte("created_at", thirtyDaysAgo),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled")
      .gte("created_at", thirtyDaysAgo),

    supabase
      .from("restaurants")
      .select("id, name, slug")
      .eq("is_active", true),
  ]);

  const allOrders = orders ?? [];
  const allPayments = payments ?? [];
  const restaurantMap = new Map(
    (restaurants ?? []).map((r) => [r.id, r.name])
  );

  const totalGmv = allPayments.reduce(
    (sum, p) => sum + (p.amount_kobo ?? 0),
    0
  );
  const totalOrders = allOrders.filter((o) => o.status !== "cancelled").length;
  const cancellationRate =
    allOrders.length > 0
      ? ((cancelledCount ?? 0) / allOrders.length) * 100
      : 0;

  // Revenue per merchant
  const revenueByMerchant = new Map<string, number>();
  allPayments.forEach((p) => {
    const id = p.restaurant_id as string;
    revenueByMerchant.set(id, (revenueByMerchant.get(id) ?? 0) + (p.amount_kobo ?? 0));
  });

  // Orders per merchant
  const ordersByMerchant = new Map<string, number>();
  allOrders
    .filter((o) => o.status !== "cancelled")
    .forEach((o) => {
      const id = o.restaurant_id as string;
      ordersByMerchant.set(id, (ordersByMerchant.get(id) ?? 0) + 1);
    });

  const topMerchants = [...revenueByMerchant.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, revenue]) => ({
      id,
      name: restaurantMap.get(id) ?? "Unknown",
      revenue,
      orders: ordersByMerchant.get(id) ?? 0,
    }));

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Analytics</h1>
        <p className="text-white/40 text-sm mt-1">Last 30 days · Platform-wide</p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <AdminMetric label="GMV" value={formatKobo(totalGmv)} />
        <AdminMetric label="Orders" value={totalOrders.toLocaleString()} />
        <AdminMetric
          label="Active Merchants"
          value={(restaurants?.length ?? 0).toLocaleString()}
        />
        <AdminMetric
          label="Cancellation Rate"
          value={`${cancellationRate.toFixed(1)}%`}
        />
      </div>

      {/* Merchant breakdown */}
      <div className="bg-white/5 rounded-card border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <h2 className="font-bold text-white text-sm">Top Merchants by Revenue</h2>
        </div>

        {topMerchants.length === 0 && (
          <p className="text-white/30 text-sm px-4 py-8 text-center">No revenue data yet</p>
        )}

        {topMerchants.map((m, i) => {
          const share = totalGmv > 0 ? (m.revenue / totalGmv) * 100 : 0;
          return (
            <div
              key={m.id}
              className="flex items-center gap-4 px-4 py-3 border-b border-white/10 last:border-0"
            >
              <span className="text-sm font-bold text-primary w-5 flex-shrink-0">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{m.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/30 w-8 text-right flex-shrink-0">
                    {share.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-white">{formatKobo(m.revenue)}</p>
                <p className="text-xs text-white/40">{m.orders} orders</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-card border border-white/10 px-4 py-4">
      <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-extrabold text-white mt-1">{value}</p>
    </div>
  );
}
