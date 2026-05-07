"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import { Bike, MapPin, Phone, Clock, History, RefreshCw } from "lucide-react";
import { formatKobo } from "@foodo/utils";

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

interface HistoryRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_fee_kobo: number | null;
  delivery_cost_kobo: number | null;
  delivery_distance_km: number | null;
  total_kobo: number;
  delivered_at: string | null;
  updated_at: string;
  created_at: string;
  restaurants: { name: string } | null;
  delivery_assignments: { assigned_at: string }[] | null;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function RidersClient({
  initialDeliveries,
  initialHistory,
}: {
  initialDeliveries: DeliveryRow[];
  initialHistory: HistoryRow[];
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [history, setHistory] = useState(initialHistory);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [markingOrder, setMarkingOrder] = useState<DeliveryRow | null>(null);
  const [costInput, setCostInput] = useState("");

  // Sync local state from server props after a router.refresh()
  useEffect(() => {
    setDeliveries(initialDeliveries);
    setHistory(initialHistory);
  }, [initialDeliveries, initialHistory]);

  // Real-time: orders moving into or out of assigned_to_rider
  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("admin-rider-deliveries")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const updated = payload.new as { id: string; status: string };

          if (updated.status === "assigned_to_rider") {
            const { data } = await supabase
              .from("orders")
              .select(
                "id, order_number, customer_name, customer_phone, delivery_address, total_kobo, created_at, restaurants (name)"
              )
              .eq("id", updated.id)
              .single();
            if (data) {
              setDeliveries((prev) =>
                prev.some((d) => d.id === data.id)
                  ? prev
                  : [data as unknown as DeliveryRow, ...prev]
              );
            }
          } else {
            setDeliveries((prev) => prev.filter((d) => d.id !== updated.id));
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  function openMarkDelivered(delivery: DeliveryRow) {
    setMarkingOrder(delivery);
    setCostInput("");
    setDeliverError(null);
  }

  function closeMarkDelivered() {
    if (delivering) return;
    setMarkingOrder(null);
    setCostInput("");
  }

  function parseCostKobo(input: string): number | null {
    const trimmed = input.trim().replace(/,/g, "");
    if (!trimmed) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const naira = Number(trimmed);
    if (!Number.isFinite(naira) || naira < 0) return null;
    return Math.round(naira * 100);
  }

  async function confirmMarkDelivered() {
    if (!markingOrder) return;
    const kobo = parseCostKobo(costInput);
    if (kobo === null) {
      setDeliverError("Enter a valid amount in ₦");
      return;
    }
    setDelivering(markingOrder.id);
    setDeliverError(null);
    const res = await fetch("/api/admin/orders/mark-delivered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: markingOrder.id, delivery_cost_kobo: kobo }),
    });
    if (res.ok) {
      const orderId = markingOrder.id;
      const justDelivered = markingOrder;
      setDeliveries((prev) => prev.filter((d) => d.id !== orderId));
      // Optimistically prepend to history so it shows immediately
      const nowIso = new Date().toISOString();
      setHistory((prev) => [
        {
          id: orderId,
          order_number: justDelivered.order_number,
          customer_name: justDelivered.customer_name,
          customer_phone: justDelivered.customer_phone,
          delivery_address: justDelivered.delivery_address,
          delivery_fee_kobo: null,
          delivery_cost_kobo: kobo,
          delivery_distance_km: null,
          total_kobo: justDelivered.total_kobo,
          delivered_at: nowIso,
          updated_at: nowIso,
          created_at: justDelivered.created_at,
          restaurants: justDelivered.restaurants,
          delivery_assignments: [{ assigned_at: justDelivered.created_at }],
        },
        ...prev,
      ]);
      setMarkingOrder(null);
      setCostInput("");
    } else {
      const data = await res.json().catch(() => ({}));
      setDeliverError((data as { error?: string }).error ?? "Failed to mark delivered");
    }
    setDelivering(null);
  }

  // Aggregate totals across all history rows
  const totals = history.reduce(
    (acc, h) => {
      const fee = h.delivery_fee_kobo ?? 0;
      const cost = h.delivery_cost_kobo ?? 0;
      acc.fee += fee;
      acc.cost += cost;
      acc.pl += fee - cost;
      return acc;
    },
    { fee: 0, cost: 0, pl: 0 }
  );

  return (
    <div className="p-6 pb-24 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-black-900">Riders</h1>
          <p className="text-sm text-black-500 mt-1">
            Platform delivery operations &middot; {deliveries.length} active{" "}
            {deliveries.length === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
        <button
          onClick={() => startRefresh(() => router.refresh())}
          disabled={isRefreshing}
          className="flex items-center gap-2 text-xs text-black-600 hover:text-black-900 px-3 py-2 rounded-xl border border-black-200 hover:border-black-400 transition-colors disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
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
                  onClick={() => openMarkDelivered(d)}
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

      {/* ── Rider History ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-black-900">Rider History</h2>
            <span className="bg-black-100 text-black-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-black-400">Customer paid: </span>
                <span className="font-bold text-black-900">{formatKobo(totals.fee)}</span>
              </div>
              <div>
                <span className="text-black-400">Rider cost: </span>
                <span className="font-bold text-black-900">{formatKobo(totals.cost)}</span>
              </div>
              <div>
                <span className="text-black-400">Net: </span>
                <span className={cn("font-bold", totals.pl >= 0 ? "text-viridian-500" : "text-cinnabar-500")}>
                  {totals.pl >= 0 ? "+" : "−"}{formatKobo(Math.abs(totals.pl))}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {history.length === 0 ? (
            <div className="py-12 text-center text-black-400">
              <History size={28} strokeWidth={1.5} className="mx-auto mb-2" />
              <p className="text-sm">No completed rides yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-black-50 text-black-500 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Order</th>
                    <th className="text-left px-4 py-3 font-semibold">Restaurant</th>
                    <th className="text-left px-4 py-3 font-semibold">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold">Address</th>
                    <th className="text-left px-4 py-3 font-semibold">Assigned</th>
                    <th className="text-left px-4 py-3 font-semibold">Delivered</th>
                    <th className="text-left px-4 py-3 font-semibold">Duration</th>
                    <th className="text-right px-4 py-3 font-semibold">Customer paid</th>
                    <th className="text-right px-4 py-3 font-semibold">Rider cost</th>
                    <th className="text-right px-4 py-3 font-semibold">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history]
                    .sort((a, b) => {
                      const aTime = a.delivery_assignments?.[0]?.assigned_at
                        ? new Date(a.delivery_assignments[0].assigned_at).getTime()
                        : 0;
                      const bTime = b.delivery_assignments?.[0]?.assigned_at
                        ? new Date(b.delivery_assignments[0].assigned_at).getTime()
                        : 0;
                      return bTime - aTime;
                    })
                    .map((h) => {
                    const assignedAt = h.delivery_assignments?.[0]?.assigned_at ?? null;
                    // Duration is the gap between status->assigned and status->delivered.
                    // For legacy orders without delivered_at this isn't reliably known —
                    // updated_at gets touched by other writes (settlement, etc.) so we
                    // explicitly skip rather than show a misleading number.
                    const deliveredAt = h.delivered_at;
                    const durationMs =
                      assignedAt && deliveredAt
                        ? new Date(deliveredAt).getTime() - new Date(assignedAt).getTime()
                        : NaN;
                    const fee = h.delivery_fee_kobo ?? 0;
                    const cost = h.delivery_cost_kobo ?? 0;
                    const pl = fee - cost;

                    return (
                      <tr
                        key={h.id}
                        className="border-t border-black-100 hover:bg-black-50/50"
                      >
                        <td className="px-4 py-3 font-bold text-black-900">#{h.order_number}</td>
                        <td className="px-4 py-3 text-black-700">
                          {h.restaurants?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-black-700">
                          <div className="flex flex-col">
                            <span>{h.customer_name ?? "—"}</span>
                            {h.customer_phone && (
                              <a
                                href={`tel:${h.customer_phone}`}
                                className="text-[11px] text-purple-600 hover:text-purple-700"
                              >
                                {h.customer_phone}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-black-500 max-w-[220px] truncate" title={h.delivery_address ?? ""}>
                          {h.delivery_address ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                          {formatDateTime(assignedAt)}
                        </td>
                        <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                          {deliveredAt ? formatDateTime(deliveredAt) : "—"}
                        </td>
                        <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                          {formatDuration(durationMs)}
                        </td>
                        <td className="px-4 py-3 text-right text-black-900 font-medium">
                          {fee > 0 ? formatKobo(fee) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-black-900 font-medium">
                          {cost > 0 ? formatKobo(cost) : "—"}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right font-bold whitespace-nowrap",
                            pl > 0
                              ? "text-viridian-500"
                              : pl < 0
                              ? "text-cinnabar-500"
                              : "text-black-400"
                          )}
                        >
                          {pl === 0
                            ? "—"
                            : `${pl > 0 ? "+" : "−"}${formatKobo(Math.abs(pl))}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Mark Delivered Modal ─────────────────────────────────────────── */}
      {markingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 px-4"
          onClick={closeMarkDelivered}
        >
          <div
            className="bg-white rounded-2xl border border-black-200 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 space-y-4">
              <div>
                <h2 className="font-bold text-black-900">Mark order as delivered</h2>
                <p className="text-sm text-black-500 mt-1">
                  Order <span className="text-black-900 font-medium">#{markingOrder.order_number}</span>
                  {markingOrder.restaurants?.name ? (
                    <> &middot; {markingOrder.restaurants.name}</>
                  ) : null}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-black-600 mb-1.5">
                  Delivery cost <span className="text-black-400 font-normal">(paid to rider)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black-400 text-sm">₦</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !delivering) confirmMarkDelivered();
                    }}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 bg-white focus:outline-none focus:ring-2 focus:ring-viridian-200 focus:border-viridian-400 placeholder:text-black-300"
                  />
                </div>
                <p className="text-xs text-black-400 mt-1.5">
                  Customer paid {formatKobo(markingOrder.total_kobo)} for this order
                </p>
              </div>

              {deliverError && (
                <p className="text-sm text-cinnabar-500">{deliverError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeMarkDelivered}
                  disabled={!!delivering}
                  className="flex-1 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:text-black-900 hover:border-black-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMarkDelivered}
                  disabled={!!delivering || parseCostKobo(costInput) === null}
                  className="flex-1 py-2.5 rounded-xl bg-viridian-500 hover:bg-viridian-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {delivering ? "Updating…" : "Mark Delivered"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
