/**
 * Cached, cookie-free reads for the PUBLIC storefront.
 *
 * Why this exists: the storefront pages declared `export const revalidate = 60`
 * but read through `createServerClient()`, which calls `cookies()` and forces
 * dynamic rendering — so every request re-ran every query (Sentry showed the
 * restaurant lookup alone at p95 ~2.4s, fired twice per page). These helpers
 * use `createServiceClient()` (no cookies) wrapped in `unstable_cache`, so the
 * data is genuinely cached and tag-invalidatable, and `React.cache()` dedupes
 * repeat calls within a single render (e.g. generateMetadata + the page).
 *
 * Tiers covered here are the SAFE ones — data where short staleness is harmless:
 *   - restaurant record (branding/hours/settings) — tag `restaurant:<slug>`
 *   - reviews + rating summary                    — tag `reviews:<restaurantId>`
 *
 * Menu items/categories (prices + availability) are cached here too, but on a
 * deliberately SHORT 30s TTL (Tier 2). Merchant menu edits happen client-side
 * direct to Supabase, so there's no server-side hook to call revalidateTag() —
 * the short TTL is the invalidation mechanism. 30s of staleness on prices/
 * sold-out is acceptable and takes the hottest storefront queries off the DB
 * (see the 2026-06-11 usage-exhaustion incident). See docs/storefront-caching-plan.md.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "./server";

/**
 * Degrade gracefully instead of crashing the page. Supabase occasionally
 * returns transient infra errors (e.g. the Cloudflare 525 on 2026-06-11 that
 * took down a live storefront — Sentry JAVASCRIPT-NEXTJS-Z). Non-critical
 * reads (reviews, ratings, sales, featured items) should never turn one
 * failed request into a dead page. The error is still reported to Sentry.
 *
 * Note: failures are NOT cached — unstable_cache only caches resolved
 * values, so the next request retries the real query.
 */
export async function withFallback<T>(
  promise: Promise<T>,
  fallback: T,
  context: string
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    Sentry.captureException(error, {
      level: "warning",
      tags: { degraded_fetch: context },
    });
    return fallback;
  }
}
import {
  getRestaurantBySlug,
  getRestaurantReviews,
  getRestaurantRatingSummary,
  getMenuItems,
  getMenuCategories,
} from "@foodo/database";

/** Tag for a restaurant's cached record. Revalidate after a settings save. */
export const restaurantTag = (slug: string) => `restaurant:${slug}`;
/** Tag for a restaurant's cached reviews/rating. Revalidate after a new review. */
export const reviewsTag = (restaurantId: string) => `reviews:${restaurantId}`;
/** Tag for a restaurant's cached menu (items + categories + availability). */
export const menuTag = (restaurantId: string) => `menu:${restaurantId}`;

/**
 * Cached restaurant lookup by slug. 5-minute TTL — branding/hours/settings
 * change rarely, and staleness there is harmless. React.cache() collapses the
 * generateMetadata + page double-call into one within a render.
 */
export const getCachedRestaurant = cache((slug: string) =>
  unstable_cache(
    async () => getRestaurantBySlug(createServiceClient(), slug),
    ["restaurant-by-slug", slug],
    { tags: [restaurantTag(slug)], revalidate: 300 }
  )()
);

/** Cached approved reviews (most-recent first). 5-minute TTL. */
export const getCachedReviews = cache((restaurantId: string) =>
  unstable_cache(
    async () => getRestaurantReviews(createServiceClient(), restaurantId),
    ["restaurant-reviews", restaurantId],
    { tags: [reviewsTag(restaurantId)], revalidate: 300 }
  )()
);

/** Cached average rating + count. Shares the reviews tag. 5-minute TTL. */
export const getCachedRatingSummary = cache((restaurantId: string) =>
  unstable_cache(
    async () => getRestaurantRatingSummary(createServiceClient(), restaurantId),
    ["restaurant-rating", restaurantId],
    { tags: [reviewsTag(restaurantId)], revalidate: 300 }
  )()
);

/**
 * Cached available menu items (with options + choices). 30s TTL. Service client
 * bypasses RLS, but getMenuItems' own `is_available = true` filter returns the
 * same set anon visitors would see via RLS — same pattern as the cached reads
 * above. The caller validates the restaurant is active before calling this.
 */
export const getCachedMenuItems = cache((restaurantId: string) =>
  unstable_cache(
    async () => getMenuItems(createServiceClient(), restaurantId),
    ["menu-items", restaurantId],
    { tags: [menuTag(restaurantId)], revalidate: 30 }
  )()
);

/** Cached active menu categories (display order). 30s TTL. */
export const getCachedMenuCategories = cache((restaurantId: string) =>
  unstable_cache(
    async () => getMenuCategories(createServiceClient(), restaurantId),
    ["menu-categories", restaurantId],
    { tags: [menuTag(restaurantId)], revalidate: 30 }
  )()
);

/**
 * Cached per-item availability projection (category_id + is_available, ALL items
 * incl. unavailable). Drives sold-out/"restocking" category detection on the menu
 * page, which needs the unfiltered view RLS would hide — hence the service client.
 */
export const getCachedMenuAvailability = cache((restaurantId: string) =>
  unstable_cache(
    async () => {
      const { data } = await createServiceClient()
        .from("menu_items")
        .select("category_id, is_available")
        .eq("restaurant_id", restaurantId)
        .eq("is_addon_only", false);
      return (data ?? []) as { category_id: string | null; is_available: boolean }[];
    },
    ["menu-availability", restaurantId],
    { tags: [menuTag(restaurantId)], revalidate: 30 }
  )()
);
