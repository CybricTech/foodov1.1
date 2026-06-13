-- ============================================================
-- 070: Narrow the Supabase Realtime publication to column lists
--
-- Follow-up to the 2026-06-11 usage-exhaustion incident (see migration
-- 066). After dropping `payments`, the Realtime WAL-decode query was still
-- a top CPU consumer. The remaining culprit: `orders` was published with
-- ALL ~43 columns, including heavy free-text fields (delivery_address,
-- special_instructions, cancelled_reason). Every order write streamed the
-- entire wide row through logical decoding + RLS + the WAL sender, even
-- though the only live-tracking subscribers need a handful of columns.
--
-- Postgres 15 lets a publication specify a per-table COLUMN LIST. Only the
-- listed columns are written into the logical-decoding output, so the WAL
-- sender does materially less work per change (see WHY block at bottom).
--
-- Strategy: drop the three wide-published tables, then re-add `orders` and
-- `restaurants` with tight column lists. `discounts` is NOT re-added here
-- because no client subscribes to it (same reasoning as `payments` in 066);
-- if a discounts subscriber is ever added, re-add it with its own column
-- list in a later migration.
--
-- Column-list requirement: the list MUST contain every column in the
-- table's replica identity. Both tables use the default replica identity
-- (the primary key `id`), which is included below, so UPDATE/DELETE
-- replication remains valid.
-- ============================================================

-- 1. Drop the wide-published tables from the publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orders;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'restaurants'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE restaurants;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'discounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE discounts;
  END IF;
END $$;

-- 2. Re-add `orders` with only the columns live tracking needs.
--    Excludes the heavy free-text fields (delivery_address,
--    special_instructions, cancelled_reason) and everything else not
--    rendered on the live board.
ALTER PUBLICATION supabase_realtime
  ADD TABLE orders (id, restaurant_id, status, total_kobo, delivery_status, late_at);

-- 3. Re-add `restaurants` with only the open/paused-state columns the
--    admin Live Operations board subscribes to.
ALTER PUBLICATION supabase_realtime
  ADD TABLE restaurants (id, slug, name, is_active);

-- ============================================================
-- WHY a column list cuts WAL-sender CPU
--
-- The Realtime service runs a logical-replication walsender that
-- continuously decodes the WAL for every table in supabase_realtime —
-- regardless of whether any client is currently listening. For each
-- committed change it must:
--   1. decode the row image out of the WAL record,
--   2. assemble a logical-replication message,
--   3. apply RLS / row-filter checks,
--   4. serialize the payload and ship it to subscribers.
--
-- With a column list, steps 1-4 only handle the listed columns. The wide
-- text fields on `orders` (a full delivery address, free-text customer
-- instructions) are never decoded or serialized, so each change produces a
-- much smaller message and burns far less CPU in the walsender. On a table
-- with ~43 columns where only 6 matter to clients, that is the bulk of the
-- per-row decode/serialize cost eliminated — which is why this is expected
-- to be the larger win of the two changes.
--
-- It also shrinks the bytes streamed to subscribers and the JSON each
-- client must parse, but the primary target here is the server-side
-- walsender CPU flagged in `inspect db calls`.
-- ============================================================
