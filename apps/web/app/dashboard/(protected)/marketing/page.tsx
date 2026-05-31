import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MarketingClient } from "@/components/dashboard/marketing-client";
import type { Discount } from "@foodo/database";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const { data: discounts } = await supabase
    .from("discounts")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  return (
    <MarketingClient
      restaurantId={restaurantId}
      initialDiscounts={(discounts ?? []) as Discount[]}
    />
  );
}
