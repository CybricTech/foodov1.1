-- Move the Bolt "rider" contact phone out of a hardcoded constant
-- (apps/web/lib/bolt/book-ride.ts) and into platform_settings, so it can be
-- changed from the admin Settings page without a code deploy. Every automated
-- Bolt booking registers this number as the "rider" Bolt calls/SMSes — until
-- now, changing it meant editing the constant, committing, and pushing to
-- main, same as any other code change.
--
-- Defaulted to the number already live in production so this migration is a
-- no-op for booking behavior; it only adds the ability to change it later
-- without a deploy.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS bolt_rider_contact_phone text
    NOT NULL DEFAULT '+2348063662721'
    CHECK (bolt_rider_contact_phone ~ '^\+[0-9]{10,15}$');

COMMENT ON COLUMN platform_settings.bolt_rider_contact_phone IS
  'Phone number registered as the "rider" on every automated Bolt booking (never the customer''s own number). Editable from admin Settings > Dispatch; takes effect on the very next booking, no deploy required.';
