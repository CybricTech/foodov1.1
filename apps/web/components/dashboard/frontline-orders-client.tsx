"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useConnection } from "@/lib/connection-context";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import {
  Inbox,
  Bike,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Clock,
  Volume2,
  VolumeX,
  Package,
  RefreshCw,
} from "lucide-react";
import type { Database } from "@foodo/database";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OptionChoice = {
  choiceId: string;
  choiceName: string;
  priceModifierKobo: number;
  quantity?: number;
};

type OptionSnapshot = {
  optionId: string;
  optionName: string;
  choices: OptionChoice[];
};

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  vat_kobo: number;
  service_fee_kobo: number;
  total_kobo: number;
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: OptionSnapshot[] | null;
  }>;
};

type Column = "new" | "in_progress" | "in_transit" | "completed";

const COLUMN_STATUSES: Record<Column, string[]> = {
  new: ["pending", "confirmed"],
  in_progress: ["preparing"],
  in_transit: ["ready_for_pickup", "assigned_to_rider", "in_transit"],
  completed: ["delivered"],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

function getItemCount(order: OrderRow): number {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
}

/* ------------------------------------------------------------------ */
/*  Column config                                                      */
/* ------------------------------------------------------------------ */

const COLUMN_CONFIG: Record<
  Column,
  {
    label: string;
    accentBg: string;
    accentText: string;
    accentBorder: string;
    badgeBg: string;
    badgeText: string;
    dotColor: string;
  }
> = {
  new: {
    label: "New Orders",
    accentBg: "bg-dixie-50",
    accentText: "text-dixie-600",
    accentBorder: "border-dixie-200",
    badgeBg: "bg-dixie-500",
    badgeText: "text-white",
    dotColor: "bg-dixie-500",
  },
  in_progress: {
    label: "In Progress",
    accentBg: "bg-purple-50",
    accentText: "text-purple-600",
    accentBorder: "border-purple-200",
    badgeBg: "bg-purple-500",
    badgeText: "text-white",
    dotColor: "bg-purple-500",
  },
  in_transit: {
    label: "In Transit",
    accentBg: "bg-blue-50",
    accentText: "text-blue-600",
    accentBorder: "border-blue-200",
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
    dotColor: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    accentBg: "bg-viridian-50",
    accentText: "text-viridian-600",
    accentBorder: "border-viridian-200",
    badgeBg: "bg-viridian-500",
    badgeText: "text-white",
    dotColor: "bg-viridian-500",
  },
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface FrontlineOrdersClientProps {
  restaurantId: string;
  initialOrders: OrderRow[];
}

export function FrontlineOrdersClient({
  restaurantId,
  initialOrders,
}: FrontlineOrdersClientProps) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Column>("new");
  const [alertActive, setAlertActive] = useState(false);
  const [, setTick] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const supabase = createBrowserClient();
  const { reportRealtimeStatus, onReconnect } = useConnection();

  // Refetch the full order list — used after a disconnect to fill in any
  // events that were missed while the realtime channel was down.
  const runCatchup = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id, order_number, status, payment_status, fulfillment_type,
        customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
        vat_kobo, service_fee_kobo, total_kobo, created_at,
        special_instructions, delivery_address,
        order_items (id, item_name, quantity, line_total_kobo, selected_options)
      `
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[frontline] catchup fetch error:", error.message);
      return;
    }
    if (data) {
      setOrders(data as unknown as OrderRow[]);
    }
  }, [restaurantId, supabase]);

  useEffect(() => {
    return onReconnect(runCatchup);
  }, [onReconnect, runCatchup]);

  // Auto-refresh timestamps every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Real-time subscription
  useEffect(() => {
    let intentional = false;
    const channel = supabase
      .channel(`frontline-orders-${restaurantId}`)
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
              .select(
                `*, order_items (id, item_name, quantity, line_total_kobo, selected_options)`
              )
              .eq("id", (payload.new as OrderRow).id)
              .single();
            if (data) {
              const newOrder = data as unknown as OrderRow;
              setOrders((prev) => [newOrder, ...prev]);
              setNewOrderIds((prev) => new Set(prev).add(newOrder.id));
              setAlertActive(true);
              if (soundEnabled) playNewOrderSound();
              // Clear the highlight after 8 seconds
              setTimeout(() => {
                setNewOrderIds((prev) => {
                  const next = new Set(prev);
                  next.delete(newOrder.id);
                  return next;
                });
              }, 8000);
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
      .subscribe((channelStatus) => {
        if (intentional) return;
        if (channelStatus === "SUBSCRIBED") {
          reportRealtimeStatus(true);
        } else if (
          channelStatus === "CHANNEL_ERROR" ||
          channelStatus === "TIMED_OUT"
        ) {
          reportRealtimeStatus(false);
        }
      });

    return () => {
      intentional = true;
      // Reset to healthy on unmount — we no longer have an opinion about
      // realtime status (e.g. user navigated away from /frontline/orders).
      reportRealtimeStatus(true);
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, soundEnabled]);

  const playNewOrderSound = useCallback(() => {
    try {
      const ctx =
        audioRef.current ??
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
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
      // Audio permission not granted
    }
  }, []);

  const updateStatus = useCallback(
    async (orderId: string, newStatus: string) => {
      setActionLoading(orderId);
      setActionError(null);

      // Optimistic update
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus as OrderRow["status"] }
            : o
        )
      );

      try {
        const res = await fetch("/api/dashboard/orders/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, status: newStatus }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update status");
        }
      } catch (err) {
        // Revert optimistic update
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status:
                    initialOrders.find((x) => x.id === orderId)?.status ??
                    o.status,
                }
              : o
          )
        );
        setActionError(
          err instanceof Error ? err.message : "Failed to update order status"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [initialOrders]
  );

  // Column data
  const columns = useMemo(() => {
    const result: Record<Column, OrderRow[]> = {
      new: [],
      in_progress: [],
      in_transit: [],
      completed: [],
    };

    for (const order of orders) {
      if (COLUMN_STATUSES.new.includes(order.status)) {
        result.new.push(order);
      } else if (COLUMN_STATUSES.in_progress.includes(order.status)) {
        result.in_progress.push(order);
      } else if (COLUMN_STATUSES.in_transit.includes(order.status)) {
        result.in_transit.push(order);
      } else if (COLUMN_STATUSES.completed.includes(order.status)) {
        result.completed.push(order);
      }
    }

    return result;
  }, [orders]);

  // Stop alerting once all new orders have been accepted
  const newOrderCount = columns.new.length;
  useEffect(() => {
    if (newOrderCount === 0) setAlertActive(false);
  }, [newOrderCount]);

  // Loop the alert sound every 3 seconds while there are unaccepted orders
  useEffect(() => {
    if (!alertActive || !soundEnabled) return;
    const interval = setInterval(playNewOrderSound, 3000);
    return () => clearInterval(interval);
  }, [alertActive, soundEnabled, playNewOrderSound]);

  const totalActive = columns.new.length + columns.in_progress.length + columns.in_transit.length;

  return (
    <div className="min-h-screen bg-black-50">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-black-900 tracking-tight">
                Kitchen Display
              </h1>
              {columns.new.length > 0 && (
                <span className="flex items-center gap-1 bg-dixie-100 text-dixie-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-dixie-500 rounded-full animate-pulse" />
                  {columns.new.length} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock size={12} className="text-black-400" />
              <p className="text-xs text-black-400">
                {totalActive} active &middot; {columns.completed.length}{" "}
                completed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled((s) => !s)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors duration-150 cursor-pointer border",
                soundEnabled
                  ? "bg-purple-50 text-purple-600 border-purple-200"
                  : "bg-black-50 text-black-400 border-black-200"
              )}
              aria-label={soundEnabled ? "Mute notifications" : "Enable notifications"}
            >
              {soundEnabled ? (
                <Volume2 size={14} />
              ) : (
                <VolumeX size={14} />
              )}
              <span className="hidden sm:inline">
                {soundEnabled ? "Sound on" : "Sound off"}
              </span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-black-500 bg-white border border-black-200 hover:bg-black-50 transition-colors duration-150 cursor-pointer"
              aria-label="Refresh orders"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="px-4 md:px-6 pt-4">
          <div className="bg-cinnabar-100 text-cinnabar-500 text-sm px-4 py-3 rounded-xl border border-cinnabar-200 flex items-center justify-between">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="text-cinnabar-400 hover:text-cinnabar-600 text-xs font-medium cursor-pointer ml-3"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Mobile tab view */}
      <div className="lg:hidden">
        {/* Tab bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-black-100">
          <div className="flex overflow-x-auto scrollbar-none px-1 gap-0.5">
            {(["new", "in_progress", "in_transit", "completed"] as Column[]).map((col) => {
              const config = COLUMN_CONFIG[col];
              const count = columns[col].length;
              const isActive = activeTab === col;
              return (
                <button
                  key={col}
                  onClick={() => setActiveTab(col)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer",
                    isActive
                      ? cn("border-current", config.accentText)
                      : "border-transparent text-black-400 hover:text-black-600"
                  )}
                >
                  {config.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center",
                        isActive
                          ? cn(config.badgeBg, config.badgeText)
                          : "bg-black-100 text-black-500"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4 space-y-3 pb-24">
          {columns[activeTab].length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Inbox size={28} strokeWidth={1.5} className="mb-2 text-black-300" />
              <p className="text-sm font-medium text-black-400">
                {activeTab === "new"
                  ? "No new orders"
                  : activeTab === "in_progress"
                    ? "Nothing in progress"
                    : activeTab === "in_transit"
                      ? "Nothing in transit"
                      : "No completed orders"}
              </p>
              {activeTab === "new" && (
                <p className="text-xs text-black-300 mt-1">New orders appear here in real time</p>
              )}
            </div>
          ) : (
            columns[activeTab].map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-black-100 overflow-hidden"
              >
                <FrontlineOrderCard
                  order={order}
                  column={activeTab}
                  isNew={newOrderIds.has(order.id)}
                  onUpdateStatus={updateStatus}
                  loading={actionLoading === order.id}
                  alwaysExpanded
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop kanban */}
      <div className="hidden lg:block p-6">
        <div className="grid grid-cols-4 gap-5">
          {(["new", "in_progress", "in_transit", "completed"] as Column[]).map((col) => {
            const config = COLUMN_CONFIG[col];
            const colOrders = columns[col];

            return (
              <div key={col} className="flex flex-col min-h-0">
                {/* Column header */}
                <div
                  className={cn(
                    "flex items-center justify-between px-4 py-3 rounded-t-2xl border border-b-0",
                    config.accentBg,
                    config.accentBorder
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        config.dotColor,
                        col === "new" && colOrders.length > 0 && "animate-pulse"
                      )}
                    />
                    <h2 className={cn("text-sm font-bold", config.accentText)}>
                      {config.label}
                    </h2>
                  </div>
                  {colOrders.length > 0 && (
                    <span
                      className={cn(
                        "text-[11px] font-bold min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center",
                        config.badgeBg,
                        config.badgeText
                      )}
                    >
                      {colOrders.length}
                    </span>
                  )}
                </div>

                {/* Column body */}
                <div
                  className={cn(
                    "flex-1 rounded-b-2xl border border-t-0 bg-white overflow-y-auto",
                    config.accentBorder
                  )}
                  style={{ maxHeight: "calc(100vh - 200px)" }}
                >
                  {colOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-black-300">
                      <Inbox size={28} strokeWidth={1.5} className="mb-2" />
                      <p className="text-xs font-medium text-black-400">
                        {col === "new"
                          ? "No new orders"
                          : col === "in_progress"
                            ? "Nothing in progress"
                            : col === "in_transit"
                              ? "Nothing in transit"
                              : "No completed orders"}
                      </p>
                      {col === "new" && (
                        <p className="text-[11px] text-black-300 mt-0.5">
                          New orders appear here in real time
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-black-50">
                      {colOrders.map((order) => (
                        <FrontlineOrderCard
                          key={order.id}
                          order={order}
                          column={col}
                          isNew={newOrderIds.has(order.id)}
                          onUpdateStatus={updateStatus}
                          loading={actionLoading === order.id}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Order Card                                                         */
/* ------------------------------------------------------------------ */

function FrontlineOrderCard({
  order,
  column,
  isNew,
  onUpdateStatus,
  loading,
  alwaysExpanded = false,
}: {
  order: OrderRow;
  column: Column;
  isNew: boolean;
  onUpdateStatus: (id: string, status: string) => void;
  loading: boolean;
  alwaysExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = getItemCount(order);

  return (
    <div
      className={cn(
        "transition-all duration-500",
        isNew && "bg-dixie-50/50 animate-pulse"
      )}
    >
      {/* Card header — always visible */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-black-900 text-sm">
                #{order.order_number}
              </span>
              <FulfillmentBadge type={order.fulfillment_type} />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-black-500 font-medium truncate">
                {order.customer_name}
              </span>
              <span className="text-black-200 text-xs">&middot;</span>
              <span className="text-[11px] text-black-400">
                {formatTimeAgo(order.created_at)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-sm font-bold text-black-900">
                {formatKobo(order.total_kobo)}
              </p>
              <p className="text-[10px] text-black-400 mt-0.5">
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-2 mt-3">
          {column === "new" && (
            <button
              onClick={() => onUpdateStatus(order.id, "preparing")}
              disabled={loading}
              className="flex-1 bg-dixie-500 hover:bg-dixie-400 disabled:opacity-60 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              {loading ? "Updating..." : "Accept"}
            </button>
          )}

          {column === "in_progress" && (
            <button
              onClick={() => onUpdateStatus(order.id, "ready_for_pickup")}
              disabled={loading}
              className="flex-1 bg-viridian-500 hover:bg-viridian-400 disabled:opacity-60 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              {loading ? "Updating..." : "Ready"}
            </button>
          )}

          {/* View toggle — hidden when always expanded */}
          {!alwaysExpanded && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer border",
                expanded
                  ? "bg-purple-50 text-purple-600 border-purple-200"
                  : "bg-white text-black-500 border-black-200 hover:bg-black-50"
              )}
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} />
                  Hide
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  View
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {(expanded || alwaysExpanded) && (
        <div className="border-t border-black-100 bg-black-50/30">
          {/* Items list */}
          <div className="px-4 py-3 space-y-2.5">
            {order.order_items.map((item) => {
              const opts = Array.isArray(item.selected_options)
                ? (item.selected_options as OptionSnapshot[])
                : [];
              return (
                <div key={item.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-purple-50 text-purple-600 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {item.quantity}
                      </span>
                      <span className="text-sm font-medium text-black-900 leading-snug">
                        {item.item_name}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-black-700 flex-shrink-0">
                      {formatKobo(item.line_total_kobo)}
                    </span>
                  </div>
                  {opts.length > 0 && (
                    <div className="ml-7 mt-1 space-y-0.5">
                      {opts.map((opt) =>
                        opt.choices.map((c) => {
                          const qty = c.quantity ?? 1;
                          return (
                            <div
                              key={c.choiceId}
                              className="flex items-center justify-between"
                            >
                              <span className="text-xs text-black-400">
                                {qty > 1 ? `${qty}x ` : ""}
                                {c.choiceName}
                              </span>
                              {c.priceModifierKobo > 0 && (
                                <span className="text-xs text-black-400">
                                  +{formatKobo(c.priceModifierKobo * qty)}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Special instructions */}
          {order.special_instructions && (
            <div className="px-4 pb-3">
              <div className="flex items-start gap-2 bg-dixie-50 border border-dixie-100 text-dixie-600 text-xs px-3 py-2 rounded-lg">
                <StickyNote
                  size={12}
                  className="flex-shrink-0 mt-0.5"
                />
                <span>{order.special_instructions}</span>
              </div>
            </div>
          )}

          {/* Delivery address */}
          {order.fulfillment_type === "delivery" && order.delivery_address && (
            <div className="px-4 pb-3">
              <p className="text-xs text-black-500 leading-relaxed">
                <span className="font-medium text-black-600">Deliver to:</span>{" "}
                {order.delivery_address}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fulfillment Badge                                                  */
/* ------------------------------------------------------------------ */

function FulfillmentBadge({ type }: { type: string | null }) {
  if (type === "delivery") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
        <Bike size={10} />
        Delivery
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black-100 text-black-500">
      <Package size={10} />
      Pickup
    </span>
  );
}
