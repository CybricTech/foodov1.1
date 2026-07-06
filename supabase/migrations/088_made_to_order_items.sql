-- ============================================================
-- 088 — Made to Order menu items
-- ============================================================
-- Some items need real advance notice regardless of how far ahead the
-- restaurant otherwise allows booking (a custom cake, a whole roast) — a
-- fixed lead time per item, distinct from the restaurant-wide scheduling
-- config (087). Flagging an item forces ANY order containing it into the
-- scheduled-order flow (checkout/initialize, packages/utils/schedule-slots)
-- with an effective minimum lead of at least the item's requirement — never
-- shorter, even if the restaurant's general min_lead_minutes is lower.
--
--   • menu_items.is_made_to_order        — customer cannot "order now" with
--     this item in the cart; checkout forces "Schedule for later".
--   • menu_items.made_to_order_lead_hours — required lead time in hours.
--     NULL unless is_made_to_order is true (enforced below).
--
-- Deliberately reuses the existing scheduled-order pipeline end to end
-- (activation cron, dashboard Scheduled shelf/tab, admin oversight, SMS) —
-- no parallel system. A merchant must have scheduling_settings.enabled first
-- (enforced in the menu editor UI, not the DB) since this flag is meaningless
-- without it.
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_made_to_order BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS made_to_order_lead_hours INTEGER DEFAULT NULL;

ALTER TABLE menu_items
  DROP CONSTRAINT IF EXISTS menu_items_made_to_order_lead_check;

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_made_to_order_lead_check
  CHECK (
    (is_made_to_order = false AND made_to_order_lead_hours IS NULL)
    OR (is_made_to_order = true AND made_to_order_lead_hours > 0)
  );

COMMENT ON COLUMN menu_items.is_made_to_order IS
  'Requires the customer to schedule ahead — cannot be ordered "now". See migration 088.';
COMMENT ON COLUMN menu_items.made_to_order_lead_hours IS
  'Minimum hours of notice required for this item. Sets the checkout floor for scheduled_for regardless of the restaurant''s general min_lead_minutes.';
