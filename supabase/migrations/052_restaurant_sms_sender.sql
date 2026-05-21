-- Per-restaurant Sendchamp SMS sender IDs.
--
-- Status flow:
--   NULL                       — never requested
--   'pending'                  — registered with Sendchamp, awaiting approval
--   'approved'                 — admin marked approved after checking Sendchamp dashboard
--   'rejected'                 — admin marked rejected
--
-- When sms_sender_status != 'approved', sends fall back to SENDCHAMP_DEFAULT_SENDER_ID.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS sms_sender_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS sms_sender_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS sms_sender_requested_at TIMESTAMPTZ NULL;

ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_sms_sender_status_check;

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_sms_sender_status_check
  CHECK (sms_sender_status IS NULL OR sms_sender_status IN ('pending', 'approved', 'rejected'));
