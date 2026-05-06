import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "assigned_to_rider",
  "in_transit",
  "ready",
  "delivered",
  "completed",
  "cancelled",
];

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Verify caller is merchant_owner or merchant_staff
  const { data: callerProfile } = await serviceClient
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

  // Parse body
  let body: { orderId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderId, status } = body;

  if (!orderId || typeof orderId !== "string") {
    return NextResponse.json(
      { error: "orderId is required" },
      { status: 400 }
    );
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Look up the order so we can enforce the platform-rider rule:
  // once an order is being handled by a Foodo platform rider, only the admin
  // riders page may complete it. Merchants can manage everything else.
  const { data: order, error: lookupError } = await serviceClient
    .from("orders")
    .select("id, dispatch_type, status")
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId)
    .single();

  if (lookupError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const PLATFORM_RIDER_LOCKED_TARGETS = new Set(["in_transit", "delivered", "completed"]);
  if (
    order.dispatch_type === "platform_rider" &&
    PLATFORM_RIDER_LOCKED_TARGETS.has(status)
  ) {
    return NextResponse.json(
      {
        error:
          "This order is assigned to a Foodo platform rider. Only the admin riders page can mark it delivered.",
      },
      { status: 403 }
    );
  }

  // Update the order — only allow updating orders that belong to this restaurant
  const { error: updateError } = await serviceClient
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .eq("restaurant_id", restaurantId);

  if (updateError) {
    console.error("[api/dashboard/orders/update-status] error:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
