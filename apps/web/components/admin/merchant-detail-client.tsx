"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import { MerchantOrdersClient } from "@/components/admin/merchant-orders-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Order = {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal_kobo: number;
  vat_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  created_at: string;
  delivery_distance_km: number | null;
};

type WalletTransaction = {
  id: string;
  created_at: string;
  type: string;
  description: string | null;
  amount_kobo: number;
  direction: string;
  status: string;
};

type Settlement = {
  id: string;
  amount_kobo: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  paystack_transfer_ref: string | null;
  monnify_disbursement_reference?: string | null;
};

type Customer = {
  id: string;
  phone: string;
  full_name: string | null;
  total_orders: number;
  total_spent_kobo: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  is_active: boolean;
  whatsapp_number: string | null;
  notification_email: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  paystack_recipient_code: string | null;
  logistics_default: string | null;
  latitude: number | null;
  longitude: number | null;
  max_delivery_radius_km: number | null;
  restaurant_base_fee_kobo: number | null;
  restaurant_per_km_rate_kobo: number | null;
  restaurant_max_fee_kobo: number | null;
  created_at: string;
};

type Wallet = {
  available_balance_kobo: number;
  pending_balance_kobo: number;
  total_withdrawn_kobo: number;
} | null;

export type AgreementFeeTerms = {
  legal_status?: string;
  commission_pct?: number | null;
  subscription_fee_ngn?: number | null;
  free_period_start?: string | null;
  free_period_end?: string | null;
  delivery_modes?: string | null;
  inhouse_commission_pct?: number | null;
  settlement_cycle_days?: number | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  prep_time_minutes?: number | null;
  effective_date?: string | null;
};

export type AgreementRow = {
  id: string;
  restaurant_id: string;
  status: string;
  template_version: string;
  legal_name: string | null;
  rc_number: string | null;
  fee_terms: AgreementFeeTerms;
  merchant_signed_at: string | null;
  countersigned_at: string | null;
  created_at: string;
  updated_at: string;
};

type KpiData = {
  gmvThisMonth: number;
  gmvLastMonth: number;
  gmvGrowth: number | null;
  ordersThisMonthCount: number;
  ordersLastMonthCount: number;
  ordersAllTimeCount: number;
  ordersGrowth: number | null;
  avgOrderValue: number;
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  kitchynRevenue: number;
  totalSettled: number;
};

export type MerchantDetailClientProps = {
  restaurant: Restaurant;
  wallet: Wallet;
  kpi: KpiData;
  recentOrders: Order[];
  walletTransactions: WalletTransaction[];
  recentSettlements: Settlement[];
  customers: Customer[];
  topItemsList: [string, number][];
  agreement: AgreementRow | null;
};

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
  { key: "financials", label: "Financials" },
  { key: "agreement", label: "Agreement" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function MerchantDetailClient({
  restaurant,
  wallet,
  kpi,
  recentOrders,
  walletTransactions,
  recentSettlements,
  customers,
  topItemsList,
  agreement,
}: MerchantDetailClientProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(
    (TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "overview")
  );

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.key
                ? "bg-purple-500 text-white"
                : "text-black-500 hover:bg-black-50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          kpi={kpi}
          wallet={wallet}
          topItemsList={topItemsList}
        />
      )}
      {activeTab === "orders" && (
        <OrdersTab recentOrders={recentOrders} />
      )}
      {activeTab === "customers" && (
        <CustomersTab customers={customers} />
      )}
      {activeTab === "financials" && (
        <FinancialsTab
          walletTransactions={walletTransactions}
          recentSettlements={recentSettlements}
        />
      )}
      {activeTab === "agreement" && (
        <AgreementTab restaurant={restaurant} initialAgreement={agreement} />
      )}
      {activeTab === "settings" && (
        <SettingsTab restaurant={restaurant} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview Tab                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({
  kpi,
  wallet,
  topItemsList,
}: {
  kpi: KpiData;
  wallet: Wallet;
  topItemsList: [string, number][];
}) {
  return (
    <div className="space-y-8">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="GMV This Month"
          value={formatKobo(kpi.gmvThisMonth)}
          growth={kpi.gmvGrowth}
          sub={`vs ${formatKobo(kpi.gmvLastMonth)} last month`}
        />
        <KpiCard
          label="Orders This Month"
          value={kpi.ordersThisMonthCount.toLocaleString()}
          growth={kpi.ordersGrowth}
          sub={`vs ${kpi.ordersLastMonthCount} last month`}
        />
        <KpiCard
          label="Avg Order Value"
          value={formatKobo(kpi.avgOrderValue)}
          sub={`${kpi.ordersAllTimeCount} orders lifetime`}
        />
        <KpiCard
          label="Kitchyn Revenue"
          value={formatKobo(kpi.kitchynRevenue)}
          sub="service charges + logistics"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Customers"
          value={kpi.totalCustomers.toLocaleString()}
          sub="unique lifetime"
        />
        <KpiCard
          label="Repeat Rate"
          value={`${kpi.repeatRate.toFixed(1)}%`}
          sub={`${kpi.repeatCustomers} of ${kpi.totalCustomers} customers`}
        />
        <div className="bg-white rounded-2xl border border-black-200 px-4 py-4">
          <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">
            Wallet Balance
          </p>
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
          value={formatKobo(wallet?.total_withdrawn_kobo ?? kpi.totalSettled)}
          sub="lifetime payouts"
        />
      </div>

      {/* Top Items */}
      {topItemsList.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-black-900 mb-3">
            Top Menu Items
          </h2>
          <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
            {topItemsList.map(([name, count], i) => (
              <div
                key={name}
                className="flex items-center gap-4 px-5 py-3 border-b border-black-100 last:border-0"
              >
                <span className="text-sm font-bold text-purple-500 w-5 flex-shrink-0">
                  {i + 1}
                </span>
                <p className="flex-1 text-sm text-black-900">{name}</p>
                <span className="text-sm font-semibold text-black-500">
                  {count} ordered
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Orders Tab                                                         */
/* ------------------------------------------------------------------ */

function OrdersTab({ recentOrders }: { recentOrders: Order[] }) {
  return (
    <section>
      <h2 className="text-base font-bold text-black-900 mb-3">Orders</h2>
      <MerchantOrdersClient initialOrders={recentOrders} />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Customers Tab — Types                                              */
/* ------------------------------------------------------------------ */

type CustomerOrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  item_price_kobo: number;
  line_total_kobo: number;
  selected_options: Record<string, string> | null;
};

type CustomerOrder = {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal_kobo: number;
  vat_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
  total_kobo: number;
  created_at: string;
  delivery_address: string | null;
  special_instructions: string | null;
  payment_status: string;
  order_items: CustomerOrderItem[];
};

/* ------------------------------------------------------------------ */
/*  Customers Tab — Status Badges                                      */
/* ------------------------------------------------------------------ */

const ORDER_STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-purple-50 text-purple-700",
  preparing: "bg-dixie-100 text-dixie-700",
  ready_for_pickup: "bg-orange-100 text-orange-700",
  in_transit: "bg-purple-100 text-purple-700",
  delivered: "bg-viridian-100 text-viridian-700",
  cancelled: "bg-cinnabar-100 text-cinnabar-600",
  pending: "bg-black-100 text-black-500",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  pending: "Pending",
};

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        ORDER_STATUS_STYLES[status] ?? "bg-black-100 text-black-600"
      )}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "🚗 Delivery",
  pickup: "🏪 Pickup",
  dine_in: "🍽️ Dine In",
};

/* ------------------------------------------------------------------ */
/*  Customers Tab — Main                                               */
/* ------------------------------------------------------------------ */

function CustomersTab({ customers }: { customers: Customer[] }) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  const handleBack = useCallback(() => setSelectedCustomer(null), []);

  if (selectedCustomer) {
    return (
      <CustomerDetailView
        customer={selectedCustomer}
        onBack={handleBack}
      />
    );
  }

  return (
    <section aria-label="Customer list">
      <h2 className="text-base font-bold text-black-900 mb-3">Customers</h2>
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        {customers.length === 0 ? (
          <p className="text-sm text-black-400 px-5 py-10 text-center">
            No customers yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="border-b border-black-100 bg-black-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Total Orders
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Total Spent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Last Order
                  </th>
                  <th className="px-4 py-3 w-8" aria-label="View details" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View orders for ${c.full_name ?? "Unknown"}`}
                    onClick={() => setSelectedCustomer(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedCustomer(c);
                      }
                    }}
                    className="border-b border-black-100 last:border-0 hover:bg-purple-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-xs font-medium text-black-700 whitespace-nowrap">
                      {c.full_name ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-xs text-black-500 whitespace-nowrap">
                      {c.phone}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-black-900 whitespace-nowrap">
                      {c.total_orders}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-black-900 whitespace-nowrap">
                      {formatKobo(c.total_spent_kobo)}
                    </td>
                    <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                      {c.last_order_at
                        ? new Date(c.last_order_at).toLocaleDateString(
                            "en-NG",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }
                          )
                        : "---"}
                    </td>
                    <td className="px-4 py-3 text-black-300 group-hover:text-purple-500 transition-colors">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Customer Detail View                                               */
/* ------------------------------------------------------------------ */

function CustomerDetailView({
  customer,
  onBack,
}: {
  customer: Customer;
  onBack: () => void;
}) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetch(`/api/admin/customers/${customer.id}/orders`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load orders");
        return res.json();
      })
      .then((data: { orders: CustomerOrder[] }) => {
        if (!cancelled) {
          setOrders(data.orders);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customer.id]);

  const toggleOrder = useCallback((orderId: string) => {
    setExpandedOrder((prev) => (prev === orderId ? null : orderId));
  }, []);

  const avgOrderValue =
    customer.total_orders > 0
      ? Math.round(customer.total_spent_kobo / customer.total_orders)
      : 0;

  return (
    <section aria-label={`Customer profile: ${customer.full_name ?? "Unknown"}`}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-black-500 hover:text-black-900 transition-colors mb-4 group"
        aria-label="Back to customers list"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-hover:-translate-x-0.5 transition-transform"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to customers
      </button>

      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-black-200 px-5 py-5 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-black-900">
              {customer.full_name ?? "Unknown"}
            </h2>
            <p className="text-sm text-black-400 mt-0.5">{customer.phone}</p>
          </div>
          <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full text-xs font-medium">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            Customer
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">
              Member Since
            </p>
            <p className="text-sm font-semibold text-black-900">
              {new Date(customer.created_at).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">
              Total Orders
            </p>
            <p className="text-sm font-semibold text-black-900">
              {customer.total_orders}
            </p>
          </div>
          <div>
            <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">
              Total Spent
            </p>
            <p className="text-sm font-semibold text-black-900">
              {formatKobo(customer.total_spent_kobo)}
            </p>
          </div>
          <div>
            <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">
              Avg Order Value
            </p>
            <p className="text-sm font-semibold text-black-900">
              {formatKobo(avgOrderValue)}
            </p>
          </div>
        </div>
      </div>

      {/* Order history */}
      <h3 className="text-base font-bold text-black-900 mb-3">
        Order History
      </h3>

      {loading ? (
        <div className="bg-white rounded-2xl border border-black-200 px-5 py-10 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-black-400">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading orders…
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-cinnabar-200 px-5 py-10 text-center">
          <p className="text-sm text-cinnabar-500">{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black-200 px-5 py-10 text-center">
          <p className="text-sm text-black-400">No orders found</p>
        </div>
      ) : (
        <div className="space-y-3" role="list" aria-label="Order history">
          {orders.map((order) => {
            const isExpanded = expandedOrder === order.id;
            const nameChanged =
              order.customer_name &&
              customer.full_name &&
              order.customer_name !== customer.full_name;

            return (
              <div
                key={order.id}
                role="listitem"
                className="bg-white rounded-xl border border-black-200 overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Collapsed row */}
                <button
                  onClick={() => toggleOrder(order.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`order-details-${order.id}`}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-black-900">
                        #{order.order_number}
                      </span>
                      <OrderStatusBadge status={order.status} />
                      <span className="text-xs text-black-400">
                        {FULFILLMENT_LABELS[order.fulfillment_type] ??
                          order.fulfillment_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-black-400">
                        {new Date(order.created_at).toLocaleDateString(
                          "en-NG",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </span>
                      {nameChanged && (
                        <span className="text-xs text-dixie-600 bg-dixie-50 px-1.5 py-0.5 rounded">
                          Ordered as: {order.customer_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-black-900 whitespace-nowrap">
                    {formatKobo(order.total_kobo)}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      "text-black-300 transition-transform flex-shrink-0",
                      isExpanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div
                    id={`order-details-${order.id}`}
                    className="border-t border-black-100"
                  >
                    {/* Order items */}
                    <div className="px-4 py-3 bg-black-50/60">
                      <p className="text-xs font-semibold text-black-500 uppercase tracking-wide mb-2">
                        Items
                      </p>
                      <div className="space-y-2">
                        {order.order_items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-black-800">
                                <span className="font-medium">
                                  {item.quantity}×
                                </span>{" "}
                                {item.item_name}
                              </p>
                              {item.selected_options &&
                                Object.keys(item.selected_options).length >
                                  0 && (
                                  <p className="text-xs text-black-400 mt-0.5">
                                    {Object.entries(item.selected_options)
                                      .map(
                                        ([key, val]) => `${key}: ${val}`
                                      )
                                      .join(", ")}
                                  </p>
                                )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-medium text-black-900">
                                {formatKobo(item.line_total_kobo)}
                              </p>
                              {item.quantity > 1 && (
                                <p className="text-xs text-black-400">
                                  {formatKobo(item.item_price_kobo)} each
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price breakdown */}
                    <div className="px-4 py-3 border-t border-black-100">
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-black-500">
                          <span>Subtotal</span>
                          <span>{formatKobo(order.subtotal_kobo)}</span>
                        </div>
                        {order.vat_kobo > 0 && (
                          <div className="flex justify-between text-black-500">
                            <span>VAT</span>
                            <span>{formatKobo(order.vat_kobo)}</span>
                          </div>
                        )}
                        {order.service_fee_kobo > 0 && (
                          <div className="flex justify-between text-black-500">
                            <span>Service Fee</span>
                            <span>{formatKobo(order.service_fee_kobo)}</span>
                          </div>
                        )}
                        {order.delivery_fee_kobo > 0 && (
                          <div className="flex justify-between text-black-500">
                            <span>Delivery Fee</span>
                            <span>{formatKobo(order.delivery_fee_kobo)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-black-900 pt-1 border-t border-black-100">
                          <span>Total</span>
                          <span>{formatKobo(order.total_kobo)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Extra info */}
                    {(order.delivery_address ||
                      order.special_instructions) && (
                      <div className="px-4 py-3 border-t border-black-100 space-y-2">
                        {order.delivery_address && (
                          <div>
                            <p className="text-xs font-medium text-black-400 uppercase tracking-wide">
                              Delivery Address
                            </p>
                            <p className="text-sm text-black-700 mt-0.5">
                              {order.delivery_address}
                            </p>
                          </div>
                        )}
                        {order.special_instructions && (
                          <div>
                            <p className="text-xs font-medium text-black-400 uppercase tracking-wide">
                              Special Instructions
                            </p>
                            <p className="text-sm text-black-700 mt-0.5 italic">
                              {order.special_instructions}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Financials Tab                                                     */
/* ------------------------------------------------------------------ */

function FinancialsTab({
  walletTransactions,
  recentSettlements,
}: {
  walletTransactions: WalletTransaction[];
  recentSettlements: Settlement[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Wallet Transactions */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">
          Recent Wallet Transactions
        </h2>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {walletTransactions.length === 0 ? (
            <p className="text-sm text-black-400 px-5 py-10 text-center">
              No transactions yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black-100 bg-black-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Dir
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {walletTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-black-100 last:border-0"
                    >
                      <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <WalletTypeBadge type={t.type} />
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-black-500 max-w-[160px] truncate"
                        title={t.description ?? ""}
                      >
                        {t.description ?? "---"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-black-900 whitespace-nowrap text-xs">
                        {formatKobo(t.amount_kobo)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            t.direction === "credit"
                              ? "text-viridian-600"
                              : "text-cinnabar-500"
                          )}
                        >
                          {t.direction === "credit" ? "+" : "-"}
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
        <h2 className="text-base font-bold text-black-900 mb-3">
          Recent Settlements
        </h2>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {recentSettlements.length === 0 ? (
            <p className="text-sm text-black-400 px-5 py-10 text-center">
              No settlements yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black-100 bg-black-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Ref
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">
                      Paid At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentSettlements.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-black-100 last:border-0"
                    >
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
                      <td
                        className="px-4 py-3 text-xs font-mono text-black-500 max-w-[120px] truncate"
                        title={s.monnify_disbursement_reference ?? s.paystack_transfer_ref ?? ""}
                      >
                        {s.monnify_disbursement_reference ?? s.paystack_transfer_ref ?? "---"}
                      </td>
                      <td className="px-4 py-3 text-xs text-black-400 whitespace-nowrap">
                        {s.paid_at
                          ? new Date(s.paid_at).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                            })
                          : "---"}
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
  );
}

/* ------------------------------------------------------------------ */
/*  Settings Tab                                                       */
/* ------------------------------------------------------------------ */

function SlugEditForm({ restaurant }: { restaurant: Restaurant }) {
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(restaurant.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/merchants/slug", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save");
      } else {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  if (editing) {
    return (
      <div>
        <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">Slug</p>
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <span className="text-sm text-black-400 font-mono">/</span>
          <input
            className="text-sm font-mono border border-black-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            autoFocus
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !slug.trim()}
            className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setSlug(restaurant.slug); setError(""); }}
            className="text-xs text-black-400 hover:text-black-700 px-2 py-1.5"
          >
            Cancel
          </button>
        </form>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">Slug</p>
      <div className="flex items-center gap-2">
        <p className="text-sm font-mono text-black-900">/{slug}</p>
        {saved && <span className="text-xs text-green-600">Saved</span>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-primary-600 hover:underline"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function SettingsTab({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">Merchant Info</h2>
        <div className="bg-white rounded-2xl border border-black-200 px-5 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SlugEditForm restaurant={restaurant} />
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
                ? `${restaurant.bank_account_name} ...${restaurant.bank_account_number.slice(-4)}`
                : "Not configured"
            }
            muted={!restaurant.bank_account_name}
          />
          <InfoRow
            label="Payout Gateway"
            value={
              restaurant.paystack_recipient_code
                ? `Paystack: ${restaurant.paystack_recipient_code}`
                : restaurant.bank_account_number
                  ? "Monnify (bank verified)"
                  : "Not configured"
            }
            muted={!restaurant.paystack_recipient_code && !restaurant.bank_account_number}
            mono={!!restaurant.paystack_recipient_code}
          />
          <InfoRow
            label="Logistics Mode"
            value={restaurant.logistics_default ?? "---"}
          />
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

      <MerchantDeliveryPricingForm restaurant={restaurant} />
    </div>
  );
}

function MerchantDeliveryPricingForm({ restaurant }: { restaurant: Restaurant }) {
  const toNgn = (kobo: number | null) => (kobo != null ? String(Math.round(kobo / 100)) : "");

  const [baseFeeNgn, setBaseFeeNgn] = useState(toNgn(restaurant.restaurant_base_fee_kobo));
  const [perKmNgn, setPerKmNgn] = useState(toNgn(restaurant.restaurant_per_km_rate_kobo));
  const [maxFeeNgn, setMaxFeeNgn] = useState(toNgn(restaurant.restaurant_max_fee_kobo));
  const [maxRadius, setMaxRadius] = useState(
    restaurant.max_delivery_radius_km != null ? String(restaurant.max_delivery_radius_km) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function previewFee(km: number): string {
    const base = parseFloat(baseFeeNgn) || 0;
    const rate = parseFloat(perKmNgn) || 0;
    const cap = parseFloat(maxFeeNgn) || 999999;
    const fee = Math.min(base + km * rate, cap);
    return `₦${fee.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/merchants/delivery-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          restaurant_base_fee_kobo: baseFeeNgn ? Math.round(parseFloat(baseFeeNgn) * 100) : null,
          restaurant_per_km_rate_kobo: perKmNgn ? Math.round(parseFloat(perKmNgn) * 100) : null,
          restaurant_max_fee_kobo: maxFeeNgn ? Math.round(parseFloat(maxFeeNgn) * 100) : null,
          max_delivery_radius_km: maxRadius ? parseInt(maxRadius) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <section>
      <h2 className="text-base font-bold text-black-900 mb-3">Delivery Pricing</h2>
      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-black-100">
          <p className="text-xs text-black-400">
            Override delivery pricing for this merchant. Leave blank to use the platform default.
            Formula: Base fee + (distance × per-km rate), capped at max fee.
          </p>
        </div>
        <form onSubmit={handleSave} className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Base fee (₦)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={baseFeeNgn}
                onChange={(e) => setBaseFeeNgn(e.target.value)}
                placeholder="Platform default"
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Per km rate (₦/km)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={perKmNgn}
                onChange={(e) => setPerKmNgn(e.target.value)}
                placeholder="Platform default"
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Max fee cap (₦)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={maxFeeNgn}
                onChange={(e) => setMaxFeeNgn(e.target.value)}
                placeholder="Platform default"
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-black-500 mb-1">Max radius (km)</label>
              <input
                type="number"
                step="1"
                min="1"
                max="100"
                value={maxRadius}
                onChange={(e) => setMaxRadius(e.target.value)}
                placeholder="Platform default"
                className="w-full px-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {(baseFeeNgn || perKmNgn) && (
            <div className="bg-black-50 rounded-xl px-4 py-3 text-xs text-black-500">
              <span className="font-medium text-black-700">Preview: </span>
              at 3km → {previewFee(3)} &nbsp;|&nbsp;
              at 7km → {previewFee(7)} &nbsp;|&nbsp;
              at 15km → {previewFee(15)}
            </div>
          )}

          {error && <p className="text-xs text-cinnabar-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save delivery pricing"}
          </button>
        </form>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Sub-components                                              */
/* ------------------------------------------------------------------ */

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
      <p className="text-xs text-black-500 font-semibold uppercase tracking-wide">
        {label}
      </p>
      <p className="text-xl font-extrabold text-black-900 mt-1">{value}</p>
      {growth != null ? (
        <p
          className={cn(
            "text-xs mt-0.5 font-medium",
            growth >= 0 ? "text-viridian-600" : "text-cinnabar-500"
          )}
        >
          {growth >= 0 ? "+" : ""}
          {growth.toFixed(1)}% vs last month
        </p>
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
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        WALLET_TYPE_STYLES[type] ?? "bg-black-100 text-black-600"
      )}
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
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        SETTLEMENT_STATUS_STYLES[status] ?? "bg-black-100 text-black-600"
      )}
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
      <p className="text-xs text-black-400 font-medium uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p
        className={cn(
          "text-sm",
          warn
            ? "text-dixie-600 font-medium"
            : muted
              ? "text-black-400"
              : "text-black-900",
          mono && "font-mono"
        )}
      >
        {value}
        {warn && " !"}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agreement Tab                                                      */
/* ------------------------------------------------------------------ */

const AGREEMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-black-100 text-black-500" },
  sent: { label: "Awaiting merchant", className: "bg-purple-100 text-purple-600" },
  merchant_signed: { label: "Awaiting countersign", className: "bg-dixie-100 text-dixie-600" },
  completed: { label: "Completed", className: "bg-viridian-100 text-viridian-600" },
  declined: { label: "Declined", className: "bg-cinnabar-100 text-cinnabar-600" },
  expired: { label: "Expired", className: "bg-black-100 text-black-400" },
  voided: { label: "Voided", className: "bg-black-100 text-black-400" },
};

const CAN_REGENERATE = new Set(["voided", "declined", "expired"]);

function AgreementTab({
  restaurant,
  initialAgreement,
}: {
  restaurant: Restaurant;
  initialAgreement: AgreementRow | null;
}) {
  const [agreement, setAgreement] = useState<AgreementRow | null>(initialAgreement);
  const [signLinks, setSignLinks] = useState<{ merchant: string | null; kitchyn: string | null }>({
    merchant: null,
    kitchyn: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!agreement) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/agreements/${agreement.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to refresh status");
      } else {
        setAgreement(data.agreement);
        setSignLinks({ merchant: data.merchant_sign_url ?? null, kitchyn: data.kitchyn_sign_url ?? null });
      }
    } catch {
      setError("Network error");
    }
    setBusy(false);
  }, [agreement]);

  async function handleVoid() {
    if (!agreement) return;
    if (!confirm("Void this agreement? The merchant will no longer be able to sign it.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/agreements/${agreement.id}/void`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to void agreement");
      } else {
        setAgreement(data.agreement);
      }
    } catch {
      setError("Network error");
    }
    setBusy(false);
  }

  async function handleCountersign() {
    await refresh();
    if (signLinks.kitchyn) {
      window.open(signLinks.kitchyn, "_blank", "noopener,noreferrer");
    } else {
      setError("Countersign link not available yet — try Refresh in a moment.");
    }
  }

  if (!agreement || CAN_REGENERATE.has(agreement.status)) {
    return (
      <div className="space-y-4">
        {agreement && (
          <div className={cn("rounded-2xl px-4 py-3 text-sm", AGREEMENT_STATUS_META[agreement.status]?.className)}>
            Previous agreement is {AGREEMENT_STATUS_META[agreement.status]?.label.toLowerCase()}. Generating a new
            one below will replace it.
          </div>
        )}
        <GenerateAgreementForm
          restaurant={restaurant}
          onGenerated={(a) => setAgreement(a)}
        />
      </div>
    );
  }

  const meta = AGREEMENT_STATUS_META[agreement.status] ?? AGREEMENT_STATUS_META.draft;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-black-200 px-5 py-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", meta.className)}>
              {meta.label}
            </span>
            <p className="text-xs text-black-400 mt-1">
              Template {agreement.template_version} &middot; created{" "}
              {new Date(agreement.created_at).toLocaleDateString("en-NG")}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={busy}
            className="text-xs font-medium text-black-500 border border-black-200 rounded-lg px-3 py-1.5 hover:bg-black-50 disabled:opacity-40"
          >
            {busy ? "Refreshing…" : "Refresh status"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Legal name" value={agreement.legal_name ?? "—"} />
          <InfoRow label="RC/BN number" value={agreement.rc_number ?? "—"} />
          <InfoRow
            label="Merchant signed"
            value={agreement.merchant_signed_at ? new Date(agreement.merchant_signed_at).toLocaleString("en-NG") : "Not yet"}
            muted={!agreement.merchant_signed_at}
          />
          <InfoRow
            label="Countersigned"
            value={agreement.countersigned_at ? new Date(agreement.countersigned_at).toLocaleString("en-NG") : "Not yet"}
            muted={!agreement.countersigned_at}
          />
        </div>

        {error && <p className="text-xs text-cinnabar-500">{error}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {agreement.status === "merchant_signed" && (
            <button
              onClick={handleCountersign}
              disabled={busy}
              className="text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              Countersign in DocuSeal
            </button>
          )}
          {agreement.status === "completed" && (
            <a
              href={`/api/admin/agreements/${agreement.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold bg-viridian-600 hover:bg-viridian-500 text-white px-4 py-2 rounded-xl transition-colors"
            >
              View signed PDF
            </a>
          )}
          {agreement.status !== "completed" && (
            <button
              onClick={handleVoid}
              disabled={busy}
              className="text-sm font-medium text-cinnabar-500 border border-cinnabar-200 hover:bg-cinnabar-50 px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              Void agreement
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GenerateAgreementForm({
  restaurant,
  onGenerated,
}: {
  restaurant: Restaurant;
  onGenerated: (agreement: AgreementRow) => void;
}) {
  const [legalName, setLegalName] = useState(restaurant.name);
  const [rcNumber, setRcNumber] = useState("");
  const [legalStatus, setLegalStatus] = useState("incorporated_company");
  // Standard Kitchyn commercial terms. These defaults are deliberately kept in
  // step with the Merchant Agreement's own wording and with platform_settings,
  // so a generated Schedule 1 never contradicts the clauses above it:
  //   commission 1%            → platform_settings.merchant_charge_pct (0.01)
  //   in-house commission 10%  → clause 6.8(b) "ten percent (10%)" +
  //                              platform_settings.delivery_commission_pct (0.10)
  //   settlement 7 Business Days → clause 7.4's stated fallback. Operations
  //     actually release funds after settlement_hold_hours (24h), so this is
  //     the contractual outer bound we commit to, not the target.
  //   free period 3 months     → the "Free Period" definition in clause 1.1
  const today = new Date();
  const [commissionPct, setCommissionPct] = useState("1");
  const [subscriptionFee, setSubscriptionFee] = useState("TBD");
  const [freePeriodStart, setFreePeriodStart] = useState(toDateInput(today));
  const [freePeriodEnd, setFreePeriodEnd] = useState(toDateInput(addMonths(today, 3)));
  const [deliveryModes, setDeliveryModes] = useState("platform");
  const [inhouseCommissionPct, setInhouseCommissionPct] = useState("10");
  const [settlementCycleDays, setSettlementCycleDays] = useState("7");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("20");
  const [effectiveDate, setEffectiveDate] = useState(toDateInput(today));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agreements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          legal_name: legalName,
          rc_number: rcNumber || null,
          fee_terms: {
            legal_status: legalStatus,
            commission_pct: commissionPct ? Number(commissionPct) : null,
            // Kept as a string when it isn't numeric (e.g. the "TBD" default),
            // so the agreement can be issued before the fee is agreed.
            subscription_fee_ngn: subscriptionFee
              ? Number.isFinite(Number(subscriptionFee))
                ? Number(subscriptionFee)
                : subscriptionFee
              : null,
            free_period_start: freePeriodStart || null,
            free_period_end: freePeriodEnd || null,
            delivery_modes: deliveryModes,
            inhouse_commission_pct: inhouseCommissionPct ? Number(inhouseCommissionPct) : null,
            settlement_cycle_days: settlementCycleDays ? Number(settlementCycleDays) : null,
            bank_name: null,
            bank_account_name: restaurant.bank_account_name,
            bank_account_number: restaurant.bank_account_number,
            prep_time_minutes: prepTimeMinutes ? Number(prepTimeMinutes) : null,
            effective_date: effectiveDate || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate agreement");
      } else {
        onGenerated(data.agreement);
      }
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-black-200 px-5 py-5 space-y-4">
      <h3 className="text-sm font-bold text-black-900">Generate agreement</h3>
      <p className="text-xs text-black-400">
        Creates a DocuSeal submission from the sealed Merchant Agreement template and emails the merchant to sign.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <AgreementField label="Legal name">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            required
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="RC/BN number">
          <input value={rcNumber} onChange={(e) => setRcNumber(e.target.value)} className={agreementInputCls} />
        </AgreementField>
        <AgreementField label="Legal status">
          <select value={legalStatus} onChange={(e) => setLegalStatus(e.target.value)} className={agreementInputCls}>
            <option value="incorporated_company">Incorporated company</option>
            <option value="business_name">Business name</option>
            <option value="individual">Individual</option>
          </select>
        </AgreementField>
        <AgreementField label="Commission (%)">
          <input
            type="number"
            step="0.1"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Subscription fee (₦)" hint={'Amount, or "TBD"'}>
          <input
            type="text"
            value={subscriptionFee}
            onChange={(e) => setSubscriptionFee(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Settlement cycle (Business Days)" hint="Clause 7.4">
          <input
            type="number"
            value={settlementCycleDays}
            onChange={(e) => setSettlementCycleDays(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Free period start">
          <input
            type="date"
            value={freePeriodStart}
            onChange={(e) => setFreePeriodStart(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Free period end">
          <input
            type="date"
            value={freePeriodEnd}
            onChange={(e) => setFreePeriodEnd(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Delivery modes">
          <select value={deliveryModes} onChange={(e) => setDeliveryModes(e.target.value)} className={agreementInputCls}>
            <option value="platform">Platform riders</option>
            <option value="in_house">In-house riders</option>
            <option value="both">Both</option>
          </select>
        </AgreementField>
        <AgreementField label="In-house commission (%)" hint="Only if delivery includes in-house">
          <input
            type="number"
            step="0.1"
            value={inhouseCommissionPct}
            onChange={(e) => setInhouseCommissionPct(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Prep time (minutes)">
          <input
            type="number"
            value={prepTimeMinutes}
            onChange={(e) => setPrepTimeMinutes(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
        <AgreementField label="Effective date">
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className={agreementInputCls}
          />
        </AgreementField>
      </div>

      {error && <p className="text-xs text-cinnabar-500">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl transition-colors disabled:opacity-40"
      >
        {saving ? "Sending…" : "Generate & send to merchant"}
      </button>
    </form>
  );
}

const agreementInputCls =
  "w-full text-sm border border-black-200 rounded-lg px-3 py-2 text-black-700 focus:outline-none focus:border-purple-400 bg-white";

/** YYYY-MM-DD in local time — `toISOString()` would shift the day in WAT. */
function toDateInput(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function AgreementField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-black-500 mb-1">
        {label}
        {hint && <span className="text-black-300 font-normal"> &middot; {hint}</span>}
      </label>
      {children}
    </div>
  );
}
