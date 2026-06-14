import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MarketingClient } from "@/components/dashboard/marketing-client";
import type { Discount, LoyaltyProgram } from "@foodo/database";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    { data: discounts },
    { data: restaurant },
    { count: allCount },
    { count: inactive30Count },
    { count: vipCount },
    { data: loyaltyProgram },
  ] = await Promise.all([
    supabase
      .from("discounts")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("restaurants")
      .select("name, sms_sender_id, sms_sender_status")
      .eq("id", restaurantId)
      .single(),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .or(`last_order_at.is.null,last_order_at.lt.${thirtyDaysAgo.toISOString()}`),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .gte("total_orders", 3),
    supabase
      .from("loyalty_programs")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  return (
    <MarketingClient
      restaurantId={restaurantId}
      initialDiscounts={(discounts ?? []) as Discount[]}
      senderStatus={
        restaurant?.sms_sender_status as "pending" | "approved" | "rejected" | null
      }
      senderName={restaurant?.sms_sender_id ?? null}
      customerCounts={{
        all: allCount ?? 0,
        inactive30: inactive30Count ?? 0,
        vip: vipCount ?? 0,
      }}
      loyaltyProgram={(loyaltyProgram as LoyaltyProgram | null) ?? null}
    />
  );
}
