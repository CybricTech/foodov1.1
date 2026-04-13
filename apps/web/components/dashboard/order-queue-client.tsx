"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import {
  Inbox,
  Bike,
  Store,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Phone,
  Clock,
} from "lucide-react";
import type { Database } from "@foodo/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: unknown;
  }>;
};

type Tab = "new" | "in_progress" | "completed";

const TAB_STATUSES: Record<Tab, string[]> = {
  new: ["pending", "confirmed"],
  in_progress: ["preparing", "ready_for_pickup", "assigned_to_rider", "in_transit"],
  completed: ["delivered"],
};

interface OrderQueueClientProps {
  restaurantId: string;
  initialOrders: OrderRow[];
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function OrderQueueClient({
  restaurantId,
  initialOrders,
}: OrderQueueClientProps) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<Tab>("new");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const supabase = createBrowserClient();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const { data } = await supabase
              .from("orders")
              .select(`*, order_items (id, item_name, quantity, line_total_kobo, selected_options)`)
              .eq("id", (payload.new as OrderRow).id)
              .single();
            if (data) {
              setOrders((prev) => [data as unknown as OrderRow, ...prev]);
              playNewOrderSound();
              setActiveTab("new");
            }
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === (payload.new as OrderRow).id
                  ? { ...o, ...(payload.new as Partial<OrderRow>) }
                  : o
              )
            );
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function playNewOrderSound() {
    try {
      const ctx =
        audioRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio permission not granted — silently fail
    }
  }

  async function updateStatus(orderId: string, newStatus: string) {
    setActionLoading(orderId);
    setActionError(null);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as OrderRow["status"] } : o))
    );
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus as OrderRow["status"] })
      .eq("id", orderId);
    if (error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: orders.find((x) => x.id === orderId)?.status ?? o.status }
            : o
        )
      );
      setActionError("Failed to update order status. Please try again.");
    }
    setActionLoading(null);
  }

  async function cancelOrder(orderId: string, reason: string) {
    setActionLoading(orderId);
    setActionError(null);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "cancelled" as OrderRow["status"] } : o))
    );
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", cancellation_reason: reason })
      .eq("id", orderId);
    if (error) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: orders.find((x) => x.id === orderId)?.status ?? o.status }
            : o
        )
      );
      setActionError("Failed to cancel order. Please try again.");
    }
    setActionLoading(null);
  }

  const filteredOrders = orders.filter((o) => TAB_STATUSES[activeTab].includes(o.status));

  const counts = {
    new: orders.filter((o) => TAB_STATUSES.new.includes(o.status)).length,
    in_progress: orders.filter((o) => TAB_STATUSES.in_progress.includes(o.status)).length,
    completed: orders.filter((o) => TAB_STATUSES.completed.includes(o.status)).length,
  };

  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="min-h-screen bg-black-50">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-black-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-black-900 tracking-tight">Orders</h1>
              {counts.new > 0 && (
                <span className="flex items-center gap-1 bg-dixie-100 text-dixie-500 text-xs font-bold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-dixie-500 rounded-full animate-pulse" />
                  {counts.new} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock size={12} className="text-black-400" />
              <p className="text-xs text-black-400">{today}</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-black-400">
            <span>{orders.filter(o => TAB_STATUSES.new.includes(o.status)).length + orders.filter(o => TAB_STATUSES.in_progress.includes(o.status)).length} active</span>
            <span className="w-px h-3 bg-black-200" />
            <span>{counts.completed} completed today</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-black-100 px-4 md:px-6">
        <div className="flex gap-0">
          {(
            [
              { key: "new", label: "New Orders" },
              { key: "in_progress", label: "In Progress" },
              { key: "completed", label: "Completed" },
            ] as { key: Tab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors duration-150 cursor-pointer whitespace-nowrap",
                activeTab === key
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-black-400 hover:text-black-700"
              )}
            >
              {label}
              {counts[key] > 0 && (
                <span
                  className={cn(
                    "text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center",
                    activeTab === key
                      ? key === "new"
                        ? "bg-dixie-500 text-white"
                        : "bg-purple-600 text-white"
                      : "bg-black-100 text-black-500"
                  )}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {actionError && (
        <div className="px-4 md:px-6 pt-4">
          <div className="bg-cinnabar-100 text-cinnabar-500 text-sm px-4 py-3 rounded-xl border border-cinnabar-200">
            {actionError}
          </div>
        </div>
      )}

      {/* ── Order list ───────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-4 space-y-3 max-w-2xl">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-black-300">
            <Inbox size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-black-400">
              {activeTab === "new"
                ? "No new orders yet"
                : activeTab === "in_progress"
                ? "Nothing in progress"
                : "No completed orders today"}
            </p>
            <p className="text-xs text-black-300 mt-1">
              {activeTab === "new" ? "New orders will appear here in real time" : ""}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onUpdateStatus={updateStatus}
              onCancel={cancelOrder}
              loading={actionLoading === order.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Order Card ──────────────────────────────────────────────────────────────

const CARD_ACCENT: Record<string, string> = {
  pending:         "border-l-dixie-500",
  confirmed:       "border-l-purple-400",
  preparing:       "border-l-purple-500",
  ready_for_pickup:"border-l-viridian-500",
  assigned_to_rider:"border-l-viridian-500",
  in_transit:      "border-l-purple-600",
  delivered:       "border-l-black-200",
  cancelled:       "border-l-cinnabar-500",
};

function OrderCard({
  order,
  onUpdateStatus,
  onCancel,
  loading,
}: {
  order: OrderRow;
  onUpdateStatus: (id: string, status: string) => void;
  onCancel: (id: string, reason: string) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const nextStatus: Record<string, string | null> = {
    pending:          "confirmed",
    confirmed:        "preparing",
    preparing:        "ready_for_pickup",
    ready_for_pickup: "in_transit",
    in_transit:       "delivered",
    delivered:        null,
    cancelled:        null,
  };

  const actionLabel: Record<string, string> = {
    pending:          "Confirm Order",
    confirmed:        "Start Preparing",
    preparing:        "Mark Ready",
    ready_for_pickup: "Out for Delivery",
    in_transit:       "Mark Delivered",
  };

  const next = nextStatus[order.status];
  const canCancel = ["pending", "confirmed"].includes(order.status);
  const accent = CARD_ACCENT[order.status] ?? "border-l-black-200";

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-black-100 border-l-4 overflow-hidden shadow-card",
        accent
      )}
    >
      {/* ── Card header ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3.5 flex items-start justify-between text-left cursor-pointer hover:bg-black-50 transition-colors duration-150"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-black-900 text-sm">#{order.order_number}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-black-500 font-medium">{order.customer_name}</span>
            {order.customer_phone && (
              <>
                <span className="text-black-200 text-xs">·</span>
                <span className="inline-flex items-center gap-0.5 text-xs text-black-400">
                  <Phone size={10} />
                  {order.customer_phone}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-black-900">{formatKobo(order.total_kobo)}</p>
            <p className="text-[10px] text-black-300 mt-0.5">{formatTimeAgo(order.created_at)}</p>
          </div>
          {expanded
            ? <ChevronUp size={16} className="text-black-300" />
            : <ChevronDown size={16} className="text-black-300" />
          }
        </div>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-black-100 divide-y divide-black-50">

          {/* Items */}
          <div className="px-4 py-3 space-y-1.5">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-purple-50 text-purple-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                    {item.quantity}
                  </span>
                  <span className="text-sm text-black-900">{item.item_name}</span>
                </div>
                <span className="text-xs text-black-400 font-medium">
                  {formatKobo(item.line_total_kobo)}
                </span>
              </div>
            ))}
          </div>

          {/* Fulfillment + special instructions */}
          <div className="px-4 py-3 space-y-2">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg",
                order.fulfillment_type === "delivery"
                  ? "bg-purple-50 text-purple-600"
                  : "bg-black-100 text-black-500"
              )}
            >
              {order.fulfillment_type === "delivery"
                ? <><Bike size={13} /> Delivery</>
                : <><Store size={13} /> Pickup</>
              }
            </div>
            {order.fulfillment_type === "delivery" && order.delivery_address && (
              <p className="text-xs text-black-500 leading-relaxed">{order.delivery_address}</p>
            )}
            {order.special_instructions && (
              <div className="flex items-start gap-2 bg-dixie-100 border border-dixie-100 text-dixie-500 text-xs px-3 py-2 rounded-xl mt-1">
                <StickyNote size={13} className="flex-shrink-0 mt-0.5" />
                <span>{order.special_instructions}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {(next || canCancel) && !showCancel && (
            <div className="px-4 py-3 flex gap-2">
              {next && (
                <button
                  onClick={() => onUpdateStatus(order.id, next)}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  {loading ? "Updating…" : actionLabel[order.status]}
                </button>
              )}
              {canCancel && (
                <button
                  onClick={() => setShowCancel(true)}
                  disabled={loading}
                  className="px-4 text-cinnabar-500 border border-cinnabar-200 text-sm font-medium rounded-xl hover:bg-cinnabar-100 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Inline cancel confirmation */}
          {showCancel && (
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-sm font-semibold text-black-900">Cancel order #{order.order_number}?</p>
              <input
                type="text"
                placeholder="Reason for cancellation…"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-black-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cinnabar-500/20 focus:border-cinnabar-500 placeholder:text-black-300"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (cancelReason.trim()) {
                      onCancel(order.id, cancelReason.trim());
                      setShowCancel(false);
                      setCancelReason("");
                    }
                  }}
                  disabled={!cancelReason.trim() || loading}
                  className="flex-1 bg-cinnabar-500 hover:bg-cinnabar-500/90 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  {loading ? "Cancelling…" : "Confirm Cancel"}
                </button>
                <button
                  onClick={() => { setShowCancel(false); setCancelReason(""); }}
                  className="px-4 text-black-500 border border-black-200 text-sm font-medium rounded-xl hover:bg-black-50 transition-colors duration-150 cursor-pointer"
                >
                  Keep
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending:          { label: "Pending",   className: "bg-dixie-100 text-dixie-500" },
    confirmed:        { label: "Confirmed", className: "bg-purple-50 text-purple-500" },
    preparing:        { label: "Preparing", className: "bg-purple-100 text-purple-600" },
    ready_for_pickup: { label: "Ready",     className: "bg-viridian-100 text-viridian-500" },
    assigned_to_rider:{ label: "Assigned",  className: "bg-viridian-100 text-viridian-500" },
    in_transit:       { label: "In Transit", className: "bg-purple-100 text-purple-700" },
    delivered:        { label: "Delivered", className: "bg-black-100 text-black-400" },
    cancelled:        { label: "Cancelled", className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const c = config[status] ?? { label: status, className: "bg-black-100 text-black-500" };
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", c.className)}>
      {c.label}
    </span>
  );
}
