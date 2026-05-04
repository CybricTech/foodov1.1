import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    restaurantId,
    restaurant_base_fee_kobo,
    restaurant_per_km_rate_kobo,
    restaurant_max_fee_kobo,
    max_delivery_radius_km,
  } = body as {
    restaurantId: string;
    restaurant_base_fee_kobo?: number | null;
    restaurant_per_km_rate_kobo?: number | null;
    restaurant_max_fee_kobo?: number | null;
    max_delivery_radius_km?: number | null;
  };

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId is required" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    restaurant_base_fee_kobo: restaurant_base_fee_kobo ?? null,
    restaurant_per_km_rate_kobo: restaurant_per_km_rate_kobo ?? null,
    restaurant_max_fee_kobo: restaurant_max_fee_kobo ?? null,
    max_delivery_radius_km: max_delivery_radius_km ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient.from("restaurants") as any)
    .update(payload)
    .eq("id", restaurantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
