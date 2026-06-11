import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
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

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { newPassword } = parsed.data;

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

  // Update the staff user's password
  const { error: updateError } =
    await serviceClient.auth.admin.updateUserById(staffProfile.id, {
      password: newPassword,
    });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  // Log audit
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "reset_staff_password",
    target_type: "user",
    target_id: staffProfile.id,
    metadata: {
      email: staffProfile.email,
      restaurant_id: restaurantId,
    } as import("@foodo/database").Json,
  });

  return NextResponse.json({ success: true });
}
