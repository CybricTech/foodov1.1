-- 1. Widen the provider CHECK constraint to include sendchamp.
--    Original only had: 'termii', 'twilio'

ALTER TABLE sms_logs
  DROP CONSTRAINT IF EXISTS sms_logs_provider_check;

ALTER TABLE sms_logs
  ADD CONSTRAINT sms_logs_provider_check
  CHECK (provider IN ('termii', 'twilio', 'sendchamp'));

-- 2. Store Sendchamp's returned message ID so delivery status can be resolved later.
--    provider_ref already exists on the table but was unused — repurpose it here.
--    No column addition needed; provider_ref TEXT is already present.

-- 3. Ensure recipient_phone is never null on new rows (belt-and-suspenders).
--    The phone alias column (added in 005) is separate; keep both in sync for
--    any code that still reads the alias column.
UPDATE sms_logs
SET phone = recipient_phone
WHERE phone IS NULL AND recipient_phone IS NOT NULL;
