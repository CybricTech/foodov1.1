import { createServerClient } from "@/lib/supabase/server";
import { MenuManagerClient } from "@/components/dashboard/menu-manager-client";
import type { MenuItemWithOptions } from "@foodo/database";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
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
