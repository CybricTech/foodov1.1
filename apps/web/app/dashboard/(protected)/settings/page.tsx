import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/dashboard/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const [{ data: restaurant }, { data: agreement }] = await Promise.all([
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
  ]);

  return <SettingsClient restaurant={restaurant!} agreement={agreement ?? null} />;
}
