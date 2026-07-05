import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getPostHogClient } from "@/lib/posthog";

/**
 * Pull a scheduled order forward into the live kitchen queue NOW.
 * One column flip — activated_at = now() — after which the order shows in
 * "New" on every surface (shared bucket predicate in @foodo/utils).
 * Bearer-or-cookie auth, same convention as update-status/dispatch.
 */
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile ||
    !["merchant_owner", "merchant_staff"].includes(callerProfile.role)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurantId = callerProfile.restaurant_id;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "No restaurant associated with this account" },
      { status: 400 }
    );
  }

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, scheduled_for, activated_at")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const o = order as unknown as {
    status: string;
    scheduled_for: string | null;
    activated_at: string | null;
  };
  if (!o.scheduled_for) {
    return NextResponse.json(
      { error: "This order was not scheduled" },
      { status: 400 }
    );
  }
  if (o.activated_at) {
    return NextResponse.json(
      { error: "This order is already in the live queue" },
      { status: 400 }
    );
  }
  if (o.status === "cancelled") {
    return NextResponse.json(
      { error: "This order was cancelled" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ activated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  if (updateError) {
    console.error("[api/dashboard/orders/activate-now] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to start the order" },
      { status: 500 }
    );
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "scheduled order pulled forward",
    properties: {
      order_id: orderId,
      restaurant_id: restaurantId,
      scheduled_for: o.scheduled_for,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
