/**
 * Restaurant query helpers.
 * All queries are typed against the canonical schema.
 */
import type { TypedSupabaseClient } from "../client";
import type { Restaurant } from "../custom-types";

/**
 * Columns safe to ship to a storefront visitor's browser.
 *
 * This list is a whitelist on purpose. getRestaurantBySlug used to `select("*")`
 * and runs on the SERVICE client (via storefront-cache), so RLS never applied —
 * and Next.js serialises whatever it returns into the RSC payload of every
 * storefront page. That published each merchant's `bank_account_number`,
 * `bank_account_name`, `bank_code` and `paystack_recipient_code` in the page
 * HTML, readable with View Source. Verified before the fix on /get-drizzys.
 *
 * Deliberately excluded: the banking columns above, plus commercial terms
 * (delivery_commission_pct, restaurant_*_kobo), internal ops fields
 * (dispatch_policy*, logistics_default, rider_request_lead_minutes, is_test,
 * sms_sender_*) and internal contact/audit fields (notification_email,
 * closure_message_history). None are referenced anywhere in the storefront.
 *
 * If a storefront feature needs a new column, add it here explicitly — never
 * revert this to `*`.
 */
const STOREFRONT_RESTAURANT_COLUMNS = [
  "id", "slug", "name", "description",
  "logo_url", "banner_url", "primary_color",
  "banner_focal_x", "banner_focal_y", "banner_focal_x_mobile", "banner_focal_y_mobile",
  "phone", "whatsapp_number",
  "address", "city", "state", "latitude", "longitude", "place_id", "location_verified_at",
  "instagram_url", "facebook_url", "twitter_url", "youtube_url",
  "is_active", "accepts_orders", "accepts_delivery", "accepts_pickup",
  "delivery_fee", "delivery_radius_km", "max_delivery_radius_km", "min_order_amount",
  "estimated_delivery_minutes", "vat_percentage",
  "opening_hours", "closure_message", "scheduling_settings",
  "created_at", "updated_at",
].join(", ");

/**
 * Resolve a restaurant slug to its storefront-safe record.
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
    .select(STOREFRONT_RESTAURANT_COLUMNS)
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
