-- ============================================================================
-- Merchant rider contact — the merchant, not ops, is who a Bolt driver calls
-- ============================================================================
-- The Ride Booker API gives a ride one contact: `user: {name, phone}`, the
-- "client" the driver expects to meet at the pickup. There is no sender /
-- receiver split like Bolt Send has in the consumer app. Every automated
-- booking has registered Kitchyn's ops line there (platform_settings.
-- bolt_rider_contact_phone), so every "I'm at the gate, where are you?" call
-- rang ops, who then phoned the merchant to relay it.
--
-- This puts the merchant in that slot. It mirrors what a human gets from Bolt
-- Send's "Receive" flow: the pickup contact is the business holding the food,
-- and the customer (the real receiver) is already in note_to_driver.
--
--   restaurants.rider_contact_phone  — the merchant's choice. NULL means "use my
--                                      WhatsApp number", stored as NULL rather
--                                      than a copy so it keeps following that
--                                      number when it changes.
--   restaurants.rider_contact_selected
--                                    — admin-only, per store: "use this store's
--                                      number". Picked from one list in admin
--                                      Settings › Dispatch.
--   platform_settings.bolt_rider_contact_mode
--                                    — admin-only rollout switch:
--                                      ops      = every driver calls ops (the
--                                                 kill switch)
--                                      selected = selected stores call the
--                                                 merchant (the default)
--                                      merchant = every store calls the merchant
--   bolt_rides.rider_contact_source / rider_contact_phone
--                                    — whose number each ride actually went out
--                                      with. With these, "did no-shows drop once
--                                      drivers called the merchant?" becomes a
--                                      query (CLIENT_DID_NOT_SHOW by source). So
--                                      far it has only been an anecdote.
--
-- Ships as a no-op: mode defaults to 'selected' and no store is selected, so
-- every booking keeps using the ops line until an admin switches a store on.
-- 'selected' is the default rather than 'ops' so that switching a store on in
-- the list is the only step. With 'ops' as the default, the list would look
-- like it worked while silently doing nothing. The app reads all of these
-- defensively, so deploying code before or after this migration is safe
-- either way.
--
-- Resolution logic lives in packages/utils/src/rider-contact.ts (tested).
-- ============================================================================

-- ── 1. The merchant's choice ────────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rider_contact_phone TEXT;

-- Same pattern as NIGERIAN_MOBILE_E164_RE in rider-contact.ts. Merchants write
-- restaurants directly through PostgREST under RLS (settings-client, mobile),
-- so the API route's validation alone isn't a guarantee. This is. A number a
-- rider can't ring would quietly drop the booking back to ops anyway, but
-- rejecting it at write time tells the merchant while they can still fix it.
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_rider_contact_phone_format;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_rider_contact_phone_format
  CHECK (rider_contact_phone IS NULL OR rider_contact_phone ~ '^\+234[789][01][0-9]{8}$');

COMMENT ON COLUMN restaurants.rider_contact_phone IS
  'Number a Bolt driver calls when collecting from this store, as E.164 Nigerian mobile. NULL = use whatsapp_number. Merchant-editable (Settings › Rider contact). Only used once the rollout includes the store — see platform_settings.bolt_rider_contact_mode.';

-- ── 2. The rollout ──────────────────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rider_contact_selected BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurants.rider_contact_selected IS
  'Admin-only "use this store''s number". When platform_settings.bolt_rider_contact_mode = ''selected'', only stores with this set give drivers the merchant''s number. Ignored in ''ops'' and ''merchant'' modes. Guarded against merchant writes by guard_restaurant_privileged_columns.';

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS bolt_rider_contact_mode TEXT NOT NULL DEFAULT 'selected';

ALTER TABLE platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_bolt_rider_contact_mode_check;
ALTER TABLE platform_settings
  ADD CONSTRAINT platform_settings_bolt_rider_contact_mode_check
  CHECK (bolt_rider_contact_mode IN ('ops', 'selected', 'merchant'));

COMMENT ON COLUMN platform_settings.bolt_rider_contact_mode IS
  'Whose phone a Bolt driver gets for the pickup. ops = bolt_rider_contact_phone for every store (pre-20261002 behaviour); selected = the merchant''s number for stores with restaurants.rider_contact_selected, ops for the rest; merchant = the merchant''s number for every store. A store with no usable number always falls back to ops.';

COMMENT ON COLUMN platform_settings.bolt_rider_contact_phone IS
  'Kitchyn ops line. Registered as the Bolt "client" for every store not using its own number: all stores while bolt_rider_contact_mode = ''ops'', unselected stores while ''selected'', and any store whose own number is missing or unusable. Editable from admin Settings › Dispatch; takes effect on the next booking.';

-- The selection flag decides whose phone a stranger is handed. A merchant
-- shouldn't be able to select themselves before ops has checked their number
-- is one that gets answered, and they shouldn't be able to deselect themselves
-- without a conversation either. Adding it to the existing privileged-columns
-- guard (20260809102158) keeps one guard rather than starting a second.
--
-- Recreated verbatim from 20260809102158 with one line added. It stays
-- SECURITY INVOKER: as DEFINER, current_user is the owner and the bypass would
-- match for everyone (the bug that migration fixed).
CREATE OR REPLACE FUNCTION public.guard_restaurant_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN new;
  END IF;

  IF new.bank_account_number      IS DISTINCT FROM old.bank_account_number
  OR new.bank_account_name        IS DISTINCT FROM old.bank_account_name
  OR new.bank_code                IS DISTINCT FROM old.bank_code
  OR new.paystack_recipient_code  IS DISTINCT FROM old.paystack_recipient_code
  OR new.auto_payout_enabled      IS DISTINCT FROM old.auto_payout_enabled
  OR new.monnify_bank_verified_at IS DISTINCT FROM old.monnify_bank_verified_at
  OR new.delivery_commission_pct  IS DISTINCT FROM old.delivery_commission_pct
  OR new.restaurant_base_fee_kobo   IS DISTINCT FROM old.restaurant_base_fee_kobo
  OR new.restaurant_per_km_rate_kobo IS DISTINCT FROM old.restaurant_per_km_rate_kobo
  OR new.restaurant_max_fee_kobo  IS DISTINCT FROM old.restaurant_max_fee_kobo
  OR new.delivery_fee             IS DISTINCT FROM old.delivery_fee
  OR new.vat_percentage           IS DISTINCT FROM old.vat_percentage
  OR new.is_test                  IS DISTINCT FROM old.is_test
  OR new.is_active                IS DISTINCT FROM old.is_active
  OR new.slug                     IS DISTINCT FROM old.slug
  OR new.dispatch_policy          IS DISTINCT FROM old.dispatch_policy
  OR new.logistics_default        IS DISTINCT FROM old.logistics_default
  OR new.rider_contact_selected   IS DISTINCT FROM old.rider_contact_selected
  THEN
    RAISE EXCEPTION 'restaurant_guard: % may not change privileged columns', current_user
      USING errcode = 'insufficient_privilege';
  END IF;

  RETURN new;
END;
$$;

-- ── 3. What each ride actually went out with ────────────────────────────────
ALTER TABLE bolt_rides
  ADD COLUMN IF NOT EXISTS rider_contact_source TEXT,
  ADD COLUMN IF NOT EXISTS rider_contact_phone  TEXT;

ALTER TABLE bolt_rides
  DROP CONSTRAINT IF EXISTS bolt_rides_rider_contact_source_check;
ALTER TABLE bolt_rides
  ADD CONSTRAINT bolt_rides_rider_contact_source_check
  CHECK (rider_contact_source IS NULL
         OR rider_contact_source IN ('ops', 'merchant_whatsapp', 'merchant_custom'));

COMMENT ON COLUMN bolt_rides.rider_contact_source IS
  'Whose phone was registered as the Bolt "client": ops = Kitchyn line; merchant_whatsapp = the store''s WhatsApp number; merchant_custom = the store''s chosen rider number. NULL for rides booked before 20261002.';
COMMENT ON COLUMN bolt_rides.rider_contact_phone IS
  'The exact number sent as user.phone on this ride, so a later change to the store''s settings can''t rewrite history.';

-- ── 4. Audit trail ──────────────────────────────────────────────────────────
-- Both new restaurant columns join the watched list: one is who strangers are
-- told to ring, the other is an admin decision about who's allowed to be rung.
-- Recreated from 20260809120000 with the two columns appended.
DROP TRIGGER IF EXISTS log_activity_restaurants ON public.restaurants;
CREATE TRIGGER log_activity_restaurants
  AFTER UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.log_activity(
    'is_active', 'slug', 'accepts_orders', 'accepts_delivery', 'accepts_pickup',
    'delivery_fee', 'min_order_amount', 'vat_percentage', 'delivery_commission_pct',
    'bank_account_number', 'bank_account_name', 'bank_code', 'paystack_recipient_code',
    'auto_payout_enabled', 'dispatch_policy', 'opening_hours', 'closure_message',
    'rider_contact_phone', 'rider_contact_selected');
