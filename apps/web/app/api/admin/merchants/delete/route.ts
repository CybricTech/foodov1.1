import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

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

  const { restaurantId } = await request.json();

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  // Find all auth users tied to this restaurant so we can delete them
  const { data: profiles } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("restaurant_id", restaurantId);

  // Delete the restaurant (FK cascades handle related rows)
  const { error: deleteError } = await serviceClient
    .from("restaurants")
    .delete()
    .eq("id", restaurantId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Delete Supabase Auth users (fire-and-forget, profiles already cascade-deleted)
  if (profiles?.length) {
    await Promise.all(
      profiles.map((p) => serviceClient.auth.admin.deleteUser(p.id))
    );
  }

  // Audit log
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "delete_merchant",
    target_type: "restaurant",
    target_id: restaurantId,
    metadata: {},
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "merchant deleted",
    properties: { restaurant_id: restaurantId },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
