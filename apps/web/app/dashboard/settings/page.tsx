import { createServerClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/dashboard/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id")
    .eq("id", user!.id)
    .single();

  const restaurantId = profile!.restaurant_id!;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .single();

  return <SettingsClient restaurant={restaurant!} />;
}
