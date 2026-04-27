import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "super_admin") return null;

  return { user, serviceClient };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const customerId = params.id;

  // Look up the customer to get their phone + restaurant_id,
  // since orders are linked by customer_phone, not customer_id FK.
  const { data: customer, error: customerError } = await auth.serviceClient
    .from("customers")
    .select("phone, restaurant_id")
    .eq("id", customerId)
    .single();

  if (customerError || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const { data, error } = await auth.serviceClient
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
    .eq("restaurant_id", customer.restaurant_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
