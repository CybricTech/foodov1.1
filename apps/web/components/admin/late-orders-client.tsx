"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import { CheckCircle, AlertTriangle, Clock, Phone } from "lucide-react";

type LateOrder = {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  estimated_delivery_at: string | null;
  late_at: string | null;
  total_kobo: number;
  restaurants: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

interface LateOrdersClientProps {
  orders: LateOrder[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  assigned_to_rider: "Assigned",
  in_transit: "In Transit",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-dixie-100 text-dixie-600",
  confirmed: "bg-purple-100 text-purple-600",
  preparing: "bg-amber-100 text-amber-700",
  ready_for_pickup: "bg-viridian-100 text-viridian-600",
  assigned_to_rider: "bg-blue-100 text-blue-600",
  in_transit: "bg-indigo-100 text-indigo-700",
};

function minutesOverdue(lateAt: string | null, now: Date): number {
  if (!lateAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(lateAt).getTime()) / 60_000));
}

export function LateOrdersClient({ orders }: LateOrdersClientProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  // Auto-refresh page data every 60s
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  // Live overdue counter — ticks every minute
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-black-900">Late Orders</h1>
            {orders.length > 0 && (
              <span className="flex items-center gap-1 bg-cinnabar-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} />
                {orders.length}
              </span>
            )}
          </div>
          <p className="text-sm text-black-500 mt-0.5">
            Orders past their estimated delivery time
          </p>
        </div>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <div className="bg-white rounded-2xl border border-black-200 py-16 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-viridian-100 flex items-center justify-center">
            <CheckCircle size={24} className="text-viridian-500" />
          </div>
          <p className="text-sm font-medium text-black-900">No late orders right now</p>
          <p className="text-xs text-black-400">All active orders are within their delivery window</p>
        </div>
      )}

      {/* Desktop table */}
      {orders.length > 0 && (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-black-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black-200 bg-black-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    #
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Restaurant
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Order
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Customer
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    ETA
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Overdue
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-black-500 uppercase tracking-wide">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => {
                  const overdue = minutesOverdue(order.late_at, now);
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-black-200 last:border-0 hover:bg-black-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-black-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        {order.restaurants ? (
                          <Link
                            href={`/admin/merchants/${order.restaurants.id}`}
                            className="font-medium text-black-900 hover:text-purple-500 transition-colors"
                          >
                            {order.restaurants.name}
                          </Link>
                        ) : (
                          <span className="text-black-900">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-black-900 text-xs">
                          #{order.order_number}
                        </p>
                        <p className="text-xs text-black-400 mt-0.5 capitalize">
                          {order.fulfillment_type?.replace(/_/g, " ")}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-black-900">{order.customer_name ?? "—"}</p>
                        {order.customer_phone && (
                          <p className="text-xs text-black-400 mt-0.5 flex items-center gap-1">
                            <Phone size={10} />
                            {order.customer_phone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            STATUS_STYLES[order.status] ?? "bg-black-100 text-black-500"
                          )}
                        >
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {order.estimated_delivery_at ? (
                          <p className="text-xs text-black-500 flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(order.estimated_delivery_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        ) : (
                          <span className="text-xs text-black-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full",
                            overdue >= 30
                              ? "bg-cinnabar-100 text-cinnabar-600"
                              : overdue >= 15
                              ? "bg-dixie-100 text-dixie-700"
                              : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {overdue}m overdue
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-black-900">
                        {formatKobo(order.total_kobo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card stack */}
          <div className="md:hidden space-y-3">
            {orders.map((order) => {
              const overdue = minutesOverdue(order.late_at, now);
              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-black-200 px-4 py-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {order.restaurants ? (
                        <Link
                          href={`/admin/merchants/${order.restaurants.id}`}
                          className="font-semibold text-black-900 hover:text-purple-500 transition-colors text-sm"
                        >
                          {order.restaurants.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-black-900 text-sm">—</span>
                      )}
                      <p className="font-mono text-xs text-black-400 mt-0.5">
                        #{order.order_number}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                        overdue >= 30
                          ? "bg-cinnabar-100 text-cinnabar-600"
                          : overdue >= 15
                          ? "bg-dixie-100 text-dixie-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {overdue}m overdue
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        STATUS_STYLES[order.status] ?? "bg-black-100 text-black-500"
                      )}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="text-xs text-black-400 capitalize">
                      {order.fulfillment_type?.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-black-900 text-sm">{order.customer_name ?? "—"}</p>
                      {order.customer_phone && (
                        <p className="text-xs text-black-400 flex items-center gap-1 mt-0.5">
                          <Phone size={10} />
                          {order.customer_phone}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-black-900">{formatKobo(order.total_kobo)}</p>
                      {order.estimated_delivery_at && (
                        <p className="text-xs text-black-400 flex items-center gap-1 mt-0.5 justify-end">
                          <Clock size={10} />
                          ETA{" "}
                          {new Date(order.estimated_delivery_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
