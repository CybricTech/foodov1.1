-- ============================================================
-- 036: Backfill estimated_delivery_at for existing open orders
-- For every non-terminal order with NULL ETA, compute from
-- MAX(prep_time_minutes) of its items + 30m delivery buffer.
-- Terminal orders are left untouched.
-- ============================================================

WITH order_prep AS (
  SELECT
    o.id AS order_id,
    o.created_at,
    o.fulfillment_type,
    COALESCE(
      MAX(mi.prep_time_minutes),
      20  -- default 20m if all items have NULL prep_time
    ) AS max_prep_minutes
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.estimated_delivery_at IS NULL
    AND o.status NOT IN ('delivered', 'cancelled')
  GROUP BY o.id, o.created_at, o.fulfillment_type
),
with_buffer AS (
  SELECT
    order_id,
    created_at,
    max_prep_minutes +
      CASE WHEN fulfillment_type = 'delivery' THEN 30 ELSE 0 END
      AS total_minutes
  FROM order_prep
)
UPDATE orders
SET
  estimated_delivery_at = with_buffer.created_at + (with_buffer.total_minutes || ' minutes')::interval,
  updated_at = NOW()
FROM with_buffer
WHERE orders.id = with_buffer.order_id;
