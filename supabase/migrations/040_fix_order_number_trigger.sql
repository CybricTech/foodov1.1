-- ============================================================
-- 040: Fix set_order_number trigger to always fire on INSERT
--
-- The previous trigger had: WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
-- The webhook passes a non-empty fallback placeholder (`FD-${Date.now()}`), so the
-- WHEN condition was never satisfied and the trigger never ran.
-- Removing the WHEN clause makes the trigger always fire, letting it unconditionally
-- override whatever placeholder value the application code passes in.
-- ============================================================

DROP TRIGGER IF EXISTS set_order_number ON orders;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();
