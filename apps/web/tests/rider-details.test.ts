import { describe, expect, it } from "vitest";
import {
  dispatchStateShowsRider,
  formatEtaMinutes,
  isRiderActiveState,
  latestTimestamp,
  remainingEtaSeconds,
  riderLegForState,
} from "@/lib/delivery/rider-details";

describe("riderLegForState", () => {
  it("reads Bolt's 'client' as the store, not the customer", () => {
    expect(riderLegForState("DRIVER_ON_ROUTE_TO_CLIENT")).toBe("to_store");
    expect(riderLegForState("ARRIVED_AT_CLIENT")).toBe("at_store");
    expect(riderLegForState("DRIVING_WITH_CLIENT")).toBe("to_customer");
  });

  it("falls back to unknown", () => {
    expect(riderLegForState(null)).toBe("unknown");
    expect(riderLegForState("PENDING")).toBe("unknown");
  });
});

describe("isRiderActiveState / dispatchStateShowsRider", () => {
  it("only counts accepted, live rides", () => {
    expect(isRiderActiveState("DRIVER_ON_ROUTE_TO_CLIENT")).toBe(true);
    expect(isRiderActiveState("DRIVING_WITH_CLIENT")).toBe(true);
    expect(isRiderActiveState("PENDING")).toBe(false);
    expect(isRiderActiveState("COMPLETED")).toBe(false);
    expect(isRiderActiveState("NO_DRIVER_FOUND")).toBe(false);
  });

  it("shows the panel from acceptance until delivery", () => {
    expect(dispatchStateShowsRider("driver_assigned")).toBe(true);
    expect(dispatchStateShowsRider("picked_up")).toBe(true);
    expect(dispatchStateShowsRider("booked")).toBe(false);
    expect(dispatchStateShowsRider("delivered")).toBe(false);
    expect(dispatchStateShowsRider(null)).toBe(false);
  });
});

describe("remainingEtaSeconds", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");

  it("counts down from when the ETA was taken", () => {
    expect(remainingEtaSeconds(600, "2026-10-31T11:58:00Z", now)).toBe(480);
  });

  it("never goes negative", () => {
    expect(remainingEtaSeconds(60, "2026-10-31T11:50:00Z", now)).toBe(0);
  });

  it("ignores a future reference time", () => {
    expect(remainingEtaSeconds(300, "2026-10-31T12:05:00Z", now)).toBe(300);
  });

  it("returns null with no ETA", () => {
    expect(remainingEtaSeconds(null, "2026-10-31T11:58:00Z", now)).toBeNull();
  });

  it("uses the raw ETA when the reference time is missing", () => {
    expect(remainingEtaSeconds(240, null, now)).toBe(240);
  });
});

describe("formatEtaMinutes", () => {
  it("formats minutes", () => {
    expect(formatEtaMinutes(null)).toBeNull();
    expect(formatEtaMinutes(30)).toBe("under a minute");
    expect(formatEtaMinutes(89)).toBe("1 min");
    expect(formatEtaMinutes(720)).toBe("12 min");
  });
});

describe("latestTimestamp", () => {
  it("picks the later of two, tolerating missing values", () => {
    expect(latestTimestamp("2026-10-31T12:00:00Z", "2026-10-31T11:00:00Z")).toBe("2026-10-31T12:00:00Z");
    expect(latestTimestamp(null, "2026-10-31T11:00:00Z")).toBe("2026-10-31T11:00:00Z");
    expect(latestTimestamp("2026-10-31T11:00:00Z", undefined)).toBe("2026-10-31T11:00:00Z");
    expect(latestTimestamp(null, null)).toBeNull();
  });
});
