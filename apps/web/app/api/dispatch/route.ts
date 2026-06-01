import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

const DispatchSchema = z.object({
  orderId: z.string().uuid(),
  mode: z.enum(["platform_rider", "own_rider", "third_party"]).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = DispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { orderId, mode } = parsed.data;

  // Verify merchant owns the order's restaurant
  const { data: order } = await supabase
    .from("orders")
    .select("restaurant_id")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["merchant_owner", "merchant_staff"].includes(profile.role) ||
    profile.restaurant_id !== order.restaurant_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Call dispatch Edge Function
  const dispatchRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dispatch-order`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ orderId, dispatchMode: mode }),
    }
  );

  const data = await dispatchRes.json();

  if (dispatchRes.ok) {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: user.id,
      event: "order dispatched",
      properties: {
        order_id: orderId,
        restaurant_id: order.restaurant_id,
        dispatch_mode: mode ?? "platform_rider",
      },
    });
    await posthog.shutdown();
  }

  return NextResponse.json(data, { status: dispatchRes.ok ? 200 : 502 });
}
