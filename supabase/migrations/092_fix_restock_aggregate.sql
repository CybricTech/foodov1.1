-- ============================================================
-- 092 — Fix restock-on-cancel to aggregate duplicate line items
-- ============================================================
-- The 091 restock trigger used `UPDATE menu_items ... FROM order_items` with a
-- join that can match MULTIPLE order_items rows to one menu_item — the same
-- menu_item_id legitimately appears on several lines when a product is added
-- more than once with different modifiers (e.g. "Burger + extra cheese" and
-- "Burger + no onions" are two order_items rows, one menu_item_id).
--
-- Postgres `UPDATE ... FROM` applies only ONE arbitrary matching join row per
-- target row (it does not sum), so the restock added back a single line's
-- quantity instead of the total — silently leaking stock on every such
-- cancellation. The decrement trigger is AFTER INSERT FOR EACH ROW and already
-- sums correctly across lines, so the two sides were asymmetric.
--
-- Fix: aggregate the per-item quantity in a subquery first, so exactly one row
-- joins to each menu_item and the full order quantity is restored. The trigger
-- trg_restock_on_cancel (091) already points at this function by name, so a
-- CREATE OR REPLACE is all that's needed — no trigger change.
-- ============================================================

CREATE OR REPLACE FUNCTION restock_menu_items_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE menu_items mi
  SET stock_quantity = mi.stock_quantity + agg.qty
  FROM (
    SELECT menu_item_id, SUM(quantity) AS qty
    FROM order_items
    WHERE order_id = NEW.id
    GROUP BY menu_item_id
  ) agg
  WHERE mi.id = agg.menu_item_id
    AND mi.track_inventory = true
    AND mi.stock_quantity IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
