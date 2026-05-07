import { createServiceClient } from "@/lib/supabase/server";
import { RidersClient } from "@/components/admin/riders-client";

export const dynamic = "force-dynamic";

export default async function AdminRidersPage() {
  const supabase = createServiceClient();

  const [{ data: activeDeliveries }, { data: history }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        total_kobo,
        created_at,
        restaurants (name)
      `
      )
      .eq("status", "assigned_to_rider")
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_fee_kobo,
        delivery_cost_kobo,
        delivery_distance_km,
        total_kobo,
        delivered_at,
        updated_at,
        created_at,
        restaurants (name),
        delivery_assignments (assigned_at)
      `
      )
      .eq("dispatch_type", "platform_rider")
      .eq("status", "delivered")
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <RidersClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={(activeDeliveries as unknown as any[]) ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialHistory={(history as unknown as any[]) ?? []}
    />
  );
}
