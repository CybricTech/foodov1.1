-- ============================================================================
-- 106: Allow 'interakt' as an sms_logs provider
-- ============================================================================
-- Merchant WhatsApp order alerts move from Termii's WhatsApp channel to
-- Interakt (a Meta WhatsApp Business API BSP). Every send writes an sms_logs
-- row, and sms_logs_provider_check currently allows only termii/twilio/
-- sendchamp — so without this the very first Interakt send fails on insert.
--
-- 'twilio' is DELIBERATELY KEPT in the allowed set even though the Twilio
-- send path is being removed from the edge function. Historical rows already
-- carry provider = 'twilio' (verified in production), and dropping the value
-- would make the new constraint invalid against existing data. The constraint
-- describes what the column has ever held, not what we still write.
-- ============================================================================

ALTER TABLE sms_logs
  DROP CONSTRAINT IF EXISTS sms_logs_provider_check;

ALTER TABLE sms_logs
  ADD CONSTRAINT sms_logs_provider_check
  CHECK (provider IN ('termii', 'twilio', 'sendchamp', 'interakt'));
