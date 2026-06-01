import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { order_id, delivery_cost_kobo } = body as {
    order_id?: string;
    delivery_cost_kobo?: number;
  };
  if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  if (
    typeof delivery_cost_kobo !== "number" ||
    !Number.isFinite(delivery_cost_kobo) ||
    !Number.isInteger(delivery_cost_kobo) ||
    delivery_cost_kobo < 0
  ) {
    return NextResponse.json(
      { error: "delivery_cost_kobo must be a non-negative integer (in kobo)" },
      { status: 400 }
    );
  }

  const deliveredAt = new Date().toISOString();

  const { error } = await serviceClient
    .from("orders")
    .update({ status: "delivered", delivery_cost_kobo, delivered_at: deliveredAt })
    .eq("id", order_id)
    .eq("status", "assigned_to_rider");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await serviceClient
    .from("delivery_assignments")
    .update({ status: "delivered", delivered_at: deliveredAt })
    .eq("order_id", order_id);

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "order delivered",
    properties: {
      order_id,
      delivery_cost_kobo: delivery_cost_kobo,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ ok: true });
}
