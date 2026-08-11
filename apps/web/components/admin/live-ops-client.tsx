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
  Bike,
  ChevronDown,
  PauseCircle,
  Search,
  ShoppingBag,
} from "lucide-react";
import type { LiveOpsClientProps, OpsSummary } from "@/lib/admin/ops-types";
import { NewOrderNotifier } from "./ops/ops-notifier";
import { SystemHealthStrip } from "./ops/ops-system-health";
import { OpsKpiRow } from "./ops/ops-kpi-row";
import { OpsSecondaryRow } from "./ops/ops-secondary-row";
import { OpsSlaStrip } from "./ops/ops-sla-strip";
import { OpsHourlyChart } from "./ops/ops-hourly-chart";
import { OrderDetailDrawer } from "./ops/order-detail-drawer";

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

type FeedFilter = "all" | "new" | "status" | "cancelled";

const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New orders" },
  { key: "status", label: "Status changes" },
  { key: "cancelled", label: "Cancellations" },
];

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

const MAX_VISIBLE_ORDERS = 3;

/**
 * Row cap on the server page's order query — must stay in sync with the
 * `.limit(1000)` in app/admin/(protected)/page.tsx. A snapshot that hits this
 * cap is treated as truncated (and therefore not authoritative about removals).
 */
const SERVER_ORDER_CAP = 1000;

/**
 * All-zero ops_summary stand-in for the SLA strip when the RPC was
 * unavailable at request time (summaryToday === null). Mirrors migration
 * 104's NULL-on-empty semantics: every avg field is null → all four SLA
 * cards render "—" / "no data" instead of faking 0 min / ₦0 / 0%.
 */
const ZERO_SUMMARY: OpsSummary = {
  orders_count: 0,
  gmv_kobo: 0,
  delivered_count: 0,
  cancelled_count: 0,
  avg_prep_minutes: null,
  avg_delivery_minutes: null,
  avg_order_value_kobo: null,
  cancellation_rate: null,
};

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

/**
 * Merge fresh rows into existing state by id — the only way state is ever
 * reconciled in this component (refetch spec §3/§6):
 *  • matching ids take the fresh row's fields (server wins per field)
 *  • brand-new ids PREPEND (they sit at the top of the queue)
 *  • nothing is ever removed (rows outside a fetch window stay)
 */
function mergeById<T extends { id: string }>(prev: T[], fresh: T[]): T[] {
  const byId = new Map(prev.map((item) => [item.id, item]));
  const freshEntries: T[] = [];
  for (const item of fresh) {
    const existing = byId.get(item.id);
    if (existing) byId.set(item.id, { ...existing, ...item });
    else freshEntries.push(item);
  }
  return [...freshEntries, ...byId.values()];
}

/** True when both arrays carry exactly the same id set (order-insensitive). */
function sameIdSet<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((x) => x.id));
  return b.every((x) => ids.has(x.id));
}

/**
 * Reconcile client state against an AUTHORITATIVE server snapshot.
 *
 * Unlike mergeById (which never removes and is correct for the narrow
 * today-only fallback), the server page query returns exactly the set that
 * belongs on the board: "created today OR still active". So a row we hold that
 * the server did NOT return has left the board — it was completed or cancelled
 * on some other surface — and keeping it strands a permanently stale card.
 * That is the "+48791m LATE" ghost: an old active order marked delivered
 * elsewhere never disappeared, because merge-only reconciliation cannot drop.
 *
 * The one row we must NOT drop is a realtime arrival that raced the server
 * render (created after the snapshot was taken). `watermarkMs` is the server's
 * own render timestamp, so anything newer is kept even when absent upstream.
 */
function reconcileById<T extends { id: string; created_at: string }>(
  prev: T[],
  fresh: T[],
  watermarkMs: number
): T[] {
  const freshById = new Map(fresh.map((item) => [item.id, item]));
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const kept: T[] = [];
  for (const item of prev) {
    if (freshById.has(item.id)) continue; // re-emitted below, server wins
    if (new Date(item.created_at).getTime() > watermarkMs) kept.push(item);
  }
  const merged = fresh.map((item) => {
    const existing = prevById.get(item.id);
    return existing ? { ...existing, ...item } : item;
  });
  return [...kept, ...merged];
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function LiveOpsClient({
  initialMerchants,
  initialOrders,
  ridersOnline,
  pendingSettlements,
  initialNowMs,
  summaryToday,
  summaryLastWeek,
  hourlyToday,
  hourlyYesterday,
}: LiveOpsClientProps) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const connection = useConnectionOptional();
  const reportRealtimeStatus = connection?.reportRealtimeStatus;

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
  // Seeded from the server render's timestamp (not `Date.now()` here) so the
  // very first client render matches the SSR HTML exactly — see
  // `initialNowMs` doc in lib/admin/ops-types.ts.
  const [now, setNow] = useState(initialNowMs);
  const [mounted, setMounted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState(initialNowMs);
  const [feedOpen, setFeedOpen] = useState(true);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [newOrderSignal, setNewOrderSignal] = useState<{
    order: LiveOrderRow;
    merchantName: string;
  } | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string;
    order_number: string;
    status: string;
  } | null>(null);

  const merchantsRef = useRef(merchants);
  merchantsRef.current = merchants;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  // When realtime was last healthy — the badge's sync stamp means "realtime
  // last SUBSCRIBED at", not "last full snapshot at" (refetch spec §7.8).
  const lastSubscribedAtRef = useRef(0);
  // Bumping this tears down the channel and builds a fresh one — the retry
  // driver. Supabase's own rejoin gives up on some CHANNEL_ERROR classes
  // (expired token, hard close), which is how the board used to sit silently
  // disconnected while still claiming to be live.
  const [connGeneration, setConnGeneration] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Realtime has never once connected since mount — used so the degraded
  // poller still runs when the very first subscribe fails (previously gated
  // behind lastSubscribedAtRef > 0, which left a cold start with no data path).
  const mountedAtRef = useRef(0);
  if (mountedAtRef.current === 0) mountedAtRef.current = initialNowMs;

  useEffect(() => setMounted(true), []);

  // Tick — keeps ages, lateness and open-hours state fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Exponential backoff, capped at 30 s so a long outage keeps retrying at a
  // steady, server-friendly cadence instead of giving up or hammering.
  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) return; // one retry in flight at a time
    const attempt = retryAttemptRef.current + 1;
    retryAttemptRef.current = attempt;
    setRetryAttempt(attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setConnGeneration((g) => g + 1);
    }, delay);
  }, []);

  // Operator-triggered "Retry now" — cancels the pending backoff and
  // reconnects immediately rather than waiting out the delay.
  const retryNow = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
    setRetryAttempt(0);
    setConnGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const pushFeed = useCallback((ev: FeedEvent) => {
    // Replace-by-orderId + move-to-front (UX doc §10.3): an order appears at
    // most once in the feed — a status transition replaces its entry in place.
    setFeed((prev) =>
      [
        { ...ev, key: `${ev.orderId}-${Date.now()}` },
        ...prev.filter((e) => e.orderId !== ev.orderId),
      ].slice(0, 40)
    );
  }, []);

  // Narrow reconnect fallback — today-only orders (.limit(200)) + the full
  // active-merchant list, merged by id into state (never replaced). Board
  // repairs only — KPI numbers come from the server-side ops_summary props,
  // never from this array (refetch spec §6).
  const refetchFallback = useCallback(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [{ data: freshOrders }, { data: freshMerchants }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, restaurant_id, order_number, status, payment_status, fulfillment_type, dispatch_type, total_kobo, customer_name, customer_phone, delivery_address, special_instructions, created_at, updated_at, estimated_delivery_at, delivered_at, cancelled_reason"
        )
        .gte("created_at", start.toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("restaurants")
        .select(
          "id, name, slug, logo_url, accepts_orders, opening_hours, closure_message, city, estimated_delivery_minutes, is_test"
        )
        .eq("is_active", true)
        .order("name"),
    ]);
    // Exclude test/demo restaurants (and their orders) — same rule as the
    // server page, so the fallback never reintroduces them.
    const all =
      (freshMerchants as unknown as (MerchantRow & { is_test?: boolean })[]) ??
      null;
    const real = all?.filter((m) => !m.is_test) ?? null;
    if (real) setMerchants((prev) => mergeById(prev, real));
    if (freshOrders && real) {
      const realIds = new Set(real.map((m) => m.id));
      setOrders((prev) =>
        mergeById(
          prev,
          (freshOrders as unknown as LiveOrderRow[]).filter((o) =>
            realIds.has(o.restaurant_id)
          )
        )
      );
    } else if (freshOrders) {
      setOrders((prev) =>
        mergeById(prev, freshOrders as unknown as LiveOrderRow[])
      );
    }
  }, [supabase]);

  // Realtime — orders (all merchants) + restaurant open/pause toggles
  useEffect(() => {
    let disposed = false;
    const channel = supabase
      .channel("admin-live-ops")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as LiveOrderRow;
          // Drop events from restaurants not on the board (test/demo
          // merchants, or brand-new ones until the 20 s props-sync backfill
          // picks them up on the next server render).
          if (!merchantsRef.current.some((m) => m.id === row.restaurant_id))
            return;
          const merchantName =
            merchantsRef.current.find((m) => m.id === row.restaurant_id)
              ?.name ?? "—";
          setOrders((prev) =>
            prev.some((o) => o.id === row.id) ? prev : [row, ...prev]
          );
          pushFeed({
            key: `${row.id}-insert-${Date.now()}`,
            at: Date.now(),
            orderId: row.id,
            orderNumber: row.order_number,
            merchantName,
            status: row.status,
            totalKobo: row.total_kobo,
            isNew: true,
          });
          // Bell + browser Notification signal (notifier guards by order id).
          setNewOrderSignal({ order: row, merchantName });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as LiveOrderRow;
          if (!merchantsRef.current.some((m) => m.id === row.restaurant_id))
            return;
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
        if (disposed) return;
        const healthy = status === "SUBSCRIBED";
        setLive(healthy);
        // Publish to the shared provider so the global ConnectionBanner and
        // every onReconnect subscriber (including this page's catch-up) react
        // to a dead socket — not just to browser online/offline events. A
        // WebSocket can die while navigator.onLine stays true, which is the
        // common case and previously went completely unsignalled here.
        reportRealtimeStatus?.(healthy);
        if (healthy) {
          retryAttemptRef.current = 0;
          setRetryAttempt(0);
          lastSubscribedAtRef.current = Date.now();
          setLastSync(Date.now());
          // Repair anything missed while the socket was down. Cheap and
          // merge-by-id, so a redundant call after a brief blip is harmless.
          void refetchFallback();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          scheduleRetry();
        }
      });

    return () => {
      disposed = true;
      // Drop our opinion on realtime health when this board unmounts, or the
      // banner stays stuck "reconnecting" on whatever page comes next.
      reportRealtimeStatus?.(true);
      channel.unsubscribe();
    };
    // scheduleRetry/refetchFallback are stable useCallbacks; connGeneration is
    // the retry driver — each bump rebuilds the channel from scratch.
  }, [
    supabase,
    pushFeed,
    connGeneration,
    reportRealtimeStatus,
    scheduleRetry,
    refetchFallback,
  ]);

  // Re-sync after a connection drop: degraded (> 60 s without a SUBSCRIBED
  // status) ⇒ narrow fallback; otherwise the channel replay already covered
  // the gap, so just refresh the sync stamp (refetch spec §3.1).
  useEffect(() => {
    if (!connection) return;
    return connection.onReconnect(() => {
      if (Date.now() - lastSubscribedAtRef.current > 60_000) {
        void refetchFallback();
      } else {
        setLastSync(Date.now());
      }
    });
  }, [connection, refetchFallback]);

  // Degraded safety net: while realtime is down, keep the board repaired with
  // the narrow fallback every 30 s until the channel recovers. Idempotent and
  // merge-by-id, so overlap is harmless.
  //
  // The reference point is "last healthy moment" = last SUBSCRIBED, or mount
  // if we have never connected at all. Keying off lastSubscribedAt alone left
  // the worst case uncovered: when the very first subscribe fails, it stays 0
  // and the poller never fires, so a board that opened during an outage had no
  // data path whatsoever.
  useEffect(() => {
    const t = setInterval(() => {
      const lastHealthy = lastSubscribedAtRef.current || mountedAtRef.current;
      if (!live && Date.now() - lastHealthy > 60_000) {
        void refetchFallback();
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [live, refetchFallback]);

  // Props-sync reconcile — the layout's 20 s router.refresh() re-fetches page
  // data server-side, and that snapshot is AUTHORITATIVE for what belongs on
  // the board ("created today OR still active"). Reconciling (not merging)
  // against it is what makes the board self-heal: a row the server stopped
  // returning has been completed or cancelled somewhere else, so it is dropped
  // instead of lingering forever as a fake "still preparing, 33d late" card.
  // Rows created after the server's render timestamp are kept — those are
  // realtime arrivals that raced the snapshot, not departures.
  //
  // Skipped when the id set is unchanged — router.refresh fires every 20 s and
  // an unconditional setState would re-render the whole board needlessly.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    setMerchants((prev) =>
      sameIdSet(prev, initialMerchants)
        ? prev
        : mergeById(prev, initialMerchants)
    );
    setOrders((prev) => {
      if (sameIdSet(prev, initialOrders)) return prev;
      // A truncated snapshot is not authoritative about what LEFT the board —
      // absence could just mean "past the cap". Removing then would delete the
      // oldest active orders, which are exactly the ones an operator most needs
      // to see. Degrade to merge-only until the page raises its limit.
      return initialOrders.length >= SERVER_ORDER_CAP
        ? mergeById(prev, initialOrders)
        : reconcileById(prev, initialOrders, initialNowMs);
    });
  }, [initialOrders, initialMerchants, initialNowMs]);

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
      .filter((m) => {
        if (!q) return true;
        if (m.name.toLowerCase().includes(q)) return true;
        // Surface a merchant when any of its tracked orders matches — order
        // number or customer name. Cheap scan over realtime state only.
        const active = derived.byMerchant.get(m.id) ?? [];
        return active.some(
          (o) =>
            o.order_number.toLowerCase().includes(q) ||
            (o.customer_name ?? "").toLowerCase().includes(q)
        );
      })
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

  // Feed filtered by the segmented control (UX doc §6.3): All / New orders
  // (isNew) / Status changes (!isNew) / Cancellations (status === "cancelled").
  const visibleFeed = useMemo(() => {
    if (feedFilter === "all") return feed;
    if (feedFilter === "new") return feed.filter((ev) => ev.isNew);
    if (feedFilter === "status") return feed.filter((ev) => !ev.isNew);
    return feed.filter((ev) => ev.status === "cancelled");
  }, [feed, feedFilter]);

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
              role="status"
              aria-live="polite"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                live
                  ? "bg-viridian-100 text-emerald-700"
                  : "bg-cinnabar-100 text-cinnabar-500"
              )}
            >
              <span className="relative flex h-2 w-2">
                {live && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    live ? "bg-emerald-500" : "bg-cinnabar-500 animate-pulse"
                  )}
                />
              </span>
              {live
                ? "Live"
                : retryAttempt > 0
                  ? `Reconnecting · try ${retryAttempt}`
                  : "Connecting"}
            </span>
            {/* Manual escape hatch — an operator who sees a stale board can
                force a reconnect instead of waiting out the backoff. */}
            {!live && (
              <button
                type="button"
                onClick={retryNow}
                className="rounded-full border border-black-200 px-2.5 py-1 text-[11px] font-bold text-black-500 hover:bg-black-50 min-h-10 md:min-h-0"
              >
                Retry now
              </button>
            )}
          </div>
          <p className="text-black-500 text-sm mt-1">
            Every merchant and every order on Kitchyn, right now
            {/* Declutter (§10.1): the sync stamp's only job is explaining
                staleness — hidden while the stream is healthy. */}
            {!live && (
              <span className="text-cinnabar-500 font-semibold">
                {" "}
                · not live — last synced{" "}
                {formatAge(new Date(lastSync).toISOString(), now)} ago
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NewOrderNotifier newOrderSignal={newOrderSignal} />
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
      </div>

      {/* System health — self-fetching strip */}
      <SystemHealthStrip hourlyYesterday={hourlyYesterday} />

      {/* Primary KPI row — GMV: exact RPC value when available (no truncation),
          realtime-derived otherwise so it never shows ₦0 with paid orders */}
      <OpsKpiRow
        activeOrders={derived.activeOrders.length}
        lateCount={derived.lateCount}
        staleCount={derived.staleCount}
        gmvTodayKobo={summaryToday ? summaryToday.gmv_kobo : derived.gmvToday}
        summaryToday={summaryToday}
        summaryLastWeek={summaryLastWeek}
      />

      {/* Secondary KPI row — RPC counts when available (no truncation),
          realtime snapshot otherwise */}
      <OpsSecondaryRow
        ordersToday={summaryToday?.orders_count ?? derived.ordersToday}
        openCount={openCount}
        totalActiveMerchants={totalActiveMerchants}
        deliveredToday={summaryToday?.delivered_count ?? derived.deliveredToday}
        cancelledToday={summaryToday?.cancelled_count ?? derived.cancelledToday}
        ridersOnline={ridersOnline}
        pendingSettlements={pendingSettlements}
      />

      {/* SLA strip — summaryToday when available; all-null zero summary
          (every card "—") when the RPC didn't resolve */}
      <OpsSlaStrip summary={summaryToday ?? ZERO_SUMMARY} />

      {/* Hourly throughput — collapsed by default */}
      <OpsHourlyChart
        hourlyToday={hourlyToday}
        hourlyYesterday={hourlyYesterday}
      />

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
                onOpenOrder={(o) =>
                  setSelectedOrder({
                    id: o.id,
                    order_number: o.order_number,
                    status: o.status,
                  })
                }
              />
            ))}
          </div>

          {/* Closed / paused merchants — capped at 12, then a single link */}
          {merchantBoard.closed.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
                Closed or Paused ({merchantBoard.closed.length})
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                {merchantBoard.closed
                  .slice(0, 12)
                  .map(({ m, active, today, late, isPaused }) => (
                    <MerchantCard
                      key={m.id}
                      merchant={m}
                      active={active}
                      today={today}
                      late={late}
                      state={isPaused ? "paused" : "closed"}
                      now={now}
                      statusFilter={statusFilter}
                      onOpenOrder={(o) =>
                        setSelectedOrder({
                          id: o.id,
                          order_number: o.order_number,
                          status: o.status,
                        })
                      }
                    />
                  ))}
              </div>

              {merchantBoard.closed.length > 12 && (
                <Link
                  href="/admin/merchants"
                  className="block px-4 py-2.5 text-xs font-semibold text-purple-600 hover:bg-purple-50"
                >
                  +{merchantBoard.closed.length - 12} more closed or paused
                  merchant
                  {merchantBoard.closed.length - 12 === 1 ? "" : "s"} →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Live feed */}
        <div className="space-y-3 xl:sticky xl:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-black-500 uppercase tracking-widest">
              Live Activity
            </p>
            <button
              type="button"
              onClick={() => setFeedOpen((v) => !v)}
              aria-expanded={feedOpen}
              aria-label={
                feedOpen ? "Collapse live activity" : "Expand live activity"
              }
              className="h-10 w-10 rounded-full flex items-center justify-center text-black-500 hover:bg-black-50 transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  feedOpen && "rotate-180"
                )}
              />
            </button>
          </div>

          {feedOpen && (
            <>
              {/* Segmented filter */}
              <div
                className="flex flex-wrap items-center gap-1 rounded-xl border border-black-200 bg-white p-1"
                role="group"
                aria-label="Filter live activity"
              >
                {FEED_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFeedFilter(f.key)}
                    aria-pressed={feedFilter === f.key}
                    className={cn(
                      "rounded-lg min-h-10 px-3 text-xs font-semibold transition-colors",
                      feedFilter === f.key
                        ? "bg-purple-50 text-purple-700"
                        : "text-black-500 hover:bg-black-50"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-black-200 divide-y divide-black-100 max-h-[70vh] overflow-y-auto">
                {visibleFeed.length === 0 && (
                  <p className="p-6 text-center text-sm text-black-500">
                    Waiting for activity…
                  </p>
                )}
                {visibleFeed.map((ev) => (
                  <button
                    key={ev.key}
                    type="button"
                    onClick={() =>
                      setSelectedOrder({
                        id: ev.orderId,
                        order_number: ev.orderNumber,
                        status: ev.status,
                      })
                    }
                    className="w-full text-left cursor-pointer hover:bg-black-50 transition-colors px-4 py-3 flex items-start gap-3"
                  >
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
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Order detail drawer — right slide-over */}
      <OrderDetailDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function MerchantCard({
  merchant,
  active,
  today,
  late,
  state,
  now,
  statusFilter,
  onOpenOrder,
}: {
  merchant: MerchantRow;
  active: LiveOrderRow[];
  today: { count: number; gmvKobo: number };
  late: number;
  state: "open" | "paused" | "closed";
  now: number;
  statusFilter: string | null;
  onOpenOrder: (order: LiveOrderRow) => void;
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
            <OrderRow
              key={o.id}
              order={o}
              now={now}
              onClick={() => onOpenOrder(o)}
            />
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

function OrderRow({
  order,
  now,
  onClick,
}: {
  order: LiveOrderRow;
  now: number;
  onClick: () => void;
}) {
  const late = minutesLate(order, now);
  const stalePending =
    order.status === "pending" &&
    minutesSince(order.created_at, now) >= STALE_PENDING_MINUTES;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 w-full text-left cursor-pointer hover:bg-black-50 transition-colors",
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
    </button>
  );
}