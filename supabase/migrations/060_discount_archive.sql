-- ============================================================================
-- 060: Discounts — soft delete (archive) so promo history is never lost
-- ============================================================================
-- Deleting a promo used to HARD DELETE the discounts row. Because
-- discount_redemptions.discount_id is ON DELETE CASCADE, every redemption record
-- was erased too — so after a merchant removed a promo, there was no way to see
-- which orders used it. orders.discount_id (ON DELETE SET NULL) was also nulled.
--
-- Fix: archive instead of delete. The row (and all its redemptions + order links)
-- is retained forever; the promo simply stops being usable. archived_at marks it.
-- ============================================================================

ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN discounts.archived_at IS
  'When set, the promo is archived (soft-deleted): it can no longer be redeemed '
  'but is kept — along with its redemptions and order links — for history. '
  'Archiving also sets is_active = false.';

-- Fast filtering of live vs archived promos per restaurant.
CREATE INDEX IF NOT EXISTS idx_discounts_restaurant_archived
  ON discounts (restaurant_id, archived_at);
