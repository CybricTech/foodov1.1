import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { readPaymentLink, UUID_PATTERN } from "@/lib/payment-links";
import { getClientIp, isRateLimited } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (isRateLimited("resume-payment-link", getClientIp(request), { max: 60, windowMs: 60_000 })) return NextResponse.json({ error: "Please wait a moment and try again." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (typeof body?.token !== "string" || typeof body?.restaurantId !== "string" || !UUID_PATTERN.test(body.token) || !UUID_PATTERN.test(body.restaurantId)) return NextResponse.json({ error: "Invalid payment link." }, { status: 400 });
  const found = await readPaymentLink(createServiceClient(), body.token, body.restaurantId);
  // A stale resume tab: the attempt it was tracking has since been refused, so
  // the link is back to accepting a fresh one. Say that rather than "no payment".
  if (found && !found.payment && found.attempts.length) return NextResponse.json({ error: "That payment was declined, so nothing was charged. Reopen the link to try again.", reopenPaymentLink: true }, { status: 409 });
  if (!found?.payment) return NextResponse.json({ error: "No payment has started for this link." }, { status: 404 });
  const { payment, link, status } = found;
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  // No new payment is created here. Even expired links can check/resume a
  // transaction already issued, because its bank-transfer reference can settle.
  return NextResponse.json({
    status, orderId: payment.order_id, totalKobo: payment.amount_kobo,
    provider: payment.payment_provider, reference: payment.paystack_ref || payment.monnify_ref,
    session: link.checkout_response,
    customerName: meta.customer_name, customerPhone: meta.customer_phone, customerEmail: meta.customer_email,
    deliveryAddress: meta.delivery_address, fulfillmentType: meta.fulfillment_type,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
