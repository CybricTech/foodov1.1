import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

const ResetPasswordSchema = z.object({
  restaurantId: z.string().uuid(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

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

  const { restaurantId, newPassword } = parsed.data;

  const { data: ownerProfile } = await serviceClient
    .from("user_profiles")
    .select("id, email")
    .eq("restaurant_id", restaurantId)
    .eq("role", "merchant_owner")
    .single();

  if (!ownerProfile) {
    return NextResponse.json(
      { error: "No owner found for this merchant" },
      { status: 404 }
    );
  }

  const { error: updateError } =
    await serviceClient.auth.admin.updateUserById(ownerProfile.id, {
      password: newPassword,
    });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  await serviceClient.from("audit_logs").insert({
    actor_id: user.id,
    action: "reset_merchant_password",
    target_type: "user",
    target_id: ownerProfile.id,
    metadata: {
      restaurant_id: restaurantId,
      owner_email: ownerProfile.email,
    } as import("@foodo/database").Json,
  });

  return NextResponse.json({ ok: true, email: ownerProfile.email });
}
