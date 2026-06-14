/**
 * Opening-hours evaluation — THE single source of truth for "is this store open
 * right now?". The storefront (customer view) and the merchant dashboard MUST
 * use these helpers so they can never disagree: previously the dashboard showed
 * "Open" off accepts_orders alone while the storefront also enforced the
 * schedule, so a store outside its hours looked open to the merchant and closed
 * to customers.
 *
 * All times are evaluated in Africa/Lagos (the operating timezone), independent
 * of the viewer's device timezone.
 */

export type DayHours = { enabled: boolean; open: string; close: string };
export type OpeningHours = Record<string, DayHours>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}:00${period}` : `${hour}:${String(m).padStart(2, "0")}${period}`;
}

/** Current wall-clock time in the operating timezone (Africa/Lagos). */
export function nowInLagos(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
}

/**
 * Whether the store is within its configured opening hours right now. When no
 * hours are configured the store is considered always-within (the schedule
 * imposes no closure) — matching the storefront, which only schedule-closes
 * when hours exist. This does NOT consider the manual accepts_orders flag.
 */
export function isWithinOpeningHours(
  hours: OpeningHours | null | undefined,
  now: Date = nowInLagos()
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const day = hours[DAY_KEYS[now.getDay()]];
  if (!day || !day.enabled) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  const open = parseTime(day.open);
  const close = parseTime(day.close);

  // Overnight window (e.g. 18:00 → 02:00) wraps past midnight.
  if (close <= open) return current >= open || current < close;
  return current >= open && current < close;
}

/** A human label for when the store next opens, or null if never scheduled. */
export function nextOpenLabel(
  hours: OpeningHours | null | undefined,
  now: Date = nowInLagos()
): string | null {
  if (!hours) return null;
  const todayIdx = now.getDay();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const key = DAY_KEYS[idx];
    const day = hours[key];
    if (!day?.enabled) continue;

    const openMins = parseTime(day.open);
    if (offset === 0) {
      if (openMins > currentMins) return `Opens today at ${formatTime(day.open)}`;
    } else {
      const label = offset === 1 ? "tomorrow" : DAY_LABELS[key];
      return `Opens ${label} at ${formatTime(day.open)}`;
    }
  }
  return null;
}

/**
 * The store's EFFECTIVE open state, exactly as a customer experiences it:
 * manually accepting orders AND within opening hours.
 */
export function isStoreOpenNow(
  acceptsOrders: boolean,
  hours: OpeningHours | null | undefined,
  now: Date = nowInLagos()
): boolean {
  return acceptsOrders && isWithinOpeningHours(hours, now);
}
