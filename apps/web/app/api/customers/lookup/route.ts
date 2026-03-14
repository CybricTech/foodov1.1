import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const restaurantId = searchParams.get("restaurantId");

  if (!phone || !restaurantId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = await createServerClient();

  const { data } = await supabase
    .from("customers")
    .select("full_name, email")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();

  if (!data) return NextResponse.json({});

  return NextResponse.json({
    full_name: data.full_name,
    email: data.email,
  });
}
