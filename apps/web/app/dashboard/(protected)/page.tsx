import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderQueueClient } from "@/components/dashboard/order-queue-client";
import type { Database } from "@foodo/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
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

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const { data: orders } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, status, payment_status, fulfillment_type,
      customer_name, customer_phone, total_kobo, created_at,
      special_instructions, delivery_address,
      order_items (id, item_name, quantity, line_total_kobo, selected_options)
    `
    )
    .eq("restaurant_id", restaurantId)
    .gte(
      "created_at",
      new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    )
    .order("created_at", { ascending: false });

  return (
    <OrderQueueClient
      restaurantId={restaurantId}
      initialOrders={(orders as unknown as OrderRow[]) ?? []}
    />
  );
}
