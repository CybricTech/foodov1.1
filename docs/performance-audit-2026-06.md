# Dashboard performance audit — June 2026

Investigation into reported slowness on `dashboard.kitchyn.app`. Data is from
**production Sentry traces, last 14 days** (`tracesSampleRate: 0.2`). p95 = the
slow 5% of loads, which is what users actually feel.

## Pageload durations (before fixes)

| Page | avg | p95 |
|---|---|---|
| /dashboard/wallet | 1.06s | 6.0s (cold 17s) |
| /admin/settlements | 1.24s | 6.7s |
| /dashboard/customers | 0.91s | 5.8s |
| /dashboard/orders | 0.73s | 3.8s (cold 22s) |
| /dashboard (home) | 0.78s | 3.2s |

## Root causes (ranked by impact)

### 1. `auth.getUser()` runs twice per request — ~600ms avg, 1.7s p95 each — NOT YET FIXED
`GET /auth/v1/user` was the single most-called dependency: **12,112 calls**, avg
592ms. It fires once in [`middleware.ts`](../apps/web/middleware.ts) and again in
[`getDashboardUser()`](../apps/web/lib/supabase/cached-queries.ts) — both validate
the same JWT against the Supabase Auth server over the network. Every dashboard
page pays this twice before rendering anything. This taxes *every* page equally,
which is why the whole dashboard feels uniformly sluggish.

**Why not patched here:** the only safe fix that preserves the current security
model is migrating the Supabase project to **asymmetric JWT signing keys** and
switching `getUser()` → `getClaims()`, which verifies the token *locally* (no
network) in both the middleware and the Server Component. That requires:
1. Supabase dashboard → Auth → JWT Keys → migrate to an asymmetric key (ECC/RSA).
2. Bump `@supabase/supabase-js` to ≥ 2.49 (adds `getClaims()`).
3. Replace the two `supabase.auth.getUser()` calls with `getClaims()`.

Hand-rolling a middleware→Server-Component header handoff was considered and
rejected: it would mean reimplementing the cookie-refresh forwarding that this
auth middleware has been carefully hardened around (poisoned-cookie / WAF / 403
handling), and a subtle bug there breaks sessions on a payments platform.

Expected impact: removes ~600–1200ms from **every** authenticated page.

### 2. Wallet recompute blocks the page — 6.4s avg, 15s p95 — ✅ FIXED
[`wallet/page.tsx`](<../apps/web/app/dashboard/(protected)/wallet/page.tsx>) `await`s
`recompute_restaurant_wallet()` synchronously on every load. The recompute (migration
059) runs a correlated subquery on `delivery_assignments` for every unsettled order,
and that table had **no index on `order_id`** → sequential scan per order.

Fix: migration `061_performance_indexes.sql` adds
`delivery_assignments(order_id, assigned_at DESC)`. The page-load recompute is kept
(it's the only thing that refreshes `pending_balance_kobo` for new orders — 059
deliberately has no orders trigger), but it should now complete in a fraction of the
time.

### 3. Orders / order-detail join unindexed — 1.3s avg, 4.5s p95 — ✅ FIXED
The orders queue and every order-detail page join `order_items`, resolved as
`WHERE order_id IN (...)`. `order_items.order_id` is a foreign key, which Postgres
does **not** auto-index. Fix: migration `061` adds `order_items(order_id)`.

### 4. PostHog flush blocked the layout render — ~70ms every page — ✅ FIXED
[`(protected)/layout.tsx`](<../apps/web/app/dashboard/(protected)/layout.tsx>) called
`await posthog.shutdown()` on every render. Confirmed in Sentry:
`POST eu.i.posthog.com/batch/` = 68ms avg, blocking. `shutdown()` also *closes* the
shared singleton (posthog-node docs say to use `flush()` for per-request cleanup).
Fix: non-blocking `void posthog.flush()`, identity behaviour unchanged.

## How to measure speed going forward

- **Sentry → Insights → Web Vitals / Performance** is the source of truth. Sort by
  **p95**, not avg. Saved query:
  [pageload/navigation durations](https://kitchyn-qv.sentry.io/explore/traces/?query=transaction.op%3Apageload+OR+transaction.op%3Anavigation&mode=aggregate&sort=-p95%28span.duration%29&statsPeriod=14d&table=span).
- For frontend-only checks (bundle, render-blocking JS): Chrome **Lighthouse** against
  `dashboard.kitchyn.app`, or add **Vercel Speed Insights**.

## Verification

After migration 061 deploys, re-run the Sentry query above and confirm
`recompute_restaurant_wallet` and `GET /rest/v1/orders` span durations drop. Fix #1
remains open and tracked in this doc.
