import { getDashboardUser } from "@/lib/supabase/cached-queries";
import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MenuManagerClient } from "@/components/dashboard/menu-manager-client";
import type { MenuItemWithOptions } from "@foodo/database";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
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
      .select("*, options:menu_item_options(*, choices:menu_item_option_choices(*))")
      .eq("restaurant_id", restaurantId)
      .order("display_order", { ascending: true }),
  ]);

  return (
    <MenuManagerClient
      restaurantId={restaurantId}
      initialCategories={categories ?? []}
      initialItems={(items as unknown as MenuItemWithOptions[]) ?? []}
    />
  );
}
