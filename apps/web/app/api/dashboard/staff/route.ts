import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
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

  // Fetch the staff user for this restaurant (max 1)
  const { data: staffUsers, error } = await serviceClient
    .from("user_profiles")
    .select("id, email, full_name, is_active")
    .eq("restaurant_id", restaurantId)
    .eq("role", "merchant_staff")
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const staff = staffUsers && staffUsers.length > 0 ? staffUsers[0] : null;

  return NextResponse.json({ staff });
}
