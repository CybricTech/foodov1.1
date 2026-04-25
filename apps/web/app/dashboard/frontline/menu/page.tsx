import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FrontlineMenuClient } from "@/components/dashboard/frontline-menu-client";

export const dynamic = "force-dynamic";

export default async function FrontlineMenuPage() {
  const session = await getDashboardUser();
  if (!session) redirect("/dashboard/login");

  const supabase = await createServerClient();
  const { restaurantId } = session;

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("display_order", { ascending: true }),
    supabase
      .from("menu_items")
      .select("id, name, description, price_kobo, image_url, is_available, is_featured, category_id")
      .eq("restaurant_id", restaurantId)
      .order("display_order", { ascending: true }),
  ]);

  return (
    <FrontlineMenuClient
      restaurantId={restaurantId}
      initialCategories={categories ?? []}
      initialItems={items ?? []}
    />
  );
}
