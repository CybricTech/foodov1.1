-- Add admin alert email to platform_settings
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS admin_alert_email TEXT;

COMMENT ON COLUMN platform_settings.admin_alert_email IS
  'Platform admin email address. Receives a copy of every new order
   alert across all restaurants. If null, no admin email is sent.';

-- Add notification email to restaurants for merchant order alerts
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS notification_email TEXT;

COMMENT ON COLUMN restaurants.notification_email IS
  'Email address for order alert notifications. Falls back to the
   merchant owner email from user_profiles if not set.';
