-- Remove `payments` from the Supabase Realtime publication.
--
-- Context (2026-06-11 usage-exhaustion incident): pg_stat_statements showed the
-- Realtime WAL-polling query consuming ~48% of all database execution time. The
-- Realtime service continuously decodes the WAL for every table in the
-- `supabase_realtime` publication and applies RLS — whether or not any client is
-- listening. `payments` was added back in migration 011 but NO client anywhere
-- (web or mobile) subscribes to it, so every payment write was being decoded and
-- broadcast to nobody. Dropping it cuts pure waste with zero UX impact.
--
-- `orders`, `restaurants`, and `discounts` stay — those have live subscribers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE payments;
  END IF;
END $$;
