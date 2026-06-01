import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getPostHogClient } from "@/lib/posthog";

const CreateStaffSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
});

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();

  // Auth check — must be logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const parsed = CreateStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { email, password, fullName } = parsed.data;

  // Check max 1 staff per merchant
  const { data: existingStaff } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("role", "merchant_staff");

  if (existingStaff && existingStaff.length > 0) {
    return NextResponse.json(
      {
        error:
          "This restaurant already has a staff member. Only one staff account is allowed.",
      },
      { status: 409 }
    );
  }

  // Create Supabase Auth user
  const { data: authUser, error: authError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !authUser.user) {
    return NextResponse.json(
      { error: authError?.message ?? "Auth user creation failed" },
      { status: 500 }
    );
  }

  // Create user_profile for the staff member
  const { error: profileError } = await serviceClient
    .from("user_profiles")
    .insert({
      id: authUser.user.id,
      role: "merchant_staff",
      restaurant_id: restaurantId,
      email,
      full_name: fullName,
      is_active: true,
      phone: null,
      avatar_url: null,
      vehicle_type: null,
    });

  if (profileError) {
    // Roll back auth user if profile creation fails
    await serviceClient.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 }
    );
  }

  // Log audit
  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "create_staff",
    target_type: "user",
    target_id: authUser.user.id,
    metadata: {
      email,
      fullName,
      restaurant_id: restaurantId,
    } as import("@foodo/database").Json,
  });

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: user.id,
    event: "staff member created",
    properties: {
      restaurant_id: restaurantId,
      staff_user_id: authUser.user.id,
    },
  });
  await posthog.shutdown();

  return NextResponse.json({
    success: true,
    staff: {
      id: authUser.user.id,
      email,
      fullName,
    },
  });
}
