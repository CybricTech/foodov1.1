-- Tier 3 of the audit trail: turn activity_log / auth_events into alerts
-- instead of data nobody looks at unless they think to ask.
--
-- Detection + claiming lives in SQL because every rule needs a join this table
-- can express cheaply (auth.users, user_profiles, restaurants) and because the
-- claim step must be atomic — the same idempotency idiom already used for rider
-- alerts (orders.rider_alert_sent_at, see lib/telegram.ts): an UPDATE ... SET
-- alerted_at = now() WHERE alerted_at IS NULL ... RETURNING is how a row gets
-- claimed exactly once even if two cron runs overlap. Formatting and sending the
-- Telegram message is left to the Next.js route, which is where
-- escapeTelegramHtml and TELEGRAM_ALERTS_CHAT_ID already live.

alter table public.activity_log add column if not exists alerted_at timestamptz;
alter table public.auth_events  add column if not exists alerted_at timestamptz;

create index if not exists activity_log_unalerted_idx
  on public.activity_log (created_at) where alerted_at is null;
create index if not exists auth_events_unalerted_idx
  on public.auth_events (created_at) where alerted_at is null;

create or replace function public.evaluate_audit_alerts()
returns table (
  rule            text,
  actor_email     text,
  target_email    text,
  restaurant_name text,
  detail          jsonb,
  event_at        timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lookback interval := interval '20 minutes';
begin
  -- ── Rule 1: a role changed on user_profiles by anything other than a
  -- service-role route. This is the exact shape of the 2026-08-08 breach: the
  -- attacker's own browser session, carrying an `authenticated` JWT, wrote
  -- role='super_admin' directly. Legitimate role changes (staff creation,
  -- promotion) always go through /api/dashboard/staff/* or /api/admin/* on the
  -- service client, which carries no JWT — so actor_role is 'service' there.
  return query
  with matched as (
    update public.activity_log a
       set alerted_at = now()
     where a.alerted_at is null
       and a.created_at > now() - v_lookback
       and a.table_name = 'user_profiles'
       and a.changes ? 'role'
       and a.actor_role is distinct from 'service'
    returning a.actor_id, a.record_id, a.changes, a.created_at
  )
  select 'privilege_escalation', au.email, tu.email, null::text, m.changes, m.created_at
  from matched m
  left join auth.users au on au.id = m.actor_id
  left join auth.users tu on tu.id = m.record_id;

  -- ── Rule 2: a merchant's payout details changed outside a service-role
  -- route. Both /api/merchant/banking and /api/admin/restaurants/[id]/banking
  -- run on the service client, so a non-service write to these columns should
  -- not be possible in normal operation.
  return query
  with matched as (
    update public.activity_log a
       set alerted_at = now()
     where a.alerted_at is null
       and a.created_at > now() - v_lookback
       and a.table_name = 'restaurants'
       and a.changes ?| array['bank_account_number', 'bank_account_name', 'bank_code',
                               'paystack_recipient_code', 'auto_payout_enabled']
       and a.actor_role is distinct from 'service'
    returning a.actor_id, a.record_id, a.changes, a.created_at
  )
  select 'bank_details_changed', au.email, null::text, r.name, m.changes, m.created_at
  from matched m
  left join auth.users au on au.id = m.actor_id
  left join public.restaurants r on r.id = m.record_id;

  -- ── Rule 3: a super_admin signed in from an IP never associated with that
  -- account before. Catches credential compromise of a LEGITIMATE admin
  -- account — a different failure mode from rule 1 (a new account escalating
  -- itself). Compares against the account's full auth_events history, not just
  -- the lookback window.
  return query
  with candidates as (
    select e.id, e.user_id, e.email, e.ip, e.user_agent, e.created_at
    from public.auth_events e
    join public.user_profiles p on p.id = e.user_id and p.role = 'super_admin'
    where e.event = 'sign_in'
      and e.alerted_at is null
      and e.created_at > now() - v_lookback
      and e.ip is not null
      and not exists (
        select 1 from public.auth_events prior
        where prior.user_id = e.user_id
          and prior.ip = e.ip
          and prior.created_at < e.created_at
      )
  ),
  matched as (
    update public.auth_events e
       set alerted_at = now()
      from candidates c
     where e.id = c.id
    returning e.email, e.ip, e.user_agent, e.created_at
  )
  select 'admin_new_ip_signin', m.email, null::text, null::text,
         jsonb_build_object('ip', m.ip::text, 'user_agent', m.user_agent), m.created_at
  from matched m;

  -- ── Rule 4: a burst of order deletions (>=3 by the same actor within the
  -- window). Orders are never supposed to be hard-deleted — cancellation is a
  -- status, not a row removal — so any volume of this is worth a look,
  -- regardless of who did it.
  return query
  with to_claim as (
    select a.id, a.actor_id
    from public.activity_log a
    where a.alerted_at is null
      and a.created_at > now() - v_lookback
      and a.table_name = 'orders'
      and a.operation = 'DELETE'
      and a.actor_id in (
        select actor_id from public.activity_log
        where alerted_at is null
          and created_at > now() - v_lookback
          and table_name = 'orders' and operation = 'DELETE'
        group by actor_id having count(*) >= 3
      )
  ),
  claimed as (
    update public.activity_log a set alerted_at = now()
    from to_claim t where a.id = t.id
    returning a.actor_id
  ),
  bursts as (
    select actor_id, count(*) as n from claimed group by actor_id
  )
  select 'mass_order_deletion', au.email, null::text, null::text,
         jsonb_build_object('count', b.n), now()
  from bursts b
  left join auth.users au on au.id = b.actor_id;
end;
$$;

revoke all on function public.evaluate_audit_alerts() from public, anon, authenticated;
grant execute on function public.evaluate_audit_alerts() to service_role;
