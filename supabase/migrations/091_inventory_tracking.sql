-- ============================================================
-- 091 — Optional per-item inventory tracking
-- ============================================================
-- Merchants can now optionally track a stock quantity per menu item. Each
-- paid order decrements the count; when it hits 0 the item is effectively
-- sold out until the merchant restocks. This is OPT-IN per item — the
-- existing is_available merchant switch is untouched and keeps working
-- exactly as before.
--
--   • menu_items.track_inventory — false (default) = item behaves exactly
--     as today (manual switch only). true = stock_quantity is enforced.
--   • menu_items.stock_quantity  — units left. NULL/ignored unless
--     track_inventory is true. Clamped at 0.
--
-- Effective availability everywhere (RLS, storefront queries, checkout):
--     is_available AND (track_inventory = false OR stock_quantity > 0)
--
-- Stock is decremented by a trigger on order_items INSERT — this single
-- point covers every order-creation path (paystack webhook, monnify
-- webhook, checkout/status polling fallback, createTestOrder) with no
-- changes to those routes. Cancellations restock via a trigger on
-- orders.status -> 'cancelled' (same pattern as trg_loyalty_award, 079),
-- covering customer cancel, merchant decline-scheduled, and admin refund.
--
-- Deliberately NOT handled here: modifier choices
-- (menu_item_option_choices) and add-on linked items are not stock-tracked;
-- the oversell window between checkout-initialize and payment confirmation
-- is accepted (decrement clamps at 0; rare oversell handled manually).
-- ============================================================

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT NULL;

ALTER TABLE menu_items
  DROP CONSTRAINT IF EXISTS menu_items_stock_quantity_check;

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_stock_quantity_check
  CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

COMMENT ON COLUMN menu_items.track_inventory IS
  'Opt-in per-item stock tracking. When true, effective availability also requires stock_quantity > 0. See migration 091.';
COMMENT ON COLUMN menu_items.stock_quantity IS
  'Units remaining. Only meaningful when track_inventory = true; decremented on order_items insert, restored on order cancellation.';

-- Public read: sold-out tracked items are hidden from anon customers just
-- like switched-off items.
DROP POLICY IF EXISTS "menu_items_public_read" ON menu_items;
CREATE POLICY "menu_items_public_read"
  ON menu_items FOR SELECT
  USING (is_available = true AND (track_inventory = false OR stock_quantity > 0));

-- ── Decrement on purchase ────────────────────────────────────────────────
-- Runs as the inserting role (service role from the webhooks) — bypasses
-- RLS, so no policy changes needed.
CREATE OR REPLACE FUNCTION decrement_menu_item_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE menu_items
  SET stock_quantity = GREATEST(stock_quantity - NEW.quantity, 0)
  WHERE id = NEW.menu_item_id
    AND track_inventory = true
    AND stock_quantity IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decrement_stock ON order_items;
CREATE TRIGGER trg_decrement_stock
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION decrement_menu_item_stock();

-- ── Restock on cancellation ──────────────────────────────────────────────
-- Guards against double-restock from idempotent status updates by requiring
-- the OLD status to be non-cancelled.
CREATE OR REPLACE FUNCTION restock_menu_items_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE menu_items mi
  SET stock_quantity = mi.stock_quantity + oi.quantity
  FROM order_items oi
  WHERE oi.order_id = NEW.id
    AND mi.id = oi.menu_item_id
    AND mi.track_inventory = true
    AND mi.stock_quantity IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_restock_on_cancel ON orders;
CREATE TRIGGER trg_restock_on_cancel
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION restock_menu_items_on_cancel();
