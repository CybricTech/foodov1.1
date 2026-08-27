-- Fix: log_activity() has been writing actor_role = 'service_role' for every
-- service-client write, not the documented 'service' (docs/audit-trail.md
-- L78-79, and the comment on this very function). The service_role key IS a
-- signed JWT with a role claim of "service_role" — request.jwt.claims is
-- populated for it, so the `coalesce(v_claims ->> 'role', 'service')` fallback
-- to 'service' never actually fires; it always picks up 'service_role' first.
--
-- evaluate_audit_alerts() (20260809122842) checks `actor_role is distinct from
-- 'service'` to flag writes that bypassed the app's service-role routes. Since
-- actor_role was never actually 'service', that predicate has been true for
-- EVERY legitimate service-role write since deploy — firing false "🚨 breach"
-- Telegram alerts for routine staff role changes (2026-08-15, 2026-08-23) and
-- for Santi's first bank-detail save via /api/merchant/banking (2026-08-27).
-- Confirmed via the matching PostHog "bank account updated" event, which only
-- that route emits, firing in the same millisecond as the flagged write.
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

  -- The service_role key carries its own JWT (role claim "service_role"), so
  -- it must be normalized to 'service' explicitly — coalesce's fallback only
  -- catches the (rarer) case of no JWT claims being set at all.
  v_role := coalesce(nullif(v_claims ->> 'role', 'service_role'), 'service');
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

-- Backfill the three historical rows mislabeled 'service_role' so the audit
-- trail reads consistently with the documented contract. Purely cosmetic:
-- all three are already alerted_at-claimed and won't re-fire either way.
update public.activity_log
   set actor_role = 'service'
 where actor_role = 'service_role';
