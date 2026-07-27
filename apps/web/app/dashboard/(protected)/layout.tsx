import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { getRestaurantById } from "@foodo/database";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/nav";
import { ConnectionProvider } from "@/lib/connection-context";
import { ConnectionBanner } from "@/components/dashboard/connection-banner";
import { RouterAutoRefresh } from "@/components/shared/router-auto-refresh";
import { getPostHogClient } from "@/lib/posthog";
import { WhatsNew } from "@/components/dashboard/whats-new";
import { AgreementReminderBanner } from "@/components/dashboard/agreement-reminder-banner";

export async function generateMetadata(): Promise<Metadata> {
  const session = await getDashboardUser();
  if (!session) return { title: "Dashboard" };
  const supabase = await createServerClient();
  const restaurant = await getRestaurantById(supabase, session.restaurantId);
  return { title: restaurant ? `${restaurant.name}'s Dashboard` : "Dashboard" };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardUser();

  if (!session) {
    redirect("/dashboard/login");
  }

  if (!["merchant_owner", "merchant_staff"].includes(session.role)) {
    redirect("/dashboard/login");
  }

  // Staff users should use the frontline interface, not the owner dashboard
  if (session.role === "merchant_staff") {
    redirect("/dashboard/frontline/orders");
  }

  // Enrich this merchant's PostHog person profile (keyed by user id, matching
  // our server-side capture events). Fire-and-forget: we do NOT await the flush
  // so this analytics write never sits on the dashboard's render critical path.
  // Previously `await posthog.shutdown()` added a ~70ms EU round-trip to every
  // dashboard page load (confirmed in Sentry) AND closed the shared singleton —
  // posthog-node docs are explicit that shutdown() must not be used on a client
  // you intend to keep using; flush() is the correct per-request cleanup.
  const posthog = getPostHogClient();
  posthog.identify({
    distinctId: session.userId,
    properties: {
      $set: {
        email: session.email,
        name: session.fullName,
        role: session.role,
        restaurant_id: session.restaurantId,
      },
    },
  });
  void posthog.flush().catch(() => {});

  // "What's New" — published changelog + this user's last-seen marker, fetched at
  // the LAYOUT level so the first-time popup appears on whatever dashboard page
  // the merchant happens to be on (not only the home screen). The home header
  // still renders the reopen button (autoOpen off there to avoid a double popup).
  const supabase = await createServerClient();
  const [{ data: changelogEntries }, { data: profile }, { data: pendingAgreement }] = await Promise.all([
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
    supabase
      .from("merchant_agreements")
      .select("id")
      .eq("restaurant_id", session.restaurantId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <ConnectionProvider>
      <ConnectionBanner />
      <RouterAutoRefresh />
      <div className="min-h-screen bg-black-50">
        <DashboardNav
          restaurantId={session.restaurantId}
          userName={session.fullName || session.email}
          role={session.role}
        />
        <main className="md:ml-60 min-h-screen pb-20 md:pb-0">
          {pendingAgreement && <AgreementReminderBanner />}
          {children}
        </main>
      </div>
      <WhatsNew
        userId={session.userId}
        entries={changelogEntries ?? []}
        lastSeenAt={profile?.last_seen_changelog_at ?? null}
        showButton={false}
      />
    </ConnectionProvider>
  );
}
