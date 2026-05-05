"use client";

import { useState } from "react";
import { cn } from "@foodo/ui";
import { Bike, MapPin, Phone, Clock } from "lucide-react";
import { formatKobo } from "@foodo/utils";

interface RiderRow {
  id: string;
  user_id: string;
  vehicle_type: string | null;
  is_online: boolean;
  is_active: boolean;
  active_deliveries: number;
  total_deliveries: number;
  last_seen_at: string | null;
  user_profiles: { full_name: string | null; phone: string | null };
}

interface DeliveryRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  total_kobo: number;
  created_at: string;
  restaurants: { name: string } | null;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function RidersClient({
  initialRiders,
  initialDeliveries,
}: {
  initialRiders: RiderRow[];
  initialDeliveries: DeliveryRow[];
}) {
  const [riders, setRiders] = useState(initialRiders);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [toggling, setToggling] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);

  async function toggleActive(userId: string, current: boolean) {
    setToggling(userId);
    const res = await fetch("/api/admin/riders/toggle-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isActive: !current }),
    });
    if (res.ok) {
      setRiders((prev) =>
        prev.map((r) =>
          r.user_id === userId
            ? { ...r, is_active: !current, is_online: !current ? false : r.is_online }
            : r
        )
      );
    }
    setToggling(null);
  }

  async function markDelivered(orderId: string) {
    setDelivering(orderId);
    setDeliverError(null);
    const res = await fetch("/api/admin/orders/mark-delivered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
    });
    if (res.ok) {
      setDeliveries((prev) => prev.filter((d) => d.id !== orderId));
    } else {
      const data = await res.json().catch(() => ({}));
      setDeliverError((data as { error?: string }).error ?? "Failed to mark delivered");
    }
    setDelivering(null);
  }

  return (
    <div className="p-6 pb-24 space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-black-900">Riders</h1>
        <p className="text-sm text-black-500 mt-1">
          Platform delivery operations &middot; {deliveries.length} active{" "}
          {deliveries.length === 1 ? "delivery" : "deliveries"}
        </p>
      </div>

      {/* ── Active Deliveries ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-bold text-black-900">Active Deliveries</h2>
          {deliveries.length > 0 && (
            <span className="bg-purple-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {deliveries.length}
            </span>
          )}
        </div>

        {deliverError && (
          <div className="mb-3 bg-cinnabar-50 border border-cinnabar-200 text-cinnabar-600 text-sm px-4 py-2.5 rounded-xl flex items-center justify-between">
            <span>{deliverError}</span>
            <button onClick={() => setDeliverError(null)} className="text-cinnabar-400 hover:text-cinnabar-600 ml-3 text-xs cursor-pointer">Dismiss</button>
          </div>
        )}

        {deliveries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black-200 py-10 text-center text-black-400">
            <Bike size={24} strokeWidth={1.5} className="mx-auto mb-2" />
            <p className="text-sm">No active platform deliveries</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="bg-white rounded-2xl border border-black-200 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-black-900 text-sm">#{d.order_number}</p>
                    <p className="text-xs text-black-500 mt-0.5">
                      {d.restaurants?.name ?? "Unknown restaurant"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-black-900">{formatKobo(d.total_kobo)}</p>
                    <p className="text-[11px] text-black-400 mt-0.5 flex items-center gap-1 justify-end">
                      <Clock size={10} />
                      {formatTimeAgo(d.created_at)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {d.customer_name && (
                    <p className="text-xs text-black-700 font-medium">{d.customer_name}</p>
                  )}
                  {d.customer_phone && (
                    <a
                      href={`tel:${d.customer_phone}`}
                      className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700"
                    >
                      <Phone size={11} />
                      {d.customer_phone}
                    </a>
                  )}
                  {d.delivery_address && (
                    <div className="flex items-start gap-1.5 text-xs text-black-500">
                      <MapPin size={11} className="flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{d.delivery_address}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => markDelivered(d.id)}
                  disabled={delivering === d.id}
                  className="w-full bg-viridian-500 hover:bg-viridian-400 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  {delivering === d.id ? "Updating…" : "Mark Delivered"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Rider Roster ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-black-900 mb-3">
          Rider Roster ({riders.length})
        </h2>
        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {riders.length === 0 && (
            <div className="py-12 text-center text-black-400">
              <div className="flex justify-center mb-2">
                <Bike size={28} />
              </div>
              <p className="text-sm">No riders yet</p>
            </div>
          )}
          {riders.map((rider) => (
            <div
              key={rider.id}
              className="flex items-center gap-4 px-4 py-4 border-b border-black-200 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-black-900 text-sm">
                    {rider.user_profiles.full_name ?? "Unknown"}
                  </p>
                  {rider.is_online && (
                    <span className="w-2 h-2 bg-viridian-500 rounded-full" />
                  )}
                </div>
                <p className="text-xs text-black-500 mt-0.5">
                  {rider.user_profiles.phone} ·{" "}
                  {rider.vehicle_type ?? "no vehicle"} ·{" "}
                  {rider.total_deliveries} deliveries
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    rider.is_active
                      ? "bg-viridian-100 text-viridian-500"
                      : "bg-cinnabar-100 text-cinnabar-500"
                  )}
                >
                  {rider.is_active ? "Active" : "Suspended"}
                </span>
                <button
                  onClick={() => toggleActive(rider.user_id, rider.is_active)}
                  disabled={toggling === rider.user_id}
                  className="text-xs text-black-500 hover:text-black-900 px-3 py-1.5 rounded-lg border border-black-200 hover:border-black-400 transition-colors disabled:opacity-50"
                >
                  {toggling === rider.user_id
                    ? "…"
                    : rider.is_active
                    ? "Suspend"
                    : "Approve"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
