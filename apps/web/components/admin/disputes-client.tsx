"use client";

import { useState } from "react";
import { formatKobo } from "@foodo/utils";
import { Scale } from "lucide-react";

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
        <h1 className="text-2xl font-extrabold text-black-900">
          Disputes & Cancellations
        </h1>
        <p className="text-black-500 text-sm mt-1">
          {initialOrders.length} cancelled order{initialOrders.length !== 1 ? "s" : ""} total
        </p>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order, customer, restaurant, or reason…"
          className="w-full md:max-w-sm px-4 py-3 rounded-xl bg-black-50 border border-black-200 text-black-900 text-sm focus:outline-none focus:border-purple-500 placeholder:text-black-400"
        />
      </div>

      <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
        {filtered.length === 0 && (
          <div className="py-12 text-center text-black-400">
            <div className="flex justify-center mb-2"><Scale size={28} /></div>
            <p className="text-sm">No cancelled orders found</p>
          </div>
        )}

        {filtered.map((order) => (
          <div
            key={order.id}
            className="flex items-start gap-4 px-4 py-4 border-b border-black-200 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-black-900">
                  #{order.order_number}
                </span>
                <span className="text-xs bg-cinnabar-100 text-cinnabar-500 px-2 py-0.5 rounded-full font-semibold">
                  Cancelled
                </span>
                {order.restaurants?.name && (
                  <span className="text-xs text-black-400">
                    {order.restaurants.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-black-500 mt-1">
                {order.customer_name ?? "—"} · {order.customer_phone ?? "—"}
              </p>
              {order.cancellation_reason ? (
                <p className="text-xs text-dixie-500 bg-dixie-100 px-3 py-1.5 rounded-lg mt-2 inline-block">
                  Reason: {order.cancellation_reason}
                </p>
              ) : (
                <p className="text-xs text-black-400 mt-1">No reason given</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-black-900">
                {formatKobo(order.total_kobo)}
              </p>
              <p className="text-xs text-black-400 mt-0.5">
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
