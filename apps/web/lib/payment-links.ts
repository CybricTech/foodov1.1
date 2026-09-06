import { NextRequest, NextResponse } from "next/server";
import { getMenuItems, type Database, type TypedSupabaseClient } from "@foodo/database";
import { livePaymentLinkPayment, paymentLinkStatus, pricePaymentLinkItems, type PaymentLinkLine } from "@foodo/utils";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { createServiceClient } from "@/lib/supabase/server";
import { classifyHost, storefrontUrl } from "@/lib/site";

export type PaymentLink = Database["public"]["Tables"]["merchant_payment_links"]["Row"];
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function paymentLinkMerchant(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Sign in to create payment links." }, { status: 401 }) };
  const db = createServiceClient();
  const { data: profile } = await db.from("user_profiles").select("role, restaurant_id, is_active").eq("id", user.id).single();
  if (!profile?.restaurant_id || !profile.is_active || !["merchant_owner", "merchant_staff"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "You do not have access to payment links." }, { status: 403 }) };
  }
  return { db, restaurantId: profile.restaurant_id, userId: user.id };
}

export function paymentLinkUrl(request: NextRequest, slug: string, token: string) {
  const host = classifyHost(request.nextUrl.host);
  return host.role === "unknown" || host.role === "staging"
    ? `${request.nextUrl.origin}/${slug}/pay/${token}`
    : storefrontUrl(slug, `/pay/${token}`);
}

export async function readPaymentLink(db: TypedSupabaseClient, token: string, restaurantId: string) {
  if (!UUID_PATTERN.test(token)) return null;
  const { data: link, error } = await db.from("merchant_payment_links").select("*").eq("token", token).eq("restaurant_id", restaurantId).maybeSingle();
  if (error) throw new Error("Unable to load the payment link. Please try again.");
  if (!link) return null;
  // Ordered newest-first: a link can carry several refused attempts, and the
  // resume screen should describe the most recent one.
  const { data: payments, error: paymentError } = await db.from("payments").select("id, order_id, paystack_status, monnify_status, metadata, amount_kobo, paystack_ref, monnify_ref, payment_provider").eq("payment_link_id", link.id).eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
  if (paymentError) throw new Error("Unable to check payment status. Please try again.");
  const attempts = payments ?? [];
  // `payment` is the one that can still take money (or already did). Null once
  // every attempt was refused, which is what reopens the link for a retry —
  // callers gate on it to decide between resuming and starting over.
  return { link, attempts, payment: livePaymentLinkPayment(attempts), status: paymentLinkStatus(link, attempts) };
}

export async function verifyPaymentLinkItems(db: TypedSupabaseClient, link: PaymentLink): Promise<PaymentLinkLine[]> {
  const stored = link.items as unknown as PaymentLinkLine[];
  const menu = await getMenuItems(db, link.restaurant_id);
  const current = pricePaymentLinkItems(stored, menu);
  // Don't silently change the price agreed in a merchant's conversation.
  if (current.some((line, index) => line.priceKobo !== stored[index].priceKobo)) {
    throw new Error("The menu price has changed. Please ask the restaurant for a new payment link.");
  }
  return current;
}
