"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronDown,
  TrendingUp,
  ShoppingBag,
  BarChart2,
  Bike,
  Store,
  CalendarDays,
  ArrowRight,
  UtensilsCrossed,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatKobo } from "@foodo/utils";
import { cn } from "@foodo/ui";
import { WhatsNew, type ChangelogEntry } from "@/components/dashboard/whats-new";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeFilter =
  | "today"
  | "yesterday"
  | "last_30min"
  | "last_12h"
  | "last_7days"
  | "last_30days"
  | "custom";

interface Order {
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

interface DashboardHomeClientProps {
  restaurant: Restaurant | null;
  initialOrders: Order[];
  userId: string;
  changelogEntries: ChangelogEntry[];
  changelogLastSeenAt: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFromDate(filter: TimeFilter, customFrom?: Date): Date {
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
    case "custom":
      return customFrom ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

function getToDate(filter: TimeFilter, customTo?: Date): Date | null {
  if (filter === "yesterday") {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (filter === "custom" && customTo) return customTo;
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

function formatDate(date: Date): string {
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
  custom: "Date range",
};

const ACTIVE_STATUSES = ["confirmed", "preparing", "ready_for_pickup"];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending:          { label: "Pending",    className: "bg-black-100 text-black-500" },
    confirmed:        { label: "Confirmed",  className: "bg-blue-100 text-blue-600" },
    preparing:        { label: "Preparing",  className: "bg-dixie-100 text-dixie-700" },
    ready_for_pickup: { label: "Ready",      className: "bg-purple-100 text-purple-600" },
    in_transit:       { label: "In Transit", className: "bg-purple-100 text-purple-600" },
    delivered:        { label: "Delivered",  className: "bg-viridian-100 text-viridian-600" },
    cancelled:        { label: "Cancelled",  className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const { label, className } = config[status] ?? { label: status, className: "bg-black-100 text-black-500" };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}

function FulfillmentIcon({ type }: { type: string }) {
  if (type === "delivery") {
    return <Bike size={13} className="text-black-400 flex-shrink-0" />;
  }
  return <Store size={13} className="text-black-400 flex-shrink-0" />;
}

interface KPICardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accentClass: string;
  iconBgClass: string;
}

function KPICard({ label, value, icon, accentClass, iconBgClass }: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl border border-black-100 p-3.5 flex flex-col gap-2.5">
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0", iconBgClass)}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-black-400 font-medium leading-none">{label}</p>
        <p className={cn("text-xl font-extrabold mt-1 leading-tight tracking-tight truncate", accentClass)}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardHomeClient({
  restaurant,
  initialOrders,
  userId,
  changelogEntries,
  changelogLastSeenAt,
}: DashboardHomeClientProps) {
  const supabase = createBrowserClient();
  const restaurantId = restaurant?.id ?? "";
  const restaurantSlug = restaurant?.slug ?? "";

  const [orders, setOrders] = useState<Order[]>(initialOrders);
  // Local state for accepts_orders so realtime updates reflect immediately
  const [acceptsOrders, setAcceptsOrders] = useState<boolean>(
    restaurant?.accepts_orders ?? false
  );
  const [activeFilter, setActiveFilter] = useState<TimeFilter>("today");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Realtime: orders + restaurant accepts_orders
  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`home-${restaurantId}`)
      // Orders — new/updated
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setOrders((prev) => [payload.new as Order, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === (payload.new as Order).id ? { ...o, ...(payload.new as Order) } : o
              )
            );
          }
        }
      )
      // Restaurant — picks up accepts_orders changes saved from Settings
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "restaurants", filter: `id=eq.${restaurantId}` },
        (payload) => {
          const updated = payload.new as { accepts_orders?: boolean };
          if (typeof updated.accepts_orders === "boolean") {
            setAcceptsOrders(updated.accepts_orders);
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [restaurantId, supabase]);

  // Derived data
  const filteredOrders = orders.filter((order) => {
    const createdAt = new Date(order.created_at);
    const from = getFromDate(activeFilter, customFrom);
    const to = getToDate(activeFilter, customTo);
    return createdAt >= from && (to === null || createdAt < to);
  });

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

  const revenue = filteredOrders.reduce((sum, o) => sum + (o.total_kobo ?? 0), 0);
  const orderCount = filteredOrders.length;
  const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  const recentOrders = filteredOrders.slice(0, 5);

  function selectFilter(f: TimeFilter) {
    setActiveFilter(f);
    if (f !== "custom") setDropdownOpen(false);
  }

  const today = new Date();

  return (
    <div className="pb-24 md:pb-10 min-h-screen bg-black-50">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-black-100 px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-black-400 font-medium">{formatDate(today)}</p>
            <h1 className="text-xl font-extrabold text-black-900 mt-0.5 leading-tight">
              {restaurant?.name ?? "Dashboard"}
            </h1>
          </div>
          {/* Reopen button only — the auto-popup is mounted once at the
              dashboard layout level so it shows on whatever page you land on. */}
          <WhatsNew
            userId={userId}
            entries={changelogEntries}
            lastSeenAt={changelogLastSeenAt}
            autoOpen={false}
          />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 mt-3">

          {/* Time filter */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              aria-label="Filter by time period"
              className={cn(
                "flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer min-h-[36px]",
                dropdownOpen
                  ? "bg-purple-500 text-white shadow-sm"
                  : "bg-purple-50 text-purple-600 hover:bg-purple-100"
              )}
            >
              <CalendarDays size={13} strokeWidth={2.5} />
              {FILTER_LABELS[activeFilter]}
              <ChevronDown
                size={12}
                strokeWidth={2.5}
                className={cn("transition-transform duration-150", dropdownOpen && "rotate-180")}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-black-100 rounded-2xl shadow-xl py-1.5 min-w-[180px]">
                {(Object.keys(FILTER_LABELS) as TimeFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => selectFilter(f)}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors duration-100 cursor-pointer min-h-[44px] flex items-center",
                      activeFilter === f
                        ? "text-purple-600 font-semibold bg-purple-50"
                        : "text-black-700 hover:bg-black-50"
                    )}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}

                {activeFilter === "custom" && (
                  <div className="px-4 py-3 border-t border-black-50 space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-black-400 uppercase tracking-wide mb-1">
                        From
                      </label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 text-xs border border-black-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                        onChange={(e) => setCustomFrom(e.target.value ? new Date(e.target.value) : undefined)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-black-400 uppercase tracking-wide mb-1">
                        To
                      </label>
                      <input
                        type="date"
                        className="w-full px-3 py-2 text-xs border border-black-200 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-colors"
                        onChange={(e) => setCustomTo(e.target.value ? new Date(e.target.value) : undefined)}
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

          {/* Store status — display only */}
          {restaurant && (
            <div
              className={cn(
                "flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-xl min-h-[36px]",
                acceptsOrders
                  ? "bg-viridian-50 text-viridian-700"
                  : "bg-cinnabar-50 text-cinnabar-600"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  acceptsOrders
                    ? "bg-viridian-500 animate-pulse"
                    : "bg-cinnabar-500"
                )}
              />
              {acceptsOrders ? "Open" : "Closed"}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── KPI cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <KPICard
            label="Revenue"
            value={abbreviateKobo(revenue)}
            icon={<TrendingUp size={16} className="text-purple-600" strokeWidth={2.5} />}
            accentClass="text-black-900"
            iconBgClass="bg-purple-100"
          />
          <KPICard
            label="Orders"
            value={orderCount.toString()}
            icon={<ShoppingBag size={16} className="text-viridian-600" strokeWidth={2.5} />}
            accentClass="text-black-900"
            iconBgClass="bg-viridian-100"
          />
          <KPICard
            label="Avg Order"
            value={abbreviateKobo(avgOrderValue)}
            icon={<BarChart2 size={16} className="text-dixie-600" strokeWidth={2.5} />}
            accentClass="text-black-900"
            iconBgClass="bg-dixie-100"
          />
        </div>

        {/* ── Active orders ───────────────────────────────────────────── */}
        {activeOrders.length > 0 && (
          <div className="bg-dixie-50 border border-dixie-200 rounded-2xl overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-dixie-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-dixie-500 animate-pulse flex-shrink-0" />
                <p className="text-sm font-bold text-dixie-800">
                  {activeOrders.length} order{activeOrders.length !== 1 ? "s" : ""} need attention
                </p>
              </div>
              <Link
                href="/dashboard/orders"
                className="flex items-center gap-1 text-xs font-semibold text-dixie-600 hover:text-dixie-800 transition-colors duration-150 cursor-pointer"
              >
                View all
                <ArrowRight size={11} strokeWidth={2.5} />
              </Link>
            </div>

            {/* Order rows */}
            <div className="divide-y divide-dixie-100">
              {activeOrders.map((order) => (
                <Link
                  key={order.id}
                  href="/dashboard/orders"
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-dixie-100/60 transition-colors duration-150 cursor-pointer min-h-[56px]"
                >
                  {/* Fulfillment icon */}
                  <div className="w-8 h-8 rounded-xl bg-white border border-dixie-200 flex items-center justify-center flex-shrink-0">
                    <FulfillmentIcon type={order.fulfillment_type} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-black-900 leading-tight">
                        #{order.order_number}
                      </p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-black-500 mt-0.5 truncate">{order.customer_name}</p>
                    {order.special_instructions && (
                      <p className="text-[11px] text-dixie-500 mt-0.5 flex items-center gap-1">
                        <StickyNote size={10} className="flex-shrink-0" />
                        <span className="truncate">{order.special_instructions}</span>
                      </p>
                    )}
                  </div>

                  {/* Amount + chevron */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <p className="text-sm font-bold text-black-900">
                      {formatKobo(order.total_kobo)}
                    </p>
                    <ChevronRight size={14} className="text-dixie-400" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent orders ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-black-100 overflow-hidden">
          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-black-100">
            <h2 className="text-sm font-bold text-black-900">Recent Orders</h2>
            <Link
              href="/dashboard/orders"
              className="flex items-center gap-1 text-xs font-semibold text-purple-500 hover:text-purple-700 transition-colors duration-150 cursor-pointer"
            >
              See all
              <ArrowRight size={11} strokeWidth={2.5} />
            </Link>
          </div>

          {/* Empty state */}
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-black-100 flex items-center justify-center">
                <UtensilsCrossed size={22} className="text-black-300" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-black-600">No orders yet</p>
                <p className="text-xs text-black-400 mt-0.5">
                  Orders for this period will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-black-50">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/${restaurantSlug}/orders/${order.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-black-50 transition-colors duration-150 cursor-pointer min-h-[60px]"
                >
                  {/* Fulfillment icon */}
                  <div className="w-9 h-9 rounded-xl bg-black-50 border border-black-100 flex items-center justify-center flex-shrink-0">
                    <FulfillmentIcon type={order.fulfillment_type} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold text-black-900">
                        #{order.order_number}
                      </p>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-xs text-black-400 mt-0.5 truncate">{order.customer_name}</p>
                    {order.special_instructions && (
                      <p className="text-[11px] text-dixie-500 mt-0.5 flex items-center gap-1">
                        <StickyNote size={10} className="flex-shrink-0" />
                        <span className="truncate">{order.special_instructions}</span>
                      </p>
                    )}
                  </div>

                  {/* Amount + time */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-black-900">
                      {formatKobo(order.total_kobo)}
                    </p>
                    <p className="text-[11px] text-black-400 mt-0.5">{timeAgo(order.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
