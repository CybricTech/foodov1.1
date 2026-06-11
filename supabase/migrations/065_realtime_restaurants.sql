-- 065: Enable Supabase Realtime for the restaurants table.
-- The admin Live Operations dashboard subscribes to restaurant UPDATE
-- events (accepts_orders toggles, closure messages) so the merchant
-- board reflects open/paused state without a refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'restaurants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;
  END IF;
END $$;
