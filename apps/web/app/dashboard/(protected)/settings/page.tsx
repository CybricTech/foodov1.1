import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/dashboard/settings-client";
import { getRiderContactStatus } from "@/lib/delivery/rider-contact";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const [{ data: restaurant }, { data: agreement }, riderContact] = await Promise.all([
    supabase
      .from("restaurants")
      .select("*")
      .eq("id", restaurantId)
      .single(),
    supabase
      .from("merchant_agreements")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Service client: whether the rider-contact rollout includes this store
    // lives in platform_settings, which a merchant session can't read.
    getRiderContactStatus(createServiceClient(), restaurantId),
  ]);

  return (
    <SettingsClient
      restaurant={restaurant!}
      agreement={agreement ?? null}
      riderContact={riderContact}
    />
  );
}
