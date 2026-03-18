import { createServiceClient } from "@/lib/supabase/server";
import { DisputesClient } from "@/components/admin/disputes-client";

export const dynamic = "force-dynamic";

export default async function AdminDisputesPage() {
  const supabase = createServiceClient();

  const { data: cancelledOrders } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, customer_name, customer_phone,
      total_kobo, cancellation_reason, created_at, restaurant_id,
      restaurants(name)
    `
    )
    .eq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(200);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <DisputesClient initialOrders={(cancelledOrders as unknown as any[]) ?? []} />;
}
