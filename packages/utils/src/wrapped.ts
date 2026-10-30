/**
 * Kitchyn Wrapped — shared story model for the web dashboard and mobile app.
 *
 * merchant_wrapped.stats (see migration 20261030120000_merchant_wrapped.sql) is
 * turned into an ordered list of slides here, so both platforms tell exactly
 * the same story with the same copy. Each platform only decides how a slide
 * LOOKS; which slides appear, in what order, and what they say lives here.
 *
 * Slides whose data is too thin to be worth celebrating are dropped, so a new
 * merchant gets a shorter, still-delightful story rather than "0 reviews".
 */

export type WrappedTopItem = {
  name: string;
  quantity: number;
  revenue_kobo: number;
  image_url: string | null;
};

export type WrappedStats = {
  version: number;
  scope: "all_time" | "month";
  period_key: string;
  period_start: string;
  period_end: string;
  restaurant_name: string | null;
  joined_at: string | null;
  orders: number;
  revenue_kobo: number;
  aov_kobo: number | null;
  delivery_orders: number;
  pickup_orders: number;
  days_active: number;
  top_items: WrappedTopItem[];
  distinct_items: number;
  customers: number;
  new_customers: number;
  repeat_customers: number;
  top_customer: { first_name: string; orders: number; spent_kobo: number } | null;
  weekday_counts: number[] | null; // Mon..Sun
  hour_counts: number[] | null; // 0..23, Lagos time
  best_day: { date: string; orders: number; revenue_kobo: number } | null;
  rating_avg: number | null;
  rating_count: number;
  five_star_count: number;
  top_review: { name: string; comment: string; rating: number } | null;
  first_order: { at: string; order_number: string } | null;
  /** Rounded percentile bucket (1/5/10/25/50) or null; never a rank or count. */
  top_percent: number | null;
  previous: { orders: number; revenue_kobo: number } | null;
};

export type WrappedEdition = {
  period_key: string;
  scope: "all_time" | "month";
  stats: WrappedStats;
};

export type WrappedSlide =
  | { kind: "intro"; restaurantName: string; eyebrow: string; title: string; subtitle: string }
  | { kind: "origin"; joinedLabel: string; daysWithKitchyn: number; firstOrderLabel: string | null; firstOrderNumber: string | null }
  | { kind: "orders"; orders: number; perDay: number | null; caption: string; deltaPct: number | null; deltaLabel: string | null }
  | { kind: "revenue"; revenueKobo: number; aovKobo: number | null; deltaPct: number | null; deltaLabel: string | null }
  | { kind: "topDish"; name: string; quantity: number; imageUrl: string | null; revenueKobo: number }
  | { kind: "topFive"; items: { name: string; quantity: number; pct: number }[] }
  | { kind: "customers"; customers: number; newCustomers: number; repeatCustomers: number }
  | { kind: "fan"; firstName: string; orders: number; spentKobo: number }
  | { kind: "peak"; weekdayCounts: number[]; busiestIndex: number; busiestDay: string; peakHourLabel: string | null }
  | { kind: "bestDay"; dateLabel: string; weekday: string; day: number; month: string; orders: number; revenueKobo: number }
  | { kind: "reviews"; avg: number; count: number; fiveStar: number; quote: { name: string; comment: string } | null }
  | { kind: "rank"; topPercent: number }
  | { kind: "fulfilment"; deliveryPct: number; pickupPct: number; delivery: number; pickup: number }
  | { kind: "summary"; restaurantName: string; periodLabel: string; stats: { label: string; value: string }[]; topDish: string | null; busiestDay: string | null };

export type WrappedSlideKind = WrappedSlide["kind"];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" → "October 2026". */
export function wrappedPeriodLabel(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** "2026-10" → "October". */
export function wrappedMonthName(periodKey: string): string {
  const m = Number(periodKey.split("-")[1] ?? 1);
  return MONTHS[m - 1] ?? "";
}

/** 19 → "7pm", 0 → "midnight", 12 → "noon". */
export function wrappedHourLabel(hour: number): string {
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/** Whole naira with thousands separators, e.g. 161456000 → "₦1,614,560". */
export function wrappedNaira(kobo: number): string {
  return "₦" + Math.round(kobo / 100).toLocaleString("en-NG");
}

/** Compact naira for tight spaces: ₦1.6M, ₦245K, ₦9,500. */
export function wrappedNairaCompact(kobo: number): string {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${trimZero((n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1))}M`;
  if (n >= 100_000) return `₦${Math.round(n / 1000)}K`;
  return wrappedNaira(kobo);
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Lagos-local calendar parts of an ISO date or timestamp. */
function lagosParts(iso: string): { year: number; month: number; day: number; weekday: number } {
  // A bare date ("2026-09-14") is already a Lagos calendar day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00Z`)
    : new Date(new Date(iso).getTime() + 60 * 60 * 1000); // Lagos = UTC+1, no DST
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: (d.getUTCDay() + 6) % 7, // Mon = 0
  };
}

function longDate(iso: string): string {
  const p = lagosParts(iso);
  return `${p.day} ${MONTHS[p.month]} ${p.year}`;
}

function ordersCaption(orders: number, scope: WrappedStats["scope"]): string {
  if (orders >= 5000) return "That's a whole stadium of happy bellies.";
  if (orders >= 1000) return "Four digits. Your kitchen is a certified machine.";
  if (orders >= 250) return "Hundreds of meals, made with love, out the door.";
  if (orders >= 50) return "Every single one of them, someone's favourite moment.";
  return scope === "all_time"
    ? "Every legend starts somewhere. This is yours."
    : "Every order is a customer who chose you.";
}

/**
 * Build the ordered slide list for one edition. Pure and deterministic, so the
 * web and mobile stories match card for card.
 */
export function buildWrappedSlides(stats: WrappedStats): WrappedSlide[] {
  const slides: WrappedSlide[] = [];
  const allTime = stats.scope === "all_time";
  const name = stats.restaurant_name?.trim() || "Your kitchen";
  const monthName = wrappedMonthName(stats.period_key);
  // Month before this edition's (index m-2, wrapping January → December).
  const prevMonth = MONTHS[(Number(stats.period_key.split("-")[1] ?? 1) + 10) % 12];

  slides.push({
    kind: "intro",
    restaurantName: name,
    eyebrow: allTime ? "Your story so far" : `Your ${monthName}`,
    title: "Wrapped",
    subtitle: allTime
      ? "Every order. Every customer. Every win since you joined Kitchyn."
      : `${monthName} was a month. Let's run it back.`,
  });

  // ── Origin story (all-time only) ──────────────────────────────────────
  const startIso = stats.joined_at ?? stats.period_start;
  if (allTime && startIso) {
    const days = Math.max(
      1,
      Math.round((new Date(stats.period_end).getTime() - new Date(startIso).getTime()) / 86_400_000)
    );
    slides.push({
      kind: "origin",
      joinedLabel: longDate(startIso),
      daysWithKitchyn: days,
      firstOrderLabel: stats.first_order ? longDate(stats.first_order.at) : null,
      firstOrderNumber: stats.first_order?.order_number ?? null,
    });
  }

  // ── Orders ────────────────────────────────────────────────────────────
  const spanDays = Math.max(
    1,
    Math.round((new Date(stats.period_end).getTime() - new Date(stats.period_start).getTime()) / 86_400_000)
  );
  const ordersDelta = stats.previous ? pctChange(stats.orders, stats.previous.orders) : null;
  slides.push({
    kind: "orders",
    orders: stats.orders,
    perDay: stats.orders >= spanDays ? Math.round(stats.orders / spanDays) : null,
    caption: ordersCaption(stats.orders, stats.scope),
    deltaPct: ordersDelta,
    deltaLabel: ordersDelta !== null ? `vs ${prevMonth}` : null,
  });

  // ── Revenue ───────────────────────────────────────────────────────────
  if (stats.revenue_kobo > 0) {
    const revDelta = stats.previous ? pctChange(stats.revenue_kobo, stats.previous.revenue_kobo) : null;
    slides.push({
      kind: "revenue",
      revenueKobo: stats.revenue_kobo,
      aovKobo: stats.aov_kobo,
      deltaPct: revDelta,
      deltaLabel: revDelta !== null ? `vs ${prevMonth}` : null,
    });
  }

  // ── Dishes ────────────────────────────────────────────────────────────
  const items = stats.top_items ?? [];
  if (items.length > 0 && items[0].quantity > 0) {
    slides.push({
      kind: "topDish",
      name: items[0].name,
      quantity: items[0].quantity,
      imageUrl: items[0].image_url,
      revenueKobo: items[0].revenue_kobo,
    });
  }
  if (items.length >= 3) {
    const max = items[0].quantity || 1;
    slides.push({
      kind: "topFive",
      items: items.slice(0, 5).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        pct: Math.max(8, Math.round((i.quantity / max) * 100)),
      })),
    });
  }

  // ── People ────────────────────────────────────────────────────────────
  if (stats.customers >= 2) {
    slides.push({
      kind: "customers",
      customers: stats.customers,
      newCustomers: stats.new_customers,
      repeatCustomers: stats.repeat_customers,
    });
  }
  if (stats.top_customer && stats.top_customer.orders >= 2 && stats.top_customer.first_name) {
    slides.push({
      kind: "fan",
      firstName: stats.top_customer.first_name,
      orders: stats.top_customer.orders,
      spentKobo: stats.top_customer.spent_kobo,
    });
  }

  // ── Rhythm ────────────────────────────────────────────────────────────
  const weekdays = stats.weekday_counts ?? [];
  if (stats.orders >= 5 && weekdays.length === 7) {
    const busiestIndex = weekdays.indexOf(Math.max(...weekdays));
    const hours = stats.hour_counts ?? [];
    const peakHour = hours.length === 24 ? hours.indexOf(Math.max(...hours)) : -1;
    slides.push({
      kind: "peak",
      weekdayCounts: weekdays,
      busiestIndex,
      busiestDay: WEEKDAYS[busiestIndex],
      peakHourLabel: peakHour >= 0 && hours[peakHour] > 0 ? wrappedHourLabel(peakHour) : null,
    });
  }
  if (stats.best_day && stats.best_day.orders >= 2) {
    const p = lagosParts(stats.best_day.date);
    slides.push({
      kind: "bestDay",
      dateLabel: longDate(stats.best_day.date),
      weekday: WEEKDAYS[p.weekday],
      day: p.day,
      month: MONTHS[p.month],
      orders: stats.best_day.orders,
      revenueKobo: stats.best_day.revenue_kobo,
    });
  }

  // ── Love ──────────────────────────────────────────────────────────────
  if (stats.rating_count >= 1 && stats.rating_avg !== null) {
    slides.push({
      kind: "reviews",
      avg: Number(stats.rating_avg),
      count: stats.rating_count,
      fiveStar: stats.five_star_count,
      quote: stats.top_review ? { name: stats.top_review.name, comment: stats.top_review.comment } : null,
    });
  }

  // ── Standing ──────────────────────────────────────────────────────────
  // Only the rounded percentile is ever shown — never a rank or how many
  // kitchens are on Kitchyn.
  if (stats.top_percent && stats.top_percent <= 50) {
    slides.push({ kind: "rank", topPercent: stats.top_percent });
  }

  if (stats.delivery_orders > 0 && stats.pickup_orders > 0) {
    const total = stats.delivery_orders + stats.pickup_orders;
    const deliveryPct = Math.round((stats.delivery_orders / total) * 100);
    slides.push({
      kind: "fulfilment",
      deliveryPct,
      pickupPct: 100 - deliveryPct,
      delivery: stats.delivery_orders,
      pickup: stats.pickup_orders,
    });
  }

  // ── Summary card ──────────────────────────────────────────────────────
  const summaryStats: { label: string; value: string }[] = [
    { label: "Orders", value: stats.orders.toLocaleString("en-NG") },
    { label: "Revenue", value: wrappedNairaCompact(stats.revenue_kobo) },
  ];
  if (stats.customers >= 2) summaryStats.push({ label: "Customers", value: stats.customers.toLocaleString("en-NG") });
  if (stats.rating_count >= 1 && stats.rating_avg !== null) summaryStats.push({ label: "Rating", value: `${Number(stats.rating_avg).toFixed(1)}★` });
  else summaryStats.push({ label: "Days open", value: stats.days_active.toLocaleString("en-NG") });

  slides.push({
    kind: "summary",
    restaurantName: name,
    periodLabel: allTime ? "All-time Wrapped" : `${wrappedPeriodLabel(stats.period_key)} Wrapped`,
    stats: summaryStats,
    topDish: items[0]?.name ?? null,
    busiestDay: stats.orders >= 5 && weekdays.length === 7 ? WEEKDAYS[weekdays.indexOf(Math.max(...weekdays))] : null,
  });

  return slides;
}

/** True when this edition hasn't been watched by the user yet. */
export function isWrappedUnseen(edition: { period_key: string } | null, lastSeenKey: string | null): boolean {
  if (!edition) return false;
  return !lastSeenKey || lastSeenKey < edition.period_key;
}
