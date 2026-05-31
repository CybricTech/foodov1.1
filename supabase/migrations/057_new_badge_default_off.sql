-- ============================================================
-- "NEW" badge is opt-in: off by default until a merchant turns it on.
--
-- 056 shipped with DEFAULT true, which flagged every existing item. Flip the
-- column default and clear existing rows so the badge only appears where a
-- merchant has explicitly enabled it.
-- ============================================================
ALTER TABLE menu_items
  ALTER COLUMN show_new_badge SET DEFAULT false;

UPDATE menu_items
  SET show_new_badge = false
  WHERE show_new_badge = true;
