import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { userId, isActive } = await request.json();

  await serviceClient
    .from("user_profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (!isActive) {
    // Force offline when suspending
    await serviceClient
      .from("platform_riders")
      .update({ is_online: false })
      .eq("user_id", userId);
  }

  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: isActive ? "approve_rider" : "suspend_rider",
    target_type: "user",
    target_id: userId,
    metadata: {},
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: isActive ? "rider approved" : "rider suspended",
    properties: { rider_user_id: userId },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
