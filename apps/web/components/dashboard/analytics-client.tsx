"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  CalendarDays,
  ChevronDown,
  TrendingUp,
  Minus,
  ShoppingBag,
  Users,
  CreditCard,
  Bike,
  Store,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeFilter =
  | "today"
  | "yesterday"
  | "last_7days"
  | "last_30days"
  | "this_month"
  | "last_month"
  | "custom";

interface AnalyticsOrder {
  id: string;
  total_kobo: number;
  status: string;
  fulfillment_type: string;
  payment_status: string;
  created_at: string;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  service_fee_kobo: number;
}

/**
 * Merchant-facing revenue for one order: everything the customer paid except
 * the (Foodo-owned) customer service fee. Mirrors the canonical settlement
 * `gross` (subtotal + VAT + delivery, post-discount) so the merchant dashboard
 * and admin settlements agree. The service fee never reaches the merchant.
 */
function orderRevenue(o: AnalyticsOrder): number {
  return (o.total_kobo ?? 0) - (o.service_fee_kobo ?? 0);
}

interface AnalyticsOrderItem {
  item_name: string;
  quantity: number;
  line_total_kobo: number;
}

interface AnalyticsCustomer {
  id: string;
  first_order_at: string | null;
}

interface DailyData {
  date: string;
  displayDate: string;
  revenue: number;
  orders: number;
}

interface HourlyData {
  hour: number;
  label: string;
  orders: number;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface PeriodMetrics {
  revenue: number;
  orders: number;
  aov: number;
  newCustomers: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_LABELS: Record<TimeFilter, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last_7days: "Last 7 days",
  last_30days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  custom: "Custom range",
};

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

const FULFILLMENT_COLORS: Record<string, string> = {
  delivery: "#7B2CBF",
  pickup: "#2D6A4F",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRange(filter: TimeFilter, customFrom?: Date, customTo?: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "today":
      return {
        from: today,
        to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    case "yesterday": {
      const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { from: yest, to: today };
    }
    case "last_7days":
      return {
        from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    case "last_30days":
      return {
        from: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    case "this_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "last_month": {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: firstOfThisMonth,
      };
    }
    case "custom":
      return {
        from: customFrom ?? today,
        to: customTo
          ? new Date(customTo.getTime() + 24 * 60 * 60 * 1000)
          : new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
  }
}

function getPreviousPeriodRange(from: Date, to: Date) {
  const duration = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - duration),
    to: from,
  };
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

function buildDailyData(
  orders: AnalyticsOrder[],
  rangeFrom: Date,
  rangeTo: Date,
  filter: TimeFilter
): DailyData[] {
  const days: Record<string, DailyData> = {};

  for (
    let d = new Date(rangeFrom);
    d < rangeTo;
    d.setDate(d.getDate() + 1)
  ) {
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
      days[key].revenue += orderRevenue(o);
      days[key].orders += 1;
    }
  });

  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}

function buildHourlyData(orders: AnalyticsOrder[]): HourlyData[] {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i.toString().padStart(2, "0")}:00`,
    orders: 0,
  }));
  orders.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    hours[h].orders += 1;
  });
  return hours;
}

function buildStatusData(orders: AnalyticsOrder[]): StatusData[] {
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
  const validOrders = orders.filter((o) => o.status !== "cancelled");
  const revenue = validOrders.reduce((sum, o) => sum + orderRevenue(o), 0);
  const orderCount = validOrders.length;
  const aov = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
  const newCustomers = customers.length;
  return { revenue, orders: orderCount, aov, newCustomers };
}

function computeComparison(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KPICard({
  label,
  value,
  icon,
  accentClass,
  iconBgClass,
  change,
  isPositiveGood = true,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentClass: string;
  iconBgClass: string;
  change: number;
  isPositiveGood?: boolean;
}) {
  const isPositive = change > 0;
  const isNeutral = change === 0;
  const isGood = isPositiveGood ? isPositive : !isPositive;

  return (
    <div className="bg-white rounded-2xl border border-black-100 p-3.5 flex flex-col gap-2.5">
      <div
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
          iconBgClass
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-black-400 font-medium leading-none">
          {label}
        </p>
        <p
          className={cn(
            "text-xl font-extrabold mt-1 leading-tight tracking-tight truncate",
            accentClass
          )}
        >
          {value}
        </p>
        <div className="flex items-center gap-1 mt-1.5">
          {isNeutral ? (
            <Minus size={12} className="text-black-400" />
          ) : isPositive ? (
            <ArrowUpRight
              size={12}
              className={isGood ? "text-viridian-500" : "text-cinnabar-500"}
            />
          ) : (
            <ArrowDownRight
              size={12}
              className={isGood ? "text-viridian-500" : "text-cinnabar-500"}
            />
          )}
          <span
            className={cn(
              "text-[11px] font-semibold",
              isNeutral
                ? "text-black-400"
                : isGood
                  ? "text-viridian-500"
                  : "text-cinnabar-500"
            )}
          >
            {isNeutral ? "No change" : `${Math.abs(change)}%`}
          </span>
          <span className="text-[10px] text-black-400">vs last period</span>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-black-100 overflow-hidden",
        className
      )}
    >
      <div className="px-4 py-3 border-b border-black-100">
        <h3 className="font-semibold text-black-900 text-sm">{title}</h3>
        {subtitle && (
          <p className="text-xs text-black-400 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  valuePrefix = "",
}: {
  active?: boolean;
  payload?: Array<{ value: number; color: string; name: string }>;
  label?: string;
  valuePrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-black-200 rounded-xl shadow-xl px-3 py-2">
      <p className="text-xs font-semibold text-black-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-black-500">{entry.name}:</span>
          <span className="font-semibold text-black-900">
            {valuePrefix === "currency"
              ? formatKobo(entry.value)
              : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      <BarChart2Fallback />
      <p className="text-sm text-black-400">{message}</p>
    </div>
  );
}

function BarChart2Fallback() {
  return (
    <div className="w-10 h-10 rounded-xl bg-black-100 flex items-center justify-center">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9E9E9E"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-black-100 p-3.5 animate-pulse">
      <div className="w-8 h-8 rounded-xl bg-black-100 mb-2.5" />
      <div className="h-3 bg-black-100 rounded w-16 mb-1.5" />
      <div className="h-6 bg-black-100 rounded w-24" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsClient({ restaurantId }: { restaurantId: string }) {
  const supabase = createBrowserClient();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("last_30days");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<AnalyticsOrder[]>([]);
  const [orderItems, setOrderItems] = useState<AnalyticsOrderItem[]>([]);
  const [customers, setCustomers] = useState<AnalyticsCustomer[]>([]);
  const [prevOrders, setPrevOrders] = useState<AnalyticsOrder[]>([]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch data when filter changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { from, to } = getRange(timeFilter, customFrom, customTo);
      const { from: prevFrom, to: prevTo } = getPreviousPeriodRange(from, to);

      const [
        { data: currentOrders },
        { data: currentCustomers },
        { data: previousOrders },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, total_kobo, status, fulfillment_type, payment_status, created_at, subtotal_kobo, delivery_fee_kobo, service_fee_kobo"
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
          .select("total_kobo, status, created_at, service_fee_kobo")
          .eq("restaurant_id", restaurantId)
          .gte("created_at", prevFrom.toISOString())
          .lt("created_at", prevTo.toISOString()),
      ]);

      const orderIds = (currentOrders ?? []).map((o) => o.id);

      const { data: currentItems } =
        orderIds.length > 0
          ? await supabase
              .from("order_items")
              .select("item_name, quantity, line_total_kobo")
              .eq("restaurant_id", restaurantId)
              .in("order_id", orderIds)
          : { data: [] };

      setOrders((currentOrders as AnalyticsOrder[]) ?? []);
      setOrderItems((currentItems as AnalyticsOrderItem[]) ?? []);
      setCustomers((currentCustomers as AnalyticsCustomer[]) ?? []);
      setPrevOrders((previousOrders as AnalyticsOrder[]) ?? []);
      setLoading(false);
    }

    fetchData();
  }, [supabase, restaurantId, timeFilter, customFrom, customTo]);

  // Computed metrics
  const currentMetrics = useMemo(
    () => computeMetrics(orders, customers),
    [orders, customers]
  );
  const prevMetrics = useMemo(
    () => computeMetrics(prevOrders, []),
    [prevOrders]
  );

  const revenueChange = computeComparison(
    currentMetrics.revenue,
    prevMetrics.revenue
  );
  const ordersChange = computeComparison(
    currentMetrics.orders,
    prevMetrics.orders
  );
  const aovChange = computeComparison(currentMetrics.aov, prevMetrics.aov);
  const customersChange = computeComparison(
    currentMetrics.newCustomers,
    prevMetrics.newCustomers
  );

  // Chart data
  const { from, to } = useMemo(
    () => getRange(timeFilter, customFrom, customTo),
    [timeFilter, customFrom, customTo]
  );

  const dailyData = useMemo(
    () =>
      buildDailyData(
        orders.filter((o) => o.status !== "cancelled"),
        from,
        to,
        timeFilter
      ),
    [orders, from, to, timeFilter]
  );

  const hourlyData = useMemo(() => buildHourlyData(orders), [orders]);

  const statusData = useMemo(() => buildStatusData(orders), [orders]);

  // Top items
  const topItems = useMemo(() => {
    const map = new Map<string, { quantity: number; revenue: number }>();
    orderItems.forEach((item) => {
      const existing = map.get(item.item_name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += item.line_total_kobo ?? 0;
      } else {
        map.set(item.item_name, {
          quantity: item.quantity,
          revenue: item.line_total_kobo ?? 0,
        });
      }
    });
    return [...map.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [orderItems]);

  const maxTopItemQty = topItems[0]?.quantity ?? 0;

  // Fulfillment breakdown
  const fulfillmentData = useMemo(() => {
    const delivery = orders.filter((o) => o.fulfillment_type === "delivery").length;
    const pickup = orders.filter((o) => o.fulfillment_type === "pickup").length;
    const total = delivery + pickup;
    return [
      {
        label: "Delivery",
        count: delivery,
        percentage: total > 0 ? (delivery / total) * 100 : 0,
        color: FULFILLMENT_COLORS.delivery,
        icon: <Bike size={14} className="text-purple-600" />,
      },
      {
        label: "Pickup",
        count: pickup,
        percentage: total > 0 ? (pickup / total) * 100 : 0,
        color: FULFILLMENT_COLORS.pickup,
        icon: <Store size={14} className="text-viridian-600" />,
      },
    ];
  }, [orders]);

  // Payment breakdown
  const paymentData = useMemo(() => {
    const paid = orders.filter((o) => o.payment_status === "paid").length;
    const pending = orders.filter((o) => o.payment_status === "pending").length;
    const failed = orders.filter((o) => o.payment_status === "failed").length;
    return { paid, pending, failed };
  }, [orders]);

  function selectFilter(f: TimeFilter) {
    setTimeFilter(f);
    if (f !== "custom") setDropdownOpen(false);
  }

  const hasData = orders.length > 0;

  return (
    <div className="pb-24 md:pb-10 min-h-screen bg-black-50">
      {/* Header */}
      <div className="bg-white border-b border-black-100 px-4 pt-5 pb-4">
        <h1 className="text-xl font-extrabold text-black-900 leading-tight">
          Analytics
        </h1>
        <p className="text-sm text-black-400 mt-0.5">
          Insights to help you grow your business
        </p>

        {/* Time filter */}
        <div className="relative mt-3" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer min-h-[36px]",
              dropdownOpen
                ? "bg-purple-500 text-white shadow-sm"
                : "bg-purple-50 text-purple-600 hover:bg-purple-100"
            )}
          >
            <CalendarDays size={13} strokeWidth={2.5} />
            {FILTER_LABELS[timeFilter]}
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className={cn(
                "transition-transform duration-150",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-black-100 rounded-2xl shadow-xl py-1.5 min-w-[200px]">
              {(Object.keys(FILTER_LABELS) as TimeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => selectFilter(f)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm transition-colors duration-100 cursor-pointer min-h-[44px] flex items-center",
                    timeFilter === f
                      ? "text-purple-600 font-semibold bg-purple-50"
                      : "text-black-700 hover:bg-black-50"
                  )}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}

              {timeFilter === "custom" && (
                <div className="px-4 py-3 border-t border-black-50 space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-black-400 uppercase tracking-wide mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 text-xs border border-black-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                      onChange={(e) =>
                        setCustomFrom(
                          e.target.value ? new Date(e.target.value) : undefined
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-black-400 uppercase tracking-wide mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 text-xs border border-black-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                      onChange={(e) =>
                        setCustomTo(
                          e.target.value ? new Date(e.target.value) : undefined
                        )
                      }
                    />
                  </div>
                  <button
                    onClick={() => setDropdownOpen(false)}
                    className="w-full text-xs font-bold bg-purple-500 text-white py-2 rounded-xl hover:bg-purple-400 transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPICard
              label="Revenue"
              value={formatKobo(currentMetrics.revenue)}
              icon={
                <TrendingUp
                  size={16}
                  className="text-purple-600"
                  strokeWidth={2.5}
                />
              }
              accentClass="text-black-900"
              iconBgClass="bg-purple-100"
              change={revenueChange}
            />
            <KPICard
              label="Orders"
              value={currentMetrics.orders.toLocaleString()}
              icon={
                <ShoppingBag
                  size={16}
                  className="text-viridian-600"
                  strokeWidth={2.5}
                />
              }
              accentClass="text-black-900"
              iconBgClass="bg-viridian-100"
              change={ordersChange}
            />
            <KPICard
              label="Avg Order"
              value={formatKobo(currentMetrics.aov)}
              icon={
                <CreditCard
                  size={16}
                  className="text-dixie-600"
                  strokeWidth={2.5}
                />
              }
              accentClass="text-black-900"
              iconBgClass="bg-dixie-100"
              change={aovChange}
            />
            <KPICard
              label="New Customers"
              value={currentMetrics.newCustomers.toLocaleString()}
              icon={
                <Users
                  size={16}
                  className="text-blue-600"
                  strokeWidth={2.5}
                />
              }
              accentClass="text-black-900"
              iconBgClass="bg-blue-100"
              change={customersChange}
            />
          </div>
        )}

        {/* Revenue Trend */}
        <ChartCard
          title="Revenue Trend"
          subtitle={
            hasData
              ? `${dailyData.length} day${dailyData.length !== 1 ? "s" : ""} · ${formatKobo(currentMetrics.revenue)} total`
              : "No data for selected period"
          }
        >
          {loading ? (
            <div className="h-64 animate-pulse bg-black-50 rounded-xl" />
          ) : !hasData ? (
            <EmptyChartState message="No orders in this period" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7B2CBF" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#7B2CBF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatChartCurrency(v)}
                    width={60}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip valuePrefix="currency" />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#7B2CBF"
                    strokeWidth={2}
                    fill="url(#revGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Orders by Day */}
        <ChartCard
          title="Orders by Day"
          subtitle={
            hasData
              ? `${currentMetrics.orders} total orders`
              : "No data for selected period"
          }
        >
          {loading ? (
            <div className="h-64 animate-pulse bg-black-50 rounded-xl" />
          ) : !hasData ? (
            <EmptyChartState message="No orders in this period" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={{ stroke: "#E0E0E0" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#9E9E9E" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={40}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip />
                    }
                  />
                  <Bar
                    dataKey="orders"
                    name="Orders"
                    fill="#2D6A4F"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Two-column charts on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Order Status Breakdown */}
          <ChartCard
            title="Order Status"
            subtitle={
              hasData
                ? `${orders.length} orders total`
                : "No data"
            }
          >
            {loading ? (
              <div className="h-56 animate-pulse bg-black-50 rounded-xl" />
            ) : !hasData ? (
              <EmptyChartState message="No orders to analyze" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload as StatusData;
                        return (
                          <div className="bg-white border border-black-200 rounded-xl shadow-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="text-xs font-semibold text-black-700">
                                {data.name}
                              </span>
                            </div>
                            <p className="text-xs text-black-500 mt-1">
                              {data.value} orders (
                              {(
                                (data.value / orders.length) *
                                100
                              ).toFixed(1)}
                              %)
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-black-500">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          {/* Peak Hours */}
          <ChartCard
            title="Peak Hours"
            subtitle={
              hasData
                ? "Orders by hour of day"
                : "No data"
            }
          >
            {loading ? (
              <div className="h-56 animate-pulse bg-black-50 rounded-xl" />
            ) : !hasData ? (
              <EmptyChartState message="No orders to analyze" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#9E9E9E" }}
                      axisLine={{ stroke: "#E0E0E0" }}
                      tickLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#9E9E9E" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={30}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-white border border-black-200 rounded-xl shadow-xl px-3 py-2">
                            <p className="text-xs font-semibold text-black-700">
                              {label}
                            </p>
                            <p className="text-xs text-black-500">
                              {payload[0].value} orders
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="orders"
                      name="Orders"
                      fill="#F4A261"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Fulfillment Breakdown */}
        <ChartCard title="Fulfillment Type" subtitle="Delivery vs Pickup">
          {loading ? (
            <div className="h-24 animate-pulse bg-black-50 rounded-xl" />
          ) : !hasData ? (
            <EmptyChartState message="No orders to analyze" />
          ) : (
            <div className="space-y-4 py-2">
              {fulfillmentData.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: `${item.color}15`,
                        }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-black-900">
                          {item.label}
                        </p>
                        <p className="text-xs text-black-400">
                          {item.count} orders
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-black-900">
                      {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-black-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        {/* Payment Status */}
        {hasData && !loading && (
          <div className="bg-white rounded-2xl border border-black-100 p-4">
            <h3 className="font-semibold text-black-900 text-sm mb-3">
              Payment Status
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-viridian-50 rounded-xl">
                <p className="text-lg font-bold text-viridian-600">
                  {paymentData.paid}
                </p>
                <p className="text-[11px] text-viridian-600 font-medium mt-0.5">
                  Paid
                </p>
              </div>
              <div className="text-center p-3 bg-dixie-50 rounded-xl">
                <p className="text-lg font-bold text-dixie-600">
                  {paymentData.pending}
                </p>
                <p className="text-[11px] text-dixie-600 font-medium mt-0.5">
                  Pending
                </p>
              </div>
              <div className="text-center p-3 bg-cinnabar-50 rounded-xl">
                <p className="text-lg font-bold text-cinnabar-500">
                  {paymentData.failed}
                </p>
                <p className="text-[11px] text-cinnabar-500 font-medium mt-0.5">
                  Failed
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Items */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-black-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-black-900 text-sm">
                Top Items
              </h2>
              <p className="text-xs text-black-400 mt-0.5">
                By quantity sold
              </p>
            </div>
            <Package size={16} className="text-black-300" />
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-3">
                  <div className="w-5 h-4 bg-black-100 rounded" />
                  <div className="flex-1 h-4 bg-black-100 rounded" />
                  <div className="w-16 h-4 bg-black-100 rounded" />
                </div>
              ))}
            </div>
          ) : topItems.length === 0 ? (
            <p className="text-sm text-black-400 px-4 py-8 text-center">
              No item sales in this period
            </p>
          ) : (
            <div>
              {topItems.map((item, i) => {
                const pct =
                  maxTopItemQty > 0
                    ? (item.quantity / maxTopItemQty) * 100
                    : 0;
                return (
                  <div
                    key={item.name}
                    className="px-4 py-3 border-b border-black-50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-purple-500 w-5 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-black-900 truncate">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-black-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-black-900">
                          {item.quantity} sold
                        </p>
                        <p className="text-[11px] text-black-400">
                          {formatKobo(item.revenue)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
