-- The guard added in 20260809101638_rls_hardening was created SECURITY DEFINER,
-- which makes current_user resolve to the function OWNER (postgres) rather than
-- the calling role — so the "service_role bypass" branch matched for everyone
-- and the guard never fired.
--
-- Verified by probe before the fix (impersonating a merchant_owner via
-- `set local role authenticated`):
--     commission_blocked=f  bank_blocked=f  safe_allowed=t
-- and after:
--     commission_blocked=t  bank_blocked=t  safe_allowed=t
--
-- This trigger only compares OLD/NEW, so SECURITY INVOKER is the correct choice
-- and makes current_user the actual caller.
create or replace function public.guard_restaurant_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if new.bank_account_number      is distinct from old.bank_account_number
  or new.bank_account_name        is distinct from old.bank_account_name
  or new.bank_code                is distinct from old.bank_code
  or new.paystack_recipient_code  is distinct from old.paystack_recipient_code
  or new.auto_payout_enabled      is distinct from old.auto_payout_enabled
  or new.monnify_bank_verified_at is distinct from old.monnify_bank_verified_at
  or new.delivery_commission_pct  is distinct from old.delivery_commission_pct
  or new.restaurant_base_fee_kobo   is distinct from old.restaurant_base_fee_kobo
  or new.restaurant_per_km_rate_kobo is distinct from old.restaurant_per_km_rate_kobo
  or new.restaurant_max_fee_kobo  is distinct from old.restaurant_max_fee_kobo
  or new.delivery_fee             is distinct from old.delivery_fee
  or new.vat_percentage           is distinct from old.vat_percentage
  or new.is_test                  is distinct from old.is_test
  or new.is_active                is distinct from old.is_active
  or new.slug                     is distinct from old.slug
  or new.dispatch_policy          is distinct from old.dispatch_policy
  or new.logistics_default        is distinct from old.logistics_default
  then
    raise exception 'restaurant_guard: % may not change privileged columns', current_user
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
