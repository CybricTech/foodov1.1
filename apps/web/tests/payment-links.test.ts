import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ user: vi.fn(), db: vi.fn(), menu: vi.fn(), testOrder: vi.fn(), gateway: vi.fn() }));
vi.mock("@/lib/supabase/get-request-user", () => ({ getRequestUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: mocks.db }));
vi.mock("@foodo/database", () => ({ getMenuItems: mocks.menu }));
vi.mock("@/lib/posthog", () => ({ getPostHogClient: () => ({ capture: vi.fn(), shutdown: vi.fn() }) }));
vi.mock("@/lib/monnify", () => ({ initMonnifyTransaction: mocks.gateway }));
vi.mock("@/lib/discounts", () => ({ resolveDiscount: async () => ({ applied: null }) }));
vi.mock("@/lib/checkout/create-test-order", () => ({ createTestOrder: mocks.testOrder }));

import { paymentLinkMerchant, paymentLinkUrl, readPaymentLink } from "@/lib/payment-links";
import { POST as initialize } from "@/app/api/checkout/initialize/route";
import { DELETE as cancel } from "@/app/api/dashboard/payment-links/[id]/route";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const menuId = "44444444-4444-4444-8444-444444444444";
const request = () => new NextRequest("http://localhost:3000/api/checkout/initialize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, paymentLinkToken: token, customerName: "Test Customer", customerPhone: "08012345678", fulfillmentType: "pickup", items: [{ menuItemId: menuId, name: "Rice", priceKobo: 1, quantity: 1, selectedOptions: [] }] }) });

/** Minimal chainable Supabase stub; no network, credentials, or live payments. */
function database(results: Record<string, { data: unknown; error?: unknown }>) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]>; mutation?: unknown }> = [];
  const from = vi.fn((table: string) => {
    const query: (typeof queries)[number] = { table, filters: [] };
    queries.push(query);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return chain; }),
      update: vi.fn((value: unknown) => { query.mutation = value; return chain; }),
      insert: vi.fn((value: unknown) => { query.mutation = value; return chain; }),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      then: (resolve: (result: { data: unknown; error?: unknown }) => unknown) => Promise.resolve(resolve(results[table] ?? { data: null })),
      maybeSingle: vi.fn(async () => results[table] ?? { data: null }),
      single: vi.fn(async () => table === "payments" && query.mutation ? { data: { id: "payment-id" } } : results[table] ?? { data: null }),
    };
    return chain;
  });
  const db = { from };
  mocks.db.mockReturnValue(db);
  return { db, queries };
}
const activeLink = { id: linkId, restaurant_id: restaurantId, token, items: [{ menuItemId: menuId, name: "Rice", priceKobo: 500000, quantity: 1, selectedOptions: [] }], cancelled_at: null, expires_at: "2099-01-01T00:00:00Z" };

beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "merchant-user" }); });

describe("merchant authorization", () => {
  it("requires a verified session", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await paymentLinkMerchant(request())).error?.status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["customer", "platform_rider", "super_admin"])("rejects %s", async (role) => {
    database({ user_profiles: { data: { role, restaurant_id: restaurantId, is_active: true } } });
    expect((await paymentLinkMerchant(request())).error?.status).toBe(403);
  });
  it("rejects deactivated merchant accounts", async () => {
    database({ user_profiles: { data: { role: "merchant_owner", restaurant_id: restaurantId, is_active: false } } });
    expect((await paymentLinkMerchant(request())).error?.status).toBe(403);
  });
  it.each(["merchant_owner", "merchant_staff"])("derives tenant from the %s profile", async (role) => {
    database({ user_profiles: { data: { role, restaurant_id: restaurantId, is_active: true } } });
    expect(await paymentLinkMerchant(request())).toMatchObject({ restaurantId, userId: "merchant-user" });
  });
});

describe("prepared order checkout integration", () => {
  function readyDatabase(isTest: boolean) {
    mocks.menu.mockResolvedValue([{ id: menuId, name: "Rice", price_kobo: 500000, is_available: true, options: [] }]);
    return database({
      merchant_payment_links: { data: activeLink }, payments: { data: [] },
      restaurants: { data: { id: restaurantId, slug: "test-kitchen", name: "Test Kitchen", accepts_orders: true, accepts_delivery: true, accepts_pickup: true, is_test: isTest } },
      menu_items: { data: [{ id: menuId, price_kobo: 500000, is_available: true }] },
    });
  }
  it("creates a test order using the saved meal, never the submitted price", async () => {
    const { queries } = readyDatabase(true);
    mocks.testOrder.mockResolvedValue({ orderId: "paid-order", orderNumber: "TK-1" });
    const response = await initialize(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "test", orderId: "paid-order", totalKobo: 500000 });
    expect(queries.find((q) => q.table === "payments" && q.mutation)?.mutation).toMatchObject({ payment_link_id: linkId, amount_kobo: 500000, metadata: { payment_link_id: linkId, items: [{ name: "Rice", priceKobo: 500000, quantity: 1 }] } });
    expect(mocks.testOrder).toHaveBeenCalledOnce();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
  it("binds Monnify to one hosted checkout and stores its exact resume URL", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "monnify");
    const { queries } = readyDatabase(false);
    mocks.gateway.mockResolvedValue({ checkoutUrl: "https://checkout.monnify.com/session-1", transactionReference: "gateway-ref" });
    const response = await initialize(request());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ provider: "monnify", totalKobo: 500000, checkoutUrl: "https://checkout.monnify.com/session-1" });
    expect(mocks.gateway).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000, paymentReference: result.monnifyRef, redirectUrl: expect.stringContaining("/test-kitchen/orders/pending?ref=") }));
    expect(queries.find((q) => q.table === "merchant_payment_links" && q.mutation)?.mutation).toEqual({ checkout_response: result });
    expect(mocks.testOrder).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("fails closed after uncertain gateway setup rather than issuing another reference", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "monnify");
    const { queries } = readyDatabase(false);
    mocks.gateway.mockRejectedValue(new Error("network timeout"));
    const response = await initialize(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ reopenPaymentLink: true });
    expect(queries.filter((q) => q.table === "payments" && q.mutation)).toHaveLength(1);
    expect(mocks.testOrder).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
  it("stores Paystack's hosted checkout with a return to order confirmation", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "paystack");
    readyDatabase(false);
    const gateway = vi.fn().mockResolvedValue(Response.json({ data: { access_code: "access-1", authorization_url: "https://checkout.paystack.com/session-1" } }));
    vi.stubGlobal("fetch", gateway);
    try {
      const response = await initialize(request());
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({ provider: "paystack", checkoutUrl: "https://checkout.paystack.com/session-1", totalKobo: 500000 });
      const body = JSON.parse(gateway.mock.calls[0][1].body);
      expect(body).toMatchObject({ amount: 500000, reference: result.paystackRef, callback_url: expect.stringContaining("provider=paystack") });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});

describe("public link reads and payment gates", () => {
  it("scopes both link and payment reads to the restaurant", async () => {
    const { db, queries } = database({ merchant_payment_links: { data: activeLink }, payments: { data: [] } });
    await readPaymentLink(db as never, token, restaurantId);
    expect(queries[0].filters).toEqual([["token", token], ["restaurant_id", restaurantId]]);
    expect(queries[1].filters).toEqual([["payment_link_id", linkId], ["restaurant_id", restaurantId]]);
  });
  it("returns 404 for a missing or cross-tenant link before payment initialization", async () => {
    const { queries } = database({ merchant_payment_links: { data: null } });
    expect((await initialize(request())).status).toBe(404);
    expect(queries.map((q) => q.table)).toEqual(["merchant_payment_links"]);
  });
  it.each([
    { ...activeLink, cancelled_at: "2026-01-01T00:00:00Z" },
    { ...activeLink, expires_at: "2000-01-01T00:00:00Z" },
  ])("rejects cancelled/expired links before creating any payment", async (link) => {
    const { queries } = database({ merchant_payment_links: { data: link }, payments: { data: [] } });
    expect((await initialize(request())).status).toBe(410);
    expect(queries.every((q) => !q.mutation)).toBe(true);
    expect(mocks.menu).not.toHaveBeenCalled();
  });
  it("requires resuming an existing transaction instead of issuing another", async () => {
    database({ merchant_payment_links: { data: activeLink }, payments: { data: [{ id: "existing-payment", order_id: null, monnify_status: "pending" }] } });
    const response = await initialize(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reopenPaymentLink: true });
    expect(mocks.menu).not.toHaveBeenCalled();
  });
  it("issues a fresh reference once the gateway has refused every earlier attempt", async () => {
    mocks.menu.mockResolvedValue([{ id: menuId, name: "Rice", price_kobo: 500000, is_available: true, options: [] }]);
    const { queries } = database({
      merchant_payment_links: { data: activeLink },
      payments: { data: [{ id: "declined", order_id: null, monnify_status: "rejected" }] },
      restaurants: { data: { id: restaurantId, slug: "test-kitchen", name: "Test Kitchen", accepts_orders: true, accepts_delivery: true, accepts_pickup: true, is_test: true } },
      menu_items: { data: [{ id: menuId, price_kobo: 500000, is_available: true }] },
    });
    mocks.testOrder.mockResolvedValue({ orderId: "retried-order", orderNumber: "TK-2" });
    const response = await initialize(request());
    expect(response.status).toBe(200);
    // A brand new payment row, not a resume of the refused one.
    expect(queries.find((q) => q.table === "payments" && q.mutation)?.mutation).toMatchObject({ payment_link_id: linkId, amount_kobo: 500000 });
  });
  it("still refuses a second charge while an earlier attempt can settle", async () => {
    database({
      merchant_payment_links: { data: activeLink },
      payments: { data: [{ id: "declined", order_id: null, monnify_status: "rejected" }, { id: "in-flight", order_id: null, monnify_status: "PENDING" }] },
    });
    const response = await initialize(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reopenPaymentLink: true });
    expect(mocks.menu).not.toHaveBeenCalled();
  });
  it("rejects changed menu prices rather than charging an unreviewed amount", async () => {
    database({ merchant_payment_links: { data: activeLink }, payments: { data: [] } });
    mocks.menu.mockResolvedValue([{ id: menuId, name: "Rice", price_kobo: 600000, is_available: true, options: [] }]);
    const response = await initialize(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("price has changed");
    expect(mocks.menu).toHaveBeenCalledWith(expect.anything(), restaurantId);
  });
});

describe("cancellation and sharing", () => {
  it("scopes cancellation to the authenticated restaurant", async () => {
    const { queries } = database({ user_profiles: { data: { role: "merchant_staff", restaurant_id: restaurantId, is_active: true } }, merchant_payment_links: { data: { id: linkId } } });
    expect((await cancel(request(), { params: { id: linkId } })).status).toBe(200);
    expect(queries[1].filters).toEqual([["id", linkId], ["restaurant_id", restaurantId]]);
  });
  it("surfaces the database's payment-versus-cancellation race rejection", async () => {
    database({ user_profiles: { data: { role: "merchant_owner", restaurant_id: restaurantId, is_active: true } }, merchant_payment_links: { data: null, error: { message: "Payment already started" } } });
    expect((await cancel(request(), { params: { id: linkId } })).status).toBe(409);
  });
  it("keeps preview links local and production links on the restaurant domain", () => {
    expect(paymentLinkUrl(request(), "test-kitchen", token)).toBe(`http://localhost:3000/test-kitchen/pay/${token}`);
    expect(paymentLinkUrl(new NextRequest("https://dashboard.kitchyn.app/api/dashboard/payment-links"), "test-kitchen", token)).toBe(`https://test-kitchen.kitchyn.app/pay/${token}`);
  });
});
