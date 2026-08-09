-- Unions activity_log + auth_events into one normalized shape for the admin UI
-- (the Audit Log page and the merchant detail Activity tab), with actor
-- email/name/restaurant pre-joined. auth.users isn't exposed over PostgREST,
-- so that join has to happen here rather than in the API route.
--
-- Access is enforced entirely by GRANT, not RLS-through-the-view: only
-- service_role can SELECT this (service_role has BYPASSRLS at the Postgres
-- role level regardless of RLS-through-view semantics), and only the admin
-- API route / server components ever query it.
create or replace view public.audit_trail as
select
  'activity:' || a.id::text as id,
  'activity'          as source,
  a.created_at,
  a.table_name,
  a.operation,
  a.restaurant_id,
  r.name              as restaurant_name,
  a.actor_id,
  au.email::text      as actor_email,
  up.full_name        as actor_name,
  up.role             as actor_role_label,
  a.changes           as detail
from public.activity_log a
left join auth.users au         on au.id = a.actor_id
left join public.user_profiles up on up.id = a.actor_id
left join public.restaurants r   on r.id = a.restaurant_id

union all

select
  'auth:' || e.id::text as id,
  'auth'              as source,
  e.created_at,
  e.event             as table_name,  -- 'sign_in' / 'sign_out' — shares the type filter with activity rows
  null                as operation,
  up.restaurant_id,
  r.name              as restaurant_name,
  e.user_id           as actor_id,
  e.email             as actor_email,
  up.full_name        as actor_name,
  up.role             as actor_role_label,
  jsonb_build_object('ip', e.ip::text, 'user_agent', e.user_agent) as detail
from public.auth_events e
left join public.user_profiles up on up.id = e.user_id
left join public.restaurants r   on r.id = up.restaurant_id;

revoke all on public.audit_trail from public, anon, authenticated;
grant select on public.audit_trail to service_role;
