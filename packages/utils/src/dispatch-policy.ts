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

/** Every value the orders.dispatch_state CHECK constraint allows (migration 101). */
export const DISPATCH_STATES: readonly DispatchState[] = [
  "not_required",
  "pending",
  "requested",
  "booked",
  "driver_assigned",
  "picked_up",
  "delivered",
  "failed",
  "cancelled",
] as const;

/**
 * Is a Kitchyn rider actually on the hook for this order?
 *
 * THE definition of "the platform lane owns this delivery", and deliberately
 * the only one. It decides two things that must agree exactly:
 *
 *   - the UI: show the "Kitchyn rider handling" pill instead of a hand-over
 *     button, and stop asking a hybrid merchant who delivers
 *   - the API: refuse a merchant's in_transit / delivered / completed, because
 *     only the admin Riders page may close out a platform ride
 *
 * They used to be written out by hand in each place and they disagreed: the API
 * keyed on dispatch_type alone while the UI also required rider_requested_at.
 * An order carrying dispatch_type = 'platform_rider' with no rider ever
 * requested therefore rendered a button that the API answered 403 to, every
 * time, with no way forward. Hence one exported predicate and no local copies.
 *
 * WHY rider_requested_at AND NOT orders.status
 * --------------------------------------------
 * Before migration 101 this fact was expressed as status = 'assigned_to_rider'.
 * That status is no longer written — the rider moved onto its own track — but
 * 101's backfill stamped rider_requested_at on every order that was sitting in
 * 'assigned_to_rider' or 'in_transit' at the time, so the single latch covers
 * pre-101 rows too. Reading status here would also re-trap the order one step
 * later: a merchant who legitimately hands food to a rider reaches 'in_transit'
 * and would then be locked out of marking it delivered.
 *
 * dispatch_type alone is NOT enough: it is stamped at order creation by a
 * free-delivery promo that declares who rides (see the checkout route), and by
 * the admin test-order tool, in both cases long before anyone asks for a rider.
 */
export interface PlatformLaneOrder {
  /** orders.dispatch_type */
  dispatch_type?: string | null;
  /** orders.rider_requested_at — the outer "a rider has been asked for" latch. */
  rider_requested_at?: string | null;
}

export function isPlatformRiderEngaged(order: PlatformLaneOrder): boolean {
  return order.dispatch_type === "platform_rider" && Boolean(order.rider_requested_at);
}

/**
 * The rider track's forward progression. Index IS the rank — the only ordering
 * that matters is that each state is strictly later than the one before it.
 *
 * 'failed', 'cancelled' and 'not_required' are absent on purpose: they are not
 * points along the journey but ways of leaving it, and each has its own rule in
 * {@link canAdvanceDispatchState}.
 */
const DISPATCH_PROGRESSION: readonly DispatchState[] = [
  "pending",
  "requested",
  "booked",
  "driver_assigned",
  "picked_up",
  "delivered",
] as const;

/**
 * States the rider track never leaves. The delivery is over, one way or the
 * other, and a late webhook must not resurrect it.
 *
 * 'failed' is NOT here, though it was. A failed ride is the one state whose
 * entire purpose is to be recovered from: rebook.ts books another attempt and
 * dispatch-ride.ts falls back to a Telegram note for a human to book by hand.
 * Freezing the order on 'failed' meant a successfully re-booked ride still read
 * "Trouble finding a rider" on every surface for the rest of its life.
 */
const TERMINAL_DISPATCH_STATES: readonly DispatchState[] = [
  "delivered",
  "cancelled",
] as const;

function dispatchRank(state: DispatchState): number {
  return DISPATCH_PROGRESSION.indexOf(state);
}

/**
 * May the rider track move from `current` to `next`?
 *
 * Bolt documents its webhooks as neither ordered nor deduplicated — a COMPLETED
 * can arrive before DRIVING_WITH_CLIENT, and any event can arrive twice — so
 * this has to be monotonic rather than merely "not already finished". The rules,
 * in the order they are applied:
 *
 *   1. a no-op write is not a move
 *   2. nothing leaves 'delivered' or 'cancelled'
 *   3. an off-ramp ('failed' / 'cancelled') is reachable from anywhere still live
 *   4. 'not_required' — "this order never wanted a Kitchyn rider" — is only
 *      reachable before one has been asked for. Past that, a live ride exists
 *      and hiding it would strand a rider nobody is tracking.
 *   5. recovery from 'failed' resumes at 'requested' or later, never back at
 *      'pending' (which would re-arm the T−10 timer on an order already past it)
 *   6. otherwise: strictly forward along the progression, so a late 'booked'
 *      cannot undo a 'picked_up'
 *
 * An unrecognised or absent `current` is treated as "nothing recorded yet" and
 * allowed — a row predating the column must not be frozen by it.
 */
export function canAdvanceDispatchState(
  current: string | null | undefined,
  next: DispatchState
): boolean {
  if (current === next) return false;
  if (!current || !DISPATCH_STATES.includes(current as DispatchState)) return true;

  const from = current as DispatchState;

  if (TERMINAL_DISPATCH_STATES.includes(from)) return false;
  if (next === "failed" || next === "cancelled") return true;

  if (next === "not_required") {
    return from === "pending";
  }

  if (from === "failed") {
    return dispatchRank(next) >= dispatchRank("requested");
  }

  // 'not_required' re-armed: a merchant who switched to the platform policy
  // mid-order legitimately re-enters the progression at any point.
  if (from === "not_required") return true;

  return dispatchRank(next) > dispatchRank(from);
}

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
