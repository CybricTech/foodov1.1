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
    .order("display_order", { ascending: true });

  if (!options?.includeUnavailable) {
    query = query.eq("is_available", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as MenuItemWithOptions[]) ?? [];
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
