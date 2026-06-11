"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { useConnectionOptional } from "@/lib/connection-context";
import { cn } from "@foodo/ui";
import { formatKobo } from "@foodo/utils";
import {
  AlertTriangle,
  Bike,
  ChevronDown,
  Clock,
  Flame,
  PauseCircle,
  Search,
  ShoppingBag,
  Store,
  Wallet,
  Zap,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type DayHours = { enabled: boolean; open: string; close: string };
type OpeningHours = Record<string, DayHours>;

export interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  accepts_orders: boolean;
  opening_hours: OpeningHours | null;
  closure_message: string | null;
  city: string | null;
  estimated_delivery_minutes: number | null;
}

export interface LiveOrderRow {
  id: string;
  restaurant_id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment_type: string;
  dispatch_type: string | null;
  total_kobo: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  special_instructions: string | null;
  created_at: string;
  updated_at: string;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  cancelled_reason: string | null;
}

interface FeedEvent {
  key: string;
  at: number;
  orderId: string;
  orderNumber: string;
  merchantName: string;
  status: string;
  totalKobo: number;
  isNew: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
] as const;

const ACTIVE_SET = new Set<string>(ACTIVE_STATUSES);

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

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gold-100 text-gold-600",
  confirmed: "bg-purple-50 text-purple-700",
  preparing: "bg-dixie-100 text-orange-700",
  ready_for_pickup: "bg-orange-100 text-orange-700",
  assigned_to_rider: "bg-purple-100 text-purple-700",
  in_transit: "bg-purple-100 text-purple-800",
  delivered: "bg-viridian-100 text-emerald-700",
  cancelled: "bg-cinnabar-100 text-cinnabar-500",
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gold",
  confirmed: "bg-purple-400",
  preparing: "bg-dixie-500",
  ready_for_pickup: "bg-orange-500",
  assigned_to_rider: "bg-purple-500",
  in_transit: "bg-purple-600",
  delivered: "bg-viridian-500",
  cancelled: "bg-cinnabar-500",
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const STALE_PENDING_MINUTES = 10;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function isWithinOpeningHours(hours: OpeningHours | null, nowMs: number): boolean {
  if (!hours || Object.keys(hours).length === 0) return true; // no hours configured = always open
  const now = new Date(
    new Date(nowMs).toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
  const day = hours[DAY_KEYS[now.getDay()]];
  if (!day?.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = day.open.split(":").map(Number);
  const [ch, cm] = day.close.split(":").map(Number);
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  return close <= open ? cur >= open || cur < close : cur >= open && cur < close;
}

function minutesSince(dateStr: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(dateStr).getTime()) / 60000));
}

function formatAge(dateStr: string, nowMs: number): string {
  const diff = Math.floor((nowMs - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d`;
}

function minutesLate(order: LiveOrderRow, nowMs: number): number {
  if (!ACTIVE_SET.has(order.status) || !order.estimated_delivery_at) return 0;
  const late = Math.floor(
    (nowMs - new Date(order.estimated_delivery_at).getTime()) / 60000
  );
  return late > 0 ? late : 0;
}

function todayStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function firstName(name: string | null): string {
  if (!name) return "Guest";
  return name.trim().split(/\s+/)[0];
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function LiveOpsClient({
  initialMerchants,
  initialOrders,
  ridersOnline,
  pendingSettlements,
}: {
  initialMerchants: MerchantRow[];
  initialOrders: LiveOrderRow[];
  ridersOnline: number;
  pendingSettlements: number;
}) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const connection = useConnectionOptional();

  const [merchants, setMerchants] = useState<MerchantRow[]>(initialMerchants);
  const [orders, setOrders] = useState<LiveOrderRow[]>(initialOrders);
  const [feed, setFeed] = useState<FeedEvent[]>(() =>
    [...initialOrders]
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .slice(0, 14)
      .map((o) => ({
        key: `seed-${o.id}`,
        at: new Date(o.updated_at).getTime(),
        orderId: o.id,
        orderNumber: o.order_number,
        merchantName:
          initialMerchants.find((m) => m.id === o.restaurant_id)?.name ?? "—",
        status: o.status,
        totalKobo: o.total_kobo,
        isNew: o.status === "pending",
      }))
  );
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [lastSync, setLastSync] = useState(() => Date.now());

  const merchantsRef = useRef(merchants);
  merchantsRef.current = merchants;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useEffect(() => setMounted(true), []);

  // Tick — keeps ages, lateness and open-hours state fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const pushFeed = useCallback((ev: FeedEvent) => {
    setFeed((prev) => [ev, ...prev].slice(0, 40));
  }, []);

  // Full snapshot refetch — used on reconnect and as a periodic safety net
  const refetchSnapshot = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [{ data: freshOrders }, { data: freshMerchants }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, restaurant_id, order_number, status, payment_status, fulfillment_type, dispatch_type, total_kobo, customer_name, customer_phone, delivery_address, special_instructions, created_at, updated_at, estimated_delivery_at, delivered_at, cancelled_reason"
        )
        .or(
          `created_at.gte.${start.toISOString()},status.in.(${ACTIVE_STATUSES.join(",")})`
        )
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase
        .from("restaurants")
        .select(
          "id, name, slug, logo_url, accepts_orders, opening_hours, closure_message, city, estimated_delivery_minutes"
        )
        .eq("is_active", true)
        .order("name"),
    ]);
    if (freshOrders) setOrders(freshOrders as unknown as LiveOrderRow[]);
    if (freshMerchants) setMerchants(freshMerchants as unknown as MerchantRow[]);
    setLastSync(Date.now());
  }, [supabase]);

  // Realtime — orders (all merchants) + restaurant open/pause toggles
  useEffect(() => {
    const channel = supabase
      .channel("admin-live-ops")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as LiveOrderRow;
          setOrders((prev) =>
            prev.some((o) => o.id === row.id) ? prev : [row, ...prev]
          );
          pushFeed({
            key: `${row.id}-insert-${Date.now()}`,
            at: Date.now(),
            orderId: row.id,
            orderNumber: row.order_number,
            merchantName:
              merchantsRef.current.find((m) => m.id === row.restaurant_id)
                ?.name ?? "—",
            status: row.status,
            totalKobo: row.total_kobo,
            isNew: true,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as LiveOrderRow;
          // payload.old only carries the PK — compare against our own state
          const prevStatus = ordersRef.current.find(
            (o) => o.id === row.id
          )?.status;
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === row.id);
            return exists
              ? prev.map((o) => (o.id === row.id ? { ...o, ...row } : o))
              : [row, ...prev];
          });
          if (prevStatus !== undefined && prevStatus !== row.status) {
            pushFeed({
              key: `${row.id}-${row.status}-${Date.now()}`,
              at: Date.now(),
              orderId: row.id,
              orderNumber: row.order_number,
              merchantName:
                merchantsRef.current.find((m) => m.id === row.restaurant_id)
                  ?.name ?? "—",
              status: row.status,
              totalKobo: row.total_kobo,
              isNew: false,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "restaurants" },
        (payload) => {
          const row = payload.new as Partial<MerchantRow> & { id: string };
          setMerchants((prev) =>
            prev.map((m) => (m.id === row.id ? { ...m, ...row } : m))
          );
        }
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      channel.unsubscribe();
    };
  }, [supabase, pushFeed]);

  // Re-sync after a connection drop + every 2 minutes as a safety net
  useEffect(() => {
    if (!connection) return;
    return connection.onReconnect(refetchSnapshot);
  }, [connection, refetchSnapshot]);

  useEffect(() => {
    const t = setInterval(refetchSnapshot, 120_000);
    return () => clearInterval(t);
  }, [refetchSnapshot]);

  // ──────────────────────────────────────────────────────────────────────────
  // Derived state
  // ──────────────────────────────────────────────────────────────────────────

  const derived = useMemo(() => {
    const dayStart = todayStartMs(now);

    const activeOrders: LiveOrderRow[] = [];
    const byMerchant = new Map<string, LiveOrderRow[]>();
    const statusCounts: Record<string, number> = {};
    for (const s of ACTIVE_STATUSES) statusCounts[s] = 0;

    let ordersToday = 0;
    let gmvToday = 0;
    let deliveredToday = 0;
    let cancelledToday = 0;
    let lateCount = 0;
    let staleCount = 0;

    for (const o of orders) {
      const createdMs = new Date(o.created_at).getTime();
      const isToday = createdMs >= dayStart;

      if (isToday && o.status !== "cancelled") {
        ordersToday += 1;
        if (o.payment_status === "paid") gmvToday += o.total_kobo ?? 0;
      }
      if (isToday && o.status === "delivered") deliveredToday += 1;
      if (isToday && o.status === "cancelled") cancelledToday += 1;

      if (ACTIVE_SET.has(o.status)) {
        activeOrders.push(o);
        statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
        if (minutesLate(o, now) > 0) lateCount += 1;
        if (
          o.status === "pending" &&
          minutesSince(o.created_at, now) >= STALE_PENDING_MINUTES
        )
          staleCount += 1;

        const list = byMerchant.get(o.restaurant_id) ?? [];
        list.push(o);
        byMerchant.set(o.restaurant_id, list);
      }
    }

    // Oldest first within a merchant — the queue an operator works through
    for (const list of byMerchant.values()) {
      list.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    // Today aggregates per merchant
    const todayByMerchant = new Map<
      string,
      { count: number; gmvKobo: number }
    >();
    for (const o of orders) {
      if (new Date(o.created_at).getTime() < dayStart) continue;
      if (o.status === "cancelled") continue;
      const agg = todayByMerchant.get(o.restaurant_id) ?? {
        count: 0,
        gmvKobo: 0,
      };
      agg.count += 1;
      if (o.payment_status === "paid") agg.gmvKobo += o.total_kobo ?? 0;
      todayByMerchant.set(o.restaurant_id, agg);
    }

    return {
      activeOrders,
      byMerchant,
      todayByMerchant,
      statusCounts,
      ordersToday,
      gmvToday,
      deliveredToday,
      cancelledToday,
      lateCount,
      staleCount,
    };
  }, [orders, now]);

  const merchantBoard = useMemo(() => {
    const q = search.trim().toLowerCase();

    const enriched = merchants
      .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
      .map((m) => {
        const withinHours = isWithinOpeningHours(m.opening_hours, now);
        const isOpen = m.accepts_orders && withinHours;
        const isPaused = !m.accepts_orders && withinHours;
        const active = derived.byMerchant.get(m.id) ?? [];
        const today = derived.todayByMerchant.get(m.id) ?? {
          count: 0,
          gmvKobo: 0,
        };
        const late = active.filter((o) => minutesLate(o, now) > 0).length;
        return { m, isOpen, isPaused, active, today, late };
      });

    const open = enriched
      .filter((e) => e.isOpen)
      .sort(
        (a, b) =>
          b.active.length - a.active.length ||
          b.today.count - a.today.count ||
          a.m.name.localeCompare(b.m.name)
      );
    const closed = enriched
      .filter((e) => !e.isOpen)
      .sort(
        (a, b) =>
          b.active.length - a.active.length ||
          Number(b.isPaused) - Number(a.isPaused) ||
          a.m.name.localeCompare(b.m.name)
      );

    return { open, closed };
  }, [merchants, derived, search, now]);

  const openCount = merchantBoard.open.length;
  const totalActiveMerchants = merchants.length;

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-black-900">
              Live Operations
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                live
                  ? "bg-viridian-100 text-emerald-700"
                  : "bg-gold-100 text-gold-600"
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
            Every merchant and every order on Kitchyn, right now
            {mounted && (
              <span className="text-black-400">
                {" "}
                · synced {formatAge(new Date(lastSync).toISOString(), now)} ago
              </span>
            )}
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merchants…"
            className="w-56 rounded-xl border border-black-200 bg-white pl-9 pr-3 py-2 text-sm text-black-900 placeholder:text-black-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Kpi
          label="Active Orders"
          value={derived.activeOrders.length.toLocaleString()}
          icon={<Zap className="h-4 w-4" />}
          tone="purple"
        />
        <Kpi
          label="Late Orders"
          value={derived.lateCount.toLocaleString()}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={derived.lateCount > 0 ? "red" : undefined}
          href="/admin/late-orders"
          sub={derived.lateCount > 0 ? "past ETA — review" : "all on time"}
        />
        <Kpi
          label="Unconfirmed"
          value={derived.staleCount.toLocaleString()}
          icon={<Clock className="h-4 w-4" />}
          tone={derived.staleCount > 0 ? "amber" : undefined}
          sub={`pending > ${STALE_PENDING_MINUTES}m`}
        />
        <Kpi
          label="Open Merchants"
          value={`${openCount}/${totalActiveMerchants}`}
          icon={<Store className="h-4 w-4" />}
        />
        <Kpi
          label="Orders Today"
          value={derived.ordersToday.toLocaleString()}
          icon={<ShoppingBag className="h-4 w-4" />}
          sub={`${derived.deliveredToday} delivered · ${derived.cancelledToday} cancelled`}
        />
        <Kpi
          label="GMV Today"
          value={formatKobo(derived.gmvToday)}
          icon={<Flame className="h-4 w-4" />}
          sub="paid orders"
        />
        <Kpi
          label="Riders Online"
          value={ridersOnline.toLocaleString()}
          icon={<Bike className="h-4 w-4" />}
          href="/admin/riders"
        />
        <Kpi
          label="Settlements"
          value={pendingSettlements.toLocaleString()}
          icon={<Wallet className="h-4 w-4" />}
          tone={pendingSettlements > 0 ? "purple" : undefined}
          href="/admin/settlements"
          sub="pending + processing"
        />
      </div>

      {/* Pipeline */}
      <div className="bg-white rounded-2xl border border-black-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
            Order Pipeline
          </p>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter(null)}
              className="text-xs font-semibold text-purple-600 hover:text-purple-700"
            >
              Clear filter ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ACTIVE_STATUSES.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-black-200">→</span>}
              <button
                onClick={() =>
                  setStatusFilter((cur) => (cur === s ? null : s))
                }
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                  statusFilter === s
                    ? "border-purple-500 bg-purple-50"
                    : "border-black-200 bg-white hover:bg-black-50"
                )}
              >
                <span
                  className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])}
                />
                <span className="text-sm font-bold text-black-900">
                  {derived.statusCounts[s] ?? 0}
                </span>
                <span className="text-xs text-black-500">
                  {STATUS_LABELS[s]}
                </span>
              </button>
            </span>
          ))}
          <span className="mx-1 hidden md:block h-6 w-px bg-black-200" />
          <span className="flex items-center gap-1.5 rounded-xl px-3 py-2 bg-viridian-100">
            <span className="text-sm font-bold text-emerald-700">
              {derived.deliveredToday}
            </span>
            <span className="text-xs text-emerald-700">delivered today</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-xl px-3 py-2 bg-cinnabar-100">
            <span className="text-sm font-bold text-cinnabar-500">
              {derived.cancelledToday}
            </span>
            <span className="text-xs text-cinnabar-500">cancelled today</span>
          </span>
        </div>
      </div>

      {/* Board + feed */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Merchant board */}
        <div className="xl:col-span-2 space-y-4">
          <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
            Open Merchants ({openCount})
          </p>

          {merchantBoard.open.length === 0 && (
            <div className="bg-white rounded-2xl border border-black-200 p-8 text-center text-sm text-black-500">
              No merchants are open right now.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {merchantBoard.open.map(({ m, active, today, late, isPaused }) => (
              <MerchantCard
                key={m.id}
                merchant={m}
                active={active}
                today={today}
                late={late}
                state={isPaused ? "paused" : "open"}
                now={now}
                statusFilter={statusFilter}
              />
            ))}
          </div>

          {/* Closed / paused merchants */}
          {merchantBoard.closed.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowClosed((v) => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-black-500 uppercase tracking-widest hover:text-black-900"
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showClosed && "rotate-180"
                  )}
                />
                Closed or Paused ({merchantBoard.closed.length})
              </button>

              {showClosed && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                  {merchantBoard.closed.map(
                    ({ m, active, today, late, isPaused }) => (
                      <MerchantCard
                        key={m.id}
                        merchant={m}
                        active={active}
                        today={today}
                        late={late}
                        state={isPaused ? "paused" : "closed"}
                        now={now}
                        statusFilter={statusFilter}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live feed */}
        <div className="space-y-3 xl:sticky xl:top-4">
          <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
            Live Activity
          </p>
          <div className="bg-white rounded-2xl border border-black-200 divide-y divide-black-100 max-h-[70vh] overflow-y-auto">
            {feed.length === 0 && (
              <p className="p-6 text-center text-sm text-black-500">
                Waiting for activity…
              </p>
            )}
            {feed.map((ev) => (
              <div key={ev.key} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    STATUS_DOT[ev.status] ?? "bg-black-400"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-black-900 truncate">
                    <span className="font-bold">#{ev.orderNumber}</span>
                    {ev.isNew ? (
                      <>
                        {" "}
                        <span className="font-semibold text-purple-600">
                          new order
                        </span>{" "}
                        · {formatKobo(ev.totalKobo)}
                      </>
                    ) : (
                      <>
                        {" "}
                        →{" "}
                        <span
                          className={cn(
                            "font-semibold",
                            ev.status === "cancelled"
                              ? "text-cinnabar-500"
                              : ev.status === "delivered"
                                ? "text-emerald-700"
                                : "text-black-900"
                          )}
                        >
                          {STATUS_LABELS[ev.status] ?? ev.status}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-black-500 truncate">
                    {ev.merchantName}
                    {mounted && (
                      <span className="text-black-400">
                        {" "}
                        · {formatAge(new Date(ev.at).toISOString(), now)} ago
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
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
  sub,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "purple" | "red" | "amber";
  href?: string;
}) {
  const valueColor =
    tone === "purple"
      ? "text-purple-600"
      : tone === "red"
        ? "text-cinnabar-500"
        : tone === "amber"
          ? "text-gold-600"
          : "text-black-900";

  const body = (
    <div
      className={cn(
        "bg-white rounded-2xl border px-3.5 py-3 h-full",
        tone === "red" ? "border-cinnabar-200" : "border-black-200",
        href && "hover:shadow-card transition-shadow"
      )}
    >
      <div className="flex items-center gap-1.5 text-black-400">
        {icon}
        <p className="text-[11px] text-black-500 font-medium truncate">
          {label}
        </p>
      </div>
      <p className={cn("text-xl font-extrabold mt-1", valueColor)}>{value}</p>
      {sub && <p className="text-[11px] text-black-400 mt-0.5 truncate">{sub}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

const MAX_VISIBLE_ORDERS = 6;

function MerchantCard({
  merchant,
  active,
  today,
  late,
  state,
  now,
  statusFilter,
}: {
  merchant: MerchantRow;
  active: LiveOrderRow[];
  today: { count: number; gmvKobo: number };
  late: number;
  state: "open" | "paused" | "closed";
  now: number;
  statusFilter: string | null;
}) {
  const visible = statusFilter
    ? active.filter((o) => o.status === statusFilter)
    : active;

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border flex flex-col",
        late > 0
          ? "border-cinnabar-200"
          : state === "open"
            ? "border-black-200"
            : "border-black-100 opacity-80"
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {merchant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={merchant.logo_url}
            alt={merchant.name}
            className="h-10 w-10 rounded-xl object-cover border border-black-100"
          />
        ) : (
          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-extrabold">
            {merchant.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/merchants/${merchant.id}`}
              className="font-bold text-black-900 truncate hover:text-purple-600"
            >
              {merchant.name}
            </Link>
            {state === "open" && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            {state === "paused" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-600 shrink-0">
                <PauseCircle className="h-3 w-3" /> Paused
              </span>
            )}
            {state === "closed" && (
              <span className="rounded-full bg-black-100 px-2 py-0.5 text-[10px] font-bold uppercase text-black-500 shrink-0">
                Closed
              </span>
            )}
          </div>
          <p className="text-xs text-black-500 truncate">
            {today.count} order{today.count === 1 ? "" : "s"} today ·{" "}
            {formatKobo(today.gmvKobo)}
            {merchant.city ? ` · ${merchant.city}` : ""}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p
            className={cn(
              "text-lg font-extrabold leading-none",
              active.length > 0 ? "text-purple-600" : "text-black-400"
            )}
          >
            {active.length}
          </p>
          <p className="text-[10px] text-black-400 uppercase tracking-wide">
            active
          </p>
        </div>
      </div>

      {state === "paused" && merchant.closure_message && (
        <p className="px-4 pb-2 text-xs text-gold-600 italic truncate">
          “{merchant.closure_message}”
        </p>
      )}

      {/* Orders */}
      {visible.length > 0 ? (
        <div className="border-t border-black-100 divide-y divide-black-100">
          {visible.slice(0, MAX_VISIBLE_ORDERS).map((o) => (
            <OrderRow key={o.id} order={o} now={now} />
          ))}
          {visible.length > MAX_VISIBLE_ORDERS && (
            <Link
              href={`/admin/merchants/${merchant.id}`}
              className="block px-4 py-2.5 text-xs font-semibold text-purple-600 hover:bg-purple-50"
            >
              +{visible.length - MAX_VISIBLE_ORDERS} more active order
              {visible.length - MAX_VISIBLE_ORDERS === 1 ? "" : "s"} →
            </Link>
          )}
        </div>
      ) : (
        <div className="border-t border-black-100 px-4 py-3">
          <p className="text-xs text-black-400">
            {statusFilter
              ? `No ${STATUS_LABELS[statusFilter]?.toLowerCase()} orders`
              : state === "open"
                ? "Quiet — no active orders"
                : "No active orders"}
          </p>
        </div>
      )}
    </div>
  );
}

function OrderRow({ order, now }: { order: LiveOrderRow; now: number }) {
  const late = minutesLate(order, now);
  const stalePending =
    order.status === "pending" &&
    minutesSince(order.created_at, now) >= STALE_PENDING_MINUTES;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        late > 0 && "bg-cinnabar-100/40"
      )}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          STATUS_DOT[order.status] ?? "bg-black-400"
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-black-900">
            #{order.order_number}
          </p>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              STATUS_BADGE[order.status] ?? "bg-black-100 text-black-500"
            )}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          {late > 0 && (
            <span className="text-[10px] font-bold text-cinnabar-500">
              +{late}m LATE
            </span>
          )}
          {stalePending && late === 0 && (
            <span className="text-[10px] font-bold text-gold-600">
              UNCONFIRMED
            </span>
          )}
        </div>
        <p className="text-xs text-black-500 truncate">
          {firstName(order.customer_name)} · {formatKobo(order.total_kobo)}
          {order.payment_status !== "paid" && (
            <span className="text-gold-600 font-semibold"> · unpaid</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 text-black-400">
        {order.fulfillment_type === "delivery" ? (
          <Bike className="h-3.5 w-3.5" />
        ) : (
          <ShoppingBag className="h-3.5 w-3.5" />
        )}
        <span className="text-xs tabular-nums">
          {formatAge(order.created_at, now)}
        </span>
      </div>
    </div>
  );
}
