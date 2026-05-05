import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { redirect } from "next/navigation";
import { AnalyticsClient } from "@/components/dashboard/analytics-client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  // Staff are redirected to the frontline orders page
  if (session.role === "merchant_staff") {
    redirect("/dashboard/frontline/orders");
  }

  return <AnalyticsClient restaurantId={session.restaurantId} />;
}
