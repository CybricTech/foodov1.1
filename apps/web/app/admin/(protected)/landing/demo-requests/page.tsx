import { createServiceClient } from "@/lib/supabase/server";
import { LandingDemoRequestsClient } from "@/components/admin/landing-demo-requests-client";

export const dynamic = "force-dynamic";

export default async function AdminDemoRequestsPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false });

  return <LandingDemoRequestsClient initialRequests={data ?? []} />;
}
