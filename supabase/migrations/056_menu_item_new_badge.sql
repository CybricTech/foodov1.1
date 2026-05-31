-- ============================================================
-- "NEW" badge for menu items
--
-- Per-item toggle so merchants control which items show a "NEW" badge on
-- their storefront. Defaults to true so freshly added items are highlighted
-- automatically; merchants can switch it off (or back on) at any time.
-- ============================================================
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS show_new_badge BOOLEAN NOT NULL DEFAULT true;
