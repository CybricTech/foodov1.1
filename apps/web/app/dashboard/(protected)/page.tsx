import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";
import type { OpeningHours, WrappedEdition } from "@foodo/utils";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, slug, accepts_orders, closure_message, closure_message_history, opening_hours")
    .eq("id", restaurantId)
    .single();

  // "What's New" + Kitchyn Wrapped — latest entries/edition + this user's
  // last-seen markers (the header pills show an unread dot from these).
  const [{ data: changelogEntries }, { data: profile }, { data: wrapped }] = await Promise.all([
    supabase
      .from("changelog_entries")
      .select("id, title, body, tag, image_url, version_label, published_at")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_profiles")
      .select("last_seen_changelog_at, last_seen_wrapped_key")
      .eq("id", session.userId)
      .maybeSingle(),
    supabase
      .from("merchant_wrapped")
      .select("period_key, scope, stats")
      .eq("restaurant_id", restaurantId)
      .not("published_at", "is", null)
      .order("period_key", { ascending: false })
      .limit(1)
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
      wrappedEdition={(wrapped as WrappedEdition | null) ?? null}
      wrappedLastSeenKey={profile?.last_seen_wrapped_key ?? null}
      openingHours={(restaurant?.opening_hours as unknown as OpeningHours | null) ?? null}
    />
  );
}
