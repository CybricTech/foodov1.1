-- Security hardening after the 2026-08-08 incident.
--
-- Root cause of the breach: `user_profiles_own` was declared FOR ALL with no
-- WITH CHECK. Postgres then reuses the USING expression as the write check, so
-- the only thing validated on a write was `id = auth.uid()` — the `role` column
-- was never constrained. Combined with anon/authenticated holding INSERT+UPDATE
-- on every column, any self-signed-up user could stamp themselves `super_admin`.
--
-- DESIGN NOTE — why there are no column-level SELECT grants here:
-- revoking table-level SELECT and granting a column whitelist DOES NOT work with
-- PostgREST. Verified empirically on this project: with table SELECT revoked,
-- `select=*` returns `42501 permission denied for table`, and so does an
-- explicit request for a whitelisted column. The merchant banking columns on
-- `restaurants` therefore cannot be hidden this way — that needs an app-side
-- change. Write protection is enforced with a trigger instead, which is
-- independent of PostgREST behaviour.

-- 1. user_profiles — the privilege-escalation hole (CRITICAL)
-- Every profile write in the app goes through a server-side /api/ route on the
-- service client, which bypasses RLS. The one browser-side write is the
-- changelog "seen" stamp in components/dashboard/whats-new.tsx, so that column
-- is granted back. SELECT stays at table level (see DESIGN NOTE).
revoke insert, update, delete on public.user_profiles from anon, authenticated;
grant  update (last_seen_changelog_at) on public.user_profiles to authenticated;

drop policy if exists user_profiles_own on public.user_profiles;

create policy user_profiles_own_select on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy user_profiles_own_update on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2. restaurants — merchants could rewrite their own money columns.
-- `restaurants_merchant_update` had no WITH CHECK and no column scope, so a
-- merchant_owner could zero their delivery_commission_pct or change their
-- payout bank account straight over the REST API.
drop policy if exists restaurants_merchant_update on public.restaurants;
create policy restaurants_merchant_update on public.restaurants
  for update to authenticated
  using (id = get_my_restaurant_id())
  with check (id = get_my_restaurant_id());

-- NOTE: created SECURITY DEFINER here, which was wrong — see the
-- fix_restaurant_guard_security_invoker migration that follows.
create or replace function public.guard_restaurant_privileged_columns()
returns trigger
language plpgsql
security definer
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
    raise exception 'restaurant_guard: % is not permitted to change privileged columns', current_user
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_restaurant_privileged_columns_trg on public.restaurants;
create trigger guard_restaurant_privileged_columns_trg
  before update on public.restaurants
  for each row execute function public.guard_restaurant_privileged_columns();

-- 3. delivery_assignments — latent share-link leak.
-- `USING (share_link_token IS NOT NULL)` exposes EVERY row that has a token,
-- not just the one whose token was presented. No rows carry tokens today, so
-- nothing is leaking yet — but it would open all 844 the moment the feature
-- ships. Share-link lookups belong in a server route keyed on the token.
drop policy if exists delivery_assignments_share_link_read on public.delivery_assignments;

-- 4. reviews — WITH CHECK (true) let anyone inject reviews for any restaurant.
drop policy if exists reviews_public_insert on public.reviews;

-- 5. SECURITY DEFINER / money functions exposed over the API.
-- Verified against the codebase: every caller is a server-side route on the
-- service client, so no app path depends on anon/authenticated EXECUTE.
--   finance_*       — any signed-in merchant could read platform-wide revenue
--   redeem_discount — anyone could burn a merchant's discount allocation
--   wallet fns      — direct writes against merchant balances
-- NOTE: these revokes were largely INEFFECTIVE because EXECUTE was still held
-- by PUBLIC; see the rls_hardening_function_execute migration that follows.
revoke execute on function public.finance_summary(timestamptz, timestamptz)         from anon, authenticated;
revoke execute on function public.finance_daily(timestamptz, timestamptz)           from anon, authenticated;
revoke execute on function public.finance_per_merchant(timestamptz, timestamptz)    from anon, authenticated;
revoke execute on function public.finance_order_economics(timestamptz, timestamptz) from anon, authenticated;

revoke execute on function public.upsert_customer(uuid, text, text, text, bigint)   from anon, authenticated;
revoke execute on function public.redeem_discount(uuid)                             from anon, authenticated;
revoke execute on function public.loyalty_accrue_for_order(uuid)                    from anon, authenticated;
revoke execute on function public.loyalty_balance(uuid, text)                       from anon, authenticated;
revoke execute on function public.loyalty_program_participants(uuid)                from anon, authenticated;

revoke execute on function public.increment_wallet_pending(uuid, bigint)            from anon, authenticated;
revoke execute on function public.debit_wallet_for_settlement(uuid, bigint)         from anon, authenticated;
revoke execute on function public.restore_failed_settlement(uuid, bigint)           from anon, authenticated;
revoke execute on function public.recompute_restaurant_wallet(uuid)                 from anon, authenticated;
revoke execute on function public.recompute_all_restaurant_wallets()                from anon, authenticated;
revoke execute on function public.release_pending_wallet_balances()                 from anon, authenticated;

revoke execute on function public.mark_late_orders()                                from anon, authenticated;
revoke execute on function public.activate_scheduled_orders()                       from anon, authenticated;
revoke execute on function public.foodo_order_net_kobo(bigint, bigint, bigint, bigint, bigint, text, numeric, numeric) from anon, authenticated;
revoke execute on function public.foodo_resolved_dispatch_type(uuid)                from anon, authenticated;

-- 6. Defence in depth — anon holds no write grant anywhere.
-- anon had INSERT/UPDATE/DELETE on all 32 tables; only RLS stood in the way,
-- and one bad policy is exactly how this incident happened. Nothing in the app
-- writes as anon — checkout and webhooks are all service-role.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
