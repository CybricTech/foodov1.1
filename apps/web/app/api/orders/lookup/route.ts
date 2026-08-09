import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientIp, isRateLimited } from "@/lib/api/rate-limit";

/**
 * "Track your order" phone lookup for the storefront.
 *
 * Previously a direct browser query against `orders`, which relied on the
 * `USING (true)` SELECT policy — so the same request could just as easily drop
 * the phone filter and enumerate the whole table. Now server-side on the
 * service client, scoped to one restaurant and one phone number, and rate
 * limited because phone numbers are guessable in a way order UUIDs are not.
 */
const PAGE_SIZE = 20;
const RECENT_DELIVERED_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited("order-lookup", ip, { max: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get("restaurantId");
  const phones = searchParams.getAll("phone").filter(Boolean);

  if (!restaurantId || phones.length === 0) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const oneDayAgo = new Date(Date.now() - RECENT_DELIVERED_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, fulfillment_type, customer_name, total_kobo, created_at, delivery_address"
    )
    .eq("restaurant_id", restaurantId)
    .in("customer_phone", phones)
    .or(
      `and(status.neq.cancelled,status.neq.delivered),and(status.eq.delivered,created_at.gte.${oneDayAgo})`
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("[api/orders/lookup] error:", error.message);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }

  return NextResponse.json(
    { orders: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
