import type { TypedSupabaseClient } from "../client";
import type { ReviewInsert } from "../types";

/**
 * Fetch approved reviews for a restaurant, newest first.
 * Used on the storefront landing page.
 */
export async function getRestaurantReviews(
  supabase: TypedSupabaseClient,
  restaurantId: string,
  limit = 20
) {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, reviewer_name, rating, comment, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch average rating + count for a restaurant.
 */
export async function getRestaurantRatingSummary(
  supabase: TypedSupabaseClient,
  restaurantId: string
): Promise<{ average: number; count: number }> {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("restaurant_id", restaurantId)
    .eq("is_approved", true);

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return { average: 0, count: 0 };

  const sum = rows.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: Math.round((sum / rows.length) * 10) / 10,
    count: rows.length,
  };
}

/**
 * Submit a new review (guest-friendly — no auth required).
 */
export async function submitReview(
  supabase: TypedSupabaseClient,
  review: ReviewInsert
) {
  const { data, error } = await supabase
    .from("reviews")
    .insert(review)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch all reviews for a restaurant (merchant dashboard — includes unapproved).
 */
export async function getMerchantReviews(
  supabase: TypedSupabaseClient,
  restaurantId: string
) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Approve or hide a review (merchant action).
 */
export async function setReviewApproval(
  supabase: TypedSupabaseClient,
  reviewId: string,
  isApproved: boolean
) {
  const { error } = await supabase
    .from("reviews")
    .update({ is_approved: isApproved })
    .eq("id", reviewId);

  if (error) throw error;
}
