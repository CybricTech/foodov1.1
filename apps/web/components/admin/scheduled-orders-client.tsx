"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import { formatKobo, formatLagosSlotLabel } from "@foodo/utils";
import {
  CalendarClock,
  Search,
  Store,
  Zap,
  AlertTriangle,
  Ban,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ScheduledOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_kobo: number;
  created_at: string;
  scheduled_for: string;
  activated_at: string | null;
  cancellation_reason: string | null;
  restaurants: { id: string; name: string; slug: string; logo_url: string | null };
}

type Bucket = "pending" | "activated" | "cancelled";

function bucketFor(o: ScheduledOrderRow): Bucket {
  if (o.status === "cancelled") return "cancelled";
  if (o.activated_at) return "activated";
  return "pending";
}

function formatUntil(iso: string, nowMs: number): string {
  const diffMin = Math.round((new Date(iso).getTime() - nowMs) / 60_000);
  if (diffMin <= 0) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const days = Math.floor(diffMin / 1440);
  if (days >= 1) return `${days}d ${Math.floor((diffMin % 1440) / 60)}h`;
  return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ScheduledOrdersClient({
  initialOrders,
}: {
  initialOrders: ScheduledOrderRow[];
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [orders, setOrders] = useState<ScheduledOrderRow[]>(initialOrders);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Bucket>("pending");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime — every order INSERT/UPDATE (same broad-subscribe pattern as
  // Live Ops); client-side filters to rows that carry a scheduled_for.
  useEffect(() => {
    const channel = supabase
      .channel("admin-scheduled-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as Partial<ScheduledOrderRow> & { id: string };
          if (!row.scheduled_for) return;
          setOrders((prev) =>
            prev.some((o) => o.id === row.id)
              ? prev
              : [{ ...row, restaurants: undefined } as unknown as ScheduledOrderRow, ...prev]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as Partial<ScheduledOrderRow> & { id: string };
          setOrders((prev) =>
            prev.map((o) => (o.id === row.id ? { ...o, ...row } : o))
          );
        }
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      channel.unsubscribe();
    };
  }, [supabase]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { pending: 0, activated: 0, cancelled: 0 };
    for (const o of orders) c[bucketFor(o)] += 1;
    return c;
  }, [orders]);

  const dueSoonCount = useMemo(
    () =>
      orders.filter(
        (o) =>
          bucketFor(o) === "pending" &&
          new Date(o.scheduled_for).getTime() - now <= 30 * 60_000
      ).length,
    [orders, now]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => bucketFor(o) === tab)
      .filter((o) =>
        q
          ? o.order_number.toLowerCase().includes(q) ||
            (o.customer_name ?? "").toLowerCase().includes(q) ||
            (o.restaurants?.name ?? "").toLowerCase().includes(q)
          : true
      )
      .sort(
        (a, b) =>
          new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
      );
  }, [orders, tab, search]);

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-black-900">
              Scheduled Orders
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                live ? "bg-viridian-100 text-emerald-700" : "bg-gold-100 text-gold-600"
              )}
            >
              <span className="relative flex h-2 w-2">
                {live && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    live ? "bg-emerald-500" : "bg-gold"
                  )}
                />
              </span>
              {live ? "Live" : "Connecting"}
            </span>
          </div>
          <p className="text-black-500 text-sm mt-1">
            Every pre-order booked across Kitchyn — paid up front, waiting on its slot
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, merchant…"
            className="w-64 rounded-xl border border-black-200 bg-white pl-9 pr-3 py-2 text-sm text-black-900 placeholder:text-black-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Pending Activation"
          value={counts.pending.toLocaleString()}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="purple"
        />
        <Kpi
          label="Due in 30m"
          value={dueSoonCount.toLocaleString()}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={dueSoonCount > 0 ? "amber" : undefined}
        />
        <Kpi
          label="Activated"
          value={counts.activated.toLocaleString()}
          icon={<Zap className="h-4 w-4" />}
        />
        <Kpi
          label="Cancelled"
          value={counts.cancelled.toLocaleString()}
          icon={<Ban className="h-4 w-4" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-black-200">
        {(
          [
            { key: "pending", label: "Pending Activation" },
            { key: "activated", label: "Activated" },
            { key: "cancelled", label: "Cancelled" },
          ] as { key: Bucket; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
              tab === key
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-black-400 hover:text-black-700"
            )}
          >
            {label}
            {counts[key] > 0 && (
              <span className="ml-1.5 text-xs text-black-400">({counts[key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-black-200 divide-y divide-black-100">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-black-500">
            {tab === "pending"
              ? "No scheduled orders waiting on activation."
              : tab === "activated"
                ? "No scheduled orders have entered the live queue yet."
                : "No scheduled orders have been cancelled."}
          </div>
        ) : (
          filtered.map((o) => <ScheduledOrderRowItem key={o.id} order={o} now={now} />)
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: "purple" | "amber";
}) {
  const valueColor =
    tone === "purple" ? "text-purple-600" : tone === "amber" ? "text-gold-600" : "text-black-900";
  return (
    <div className="bg-white rounded-2xl border border-black-200 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-black-400">
        {icon}
        <p className="text-[11px] text-black-500 font-medium truncate">{label}</p>
      </div>
      <p className={cn("text-xl font-extrabold mt-1", valueColor)}>{value}</p>
    </div>
  );
}

function ScheduledOrderRowItem({ order, now }: { order: ScheduledOrderRow; now: number }) {
  const bucket = bucketFor(order);
  const restaurant = order.restaurants;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {restaurant?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={restaurant.logo_url}
          alt={restaurant.name}
          className="h-9 w-9 rounded-xl object-cover border border-black-100 flex-shrink-0"
        />
      ) : (
        <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-extrabold flex-shrink-0">
          <Store className="h-4 w-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-black-900">#{order.order_number}</span>
          {restaurant && (
            <Link
              href={`/admin/merchants/${restaurant.id}`}
              className="text-xs font-medium text-purple-600 hover:underline truncate"
            >
              {restaurant.name}
            </Link>
          )}
          <BucketBadge bucket={bucket} />
        </div>
        <p className="text-xs text-black-500 truncate mt-0.5">
          {order.customer_name ?? "Guest"} · {formatKobo(order.total_kobo)}
          {order.status === "cancelled" && order.cancellation_reason && (
            <span className="text-cinnabar-500"> · {order.cancellation_reason}</span>
          )}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-xs font-bold text-black-900">
          {formatLagosSlotLabel(new Date(order.scheduled_for))}
        </p>
        {bucket === "pending" && (
          <p className="text-[10px] font-semibold text-purple-600 mt-0.5">
            in {formatUntil(order.scheduled_for, now)}
          </p>
        )}
      </div>
    </div>
  );
}

function BucketBadge({ bucket }: { bucket: Bucket }) {
  const config: Record<Bucket, { label: string; className: string }> = {
    pending: { label: "Scheduled", className: "bg-purple-50 text-purple-600" },
    activated: { label: "Live", className: "bg-viridian-100 text-emerald-700" },
    cancelled: { label: "Cancelled", className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const c = config[bucket];
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", c.className)}>
      {c.label}
    </span>
  );
}
