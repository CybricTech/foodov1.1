import { createServiceClient } from "@/lib/supabase/server";
import { MerchantsClient } from "@/components/admin/merchants-client";

export const dynamic = "force-dynamic";

export default async function AdminMerchantsPage() {
  const supabase = createServiceClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  return <MerchantsClient initialRestaurants={restaurants ?? []} />;
}
