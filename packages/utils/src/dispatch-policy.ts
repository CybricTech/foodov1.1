/**
 * Dispatch policy — who rides, and when we go looking for them.
 *
 * Two independent axes, and keeping them apart is the whole design:
 *
 *   dispatch_policy (per merchant)      WHO rides   platform | in_house | hybrid
 *   bolt_booking_enabled (platform)     HOW we ask  Bolt API | Telegram note
 *
 * The policy decides when and whether a rider is requested. The transport mode
 * decides only whether that request leaves as an API booking or as a note for a
 * human to book by hand. A platform merchant behaves identically under both,
 * which is what makes the transport switch safe to flip mid-service.
 *
 * Everything here is pure. It is the highest-consequence logic in the feature —
 * {@link laneForPolicy} decides, on every delivery order, whether Kitchyn or the
 * merchant is charged for the last mile, and a wrong answer is a silent revenue
 * leak rather than an error. Hence `dispatch-policy.test.ts`.
 *
 * ── NOT to be confused with restaurants.logistics_default ──────────────────
 * That column looks like it does this job and does not. It is read only as the
 * last COALESCE arm when settling orders that predate dispatch_type stamping.
 * Never add values to it: anything the settlement CASE doesn't recognise settles
 * as zero delivery commission, silently. See migration 101's header.
 */

/** How a merchant's deliveries are handled. Every merchant is in exactly one. */
export type DispatchPolicy = "platform" | "in_house" | "hybrid";

/** The lane an order actually travels down; `orders.dispatch_type`. */
export type DispatchLane = "platform_rider" | "own_rider" | "third_party";

export const DISPATCH_POLICIES: readonly DispatchPolicy[] = [
  "platform",
  "in_house",
  "hybrid",
] as const;

/**
 * Policy is a NOT NULL column defaulting to 'hybrid', but it arrives here from
 * untyped Supabase rows, legacy callers and the mobile app. Anything
 * unrecognised resolves to 'hybrid' — today's behaviour, and the only value
 * that hands the decision to a human rather than silently committing us to
 * paying for a ride.
 */
export function resolveDispatchPolicy(raw: unknown): DispatchPolicy {
  return DISPATCH_POLICIES.includes(raw as DispatchPolicy)
    ? (raw as DispatchPolicy)
    : "hybrid";
}

/**
 * The lane a policy commits an order to, or `null` when the merchant still has
 * to choose (hybrid).
 *
 * `null` is meaningfully different from a lane: it means "do not stamp
 * dispatch_type yet, do not write the delivery split yet, show the picker".
 */
export function laneForPolicy(policy: DispatchPolicy): DispatchLane | null {
  switch (policy) {
    case "platform":
      return "platform_rider";
    case "in_house":
      return "own_rider";
    case "hybrid":
      return null;
  }
}

/** Does this policy ever have us request a rider on the merchant's behalf? */
export function policyRequestsPlatformRider(policy: DispatchPolicy): boolean {
  return policy === "platform";
}

/** Should the merchant be shown the platform/in-house picker at Ready? */
export function policyShowsDispatchPicker(policy: DispatchPolicy): boolean {
  return policy === "hybrid";
}

/** Platform-wide fallback when neither merchant nor platform sets a lead. */
export const DEFAULT_RIDER_REQUEST_LEAD_MINUTES = 10;

/** Matches the CHECK constraints in migration 101. */
export const MIN_RIDER_REQUEST_LEAD_MINUTES = 0;
export const MAX_RIDER_REQUEST_LEAD_MINUTES = 120;

/**
 * How many minutes before the food is ready to go looking for a rider.
 *
 * Merchant override wins, then the platform default, then 10. Clamped to the
 * same 0–120 range the DB enforces, so a bad row can't produce a due time in
 * the far future (an order that never gets a rider) or the far past.
 */
export function resolveRiderRequestLeadMinutes(
  restaurantLead: number | null | undefined,
  platformLead: number | null | undefined
): number {
  const chosen =
    firstFiniteNumber(restaurantLead) ??
    firstFiniteNumber(platformLead) ??
    DEFAULT_RIDER_REQUEST_LEAD_MINUTES;

  return Math.min(
    MAX_RIDER_REQUEST_LEAD_MINUTES,
    Math.max(MIN_RIDER_REQUEST_LEAD_MINUTES, Math.round(chosen))
  );
}

function firstFiniteNumber(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export interface RiderRequestDueInput {
  policy: DispatchPolicy;
  /** orders.fulfillment_type */
  fulfillmentType: string | null | undefined;
  /** orders.estimated_delivery_at — when the merchant said the food is ready. */
  estimatedReadyAt: Date | string | null | undefined;
  leadMinutes: number;
  /** Injected so tests don't depend on the wall clock. */
  now?: Date;
}

/**
 * When the rider should be requested, or `null` for "never on a timer".
 *
 * `null` is not a failure — in_house, hybrid, pickup and any order whose
 * merchant gave no prep estimate all legitimately have no due time. Those fall
 * back to the Mark Ready trigger, so a rider request is never silently dropped;
 * it just isn't early.
 *
 * If the food is due sooner than the lead (a merchant quoting 5 minutes against
 * a 10-minute lead) the due time is *now*, not a moment in the past — the rider
 * is wanted immediately, and the next cron tick picks it up within a minute.
 */
export function computeRiderRequestDueAt({
  policy,
  fulfillmentType,
  estimatedReadyAt,
  leadMinutes,
  now = new Date(),
}: RiderRequestDueInput): Date | null {
  if (!policyRequestsPlatformRider(policy)) return null;
  if (fulfillmentType !== "delivery") return null;
  if (!estimatedReadyAt) return null;

  const readyAt =
    estimatedReadyAt instanceof Date ? estimatedReadyAt : new Date(estimatedReadyAt);
  if (Number.isNaN(readyAt.getTime())) return null;

  const due = new Date(readyAt.getTime() - leadMinutes * 60_000);
  return due.getTime() < now.getTime() ? now : due;
}

/**
 * Rider-side lifecycle, tracked on orders.dispatch_state independently of
 * orders.status (which tracks the food). A rider can be en route while the food
 * is still in the pan — that separation is the point of the redesign.
 */
export type DispatchState =
  | "not_required"
  | "pending"
  | "requested"
  | "booked"
  | "driver_assigned"
  | "picked_up"
  | "delivered"
  | "failed"
  | "cancelled";

/** States where a ride is live enough that cancelling the order must cancel it. */
const LIVE_DISPATCH_STATES: readonly DispatchState[] = [
  "requested",
  "booked",
  "driver_assigned",
] as const;

export function isDispatchStateLive(state: string | null | undefined): boolean {
  return LIVE_DISPATCH_STATES.includes(state as DispatchState);
}

/**
 * Bolt ride state → our dispatch_state.
 *
 * Bolt's "CLIENT" is the PICKUP point — the restaurant, not the customer. So
 * DRIVING_WITH_CLIENT is the moment the rider has the food and is moving, which
 * is what flips orders.status to in_transit.
 */
export function dispatchStateForBoltState(boltState: string): DispatchState | null {
  switch (boltState) {
    case "PENDING_CREATE":
      return "requested";
    case "SHADOW":
      return "requested";
    case "SEARCHING":
      return "booked";
    case "DRIVER_ON_ROUTE_TO_CLIENT":
    case "ARRIVED_AT_CLIENT":
      return "driver_assigned";
    case "DRIVING_WITH_CLIENT":
      return "picked_up";
    case "COMPLETED":
      return "delivered";
    case "CANCELLED":
    case "CLIENT_CANCELLED":
      return "cancelled";
    case "CLIENT_DID_NOT_SHOW":
    case "NO_DRIVER_FOUND":
    case "PAYMENT_BOOKING_FAILED":
    case "CREATE_FAILED":
      return "failed";
    default:
      return null;
  }
}
