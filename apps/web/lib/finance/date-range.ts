// Shared date-range resolution for the /admin/finance pages.
// searchParams contract: period=today|7d|30d|custom (+from=YYYY-MM-DD&to=YYYY-MM-DD
// when period=custom). No param → last 30 days.

export interface FinanceRange {
  /** ISO timestamp, inclusive lower bound for RPC p_from. */
  fromISO: string;
  /** ISO timestamp, inclusive upper bound for RPC p_to. */
  toISO: string;
  /** YYYY-MM-DD bounds — used for CSV export URLs and filenames. */
  fromDate: string;
  toDate: string;
  /** Human label, e.g. "Last 30 days". */
  label: string;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveFinanceRange(searchParams: {
  period?: string;
  from?: string;
  to?: string;
}): FinanceRange {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const period = searchParams.period ?? "30d";

  if (period === "custom") {
    const from = searchParams.from ? new Date(searchParams.from) : null;
    const to = searchParams.to ? new Date(searchParams.to) : null;
    const fromValid = from && !isNaN(from.getTime()) ? from : null;
    const toValid = to && !isNaN(to.getTime()) ? to : null;
    const start = fromValid ?? new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    const end = toValid ?? now;
    end.setHours(23, 59, 59, 999);
    return {
      fromISO: start.toISOString(),
      toISO: end.toISOString(),
      fromDate: toDateString(start),
      toDate: toDateString(end),
      label: `${toDateString(start)} → ${toDateString(end)}`,
    };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let label: string;
  if (period === "today") {
    label = "Today";
  } else if (period === "7d") {
    start.setDate(start.getDate() - 6);
    label = "Last 7 days";
  } else {
    // "30d" and anything unrecognised
    start.setDate(start.getDate() - 29);
    label = "Last 30 days";
  }

  return {
    fromISO: start.toISOString(),
    toISO: endOfToday.toISOString(),
    fromDate: toDateString(start),
    toDate: toDateString(endOfToday),
    label,
  };
}
