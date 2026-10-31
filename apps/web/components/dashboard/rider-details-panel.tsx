"use client";

import { useEffect, useState } from "react";
import { Bike, Clock, ExternalLink, MapPin, Phone, Store, User } from "lucide-react";
import { cn } from "@foodo/ui";
import {
  RIDER_LEG_LABELS,
  dispatchStateShowsRider,
  formatEtaMinutes,
  remainingEtaSeconds,
  type RiderDetails,
} from "@/lib/delivery/rider-details";

/** How often the panel re-asks the server. The server throttles Bolt itself. */
const REFRESH_MS = 60_000;
/** How often the on-screen countdown re-renders between refreshes. */
const TICK_MS = 15_000;

/**
 * Rider name, phone, logistics and ETA for a Kitchyn (Bolt) rider who has
 * accepted an order. Renders nothing until a driver has accepted —
 * orders.dispatch_state (live over Realtime) decides when to start looking,
 * so the board makes no request for orders without a rider.
 *
 * Used on both the owner order queue and the frontline (staff) board.
 */
export function RiderDetailsPanel({
  orderId,
  dispatchState,
  compact = false,
}: {
  orderId: string;
  dispatchState: string | null | undefined;
  compact?: boolean;
}) {
  const enabled = dispatchStateShowsRider(dispatchState);
  const [details, setDetails] = useState<RiderDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setDetails(null);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/dashboard/orders/rider?orderId=${encodeURIComponent(orderId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as RiderDetails;
        if (!cancelled) {
          setDetails(body);
          setFailed(false);
        }
      } catch {
        // Keep the last good reading on screen; only flag when there is none.
        if (!cancelled) setFailed(true);
      }
    }

    load();
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const tick = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      clearInterval(tick);
    };
    // dispatchState is a dependency so a pickup (driver_assigned → picked_up)
    // re-fetches straight away and the ETA switches to the customer leg.
  }, [enabled, orderId, dispatchState]);

  if (!enabled) return null;

  if (!details) {
    return (
      <div className={cn("rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5", compact && "py-2")}>
        <p className="text-[11px] text-purple-600">
          {failed ? "Couldn't load rider details. Retrying…" : "Loading rider details…"}
        </p>
      </div>
    );
  }

  if (!details.hasRider) return null;

  const eta = formatEtaMinutes(remainingEtaSeconds(details.etaSeconds, details.etaAsOf));
  const etaTarget =
    details.leg === "to_customer" ? "to the customer" : details.leg === "to_store" ? "to your store" : null;

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-3 py-2.5 space-y-2">
      {/* Status + ETA */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Bike size={14} className="text-purple-600 flex-shrink-0" />
          <p className="text-xs font-bold text-purple-700 leading-tight">{RIDER_LEG_LABELS[details.leg]}</p>
        </div>
        {details.leg === "at_store" ? (
          <span className="flex-shrink-0 text-[11px] font-semibold text-viridian-700 bg-viridian-50 border border-viridian-100 rounded-full px-2 py-0.5">
            Here now
          </span>
        ) : eta ? (
          <span
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-white border border-purple-200 rounded-full px-2 py-0.5 tabular-nums"
            title={etaTarget ? `Estimated time ${etaTarget}` : undefined}
          >
            <Clock size={11} />
            {eta === "under a minute" ? "< 1 min" : eta} away
          </span>
        ) : null}
      </div>

      {/* Rider identity + call */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <User size={12} className="text-black-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-black-900 truncate">
            {details.riderName ?? "Rider name not shared yet"}
          </span>
          {details.vehicleCategory && details.vehicleCategory !== "other" && (
            <span className="text-[10px] text-black-400 capitalize">· {details.vehicleCategory}</span>
          )}
        </div>
        {details.riderPhone && (
          <a
            href={`tel:${details.riderPhone}`}
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg px-2.5 py-1 transition-colors"
          >
            <Phone size={11} />
            {details.riderPhone}
          </a>
        )}
      </div>

      {/* Logistics */}
      {!compact && (details.pickupAddress || details.dropoffAddress) && (
        <div className="space-y-1">
          {details.pickupAddress && (
            <div className="flex items-start gap-1.5 text-[11px] text-black-500">
              <Store size={11} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">
                <span className="text-black-400">Pickup:</span> {details.pickupAddress}
              </span>
            </div>
          )}
          {details.dropoffAddress && (
            <div className="flex items-start gap-1.5 text-[11px] text-black-500">
              <MapPin size={11} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">
                <span className="text-black-400">Drop-off:</span> {details.dropoffAddress}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-black-400">
        <span>
          {details.pickedUpAt
            ? `Picked up ${formatClock(details.pickedUpAt)}`
            : details.driverAssignedAt
            ? `Accepted ${formatClock(details.driverAssignedAt)}`
            : null}
        </span>
        {details.trackingUrl && (
          <a
            href={details.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-purple-600 hover:text-purple-500"
          >
            Track live <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}
