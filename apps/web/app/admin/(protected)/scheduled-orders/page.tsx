import { createServiceClient } from "@/lib/supabase/server";
import {
  ScheduledOrdersClient,
  type ScheduledOrderRow,
} from "@/components/admin/scheduled-orders-client";

export const dynamic = "force-dynamic";

export default async function AdminScheduledOrdersPage() {
  const supabase = createServiceClient();

  // Every booked-ahead order across every real merchant (is_test excluded,
  // same rule as Live Ops), oldest slot first — the order an operator would
  // want to review/intervene on next.
  const { data: orders } = await supabase
    .from("orders")
    .select(
      `
      id, order_number, status, payment_status, fulfillment_type,
      customer_name, customer_phone, total_kobo, created_at,
      scheduled_for, activated_at, cancellation_reason,
      restaurants!inner (id, name, slug, logo_url, is_test)
    `
    )
    .not("scheduled_for", "is", null)
    .order("scheduled_for", { ascending: true })
    .limit(500);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const real = ((orders ?? []) as any[]).filter((o) => !o.restaurants?.is_test);

  return <ScheduledOrdersClient initialOrders={real as ScheduledOrderRow[]} />;
}
