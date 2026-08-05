"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  formatKobo,
  getOrderQueueBucket,
  formatLagosSlotLabel,
  isPlatformRiderEngaged,
  laneForPolicy,
  policyShowsDispatchPicker,
  type DispatchPolicy,
  type OpeningHours,
  type SchedulingSettings,
} from "@foodo/utils";
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
  Radio,
  UserCheck,
  CalendarClock,
  Zap,
  Users,
} from "lucide-react";
import type { Database } from "@foodo/database";
import { ScheduleSlotPicker } from "@/components/storefront/schedule-slot-picker";

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
  discount_kobo: number;
  discount_code: string | null;
  total_kobo: number;
  // Scheduled orders (087) — explicit here until types are regenerated.
  scheduled_for: string | null;
  activated_at: string | null;
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: OptionSnapshot[] | null;
    // Embedded from menu_items so the confirm dialog can default the ETA to the
    // longest item prep time. Null when the menu item was since deleted.
    menu_items?: { prep_time_minutes: number | null } | null;
  }>;
};

/**
 * What the merchant is told about the Kitchyn rider, keyed on the order's
 * rider-side state (migration 101). Shown alongside their own cooking actions,
 * not instead of them.
 */
const RIDER_PROGRESS_LABELS: Record<string, string> = {
  requested: "Getting you a Kitchyn rider",
  booked: "Finding a Kitchyn rider",
  driver_assigned: "Kitchyn rider on the way to you",
  picked_up: "Kitchyn rider has the order",
  delivered: "Delivered by Kitchyn rider",
  failed: "Trouble finding a rider — we're on it",
};

/** Platform fallback when no item carries a prep time (matches the checkout webhook). */
const DEFAULT_PREP_MINUTES = 20;

/** The order's default estimated-ready time: the longest prep time of its items. */
function defaultPrepMinutes(order: OrderRow): number {
  const times = order.order_items
    .map((i) => i.menu_items?.prep_time_minutes)
    .filter((p): p is number => typeof p === "number" && p > 0);
  return times.length > 0 ? Math.max(...times) : DEFAULT_PREP_MINUTES;
}

type Tab = "scheduled" | "new" | "in_progress" | "completed";

interface OrderQueueClientProps {
  restaurantId: string;
  initialOrders: OrderRow[];
  /** Server-side exact count of delivered orders for this restaurant. Used as
   *  the base for the "Completed" badge so it isn't capped by the row limit. */
  initialCompletedTotal: number;
  /** Normalized restaurant scheduling config — drives the Scheduled tab +
   *  reschedule picker. */
  schedulingSettings: SchedulingSettings;
  openingHours: OpeningHours | null;
  /**
   * How this merchant's deliveries are handled (migration 101). Decides whether
   * the "who delivers this?" picker appears at all:
   *   platform  never — a Kitchyn rider is requested automatically before the
   *             food is ready, so there is nothing to ask
   *   in_house  never — their own rider always takes it
   *   hybrid    always — they choose per order
   */
  dispatchPolicy: DispatchPolicy;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

/** "in 2h 15m" / "in 12m" / "now" — countdown to a scheduled slot. */
function formatUntil(dateStr: string): string {
  const diffMin = Math.round((new Date(dateStr).getTime() - Date.now()) / 60_000);
  if (diffMin <= 0) return "now";
  if (diffMin < 60) return `in ${diffMin}m`;
  const days = Math.floor(diffMin / 1440);
  if (days >= 1) return `in ${days}d ${Math.floor((diffMin % 1440) / 60)}h`;
  return `in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
}

export function OrderQueueClient({
  restaurantId,
  initialOrders,
  initialCompletedTotal,
  schedulingSettings,
  openingHours,
  dispatchPolicy,
}: OrderQueueClientProps) {
  const [orders, setOrders] = useState<OrderRow[]>(initialOrders);
  // Refresh scheduled-slot countdowns every 30s.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Track which delivered orders were already counted in initialCompletedTotal
  // so live transitions to "delivered" can be added on top without double-counting.
  const initialDeliveredIds = useMemo(
    () => new Set(initialOrders.filter((o) => o.status === "delivered").map((o) => o.id)),
    [initialOrders]
  );
  const [activeTab, setActiveTab] = useState<Tab>("new");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  // Live snapshot for the realtime UPDATE handler (bound once) so it can
  // detect bucket transitions — e.g. a scheduled order activating into "new".
  const ordersRef = useRef<OrderRow[]>(initialOrders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
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
              .select(`*, order_items (id, item_name, quantity, line_total_kobo, selected_options, menu_items (prep_time_minutes))`)
              .eq("id", (payload.new as OrderRow).id)
              .single();
            if (data) {
              const incoming = data as unknown as OrderRow;
              setOrders((prev) =>
                prev.some((o) => o.id === incoming.id) ? prev : [incoming, ...prev]
              );
              playNewOrderSound();
              // A pre-order booking lands in Scheduled, not New — don't hijack
              // the live queue for something due hours from now.
              setActiveTab(
                getOrderQueueBucket(incoming) === "scheduled" ? "scheduled" : "new"
              );
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Partial<OrderRow> & { id: string };
            // Activation moment (cron or pull-forward on another device):
            // scheduled → new must FEEL like a new order — chime + jump —
            // or it silently slides between tabs and gets missed.
            const prevRow = ordersRef.current.find((o) => o.id === updated.id);
            if (
              prevRow &&
              getOrderQueueBucket(prevRow) === "scheduled" &&
              getOrderQueueBucket({ ...prevRow, ...updated }) === "new"
            ) {
              playNewOrderSound();
              setActiveTab("new");
            }
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
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

  async function updateStatus(
    orderId: string,
    newStatus: string,
    estimatedReadyMinutes?: number
  ) {
    setActionLoading(orderId);
    setActionError(null);
    const previous = orders.find((x) => x.id === orderId)?.status;
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as OrderRow["status"] } : o))
    );
    try {
      const res = await fetch("/api/dashboard/orders/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          status: newStatus,
          ...(estimatedReadyMinutes != null ? { estimatedReadyMinutes } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Failed to update status");
      }
      // Mark Ready at a platform merchant requests a rider inside that same
      // call, so the response carries the resulting rider track. Applying it
      // here is what turns the button into the "Kitchyn rider handling" pill
      // immediately, rather than leaving it to a Realtime event that may be
      // seconds away — or, on a flaky kitchen tablet, never arrive.
      const dispatch = (data as { dispatch?: Partial<OrderRow> }).dispatch;
      if (dispatch) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...dispatch } : o))
        );
      }
    } catch (err) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: previous ?? o.status } : o))
      );
      setActionError(
        err instanceof Error ? err.message : "Failed to update order status. Please try again."
      );
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

  async function dispatchOrder(orderId: string, dispatchType: "platform_rider" | "own_rider") {
    setActionLoading(orderId);
    setActionError(null);

    // Snapshot every field this function touches, so a failure restores the row
    // exactly. The previous version rolled back `status` alone — and read it out
    // of the `orders` closure, which is the pre-optimistic-update array only by
    // luck of render timing.
    const before = orders.find((x) => x.id === orderId);
    const rollback = (o: OrderRow): OrderRow =>
      before
        ? {
            ...o,
            status: before.status,
            dispatch_type: before.dispatch_type,
            dispatch_state: before.dispatch_state,
            rider_requested_at: before.rider_requested_at,
          }
        : o;

    // The platform lane no longer moves orders.status — the rider is tracked
    // separately (migration 101), and the food stays "ready" until a rider
    // actually collects it. Only the in-house lane is a real status change.
    //
    // dispatch_type and rider_requested_at are set here too, not just
    // dispatch_state: together they are what makes platformRiderHandling true,
    // which is what swaps the picker for the "Kitchyn rider handling" pill.
    // Setting dispatch_state alone left the merchant staring at the same two
    // buttons after a successful dispatch.
    const isPlatform = dispatchType === "platform_rider";
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              ...(isPlatform
                ? {
                    dispatch_type: dispatchType,
                    dispatch_state: "requested",
                    rider_requested_at: new Date().toISOString(),
                  }
                : {
                    status: "in_transit" as OrderRow["status"],
                    dispatch_type: dispatchType,
                    dispatch_state: "not_required",
                  }),
            }
          : o
      )
    );

    try {
      const res = await fetch("/api/dashboard/orders/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, dispatch_type: dispatchType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? rollback(o) : o)));
        setActionError((data as { error?: string }).error ?? "Failed to dispatch order.");
      } else if ((data as { dispatch?: Partial<OrderRow> }).dispatch) {
        // Replace the optimistic guess with what the server actually wrote.
        const dispatch = (data as { dispatch: Partial<OrderRow> }).dispatch;
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...dispatch } : o))
        );
      }
    } catch {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? rollback(o) : o)));
      setActionError("Network error");
    }
    setActionLoading(null);
  }

  // ── Scheduled-order actions ────────────────────────────────────────────────

  async function activateNow(orderId: string) {
    setActionLoading(orderId);
    setActionError(null);
    const previous = orders.find((x) => x.id === orderId)?.activated_at ?? null;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, activated_at: new Date().toISOString() } : o
      )
    );
    try {
      const res = await fetch("/api/dashboard/orders/activate-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to start the order");
      }
      // The order is live now — take the merchant to it.
      setActiveTab("new");
    } catch (err) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, activated_at: previous } : o))
      );
      setActionError(err instanceof Error ? err.message : "Failed to start the order.");
    }
    setActionLoading(null);
  }

  async function rescheduleOrder(orderId: string, newSlotIso: string) {
    setActionLoading(orderId);
    setActionError(null);
    const previous = orders.find((x) => x.id === orderId)?.scheduled_for ?? null;
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, scheduled_for: newSlotIso } : o))
    );
    try {
      const res = await fetch("/api/dashboard/orders/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, scheduledFor: newSlotIso }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to reschedule");
      }
    } catch (err) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, scheduled_for: previous } : o))
      );
      setActionError(err instanceof Error ? err.message : "Failed to reschedule.");
    }
    setActionLoading(null);
  }

  async function declineScheduled(orderId: string, reason: string) {
    setActionLoading(orderId);
    setActionError(null);
    const previous = orders.find((x) => x.id === orderId)?.status;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "cancelled" as OrderRow["status"] } : o
      )
    );
    try {
      const res = await fetch("/api/dashboard/orders/decline-scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to decline");
      }
    } catch (err) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: (previous ?? o.status) as OrderRow["status"] } : o
        )
      );
      setActionError(err instanceof Error ? err.message : "Failed to decline the order.");
    }
    setActionLoading(null);
  }

  const filteredOrders = orders
    .filter((o) => getOrderQueueBucket(o) === activeTab)
    // Scheduled: soonest slot first (the queue is otherwise newest-created first).
    .sort((a, b) =>
      activeTab === "scheduled"
        ? new Date(a.scheduled_for ?? 0).getTime() - new Date(b.scheduled_for ?? 0).getTime()
        : 0
    );

  // Soft per-slot capacity: how many pending pre-orders share each exact slot.
  const slotCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (o.scheduled_for && getOrderQueueBucket(o) === "scheduled") {
        counts.set(o.scheduled_for, (counts.get(o.scheduled_for) ?? 0) + 1);
      }
    }
    return counts;
  }, [orders]);

  // Group completed orders by calendar date for the date-divider UI
  const completedByDate = useMemo(() => {
    if (activeTab !== "completed") return null;
    const groups: { label: string; orders: typeof filteredOrders }[] = [];
    const seen = new Map<string, number>();
    const nowDate = new Date();
    const todayKey = nowDate.toDateString();
    const yesterdayKey = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1).toDateString();
    for (const o of filteredOrders) {
      const d = new Date(o.created_at);
      const key = d.toDateString();
      let label: string;
      if (key === todayKey) {
        label = "Today";
      } else if (key === yesterdayKey) {
        label = "Yesterday";
      } else {
        label = d.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      }
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ label, orders: [] });
      }
      groups[seen.get(key)!].orders.push(o);
    }
    return groups;
  }, [activeTab, filteredOrders]);

  // Completed badge = server-side total + any orders that became delivered live
  // (i.e. weren't already counted in the initial server total).
  const liveCompletedDelta = orders.filter(
    (o) => o.status === "delivered" && !initialDeliveredIds.has(o.id)
  ).length;

  const counts = {
    scheduled: orders.filter((o) => getOrderQueueBucket(o) === "scheduled").length,
    new: orders.filter((o) => getOrderQueueBucket(o) === "new").length,
    in_progress: orders.filter((o) => getOrderQueueBucket(o) === "in_progress").length,
    completed: initialCompletedTotal + liveCompletedDelta,
  };

  // The Scheduled tab shows when pre-orders are enabled OR when bookings
  // already exist (a merchant who just paused scheduling must still see them).
  const showScheduledTab = schedulingSettings.enabled || counts.scheduled > 0;

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
            {counts.scheduled > 0 && (
              <>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock size={12} />
                  {counts.scheduled} scheduled
                </span>
                <span className="w-px h-3 bg-black-200" />
              </>
            )}
            <span>{counts.new + counts.in_progress} active</span>
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
              ...(showScheduledTab
                ? [{ key: "scheduled" as Tab, label: "Scheduled" }]
                : []),
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
      <div className="px-4 md:px-6 py-4 max-w-2xl">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-black-300">
            <Inbox size={36} strokeWidth={1.5} className="mb-3" />
            <p className="text-sm font-medium text-black-400">
              {activeTab === "scheduled"
                ? "No scheduled orders"
                : activeTab === "new"
                ? "No new orders yet"
                : activeTab === "in_progress"
                ? "Nothing in progress"
                : "No completed orders yet"}
            </p>
            <p className="text-xs text-black-300 mt-1">
              {activeTab === "new"
                ? "New orders will appear here in real time"
                : activeTab === "scheduled"
                ? "Pre-orders customers book ahead will appear here"
                : ""}
            </p>
          </div>
        ) : completedByDate ? (
          <div className="space-y-6">
            {completedByDate.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-black-400 uppercase tracking-wide mb-3">
                  {group.label}
                </p>
                <div className="space-y-3">
                  {group.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onUpdateStatus={updateStatus}
                      onDispatch={dispatchOrder}
                      onCancel={cancelOrder}
                      onActivateNow={activateNow}
                      onReschedule={rescheduleOrder}
                      onDeclineScheduled={declineScheduled}
                      schedulingSettings={schedulingSettings}
                      openingHours={openingHours}
                      dispatchPolicy={dispatchPolicy}
                      slotCount={order.scheduled_for ? slotCounts.get(order.scheduled_for) ?? 1 : 0}
                      loading={actionLoading === order.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdateStatus={updateStatus}
                onDispatch={dispatchOrder}
                onCancel={cancelOrder}
                onActivateNow={activateNow}
                onReschedule={rescheduleOrder}
                onDeclineScheduled={declineScheduled}
                schedulingSettings={schedulingSettings}
                openingHours={openingHours}
                dispatchPolicy={dispatchPolicy}
                slotCount={order.scheduled_for ? slotCounts.get(order.scheduled_for) ?? 1 : 0}
                loading={actionLoading === order.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Card ──────────────────────────────────────────────────────────────


function OrderCard({
  order,
  onUpdateStatus,
  onDispatch,
  onCancel,
  onActivateNow,
  onReschedule,
  onDeclineScheduled,
  schedulingSettings,
  openingHours,
  dispatchPolicy,
  slotCount,
  loading,
}: {
  order: OrderRow;
  onUpdateStatus: (id: string, status: string, estimatedReadyMinutes?: number) => void;
  onDispatch: (orderId: string, dispatchType: "platform_rider" | "own_rider") => void;
  dispatchPolicy: DispatchPolicy;
  onCancel: (id: string, reason: string) => void;
  onActivateNow: (id: string) => void;
  onReschedule: (id: string, newSlotIso: string) => void;
  onDeclineScheduled: (id: string, reason: string) => void;
  schedulingSettings: SchedulingSettings;
  openingHours: OpeningHours | null;
  /** Pending pre-orders sharing this exact slot (soft capacity indicator). */
  slotCount: number;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Confirm dialog lets the merchant adjust the estimated-ready time (pre-filled
  // with the longest item prep time) before the order moves to confirmed.
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMinutes, setConfirmMinutes] = useState<number>(20);
  // Scheduled-order panels (decline reason / reschedule slot).
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);

  const isScheduled = getOrderQueueBucket(order) === "scheduled";
  const capacity = schedulingSettings.capacity_per_slot;

  // Once a Kitchyn rider has the order, completion is handled exclusively from
  // the admin riders page. The merchant sees a status pill, not an action.
  //
  // Keyed off the rider request rather than orders.status, because since
  // migration 101 the request can land while the food is still cooking. Shared
  // with the API so the button the merchant sees and the transition the server
  // accepts can never disagree — see isPlatformRiderEngaged.
  const platformRiderHandling = isPlatformRiderEngaged(order);

  const nextStatus: Record<string, string | null> = {
    pending:           "confirmed",
    confirmed:         "preparing",
    preparing:         "ready_for_pickup",
    // ready_for_pickup is handled by the delivery choice UI for delivery orders
    ready_for_pickup:  "in_transit",
    assigned_to_rider: null,
    in_transit:        "delivered",
    delivered:         null,
    cancelled:         null,
  };

  const actionLabel: Record<string, string> = {
    pending:           "Confirm Order",
    confirmed:         "Start Preparing",
    preparing:         "Mark Ready",
    ready_for_pickup:  "Customer Collected",   // only shown for pickup orders
    in_transit:        "Mark Delivered",
  };

  // The rider being on their way does NOT mean the merchant is finished. Under
  // time-driven requests a Kitchyn rider is sought up to a lead time before the
  // food is ready, so the merchant must keep Mark Ready while it cooks; only
  // once the food is out of their hands do they have nothing left to do. Taking
  // the button away at request time is precisely the lock-out migration 101
  // exists to remove.
  const platformRiderLocksActions =
    platformRiderHandling &&
    ["ready_for_pickup", "assigned_to_rider", "in_transit"].includes(order.status);

  let next = platformRiderLocksActions ? null : nextStatus[order.status];

  // The picker only exists for HYBRID merchants (migration 101). A platform
  // merchant's rider is requested automatically before the food is ready, and an
  // in-house merchant always uses their own — asking either of them "who
  // delivers this?" is a question with one answer they never chose.
  //
  // ...and only until they answer it. Without the platformRiderHandling check a
  // hybrid merchant who picked "Platform Rider" was still being asked to choose,
  // on an order whose rider was already booked and paid for.
  const needsDeliveryChoice =
    order.status === "ready_for_pickup" &&
    order.fulfillment_type === "delivery" &&
    policyShowsDispatchPicker(dispatchPolicy) &&
    !platformRiderHandling;

  /* ── The one button on a ready delivery order ───────────────────────────────
   * A cooked delivery order that no Kitchyn rider is on yet. Which lane that
   * single button commits it to is decided by the merchant's policy, never by
   * the button's own wording:
   *
   *   in_house  their rider is leaving with it now         → own_rider
   *   platform  the automatic request did not happen (or
   *             failed); the useful action is to go and
   *             get one, not to pretend it left            → platform_rider
   *   hybrid    they are shown the picker instead, so this
   *             is null and no primary button renders
   *
   * It routes through onDispatch, NOT onUpdateStatus. "Hand to Rider" used to
   * post status = in_transit to update-status, which moves the status and does
   * nothing else — no delivery_assignments row, no delivery-fee split committed
   * to the wallet ledger, no dispatch_type stamped, and no "on its way" SMS to
   * the customer. The order looked dispatched and settled as though nobody had
   * delivered it.
   */
  const policyLane = laneForPolicy(dispatchPolicy);
  const readyDeliveryLane: "platform_rider" | "own_rider" | null =
    order.status === "ready_for_pickup" &&
    order.fulfillment_type === "delivery" &&
    !needsDeliveryChoice &&
    !platformRiderHandling &&
    (policyLane === "platform_rider" || policyLane === "own_rider")
      ? policyLane
      : null;

  // A DELIVERY order never reaches in_transit through update-status — see above.
  // Nulling `next` here makes that structural rather than a matter of which
  // onClick a future edit happens to wire up.
  if (order.status === "ready_for_pickup" && order.fulfillment_type === "delivery") {
    next = null;
  }
  // Pickup orders are never "in transit" — collecting completes them, so
  // "Customer Collected" goes straight from ready_for_pickup to delivered.
  if (order.status === "ready_for_pickup" && order.fulfillment_type === "pickup") {
    next = "delivered";
  }

  const resolvedActionLabel =
    readyDeliveryLane === "own_rider"
      ? "Hand to Rider"
      : readyDeliveryLane === "platform_rider"
        ? "Request a Kitchyn rider"
        : actionLabel[order.status];

  const canCancel = ["pending", "confirmed"].includes(order.status);

  return (
    <div className="bg-white rounded-2xl border border-black-100 overflow-hidden shadow-card">
      {/* ── Card header ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-4 py-3.5 flex items-start justify-between text-left cursor-pointer hover:bg-black-50 transition-colors duration-150"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-black-900 text-sm">#{order.order_number}</span>
            {isScheduled ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-dixie-100 text-dixie-500">
                <CalendarClock size={11} />
                Scheduled
              </span>
            ) : (
              <StatusBadge status={order.status} fulfillmentType={order.fulfillment_type} />
            )}
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
            {isScheduled && order.scheduled_for ? (
              <p className="text-[10px] font-bold text-dixie-500 mt-0.5">
                starts {formatUntil(order.scheduled_for)}
              </p>
            ) : (
              <p className="text-[10px] text-black-300 mt-0.5">{formatTimeAgo(order.created_at)}</p>
            )}
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

          {/* Scheduled slot banner */}
          {isScheduled && order.scheduled_for && (
            <div className="px-4 py-3 bg-dixie-100/40">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} className="text-dixie-500 flex-shrink-0" />
                  <p className="text-sm font-bold text-black-900">
                    {formatLagosSlotLabel(new Date(order.scheduled_for))}
                  </p>
                </div>
                {capacity != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                      slotCount >= capacity
                        ? "bg-cinnabar-100 text-cinnabar-500"
                        : "bg-black-100 text-black-500"
                    )}
                    title="Pre-orders booked for this exact slot (informational — booking is never blocked)"
                  >
                    <Users size={11} />
                    {slotCount}/{capacity} this slot
                  </span>
                )}
              </div>
              <p className="text-[11px] text-black-400 mt-1">
                Paid in full — enters your live queue automatically at the booked time.
              </p>
            </div>
          )}

          {/* Items */}
          <div className="px-4 py-3 space-y-3">
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
                      <span className="text-sm font-medium text-black-900 leading-snug">{item.item_name}</span>
                    </div>
                    <span className="text-sm font-semibold text-black-900 flex-shrink-0">
                      {formatKobo(item.line_total_kobo)}
                    </span>
                  </div>
                  {opts.length > 0 && (
                    <div className="ml-7 mt-1 space-y-0.5">
                      {opts.map((opt) =>
                        opt.choices.map((c) => {
                          const qty = c.quantity ?? 1;
                          return (
                            <div key={c.choiceId} className="flex items-center justify-between">
                              <span className="text-xs text-black-400">
                                {qty > 1 ? `${qty}× ` : ""}{c.choiceName}
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

          {/* Price breakdown */}
          <div className="px-4 py-3 space-y-1.5 bg-black-50">
            <div className="flex justify-between text-xs text-black-500">
              <span>Items</span>
              <span>{formatKobo(order.subtotal_kobo)}</span>
            </div>
            {order.fulfillment_type === "delivery" && (
              <div className="flex justify-between text-xs text-black-500">
                <span>Delivery fee</span>
                <span>{order.delivery_fee_kobo > 0 ? formatKobo(order.delivery_fee_kobo) : "Free"}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-black-500">
              <span>VAT</span>
              <span>{order.vat_kobo > 0 ? formatKobo(order.vat_kobo) : "₦0.00"}</span>
            </div>
            {order.service_fee_kobo > 0 && (
              <div className="flex justify-between text-xs text-black-500">
                <span>Service fee</span>
                <span>{formatKobo(order.service_fee_kobo)}</span>
              </div>
            )}
            {order.discount_kobo > 0 && (
              <div className="flex justify-between text-xs text-purple-600 font-medium">
                <span>Discount{order.discount_code ? ` (${order.discount_code})` : ""}</span>
                <span>−{formatKobo(order.discount_kobo)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-black-900 pt-1.5 border-t border-black-200">
              <span>Total</span>
              <span>{formatKobo(order.total_kobo)}</span>
            </div>
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

          {/* ── Scheduled-order actions ── */}
          {isScheduled && !showDecline && !showReschedule && (
            <div className="px-4 py-3 space-y-2">
              <button
                onClick={() => onActivateNow(order.id)}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Zap size={14} />
                {loading ? "Starting…" : "Pull forward — start now"}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReschedule(true)}
                  disabled={loading}
                  className="flex-1 px-4 text-black-600 border border-black-200 text-sm font-medium rounded-xl hover:bg-black-50 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                >
                  Reschedule
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  disabled={loading}
                  className="flex-1 px-4 text-cinnabar-500 border border-cinnabar-200 text-sm font-medium rounded-xl hover:bg-cinnabar-100 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Inline reschedule panel — compact day/time picker built from the
              SAME shared slot generator the storefront picker uses. */}
          {isScheduled && showReschedule && (
            <div className="px-4 py-3 space-y-3">
              <p className="text-sm font-semibold text-black-900">
                Reschedule order #{order.order_number}
              </p>
              <ScheduleSlotPicker
                openingHours={openingHours}
                schedulingSettings={schedulingSettings}
                value={null}
                onChange={(iso) => {
                  if (iso) {
                    onReschedule(order.id, iso);
                    setShowReschedule(false);
                  }
                }}
              />
              <button
                onClick={() => setShowReschedule(false)}
                className="w-full text-black-500 border border-black-200 text-sm font-medium rounded-xl py-2.5 hover:bg-black-50 transition-colors duration-150 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Inline decline panel — requires a reason (sent to the customer). */}
          {isScheduled && showDecline && (
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-sm font-semibold text-black-900">
                Decline order #{order.order_number}?
              </p>
              <p className="text-xs text-black-400">
                The customer will be notified by SMS and a refund processed manually.
              </p>
              <input
                type="text"
                placeholder="Reason (shown to the customer)…"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-black-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cinnabar-500/20 focus:border-cinnabar-500 placeholder:text-black-300"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (declineReason.trim()) {
                      onDeclineScheduled(order.id, declineReason.trim());
                      setShowDecline(false);
                      setDeclineReason("");
                    }
                  }}
                  disabled={!declineReason.trim() || loading}
                  className="flex-1 bg-cinnabar-500 hover:bg-cinnabar-500/90 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  {loading ? "Declining…" : "Confirm Decline"}
                </button>
                <button
                  onClick={() => { setShowDecline(false); setDeclineReason(""); }}
                  className="px-4 text-black-500 border border-black-200 text-sm font-medium rounded-xl hover:bg-black-50 transition-colors duration-150 cursor-pointer"
                >
                  Keep
                </button>
              </div>
            </div>
          )}

          {/* ── Delivery method picker ── */}
          {!isScheduled && needsDeliveryChoice && !showCancel && (
            <div className="px-4 py-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-black-900">Choose delivery method</p>
                <p className="text-xs text-black-400 mt-0.5">How will this order reach the customer?</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Platform rider */}
                <button
                  onClick={() => onDispatch(order.id, "platform_rider")}
                  disabled={loading}
                  className="flex flex-col items-start gap-2.5 p-3.5 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:border-purple-400 hover:bg-purple-100 disabled:opacity-60 transition-all duration-150 cursor-pointer text-left group"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600 transition-colors duration-150">
                    <Radio size={17} className="text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-purple-700 leading-tight">Platform Rider</p>
                    <p className="text-[11px] text-purple-500 mt-0.5 leading-snug">Request a rider from the app</p>
                  </div>
                </button>

                {/* In-house rider */}
                <button
                  onClick={() => onDispatch(order.id, "own_rider")}
                  disabled={loading}
                  className="flex flex-col items-start gap-2.5 p-3.5 rounded-2xl border-2 border-black-200 bg-white hover:border-black-400 hover:bg-black-50 disabled:opacity-60 transition-all duration-150 cursor-pointer text-left group"
                >
                  <div className="w-9 h-9 rounded-xl bg-black-900 flex items-center justify-center flex-shrink-0 group-hover:bg-black-700 transition-colors duration-150">
                    <UserCheck size={17} className="text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black-900 leading-tight">In-House</p>
                    <p className="text-[11px] text-black-400 mt-0.5 leading-snug">Your own rider handles it</p>
                  </div>
                </button>
              </div>
              {loading && (
                <p className="text-xs text-center text-black-400 animate-pulse">Updating…</p>
              )}
            </div>
          )}

          {/* ── Platform-rider handover indicator ── */}
          {!isScheduled && platformRiderHandling && !showCancel && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-purple-50 border border-purple-100 text-purple-700">
                <Radio size={14} className="flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-bold leading-tight">
                    {RIDER_PROGRESS_LABELS[order.dispatch_state ?? ""] ??
                      "Kitchyn rider handling delivery"}
                  </p>
                  <p className="text-[11px] text-purple-500 mt-0.5 leading-snug">
                    {platformRiderLocksActions
                      ? "We'll mark this delivered once the customer has it."
                      : "Carry on cooking — we're getting a rider to you for when it's ready."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Normal action buttons (non-delivery-choice states) ── */}
          {!isScheduled && !platformRiderLocksActions && !needsDeliveryChoice && (next || readyDeliveryLane || canCancel) && !showCancel && (
            <div className="px-4 py-3 flex gap-2">
              {(next || readyDeliveryLane) && (
                <button
                  onClick={() => {
                    // First acceptance of a new paid order (pending→confirmed or
                    // confirmed→preparing) opens the ETA dialog; later transitions
                    // (preparing→ready, etc.) go straight through.
                    if (order.status === "pending" || order.status === "confirmed") {
                      setConfirmMinutes(defaultPrepMinutes(order));
                      setShowConfirm(true);
                    } else if (readyDeliveryLane) {
                      // Committing a lane is never a bare status write — the
                      // dispatch route owns the assignment row, the delivery-fee
                      // split and the customer's SMS.
                      onDispatch(order.id, readyDeliveryLane);
                    } else if (next) {
                      onUpdateStatus(order.id, next);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  {loading ? "Updating…" : resolvedActionLabel}
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

          {/* Inline confirm-with-ETA panel — pre-filled with the longest item
              prep time; merchant accepts or adjusts before confirming. */}
          {showConfirm && (
            <div className="px-4 py-3 space-y-3">
              <div>
                <p className="text-sm font-semibold text-black-900">Confirm order #{order.order_number}</p>
                <p className="text-xs text-black-400 mt-0.5">
                  How long until it&rsquo;s ready? The customer sees this estimate.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmMinutes((m) => Math.max(1, m - 5))}
                  disabled={loading}
                  className="w-10 h-10 rounded-xl border border-black-200 text-black-600 text-lg font-semibold hover:bg-black-50 transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Decrease 5 minutes"
                >
                  −
                </button>
                <div className="flex items-baseline gap-1.5 min-w-[7rem] justify-center">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={confirmMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setConfirmMinutes(Number.isFinite(v) ? Math.min(240, Math.max(1, v)) : 1);
                    }}
                    className="w-16 text-center text-2xl font-extrabold text-black-900 border-b-2 border-black-200 focus:outline-none focus:border-purple-500 tabular-nums"
                  />
                  <span className="text-sm text-black-500">min</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmMinutes((m) => Math.min(240, m + 5))}
                  disabled={loading}
                  className="w-10 h-10 rounded-xl border border-black-200 text-black-600 text-lg font-semibold hover:bg-black-50 transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Increase 5 minutes"
                >
                  +
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (next) onUpdateStatus(order.id, next, confirmMinutes);
                    setShowConfirm(false);
                  }}
                  disabled={loading}
                  className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors duration-150 cursor-pointer"
                >
                  {loading ? "Confirming…" : resolvedActionLabel ?? "Confirm Order"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 text-black-500 border border-black-200 text-sm font-medium rounded-xl hover:bg-black-50 transition-colors duration-150 cursor-pointer"
                >
                  Back
                </button>
              </div>
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

function StatusBadge({ status, fulfillmentType }: { status: string; fulfillmentType?: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending:          { label: "Pending",   className: "bg-dixie-100 text-dixie-500" },
    confirmed:        { label: "Confirmed", className: "bg-purple-50 text-purple-500" },
    preparing:        { label: "Preparing", className: "bg-purple-100 text-purple-600" },
    ready_for_pickup: { label: "Ready",     className: "bg-viridian-100 text-viridian-500" },
    assigned_to_rider:{ label: "Assigned",  className: "bg-viridian-100 text-viridian-500" },
    in_transit:       { label: "In Transit", className: "bg-purple-100 text-purple-700" },
    // A collected pickup order ends as "delivered" internally — show "Collected".
    delivered:        {
      label: fulfillmentType === "pickup" ? "Collected" : "Delivered",
      className: "bg-black-100 text-black-400",
    },
    cancelled:        { label: "Cancelled", className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const c = config[status] ?? { label: status, className: "bg-black-100 text-black-500" };
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", c.className)}>
      {c.label}
    </span>
  );
}
