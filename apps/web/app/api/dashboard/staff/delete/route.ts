import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";
import { getPostHogClient } from "@/lib/posthog";

export async function DELETE(request: NextRequest) {
  // Auth check — must be logged in
  const user = await getRequestUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Verify caller is a merchant_owner
  const { data: callerProfile } = await serviceClient
    .from("user_profiles")
    .select("role, restaurant_id")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "merchant_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const restaurantId = callerProfile.restaurant_id;
  if (!restaurantId) {
    return NextResponse.json(
      { error: "No restaurant associated with this account" },
      { status: 400 }
    );
  }

  // Find the merchant_staff user for this restaurant
  const { data: staffProfile } = await serviceClient
    .from("user_profiles")
    .select("id, email")
    .eq("restaurant_id", restaurantId)
    .eq("role", "merchant_staff")
    .single();

  if (!staffProfile) {
    return NextResponse.json(
      { error: "No staff user found for this restaurant" },
      { status: 404 }
    );
  }

  // Delete the auth user first (cascade-safe order: auth then profile)
  const { error: authDeleteError } =
    await serviceClient.auth.admin.deleteUser(staffProfile.id);

  if (authDeleteError) {
    return NextResponse.json(
      { error: authDeleteError.message },
      { status: 500 }
    );
  }

  // Delete the user_profile
  const { error: profileDeleteError } = await serviceClient
    .from("user_profiles")
    .delete()
    .eq("id", staffProfile.id);

  if (profileDeleteError) {
    return NextResponse.json(
      { error: profileDeleteError.message },
      { status: 500 }
    );
  }

  // Log audit
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "delete_staff",
    target_type: "user",
    target_id: staffProfile.id,
    metadata: {
      email: staffProfile.email,
      restaurant_id: restaurantId,
    } as import("@foodo/database").Json,
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "staff member deleted",
    properties: {
      restaurant_id: restaurantId,
      staff_user_id: staffProfile.id,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({ success: true });
}
