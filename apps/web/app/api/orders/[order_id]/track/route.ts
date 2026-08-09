import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientIp, isRateLimited } from "@/lib/api/rate-limit";

/**
 * Customer-facing read of a single order, for the storefront tracking page and
 * the active-order banner.
 *
 * This used to be a direct browser query against `orders`, which only worked
 * because the table carried a `USING (true)` SELECT policy — meaning anyone
 * with the (public) anon key could page through every order on the platform,
 * customer phone numbers and delivery addresses included. The policy is gone;
 * these reads now go through the service client here, where the order UUID is
 * the capability, and the response is limited to fields the customer's own
 * tracking UI renders. `customer_phone` is deliberately not returned.
 *
 * Side effect of the move: `order_items` used to come back empty on the
 * tracking page, because the nested select ran as anon and order_items has no
 * public policy. Reading server-side fixes that — items now render.
 */
const ORDER_FIELDS = [
  "id",
  "order_number",
  "status",
  "fulfillment_type",
  "total_kobo",
  "subtotal_kobo",
  "delivery_fee_kobo",
  "vat_kobo",
  "service_fee_kobo",
  "discount_kobo",
  "discount_code",
  "special_instructions",
  "delivery_address",
  "cancellation_reason",
  "created_at",
  "estimated_delivery_at",
  "scheduled_for",
  "activated_at",
].join(", ");

export async function GET(
  request: NextRequest,
  { params }: { params: { order_id: string } }
) {
  const ip = getClientIp(request);
  // Generous: the tracking page polls this every 12s per open tab.
  if (isRateLimited("order-track", ip, { max: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const orderId = params.order_id;
  if (!orderId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `${ORDER_FIELDS}, order_items (id, item_name, item_price_kobo, quantity, line_total_kobo)`
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[api/orders/track] error:", error.message);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
