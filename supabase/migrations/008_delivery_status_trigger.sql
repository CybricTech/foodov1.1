-- Migration 008: Sync delivery_assignments.status → orders status fields
-- When a rider updates their assignment status, the corresponding order should
-- automatically reflect the delivery progress on the merchant dashboard.

-- Add delivery_status column to orders if not present
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status text;

-- Function: sync assignment status changes to orders
CREATE OR REPLACE FUNCTION sync_order_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only proceed if status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  UPDATE orders
  SET
    delivery_status = NEW.status,
    status = CASE NEW.status
      WHEN 'accepted'   THEN 'confirmed'
      WHEN 'picked_up'  THEN 'out_for_delivery'
      WHEN 'delivered'  THEN 'delivered'
      WHEN 'cancelled'  THEN 'cancelled'
      ELSE status  -- don't change orders.status for unknown values
    END,
    updated_at = NOW()
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

-- Trigger: fires after each assignment status update
DROP TRIGGER IF EXISTS on_assignment_status_change ON delivery_assignments;

CREATE TRIGGER on_assignment_status_change
  AFTER UPDATE OF status
  ON delivery_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_delivery_status();

-- Also fire on INSERT (initial dispatch sets status = 'pending')
DROP TRIGGER IF EXISTS on_assignment_insert ON delivery_assignments;

CREATE TRIGGER on_assignment_insert
  AFTER INSERT
  ON delivery_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_delivery_status();
