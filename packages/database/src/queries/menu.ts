/**
 * Menu query helpers — categories, items, options, choices.
 */
import type { TypedSupabaseClient } from "../client";
import type {
  MenuCategory,
  MenuItemWithOptions,
} from "../custom-types";

/**
 * Fetch all active menu categories for a restaurant, ordered for display.
 */
export async function getMenuCategories(
  client: TypedSupabaseClient,
  restaurantId: string
): Promise<MenuCategory[]> {
  const { data, error } = await client
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as MenuCategory[];
}

/**
 * Fetch all available menu items for a restaurant, with options and choices.
 * Filtered to is_available = true for the storefront.
 *
 * Add-on-only items (is_addon_only) are excluded — they exist solely to be
 * offered as option choices, never as standalone products on the storefront.
 *
 * Unavailable choices are stripped here, not by RLS: the storefront reads
 * through a service client (RLS bypassed), and the embedded choices come back
 * unfiltered. A choice linked to a sold-out add-on has is_available synced to
 * false (migration 086), so dropping unavailable choices hides it from the menu.
 */
export async function getMenuItems(
  client: TypedSupabaseClient,
  restaurantId: string,
  options?: { includeUnavailable?: boolean }
): Promise<MenuItemWithOptions[]> {
  let query = client
    .from("menu_items")
    .select(
      `
      *,
      options:menu_item_options (
        *,
        choices:menu_item_option_choices (*)
      )
    `
    )
    .eq("restaurant_id", restaurantId)
    .eq("is_addon_only", false)
    .order("display_order", { ascending: true });

  if (!options?.includeUnavailable) {
    // Effective availability (migration 091): manual switch on AND (not
    // stock-tracked OR still in stock).
    query = query
      .eq("is_available", true)
      .or("track_inventory.eq.false,stock_quantity.gt.0");
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data as unknown as MenuItemWithOptions[]) ?? [];
  if (options?.includeUnavailable) return items;

  return items.map((item) => ({
    ...item,
    options: item.options?.map((opt) => ({
      ...opt,
      choices: opt.choices.filter((c) => c.is_available),
    })),
  }));
}

/**
 * Fetch a single menu item with all options and choices.
 */
export async function getMenuItemById(
  client: TypedSupabaseClient,
  itemId: string
): Promise<MenuItemWithOptions | null> {
  const { data, error } = await client
    .from("menu_items")
    .select(
      `
      *,
      options:menu_item_options (
        *,
        choices:menu_item_option_choices (*)
      )
    `
    )
    .eq("id", itemId)
    .single();

  if (error || !data) return null;
  return data as unknown as MenuItemWithOptions;
}
