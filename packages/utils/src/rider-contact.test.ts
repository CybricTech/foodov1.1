/**
 * resolveRiderContact runs inside ride booking and decides whose phone rings
 * when a driver arrives. A wrong answer doesn't throw. It just sends a stranger
 * to the wrong number, or rings a merchant who never agreed to take rider calls,
 * and nobody finds out until a delivery stalls at the gate. Hence tests.
 */
import { describe, expect, it } from "vitest";
import {
  isMerchantRiderContactLive,
  normalizeNigerianMobile,
  parseRiderContactInput,
  resolveMerchantRiderPhone,
  resolveRiderContact,
  resolveRiderContactMode,
} from "./rider-contact";

const OPS = "+2348063662721";

describe("resolveRiderContactMode", () => {
  it("passes through the three real values", () => {
    expect(resolveRiderContactMode("ops")).toBe("ops");
    expect(resolveRiderContactMode("selected")).toBe("selected");
    expect(resolveRiderContactMode("merchant")).toBe("merchant");
  });

  it("fails toward ops for anything else, including a missing column", () => {
    for (const raw of [undefined, null, "", "MERCHANT", "all", "pilot", 1, {}]) {
      expect(resolveRiderContactMode(raw)).toBe("ops");
    }
  });
});

describe("isMerchantRiderContactLive", () => {
  it("is off for everyone in ops mode, selected or not", () => {
    expect(isMerchantRiderContactLive("ops", false)).toBe(false);
    expect(isMerchantRiderContactLive("ops", true)).toBe(false);
  });

  it("is on only for selected stores in selected mode", () => {
    expect(isMerchantRiderContactLive("selected", true)).toBe(true);
    expect(isMerchantRiderContactLive("selected", false)).toBe(false);
  });

  it("is on for every store in merchant mode", () => {
    expect(isMerchantRiderContactLive("merchant", false)).toBe(true);
    expect(isMerchantRiderContactLive("merchant", true)).toBe(true);
  });
});

describe("normalizeNigerianMobile", () => {
  it.each([
    ["08031234567", "+2348031234567"],
    ["0803 123 4567", "+2348031234567"],
    ["803-123-4567", "+2348031234567"],
    ["+2348031234567", "+2348031234567"],
    ["+234 803 123 4567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    ["+234 (0) 803 123 4567", "+2348031234567"],
    ["+23408031234567", "+2348031234567"],
    ["07012345678", "+2347012345678"],
    ["08112345678", "+2348112345678"],
    ["09012345678", "+2349012345678"],
    ["09112345678", "+2349112345678"],
  ])("normalises %s", (raw, expected) => {
    expect(normalizeNigerianMobile(raw)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    ["abc"],
    ["0803123456"], // one digit short
    ["080312345678"], // one digit long
    ["+447911123456"], // UK mobile, a stranger's motorbike can't ring it
    ["+2341234567890"], // ten digits after +234 that no network issues
    ["092345678"], // Abuja landline
    ["+2348231234567"], // 82x is not a mobile prefix
  ])("rejects %s", (raw) => {
    expect(normalizeNigerianMobile(raw)).toBeNull();
  });
});

describe("resolveMerchantRiderPhone", () => {
  it("uses the custom number when one is set, even if WhatsApp is valid too", () => {
    expect(
      resolveMerchantRiderPhone({ customPhone: "+2348111111111", whatsappNumber: "+2348022222222" })
    ).toEqual({ ok: true, phone: "+2348111111111", source: "merchant_custom" });
  });

  it("follows the WhatsApp number when no custom number is set", () => {
    expect(
      resolveMerchantRiderPhone({ customPhone: null, whatsappNumber: "0802 222 2222" })
    ).toEqual({ ok: true, phone: "+2348022222222", source: "merchant_whatsapp" });
  });

  it("treats a blank custom number as unset", () => {
    expect(
      resolveMerchantRiderPhone({ customPhone: "  ", whatsappNumber: "+2348022222222" })
    ).toEqual({ ok: true, phone: "+2348022222222", source: "merchant_whatsapp" });
  });

  it("does NOT fall through to WhatsApp when the custom number is broken", () => {
    // They chose a different number on purpose. Ops beats the one they opted out of.
    expect(
      resolveMerchantRiderPhone({ customPhone: "12345", whatsappNumber: "+2348022222222" })
    ).toEqual({ ok: false, reason: "invalid_number", source: "merchant_custom" });
  });

  it("names WhatsApp as the problem when that's the number that's unusable", () => {
    expect(
      resolveMerchantRiderPhone({ customPhone: null, whatsappNumber: "+447911123456" })
    ).toEqual({ ok: false, reason: "invalid_number", source: "merchant_whatsapp" });
  });

  it("reports no number when neither is set", () => {
    expect(resolveMerchantRiderPhone({ customPhone: null, whatsappNumber: null })).toEqual({
      ok: false,
      reason: "no_number",
      source: null,
    });
  });
});

describe("resolveRiderContact", () => {
  const merchant = { customPhone: null, whatsappNumber: "+2348022222222", opsPhone: OPS };

  it("uses ops while the rollout is off, however good the merchant's number", () => {
    expect(resolveRiderContact({ ...merchant, mode: "ops", selected: true })).toEqual({
      phone: OPS,
      source: "ops",
      fallbackReason: "rollout_off",
    });
  });

  it("uses ops for a store that hasn't been selected", () => {
    expect(resolveRiderContact({ ...merchant, mode: "selected", selected: false })).toEqual({
      phone: OPS,
      source: "ops",
      fallbackReason: "not_selected",
    });
  });

  it("uses the merchant for a selected store", () => {
    expect(resolveRiderContact({ ...merchant, mode: "selected", selected: true })).toEqual({
      phone: "+2348022222222",
      source: "merchant_whatsapp",
      fallbackReason: null,
    });
  });

  it("uses the merchant for every store once fully rolled out", () => {
    expect(resolveRiderContact({ ...merchant, mode: "merchant", selected: false })).toEqual({
      phone: "+2348022222222",
      source: "merchant_whatsapp",
      fallbackReason: null,
    });
  });

  it("prefers the custom number once live", () => {
    expect(
      resolveRiderContact({ ...merchant, customPhone: "08111111111", mode: "merchant", selected: false })
    ).toEqual({ phone: "+2348111111111", source: "merchant_custom", fallbackReason: null });
  });

  it("falls back to ops, with the reason, when a live store has no usable number", () => {
    expect(
      resolveRiderContact({ customPhone: null, whatsappNumber: null, opsPhone: OPS, mode: "merchant", selected: false })
    ).toEqual({ phone: OPS, source: "ops", fallbackReason: "no_number" });

    expect(
      resolveRiderContact({ customPhone: null, whatsappNumber: "+44 7911 123456", opsPhone: OPS, mode: "merchant", selected: false })
    ).toEqual({ phone: OPS, source: "ops", fallbackReason: "invalid_number" });
  });
});

describe("parseRiderContactInput", () => {
  it("treats blank and null as 'follow my WhatsApp number'", () => {
    expect(parseRiderContactInput(null)).toEqual({ ok: true, phone: null });
    expect(parseRiderContactInput(undefined)).toEqual({ ok: true, phone: null });
    expect(parseRiderContactInput("")).toEqual({ ok: true, phone: null });
    expect(parseRiderContactInput("   ")).toEqual({ ok: true, phone: null });
  });

  it("stores whatever the merchant typed as E.164", () => {
    expect(parseRiderContactInput("0803 123 4567")).toEqual({ ok: true, phone: "+2348031234567" });
  });

  it("rejects numbers a rider can't ring, with a message a merchant can act on", () => {
    const result = parseRiderContactInput("+447911123456");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Nigerian mobile/);
  });

  it("rejects non-strings", () => {
    expect(parseRiderContactInput(8031234567).ok).toBe(false);
  });
});
