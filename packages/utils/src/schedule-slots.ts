/**
 * Scheduled-order slot generation & validation — THE single source of truth
 * for "which future slots can a customer book?". The storefront uses it to
 * render the picker, checkout/initialize re-derives the same slots server-side
 * to validate the submitted slot (never trust the client's chosen time), and
 * the dashboard reschedule flow reuses it for the merchant-facing picker —
 * same motivation as opening-hours.ts: shared helpers so surfaces can never
 * disagree.
 *
 * All wall-clock reasoning is in Africa/Lagos (the operating timezone, fixed
 * UTC+1, no DST), while every returned/accepted value is a true UTC instant.
 */
import { isWithinOpeningHours, type OpeningHours } from "./opening-hours";

export type PausedRange = { from: string; to: string };

export type SchedulingSettings = {
  enabled: boolean;
  /** How far ahead customers may book, from "now". */
  booking_horizon_hours: number;
  /** Slot size in minutes (15 / 30 / 60). */
  slot_granularity_minutes: number;
  /** Soft per-slot cap — informational on the dashboard, never blocks booking. */
  capacity_per_slot: number | null;
  /** Merchant "slot approaching" push fires this many minutes before the slot. */
  alert_lead_minutes: number;
  /** Customers may self-cancel until slot − cutoff. */
  self_cancel_cutoff_minutes: number;
  /** Earliest bookable slot is now + this lead (kitchen needs runway). */
  min_lead_minutes: number;
  /** Blackout windows (holidays, private events) — no slots inside these. */
  paused_ranges: PausedRange[];
};

export const SCHEDULING_DEFAULTS: SchedulingSettings = {
  enabled: false,
  booking_horizon_hours: 72,
  slot_granularity_minutes: 30,
  capacity_per_slot: null,
  alert_lead_minutes: 30,
  self_cancel_cutoff_minutes: 60,
  min_lead_minutes: 20,
  paused_ranges: [],
};

/** Merge a raw JSONB blob with defaults so every field is always present. */
export function normalizeSchedulingSettings(
  raw: unknown
): SchedulingSettings {
  const r = (raw ?? {}) as Partial<SchedulingSettings>;
  return {
    enabled: r.enabled === true,
    booking_horizon_hours:
      numOr(r.booking_horizon_hours, SCHEDULING_DEFAULTS.booking_horizon_hours),
    slot_granularity_minutes:
      numOr(r.slot_granularity_minutes, SCHEDULING_DEFAULTS.slot_granularity_minutes),
    capacity_per_slot:
      typeof r.capacity_per_slot === "number" && r.capacity_per_slot > 0
        ? Math.round(r.capacity_per_slot)
        : null,
    alert_lead_minutes:
      numOr(r.alert_lead_minutes, SCHEDULING_DEFAULTS.alert_lead_minutes),
    self_cancel_cutoff_minutes:
      numOr(r.self_cancel_cutoff_minutes, SCHEDULING_DEFAULTS.self_cancel_cutoff_minutes),
    min_lead_minutes:
      numOr(r.min_lead_minutes, SCHEDULING_DEFAULTS.min_lead_minutes),
    paused_ranges: Array.isArray(r.paused_ranges)
      ? r.paused_ranges.filter(
          (p): p is PausedRange =>
            !!p && typeof p.from === "string" && typeof p.to === "string"
        )
      : [],
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * A Date whose LOCAL getters (getDay/getHours/…) read as Africa/Lagos wall
 * clock for the given instant — same trick as nowInLagos(), generalized so
 * isWithinOpeningHours can evaluate any future instant.
 */
function toLagosWallClock(instant: Date): Date {
  return new Date(
    instant.toLocaleString("en-US", { timeZone: "Africa/Lagos" })
  );
}

function isPaused(instantMs: number, ranges: PausedRange[]): boolean {
  for (const r of ranges) {
    const from = Date.parse(r.from);
    const to = Date.parse(r.to);
    if (Number.isFinite(from) && Number.isFinite(to) && instantMs >= from && instantMs < to) {
      return true;
    }
  }
  return false;
}

const MS = 60_000;
/** Africa/Lagos is fixed UTC+1 (WAT) — no DST, so a constant is correct. */
const LAGOS_OFFSET_MIN = 60;

/**
 * All bookable slot start times (true UTC instants, ascending) across the
 * booking horizon: aligned to the slot granularity on the Lagos wall clock,
 * within opening hours, outside paused ranges, and at least min_lead from now.
 */
export function generateScheduleSlots({
  openingHours,
  schedulingSettings,
  now = new Date(),
}: {
  openingHours: OpeningHours | null | undefined;
  schedulingSettings: SchedulingSettings;
  now?: Date;
}): Date[] {
  const s = schedulingSettings;
  const g = s.slot_granularity_minutes;

  const earliestMs = now.getTime() + s.min_lead_minutes * MS;
  const latestMs = now.getTime() + s.booking_horizon_hours * 60 * MS;

  // Align the first candidate to the granularity on the LAGOS wall clock
  // (epoch minutes + fixed offset), so slots read as clean local times.
  const earliestLagosMin = Math.ceil(earliestMs / MS) + LAGOS_OFFSET_MIN;
  const firstLagosMin = Math.ceil(earliestLagosMin / g) * g;
  let candidateMs = (firstLagosMin - LAGOS_OFFSET_MIN) * MS;

  const slots: Date[] = [];
  while (candidateMs <= latestMs) {
    if (
      !isPaused(candidateMs, s.paused_ranges) &&
      isWithinOpeningHours(openingHours, toLagosWallClock(new Date(candidateMs)))
    ) {
      slots.push(new Date(candidateMs));
    }
    candidateMs += g * MS;
  }
  return slots;
}

/**
 * Server-side check that a submitted slot is genuinely bookable. Applies a
 * 5-minute grace on the min-lead so a slot picked moments before submit isn't
 * rejected by the time the request lands — everything else is strict.
 */
export function isValidScheduleSlot({
  openingHours,
  schedulingSettings,
  scheduledFor,
  now = new Date(),
}: {
  openingHours: OpeningHours | null | undefined;
  schedulingSettings: SchedulingSettings;
  scheduledFor: Date;
  now?: Date;
}): boolean {
  const s = schedulingSettings;
  const t = scheduledFor.getTime();
  if (!Number.isFinite(t)) return false;

  // Aligned to the granularity on the Lagos wall clock, on a whole minute.
  if (t % MS !== 0) return false;
  const lagosMin = t / MS + LAGOS_OFFSET_MIN;
  if (lagosMin % s.slot_granularity_minutes !== 0) return false;

  const leadGraceMs = 5 * MS;
  if (t < now.getTime() + s.min_lead_minutes * MS - leadGraceMs) return false;
  if (t <= now.getTime()) return false;
  if (t > now.getTime() + s.booking_horizon_hours * 60 * MS) return false;

  if (isPaused(t, s.paused_ranges)) return false;
  return isWithinOpeningHours(openingHours, toLagosWallClock(scheduledFor));
}

/** Whether the customer may still self-cancel this scheduled order. */
export function canSelfCancelScheduledOrder(
  scheduledFor: Date,
  schedulingSettings: Pick<SchedulingSettings, "self_cancel_cutoff_minutes">,
  now: Date = new Date()
): boolean {
  return (
    now.getTime() <
    scheduledFor.getTime() - schedulingSettings.self_cancel_cutoff_minutes * MS
  );
}

// ── Display helpers (Africa/Lagos) ──────────────────────────────────────────
// Shared so the storefront picker, dashboard cards, SMS copy and tracking page
// all print the exact same slot strings.

/** "6:30 PM" in Africa/Lagos. */
export function formatLagosTime(d: Date): string {
  return d.toLocaleTimeString("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "2026-07-03" in Africa/Lagos — stable key for grouping slots by day. */
export function lagosDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

/** "Today" / "Tomorrow" / "Thu, Jul 3" in Africa/Lagos. */
export function formatLagosDayLabel(d: Date, now: Date = new Date()): string {
  const key = lagosDateKey(d);
  if (key === lagosDateKey(now)) return "Today";
  if (key === lagosDateKey(new Date(now.getTime() + 24 * 60 * MS))) return "Tomorrow";
  return d.toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Today, 6:30 PM" / "Thu, Jul 3, 6:30 PM" — the canonical slot label. */
export function formatLagosSlotLabel(d: Date, now: Date = new Date()): string {
  return `${formatLagosDayLabel(d, now)}, ${formatLagosTime(d)}`;
}

/**
 * "12:30 PM–1:00 PM" — a slot shown as the arrival WINDOW it actually is
 * (start → start + granularity) rather than a single instant. Kitchens can't
 * promise to-the-minute precision, so this is the honest framing; slots are
 * contiguous (this window's end is the next slot's start) since they're
 * generated every `granularityMinutes` apart.
 */
export function formatLagosTimeRange(start: Date, granularityMinutes: number): string {
  const end = new Date(start.getTime() + granularityMinutes * MS);
  return `${formatLagosTime(start)}–${formatLagosTime(end)}`;
}

/** "Today, 12:30 PM–1:00 PM" — the range version of formatLagosSlotLabel. */
export function formatLagosSlotRangeLabel(
  start: Date,
  granularityMinutes: number,
  now: Date = new Date()
): string {
  return `${formatLagosDayLabel(start, now)}, ${formatLagosTimeRange(start, granularityMinutes)}`;
}
