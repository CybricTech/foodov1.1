import { redirect } from "next/navigation";
import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { DashboardNav } from "@/components/dashboard/nav";

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
    <div className="min-h-screen bg-black-50">
      <DashboardNav
        restaurantId={session.restaurantId}
        userName={session.fullName || session.email}
        role={session.role}
      />
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">{children}</main>
    </div>
  );
}
