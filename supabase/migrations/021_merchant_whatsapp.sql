-- WhatsApp merchant order alerts
-- restaurants.whatsapp_number already exists from 012_social_links.sql (no-op).
-- Add admin_whatsapp_number to platform_settings, channel to sms_logs.

-- ── Admin WhatsApp alert number ───────────────────────────────────────────────
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS admin_whatsapp_number TEXT;

COMMENT ON COLUMN platform_settings.admin_whatsapp_number IS
  'Platform admin WhatsApp number. Receives a copy of every new order alert
   across all restaurants on the platform. E.164 format.';

-- ── Track SMS vs WhatsApp channel on sms_logs ─────────────────────────────────
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('sms', 'whatsapp'));
