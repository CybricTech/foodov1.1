import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    customerId: string;
    restaurantId: string;
    address: string;
    label?: string;
    isDefault?: boolean;
  };

  const { customerId, restaurantId, address, label, isDefault } = body;

  if (!customerId || !restaurantId || !address) {
    return NextResponse.json(
      { error: "customerId, restaurantId and address are required" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("customer_addresses")
    .upsert(
      {
        customer_id: customerId,
        restaurant_id: restaurantId,
        address,
        label: label || null,
        is_default: isDefault ?? false,
      },
      { onConflict: "customer_id, address" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[save-address] error:", error);
    return NextResponse.json({ error: "Failed to save address" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
