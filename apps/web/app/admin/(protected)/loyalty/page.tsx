import { createServiceClient } from "@/lib/supabase/server";
import { LoyaltyTestClient } from "@/components/admin/loyalty-test-client";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyTestPage() {
  // Layout gates super_admin. Offer the test merchants first (Copper Pot), then
  // any other restaurant with a loyalty program.
  const supabase = createServiceClient();
  const { data: programs } = await supabase
    .from("loyalty_programs")
    .select("restaurant_id, is_active, restaurants(name, is_test)")
    .order("created_at", { ascending: false });

  const restaurants = (programs ?? [])
    .map((p) => {
      const r = p.restaurants as unknown as { name: string; is_test: boolean } | null;
      return {
        id: p.restaurant_id as string,
        name: r?.name ?? "Unknown",
        isTest: r?.is_test ?? false,
        active: p.is_active as boolean,
      };
    })
    .sort((a, b) => Number(b.isTest) - Number(a.isTest));

  return <LoyaltyTestClient restaurants={restaurants} />;
}
