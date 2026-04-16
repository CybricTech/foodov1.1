import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";
import { DeliveryFilters } from "@/components/admin/delivery-filters";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { restaurant?: string; status?: string; period?: string; from?: string; to?: string };
}) {
  const supabase = createServiceClient();
  const restaurantFilter = searchParams.restaurant ?? null;
  const statusFilter = searchParams.status ?? null;
  const period = searchParams.period ?? null;
  const customFrom = searchParams.from ?? null;
  const customTo = searchParams.to ?? null;

  // Resolve date range from period param
  function periodToRange(): { gte: string | null; lte: string | null } {
    const now = new Date();
    if (period === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { gte: start.toISOString(), lte: null };
    }
    if (period === "week") {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Monday
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      return { gte: start.toISOString(), lte: null };
    }
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { gte: start.toISOString(), lte: null };
    }
    if (period === "custom") {
      const gte = customFrom ? new Date(customFrom).toISOString() : null;
      const lte = customTo
        ? new Date(new Date(customTo).setHours(23, 59, 59, 999)).toISOString()
        : null;
      return { gte, lte };
    }
    return { gte: null, lte: null }; // all time
  }

  const dateRange = periodToRange();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: payments },
    { data: orders },
    { count: cancelledCount },
    { data: restaurants },
    { data: deliveries },
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

    // Delivery breakdown — filtered, newest first, capped at 200
    (() => {
      let q = supabase
        .from("orders")
        .select(
          "id, order_number, delivery_address, delivery_fee_kobo, delivery_distance_km, total_kobo, created_at, restaurant_id, status"
        )
        .eq("fulfillment_type", "delivery")
        .order("created_at", { ascending: false })
        .limit(200);
      if (restaurantFilter) q = q.eq("restaurant_id", restaurantFilter);
      if (statusFilter) q = q.eq("status", statusFilter);
      if (dateRange.gte) q = q.gte("created_at", dateRange.gte);
      if (dateRange.lte) q = q.lte("created_at", dateRange.lte);
      return q;
    })(),
  ]);

  const allOrders = orders ?? [];
  const allPayments = payments ?? [];
  const allDeliveries = (deliveries ?? []) as Array<{
    id: string;
    order_number: string;
    delivery_address: string | null;
    delivery_fee_kobo: number;
    delivery_distance_km: number | null;
    total_kobo: number;
    created_at: string;
    restaurant_id: string;
    status: string;
  }>;
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

  // Delivery stats
  const totalDeliveryCount = allDeliveries.filter(
    (d) => d.status !== "cancelled"
  ).length;
  const totalDeliveryFees = allDeliveries
    .filter((d) => d.status !== "cancelled")
    .reduce((sum, d) => sum + (d.delivery_fee_kobo ?? 0), 0);

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
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Analytics</h1>
        <p className="text-black-500 text-sm mt-1">Last 30 days · Platform-wide</p>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

      {/* Delivery summary */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Deliveries</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <AdminMetric
            label="Total Deliveries"
            value={totalDeliveryCount.toLocaleString()}
            sub="all time"
          />
          <AdminMetric
            label="Total Delivery Fees"
            value={formatKobo(totalDeliveryFees)}
            sub="all time"
          />
        </div>

        {/* Delivery breakdown table */}
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-black-100">
            <h3 className="font-bold text-black-900 text-sm">Delivery Breakdown</h3>
            <p className="text-xs text-black-400 mt-0.5">Most recent 200 · filtered server-side</p>
          </div>
          <DeliveryFilters
            restaurants={(restaurants ?? []).map((r) => ({ id: r.id, name: r.name }))}
            totalCount={allDeliveries.length}
          />

          {allDeliveries.length === 0 ? (
            <p className="text-black-400 text-sm px-5 py-10 text-center">No deliveries yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black-100 bg-black-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Order</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Merchant</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Delivery address</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Distance</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Fee charged</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {allDeliveries.map((d) => (
                    <tr key={d.id} className="border-b border-black-100 last:border-0 hover:bg-black-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-black-700 whitespace-nowrap">
                        {d.order_number}
                      </td>
                      <td className="px-5 py-3 text-black-700 whitespace-nowrap">
                        {restaurantMap.get(d.restaurant_id) ?? <span className="text-black-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-black-600 max-w-xs truncate" title={d.delivery_address ?? ""}>
                        {d.delivery_address ?? <span className="text-black-400">—</span>}
                      </td>
                      <td className="px-5 py-3 text-black-500 whitespace-nowrap">
                        {d.delivery_distance_km != null
                          ? `${Number(d.delivery_distance_km).toFixed(1)} km`
                          : <span className="text-black-300">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-black-900 whitespace-nowrap">
                        {d.delivery_fee_kobo > 0
                          ? formatKobo(d.delivery_fee_kobo)
                          : <span className="text-viridian-600 font-medium">Free</span>
                        }
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-5 py-3 text-black-400 text-xs whitespace-nowrap">
                        {new Date(d.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Merchant breakdown */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Top Merchants by Revenue</h2>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {topMerchants.length === 0 && (
            <p className="text-black-400 text-sm px-4 py-8 text-center">No revenue data yet</p>
          )}
          {topMerchants.map((m, i) => {
            const share = totalGmv > 0 ? (m.revenue / totalGmv) * 100 : 0;
            return (
              <Link
                href={`/admin/merchants/${m.id}`}
                key={m.id}
                className="flex items-center gap-4 px-5 py-3 border-b border-black-100 last:border-0 hover:bg-purple-50 transition-colors cursor-pointer"
              >
                <span className="text-sm font-bold text-purple-500 w-5 flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-black-900 truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-black-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="text-xs text-black-400 w-8 text-right flex-shrink-0">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-black-900">{formatKobo(m.revenue)}</p>
                  <p className="text-xs text-black-400">{m.orders} orders</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AdminMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
      <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-extrabold text-black-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-black-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending:          "bg-dixie-100 text-dixie-700",
  confirmed:        "bg-purple-50 text-purple-700",
  preparing:        "bg-purple-100 text-purple-700",
  ready_for_pickup: "bg-viridian-100 text-viridian-700",
  assigned_to_rider:"bg-viridian-100 text-viridian-700",
  in_transit:       "bg-purple-100 text-purple-700",
  delivered:        "bg-black-100 text-black-600",
  cancelled:        "bg-cinnabar-100 text-cinnabar-600",
};

const STATUS_LABELS: Record<string, string> = {
  pending:          "Pending",
  confirmed:        "Confirmed",
  preparing:        "Preparing",
  ready_for_pickup: "Ready",
  assigned_to_rider:"Assigned",
  in_transit:       "In transit",
  delivered:        "Delivered",
  cancelled:        "Cancelled",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-black-100 text-black-600"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
