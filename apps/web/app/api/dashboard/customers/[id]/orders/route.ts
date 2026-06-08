import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/supabase/get-request-user";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth check — accepts a mobile Bearer token OR the web cookie session.
  const user = await getRequestUser(request);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bearer requests carry no cookie-backed RLS session, so use the service
  // client for the lookups below (each is scoped to the caller's own
  // restaurant_id, mirroring the Phase 1 dashboard routes).
  const supabase = createServiceClient();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["merchant_owner", "merchant_staff"].includes(profile.role) ||
    !profile.restaurant_id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the customer belongs to this merchant's restaurant
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("phone, restaurant_id")
    .eq("id", params.id)
    .eq("restaurant_id", profile.restaurant_id)
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      status,
      fulfillment_type,
      customer_name,
      customer_phone,
      subtotal_kobo,
      vat_kobo,
      delivery_fee_kobo,
      service_fee_kobo,
      total_kobo,
      created_at,
      delivery_address,
      special_instructions,
      payment_status,
      order_items (
        id,
        item_name,
        quantity,
        item_price_kobo,
        line_total_kobo,
        selected_options
      )
    `
    )
    .eq("customer_phone", customer.phone)
    .eq("restaurant_id", profile.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
