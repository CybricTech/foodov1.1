import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CustomersClient } from "@/components/dashboard/customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("total_spent_kobo", { ascending: false });

  return (
    <CustomersClient
      restaurantId={restaurantId}
      initialCustomers={customers ?? []}
    />
  );
}
