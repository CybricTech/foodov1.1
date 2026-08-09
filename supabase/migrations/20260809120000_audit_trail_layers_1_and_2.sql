-- Audit trail, layers 1 and 2.
--
-- WHY: after the 2026-08-08 breach we could not answer "who signed in, when,
-- from where" beyond 24 hours — auth.audit_log_entries is empty on this project
-- and the Supabase log API only retains a day. The existing `audit_logs` table
-- is effectively an ADMIN log: 22 of its 25 write sites are /api/admin/*, and
-- the only merchant actions recorded are staff management.
--
-- Critically, ten merchant write paths go straight from the browser to
-- PostgREST (menu-manager-client, order-queue-client, frontline-orders-client,
-- settings-client, store-status-control, marketing-client, loyalty-config …),
-- so they can never be covered by application-level logging. Menu price changes
-- and order deletion were both invisible. That is why layer 2 is enforced with
-- database triggers rather than in the app.
--
-- COST: ~13 orders/day and ~29 sign-ins/day on this project, so this is roughly
-- 150-200 rows/day (~7 MB/month). Triggers add ~0.1-0.3ms per write and cost
-- Vercel nothing. Deliberately NOT added to the supabase_realtime publication —
-- that publication is `puballtables = false`, and WAL polling was the root cause
-- of the 2026-06-11 usage-exhaustion incident.

-- ===========================================================================
-- Layer 1 — authentication events
-- ===========================================================================
create table if not exists public.auth_events (
  id          bigserial primary key,
  user_id     uuid,
  email       text,          -- denormalised so the trail survives user deletion
  event       text not null check (event in ('sign_in', 'sign_out')),
  session_id  uuid,
  ip          inet,          -- personal data: scrubbed after 90 days, see below
  user_agent  text,
  created_at  timestamptz not null default now()
);

comment on table public.auth_events is
  'Permanent sign-in/sign-out history. Fed by triggers on auth.sessions, which '
  'already carries ip and user_agent. Note: a sign_out row is also written when '
  'Supabase prunes an expired session, so sign_out is "session ended", not '
  'strictly "user clicked log out".';

create index if not exists auth_events_user_created_idx on public.auth_events (user_id, created_at desc);
create index if not exists auth_events_created_idx      on public.auth_events (created_at);

create or replace function public.record_auth_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid;
  v_sid   uuid;
  v_ip    inet;
  v_ua    text;
  v_event text;
  v_email text;
begin
  if tg_op = 'INSERT' then
    v_event := 'sign_in';
    v_uid := new.user_id; v_sid := new.id; v_ip := new.ip; v_ua := new.user_agent;
  else
    v_event := 'sign_out';
    v_uid := old.user_id; v_sid := old.id; v_ip := old.ip; v_ua := old.user_agent;
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.auth_events (user_id, email, event, session_id, ip, user_agent)
  values (v_uid, v_email, v_event, v_sid, v_ip, v_ua);

  return null;
exception when others then
  -- Auditing must never be able to block authentication.
  return null;
end;
$$;

drop trigger if exists record_auth_signin  on auth.sessions;
drop trigger if exists record_auth_signout on auth.sessions;
create trigger record_auth_signin  after insert on auth.sessions for each row execute function public.record_auth_event();
create trigger record_auth_signout after delete on auth.sessions for each row execute function public.record_auth_event();

-- ===========================================================================
-- Layer 2 — data-change trail
-- ===========================================================================
create table if not exists public.activity_log (
  id            bigserial primary key,
  table_name    text not null,
  record_id     uuid,
  operation     text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id      uuid,   -- null when written by a server route / cron (see below)
  actor_role    text,   -- authenticated | anon | service | …
  restaurant_id uuid,
  changes       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.activity_log is
  'Row-level change trail for sensitive tables, written by database triggers so '
  'that browser-direct writes are covered too. Only the watched columns declared '
  'per trigger are diffed. ACTOR ATTRIBUTION: browser writes carry a JWT so '
  'actor_id resolves; writes made by server routes on the service client have no '
  'JWT, so actor_id is null and actor_role is "service". Those routes can opt in '
  'by calling set_config(''app.actor_id'', <uuid>, true) in the same transaction, '
  'which this function prefers over the JWT subject.';

create index if not exists activity_log_restaurant_idx on public.activity_log (restaurant_id, created_at desc);
create index if not exists activity_log_actor_idx      on public.activity_log (actor_id, created_at desc);
create index if not exists activity_log_record_idx     on public.activity_log (table_name, record_id);
create index if not exists activity_log_created_idx    on public.activity_log (created_at);

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_rec     jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_col     text;
  v_o       jsonb;
  v_n       jsonb;
  v_claims  jsonb;
  v_actor   uuid;
  v_role    text;
  v_id      uuid;
  v_rest    uuid;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_rec := coalesce(v_new, v_old);

  foreach v_col in array tg_argv loop
    v_o := v_old -> v_col;
    v_n := v_new -> v_col;

    if tg_op = 'UPDATE' then
      if v_o is distinct from v_n then
        v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('old', v_o, 'new', v_n));
      end if;
    elsif tg_op = 'INSERT' then
      if v_n is not null and v_n <> 'null'::jsonb then
        v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('new', v_n));
      end if;
    else
      if v_o is not null and v_o <> 'null'::jsonb then
        v_changes := v_changes || jsonb_build_object(v_col, jsonb_build_object('old', v_o));
      end if;
    end if;
  end loop;

  -- No watched column moved — write nothing. This is what keeps volume sane on
  -- high-churn tables like orders, which are updated constantly for reasons we
  -- do not care about (rider_alert_sent_at, updated_at, …).
  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  begin
    v_actor := coalesce(
      nullif(current_setting('app.actor_id', true), '')::uuid,
      nullif(v_claims ->> 'sub', '')::uuid
    );
  exception when others then
    v_actor := null;
  end;

  v_role := coalesce(v_claims ->> 'role', 'service');
  v_id   := nullif(v_rec ->> 'id', '')::uuid;

  -- restaurants is its own tenant; everything else carries restaurant_id.
  if tg_table_name = 'restaurants' then
    v_rest := v_id;
  else
    begin
      v_rest := nullif(v_rec ->> 'restaurant_id', '')::uuid;
    exception when others then
      v_rest := null;
    end;
  end if;

  insert into public.activity_log
    (table_name, record_id, operation, actor_id, actor_role, restaurant_id, changes)
  values
    (tg_table_name, v_id, tg_op, v_actor, v_role, v_rest, v_changes);

  return null;
exception when others then
  -- Auditing must never be able to break a business write.
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attach per table. The trigger arguments are the WATCHED COLUMNS — anything
-- not listed is ignored entirely, which is the volume control.
-- ---------------------------------------------------------------------------

-- user_profiles: this is the table the attacker escalated through.
drop trigger if exists log_activity_user_profiles on public.user_profiles;
create trigger log_activity_user_profiles
  after insert or update or delete on public.user_profiles
  for each row execute function public.log_activity('role', 'restaurant_id', 'is_active', 'email', 'phone');

-- orders: UPDATE/DELETE only. Creation is ordinary checkout and already fully
-- represented in the orders table; deletion is the thing worth catching
-- (frontline-orders-client can delete straight from the browser).
drop trigger if exists log_activity_orders on public.orders;
create trigger log_activity_orders
  after update or delete on public.orders
  for each row execute function public.log_activity(
    'status', 'payment_status', 'dispatch_type', 'dispatch_state', 'rider_id',
    'cancellation_reason', 'total_kobo', 'discount_kobo', 'scheduled_for', 'settlement_id');

-- menu_items: price and availability are the merchant-facing money levers.
drop trigger if exists log_activity_menu_items on public.menu_items;
create trigger log_activity_menu_items
  after insert or update or delete on public.menu_items
  for each row execute function public.log_activity(
    'name', 'price_kobo', 'is_available', 'track_inventory', 'stock_quantity', 'is_addon_only');

-- restaurants: commercial terms, banking, and store state.
drop trigger if exists log_activity_restaurants on public.restaurants;
create trigger log_activity_restaurants
  after update on public.restaurants
  for each row execute function public.log_activity(
    'is_active', 'slug', 'accepts_orders', 'accepts_delivery', 'accepts_pickup',
    'delivery_fee', 'min_order_amount', 'vat_percentage', 'delivery_commission_pct',
    'bank_account_number', 'bank_account_name', 'bank_code', 'paystack_recipient_code',
    'auto_payout_enabled', 'dispatch_policy', 'opening_hours', 'closure_message');

drop trigger if exists log_activity_discounts on public.discounts;
create trigger log_activity_discounts
  after insert or update or delete on public.discounts
  for each row execute function public.log_activity(
    'code', 'type', 'value', 'is_active', 'min_order_kobo', 'max_discount_kobo',
    'usage_limit_total', 'ends_at', 'archived_at');

drop trigger if exists log_activity_loyalty_programs on public.loyalty_programs;
create trigger log_activity_loyalty_programs
  after insert or update or delete on public.loyalty_programs
  for each row execute function public.log_activity(
    'is_active', 'stamps_required', 'reward_type', 'reward_value',
    'reward_max_discount_kobo', 'earn_min_order_kobo');

drop trigger if exists log_activity_settlements on public.settlements;
create trigger log_activity_settlements
  after insert or update or delete on public.settlements
  for each row execute function public.log_activity(
    'status', 'amount_kobo', 'canonical_net_kobo', 'bank_reference',
    'paystack_transfer_code', 'settlement_type');

-- wallet_transactions: UPDATE/DELETE only. Inserts are the normal ledger flow
-- (4k rows and growing); logging them would just double the table for no signal.
-- After-the-fact mutation of a ledger row is the interesting event.
drop trigger if exists log_activity_wallet_transactions on public.wallet_transactions;
create trigger log_activity_wallet_transactions
  after update or delete on public.wallet_transactions
  for each row execute function public.log_activity(
    'status', 'amount_kobo', 'direction', 'type', 'available_at');

-- ===========================================================================
-- Access control — audit data is read-only to everyone but the service role
-- ===========================================================================
alter table public.auth_events  enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.auth_events  from anon, authenticated;
revoke all on public.activity_log from anon, authenticated;

-- SELECT is granted but gated by RLS to super_admin, so an admin UI can read it
-- with the caller's own session. Nobody but service_role may ever write.
grant select on public.auth_events  to authenticated;
grant select on public.activity_log to authenticated;
grant all    on public.auth_events  to service_role;
grant all    on public.activity_log to service_role;
grant usage, select on sequence public.auth_events_id_seq  to service_role;
grant usage, select on sequence public.activity_log_id_seq to service_role;

drop policy if exists auth_events_admin_read on public.auth_events;
create policy auth_events_admin_read on public.auth_events
  for select to authenticated using (get_my_role() = 'super_admin');

drop policy if exists activity_log_admin_read on public.activity_log;
create policy activity_log_admin_read on public.activity_log
  for select to authenticated using (get_my_role() = 'super_admin');

-- ===========================================================================
-- Retention — 24 months of trail, IP/user-agent scrubbed at 90 days
-- ===========================================================================
-- IP addresses are personal data under the NDPR. Keeping them indefinitely is
-- hard to justify; 90 days covers incident investigation, and the business
-- trail itself is kept for 24 months for settlement disputes.
create or replace function public.prune_audit_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_log where created_at < now() - interval '24 months';
  delete from public.auth_events  where created_at < now() - interval '24 months';

  update public.auth_events
     set ip = null, user_agent = null
   where created_at < now() - interval '90 days'
     and (ip is not null or user_agent is not null);
end;
$$;

revoke all on function public.prune_audit_data() from public, anon, authenticated;
grant execute on function public.prune_audit_data() to service_role;

select cron.schedule('prune-audit-data', '30 3 * * *', 'SELECT public.prune_audit_data();');
