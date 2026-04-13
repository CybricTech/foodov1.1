-- Widen sms_logs.event_type CHECK constraint to include all values
-- used by the send-sms edge function.
-- Original constraint only had: 'order_confirmation', 'order_status_update', 'marketing'
-- The function passes the raw payload eventType which uses the values below.

ALTER TABLE sms_logs
  DROP CONSTRAINT IF EXISTS sms_logs_event_type_check;

ALTER TABLE sms_logs
  ADD CONSTRAINT sms_logs_event_type_check
  CHECK (event_type IN (
    -- legacy values (kept for existing rows)
    'order_confirmation',
    'order_status_update',
    'marketing',
    -- values used by send-sms function
    'order_confirmed',
    'order_preparing',
    'order_ready',
    'order_in_transit',
    'order_delivered',
    'order_cancelled',
    'new_order_merchant'
  ));
