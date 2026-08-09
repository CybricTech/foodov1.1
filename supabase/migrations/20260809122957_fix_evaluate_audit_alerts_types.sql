-- evaluate_audit_alerts() failed on its first real call: auth.users.email is
-- varchar(255), not text, so it didn't match the declared RETURNS TABLE
-- signature. Caught immediately by a verification probe before this ever ran
-- unattended — error was:
--   ERROR: 42804: structure of query does not match function result type
--   DETAIL: Returned type character varying(255) does not match expected type
--   text in column 2.
-- Cast every auth.users.email reference to ::text.
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
  select 'privilege_escalation', au.email::text, tu.email::text, null::text, m.changes, m.created_at
  from matched m
  left join auth.users au on au.id = m.actor_id
  left join auth.users tu on tu.id = m.record_id;

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
  select 'bank_details_changed', au.email::text, null::text, r.name, m.changes, m.created_at
  from matched m
  left join auth.users au on au.id = m.actor_id
  left join public.restaurants r on r.id = m.record_id;

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
  select 'admin_new_ip_signin', m.email::text, null::text, null::text,
         jsonb_build_object('ip', m.ip::text, 'user_agent', m.user_agent), m.created_at
  from matched m;

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
  select 'mass_order_deletion', au.email::text, null::text, null::text,
         jsonb_build_object('count', b.n), now()
  from bursts b
  left join auth.users au on au.id = b.actor_id;
end;
$$;
