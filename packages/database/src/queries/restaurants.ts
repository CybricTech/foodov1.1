/**
 * Restaurant query helpers.
 * All queries are typed against the canonical schema.
 */
import type { TypedSupabaseClient } from "../client";
import type { Restaurant } from "../types";

/**
 * Resolve a restaurant slug to its full record.
 * Used on every storefront page load per PRD §8, Rule 5.
 *
 * Returns null if not found or not active.
 */
export async function getRestaurantBySlug(
  client: TypedSupabaseClient,
  slug: string
): Promise<Restaurant | null> {
  const { data, error } = await client
    .from("restaurants")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return data as unknown as Restaurant;
}

/**
 * Get a restaurant by its ID.
 * Used in dashboard and admin contexts.
 */
export async function getRestaurantById(
  client: TypedSupabaseClient,
  id: string
): Promise<Restaurant | null> {
  const { data, error } = await client
    .from("restaurants")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as unknown as Restaurant;
}

/**
 * List all restaurants (Super Admin only — use with service role client).
 */
export async function listAllRestaurants(
  client: TypedSupabaseClient
): Promise<Restaurant[]> {
  const { data, error } = await client
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Restaurant[];
}
