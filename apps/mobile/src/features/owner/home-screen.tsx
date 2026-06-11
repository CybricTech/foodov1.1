/**
 * Owner Home / overview — RN port of the web `DashboardHomeClient`.
 *
 * Parity (ported from web):
 *   - Loads the last 30 days of paid, non-cancelled orders (same select) via
 *     Supabase (RLS-protected) — replicating the web server component query.
 *   - Realtime channel `home-${restaurantId}` for orders INSERT/UPDATE and
 *     restaurants.accepts_orders UPDATE, so the store status + lists stay live.
 *   - Time filter (Today / Yesterday / 30m / 12h / 7d / 30d) drives the KPI
 *     window: Revenue, Orders, Avg Order. Active orders + recent orders lists.
 *
 * READ-ONLY: this screen never mutates. Money via formatKobo (@foodo/utils).
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

import {
  TrendingUp,
  ShoppingBag,
  BarChart2,
  Bike,
  Store,
  UtensilsCrossed,
} from "lucide-react-native";

import { formatKobo } from "@foodo/utils";

import { getSupabase } from "../../lib/supabase";
import { useConnection } from "../../lib/connection";
import { theme } from "../../theme";

/* ---- Types ---- */
type TimeFilter =
  | "today"
  | "yesterday"
  | "last_30min"
  | "last_12h"
  | "last_7days"
  | "last_30days";

interface HomeOrder {
  id: string;
  order_number: string | number;
  status: string;
  payment_status: string;
  fulfillment_type: string;
  customer_name: string | null;
  special_instructions: string | null;
  total_kobo: number;
  created_at: string;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  accepts_orders: boolean;
}

/* ---- Helpers (ported 1:1 from web) ---- */
function getFromDate(filter: TimeFilter): Date {
  const now = new Date();
  switch (filter) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "yesterday": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 1);
      return d;
    }
    case "last_30min":
      return new Date(now.getTime() - 30 * 60 * 1000);
    case "last_12h":
      return new Date(now.getTime() - 12 * 60 * 60 * 1000);
    case "last_7days":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "last_30days":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function getToDate(filter: TimeFilter): Date | null {
  if (filter === "yesterday") {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return null;
}

function abbreviateKobo(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000) return `₦${(naira / 1_000).toFixed(1)}K`;
  return `₦${naira.toFixed(0)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const FILTER_LABELS: Record<TimeFilter, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_30min: "Last 30 min",
  last_12h: "Last 12 hours",
  last_7days: "Last 7 days",
  last_30days: "Last 30 days",
};
const FILTER_ORDER: TimeFilter[] = [
  "today",
  "yesterday",
  "last_30min",
  "last_12h",
  "last_7days",
  "last_30days",
];

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready_for_pickup"];

const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: theme.colors.black[100], fg: theme.colors.black[500] },
  confirmed: { label: "Confirmed", bg: "#DBEAFE", fg: "#2563EB" },
  preparing: { label: "Preparing", bg: theme.colors.dixie[100], fg: theme.colors.dixie[500] },
  ready_for_pickup: { label: "Ready", bg: theme.colors.primary[50], fg: theme.colors.brand },
  in_transit: { label: "In Transit", bg: theme.colors.primary[50], fg: theme.colors.brand },
  delivered: { label: "Delivered", bg: theme.colors.viridian[100], fg: theme.colors.viridian[500] },
  cancelled: { label: "Cancelled", bg: theme.colors.cinnabar[100], fg: theme.colors.cinnabar[500] },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_BADGE[status] ?? {
    label: status,
    bg: theme.colors.black[100],
    fg: theme.colors.black[500],
  };
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: "800", color: c.fg }}>{c.label}</Text>
    </View>
  );
}

function KpiCard({
  label,
  value,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.black[100],
        padding: 14,
        gap: 10,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
      <View>
        <Text style={{ fontSize: 11, color: theme.colors.black[400], fontWeight: "500" }}>
          {label}
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: theme.colors.black[900],
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

interface HomeScreenProps {
  restaurantId: string;
}

export function HomeScreen({ restaurantId }: HomeScreenProps) {
  const supabase = getSupabase();
  const { reportRealtimeStatus, onReconnect } = useConnection();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [acceptsOrders, setAcceptsOrders] = useState(false);
  const [orders, setOrders] = useState<HomeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TimeFilter>("today");
  const [filterOpen, setFilterOpen] = useState(false);
  const [, setTick] = useState(0);

  const ORDERS_SELECT =
    "id, order_number, status, payment_status, fulfillment_type, customer_name, special_instructions, total_kobo, created_at";

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const [{ data: rest }, { data: ord }] = await Promise.all([
      supabase
        .from("restaurants")
        .select("id, name, slug, accepts_orders")
        .eq("id", restaurantId)
        .single(),
      supabase
        .from("orders")
        .select(ORDERS_SELECT)
        .eq("restaurant_id", restaurantId)
        .neq("status", "cancelled")
        .eq("payment_status", "paid")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false }),
    ]);

    if (rest) {
      setRestaurant(rest as Restaurant);
      setAcceptsOrders((rest as Restaurant).accepts_orders);
    }
    if (ord) setOrders(ord as unknown as HomeOrder[]);
  }, [restaurantId, supabase]);

  useEffect(() => {
    (async () => {
      await fetchData();
      setLoading(false);
    })();
  }, [fetchData]);

  useEffect(() => onReconnect(fetchData), [onReconnect, fetchData]);

  // Refresh relative timestamps every 60s.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  /* ---- Realtime: orders + restaurant accepts_orders (ported from web) ---- */
  useEffect(() => {
    if (!supabase) return;
    let intentional = false;
    const channel = supabase
      .channel(`home-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setOrders((prev) => [payload.new as HomeOrder, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === (payload.new as HomeOrder).id
                  ? { ...o, ...(payload.new as HomeOrder) }
                  : o
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "restaurants",
          filter: `id=eq.${restaurantId}`,
        },
        (payload) => {
          const updated = payload.new as { accepts_orders?: boolean };
          if (typeof updated.accepts_orders === "boolean") {
            setAcceptsOrders(updated.accepts_orders);
          }
        }
      )
      .subscribe((status) => {
        if (intentional) return;
        if (status === "SUBSCRIBED") reportRealtimeStatus(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reportRealtimeStatus(false);
      });

    return () => {
      intentional = true;
      reportRealtimeStatus(true);
      channel.unsubscribe();
    };
  }, [restaurantId, supabase, reportRealtimeStatus]);

  /* ---- Derived ---- */
  const filteredOrders = useMemo(() => {
    const from = getFromDate(activeFilter);
    const to = getToDate(activeFilter);
    return orders.filter((o) => {
      const created = new Date(o.created_at);
      return created >= from && (to === null || created < to);
    });
  }, [orders, activeFilter]);

  const activeOrders = useMemo(
    () => orders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [orders]
  );

  const revenue = filteredOrders.reduce((s, o) => s + (o.total_kobo ?? 0), 0);
  const orderCount = filteredOrders.length;
  const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  const recentOrders = filteredOrders.slice(0, 5);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.black[50] }}>
      {/* Header */}
      <View
        style={{
          backgroundColor: theme.colors.white,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 14,
        }}
      >
        <Text style={{ fontSize: 12, color: theme.colors.black[400], fontWeight: "500" }}>
          {formatHeaderDate(new Date())}
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "800",
            color: theme.colors.black[900],
            marginTop: 2,
          }}
        >
          {restaurant?.name ?? "Dashboard"}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
          {/* Time filter */}
          <Pressable
            onPress={() => setFilterOpen((o) => !o)}
            style={{
              backgroundColor: filterOpen ? theme.colors.brand : theme.colors.primary[50],
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: filterOpen ? "#fff" : theme.colors.brand,
              }}
            >
              {FILTER_LABELS[activeFilter]} ▾
            </Text>
          </Pressable>

          {/* Store status (display only) */}
          {restaurant && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: acceptsOrders
                  ? theme.colors.viridian[100]
                  : theme.colors.cinnabar[100],
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 9,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: acceptsOrders
                    ? theme.colors.viridian[500]
                    : theme.colors.cinnabar[500],
                }}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: acceptsOrders
                    ? theme.colors.viridian[500]
                    : theme.colors.cinnabar[500],
                }}
              >
                {acceptsOrders ? "Open" : "Closed"}
              </Text>
            </View>
          )}
        </View>

        {filterOpen && (
          <View
            style={{
              marginTop: 8,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {FILTER_ORDER.map((f) => (
              <Pressable
                key={f}
                onPress={() => {
                  setActiveFilter(f);
                  setFilterOpen(false);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor:
                    activeFilter === f ? theme.colors.primary[50] : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: activeFilter === f ? "700" : "500",
                    color:
                      activeFilter === f ? theme.colors.brand : theme.colors.black[900],
                  }}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={recentOrders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.brand]}
            tintColor={theme.colors.brand}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 16 }}>
            {/* KPI cards */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <KpiCard
                label="Revenue"
                value={abbreviateKobo(revenue)}
                iconBg={theme.colors.primary[100]}
                icon={<TrendingUp size={16} color={theme.colors.primary[600]} strokeWidth={2.5} />}
              />
              <KpiCard
                label="Orders"
                value={orderCount.toString()}
                iconBg={theme.colors.viridian[100]}
                icon={<ShoppingBag size={16} color={theme.colors.viridian[500]} strokeWidth={2.5} />}
              />
              <KpiCard
                label="Avg Order"
                value={abbreviateKobo(avgOrderValue)}
                iconBg={theme.colors.dixie[100]}
                icon={<BarChart2 size={16} color={theme.colors.dixie[500]} strokeWidth={2.5} />}
              />
            </View>

            {/* Active orders */}
            {activeOrders.length > 0 && (
              <View
                style={{
                  backgroundColor: theme.colors.dixie[100],
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.dixie[500],
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.dixie[500],
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: theme.colors.dixie[500],
                    }}
                  />
                  <Text
                    style={{ fontSize: 14, fontWeight: "700", color: theme.colors.dixie[500] }}
                  >
                    {activeOrders.length} order{activeOrders.length !== 1 ? "s" : ""} need
                    attention
                  </Text>
                </View>
                {activeOrders.map((order) => (
                  <View
                    key={order.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderTopWidth: 1,
                      borderTopColor: theme.colors.dixie[100],
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: theme.colors.white,
                        borderWidth: 1,
                        borderColor: theme.colors.dixie[500],
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {order.fulfillment_type === "delivery" ? (
                        <Bike size={15} color={theme.colors.black[500]} />
                      ) : (
                        <Store size={15} color={theme.colors.black[500]} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text
                          style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
                        >
                          #{order.order_number}
                        </Text>
                        <StatusBadge status={order.status} />
                      </View>
                      <Text
                        style={{ fontSize: 12, color: theme.colors.black[500], marginTop: 2 }}
                        numberOfLines={1}
                      >
                        {order.customer_name ?? "—"}
                      </Text>
                      {!!order.special_instructions && (
                        <Text
                          style={{ fontSize: 11, color: theme.colors.black[500], marginTop: 2 }}
                          numberOfLines={2}
                        >
                          📝 {order.special_instructions}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
                    >
                      {formatKobo(order.total_kobo)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: theme.colors.black[900],
              }}
            >
              Recent Orders
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              backgroundColor: theme.colors.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              paddingVertical: 48,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: theme.colors.black[100],
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <UtensilsCrossed size={22} color={theme.colors.black[400]} strokeWidth={1.5} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.colors.black[500] }}>
              No orders yet
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 4 }}>
              Orders for this period will appear here
            </Text>
          </View>
        }
        renderItem={({ item: order }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              backgroundColor: theme.colors.white,
              borderWidth: 1,
              borderColor: theme.colors.black[100],
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
                >
                  #{order.order_number}
                </Text>
                <StatusBadge status={order.status} />
              </View>
              <Text
                style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}
                numberOfLines={1}
              >
                {order.customer_name ?? "—"}
              </Text>
              {!!order.special_instructions && (
                <Text
                  style={{ fontSize: 11, color: theme.colors.black[500], marginTop: 2 }}
                  numberOfLines={2}
                >
                  📝 {order.special_instructions}
                </Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}
              >
                {formatKobo(order.total_kobo)}
              </Text>
              <Text style={{ fontSize: 11, color: theme.colors.black[400], marginTop: 2 }}>
                {timeAgo(order.created_at)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
