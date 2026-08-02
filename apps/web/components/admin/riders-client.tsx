"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@foodo/ui";
import {
  Bike,
  MapPin,
  Phone,
  Clock,
  History,
  RefreshCw,
  TriangleAlert,
  Navigation,
  Ban,
  PlayCircle,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { formatKobo } from "@foodo/utils";

interface RestaurantRef {
  name: string;
  location_verified_at?: string | null;
}

interface DeliveryRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_fee_kobo: number | null;
  total_kobo: number;
  created_at: string;
  /** Food state. Independent of the rider's — see dispatch_state. */
  status: string;
  /** Rider state (migration 101): requested → booked → driver_assigned → picked_up. */
  dispatch_state: string | null;
  /** Which trigger asked for this rider: cron:due, ready:platform, dispatch:picker. */
  rider_request_source: string | null;
  bolt_booking_claimed_at: string | null;
  bolt_autobook_stopped_at: string | null;
  restaurants: RestaurantRef | null;
}

interface HistoryRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_fee_kobo: number | null;
  delivery_cost_kobo: number | null;
  delivery_cost_source: string | null;
  delivery_distance_km: number | null;
  total_kobo: number;
  delivered_at: string | null;
  updated_at: string;
  created_at: string;
  restaurants: { name: string } | null;
  delivery_assignments: { assigned_at: string }[] | null;
}

interface RideRow {
  id: string;
  order_id: string;
  attempt: number;
  bolt_ride_id: number | null;
  state: string;
  fare_kobo: number | null;
  estimate_kobo: number | null;
  invoice_url: string | null;
  fare_breakdown: { type: string; amount: number }[] | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_category: string | null;
  eta_seconds: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  location_updated_at: string | null;
  last_error: string | null;
  created_at: string;
  booked_at: string | null;
  driver_assigned_at: string | null;
  picked_up_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  /** Bolt's own hosted live-tracking page. Same link the customer's SMS carries. */
  tracking_url: string | null;
}

interface BoltStatus {
  enabled: boolean;
  shadow: boolean;
  environment: string;
}

/* ------------------------------------------------------------------ */
/*  Ride state presentation                                            */
/* ------------------------------------------------------------------ */

const FAILED_STATES = new Set([
  "CANCELLED",
  "CLIENT_CANCELLED",
  "CLIENT_DID_NOT_SHOW",
  "NO_DRIVER_FOUND",
  "PAYMENT_BOOKING_FAILED",
  "CREATE_FAILED",
]);

/** Order statuses meaning the job is over, however it ended. */
const CLOSED_ORDER_STATUSES = new Set(["delivered", "completed", "cancelled"]);

/**
 * The FOOD's progress, shown next to the rider's. Since migration 101 these two
 * run independently: an order can read "Preparing" while its rider is already
 * heading to the store, which is the point of requesting one early.
 */
const FOOD_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Food ready",
  assigned_to_rider: "Awaiting rider",
  in_transit: "On the way",
};

/** Rider progress on the MANUAL lane, where there is no bolt_rides row to read. */
const DISPATCH_STATE_LABELS: Record<string, string> = {
  pending: "Rider not yet requested",
  requested: "Rider requested",
  booked: "Finding a rider",
  driver_assigned: "Rider heading to pickup",
  picked_up: "On the way to customer",
  delivered: "Delivered",
  failed: "Needs attention",
  cancelled: "Cancelled",
};

const STATE_LABELS: Record<string, string> = {
  PENDING_CREATE: "Booking…",
  CREATE_FAILED: "Booking failed",
  SHADOW: "Estimate only",
  SEARCHING: "Finding a rider",
  DRIVER_ON_ROUTE_TO_CLIENT: "Rider heading to pickup",
  ARRIVED_AT_CLIENT: "Rider at pickup",
  DRIVING_WITH_CLIENT: "On the way to customer",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  CLIENT_CANCELLED: "Cancelled by us",
  CLIENT_DID_NOT_SHOW: "Nobody at pickup",
  NO_DRIVER_FOUND: "No rider found",
  PAYMENT_BOOKING_FAILED: "Payment failed",
};

function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

function stateClasses(state: string): string {
  if (FAILED_STATES.has(state)) return "bg-cinnabar-50 text-cinnabar-700";
  if (state === "COMPLETED") return "bg-viridian-50 text-viridian-700";
  if (state === "DRIVING_WITH_CLIENT") return "bg-viridian-50 text-viridian-700";
  if (state === "SEARCHING" || state === "PENDING_CREATE") return "bg-dixie-50 text-dixie-700";
  if (state === "SHADOW") return "bg-black-100 text-black-600";
  return "bg-purple-50 text-purple-700";
}

/** Rides that can still be cancelled — Bolt refuses once the food is aboard. */
function isCancellable(state: string): boolean {
  return ["SEARCHING", "DRIVER_ON_ROUTE_TO_CLIENT", "ARRIVED_AT_CLIENT"].includes(state);
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const m = Math.round(seconds / 60);
  return m <= 1 ? "under a minute" : `${m} min`;
}

export function RidersClient({
  initialDeliveries,
  initialHistory,
  initialRides,
  boltStatus,
}: {
  initialDeliveries: DeliveryRow[];
  initialHistory: HistoryRow[];
  initialRides: RideRow[];
  boltStatus: BoltStatus;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [history, setHistory] = useState(initialHistory);
  const [rides, setRides] = useState(initialRides);
  const [delivering, setDelivering] = useState<string | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [markingOrder, setMarkingOrder] = useState<DeliveryRow | null>(null);
  const [costInput, setCostInput] = useState("");
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<string, { lat: number; lng: number } | "error">>({});

  useEffect(() => {
    setDeliveries(initialDeliveries);
    setHistory(initialHistory);
    setRides(initialRides);
  }, [initialDeliveries, initialHistory, initialRides]);

  // Auto-refresh server data every 10s. Pauses while the mark-delivered
  // modal is open so we don't yank state out from under the user.
  useEffect(() => {
    if (markingOrder) return;
    const id = setInterval(() => {
      startRefresh(() => router.refresh());
    }, 10_000);
    return () => clearInterval(id);
  }, [router, markingOrder]);

  // Real-time: orders finishing (so they leave the active list), plus ride
  // state changes arriving from the Bolt webhook.
  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel("admin-rider-deliveries")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new as { id: string; status: string };
          // Since migration 101 an order awaiting a rider can sit in several
          // statuses (the food carries on cooking while the rider is found), so
          // drop it from the active list only once it is genuinely over.
          if (CLOSED_ORDER_STATUSES.has(updated.status)) {
            setDeliveries((prev) => prev.filter((d) => d.id !== updated.id));
          }
          startRefresh(() => router.refresh());
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bolt_rides" },
        () => {
          // Ride rows carry driver details and state; pulling through the
          // server keeps one source of truth rather than patching locally.
          startRefresh(() => router.refresh());
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [router]);

  const ridesByOrder = useMemo(() => {
    const map = new Map<string, RideRow[]>();
    for (const r of rides) {
      const list = map.get(r.order_id) ?? [];
      list.push(r);
      map.set(r.order_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.attempt - b.attempt);
    return map;
  }, [rides]);

  const latestRide = (orderId: string): RideRow | null => {
    const list = ridesByOrder.get(orderId);
    return list && list.length > 0 ? list[list.length - 1] : null;
  };

  /**
   * Why an order can't proceed on its own, or null when it's fine. Drives the
   * needs-attention split — an order nobody has to touch shouldn't compete for
   * attention with one that's stuck.
   */
  function attentionReason(d: DeliveryRow): string | null {
    const ride = latestRide(d.id);
    if (ride && FAILED_STATES.has(ride.state)) {
      return ride.last_error ?? stateLabel(ride.state);
    }
    if (!boltStatus.enabled) return null; // Manual lane; nothing is wrong.
    if (!d.restaurants?.location_verified_at) {
      return "Store address is not confirmed — riders can't be sent automatically";
    }
    if (!ride) return "No ride booked yet";
    return null;
  }

  const { attention, live } = useMemo(() => {
    const a: DeliveryRow[] = [];
    const l: DeliveryRow[] = [];
    for (const d of deliveries) (attentionReason(d) ? a : l).push(d);
    return { attention: a, live: l };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, ridesByOrder, boltStatus.enabled]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  async function post(url: string, body: unknown, orderId: string) {
    setBusyOrder(orderId);
    setDeliverError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeliverError((data as { error?: string }).error ?? "Action failed");
      } else {
        startRefresh(() => router.refresh());
      }
    } catch {
      setDeliverError("Network error");
    }
    setBusyOrder(null);
  }

  const bookRide = (orderId: string) =>
    post("/api/admin/bolt/rides/book", { order_id: orderId }, orderId);

  const cancelRide = (rideId: string, orderId: string) =>
    post("/api/admin/bolt/rides/cancel", { ride_id: rideId }, orderId);

  const setAutobook = (orderId: string, stopped: boolean) =>
    post("/api/admin/bolt/rides/autobook", { order_id: orderId, stopped }, orderId);

  async function locateDriver(rideId: string) {
    setLocations((p) => ({ ...p, [rideId]: p[rideId] ?? "error" }));
    try {
      const res = await fetch(`/api/admin/bolt/rides/${rideId}/location`);
      const data = await res.json();
      if (res.ok && data.lat !== null && data.lng !== null) {
        setLocations((p) => ({ ...p, [rideId]: { lat: data.lat, lng: data.lng } }));
      } else {
        setLocations((p) => ({ ...p, [rideId]: "error" }));
      }
    } catch {
      setLocations((p) => ({ ...p, [rideId]: "error" }));
    }
  }

  function openMarkDelivered(delivery: DeliveryRow) {
    setMarkingOrder(delivery);
    setCostInput("");
    setDeliverError(null);
  }

  function closeMarkDelivered() {
    if (delivering) return;
    setMarkingOrder(null);
    setCostInput("");
  }

  function parseCostKobo(input: string): number | null {
    const trimmed = input.trim().replace(/,/g, "");
    if (!trimmed) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const naira = Number(trimmed);
    if (!Number.isFinite(naira) || naira < 0) return null;
    return Math.round(naira * 100);
  }

  async function confirmMarkDelivered() {
    if (!markingOrder) return;
    const kobo = parseCostKobo(costInput);
    if (kobo === null) {
      setDeliverError("Enter a valid amount in ₦");
      return;
    }
    setDelivering(markingOrder.id);
    setDeliverError(null);
    const res = await fetch("/api/admin/orders/mark-delivered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: markingOrder.id, delivery_cost_kobo: kobo }),
    });
    if (res.ok) {
      const orderId = markingOrder.id;
      setDeliveries((prev) => prev.filter((d) => d.id !== orderId));
      setMarkingOrder(null);
      setCostInput("");
      startRefresh(() => router.refresh());
    } else {
      const data = await res.json().catch(() => ({}));
      setDeliverError((data as { error?: string }).error ?? "Failed to mark delivered");
    }
    setDelivering(null);
  }

  const totals = history.reduce(
    (acc, h) => {
      const fee = h.delivery_fee_kobo ?? 0;
      const cost = h.delivery_cost_kobo ?? 0;
      acc.fee += fee;
      acc.cost += cost;
      acc.pl += fee - cost;
      return acc;
    },
    { fee: 0, cost: 0, pl: 0 }
  );

  /* ── Ride card ───────────────────────────────────────────────────────── */

  function RideCard({ d, flagged }: { d: DeliveryRow; flagged: string | null }) {
    const ride = latestRide(d.id);
    const attempts = ridesByOrder.get(d.id) ?? [];
    const busy = busyOrder === d.id;
    const isOpen = expanded === d.id;
    const eta = formatEta(ride?.eta_seconds ?? null);
    const loc = ride ? locations[ride.id] : undefined;

    return (
      <div
        className={cn(
          "bg-white rounded-2xl border p-4 flex flex-col gap-3",
          flagged ? "border-cinnabar-200" : "border-black-200"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-black-900 text-sm">#{d.order_number}</p>
            <p className="text-xs text-black-500 mt-0.5 truncate">
              {d.restaurants?.name ?? "Unknown restaurant"}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-bold text-black-900">{formatKobo(d.total_kobo)}</p>
            <p className="text-[11px] text-black-400 mt-0.5 flex items-center gap-1 justify-end">
              <Clock size={10} />
              {formatTimeAgo(d.created_at)}
            </p>
          </div>
        </div>

        {/* Food state — runs independently of the rider's since migration 101.
            "Preparing · Rider heading to pickup" is the normal, healthy shape
            of a platform order, not a contradiction. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black-100 text-black-600">
            {FOOD_STATUS_LABELS[d.status] ?? d.status}
          </span>
          {!ride && d.dispatch_state && DISPATCH_STATE_LABELS[d.dispatch_state] && (
            <span className="text-[11px] text-black-400">
              {DISPATCH_STATE_LABELS[d.dispatch_state]}
            </span>
          )}
          {d.rider_request_source === "cron:due" && (
            <span
              className="text-[11px] text-black-400"
              title="Requested automatically before the food was ready"
            >
              auto
            </span>
          )}
        </div>

        {/* Ride state */}
        {ride ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-[11px] font-bold px-2 py-0.5 rounded-full",
                stateClasses(ride.state)
              )}
            >
              {stateLabel(ride.state)}
            </span>
            {attempts.length > 1 && (
              <span className="text-[11px] text-black-400">
                attempt {ride.attempt} of {attempts.length}
              </span>
            )}
            {eta && !FAILED_STATES.has(ride.state) && (
              <span className="text-[11px] text-black-400">ETA {eta}</span>
            )}
            {d.bolt_autobook_stopped_at && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black-100 text-black-600">
                Auto re-book off
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-black-100 text-black-600 self-start">
            {boltStatus.enabled ? "Not booked" : "Manual dispatch"}
          </span>
        )}

        {flagged && (
          <div className="flex items-start gap-1.5 text-xs text-cinnabar-700 bg-cinnabar-50 rounded-xl px-3 py-2">
            <TriangleAlert size={12} className="flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{flagged}</span>
          </div>
        )}

        {/* Driver */}
        {ride?.driver_name && (
          <div className="bg-black-50 rounded-xl px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-black-700">
              {ride.driver_name}
              {ride.vehicle_category ? ` · ${ride.vehicle_category}` : ""}
            </p>
            {ride.driver_phone && (
              <a
                href={`tel:${ride.driver_phone}`}
                className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700"
              >
                <Phone size={11} />
                {ride.driver_phone}
              </a>
            )}
          </div>
        )}

        {/* Customer */}
        <div className="space-y-1.5">
          {d.customer_name && (
            <p className="text-xs text-black-700 font-medium">{d.customer_name}</p>
          )}
          {d.customer_phone && (
            <a
              href={`tel:${d.customer_phone}`}
              className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700"
            >
              <Phone size={11} />
              {d.customer_phone}
            </a>
          )}
          {d.delivery_address && (
            <div className="flex items-start gap-1.5 text-xs text-black-500">
              <MapPin size={11} className="flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">{d.delivery_address}</span>
            </div>
          )}
        </div>

        {/* Attempt timeline — the artifact for a dispute */}
        {attempts.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(isOpen ? null : d.id)}
              className="flex items-center gap-1 text-[11px] text-black-500 hover:text-black-900 cursor-pointer"
            >
              <ChevronDown size={12} className={cn("transition-transform", isOpen && "rotate-180")} />
              {isOpen ? "Hide" : "Show"} ride history ({attempts.length})
            </button>
            {isOpen && (
              <div className="mt-2 space-y-2">
                {attempts.map((a) => (
                  <div key={a.id} className="text-[11px] text-black-500 border-l-2 border-black-100 pl-2">
                    <p className="font-medium text-black-700">
                      Attempt {a.attempt} · {stateLabel(a.state)}
                      {a.bolt_ride_id ? ` · ride ${a.bolt_ride_id}` : ""}
                    </p>
                    {a.driver_name && <p>Driver: {a.driver_name}</p>}
                    {a.booked_at && <p>Booked {formatDateTime(a.booked_at)}</p>}
                    {a.picked_up_at && <p>Picked up {formatDateTime(a.picked_up_at)}</p>}
                    {a.completed_at && <p>Completed {formatDateTime(a.completed_at)}</p>}
                    {a.cancelled_at && <p>Ended {formatDateTime(a.cancelled_at)}</p>}
                    {a.fare_kobo != null && <p>Fare {formatKobo(a.fare_kobo)}</p>}
                    {a.estimate_kobo != null && a.fare_kobo == null && (
                      <p>Estimated {formatKobo(a.estimate_kobo)}</p>
                    )}
                    {a.last_error && <p className="text-cinnabar-600">{a.last_error}</p>}
                    {a.invoice_url && (
                      <a
                        href={a.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
                      >
                        Bolt receipt <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Driver location, on demand */}
        {ride && loc && loc !== "error" && (
          <a
            href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
          >
            Open driver location in Maps <ExternalLink size={9} />
          </a>
        )}
        {ride && loc === "error" && (
          <p className="text-[11px] text-black-400">
            Location unavailable — only active rides report a position.
          </p>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2 pt-1">
          {boltStatus.enabled && (!ride || FAILED_STATES.has(ride.state)) && (
            <button
              onClick={() => bookRide(d.id)}
              disabled={busy}
              className="flex-1 min-w-[7rem] bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {busy ? "Working…" : ride ? "Re-book ride" : "Book ride"}
            </button>
          )}

          {ride && isCancellable(ride.state) && (
            <button
              onClick={() => cancelRide(ride.id, d.id)}
              disabled={busy}
              className="flex-1 min-w-[7rem] border border-cinnabar-200 text-cinnabar-600 hover:bg-cinnabar-50 disabled:opacity-60 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              Cancel ride
            </button>
          )}

          {ride && !FAILED_STATES.has(ride.state) && ride.bolt_ride_id && (
            <button
              onClick={() => locateDriver(ride.id)}
              className="flex items-center justify-center gap-1.5 min-w-[7rem] flex-1 border border-black-200 text-black-600 hover:border-black-400 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <Navigation size={12} />
              Locate driver
            </button>
          )}

          {/* Bolt's own live-tracking page — the exact link the customer's
              "on its way" SMS carries. Not available on the manual lane (no
              ride_id to have one) or before Bolt assigns a driver. */}
          {ride && !FAILED_STATES.has(ride.state) && ride.tracking_url && (
            <a
              href={ride.tracking_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 min-w-[7rem] flex-1 border border-black-200 text-black-600 hover:border-black-400 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              <ExternalLink size={12} />
              Track live
            </a>
          )}

          {boltStatus.enabled && (
            <button
              onClick={() => setAutobook(d.id, !d.bolt_autobook_stopped_at)}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 min-w-[7rem] flex-1 border border-black-200 text-black-600 hover:border-black-400 disabled:opacity-60 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
            >
              {d.bolt_autobook_stopped_at ? (
                <>
                  <PlayCircle size={12} /> Resume auto
                </>
              ) : (
                <>
                  <Ban size={12} /> Stop auto
                </>
              )}
            </button>
          )}

          <button
            onClick={() => openMarkDelivered(d)}
            disabled={delivering === d.id}
            className="flex-1 min-w-[7rem] bg-viridian-500 hover:bg-viridian-400 disabled:opacity-60 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            {delivering === d.id ? "Updating…" : "Mark delivered"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-black-900">Riders</h1>
          <p className="text-sm text-black-500 mt-1">
            Platform delivery operations &middot; {deliveries.length} active{" "}
            {deliveries.length === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
        <button
          onClick={() => startRefresh(() => router.refresh())}
          disabled={isRefreshing}
          className="flex items-center gap-2 text-xs text-black-600 hover:text-black-900 px-3 py-2 rounded-xl border border-black-200 hover:border-black-400 transition-colors disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Booking mode — so nobody wonders why rides aren't appearing */}
      {(!boltStatus.enabled || boltStatus.shadow || boltStatus.environment === "sandbox") && (
        <div className="bg-dixie-50 border border-dixie-200 text-dixie-800 text-xs px-4 py-2.5 rounded-xl flex items-start gap-2">
          <TriangleAlert size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            {!boltStatus.enabled
              ? "Automatic booking is off — rides are booked by hand from the Telegram note and costs entered manually."
              : boltStatus.shadow
                ? "Shadow mode: fares are estimated for comparison but no ride is booked. Rides are still booked by hand."
                : "Bolt is pointed at the sandbox — no real rides are being booked."}
          </span>
        </div>
      )}

      {deliverError && (
        <div className="bg-cinnabar-50 border border-cinnabar-200 text-cinnabar-600 text-sm px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{deliverError}</span>
          <button
            onClick={() => setDeliverError(null)}
            className="text-cinnabar-400 hover:text-cinnabar-600 ml-3 text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Needs attention ───────────────────────────────────────────────── */}
      {attention.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-bold text-black-900">Needs attention</h2>
            <span className="bg-cinnabar-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {attention.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {attention.map((d) => (
              <RideCard key={d.id} d={d} flagged={attentionReason(d)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Live rides ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-bold text-black-900">Live rides</h2>
          {live.length > 0 && (
            <span className="bg-purple-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {live.length}
            </span>
          )}
        </div>

        {live.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black-200 py-10 text-center text-black-400">
            <Bike size={24} strokeWidth={1.5} className="mx-auto mb-2" />
            <p className="text-sm">No active platform deliveries</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {live.map((d) => (
              <RideCard key={d.id} d={d} flagged={null} />
            ))}
          </div>
        )}
      </section>

      {/* ── Rider History ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-black-900">Rider History</h2>
            <span className="bg-black-100 text-black-600 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-black-400">Customer paid: </span>
                <span className="font-bold text-black-900">{formatKobo(totals.fee)}</span>
              </div>
              <div>
                <span className="text-black-400">Rider cost: </span>
                <span className="font-bold text-black-900">{formatKobo(totals.cost)}</span>
              </div>
              <div>
                <span className="text-black-400">Net: </span>
                <span
                  className={cn(
                    "font-bold",
                    totals.pl >= 0 ? "text-viridian-500" : "text-cinnabar-500"
                  )}
                >
                  {totals.pl >= 0 ? "+" : "−"}
                  {formatKobo(Math.abs(totals.pl))}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black-200 overflow-hidden">
          {history.length === 0 ? (
            <div className="py-12 text-center text-black-400">
              <History size={28} strokeWidth={1.5} className="mx-auto mb-2" />
              <p className="text-sm">No completed rides yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-black-50 text-black-500 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Order</th>
                    <th className="text-left px-4 py-3 font-semibold">Restaurant</th>
                    <th className="text-left px-4 py-3 font-semibold">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold">Rider</th>
                    <th className="text-left px-4 py-3 font-semibold">Assigned</th>
                    <th className="text-left px-4 py-3 font-semibold">Delivered</th>
                    <th className="text-left px-4 py-3 font-semibold">Duration</th>
                    <th className="text-right px-4 py-3 font-semibold">Customer paid</th>
                    <th className="text-right px-4 py-3 font-semibold">Rider cost</th>
                    <th className="text-right px-4 py-3 font-semibold">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history]
                    .sort((a, b) => {
                      const aTime = a.delivery_assignments?.[0]?.assigned_at
                        ? new Date(a.delivery_assignments[0].assigned_at).getTime()
                        : 0;
                      const bTime = b.delivery_assignments?.[0]?.assigned_at
                        ? new Date(b.delivery_assignments[0].assigned_at).getTime()
                        : 0;
                      return bTime - aTime;
                    })
                    .map((h) => {
                      const assignedAt = h.delivery_assignments?.[0]?.assigned_at ?? null;
                      // Duration is the gap between status->assigned and
                      // status->delivered. For legacy orders without
                      // delivered_at this isn't reliably known — updated_at gets
                      // touched by other writes (settlement, etc.) so we
                      // explicitly skip rather than show a misleading number.
                      const deliveredAt = h.delivered_at;
                      const durationMs =
                        assignedAt && deliveredAt
                          ? new Date(deliveredAt).getTime() - new Date(assignedAt).getTime()
                          : NaN;
                      const fee = h.delivery_fee_kobo ?? 0;
                      const cost = h.delivery_cost_kobo ?? 0;
                      const pl = fee - cost;
                      const orderRides = ridesByOrder.get(h.id) ?? [];
                      const paid = orderRides.find((r) => r.invoice_url);
                      const driver = [...orderRides].reverse().find((r) => r.driver_name);

                      return (
                        <tr key={h.id} className="border-t border-black-100 hover:bg-black-50/50">
                          <td className="px-4 py-3 font-bold text-black-900">
                            #{h.order_number}
                            {orderRides.length > 1 && (
                              <span className="ml-1.5 text-[10px] font-medium text-dixie-600">
                                {orderRides.length} rides
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-black-700">
                            {h.restaurants?.name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-black-700">
                            <div className="flex flex-col">
                              <span>{h.customer_name ?? "—"}</span>
                              {h.customer_phone && (
                                <a
                                  href={`tel:${h.customer_phone}`}
                                  className="text-[11px] text-purple-600 hover:text-purple-700"
                                >
                                  {h.customer_phone}
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-black-700">
                            <div className="flex flex-col">
                              <span>{driver?.driver_name ?? "—"}</span>
                              {paid?.invoice_url && (
                                <a
                                  href={paid.invoice_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[11px] text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
                                >
                                  Receipt <ExternalLink size={9} />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                            {formatDateTime(assignedAt)}
                          </td>
                          <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                            {deliveredAt ? formatDateTime(deliveredAt) : "—"}
                          </td>
                          <td className="px-4 py-3 text-black-700 whitespace-nowrap">
                            {formatDuration(durationMs)}
                          </td>
                          <td className="px-4 py-3 text-right text-black-900 font-medium">
                            {fee > 0 ? formatKobo(fee) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-black-900 font-medium whitespace-nowrap">
                            {cost > 0 ? formatKobo(cost) : "—"}
                            {cost > 0 && (
                              <span
                                className={cn(
                                  "ml-1.5 text-[10px] font-medium",
                                  h.delivery_cost_source === "bolt"
                                    ? "text-viridian-600"
                                    : "text-black-400"
                                )}
                                title={
                                  h.delivery_cost_source === "bolt"
                                    ? "From the Bolt receipt"
                                    : "Entered by an admin"
                                }
                              >
                                {h.delivery_cost_source === "bolt" ? "auto" : "manual"}
                              </span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-bold whitespace-nowrap",
                              pl > 0
                                ? "text-viridian-500"
                                : pl < 0
                                  ? "text-cinnabar-500"
                                  : "text-black-400"
                            )}
                          >
                            {pl === 0 ? "—" : `${pl > 0 ? "+" : "−"}${formatKobo(Math.abs(pl))}`}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── Mark Delivered Modal ─────────────────────────────────────────── */}
      {markingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black-900/40 px-4"
          onClick={closeMarkDelivered}
        >
          <div
            className="bg-white rounded-2xl border border-black-200 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 space-y-4">
              <div>
                <h2 className="font-bold text-black-900">Mark order as delivered</h2>
                <p className="text-sm text-black-500 mt-1">
                  Order{" "}
                  <span className="text-black-900 font-medium">#{markingOrder.order_number}</span>
                  {markingOrder.restaurants?.name ? (
                    <> &middot; {markingOrder.restaurants.name}</>
                  ) : null}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-black-600 mb-1.5">
                  Delivery cost <span className="text-black-400 font-normal">(paid to rider)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-black-400 text-sm">
                    ₦
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !delivering) confirmMarkDelivered();
                    }}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-black-200 text-sm text-black-900 bg-white focus:outline-none focus:ring-2 focus:ring-viridian-200 focus:border-viridian-400 placeholder:text-black-300"
                  />
                </div>
                <p className="text-xs text-black-400 mt-1.5">
                  Customer paid {formatKobo(markingOrder.total_kobo)} for this order
                </p>
              </div>

              {deliverError && <p className="text-sm text-cinnabar-500">{deliverError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={closeMarkDelivered}
                  disabled={!!delivering}
                  className="flex-1 py-2.5 rounded-xl border border-black-200 text-sm text-black-500 hover:text-black-900 hover:border-black-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmMarkDelivered}
                  disabled={!!delivering || parseCostKobo(costInput) === null}
                  className="flex-1 py-2.5 rounded-xl bg-viridian-500 hover:bg-viridian-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {delivering ? "Updating…" : "Mark Delivered"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
