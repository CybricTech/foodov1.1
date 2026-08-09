-- Closes the two public data leaks that migration 20260809101638 could not fix
-- from the database alone, because the storefront was reading both tables in
-- the browser as `anon`.
--
-- ⚠️  DEPLOY ORDER: the application changes MUST be live before this runs.
--     Required app changes (all shipped together with this file):
--       - app/[restaurant_slug]/orders/[order_id]/page.tsx  → /api/orders/[id]/track (polling)
--       - components/storefront/active-order-banner.tsx     → /api/orders/[id]/track (polling)
--       - app/[restaurant_slug]/orders/track/page.tsx        → /api/orders/lookup
--       - app/[restaurant_slug]/orders/success/[order_id]/page.tsx → service client + getCachedRestaurant
--     Running this first takes customer order tracking and the success page down.

-- ---------------------------------------------------------------
-- 1. orders — all 1,287 rows were readable by anyone
-- ---------------------------------------------------------------
-- `orders_customer_read` and `orders_public_read_by_id` were BOTH
-- `USING (true)`. The intent was "a customer can look up their own order by
-- id", but RLS cannot express "only when filtered by id" — so in practice
-- anyone holding the public anon key could page the entire table and harvest
-- customer_phone and delivery_address. Verified before the fix:
--     content-range: 0-999/1287
--
-- Customer order reads now happen server-side on the service client, where the
-- order UUID is the capability. Note this also removes the ability to hold a
-- realtime subscription on orders as anon (realtime enforces RLS), which is why
-- the tracking page and banner switched to polling.
--
-- orders_restaurant_isolation is deliberately left in place: that is how the
-- merchant dashboard and its realtime order queue read orders as `authenticated`.
drop policy if exists orders_customer_read     on public.orders;
drop policy if exists orders_public_read_by_id on public.orders;
revoke select on public.orders from anon;

-- ---------------------------------------------------------------
-- 2. restaurants — merchant banking details were readable by anyone
-- ---------------------------------------------------------------
-- `restaurants_public_read USING (is_active = true)` plus table-wide SELECT
-- exposed every column, including bank_account_number, bank_account_name,
-- bank_code and paystack_recipient_code. Verified before the fix: readable for
-- 12 of 17 merchants with nothing but the public key.
--
-- Column-level SELECT grants are NOT a usable fix here — with table-level
-- SELECT revoked, PostgREST returns `42501 permission denied for table` even
-- for whitelisted columns (tested and reverted on changelog_entries). So anon
-- loses access to the table outright instead.
--
-- This is safe because every storefront read of `restaurants` already goes
-- through getCachedRestaurant() in lib/supabase/storefront-cache.ts, which runs
-- on the service client inside unstable_cache. The only exception was the order
-- success page, migrated in the same release. The remaining browser readers
-- (dashboard settings, store-status control, admin live-ops) are all
-- `authenticated`, and keep access via restaurants_admin_all /
-- restaurants_merchant_update / restaurants_public_read.
revoke select on public.restaurants from anon;

notify pgrst, 'reload schema';
