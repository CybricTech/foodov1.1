import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { getRestaurantById } from "@foodo/database";
import { createServerClient } from "@/lib/supabase/server";
import { FrontlineShell } from "@/components/dashboard/frontline-shell";
import { RouterAutoRefresh } from "@/components/shared/router-auto-refresh";

export async function generateMetadata(): Promise<Metadata> {
  const session = await getDashboardUser();
  if (!session) return { title: "Dashboard" };
  const supabase = await createServerClient();
  const restaurant = await getRestaurantById(supabase, session.restaurantId);
  return { title: restaurant ? `${restaurant.name}'s Dashboard` : "Dashboard" };
}

export default async function FrontlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardUser();

  if (!session) {
    redirect("/dashboard/login");
  }

  // Only merchant_staff and merchant_owner (for preview) may access frontline routes
  if (!["merchant_staff", "merchant_owner"].includes(session.role)) {
    redirect("/dashboard/login");
  }

  // Restaurant name + logo drive the printed receipt header (white-label).
  const supabase = await createServerClient();
  const restaurant = await getRestaurantById(supabase, session.restaurantId);

  return (
    <FrontlineShell
      restaurantId={session.restaurantId}
      restaurantName={restaurant?.name ?? "Receipt"}
      logoUrl={restaurant?.logo_url ?? null}
      userName={session.fullName || session.email}
      role={session.role}
    >
      <RouterAutoRefresh />
      {children}
    </FrontlineShell>
  );
}
