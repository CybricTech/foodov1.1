import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.restaurant_id || profile.role !== "merchant_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { latitude, longitude, max_delivery_radius_km } = body as {
    latitude?: number;
    longitude?: number;
    max_delivery_radius_km?: number | null;
  };

  if (latitude === undefined || longitude === undefined) {
    return NextResponse.json({ error: "latitude and longitude are required" }, { status: 400 });
  }

  const { error } = await serviceClient
    .from("restaurants")
    .update({
      latitude,
      longitude,
      max_delivery_radius_km: max_delivery_radius_km ?? null,
    })
    .eq("id", profile.restaurant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
