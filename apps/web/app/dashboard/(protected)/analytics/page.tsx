import { createServerClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id")
    .eq("id", user!.id)
    .single();

  const restaurantId = profile!.restaurant_id!;

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [{ data: orders }, { data: newCustomers }, { data: topItems }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("total_kobo, status, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo)
        .neq("status", "cancelled"),

      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .gte("first_order_at", thirtyDaysAgo),

      supabase
        .from("order_items")
        .select("item_name, quantity")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", thirtyDaysAgo),
    ]);

  const totalRevenue = (orders ?? []).reduce(
    (sum, o) => sum + (o.total_kobo ?? 0),
    0
  );
  const totalOrders = orders?.length ?? 0;
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Top 5 items by quantity
  const itemCounts = new Map<string, number>();
  (topItems ?? []).forEach((i) => {
    itemCounts.set(
      i.item_name,
      (itemCounts.get(i.item_name) ?? 0) + i.quantity
    );
  });
  const top5 = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="md:p-6 pb-24">
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4">
        <h1 className="font-bold text-black-900 text-lg">Analytics</h1>
        <p className="text-sm text-black-400">Last 30 days</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 mt-4 px-4 md:px-0">
        <MetricCard label="Revenue" value={formatKobo(totalRevenue)} />
        <MetricCard label="Orders" value={totalOrders.toLocaleString()} />
        <MetricCard label="Avg Order" value={formatKobo(Math.round(aov))} />
        <MetricCard
          label="New Customers"
          value={(newCustomers ?? 0).toLocaleString()}
        />
      </div>

      {/* Top items */}
      <div className="mt-4 px-4 md:px-0 bg-white md:rounded-2xl md:border border-b border-black-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-black-100">
          <h2 className="font-semibold text-black-900 text-sm">
            Top 5 items
          </h2>
        </div>
        {top5.length === 0 && (
          <p className="text-sm text-black-400 px-4 py-6 text-center">
            No data yet
          </p>
        )}
        {top5.map(([name, count], i) => (
          <div
            key={name}
            className="flex items-center gap-3 px-4 py-3 border-b border-black-50 last:border-0"
          >
            <span className="text-sm text-black-400 w-5">{i + 1}</span>
            <span className="flex-1 text-sm text-black-900">{name}</span>
            <span className="text-sm font-semibold text-black-900">
              {count} sold
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black-100 px-4 py-4">
      <p className="text-xs text-black-400 font-medium">{label}</p>
      <p className="text-xl font-bold text-black-900 mt-1">{value}</p>
    </div>
  );
}
