"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";

interface CancelledOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_kobo: number;
  cancellation_reason: string | null;
  created_at: string;
  restaurant_id: string;
  restaurants: { name: string } | null;
}

export function DisputesClient({
  initialOrders,
}: {
  initialOrders: CancelledOrder[];
}) {
  const [search, setSearch] = useState("");

  const filtered = initialOrders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_phone?.includes(q) ||
      o.restaurants?.name.toLowerCase().includes(q) ||
      o.cancellation_reason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">
          Disputes & Cancellations
        </h1>
        <p className="text-white/40 text-sm mt-1">
          {initialOrders.length} cancelled order{initialOrders.length !== 1 ? "s" : ""} total
        </p>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order, customer, restaurant, or reason…"
          className="w-full md:max-w-sm px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-white/20"
        />
      </div>

      <div className="bg-white/5 rounded-card border border-white/10 overflow-hidden">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-white/30">
            <p className="text-2xl mb-2">⚖️</p>
            <p className="text-sm">No cancelled orders found</p>
          </div>
        )}

        {filtered.map((order) => (
          <div
            key={order.id}
            className="flex items-start gap-4 px-4 py-4 border-b border-white/10 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white">
                  #{order.order_number}
                </span>
                <span className="text-xs bg-cinnabar-500/15 text-cinnabar-500 px-2 py-0.5 rounded-full font-semibold">
                  Cancelled
                </span>
                {order.restaurants?.name && (
                  <span className="text-xs text-white/30">
                    {order.restaurants.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 mt-1">
                {order.customer_name ?? "—"} · {order.customer_phone ?? "—"}
              </p>
              {order.cancellation_reason ? (
                <p className="text-xs text-dixie-500 bg-dixie-500/10 px-3 py-1.5 rounded-lg mt-2 inline-block">
                  Reason: {order.cancellation_reason}
                </p>
              ) : (
                <p className="text-xs text-white/20 mt-1">No reason given</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-white">
                {formatKobo(order.total_kobo)}
              </p>
              <p className="text-xs text-white/30 mt-0.5">
                {new Date(order.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
