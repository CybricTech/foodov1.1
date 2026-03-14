import { createServiceClient } from "@/lib/supabase/server";
import { RidersClient } from "@/components/admin/riders-client";

export const dynamic = "force-dynamic";

export default async function AdminRidersPage() {
  const supabase = createServiceClient();

  const { data: ridersData } = await supabase
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
    .order("last_seen_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <RidersClient initialRiders={(ridersData as unknown as any[]) ?? []} />;
}
