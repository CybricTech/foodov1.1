import { createServerClient } from "@/lib/supabase/server";
import { CustomersClient } from "@/components/dashboard/customers-client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("restaurant_id")
    .eq("id", user!.id)
    .single();

  const restaurantId = profile!.restaurant_id!;

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
