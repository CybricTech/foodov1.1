"use client";

import { useCallback, useEffect, useState } from "react";
import { formatKobo } from "@foodo/utils";
import { Users } from "lucide-react";
import type { Database } from "@foodo/database";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

/* ------------------------------------------------------------------ */
/*  Types                                                               */
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
/*  Status badges                                                       */
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

const FULFILLMENT_LABELS: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine In",
};

function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_STYLES[status] ?? "bg-black-100 text-black-600"}`}
    >
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Customer detail view                                                */
/* ------------------------------------------------------------------ */

function CustomerDetailView({
  customer,
  onBack,
}: {
  customer: CustomerRow;
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

    fetch(`/api/dashboard/customers/${customer.id}/orders`)
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
    <div className="md:p-6 pb-24">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-black-500 hover:text-black-900 transition-colors mb-5 group"
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
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 md:px-5 py-5 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {(customer.full_name ?? customer.phone)[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-black-900">
                {customer.full_name ?? "Unknown"}
              </h2>
              <p className="text-sm text-black-400">{customer.phone}</p>
              {customer.email && (
                <p className="text-xs text-black-400">{customer.email}</p>
              )}
            </div>
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
      <h3 className="text-base font-bold text-black-900 mb-3 px-4 md:px-0">
        Order History
      </h3>

      {loading ? (
        <div className="bg-white md:rounded-2xl border border-black-100 px-5 py-10 text-center mx-4 md:mx-0">
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
        <div className="bg-white md:rounded-2xl border border-cinnabar-200 px-5 py-10 text-center mx-4 md:mx-0">
          <p className="text-sm text-cinnabar-500">{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white md:rounded-2xl border border-black-100 px-5 py-10 text-center mx-4 md:mx-0">
          <p className="text-sm text-black-400">No orders found</p>
        </div>
      ) : (
        <div className="space-y-3 px-4 md:px-0" role="list" aria-label="Order history">
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
                className="bg-white rounded-xl border border-black-100 overflow-hidden"
              >
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
                        {new Date(order.created_at).toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
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
                    className={`text-black-300 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isExpanded && (
                  <div
                    id={`order-details-${order.id}`}
                    className="border-t border-black-100"
                  >
                    {/* Items */}
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
                                <span className="font-medium">{item.quantity}×</span>{" "}
                                {item.item_name}
                              </p>
                              {item.selected_options &&
                                Object.keys(item.selected_options).length > 0 && (
                                  <p className="text-xs text-black-400 mt-0.5">
                                    {Object.entries(item.selected_options)
                                      .map(([key, val]) => `${key}: ${val}`)
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

                    {/* Delivery address + special instructions */}
                    {(order.delivery_address || order.special_instructions) && (
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main customers list                                                 */
/* ------------------------------------------------------------------ */

interface CustomersClientProps {
  restaurantId: string;
  initialCustomers: CustomerRow[];
}

type SortKey = "total_spent_kobo" | "total_orders" | "last_order_at" | "first_order_at";

export function CustomersClient({
  restaurantId,
  initialCustomers,
}: CustomersClientProps) {
  const [customers] = useState(initialCustomers);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_spent_kobo");
  const [exporting, setExporting] = useState(false);

  const handleBack = useCallback(() => setSelectedCustomer(null), []);

  if (selectedCustomer) {
    return <CustomerDetailView customer={selectedCustomer} onBack={handleBack} />;
  }

  const filtered = customers
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.full_name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return bv.localeCompare(av);
      }
      return (bv as number) - (av as number);
    });

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/merchant/customers/export?restaurantId=${restaurantId}`
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "customers.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="md:p-6 pb-24">
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4 flex flex-wrap gap-3 items-center justify-between">
        <h1 className="font-bold text-black-900 text-lg">
          Customers ({customers.length})
        </h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="text-sm text-purple-500 border border-purple-500 px-4 py-2 rounded-xl hover:bg-purple-50 disabled:opacity-60 transition-colors font-medium"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      <div className="px-4 md:px-0 mt-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="flex-1 min-w-48 px-4 py-2.5 rounded-xl border border-black-200 text-sm focus:outline-none focus:border-purple-500"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-4 py-2.5 rounded-xl border border-black-200 text-sm bg-white focus:outline-none focus:border-purple-500"
        >
          <option value="total_spent_kobo">Sort: Total spent</option>
          <option value="total_orders">Sort: Total orders</option>
          <option value="last_order_at">Sort: Last order</option>
          <option value="first_order_at">Sort: First order</option>
        </select>
      </div>

      <div className="mt-4 px-4 md:px-0 bg-white md:rounded-2xl md:border border-black-100 overflow-hidden">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <div className="flex justify-center mb-2">
              <Users size={28} />
            </div>
            <p className="text-sm">No customers yet</p>
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCustomer(c)}
            className="w-full flex items-center gap-4 px-4 py-3 border-b border-black-50 last:border-0 hover:bg-purple-50/40 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
              {(c.full_name ?? c.phone)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-black-900">
                {c.full_name ?? "—"}
              </p>
              <p className="text-xs text-black-400">{c.phone}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-black-900">
                {formatKobo(c.total_spent_kobo)}
              </p>
              <p className="text-xs text-black-400">
                {c.total_orders} order{c.total_orders !== 1 ? "s" : ""}
              </p>
            </div>
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
              className="text-black-300 group-hover:text-purple-500 transition-colors flex-shrink-0"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
