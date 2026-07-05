import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FrontlineOrdersClient } from "@/components/dashboard/frontline-orders-client";
import { normalizeSchedulingSettings, type OpeningHours } from "@foodo/utils";

export const dynamic = "force-dynamic";

const ORDER_SELECT = `
  id, order_number, status, payment_status, fulfillment_type,
  customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
  vat_kobo, service_fee_kobo, discount_kobo, discount_code, total_kobo, created_at,
  special_instructions, delivery_address, dispatch_type,
  scheduled_for, activated_at,
  order_items (id, item_name, quantity, line_total_kobo, selected_options, menu_items (prep_time_minutes))
`;

export default async function FrontlineOrdersPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = createServiceClient();
  const { restaurantId } = session;

  // Fetch the recent rows (limited for display) AND a separate exact count of
  // every delivered order so the "Completed" column count is the real total
  // instead of capping at the row limit. Scheduled pre-orders are fetched
  // separately: one can be booked days ahead, so on a busy board it would age
  // out of the newest-200 window long before its slot arrives.
  const [
    { data: orders, error },
    { count: completedTotal, error: countError },
    { data: scheduledOrders, error: scheduledError },
    { data: restaurantRow },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "delivered"),
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .not("scheduled_for", "is", null)
      .is("activated_at", null)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_for", { ascending: true }),
    supabase
      .from("restaurants")
      .select("opening_hours, scheduling_settings")
      .eq("id", restaurantId)
      .single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
  ]);

  if (error) {
    console.error("[frontline/orders] orders fetch error:", error.message);
  }
  if (countError) {
    console.error("[frontline/orders] completed count error:", countError.message);
  }
  if (scheduledError) {
    console.error("[frontline/orders] scheduled fetch error:", scheduledError.message);
  }

  // Merge (scheduled rows may overlap the newest-200 window).
  const seen = new Set<string>();
  const merged = [...(orders ?? []), ...(scheduledOrders ?? [])].filter((o) => {
    const id = (o as { id: string }).id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const schedulingSettings = normalizeSchedulingSettings(
    restaurantRow?.["scheduling_settings"]
  );

  return (
    <FrontlineOrdersClient
      restaurantId={restaurantId}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialOrders={merged as any}
      initialCompletedTotal={completedTotal ?? 0}
      schedulingSettings={schedulingSettings}
      openingHours={(restaurantRow?.["opening_hours"] ?? null) as OpeningHours | null}
    />
  );
}
