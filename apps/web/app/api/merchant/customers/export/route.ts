import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { koboToNGN } from "@foodo/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get("restaurantId");

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Verify authenticated merchant owns this restaurant
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id, role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["merchant_owner", "merchant_staff"].includes(profile.role) ||
    profile.restaurant_id !== restaurantId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("full_name, phone, email, total_orders, total_spent_kobo, first_order_at, last_order_at, notes")
    .eq("restaurant_id", restaurantId)
    .order("total_spent_kobo", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build CSV
  const header = "Name,Phone,Email,Total Orders,Total Spent (NGN),First Order,Last Order,Notes\n";
  const rows = (customers ?? [])
    .map((c) => {
      const cells = [
        c.full_name ?? "",
        c.phone,
        c.email ?? "",
        c.total_orders.toString(),
        koboToNGN(c.total_spent_kobo).toFixed(2),
        c.first_order_at ? new Date(c.first_order_at).toLocaleDateString() : "",
        c.last_order_at ? new Date(c.last_order_at).toLocaleDateString() : "",
        (c.notes ?? "").replace(/,/g, ";"),
      ];
      return cells.map((cell) => `"${cell}"`).join(",");
    })
    .join("\n");

  const csv = header + rows;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="customers-${Date.now()}.csv"`,
    },
  });
}
