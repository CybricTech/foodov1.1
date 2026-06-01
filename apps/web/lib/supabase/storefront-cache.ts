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
 * Menu items/categories (prices + availability) are deliberately NOT cached here
 * yet — that needs explicit invalidation on merchant edits. See
 * docs/storefront-caching-plan.md (Tier 2).
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "./server";
import {
  getRestaurantBySlug,
  getRestaurantReviews,
  getRestaurantRatingSummary,
  getMenuCategories,
  getMenuItems,
} from "@foodo/database";

/** Tag for a restaurant's cached record. Revalidate after a settings save. */
export const restaurantTag = (slug: string) => `restaurant:${slug}`;
/** Tag for a restaurant's cached reviews/rating. Revalidate after a new review. */
export const reviewsTag = (restaurantId: string) => `reviews:${restaurantId}`;
/**
 * Tag for a restaurant's cached menu (categories + items). MUST be revalidated
 * whenever a merchant changes the menu — price, availability, add/remove item or
 * category, featured order. The dashboard calls POST /api/revalidate after each
 * such edit; the 60s TTL below is only a safety floor in case a call is missed.
 */
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
 * Cached menu (categories + items with options). 60s TTL is a *floor* — the
 * dashboard revalidates the `menu:<id>` tag immediately after any edit, so
 * prices/availability are normally fresh within a request or two of a change.
 * `includeUnavailable` is part of the cache key: the storefront menu page shows
 * sold-out items (greyed out), the home page's featured row shows only available
 * ones, so the two variants are cached separately under the same tag.
 */
export const getCachedMenu = cache((restaurantId: string, includeUnavailable = false) =>
  unstable_cache(
    async () => {
      const db = createServiceClient();
      const [categories, items] = await Promise.all([
        getMenuCategories(db, restaurantId),
        getMenuItems(db, restaurantId, { includeUnavailable }),
      ]);
      return { categories, items };
    },
    ["menu", restaurantId, includeUnavailable ? "all" : "available"],
    { tags: [menuTag(restaurantId)], revalidate: 60 }
  )()
);
