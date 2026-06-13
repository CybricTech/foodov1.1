-- ============================================================
-- 072: Correct the Realtime publication scoping from 070.
--
-- 070 narrowed `orders` to 6 columns, trimmed `restaurants` to
-- (id, slug, name, is_active), and dropped `discounts` entirely. An audit
-- of the actual postgres_changes subscribers showed that was too aggressive
-- and broke features that read columns directly from the Realtime payload
-- (rather than refetching the row):
--
--   * discounts — marketing-client.tsx writes payload.new straight into
--     state; with discounts unpublished, live offer sync across staff
--     devices stopped entirely.
--   * restaurants.accepts_orders — dashboard-home-client.tsx and the admin
--     live-ops board read this to reflect open/paused state live. It was the
--     whole reason restaurants was added to Realtime in 065, and it was not
--     in 070's column list.
--   * orders.order_number — the admin live-ops activity feed reads it on
--     INSERT (blank in the feed without it).
--   * orders.created_at — dashboard-home filters new orders by date; missing
--     it yields Invalid Date and the order falls out of the view.
--
-- Corrected design: narrow ONLY the hot, high-write table (orders) to an
-- audited column list that covers every field consumers read from the
-- payload, while still excluding the heavy free-text fields that drove the
-- WAL-decode cost (delivery_address, special_instructions, cancelled_reason).
-- The cold, low-frequency tables (restaurants, discounts) are published in
-- full — they change rarely, so a column list buys almost no CPU but adds
-- breakage risk.
--
-- Net effect: keeps essentially all of 070's orders CPU saving, restores the
-- four broken behaviours.
-- ============================================================

DO $$
BEGIN
  -- Reset all three to a known state first.
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orders;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND tablename = 'restaurants') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE restaurants;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND tablename = 'discounts') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE discounts;
  END IF;
END $$;

-- orders: audited column list. Covers every column read directly from a
-- Realtime payload by any subscriber, plus the filter columns
-- (id, restaurant_id). Excludes the heavy free-text fields. `id` (PK /
-- replica identity) is included, so UPDATE/DELETE replication stays valid.
ALTER PUBLICATION supabase_realtime
  ADD TABLE orders (
    id, restaurant_id, order_number, status, delivery_status,
    fulfillment_type, total_kobo, total_amount, created_at, updated_at,
    late_at, rider_id
  );

-- restaurants: publish all columns. Low write frequency (open/pause toggles,
-- settings saves), so the per-change cost is negligible and a column list
-- would only risk re-breaking accepts_orders / future fields.
ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;

-- discounts: publish all columns. Offers change rarely; the subscriber
-- consumes the whole row, so the full row is required.
ALTER PUBLICATION supabase_realtime ADD TABLE discounts;
