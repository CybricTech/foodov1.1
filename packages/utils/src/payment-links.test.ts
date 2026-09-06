import { describe, expect, it } from "vitest";
import { isRejectedPayment, livePaymentLinkPayment, paymentLinkStatus, pricePaymentLinkItems, type PaymentLinkInputLine, type PaymentLinkMenuItem } from "./payment-links";

const menu: PaymentLinkMenuItem[] = [{
  id: "meal", name: "Chicken rice", price_kobo: 500000, is_available: true,
  track_inventory: true, stock_quantity: 5,
  options: [{ id: "protein", name: "Protein", min_selections: 1, max_selections: 2,
    choices: [{ id: "chicken", name: "Extra chicken", price_modifier_kobo: 150000, is_available: true }] }],
}];
const line = (): PaymentLinkInputLine => ({ menuItemId: "meal", quantity: 2, selectedOptions: [{ optionId: "protein", choices: [{ choiceId: "chicken", quantity: 2 }] }], specialRequest: "  No onions  " });

describe("prepared order pricing", () => {
  it("uses the merchant's menu prices/names and preserves extras and kitchen notes", () => {
    const result = pricePaymentLinkItems([{ ...line(), name: "Forged", priceKobo: 1 } as PaymentLinkInputLine], menu);
    expect(result[0]).toMatchObject({ name: "Chicken rice", priceKobo: 800000, quantity: 2, specialRequest: "No onions" });
    expect(result[0].selectedOptions[0].choices[0]).toMatchObject({ choiceName: "Extra chicken", quantity: 2, priceModifierKobo: 150000 });
  });
  it("rejects items from a different restaurant's menu", () => {
    expect(() => pricePaymentLinkItems([{ ...line(), menuItemId: "other-restaurant-meal" }], menu)).toThrow("no longer available");
  });
  it("rejects a choice belonging to another option", () => {
    const forged = line(); forged.selectedOptions[0].choices[0].choiceId = "foreign-choice";
    expect(() => pricePaymentLinkItems([forged], menu)).toThrow("no longer available");
  });
  it("rejects foreign and repeated option groups", () => {
    const forged = line(); forged.selectedOptions[0].optionId = "foreign-group";
    expect(() => pricePaymentLinkItems([forged], menu)).toThrow("options");
    const repeated = line(); repeated.selectedOptions.push(repeated.selectedOptions[0]);
    expect(() => pricePaymentLinkItems([repeated], menu)).toThrow("options");
  });
  it("requires mandatory options and enforces maximum quantities", () => {
    expect(() => pricePaymentLinkItems([{ ...line(), selectedOptions: [] }], menu)).toThrow("number of selections");
    const tooMany = line(); tooMany.selectedOptions[0].choices[0].quantity = 3;
    expect(() => pricePaymentLinkItems([tooMany], menu)).toThrow("number of selections");
  });
  it("rejects repeated choices", () => {
    const repeated = line(); repeated.selectedOptions[0].choices.push(repeated.selectedOptions[0].choices[0]);
    expect(() => pricePaymentLinkItems([repeated], menu)).toThrow("repeated");
  });
  it("checks stock across separate lines with different notes/options", () => {
    expect(() => pricePaymentLinkItems([line(), line(), { ...line(), specialRequest: "No pepper" }], menu)).toThrow("Only 5 portions");
  });
  it.each([0, -1, 1.5, 100, NaN, Infinity])("rejects invalid line quantity %s", (quantity) => {
    expect(() => pricePaymentLinkItems([{ ...line(), quantity }], menu)).toThrow("quantities");
  });
  it("rejects unavailable items and extras", () => {
    expect(() => pricePaymentLinkItems([line()], [{ ...menu[0], is_available: false }])).toThrow("no longer available");
    const unavailable = structuredClone(menu); unavailable[0].options![0].choices[0].is_available = false;
    expect(() => pricePaymentLinkItems([line()], unavailable)).toThrow("no longer available");
  });
  it("rejects empty/oversized orders and overlong notes", () => {
    expect(() => pricePaymentLinkItems([], menu)).toThrow();
    expect(() => pricePaymentLinkItems(Array(51).fill(line()), menu)).toThrow();
    expect(() => pricePaymentLinkItems([{ ...line(), specialRequest: "x".repeat(301) }], menu)).toThrow("300");
  });
});

describe("payment link lifecycle", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const active = { expires_at: "2026-09-07T12:00:00Z", cancelled_at: null };
  const pending = { order_id: null, monnify_status: "pending" };
  it("shows awaiting, expired and cancelled links", () => {
    expect(paymentLinkStatus(active, [], now)).toBe("awaiting_payment");
    expect(paymentLinkStatus({ ...active, expires_at: new Date(now).toISOString() }, [], now)).toBe("expired");
    expect(paymentLinkStatus({ ...active, cancelled_at: new Date(now).toISOString() }, [], now)).toBe("cancelled");
  });
  it("keeps an issued transaction resumable after link expiry", () => {
    expect(paymentLinkStatus({ ...active, expires_at: new Date(now - 1).toISOString() }, [pending], now)).toBe("payment_started");
  });
  it("recognizes both gateways before the order webhook finishes", () => {
    expect(paymentLinkStatus(active, [{ ...pending, monnify_status: "success" }], now)).toBe("paid");
    expect(paymentLinkStatus(active, [{ ...pending, paystack_status: "success" }], now)).toBe("paid");
    expect(paymentLinkStatus(active, [{ ...pending, order_id: "paid-order" }], now)).toBe("paid");
  });
});

describe("retry after a refused payment", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  const active = { expires_at: "2026-09-07T12:00:00Z", cancelled_at: null };
  const pending = { order_id: null, monnify_status: "pending" };
  const rejected = { order_id: null, monnify_status: "rejected" };
  const declined = { order_id: null, paystack_status: "rejected" };

  it("reopens a link once every attempt was refused", () => {
    expect(paymentLinkStatus(active, [rejected], now)).toBe("payment_failed");
    expect(paymentLinkStatus(active, [declined, rejected], now)).toBe("payment_failed");
    expect(livePaymentLinkPayment([rejected, declined])).toBeNull();
  });
  it("still blocks while any attempt can take money", () => {
    expect(paymentLinkStatus(active, [pending, rejected], now)).toBe("payment_started");
    expect(livePaymentLinkPayment([rejected, pending])).toBe(pending);
  });
  it("treats an in-flight transfer as live, never as refused", () => {
    for (const status of ["pending", "PENDING", "PARTIALLY_PAID", null]) {
      expect(isRejectedPayment({ order_id: null, monnify_status: status })).toBe(false);
      expect(paymentLinkStatus(active, [{ order_id: null, monnify_status: status }], now)).toBe("payment_started");
    }
  });
  it("prefers the payment that succeeded over any refused sibling", () => {
    const paid = { order_id: "order-1", monnify_status: "success" };
    expect(livePaymentLinkPayment([rejected, paid])).toBe(paid);
    expect(paymentLinkStatus(active, [rejected, paid], now)).toBe("paid");
  });
  it("does not resurrect a cancelled or expired link through a failed attempt", () => {
    expect(paymentLinkStatus({ ...active, cancelled_at: new Date(now).toISOString() }, [rejected], now)).toBe("cancelled");
    expect(paymentLinkStatus({ ...active, expires_at: new Date(now - 1).toISOString() }, [rejected], now)).toBe("expired");
  });
});
