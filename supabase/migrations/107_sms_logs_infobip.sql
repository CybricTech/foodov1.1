-- ============================================================================
-- 107: Allow 'infobip' as an sms_logs provider
-- ============================================================================
-- Merchant WhatsApp order alerts move from Interakt to Infobip as the Meta
-- WhatsApp Business API BSP. Every send writes an sms_logs row, and
-- sms_logs_provider_check would reject 'infobip', failing the insert.
--
-- 'interakt' (106) and 'twilio' are KEPT even though neither has a live send
-- path: dropping a value that historical rows may carry would make the new
-- constraint invalid against existing data. The constraint describes what the
-- column has ever held, not what we still write.
-- ============================================================================

ALTER TABLE sms_logs
  DROP CONSTRAINT IF EXISTS sms_logs_provider_check;

ALTER TABLE sms_logs
  ADD CONSTRAINT sms_logs_provider_check
  CHECK (provider IN ('termii', 'twilio', 'sendchamp', 'interakt', 'infobip'));
