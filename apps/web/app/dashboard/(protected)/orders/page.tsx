import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderQueueClient } from "@/components/dashboard/order-queue-client";

export const dynamic = "force-dynamic";

export default async function DashboardOrdersPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = createServiceClient();
  const { restaurantId } = session;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, status, payment_status, fulfillment_type,
      customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
      vat_kobo, service_fee_kobo, total_kobo, created_at,
      special_instructions, delivery_address,
      order_items (id, item_name, quantity, line_total_kobo, selected_options)
    `
    )
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[dashboard/orders] orders fetch error:", error.message);
  }

  return (
    <OrderQueueClient
      restaurantId={restaurantId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={(orders ?? []) as any}
    />
  );
}
