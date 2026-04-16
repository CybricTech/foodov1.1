"use client";

import { useState, useMemo } from "react";
import { formatKobo } from "@foodo/utils";

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

type DateFilter = "today" | "week" | "month" | "all";
type StatusFilter = "all" | "active" | "completed" | "cancelled";
type FulfillmentFilter = "all" | "delivery" | "pickup";

const ACTIVE_STATUSES = new Set(["confirmed", "preparing", "ready_for_pickup", "in_transit", "assigned_to_rider"]);

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-purple-50 text-purple-700",
  preparing: "bg-dixie-100 text-dixie-700",
  ready_for_pickup: "bg-orange-100 text-orange-700",
  in_transit: "bg-purple-100 text-purple-700",
  assigned_to_rider: "bg-purple-100 text-purple-700",
  delivered: "bg-viridian-100 text-viridian-700",
  cancelled: "bg-cinnabar-100 text-cinnabar-600",
  pending: "bg-black-100 text-black-500",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  in_transit: "In Transit",
  assigned_to_rider: "Assigned",
  delivered: "Delivered",
  cancelled: "Cancelled",
  pending: "Pending",
};

function filterByDate(order: Order, filter: DateFilter): boolean {
  const now = new Date();
  const created = new Date(order.created_at);
  if (filter === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return created >= start;
  }
  if (filter === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return created >= start;
  }
  if (filter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return created >= start;
  }
  return true;
}

function exportCSV(orders: Order[]) {
  const header = [
    "Order #",
    "Date",
    "Time",
    "Customer",
    "Phone",
    "Items + VAT (₦)",
    "Delivery Fee (₦)",
    "Total (₦)",
    "Status",
    "Fulfillment",
    "Distance (km)",
  ].join(",");

  const rows = orders.map((o) => {
    const d = new Date(o.created_at);
    return [
      o.order_number,
      d.toLocaleDateString("en-NG"),
      d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }),
      `"${o.customer_name ?? ""}"`,
      o.customer_phone ?? "",
      ((o.subtotal_kobo + o.vat_kobo) / 100).toFixed(2),
      (o.delivery_fee_kobo / 100).toFixed(2),
      (o.total_kobo / 100).toFixed(2),
      o.status,
      o.fulfillment_type,
      o.delivery_distance_km != null ? Number(o.delivery_distance_km).toFixed(1) : "",
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MerchantOrdersClient({ initialOrders }: { initialOrders: Order[] }) {
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>("all");

  const filtered = useMemo(() => {
    return initialOrders.filter((o) => {
      if (!filterByDate(o, dateFilter)) return false;
      if (statusFilter === "active" && !ACTIVE_STATUSES.has(o.status)) return false;
      if (statusFilter === "completed" && o.status !== "delivered") return false;
      if (statusFilter === "cancelled" && o.status !== "cancelled") return false;
      if (fulfillmentFilter === "delivery" && o.fulfillment_type !== "delivery") return false;
      if (fulfillmentFilter === "pickup" && o.fulfillment_type !== "pickup") return false;
      return true;
    });
  }, [initialOrders, dateFilter, statusFilter, fulfillmentFilter]);

  return (
    <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
      {/* Filters */}
      <div className="px-5 py-4 border-b border-black-100 flex flex-wrap items-center gap-3">
        {/* Date range */}
        <div className="flex rounded-xl border border-black-200 overflow-hidden text-xs font-medium">
          {(["today", "week", "month", "all"] as DateFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setDateFilter(v)}
              className={`px-3 py-1.5 transition-colors ${
                dateFilter === v
                  ? "bg-purple-500 text-white"
                  : "text-black-500 hover:bg-black-50"
              }`}
            >
              {v === "today" ? "Today" : v === "week" ? "This Week" : v === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="flex rounded-xl border border-black-200 overflow-hidden text-xs font-medium">
          {(["all", "active", "completed", "cancelled"] as StatusFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 transition-colors capitalize ${
                statusFilter === v
                  ? "bg-purple-500 text-white"
                  : "text-black-500 hover:bg-black-50"
              }`}
            >
              {v === "all" ? "All Status" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Fulfillment */}
        <div className="flex rounded-xl border border-black-200 overflow-hidden text-xs font-medium">
          {(["all", "delivery", "pickup"] as FulfillmentFilter[]).map((v) => (
            <button
              key={v}
              onClick={() => setFulfillmentFilter(v)}
              className={`px-3 py-1.5 transition-colors ${
                fulfillmentFilter === v
                  ? "bg-purple-500 text-white"
                  : "text-black-500 hover:bg-black-50"
              }`}
            >
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-black-400">{filtered.length} orders</span>
          <button
            onClick={() => exportCSV(filtered)}
            className="text-xs text-black-500 hover:text-black-900 border border-black-200 hover:border-black-400 px-3 py-1.5 rounded-xl transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-black-400 px-5 py-10 text-center">No orders match the selected filters</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black-100 bg-black-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Items + VAT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Delivery</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black-500 uppercase tracking-wide">Fulfillment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-black-500 uppercase tracking-wide">Distance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const d = new Date(o.created_at);
                const dateStr = d.toLocaleDateString("en-NG", {
                  month: "short",
                  day: "numeric",
                });
                const timeStr = d.toLocaleTimeString("en-NG", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <tr key={o.id} className="border-b border-black-100 last:border-0 hover:bg-black-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-black-700 whitespace-nowrap">
                      {o.order_number}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs text-black-700">{dateStr}</p>
                      <p className="text-xs text-black-400">{timeStr}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-black-700">{o.customer_name ?? "—"}</p>
                      {o.customer_phone && (
                        <p className="text-xs text-black-400">{o.customer_phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-black-900 text-xs whitespace-nowrap">
                      {formatKobo(o.subtotal_kobo + o.vat_kobo)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap text-black-600">
                      {o.delivery_fee_kobo > 0 ? formatKobo(o.delivery_fee_kobo) : <span className="text-black-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[o.status] ?? "bg-black-100 text-black-600"
                        }`}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-black-600 whitespace-nowrap">
                      {o.fulfillment_type === "delivery" ? "🛵 Delivery" : "🏠 Pickup"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-black-500 whitespace-nowrap">
                      {o.fulfillment_type === "delivery" && o.delivery_distance_km != null
                        ? `${Number(o.delivery_distance_km).toFixed(1)} km`
                        : <span className="text-black-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
