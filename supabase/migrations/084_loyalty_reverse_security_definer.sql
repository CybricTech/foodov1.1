-- ============================================================
-- 084: Fix "Failed to cancel order" for merchants on loyalty restaurants.
--
-- The dashboard cancel button writes to orders DIRECTLY from the browser
-- (order-queue-client.tsx), i.e. as the merchant's `authenticated` role —
-- unlike every other order mutation, which goes through a service-role API
-- route. That UPDATE fires trg_loyalty_award -> loyalty_award_on_order(),
-- which INSERTs a reversal row into loyalty_stamps.
--
-- loyalty_stamps has no INSERT policy for merchants (only merchant SELECT +
-- super_admin ALL), and the trigger function was NOT security definer, so the
-- insert ran as `authenticated` and tripped RLS:
--   new row violates row-level security policy for table "loyalty_stamps"
-- which aborted the whole cancel. This only bit orders that had earned a stamp
-- under an active program (otherwise the trigger early-returns), which is why
-- it looked intermittent.
--
-- 075's own comment assumed "all order writes flow through the service role,
-- so these inserts bypass RLS as intended" — true for earn/redeem, false for
-- the client-side cancel. Make the function SECURITY DEFINER so the reversal
-- insert runs as the owner and bypasses RLS regardless of caller. Body is
-- otherwise identical to 079.
-- ============================================================

CREATE OR REPLACE FUNCTION loyalty_award_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prog loyalty_programs%ROWTYPE;
  v_reverse INTEGER;
BEGIN
  IF NEW.status <> 'cancelled' OR NEW.customer_phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO prog
  FROM loyalty_programs
  WHERE restaurant_id = NEW.restaurant_id AND is_active;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_reverse
  FROM loyalty_stamps
  WHERE program_id = prog.id AND order_id = NEW.id AND reason <> 'reverse';

  IF v_reverse <> 0 THEN
    INSERT INTO loyalty_stamps (program_id, restaurant_id, customer_phone, order_id, delta, reason)
    VALUES (prog.id, NEW.restaurant_id, NEW.customer_phone, NEW.id, -v_reverse, 'reverse')
    ON CONFLICT ON CONSTRAINT loyalty_stamps_once_per_order DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
