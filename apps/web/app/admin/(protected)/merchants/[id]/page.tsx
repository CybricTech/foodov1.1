import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { formatKobo } from "@foodo/utils";
import { MerchantOrdersClient } from "@/components/admin/merchant-orders-client";

export const dynamic = "force-dynamic";

export default async function MerchantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServiceClient();
  const { id } = params;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

  const [
    { data: restaurant },
    { data: wallet },
    { data: ordersThisMonth },
    { data: ordersLastMonth },
    { data: ordersAllTime },
    { data: topItems },
    { data: customers },
    { data: recentOrders },
    { data: walletTransactions },
    { data: recentSettlements },
  ] = await Promise.all([
    supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .single(),

    supabase
      .from("restaurant_wallets")
      .select("*")
      .eq("restaurant_id", id)
      .maybeSingle(),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled")
      .gte("created_at", startOfMonth),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled")
      .gte("created_at", startOfLastMonth)
      .lt("created_at", startOfMonth),

    supabase
      .from("orders")
      .select("id, total_kobo, status")
      .eq("restaurant_id", id)
      .neq("status", "cancelled"),

    supabase
      .from("order_items")
      .select("item_name, quantity")
      .eq("restaurant_id", id),

    supabase
      .from("customers")
      .select("phone, total_orders")
      .eq("restaurant_id", id),

    supabase
      .from("orders")
      .select(
        "id, order_number, status, fulfillment_type, customer_name, customer_phone, subtotal_kobo, vat_kobo, delivery_fee_kobo, total_kobo, created_at, delivery_distance_km"
      )
      .eq("restaurant_id", id)
      .gte("created_at", new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),

    supabase
      .from("wallet_transactions")
      .select("id, created_at, type, description, amount_kobo, direction, status")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("settlements")
      .select("id, amount_kobo, status, paid_at, created_at, paystack_transfer_ref")
      .eq("restaurant_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!restaurant) {
    redirect("/admin/merchants");
  }

  // Aggregate top items
  const itemCounts = new Map<string, number>();
  (topItems ?? []).forEach((item) => {
    itemCounts.set(item.item_name, (itemCounts.get(item.item_name) ?? 0) + item.quantity);
  });
  const topItemsList = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // KPIs
  const gmvThisMonth = (ordersThisMonth ?? []).reduce((s, o) => s + o.total_kobo, 0);
  const gmvLastMonth = (ordersLastMonth ?? []).reduce((s, o) => s + o.total_kobo, 0);
  const gmvAllTime = (ordersAllTime ?? []).reduce((s, o) => s + o.total_kobo, 0);
  const gmvGrowth =
    gmvLastMonth > 0 ? ((gmvThisMonth - gmvLastMonth) / gmvLastMonth) * 100 : null;

  const ordersThisMonthCount = (ordersThisMonth ?? []).length;
  const ordersLastMonthCount = (ordersLastMonth ?? []).length;
  const ordersAllTimeCount = (ordersAllTime ?? []).length;
  const ordersGrowth =
    ordersLastMonthCount > 0
      ? ((ordersThisMonthCount - ordersLastMonthCount) / ordersLastMonthCount) * 100
      : null;

  const avgOrderValue = ordersAllTimeCount > 0 ? gmvAllTime / ordersAllTimeCount : 0;

  const totalCustomers = (customers ?? []).length;
  const repeatCustomers = (customers ?? []).filter((c) => c.total_orders > 1).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

  const kitchynRevenue = (walletTransactions ?? [])
    .filter((t) => t.type === "service_charge" || t.type === "logistics_fee")
    .reduce((s, t) => s + t.amount_kobo, 0);

  const totalSettled = (recentSettlements ?? [])
    .filter((s) => s.status === "paid")
    .reduce((s, r) => s + r.amount_kobo, 0);

  const sinceDate = new Date(restaurant.created_at).toLocaleDateString("en-NG", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="p-6 pb-24 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-1 text-sm text-black-500 hover:text-black-900 transition-colors mb-3"
          >
            ← Back to Analytics
          </Link>
          <h1 className="text-2xl font-extrabold text-black-900">{restaurant.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                restaurant.is_active
                  ? "bg-viridian-100 text-viridian-600"
                  : "bg-cinnabar-100 text-cinnabar-500"
              }`}
            >
              {restaurant.is_active ? "Active" : "Inactive"}
            </span>
            {restaurant.city && (
              <span className="text-sm text-black-500">{restaurant.city}</span>
            )}
            <span className="text-sm text-black-400">· Since {sinceDate}</span>
          </div>
        </div>
        <Link
          href={`/${restaurant.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple-500 hover:text-purple-400 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-xl transition-colors"
        >
          View storefront ↗
        </Link>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="GMV This Month"
          value={formatKobo(gmvThisMonth)}
          growth={gmvGrowth}
          sub={`vs ${formatKobo(gmvLastMonth)} last month`}
        />
        <KpiCard
          label="Orders This Month"
          value={ordersThisMonthCount.toLocaleString()}
          growth={ordersGrowth}
          sub={`vs ${ordersLastMonthCount} last month`}
        />
        <KpiCard
          label="Avg Order Value"
          value={formatKobo(avgOrderValue)}
          sub={`${ordersAllTimeCount} orders lifetime`}
        />
        <KpiCard
          label="Kitchyn Revenue"
          value={formatKobo(kitchynRevenue)}
          sub="service charges + logistics"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Customers"
          value={totalCustomers.toLocaleString()}
          sub="unique lifetime"
        />
        <KpiCard
          label="Repeat Rate"
          value={`${repeatRate.toFixed(1)}%`}
          sub={`${repeatCustomers} of ${totalCustomers} customers`}
        />
        <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
          <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">Wallet Balance</p>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-black-400">Available</span>
              <span className="text-sm font-bold text-black-900">
                {formatKobo(wallet?.available_balance_kobo ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-black-400">Pending</span>
              <span className="text-sm font-semibold text-black-600">
                {formatKobo(wallet?.pending_balance_kobo ?? 0)}
              </span>
            </div>
          </div>
        </div>
        <KpiCard
          label="Total Settled"
          value={formatKobo(wallet?.total_withdrawn_kobo ?? totalSettled)}
          sub="lifetime payouts"
        />
      </div>

      {/* Orders Table */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Orders</h2>
        <MerchantOrdersClient initialOrders={recentOrders ?? []} />
      </section>

      {/* Wallet & Settlements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wallet Transactions */}
        <section>
          <h2 className="text-base font-bold text-black-900 mb-3">Recent Wallet Transactions</h2>
          <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
            {(walletTransactions ?? []).length === 0 ? (
              <p className="text-sm text-black-400 px-5 py-10 text-center">No transactions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black-100 bg-black-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Dir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(walletTransactions ?? []).map((t) => (
                      <tr key={t.id} className="border-b border-black-100 last:border-0">
                        <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                          {new Date(t.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <WalletTypeBadge type={t.type} />
                        </td>
                        <td className="px-4 py-3 text-xs text-black-500 max-w-[160px] truncate" title={t.description ?? ""}>
                          {t.description ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-black-900 whitespace-nowrap text-xs">
                          {formatKobo(t.amount_kobo)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`text-sm font-bold ${
                              t.direction === "credit" ? "text-viridian-600" : "text-cinnabar-500"
                            }`}
                          >
                            {t.direction === "credit" ? "↑" : "↓"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Settlements */}
        <section>
          <h2 className="text-base font-bold text-black-900 mb-3">Recent Settlements</h2>
          <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
            {(recentSettlements ?? []).length === 0 ? (
              <p className="text-sm text-black-400 px-5 py-10 text-center">No settlements yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-black-100 bg-black-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Paid At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentSettlements ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-black-100 last:border-0">
                        <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-black-900 text-xs whitespace-nowrap">
                          {formatKobo(s.amount_kobo)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <SettlementStatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-black-500 max-w-[120px] truncate" title={s.paystack_transfer_ref ?? ""}>
                          {s.paystack_transfer_ref ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                          {s.paid_at
                            ? new Date(s.paid_at).toLocaleDateString("en-NG", {
                                day: "numeric",
                                month: "short",
                              })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Merchant Info */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Merchant Info</h2>
        <div className="bg-white rounded-2xl border border-black-200 px-5 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoRow label="Slug" value={`/${restaurant.slug}`} mono />
          <InfoRow
            label="WhatsApp"
            value={restaurant.whatsapp_number ?? "Not configured"}
            muted={!restaurant.whatsapp_number}
          />
          <InfoRow
            label="Notification Email"
            value={restaurant.notification_email ?? "Not configured"}
            muted={!restaurant.notification_email}
          />
          <InfoRow
            label="Bank Account"
            value={
              restaurant.bank_account_name && restaurant.bank_account_number
                ? `${restaurant.bank_account_name} ···${restaurant.bank_account_number.slice(-4)}`
                : "Not configured"
            }
            muted={!restaurant.bank_account_name}
          />
          <InfoRow
            label="Paystack Recipient"
            value={restaurant.paystack_recipient_code ?? "Not configured"}
            muted={!restaurant.paystack_recipient_code}
            mono={!!restaurant.paystack_recipient_code}
          />
          <InfoRow label="Logistics Mode" value={restaurant.logistics_default ?? "—"} />
          <InfoRow
            label="Location"
            value={
              restaurant.latitude && restaurant.longitude
                ? `${restaurant.latitude}, ${restaurant.longitude}`
                : "Not configured"
            }
            muted={!restaurant.latitude}
            warn={!restaurant.latitude}
          />
        </div>
      </section>

      {/* Top Items */}
      {topItemsList.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-black-900 mb-3">Top Menu Items</h2>
          <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
            {topItemsList.map(([name, count], i) => (
              <div
                key={name}
                className="flex items-center gap-4 px-5 py-3 border-b border-black-100 last:border-0"
              >
                <span className="text-sm font-bold text-purple-500 w-5 flex-shrink-0">{i + 1}</span>
                <p className="flex-1 text-sm text-black-900">{name}</p>
                <span className="text-sm font-semibold text-black-500">{count} ordered</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  growth,
}: {
  label: string;
  value: string;
  sub?: string;
  growth?: number | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
      <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-extrabold text-black-900 mt-1">{value}</p>
      {growth != null ? (
        <p
          className={`text-xs mt-0.5 font-medium ${
            growth >= 0 ? "text-viridian-600" : "text-cinnabar-500"
          }`}
        >
          {growth >= 0 ? "+" : ""}
          {growth.toFixed(1)}% vs last month
        </p>
      ) : growth === null && sub ? (
        <p className="text-xs text-black-400 mt-0.5">{sub}</p>
      ) : sub ? (
        <p className="text-xs text-black-400 mt-0.5">{sub}</p>
      ) : null}
    </div>
  );
}

const WALLET_TYPE_STYLES: Record<string, string> = {
  order_credit: "bg-viridian-100 text-viridian-700",
  service_charge: "bg-cinnabar-100 text-cinnabar-600",
  logistics_fee: "bg-cinnabar-100 text-cinnabar-600",
  settlement_debit: "bg-purple-100 text-purple-700",
  manual_adjustment: "bg-black-100 text-black-600",
};

const WALLET_TYPE_LABELS: Record<string, string> = {
  order_credit: "Order Credit",
  service_charge: "Service Charge",
  logistics_fee: "Logistics Fee",
  settlement_debit: "Settlement",
  manual_adjustment: "Adjustment",
};

function WalletTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        WALLET_TYPE_STYLES[type] ?? "bg-black-100 text-black-600"
      }`}
    >
      {WALLET_TYPE_LABELS[type] ?? type}
    </span>
  );
}

const SETTLEMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-dixie-100 text-dixie-700",
  processing: "bg-purple-100 text-purple-700",
  paid: "bg-viridian-100 text-viridian-700",
  failed: "bg-cinnabar-100 text-cinnabar-600",
};

function SettlementStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        SETTLEMENT_STATUS_STYLES[status] ?? "bg-black-100 text-black-600"
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function InfoRow({
  label,
  value,
  mono,
  muted,
  warn,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">{label}</p>
      <p
        className={`text-sm ${
          warn
            ? "text-dixie-600 font-medium"
            : muted
            ? "text-black-400"
            : "text-black-900"
        } ${mono ? "font-mono" : ""}`}
      >
        {value}
        {warn && " ⚠"}
      </p>
    </div>
  );
}
