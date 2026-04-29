import { redirect } from "next/navigation";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { FrontlineShell } from "@/components/dashboard/frontline-shell";
import { RouterAutoRefresh } from "@/components/shared/router-auto-refresh";

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

  return (
    <FrontlineShell
      restaurantId={session.restaurantId}
      userName={session.fullName || session.email}
      role={session.role}
    >
      <RouterAutoRefresh />
      {children}
    </FrontlineShell>
  );
}
