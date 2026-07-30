/**
 * The two functions here decide, on every delivery order, who pays for the last
 * mile and when we start spending money looking for a rider. A wrong answer from
 * either is a silent revenue leak rather than an error — nothing throws, nothing
 * alerts, the figure is just quietly wrong at settlement. Hence tests.
 */
import { describe, expect, it } from "vitest";
import {
  computeRiderRequestDueAt,
  DEFAULT_RIDER_REQUEST_LEAD_MINUTES,
  dispatchStateForBoltState,
  isDispatchStateLive,
  laneForPolicy,
  policyRequestsPlatformRider,
  policyShowsDispatchPicker,
  resolveDispatchPolicy,
  resolveRiderRequestLeadMinutes,
} from "./dispatch-policy";

describe("resolveDispatchPolicy", () => {
  it("passes through the three real values", () => {
    expect(resolveDispatchPolicy("platform")).toBe("platform");
    expect(resolveDispatchPolicy("in_house")).toBe("in_house");
    expect(resolveDispatchPolicy("hybrid")).toBe("hybrid");
  });

  it("falls back to hybrid for anything unrecognised", () => {
    // hybrid is the only safe default: it asks a human rather than silently
    // committing us to paying for a ride.
    for (const bad of [null, undefined, "", "platform_rider", "PLATFORM", 7, {}]) {
      expect(resolveDispatchPolicy(bad)).toBe("hybrid");
    }
  });

  it("does not confuse a policy with a dispatch lane", () => {
    // 'platform_rider' is an orders.dispatch_type, not a policy. Accepting it
    // here would put a merchant on the platform lane by typo.
    expect(resolveDispatchPolicy("platform_rider")).toBe("hybrid");
    expect(resolveDispatchPolicy("own_rider")).toBe("hybrid");
  });
});

describe("laneForPolicy", () => {
  it("commits platform merchants to the platform lane", () => {
    expect(laneForPolicy("platform")).toBe("platform_rider");
  });

  it("commits in-house merchants to their own riders", () => {
    expect(laneForPolicy("in_house")).toBe("own_rider");
  });

  it("returns null for hybrid — the merchant has not chosen yet", () => {
    // null is meaningfully different from a lane: don't stamp dispatch_type,
    // don't write the delivery split, show the picker.
    expect(laneForPolicy("hybrid")).toBeNull();
  });
});

describe("policy predicates", () => {
  it("only platform merchants have a rider requested for them", () => {
    expect(policyRequestsPlatformRider("platform")).toBe(true);
    expect(policyRequestsPlatformRider("in_house")).toBe(false);
    expect(policyRequestsPlatformRider("hybrid")).toBe(false);
  });

  it("only hybrid merchants see the picker", () => {
    expect(policyShowsDispatchPicker("hybrid")).toBe(true);
    expect(policyShowsDispatchPicker("platform")).toBe(false);
    expect(policyShowsDispatchPicker("in_house")).toBe(false);
  });
});

describe("resolveRiderRequestLeadMinutes", () => {
  it("prefers the merchant override", () => {
    expect(resolveRiderRequestLeadMinutes(25, 10)).toBe(25);
  });

  it("falls back to the platform default, then to 10", () => {
    expect(resolveRiderRequestLeadMinutes(null, 15)).toBe(15);
    expect(resolveRiderRequestLeadMinutes(null, null)).toBe(
      DEFAULT_RIDER_REQUEST_LEAD_MINUTES
    );
  });

  it("treats 0 as a real value, not as absent", () => {
    // "Request the rider exactly when the food is ready" is a legitimate
    // setting. A falsy check here would silently substitute 10.
    expect(resolveRiderRequestLeadMinutes(0, 30)).toBe(0);
  });

  it("clamps to the range the DB check enforces", () => {
    expect(resolveRiderRequestLeadMinutes(999, 10)).toBe(120);
    expect(resolveRiderRequestLeadMinutes(-5, 10)).toBe(0);
  });

  it("ignores NaN rather than propagating it into a date", () => {
    expect(resolveRiderRequestLeadMinutes(Number.NaN, 12)).toBe(12);
  });
});

describe("computeRiderRequestDueAt", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  const ready = (minutesFromNow: number) =>
    new Date(now.getTime() + minutesFromNow * 60_000).toISOString();

  it("puts the due time one lead before the food is ready", () => {
    const due = computeRiderRequestDueAt({
      policy: "platform",
      fulfillmentType: "delivery",
      estimatedReadyAt: ready(35),
      leadMinutes: 10,
      now,
    });
    // 35 minutes of cooking, 10 minutes of lead → go at the 25-minute mark.
    expect(due?.toISOString()).toBe("2026-07-30T12:25:00.000Z");
  });

  it("returns now when the food is due sooner than the lead", () => {
    // Merchant quotes 5 minutes against a 10-minute lead. The rider is wanted
    // immediately — NOT at a moment in the past, which would fall outside the
    // cron's overdue floor and never be picked up.
    const due = computeRiderRequestDueAt({
      policy: "platform",
      fulfillmentType: "delivery",
      estimatedReadyAt: ready(5),
      leadMinutes: 10,
      now,
    });
    expect(due).toEqual(now);
  });

  it("never arms a timer for in-house or hybrid merchants", () => {
    for (const policy of ["in_house", "hybrid"] as const) {
      expect(
        computeRiderRequestDueAt({
          policy,
          fulfillmentType: "delivery",
          estimatedReadyAt: ready(35),
          leadMinutes: 10,
          now,
        })
      ).toBeNull();
    }
  });

  it("never arms a timer for pickup orders", () => {
    expect(
      computeRiderRequestDueAt({
        policy: "platform",
        fulfillmentType: "pickup",
        estimatedReadyAt: ready(35),
        leadMinutes: 10,
        now,
      })
    ).toBeNull();
  });

  it("returns null when the merchant gave no estimate", () => {
    // Not a failure: the order falls back to the Mark Ready trigger, so the
    // request is never dropped, just not early.
    for (const missing of [null, undefined, ""]) {
      expect(
        computeRiderRequestDueAt({
          policy: "platform",
          fulfillmentType: "delivery",
          estimatedReadyAt: missing,
          leadMinutes: 10,
          now,
        })
      ).toBeNull();
    }
  });

  it("returns null for an unparseable estimate rather than an Invalid Date", () => {
    expect(
      computeRiderRequestDueAt({
        policy: "platform",
        fulfillmentType: "delivery",
        estimatedReadyAt: "not a date",
        leadMinutes: 10,
        now,
      })
    ).toBeNull();
  });

  it("accepts a Date as readily as an ISO string", () => {
    const due = computeRiderRequestDueAt({
      policy: "platform",
      fulfillmentType: "delivery",
      estimatedReadyAt: new Date(ready(30)),
      leadMinutes: 10,
      now,
    });
    expect(due?.toISOString()).toBe("2026-07-30T12:20:00.000Z");
  });

  it("with a zero lead, fires exactly when the food is ready", () => {
    const due = computeRiderRequestDueAt({
      policy: "platform",
      fulfillmentType: "delivery",
      estimatedReadyAt: ready(20),
      leadMinutes: 0,
      now,
    });
    expect(due?.toISOString()).toBe("2026-07-30T12:20:00.000Z");
  });
});

describe("dispatchStateForBoltState", () => {
  it("treats DRIVING_WITH_CLIENT as pickup, not delivery", () => {
    // Bolt's "client" is the PICKUP point — the restaurant. This is the rider
    // leaving with the food, which is what moves the order to in_transit.
    // Reading it as "with the customer" would mark orders delivered on collection.
    expect(dispatchStateForBoltState("DRIVING_WITH_CLIENT")).toBe("picked_up");
  });

  it("maps the approach states to driver_assigned", () => {
    expect(dispatchStateForBoltState("DRIVER_ON_ROUTE_TO_CLIENT")).toBe("driver_assigned");
    expect(dispatchStateForBoltState("ARRIVED_AT_CLIENT")).toBe("driver_assigned");
  });

  it("maps every failure state to failed", () => {
    for (const s of [
      "NO_DRIVER_FOUND",
      "PAYMENT_BOOKING_FAILED",
      "CREATE_FAILED",
      "CLIENT_DID_NOT_SHOW",
    ]) {
      expect(dispatchStateForBoltState(s)).toBe("failed");
    }
  });

  it("returns null for states it does not know", () => {
    expect(dispatchStateForBoltState("SOMETHING_NEW")).toBeNull();
  });
});

describe("isDispatchStateLive", () => {
  it("is true exactly while a ride needs standing down on cancellation", () => {
    expect(isDispatchStateLive("requested")).toBe(true);
    expect(isDispatchStateLive("booked")).toBe(true);
    expect(isDispatchStateLive("driver_assigned")).toBe(true);
  });

  it("is false once the ride is over or was never asked for", () => {
    for (const s of [
      "picked_up",
      "delivered",
      "cancelled",
      "failed",
      "pending",
      "not_required",
      null,
      undefined,
    ]) {
      expect(isDispatchStateLive(s)).toBe(false);
    }
  });
});
