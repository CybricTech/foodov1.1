import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug, accepts_orders, closure_message, closure_message_history")
    .eq("id", restaurantId)
    .single();

  // "What's New" — published changelog entries + this user's last-seen marker.
  const [{ data: changelogEntries }, { data: profile }] = await Promise.all([
    supabase
      .from("changelog_entries")
      .select("id, title, body, tag, image_url, version_label, published_at")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_profiles")
      .select("last_seen_changelog_at")
      .eq("id", session.userId)
      .maybeSingle(),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, fulfillment_type, customer_name, special_instructions, total_kobo, created_at"
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
      userId={session.userId}
      changelogEntries={changelogEntries ?? []}
      changelogLastSeenAt={profile?.last_seen_changelog_at ?? null}
    />
  );
}
