/**
 * Order queue bucketing — THE single source of truth for which queue bucket
 * an order belongs to, shared by the web dashboard tabs and the mobile
 * frontline kanban so the two surfaces can never disagree (same motivation as
 * opening-hours.ts).
 *
 * Scheduled orders (087): a paid pre-order carries `scheduled_for` and starts
 * with `activated_at = NULL`. It sits in the "scheduled" bucket until the
 * activation cron (or a merchant pull-forward) flips `activated_at`, at which
 * point the SAME row — still status 'confirmed' — falls through to "new".
 * Without this shared predicate, "New" would incorrectly claim not-yet-due
 * scheduled orders on every surface.
 */

export type BucketableOrder = {
  status: string;
  scheduled_for?: string | null;
  activated_at?: string | null;
};

/**
 * Booked ahead and not yet in the live queue. Defensive on status: if the
 * order somehow advanced past acceptance without an explicit activation
 * (e.g. a legacy client's direct status update), it is live by definition
 * and must be treated as such.
 */
export function isPendingScheduledOrder(order: BucketableOrder): boolean {
  return (
    Boolean(order.scheduled_for) &&
    !order.activated_at &&
    (order.status === "pending" || order.status === "confirmed")
  );
}

// ── Web dashboard tabs ──────────────────────────────────────────────────────

export type OrderQueueBucket =
  | "scheduled"
  | "new"
  | "in_progress"
  | "completed"
  | "cancelled";

const IN_PROGRESS_STATUSES = [
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
];

export function getOrderQueueBucket(order: BucketableOrder): OrderQueueBucket {
  if (isPendingScheduledOrder(order)) return "scheduled";
  if (order.status === "pending" || order.status === "confirmed") return "new";
  if (IN_PROGRESS_STATUSES.includes(order.status)) return "in_progress";
  if (order.status === "delivered") return "completed";
  return "cancelled";
}

// ── Mobile frontline kanban columns ─────────────────────────────────────────
// The frontline board splits the web's "in progress" into In Progress
// (preparing) and In Transit (out the door) — same statuses, finer columns.

export type FrontlineColumn =
  | "scheduled"
  | "new"
  | "in_progress"
  | "in_transit"
  | "completed";

export function getFrontlineColumn(
  order: BucketableOrder
): FrontlineColumn | null {
  if (isPendingScheduledOrder(order)) return "scheduled";
  if (order.status === "pending" || order.status === "confirmed") return "new";
  if (order.status === "preparing") return "in_progress";
  if (
    order.status === "ready_for_pickup" ||
    order.status === "assigned_to_rider" ||
    order.status === "in_transit"
  ) {
    return "in_transit";
  }
  if (order.status === "delivered") return "completed";
  return null; // cancelled — not shown on the board
}
