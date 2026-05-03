import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { getRestaurantById } from "@foodo/database";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/nav";
import { ConnectionProvider } from "@/lib/connection-context";
import { ConnectionBanner } from "@/components/dashboard/connection-banner";
import { RouterAutoRefresh } from "@/components/shared/router-auto-refresh";

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
        <main className="md:ml-60 min-h-screen pb-20 md:pb-0">{children}</main>
      </div>
    </ConnectionProvider>
  );
}
