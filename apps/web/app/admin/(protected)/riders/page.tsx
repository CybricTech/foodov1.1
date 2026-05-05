import { createServiceClient } from "@/lib/supabase/server";
import { RidersClient } from "@/components/admin/riders-client";

export const dynamic = "force-dynamic";

export default async function AdminRidersPage() {
  const supabase = createServiceClient();

  const [{ data: ridersData }, { data: activeDeliveries }] = await Promise.all([
    supabase
      .from("platform_riders")
      .select(
        `
        id,
        user_id,
        is_online,
        is_active,
        active_deliveries,
        total_deliveries,
        last_seen_at,
        user_profiles!inner (full_name, phone, vehicle_type)
      `
      )
      .order("last_seen_at", { ascending: false }),

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
  ]);

  return (
    <RidersClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialRiders={(ridersData as unknown as any[]) ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDeliveries={(activeDeliveries as unknown as any[]) ?? []}
    />
  );
}
