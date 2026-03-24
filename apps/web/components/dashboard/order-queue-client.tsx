"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import { Inbox, Bike, Store, StickyNote } from "lucide-react";
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
  in_progress: ["preparing", "ready_for_pickup", "in_transit"],
  completed: ["delivered"],
};

interface OrderQueueClientProps {
  restaurantId: string;
  initialOrders: OrderRow[];
}

export function OrderQueueClient({
  restaurantId,
  initialOrders,
}: OrderQueueClientProps) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  const [activeTab, setActiveTab] = useState<Tab>("new");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
            // Fetch full order with items
            const { data } = await supabase
              .from("orders")
              .select(
                `*, order_items (id, item_name, quantity, line_total_kobo, selected_options)`
              )
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

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function playNewOrderSound() {
    try {
      const ctx =
        audioRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
    await supabase
      .from("orders")
      .update({ status: newStatus as OrderRow["status"] })
      .eq("id", orderId);
    setActionLoading(null);
  }

  async function cancelOrder(orderId: string, reason: string) {
    setActionLoading(orderId);
    await supabase
      .from("orders")
      .update({ status: "cancelled", cancellation_reason: reason })
      .eq("id", orderId);
    setActionLoading(null);
  }

  const filteredOrders = orders.filter((o) =>
    TAB_STATUSES[activeTab].includes(o.status)
  );

  const counts = {
    new: orders.filter((o) => TAB_STATUSES.new.includes(o.status)).length,
    in_progress: orders.filter((o) =>
      TAB_STATUSES.in_progress.includes(o.status)
    ).length,
    completed: orders.filter((o) =>
      TAB_STATUSES.completed.includes(o.status)
    ).length,
  };

  return (
    <div className="md:p-6 pb-24">
      {/* Header */}
      <div className="bg-white md:rounded-2xl border-b md:border border-black-100 px-4 py-4">
        <h1 className="font-bold text-black-900 text-lg">Order Queue</h1>
        <p className="text-sm text-black-400">Today</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white md:bg-transparent border-b md:border-0 border-black-100 px-4 md:px-0 mt-0 md:mt-4 gap-1 md:gap-2">
        {(["new", "in_progress", "completed"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 md:py-2 text-sm font-medium border-b-2 md:rounded-xl md:border-0 transition-colors",
              activeTab === tab
                ? "border-viridian-500 text-viridian-500 md:bg-viridian-500/10"
                : "border-transparent text-black-400 hover:text-black-900"
            )}
          >
            {tab === "new" ? "New" : tab === "in_progress" ? "In Progress" : "Done"}
            {counts[tab] > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-bold",
                  activeTab === tab
                    ? "bg-viridian-500 text-white"
                    : "bg-black-100 text-black-500"
                )}
              >
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Order cards */}
      <div className="mt-4 px-4 md:px-0 space-y-3">
        {filteredOrders.length === 0 && (
          <div className="text-center py-12 text-black-400">
            <div className="flex justify-center mb-2"><Inbox size={28} /></div>
            <p className="text-sm">No {activeTab.replace("_", " ")} orders</p>
          </div>
        )}

        {filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onUpdateStatus={updateStatus}
            onCancel={cancelOrder}
            loading={actionLoading === order.id}
          />
        ))}
      </div>
    </div>
  );
}

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

  const nextStatus: Record<string, string | null> = {
    pending: "confirmed",
    confirmed: "preparing",
    preparing: "ready_for_pickup",
    ready_for_pickup: "in_transit",
    in_transit: "delivered",
    delivered: null,
    cancelled: null,
  };

  const actionLabel: Record<string, string> = {
    pending: "Confirm",
    confirmed: "Start Preparing",
    preparing: "Mark Ready",
    ready_for_pickup: "Out for Delivery",
    in_transit: "Mark Delivered",
  };

  const next = nextStatus[order.status];

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border overflow-hidden",
        order.status === "cancelled"
          ? "border-cinnabar-200"
          : "border-black-100"
      )}
    >
      {/* Order header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-black-900 text-sm">
              #{order.order_number}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-black-400 mt-0.5">
            {order.customer_name} · {formatKobo(order.total_kobo)}
          </p>
        </div>
        <span className="text-black-300 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-black-50 px-4 py-3 space-y-3">
          {/* Items */}
          <div className="space-y-1">
            {order.order_items.map((item) => (
              <p key={item.id} className="text-sm text-black-900">
                {item.quantity}× {item.item_name}
              </p>
            ))}
          </div>

          {/* Fulfillment */}
          <div className="text-xs text-black-400">
            {order.fulfillment_type === "delivery" ? (
              <span className="inline-flex items-center gap-1"><Bike size={14} /> Delivery · {order.delivery_address}</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Store size={14} /> Pickup</span>
            )}
          </div>

          {order.special_instructions && (
            <p className="text-xs text-dixie-500 bg-dixie-100 px-3 py-2 rounded-lg inline-flex items-center gap-1">
              <StickyNote size={12} className="flex-shrink-0" /> {order.special_instructions}
            </p>
          )}

          {/* Actions */}
          {next && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onUpdateStatus(order.id, next)}
                disabled={loading}
                className="flex-1 bg-viridian-500 hover:bg-viridian-500/90 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {loading ? "…" : actionLabel[order.status]}
              </button>
              {["pending", "confirmed"].includes(order.status) && (
                <button
                  onClick={() => {
                    const reason = window.prompt("Reason for cancellation?");
                    if (reason) onCancel(order.id, reason);
                  }}
                  disabled={loading}
                  className="px-4 text-cinnabar-500 border border-cinnabar-200 text-sm font-medium rounded-xl hover:bg-cinnabar-100 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-dixie-100 text-dixie-500" },
    confirmed: { label: "Confirmed", className: "bg-viridian-100 text-viridian-500" },
    preparing: { label: "Preparing", className: "bg-viridian-100 text-viridian-500" },
    ready_for_pickup: { label: "Ready", className: "bg-viridian-200 text-viridian-500" },
    in_transit: { label: "In Transit", className: "bg-viridian-100 text-viridian-500" },
    delivered: { label: "Delivered", className: "bg-black-100 text-black-400" },
    cancelled: { label: "Cancelled", className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const c = config[status] ?? { label: status, className: "bg-black-100 text-black-500" };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", c.className)}>
      {c.label}
    </span>
  );
}
