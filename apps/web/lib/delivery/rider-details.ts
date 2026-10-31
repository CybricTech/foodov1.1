/**
 * What the merchant board shows about the Kitchyn (Bolt) rider on an order.
 *
 * Pure helpers shared by the rider-details route and the panel that renders
 * it, kept free of Supabase / Bolt imports so they can be unit tested.
 *
 * Bolt's vocabulary is from the passenger's side: the "client" is the PICKUP
 * point, i.e. the merchant's store, and the "destination" is the customer.
 * So DRIVER_ON_ROUTE_TO_CLIENT means "heading to your store" and
 * DRIVING_WITH_CLIENT means "has the food, heading to the customer" — see
 * dispatchStateForBoltState in @foodo/utils.
 */

/** Ride states where a driver has accepted and the ride is still live. */
export const RIDER_ACTIVE_STATES = [
  "DRIVER_ON_ROUTE_TO_CLIENT",
  "ARRIVED_AT_CLIENT",
  "DRIVING_WITH_CLIENT",
] as const;

export function isRiderActiveState(state: string | null | undefined): boolean {
  return !!state && (RIDER_ACTIVE_STATES as readonly string[]).includes(state);
}

/** orders.dispatch_state values where the merchant board shows the panel. */
export function dispatchStateShowsRider(dispatchState: string | null | undefined): boolean {
  return dispatchState === "driver_assigned" || dispatchState === "picked_up";
}

export type RiderLeg = "to_store" | "at_store" | "to_customer" | "done" | "unknown";

export function riderLegForState(state: string | null | undefined): RiderLeg {
  switch (state) {
    case "DRIVER_ON_ROUTE_TO_CLIENT":
      return "to_store";
    case "ARRIVED_AT_CLIENT":
      return "at_store";
    case "DRIVING_WITH_CLIENT":
      return "to_customer";
    case "COMPLETED":
      return "done";
    default:
      return "unknown";
  }
}

export const RIDER_LEG_LABELS: Record<RiderLeg, string> = {
  to_store: "Rider heading to your store",
  at_store: "Rider has arrived at your store",
  to_customer: "Rider on the way to the customer",
  done: "Delivered",
  unknown: "Rider assigned",
};

/**
 * Seconds the rider still needs, given an ETA Bolt reported at `asOf`.
 *
 * eta_seconds is a snapshot, not a live value: it is only rewritten when the
 * ride is refreshed. Counting down from when it was taken keeps the number
 * honest between refreshes instead of showing "12 min" for twelve minutes.
 * Never negative — an overdue rider is "arriving", not "−3 min".
 */
export function remainingEtaSeconds(
  etaSeconds: number | null | undefined,
  asOf: string | null | undefined,
  now: number = Date.now()
): number | null {
  if (etaSeconds === null || etaSeconds === undefined || !Number.isFinite(etaSeconds)) {
    return null;
  }
  const asOfMs = asOf ? new Date(asOf).getTime() : NaN;
  const elapsed = Number.isFinite(asOfMs) ? Math.max(0, (now - asOfMs) / 1000) : 0;
  return Math.max(0, Math.round(etaSeconds - elapsed));
}

/** "4 min", "under a minute", or null when there is no ETA. */
export function formatEtaMinutes(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return "under a minute";
  return `${Math.round(seconds / 60)} min`;
}

/** The later of two ISO timestamps, either of which may be missing. */
export function latestTimestamp(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? (b as string) : null;
  if (!Number.isFinite(tb)) return a as string;
  return ta >= tb ? (a as string) : (b as string);
}

/** Response body of GET /api/dashboard/orders/rider. */
export interface RiderDetails {
  orderId: string;
  /** False when no Bolt ride with an accepted driver exists for the order. */
  hasRider: boolean;
  rideState: string | null;
  leg: RiderLeg;
  riderName: string | null;
  riderPhone: string | null;
  vehicleCategory: string | null;
  /** Seconds remaining on the current leg as of `etaAsOf`. */
  etaSeconds: number | null;
  etaAsOf: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  driverAssignedAt: string | null;
  pickedUpAt: string | null;
  trackingUrl: string | null;
  attempt: number | null;
}
