import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { restaurantId, isActive } = await request.json();

  await serviceClient
    .from("restaurants")
    .update({ is_active: isActive, accepts_orders: isActive })
    .eq("id", restaurantId);

  // Audit log
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: isActive ? "activate_merchant" : "pause_merchant",
    target_type: "restaurant",
    target_id: restaurantId,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
