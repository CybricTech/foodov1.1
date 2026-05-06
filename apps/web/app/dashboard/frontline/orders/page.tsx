import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FrontlineOrdersClient } from "@/components/dashboard/frontline-orders-client";

export const dynamic = "force-dynamic";

export default async function FrontlineOrdersPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = createServiceClient();
  const { restaurantId } = session;

  // Fetch the recent rows (limited for display) AND a separate exact count of
  // every delivered order so the "Completed" column count is the real total
  // instead of capping at the row limit.
  const [
    { data: orders, error },
    { count: completedTotal, error: countError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `
        id, order_number, status, payment_status, fulfillment_type,
        customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
        vat_kobo, service_fee_kobo, total_kobo, created_at,
        special_instructions, delivery_address, dispatch_type,
        order_items (id, item_name, quantity, line_total_kobo, selected_options)
      `
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "delivered"),
  ]);

  if (error) {
    console.error("[frontline/orders] orders fetch error:", error.message);
  }
  if (countError) {
    console.error("[frontline/orders] completed count error:", countError.message);
  }

  return (
    <FrontlineOrdersClient
      restaurantId={restaurantId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders ?? []) as any}
      initialCompletedTotal={completedTotal ?? 0}
    />
  );
}
