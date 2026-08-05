/**
 * Orders kanban screen — RN port of the web `FrontlineOrdersClient`.
 *
 * Parity checklist (all ported from web):
 *   - Initial load + reconnect catch-up use the SAME 200-row select.
 *   - Supabase Realtime channel `frontline-orders-${restaurantId}` with INSERT
 *     (fetch full row, prepend, highlight, chime) / UPDATE (merge) handling.
 *   - Channel status → connection context (SUBSCRIBED healthy; ERROR/TIMED_OUT
 *     unhealthy) so the banner + onReconnect catch-up fire. Realtime does NOT
 *     replay missed events, so reconnect refetches the latest 200 and replaces.
 *   - Repeating new-order chime every 3s while there are un-accepted orders,
 *     with an in-memory mute toggle.
 *   - Status actions + rider dispatch via the Bearer-authed API (graceful
 *     platform-rider 403 + optimistic update w/ revert).
 *
 * Mobile UX: a top tab strip (New / In Progress / In Transit / Completed) like
 * the web mobile view, with a scrollable, large-tap-target card list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useSegments } from "expo-router";

import {
  laneForPolicy,
  normalizeSchedulingSettings,
  resolveDispatchPolicy,
  type DispatchPolicy,
  type OpeningHours,
  type SchedulingSettings,
} from "@foodo/utils";

import { getSupabase } from "../../lib/supabase";
import { useConnection } from "../../lib/connection";
import {
  updateOrderStatus,
  dispatchOrder,
  activateScheduledOrder,
  rescheduleOrder,
  declineScheduledOrder,
  ApiError,
} from "../../lib/api";
import { capture } from "../../lib/observability";
import { theme } from "../../theme";
import { useNewOrderSound } from "./use-new-order-sound";
import { OrderCard } from "./order-card";
import { DispatchModal, type DispatchState } from "./dispatch-modal";
import {
  COLUMN_CONFIG,
  COLUMN_ORDER,
  ORDERS_SELECT,
  getFrontlineColumn,
  type Column,
  type OrderRow,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Orientation control (frontline only) — every call fully guarded so  */
/*  the app still runs where the native module is absent (web/Expo Go). */
/* ------------------------------------------------------------------ */
function allowAllOrientations() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ScreenOrientation = require("expo-screen-orientation");
    ScreenOrientation?.unlockAsync?.().catch(() => {});
  } catch {
    /* module unavailable — no-op */
  }
}

function lockPortrait() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ScreenOrientation = require("expo-screen-orientation");
    ScreenOrientation?.lockAsync?.(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  } catch {
    /* module unavailable — no-op */
  }
}

interface OrdersScreenProps {
  restaurantId: string;
  /**
   * Override for landscape behaviour. When omitted it is derived from the active
   * route group: ONLY the frontline Kitchen Display ((frontline)/orders) unlocks
   * landscape + renders the multi-column board. The owner dashboard usage of this
   * same component stays portrait-locked like the rest of the app.
   */
  allowLandscape?: boolean;
}

export function OrdersScreen({
  restaurantId,
  allowLandscape: allowLandscapeProp,
}: OrdersScreenProps) {
  const supabase = getSupabase();
  const { reportRealtimeStatus, onReconnect } = useConnection();

  // Scope rotation to the frontline Kitchen Display only. The owner dashboard
  // reuses this same component but must stay portrait, so we gate on the active
  // route group ((frontline)) unless an explicit prop overrides it.
  const segments = useSegments();
  const allowLandscape =
    allowLandscapeProp ?? segments.some((s) => s === "(frontline)");

  // Landscape detection. The board renders when held wider than tall AND the
  // screen is allowed to rotate (frontline). Portrait keeps the tab view as-is.
  const { width, height } = useWindowDimensions();
  const isLandscape = allowLandscape && width > height;

  // Frontline only: permit rotation while this screen is focused; re-lock the
  // app back to portrait when navigating away (Menu tab, owner dashboard, etc.)
  // so other screens never rotate. useFocusEffect re-runs on tab focus changes.
  useFocusEffect(
    useCallback(() => {
      if (!allowLandscape) return;
      allowAllOrientations();
      return () => {
        lockPortrait();
      };
    }, [allowLandscape])
  );

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<Column>("new");
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [alertActive, setAlertActive] = useState(false);
  const [, setTick] = useState(0);
  const [completedTotal, setCompletedTotal] = useState(0);

  // How this merchant's deliveries are handled (migration 101). Decides whether
  // the "who delivers?" step appears. Defaults to hybrid — the value that asks
  // rather than assumes — until the settings fetch lands.
  const [dispatchPolicy, setDispatchPolicy] = useState<DispatchPolicy>("hybrid");

  const [dispatchState, setDispatchState] = useState<DispatchState | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Scheduling config for the reschedule picker — settings change rarely, so a
  // single fetch on mount is enough (no realtime subscription needed).
  const [schedulingSettings, setSchedulingSettings] = useState<SchedulingSettings>(
    normalizeSchedulingSettings(null)
  );
  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("restaurants")
      .select("opening_hours, scheduling_settings, dispatch_policy")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const row = data as unknown as Record<string, unknown>;
        setSchedulingSettings(normalizeSchedulingSettings(row.scheduling_settings));
        setOpeningHours((row.opening_hours ?? null) as OpeningHours | null);
        setDispatchPolicy(resolveDispatchPolicy(row.dispatch_policy));
      });
  }, [restaurantId, supabase]);

  const { play } = useNewOrderSound(muted);
  // Keep a ref so the realtime handler (bound once) always sees the live values.
  const playRef = useRef(play);
  playRef.current = play;
  // Live snapshot for the realtime UPDATE handler so it can detect bucket
  // transitions — e.g. a scheduled order activating into "new".
  const ordersRef = useRef<OrderRow[]>([]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  /* ---- Fetch (initial + catch-up + pull-to-refresh) ---- */
  const fetchOrders = useCallback(async () => {
    if (!supabase) return;
    // Scheduled pre-orders are fetched separately from the newest-200 window:
    // one can be booked days ahead, so on a busy kitchen it would age out of
    // that window long before its slot arrives — it must still show on the
    // Scheduled column (mirrors the web dashboard's same fix).
    const [{ data, error }, { count }, { data: scheduledData, error: scheduledError }] =
      await Promise.all([
        supabase
          .from("orders")
          .select(ORDERS_SELECT)
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("status", "delivered"),
        supabase
          .from("orders")
          .select(ORDERS_SELECT)
          .eq("restaurant_id", restaurantId)
          .not("scheduled_for", "is", null)
          .is("activated_at", null)
          .in("status", ["pending", "confirmed"])
          .order("scheduled_for", { ascending: true }),
      ]);
    if (error) {
      console.error("[orders] fetch error:", error.message);
      return;
    }
    if (scheduledError) {
      console.error("[orders] scheduled fetch error:", scheduledError.message);
    }
    if (data) {
      const seen = new Set<string>();
      const merged = [...data, ...(scheduledData ?? [])].filter((o) => {
        const id = (o as { id: string }).id;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setOrders(merged as unknown as OrderRow[]);
    }
    if (typeof count === "number") setCompletedTotal(count);
  }, [restaurantId, supabase]);

  useEffect(() => {
    (async () => {
      await fetchOrders();
      setInitialLoading(false);
    })();
  }, [fetchOrders]);

  // Reconnect catch-up — Realtime doesn't replay, so refetch + replace.
  useEffect(() => onReconnect(fetchOrders), [onReconnect, fetchOrders]);

  // Refresh relative timestamps every 60s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ---- Realtime subscription ---- */
  useEffect(() => {
    if (!supabase) return;
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
                `*, order_items (id, item_name, quantity, line_total_kobo, selected_options, menu_items (prep_time_minutes))`
              )
              .eq("id", (payload.new as { id: string }).id)
              .single();
            if (data) {
              const newOrder = data as unknown as OrderRow;
              setOrders((prev) =>
                prev.some((o) => o.id === newOrder.id) ? prev : [newOrder, ...prev]
              );
              playRef.current();
              if (getFrontlineColumn(newOrder) === "scheduled") {
                // A pre-order booking lands in Scheduled, not New — don't fire
                // the repeating "accept me" siren for something due hours out.
                setActiveTab("scheduled");
              } else {
                setNewOrderIds((prev) => new Set(prev).add(newOrder.id));
                setAlertActive(true);
                setTimeout(() => {
                  setNewOrderIds((prev) => {
                    const next = new Set(prev);
                    next.delete(newOrder.id);
                    return next;
                  });
                }, 8000);
              }
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Partial<OrderRow> & { id: string };
            // Activation moment (cron or pull-forward on another device):
            // scheduled → new must FEEL like a new order — chime + jump —
            // or it silently slides between columns and gets missed.
            const prevRow = ordersRef.current.find((o) => o.id === updated.id);
            if (
              prevRow &&
              getFrontlineColumn(prevRow) === "scheduled" &&
              getFrontlineColumn({ ...prevRow, ...updated }) === "new"
            ) {
              playRef.current();
              setNewOrderIds((prev) => new Set(prev).add(updated.id));
              setAlertActive(true);
              setActiveTab("new");
              setTimeout(() => {
                setNewOrderIds((prev) => {
                  const next = new Set(prev);
                  next.delete(updated.id);
                  return next;
                });
              }, 8000);
            }
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
            );
          }
        }
      )
      .subscribe((channelStatus) => {
        if (intentional) return;
        if (channelStatus === "SUBSCRIBED") {
          reportRealtimeStatus(true);
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          reportRealtimeStatus(false);
        }
      });

    return () => {
      intentional = true;
      reportRealtimeStatus(true);
      channel.unsubscribe();
    };
  }, [restaurantId, supabase, reportRealtimeStatus]);

  /* ---- Columns ---- */
  const columns = useMemo(() => {
    const result: Record<Column, OrderRow[]> = {
      scheduled: [],
      new: [],
      in_progress: [],
      in_transit: [],
      completed: [],
    };
    for (const order of orders) {
      const col = getFrontlineColumn(order);
      if (col) result[col].push(order);
    }
    result.scheduled.sort(
      (a, b) =>
        new Date(a.scheduled_for ?? 0).getTime() - new Date(b.scheduled_for ?? 0).getTime()
    );
    return result;
  }, [orders]);

  // Completed count = server total, refreshed on each fetch. (Live deliveries
  // are reflected on the next fetch/refresh; the column list itself is live.)
  const completedCount = Math.max(completedTotal, columns.completed.length);

  /* ---- Repeating alert sound while new orders await acceptance ---- */
  const newOrderCount = columns.new.length;
  useEffect(() => {
    if (newOrderCount === 0) setAlertActive(false);
  }, [newOrderCount]);

  useEffect(() => {
    if (!alertActive || muted) return;
    const id = setInterval(() => playRef.current(), 3000);
    return () => clearInterval(id);
  }, [alertActive, muted]);

  /* ---- Status update (optimistic + revert) ---- */
  const handleUpdateStatus = useCallback(
    async (orderId: string, newStatus: string, estimatedReadyMinutes?: number) => {
      setActionLoading(orderId);
      setActionError(null);
      const prevStatus = orders.find((o) => o.id === orderId)?.status;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus as OrderRow["status"] } : o
        )
      );
      try {
        await updateOrderStatus(orderId, newStatus, estimatedReadyMinutes);
        capture("order_status_updated", { new_status: newStatus });
      } catch (err) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId && prevStatus
              ? { ...o, status: prevStatus as OrderRow["status"] }
              : o
          )
        );
        setActionError(
          err instanceof ApiError || err instanceof Error
            ? err.message
            : "Failed to update order status"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [orders]
  );

  /* ---- Scheduled-order actions ---- */
  const handleActivateNow = useCallback(
    async (orderId: string) => {
      setActionLoading(orderId);
      setActionError(null);
      const prevActivatedAt = orders.find((o) => o.id === orderId)?.activated_at ?? null;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, activated_at: new Date().toISOString() } : o))
      );
      try {
        await activateScheduledOrder(orderId);
        setActiveTab("new");
        capture("scheduled_order_pulled_forward");
      } catch (err) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, activated_at: prevActivatedAt } : o))
        );
        setActionError(
          err instanceof ApiError || err instanceof Error
            ? err.message
            : "Failed to start the order"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [orders]
  );

  const handleReschedule = useCallback(
    async (orderId: string, newSlotIso: string) => {
      setActionLoading(orderId);
      setActionError(null);
      const prevSlot = orders.find((o) => o.id === orderId)?.scheduled_for ?? null;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, scheduled_for: newSlotIso } : o))
      );
      try {
        await rescheduleOrder(orderId, newSlotIso);
        capture("scheduled_order_rescheduled");
      } catch (err) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, scheduled_for: prevSlot } : o))
        );
        setActionError(
          err instanceof ApiError || err instanceof Error ? err.message : "Failed to reschedule"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [orders]
  );

  const handleDeclineScheduled = useCallback(
    async (orderId: string, reason: string) => {
      setActionLoading(orderId);
      setActionError(null);
      const prevStatus = orders.find((o) => o.id === orderId)?.status;
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "cancelled" as OrderRow["status"] } : o))
      );
      try {
        await declineScheduledOrder(orderId, reason);
        capture("scheduled_order_declined");
      } catch (err) {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, status: (prevStatus ?? o.status) as OrderRow["status"] } : o
          )
        );
        setActionError(
          err instanceof ApiError || err instanceof Error ? err.message : "Failed to decline the order"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [orders]
  );

  /* ---- Dispatch ---- */
  const openDispatch = useCallback(
    (order: OrderRow) => {
      // Only hybrid merchants get a choice. For the other two the lane is
      // already settled, so go straight to the confirm step.
      const fixed = laneForPolicy(dispatchPolicy);
      setDispatchState(
        fixed
          ? { order, step: "confirm", selectedType: fixed as "platform_rider" | "own_rider" }
          : { order, step: "select", selectedType: null }
      );
      setDispatchError(null);
    },
    [dispatchPolicy]
  );

  const handleDispatchConfirm = useCallback(async () => {
    if (!dispatchState?.selectedType) return;
    const { order, selectedType } = dispatchState;
    setDispatchLoading(true);
    setDispatchError(null);
    try {
      // Mirror web: ensure ready_for_pickup first, then dispatch.
      await updateOrderStatus(order.id, "ready_for_pickup");
      const result = await dispatchOrder(order.id, selectedType);
      // The platform lane no longer moves orders.status: the rider runs on its
      // own track (migration 101) and the food stays "ready" until collected.
      const fallbackStatus =
        selectedType === "own_rider" ? "in_transit" : "ready_for_pickup";
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                status: fallbackStatus as OrderRow["status"],
                dispatch_type: selectedType,
                dispatch_state:
                  selectedType === "platform_rider" ? "requested" : "not_required",
                // Without this the card's "Assign Rider" button survived its own
                // dispatch: the pill is gated on rider_requested_at, and nothing
                // here ever set it. Only the platform lane asks us for a rider —
                // the in-house lane must not look engaged, or the merchant loses
                // their own Mark Delivered.
                ...(selectedType === "platform_rider"
                  ? { rider_requested_at: new Date().toISOString() }
                  : {}),
                // Server truth wins over every default above.
                ...(result.dispatch ?? {}),
              }
            : o
        )
      );
      capture("order_dispatched", { dispatch_type: selectedType });
      setDispatchState(null);
    } catch (err) {
      setDispatchError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Failed to dispatch order"
      );
    } finally {
      setDispatchLoading(false);
    }
  }, [dispatchState]);

  /* ---- Pull to refresh ---- */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  const totalActive =
    columns.new.length + columns.in_progress.length + columns.in_transit.length;

  if (initialLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  const tabOrders = columns[activeTab];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      {/* Header — compact vertical padding in landscape to give the board room */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: isLandscape ? 8 : 12,
          paddingBottom: isLandscape ? 8 : 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: isLandscape ? "row" : "column", alignItems: isLandscape ? "center" : "flex-start", gap: isLandscape ? 10 : 0 }}>
          <Text style={{ fontSize: isLandscape ? 16 : 19, fontWeight: "800", color: theme.colors.black[900] }}>
            Kitchen Display
          </Text>
          <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: isLandscape ? 0 : 2 }}>
            {totalActive} active · {completedCount} completed
          </Text>
        </View>
        <Pressable
          onPress={() => setMuted((m) => !m)}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: muted ? theme.colors.black[200] : theme.colors.primary[200],
            backgroundColor: muted
              ? theme.colors.black[50]
              : pressed
                ? theme.colors.primary[100]
                : theme.colors.primary[50],
          })}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: muted ? theme.colors.black[400] : theme.colors.brand,
            }}
          >
            {muted ? "🔇 Muted" : "🔔 Sound"}
          </Text>
        </Pressable>
      </View>

      {/* Error banner — shared across portrait + landscape */}
      {!!actionError && (
        <Pressable
          onPress={() => setActionError(null)}
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: theme.colors.cinnabar[100],
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 13, color: theme.colors.cinnabar[500] }}>
            {actionError} · Tap to dismiss
          </Text>
        </Pressable>
      )}

      {isLandscape ? (
        /* ---- LANDSCAPE: multi-column Kanban board ----
           The 4 COLUMN_ORDER columns side-by-side (equal flex), each scrolling
           independently. Same tap-to-advance OrderCard as portrait — no literal
           drag-and-drop, matching web parity. */
        <View style={{ flex: 1, flexDirection: "row" }}>
          {COLUMN_ORDER.map((col, idx) => {
            const config = COLUMN_CONFIG[col];
            const colOrders = columns[col];
            const count = col === "completed" ? completedCount : colOrders.length;
            return (
              <View
                key={col}
                style={{
                  flex: 1,
                  borderLeftWidth: idx === 0 ? 0 : 1,
                  borderLeftColor: theme.colors.black[100],
                }}
              >
                {/* Column header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: theme.colors.white,
                    borderBottomWidth: 2,
                    borderBottomColor: config.accent,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "800",
                      color: config.accent,
                    }}
                  >
                    {config.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        paddingHorizontal: 5,
                        borderRadius: 10,
                        backgroundColor: config.accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>
                        {count}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Independently scrolling card list */}
                <FlatList
                  data={colOrders}
                  keyExtractor={(o) => o.id}
                  contentContainerStyle={{
                    padding: 10,
                    gap: 10,
                    paddingBottom: 24,
                    flexGrow: 1,
                  }}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    col === "new" ? (
                      <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[theme.colors.brand]}
                        tintColor={theme.colors.brand}
                      />
                    ) : undefined
                  }
                  ListEmptyComponent={
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 40,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: theme.colors.black[400],
                          textAlign: "center",
                        }}
                      >
                        {col === "scheduled"
                          ? "No scheduled orders"
                          : col === "new"
                          ? "No new orders"
                          : col === "in_progress"
                            ? "Nothing in progress"
                            : col === "in_transit"
                              ? "Nothing in transit"
                              : "No completed orders"}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => (
                    <OrderCard
                      order={item}
                      column={col}
                      isNew={newOrderIds.has(item.id)}
                      loading={actionLoading === item.id}
                      onUpdateStatus={handleUpdateStatus}
                      onDispatchReady={openDispatch}
                      onActivateNow={handleActivateNow}
                      onReschedule={handleReschedule}
                      onDeclineScheduled={handleDeclineScheduled}
                      schedulingSettings={schedulingSettings}
                      openingHours={openingHours}
                    />
                  )}
                />
              </View>
            );
          })}
        </View>
      ) : (
        <>
          {/* Tab strip */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: theme.colors.white,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.black[100],
            }}
          >
            {COLUMN_ORDER.map((col) => {
              const config = COLUMN_CONFIG[col];
              const count = col === "completed" ? completedCount : columns[col].length;
              const isActive = activeTab === col;
              return (
                <Pressable
                  key={col}
                  onPress={() => setActiveTab(col)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? config.accent : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: isActive ? config.accent : theme.colors.black[400],
                      }}
                    >
                      {config.label}
                    </Text>
                    {count > 0 && (
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          paddingHorizontal: 4,
                          borderRadius: 9,
                          backgroundColor: isActive ? config.accent : theme.colors.black[100],
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: isActive ? "#fff" : theme.colors.black[500],
                          }}
                        >
                          {count}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Card list */}
          <FlatList
            data={tabOrders}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.colors.brand]}
                tintColor={theme.colors.brand}
              />
            }
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: 64 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[400] }}>
                  {activeTab === "scheduled"
                    ? "No scheduled orders"
                    : activeTab === "new"
                    ? "No new orders"
                    : activeTab === "in_progress"
                      ? "Nothing in progress"
                      : activeTab === "in_transit"
                        ? "Nothing in transit"
                        : "No completed orders"}
                </Text>
                {activeTab === "new" && (
                  <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 4 }}>
                    New orders appear here in real time
                  </Text>
                )}
                {activeTab === "scheduled" && (
                  <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 4 }}>
                    Pre-orders customers book ahead appear here
                  </Text>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <OrderCard
                order={item}
                column={activeTab}
                isNew={newOrderIds.has(item.id)}
                loading={actionLoading === item.id}
                onUpdateStatus={handleUpdateStatus}
                onDispatchReady={openDispatch}
                onActivateNow={handleActivateNow}
                onReschedule={handleReschedule}
                onDeclineScheduled={handleDeclineScheduled}
                schedulingSettings={schedulingSettings}
                openingHours={openingHours}
              />
            )}
          />
        </>
      )}

      <DispatchModal
        state={dispatchState}
        loading={dispatchLoading}
        error={dispatchError}
        onChange={setDispatchState}
        onConfirm={handleDispatchConfirm}
        onClose={() => setDispatchState(null)}
      />
    </View>
  );
}
