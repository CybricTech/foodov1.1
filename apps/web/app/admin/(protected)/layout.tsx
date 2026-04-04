import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/nav";

export const metadata: Metadata = {
  icons: { icon: "/favicon-icon.png" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // Verify super_admin role using service client for security
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-black-50">
      <AdminNav userName={profile.full_name ?? user.email ?? ""} />
      <main className="md:ml-60 min-h-screen text-black-900">{children}</main>
    </div>
  );
}
