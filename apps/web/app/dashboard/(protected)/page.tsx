import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderQueueClient } from "@/components/dashboard/order-queue-client";
import type { Database } from "@foodo/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  vat_kobo: number;
  service_fee_kobo: number;
  total_kobo: number;
  order_items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    line_total_kobo: number;
    selected_options: unknown;
  }>;
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  // Use service client so the fetch is never blocked by RLS —
  // access control is already enforced by getDashboardUser() above.
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
    console.error("[dashboard] orders fetch error:", error.message);
  }

  return (
    <OrderQueueClient
      restaurantId={restaurantId}
      initialOrders={(orders as unknown as OrderRow[]) ?? []}
    />
  );
}
