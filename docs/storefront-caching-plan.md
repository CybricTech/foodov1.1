# Storefront Caching Plan

Evidence-based plan to cut storefront page latency. Derived from Sentry traces
(last 24h, production) + code inspection on 2026-06-01.

## The numbers (Sentry, production)

| Transaction | avg | p95 | calls/24h |
|---|---|---|---|
| `GET /[restaurant_slug]` (home) | 1.70 s | **4.57 s** | 115 |
| `GET /[restaurant_slug]/menu` | 0.51 s | **2.73 s** | 140 |

Underlying Supabase REST calls (the cost inside those pages):

| Query | avg | p95 | calls/24h | Used on |
|---|---|---|---|---|
| `GET /rest/v1/restaurants` (getRestaurantBySlug) | 719 ms | **2.43 s** | 407 | **every** storefront page |
| `GET /rest/v1/reviews` (getRestaurantReviews) | 857 ms | **2.01 s** | 228 | home |
| menu items / categories | — | — | — | home + menu |

## Root cause (why it's slow today)

1. **`revalidate = 60` is a no-op.** Both `app/[restaurant_slug]/page.tsx` and
   `.../menu/page.tsx` declare `export const revalidate = 60`, but they read
   data through `createServerClient()`, which calls `cookies()`
   (`lib/supabase/server.ts:14`). Any `cookies()` access forces **dynamic
   rendering** — so Next.js re-renders and re-runs every query on *every single
   request*. The ISR/data cache never engages. This is the whole ballgame.

2. **`getRestaurantBySlug` runs twice per request.** Both `generateMetadata()`
   and the page component call it with a fresh client, with no `React.cache()`
   dedupe. The slowest, most-frequent query (p95 2.43 s) is paid twice. That
   matches the 407 call count ≈ 2 × page loads.

3. **It runs serially before everything else.** Each page does
   `await getRestaurantBySlug(...)` *then* a `Promise.all([...])`. The 2.4 s
   restaurant lookup is fully in the critical path before the rest start.

4. **Mutations are client-side.** There are **no server actions** in the repo
   (`grep "use server"` → none). The dashboard writes directly with the browser
   Supabase client (e.g. `menu-manager-client.tsx:828` `from("menu_items").update`).
   So there is no server hook where we can call `revalidateTag` automatically —
   invalidation needs an explicit endpoint (see Tier 2).

`getActiveMenuSale` already uses `createServiceClient()` (no cookies), so it's
the model for everything else.

## Strategy

Move all **public, read-only** storefront data off the cookie-bound client and
into `unstable_cache`-wrapped functions that use `createServiceClient()` (no
cookies → cacheable), each tagged for targeted invalidation. Tier by how often
data changes and how dangerous staleness is.

### Tier 1 — Restaurant record (biggest win)
Changes rarely (name, hours, branding, settings). On every page. p95 2.43 s × 2.

```ts
// lib/supabase/storefront-cache.ts
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "./server";
import { getRestaurantBySlug } from "@foodo/database";

// React cache(): dedupe within one render (kills the generateMetadata + page double-call)
export const getRestaurant = cache((slug: string) =>
  unstable_cache(
    async () => getRestaurantBySlug(createServiceClient(), slug),
    ["restaurant-by-slug", slug],
    { tags: [`restaurant:${slug}`], revalidate: 300 }
  )()
);
```
Replace both `getRestaurantBySlug(supabase, slug)` calls in the two pages (and
their `generateMetadata`) with `getRestaurant(slug)`.
**Expected: ~2.4 s → ~0 ms on cache hit, on every storefront page.**

### Tier 2 — Menu (categories + items) — the careful one
Hot ordering path. **Prices and availability must not go stale silently.**

```ts
export const getMenu = cache((restaurantId: string) =>
  unstable_cache(
    async () => {
      const db = createServiceClient();
      const [categories, items] = await Promise.all([
        getMenuCategories(db, restaurantId),
        getMenuItems(db, restaurantId, { includeUnavailable: true }),
      ]);
      return { categories, items };
    },
    ["menu", restaurantId],
    { tags: [`menu:${restaurantId}`], revalidate: 60 } // 60s = safety floor
  )()
);
```

**Invalidation (belt-and-suspenders):**
- **Floor:** `revalidate: 60` caps staleness at 60 s even if a signal is missed.
- **Instant:** add an authenticated `POST /api/revalidate` route that calls
  `revalidateTag(`menu:${restaurantId}`)`. The dashboard calls it after every
  menu mutation. The 6 sites in `menu-manager-client.tsx` that must call it:
  1. featured reorder — `:82` `update({ featured_order })`
  2. availability toggle — `:119` `update({ is_available })`
  3. delete item — `:131`
  4. delete category — `:142`
  5. create/update item (+ options/choices) — `:828`–`:879`
  6. create category — `:603`

  > Tradeoff: because writes are client-side, the client must fire this call.
  > If you'd rather not, the 60 s floor alone is acceptable for a menu — but
  > availability toggles (86'd items) feel laggy up to 60 s. Recommended: do both.

### Tier 3 — Reviews + rating summary
Home page only, p95 2.0 s, changes occasionally.
```ts
tags: [`reviews:${restaurantId}`], revalidate: 300
```
Invalidate via the same `/api/revalidate` route when a review is submitted.

### Tier 4 — Active sale
Already service-client + cheap. Time-sensitive (sales start/end on a clock), so
keep a short `revalidate: 30`, or tag-invalidate on sale-config change.

## Sequencing fix (free, do alongside Tier 1)
Once `getRestaurant` is cached and deduped, the serial `await` before the
`Promise.all` costs ~0 on hits. No further change needed, but verify the page
still awaits restaurant first only to get `restaurant.id` for the batch.

## Separate finding worth a follow-up (not caching)
A single-row lookup by slug (`restaurants`) at **p95 2.43 s** is not query
complexity — that smells like **(a) Supabase region far from the Vercel function
region** (functions ran in `iad1`/US-East per `x-vercel-id`) and/or **(b) a
missing index on `restaurants.slug`** / RLS overhead. Caching hides this for
*hits*, but every cache miss / revalidation still pays it. Verify:
- Supabase project region (dashboard → Settings) vs Vercel function region; co-locate them.
- `explain analyze select ... from restaurants where slug = $1` — ensure an index on `slug`.

This could be a bigger win than caching for the cold path, and they compound.

## Rollout order
1. Tier 1 (restaurant cache + dedupe) — biggest win, lowest risk, no invalidation needed (300 s TTL fine for branding/hours).
2. Tier 3 (reviews) — low risk.
3. Tier 2 (menu) + `/api/revalidate` route + wire the 6 dashboard call sites — highest value but needs the invalidation plumbing; test availability toggles end-to-end.
4. Verify Supabase region / slug index.
5. Re-run the k6 smoke test against staging; expect storefront p95 to drop from ~4.5 s toward a few hundred ms on warm cache.
