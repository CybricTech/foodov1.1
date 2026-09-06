import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMenuItems, type Json } from "@foodo/database";
import { livePaymentLinkPayment, paymentLinkStatus, pricePaymentLinkItems } from "@foodo/utils";
import { paymentLinkMerchant, paymentLinkUrl } from "@/lib/payment-links";
import { isRateLimited } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
const schema = z.object({
  requestKey: z.string().min(16).max(100),
  customerName: z.string().trim().max(100).default(""),
  items: z.array(z.object({
    menuItemId: z.string().uuid(), quantity: z.number().int().min(1).max(99),
    specialRequest: z.string().trim().max(300).optional(),
    selectedOptions: z.array(z.object({
      optionId: z.string().uuid(), choices: z.array(z.object({ choiceId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).max(50),
    })).max(50),
  })).min(1).max(50),
});

export async function GET(request: NextRequest) {
  const auth = await paymentLinkMerchant(request);
  if (auth.error) return auth.error;
  const { db, restaurantId } = auth;
  const [{ data: restaurant }, { data: links, error }, menu] = await Promise.all([
    db.from("restaurants").select("name, slug").eq("id", restaurantId).single(),
    db.from("merchant_payment_links").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100),
    getMenuItems(db, restaurantId),
  ]);
  if (error || !restaurant) return NextResponse.json({ error: "Unable to load payment links." }, { status: 500 });
  const ids = (links ?? []).map((link) => link.id);
  const { data: payments, error: paymentError } = ids.length
    ? await db.from("payments").select("payment_link_id, order_id, paystack_status, monnify_status").eq("restaurant_id", restaurantId).in("payment_link_id", ids)
    : { data: [], error: null };
  if (paymentError) return NextResponse.json({ error: "Unable to check payment status." }, { status: 500 });
  return NextResponse.json({ restaurant, menu, links: (links ?? []).map((link) => {
    // A retried link has several attempts; only the live/paid one names an order.
    const attempts = payments?.filter((row) => row.payment_link_id === link.id) ?? [];
    return { id: link.id, customerName: link.customer_name, items: link.items, subtotalKobo: link.subtotal_kobo, createdAt: link.created_at, expiresAt: link.expires_at, status: paymentLinkStatus(link, attempts), orderId: livePaymentLinkPayment(attempts)?.order_id ?? null, url: paymentLinkUrl(request, restaurant.slug, link.token) };
  }) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await paymentLinkMerchant(request);
  if (auth.error) return auth.error;
  const { db, restaurantId, userId } = auth;
  if (isRateLimited("create-payment-link", userId, { max: 30, windowMs: 60_000 })) return NextResponse.json({ error: "Please wait a moment before creating another link." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the order items and quantities." }, { status: 422 });
  const { data: restaurant } = await db.from("restaurants").select("slug, is_active").eq("id", restaurantId).single();
  if (!restaurant?.is_active) return NextResponse.json({ error: "This restaurant is not active." }, { status: 409 });
  const { data: existing, error: existingError } = await db.from("merchant_payment_links").select("id, token").eq("restaurant_id", restaurantId).eq("request_key", parsed.data.requestKey).maybeSingle();
  if (existingError) return NextResponse.json({ error: "Unable to create a payment link." }, { status: 500 });
  if (existing) return NextResponse.json({ id: existing.id, url: paymentLinkUrl(request, restaurant.slug, existing.token) });
  let items;
  try { items = pricePaymentLinkItems(parsed.data.items, await getMenuItems(db, restaurantId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to check the menu." }, { status: 409 }); }
  const { data: link, error } = await db.from("merchant_payment_links").insert({
    restaurant_id: restaurantId, created_by: userId, request_key: parsed.data.requestKey,
    customer_name: parsed.data.customerName, items: items as unknown as Json,
    subtotal_kobo: items.reduce((sum, item) => sum + item.priceKobo * item.quantity, 0),
  }).select("id, token").single();
  if (error?.code === "23505") {
    const { data: retried } = await db.from("merchant_payment_links").select("id, token").eq("restaurant_id", restaurantId).eq("request_key", parsed.data.requestKey).single();
    if (retried) return NextResponse.json({ id: retried.id, url: paymentLinkUrl(request, restaurant.slug, retried.token) });
  }
  if (error || !link) return NextResponse.json({ error: "Unable to create a payment link. Please retry." }, { status: 500 });
  return NextResponse.json({ id: link.id, url: paymentLinkUrl(request, restaurant.slug, link.token) }, { status: 201 });
}
