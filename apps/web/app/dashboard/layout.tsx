import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/dashboard/login");
  }

  // Fetch profile to check role and get restaurant_id
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, restaurant_id, full_name")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !["merchant_owner", "merchant_staff"].includes(profile.role)
  ) {
    redirect("/dashboard/login");
  }

  if (!profile.restaurant_id) {
    redirect("/dashboard/login");
  }

  return (
    <div className="min-h-screen bg-black-50">
      <DashboardNav
        restaurantId={profile.restaurant_id}
        userName={profile.full_name ?? user.email ?? ""}
        role={profile.role as "merchant_owner" | "merchant_staff"}
      />
      <main className="md:ml-60 min-h-screen">{children}</main>
    </div>
  );
}
