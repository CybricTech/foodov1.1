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
  View,
} from "react-native";

import { getSupabase } from "../../lib/supabase";
import { useConnection } from "../../lib/connection";
import { updateOrderStatus, dispatchOrder, ApiError } from "../../lib/api";
import { capture } from "../../lib/observability";
import { theme } from "../../theme";
import { useNewOrderSound } from "./use-new-order-sound";
import { OrderCard } from "./order-card";
import { DispatchModal, type DispatchState } from "./dispatch-modal";
import {
  COLUMN_CONFIG,
  COLUMN_ORDER,
  COLUMN_STATUSES,
  ORDERS_SELECT,
  type Column,
  type OrderRow,
} from "./types";

interface OrdersScreenProps {
  restaurantId: string;
}

export function OrdersScreen({ restaurantId }: OrdersScreenProps) {
  const supabase = getSupabase();
  const { reportRealtimeStatus, onReconnect } = useConnection();

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

  const [dispatchState, setDispatchState] = useState<DispatchState | null>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const { play } = useNewOrderSound(muted);
  // Keep a ref so the realtime handler (bound once) always sees the live values.
  const playRef = useRef(play);
  playRef.current = play;

  /* ---- Fetch (initial + catch-up + pull-to-refresh) ---- */
  const fetchOrders = useCallback(async () => {
    if (!supabase) return;
    const [{ data, error }, { count }] = await Promise.all([
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
    ]);
    if (error) {
      console.error("[orders] fetch error:", error.message);
      return;
    }
    if (data) setOrders(data as unknown as OrderRow[]);
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
                `*, order_items (id, item_name, quantity, line_total_kobo, selected_options)`
              )
              .eq("id", (payload.new as { id: string }).id)
              .single();
            if (data) {
              const newOrder = data as unknown as OrderRow;
              setOrders((prev) =>
                prev.some((o) => o.id === newOrder.id) ? prev : [newOrder, ...prev]
              );
              setNewOrderIds((prev) => new Set(prev).add(newOrder.id));
              setAlertActive(true);
              playRef.current();
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
                o.id === (payload.new as { id: string }).id
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
      new: [],
      in_progress: [],
      in_transit: [],
      completed: [],
    };
    for (const order of orders) {
      if (COLUMN_STATUSES.new.includes(order.status)) result.new.push(order);
      else if (COLUMN_STATUSES.in_progress.includes(order.status)) result.in_progress.push(order);
      else if (COLUMN_STATUSES.in_transit.includes(order.status)) result.in_transit.push(order);
      else if (COLUMN_STATUSES.completed.includes(order.status)) result.completed.push(order);
    }
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
    async (orderId: string, newStatus: string) => {
      setActionLoading(orderId);
      setActionError(null);
      const prevStatus = orders.find((o) => o.id === orderId)?.status;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: newStatus as OrderRow["status"] } : o
        )
      );
      try {
        await updateOrderStatus(orderId, newStatus);
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

  /* ---- Dispatch ---- */
  const openDispatch = useCallback((order: OrderRow) => {
    setDispatchState({ order, step: "select", selectedType: null });
    setDispatchError(null);
  }, []);

  const handleDispatchConfirm = useCallback(async () => {
    if (!dispatchState?.selectedType) return;
    const { order, selectedType } = dispatchState;
    setDispatchLoading(true);
    setDispatchError(null);
    try {
      // Mirror web: ensure ready_for_pickup first, then dispatch.
      await updateOrderStatus(order.id, "ready_for_pickup");
      await dispatchOrder(order.id, selectedType);
      const newStatus =
        selectedType === "platform_rider" ? "assigned_to_rider" : "in_transit";
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: newStatus as OrderRow["status"], dispatch_type: selectedType }
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
      {/* Header */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text style={{ fontSize: 19, fontWeight: "800", color: theme.colors.black[900] }}>
            Kitchen Display
          </Text>
          <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
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

      {/* Error banner */}
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
              {activeTab === "new"
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
          />
        )}
      />

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
