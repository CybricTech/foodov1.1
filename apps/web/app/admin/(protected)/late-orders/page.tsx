import { createServiceClient } from "@/lib/supabase/server";
import { LateOrdersClient } from "@/components/admin/late-orders-client";

export const dynamic = "force-dynamic";

export default async function AdminLateOrdersPage() {
  const supabase = createServiceClient();

  const { data: lateOrders } = await supabase
    .from("orders")
    .select(`
      id, order_number, status, fulfillment_type,
      customer_name, customer_phone,
      created_at, estimated_delivery_at, late_at,
      total_kobo,
      restaurants!inner (id, name, slug)
    `)
    .not("late_at", "is", null)
    .in("status", [
      "pending",
      "confirmed",
      "preparing",
      "ready_for_pickup",
      "assigned_to_rider",
      "in_transit",
    ])
    .order("late_at", { ascending: true });

  return <LateOrdersClient orders={lateOrders ?? []} />;
}
