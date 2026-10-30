import { describe, expect, it } from "vitest";
import { buildWrappedSlides, isWrappedUnseen, wrappedHourLabel, wrappedNaira, wrappedNairaCompact, type WrappedStats } from "./wrapped";

const base: WrappedStats = {
  version: 1,
  scope: "all_time",
  period_key: "2026-10",
  period_start: "2026-03-12T09:00:00Z",
  period_end: "2026-10-30T08:00:00Z",
  restaurant_name: "Mama Tee's Kitchen",
  joined_at: "2026-03-10T10:00:00Z",
  orders: 2847,
  revenue_kobo: 1845632000,
  aov_kobo: 648270,
  delivery_orders: 2104,
  pickup_orders: 743,
  days_active: 221,
  top_items: [
    { name: "Jollof", quantity: 1932, revenue_kobo: 579600000, image_url: null },
    { name: "Turkey", quantity: 1288, revenue_kobo: 386400000, image_url: null },
    { name: "Dodo", quantity: 1104, revenue_kobo: 110400000, image_url: null },
  ],
  distinct_items: 34,
  customers: 1193,
  new_customers: 1193,
  repeat_customers: 512,
  top_customer: { first_name: "Tolu", orders: 86, spent_kobo: 53825000 },
  weekday_counts: [310, 298, 355, 402, 588, 534, 360],
  hour_counts: Array.from({ length: 24 }, (_, h) => (h === 19 ? 400 : 10)),
  best_day: { date: "2026-09-26", orders: 61, revenue_kobo: 41250000 },
  rating_avg: 4.7,
  rating_count: 214,
  five_star_count: 168,
  top_review: { name: "Ada", comment: "Best jollof in Lagos!", rating: 5 },
  first_order: { at: "2026-03-12T13:14:00Z", order_number: "KT-0001" },
  rank: 3,
  ranked_restaurants: 42,
  previous: null,
};

describe("buildWrappedSlides", () => {
  it("tells the full all-time story for a busy merchant", () => {
    const kinds = buildWrappedSlides(base).map((s) => s.kind);
    expect(kinds).toEqual([
      "intro", "origin", "orders", "revenue", "topDish", "topFive", "customers",
      "fan", "peak", "bestDay", "reviews", "rank", "fulfilment", "summary",
    ]);
  });

  it("derives the busiest day, peak hour and record day in Lagos time", () => {
    const slides = buildWrappedSlides(base);
    const peak = slides.find((s) => s.kind === "peak");
    expect(peak).toMatchObject({ busiestDay: "Friday", busiestIndex: 4, peakHourLabel: "7pm" });
    const best = slides.find((s) => s.kind === "bestDay");
    expect(best).toMatchObject({ weekday: "Saturday", day: 26, month: "September" });
  });

  it("drops thin slides for a brand-new merchant", () => {
    const kinds = buildWrappedSlides({
      ...base,
      orders: 1,
      revenue_kobo: 500000,
      top_items: [{ name: "Jollof", quantity: 1, revenue_kobo: 500000, image_url: null }],
      customers: 1,
      top_customer: null,
      best_day: { date: "2026-10-29", orders: 1, revenue_kobo: 500000 },
      rating_avg: null,
      rating_count: 0,
      rank: 40,
      pickup_orders: 0,
    }).map((s) => s.kind);
    expect(kinds).toEqual(["intro", "origin", "orders", "revenue", "topDish", "summary"]);
  });

  it("adds month-over-month deltas to monthly editions", () => {
    const slides = buildWrappedSlides({
      ...base,
      scope: "month",
      period_key: "2026-11",
      period_start: "2026-10-31T23:00:00Z",
      orders: 412,
      previous: { orders: 351, revenue_kobo: 231000000 },
      revenue_kobo: 268000000,
    });
    expect(slides.some((s) => s.kind === "origin")).toBe(false);
    expect(slides.find((s) => s.kind === "orders")).toMatchObject({ deltaPct: 17, deltaLabel: "vs October" });
    expect(slides.find((s) => s.kind === "revenue")).toMatchObject({ deltaPct: 16 });
  });
});

describe("helpers", () => {
  it("formats money and hours", () => {
    expect(wrappedNaira(161456000)).toBe("₦1,614,560");
    expect(wrappedNairaCompact(1845632000)).toBe("₦18M");
    expect(wrappedNairaCompact(268000000)).toBe("₦2.7M");
    expect(wrappedNairaCompact(24500000)).toBe("₦245K");
    expect(wrappedHourLabel(0)).toBe("midnight");
    expect(wrappedHourLabel(12)).toBe("noon");
    expect(wrappedHourLabel(9)).toBe("9am");
  });

  it("knows when an edition is unseen", () => {
    expect(isWrappedUnseen(null, null)).toBe(false);
    expect(isWrappedUnseen({ period_key: "2026-10" }, null)).toBe(true);
    expect(isWrappedUnseen({ period_key: "2026-10" }, "2026-10")).toBe(false);
    expect(isWrappedUnseen({ period_key: "2026-11" }, "2026-10")).toBe(true);
  });
});
