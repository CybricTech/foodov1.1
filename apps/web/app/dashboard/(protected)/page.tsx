import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = createServiceClient();
  const { restaurantId } = session;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug, accepts_orders")
    .eq("id", restaurantId)
    .single();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, fulfillment_type, customer_name, total_kobo, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .neq("status", "cancelled")
    .eq("payment_status", "paid")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  return (
    <DashboardHomeClient
      restaurant={restaurant}
      initialOrders={orders ?? []}
    />
  );
}
