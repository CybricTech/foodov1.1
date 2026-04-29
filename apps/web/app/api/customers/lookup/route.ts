import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const restaurantId = searchParams.get("restaurantId");

  if (!phone || !restaurantId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, email")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) return NextResponse.json({});

  const { data: addresses } = await supabase
    .from("customer_addresses")
    .select("id, address, label, is_default")
    .eq("customer_id", customer.id)
    .eq("restaurant_id", restaurantId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return NextResponse.json({
    full_name: customer.full_name,
    email: customer.email,
    addresses: addresses ?? [],
  });
}
