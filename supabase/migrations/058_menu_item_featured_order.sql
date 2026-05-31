-- ============================================================
-- Featured ordering for menu items
--
-- Lets merchants control the order items appear in the storefront
-- "Featured" carousel, independent of the main menu order. Lower value
-- shows first. Ties fall back to newest-first (created_at DESC) so a
-- freshly featured item surfaces at the front by default.
-- ============================================================
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS featured_order INTEGER NOT NULL DEFAULT 0;
