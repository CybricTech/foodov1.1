/**
 * Owner Analytics — RN port of the web `AnalyticsClient`.
 *
 * Parity (ported from web):
 *   - Same Supabase reads (orders, customers, order_items) per time range, plus
 *     the previous-period orders read for the "vs last period" KPI deltas.
 *   - KPIs: Revenue, Orders, Avg Order, New Customers (with % change).
 *   - Charts: Revenue Trend (line/area), Orders by Day (bars), Peak Hours
 *     (orders by hour, bars), Order Status (pie). Same buckets + brand colors.
 *
 * Charts use `react-native-gifted-charts` (Expo-SDK-54 friendly, light, no
 * native build step beyond react-native-svg). READ-ONLY; money via formatKobo.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { BarChart, LineChart, PieChart } from "react-native-gifted-charts";

import { formatKobo } from "@foodo/utils";

import { getSupabase } from "../../lib/supabase";
import { theme } from "../../theme";

/* ---- Types ---- */
type TimeFilter =
  | "today"
  | "yesterday"
  | "last_7days"
  | "last_30days"
  | "this_month"
  | "last_month";

interface AnalyticsOrder {
  id: string;
  total_kobo: number;
  status: string;
  fulfillment_type: string;
  payment_status: string;
  created_at: string;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
}

interface AnalyticsCustomer {
  id: string;
  first_order_at: string | null;
}

interface PeriodMetrics {
  revenue: number;
  orders: number;
  aov: number;
  newCustomers: number;
}

/* ---- Constants (ported from web) ---- */
const FILTER_LABELS: Record<TimeFilter, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7days: "Last 7 days",
  last_30days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
};
const FILTER_ORDER: TimeFilter[] = [
  "today",
  "yesterday",
  "last_7days",
  "last_30days",
  "this_month",
  "last_month",
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#F4A261",
  confirmed: "#7B2CBF",
  preparing: "#9D4EDD",
  ready_for_pickup: "#5A189A",
  assigned_to_rider: "#3C096C",
  in_transit: "#240046",
  delivered: "#2D6A4F",
  cancelled: "#E63946",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready",
  assigned_to_rider: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/* ---- Helpers (ported 1:1 from web) ---- */
function getRange(filter: TimeFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 86400000) };
    case "yesterday": {
      const yest = new Date(today.getTime() - 86400000);
      return { from: yest, to: today };
    }
    case "last_7days":
      return {
        from: new Date(today.getTime() - 7 * 86400000),
        to: new Date(today.getTime() + 86400000),
      };
    case "last_30days":
      return {
        from: new Date(today.getTime() - 30 * 86400000),
        to: new Date(today.getTime() + 86400000),
      };
    case "this_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "last_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
      };
  }
}

function getPreviousPeriodRange(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - duration), to: from };
}

function formatChartCurrency(kobo: number): string {
  const ngn = kobo / 100;
  if (ngn >= 1_000_000) return `₦${(ngn / 1_000_000).toFixed(1)}M`;
  if (ngn >= 1_000) return `₦${(ngn / 1_000).toFixed(0)}K`;
  return `₦${ngn.toFixed(0)}`;
}

function formatDateLabel(dateStr: string, filter: TimeFilter): string {
  const d = new Date(dateStr);
  if (filter === "today" || filter === "yesterday") {
    return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  }
  if (filter === "last_7days") {
    return d.toLocaleDateString("en-NG", { weekday: "short" });
  }
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

interface DailyData {
  date: string;
  displayDate: string;
  revenue: number;
  orders: number;
}

function buildDailyData(
  orders: AnalyticsOrder[],
  rangeFrom: Date,
  rangeTo: Date,
  filter: TimeFilter
): DailyData[] {
  const days: Record<string, DailyData> = {};
  for (let d = new Date(rangeFrom); d < rangeTo; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split("T")[0];
    days[key] = {
      date: key,
      displayDate: formatDateLabel(key, filter),
      revenue: 0,
      orders: 0,
    };
  }
  orders.forEach((o) => {
    const key = o.created_at.split("T")[0];
    if (days[key]) {
      days[key].revenue += o.total_kobo ?? 0;
      days[key].orders += 1;
    }
  });
  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}

function buildHourlyData(orders: AnalyticsOrder[]) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, orders: 0 }));
  orders.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    hours[h].orders += 1;
  });
  return hours;
}

function buildStatusData(orders: AnalyticsOrder[]) {
  const counts: Record<string, number> = {};
  orders.forEach((o) => {
    counts[o.status] = (counts[o.status] ?? 0) + 1;
  });
  return Object.entries(counts)
    .map(([status, value]) => ({
      name: STATUS_LABELS[status] ?? status,
      value,
      color: STATUS_COLORS[status] ?? "#9E9E9E",
    }))
    .sort((a, b) => b.value - a.value);
}

function computeMetrics(
  orders: AnalyticsOrder[],
  customers: AnalyticsCustomer[]
): PeriodMetrics {
  const valid = orders.filter((o) => o.status !== "cancelled");
  const revenue = valid.reduce((s, o) => s + (o.total_kobo ?? 0), 0);
  const orderCount = valid.length;
  const aov = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  return { revenue, orders: orderCount, aov, newCustomers: customers.length };
}

function computeComparison(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/* ---- Sub-components ---- */
function KpiCard({
  label,
  value,
  iconBg,
  change,
}: {
  label: string;
  value: string;
  iconBg: string;
  change: number;
}) {
  const neutral = change === 0;
  const positive = change > 0;
  const color = neutral
    ? theme.colors.black[400]
    : positive
      ? theme.colors.viridian[500]
      : theme.colors.cinnabar[500];
  return (
    <View
      style={{
        width: "48%",
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.black[100],
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: iconBg }} />
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color }}>
            {neutral ? "No change" : `${positive ? "▲" : "▼"} ${Math.abs(change)}%`}
          </Text>
          <Text style={{ fontSize: 10, color: theme.colors.black[400] }}>vs last period</Text>
        </View>
      </View>
    </View>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.black[100],
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.black[100],
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.colors.black[900] }}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: 12, color: theme.colors.black[400], marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={{ padding: 16 }}>{children}</View>
    </View>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: "center" }}>
      <Text style={{ fontSize: 14, color: theme.colors.black[400] }}>{message}</Text>
    </View>
  );
}

interface AnalyticsScreenProps {
  restaurantId: string;
}

export function AnalyticsScreen({ restaurantId }: AnalyticsScreenProps) {
  const supabase = getSupabase();
  const chartWidth = Dimensions.get("window").width - 32 - 32; // screen − page pad − card pad

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("last_30days");
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [customers, setCustomers] = useState<AnalyticsCustomer[]>([]);
  const [prevOrders, setPrevOrders] = useState<AnalyticsOrder[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!supabase) return;
      setLoading(true);
      const range = getRange(timeFilter);
      const { from, to } = range;
      const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(from, to);

      const [{ data: currentOrders }, { data: currentCustomers }, { data: previousOrders }] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, total_kobo, status, fulfillment_type, payment_status, created_at, subtotal_kobo, delivery_fee_kobo"
            )
            .eq("restaurant_id", restaurantId)
            .gte("created_at", from.toISOString())
            .lt("created_at", to.toISOString())
            .order("created_at", { ascending: true }),
          supabase
            .from("customers")
            .select("id, first_order_at")
            .eq("restaurant_id", restaurantId)
            .gte("first_order_at", from.toISOString())
            .lt("first_order_at", to.toISOString()),
          supabase
            .from("orders")
            .select("total_kobo, status, created_at")
            .eq("restaurant_id", restaurantId)
            .gte("created_at", prevFrom.toISOString())
            .lt("created_at", prevTo.toISOString()),
        ]);

      if (cancelled) return;
      setOrders((currentOrders as unknown as AnalyticsOrder[]) ?? []);
      setCustomers((currentCustomers as AnalyticsCustomer[]) ?? []);
      setPrevOrders((previousOrders as unknown as AnalyticsOrder[]) ?? []);
      setLoading(false);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [supabase, restaurantId, timeFilter]);

  const currentMetrics = useMemo(
    () => computeMetrics(orders, customers),
    [orders, customers]
  );
  const prevMetrics = useMemo(() => computeMetrics(prevOrders, []), [prevOrders]);

  const revenueChange = computeComparison(currentMetrics.revenue, prevMetrics.revenue);
  const ordersChange = computeComparison(currentMetrics.orders, prevMetrics.orders);
  const aovChange = computeComparison(currentMetrics.aov, prevMetrics.aov);
  const customersChange = computeComparison(
    currentMetrics.newCustomers,
    prevMetrics.newCustomers
  );

  const range = useMemo(() => getRange(timeFilter), [timeFilter]);
  const dailyData = useMemo(
    () =>
      buildDailyData(
        orders.filter((o) => o.status !== "cancelled"),
        range.from,
        range.to,
        timeFilter
      ),
    [orders, range, timeFilter]
  );
  const hourlyData = useMemo(() => buildHourlyData(orders), [orders]);
  const statusData = useMemo(() => buildStatusData(orders), [orders]);

  const hasData = orders.length > 0;

  // Map to gifted-charts data shapes. We thin x-axis labels so they don't
  // overlap on a narrow screen (every Nth point keeps a label).
  const labelEvery = Math.max(1, Math.ceil(dailyData.length / 6));
  const revenueLine = dailyData.map((d, i) => ({
    value: d.revenue / 100, // naira so axis labels stay small
    label: i % labelEvery === 0 ? d.displayDate : undefined,
  }));
  const ordersBars = dailyData.map((d, i) => ({
    value: d.orders,
    label: i % labelEvery === 0 ? d.displayDate : undefined,
    frontColor: theme.colors.viridian[500],
  }));
  const hourlyBars = hourlyData.map((h) => ({
    value: h.orders,
    label: h.hour % 6 === 0 ? `${h.hour}` : undefined,
    frontColor: theme.colors.dixie[500],
  }));
  const pieData = statusData.map((s) => ({ value: s.value, color: s.color }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.black[50] }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
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
        <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.black[900] }}>
          Analytics
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.black[400], marginTop: 2 }}>
          Insights to help you grow your business
        </Text>
        <Pressable
          onPress={() => setFilterOpen((o) => !o)}
          style={{
            marginTop: 12,
            alignSelf: "flex-start",
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
            {FILTER_LABELS[timeFilter]} ▾
          </Text>
        </Pressable>
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
                  setTimeFilter(f);
                  setFilterOpen(false);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor:
                    timeFilter === f ? theme.colors.primary[50] : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: timeFilter === f ? "700" : "500",
                    color: timeFilter === f ? theme.colors.brand : theme.colors.black[900],
                  }}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {loading ? (
          <View style={{ paddingVertical: 64, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.brand} size="large" />
          </View>
        ) : (
          <>
            {/* KPI cards */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <KpiCard
                label="Revenue"
                value={formatKobo(currentMetrics.revenue)}
                iconBg={theme.colors.primary[100]}
                change={revenueChange}
              />
              <KpiCard
                label="Orders"
                value={currentMetrics.orders.toLocaleString()}
                iconBg={theme.colors.viridian[100]}
                change={ordersChange}
              />
              <KpiCard
                label="Avg Order"
                value={formatKobo(currentMetrics.aov)}
                iconBg={theme.colors.dixie[100]}
                change={aovChange}
              />
              <KpiCard
                label="New Customers"
                value={currentMetrics.newCustomers.toLocaleString()}
                iconBg="#DBEAFE"
                change={customersChange}
              />
            </View>

            {/* Revenue Trend */}
            <ChartCard
              title="Revenue Trend"
              subtitle={
                hasData
                  ? `${dailyData.length} day${dailyData.length !== 1 ? "s" : ""} · ${formatKobo(currentMetrics.revenue)} total`
                  : "No data for selected period"
              }
            >
              {!hasData ? (
                <EmptyChart message="No orders in this period" />
              ) : (
                <LineChart
                  data={revenueLine}
                  width={chartWidth - 40}
                  height={200}
                  areaChart
                  curved
                  color={theme.colors.brand}
                  startFillColor={theme.colors.brand}
                  endFillColor={theme.colors.white}
                  startOpacity={0.18}
                  endOpacity={0.02}
                  thickness={2}
                  hideDataPoints
                  yAxisColor={theme.colors.black[200]}
                  xAxisColor={theme.colors.black[200]}
                  rulesColor={theme.colors.black[100]}
                  yAxisTextStyle={{ fontSize: 10, color: theme.colors.black[400] }}
                  xAxisLabelTextStyle={{ fontSize: 9, color: theme.colors.black[400] }}
                  formatYLabel={(v: string) => formatChartCurrency(Number(v) * 100)}
                  noOfSections={4}
                />
              )}
            </ChartCard>

            {/* Orders by Day */}
            <ChartCard
              title="Orders by Day"
              subtitle={
                hasData ? `${currentMetrics.orders} total orders` : "No data for selected period"
              }
            >
              {!hasData ? (
                <EmptyChart message="No orders in this period" />
              ) : (
                <BarChart
                  data={ordersBars}
                  width={chartWidth - 40}
                  height={200}
                  barWidth={Math.max(6, (chartWidth - 60) / (ordersBars.length * 1.6))}
                  spacing={6}
                  roundedTop
                  frontColor={theme.colors.viridian[500]}
                  yAxisColor={theme.colors.black[200]}
                  xAxisColor={theme.colors.black[200]}
                  rulesColor={theme.colors.black[100]}
                  yAxisTextStyle={{ fontSize: 10, color: theme.colors.black[400] }}
                  xAxisLabelTextStyle={{ fontSize: 9, color: theme.colors.black[400] }}
                  noOfSections={4}
                />
              )}
            </ChartCard>

            {/* Peak Hours */}
            <ChartCard
              title="Peak Hours"
              subtitle={hasData ? "Orders by hour of day" : "No data"}
            >
              {!hasData ? (
                <EmptyChart message="No orders to analyze" />
              ) : (
                <BarChart
                  data={hourlyBars}
                  width={chartWidth - 40}
                  height={180}
                  barWidth={Math.max(4, (chartWidth - 60) / (24 * 1.6))}
                  spacing={3}
                  roundedTop
                  frontColor={theme.colors.dixie[500]}
                  yAxisColor={theme.colors.black[200]}
                  xAxisColor={theme.colors.black[200]}
                  rulesColor={theme.colors.black[100]}
                  yAxisTextStyle={{ fontSize: 10, color: theme.colors.black[400] }}
                  xAxisLabelTextStyle={{ fontSize: 9, color: theme.colors.black[400] }}
                  noOfSections={3}
                />
              )}
            </ChartCard>

            {/* Order Status */}
            <ChartCard
              title="Order Status"
              subtitle={hasData ? `${orders.length} orders total` : "No data"}
            >
              {!hasData ? (
                <EmptyChart message="No orders to analyze" />
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={80}
                    innerRadius={50}
                    innerCircleColor={theme.colors.white}
                  />
                  <View style={{ flex: 1, gap: 8 }}>
                    {statusData.map((s) => (
                      <View
                        key={s.name}
                        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: s.color,
                          }}
                        />
                        <Text style={{ fontSize: 12, color: theme.colors.black[500], flex: 1 }}>
                          {s.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: theme.colors.black[900],
                          }}
                        >
                          {s.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ChartCard>
          </>
        )}
      </View>
    </ScrollView>
  );
}
