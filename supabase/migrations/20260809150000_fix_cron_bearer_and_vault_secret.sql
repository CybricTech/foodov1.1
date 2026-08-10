-- Fixes a live, exploitable gap found during a security review: every pg_cron
-- job that triggers an edge function was authenticating with a HARDCODED,
-- LITERAL bearer token — and that literal was the exact legacy service_role
-- JWT leaked in .claude/settings.local.json (see
-- project_settings_local_secret_leak / project_rls_audit_2026_08 memory).
--
-- "Disable legacy API keys" (done 2026-08-08 22:59 UTC) only blocks PostgREST's
-- own REST endpoints. It does NOT revoke the underlying JWT signing secret, so
-- Edge Functions' `verify_jwt` gate — which just checks JWT signature validity,
-- not whether the key is on Supabase's "disabled legacy keys" list — still
-- accepted this token. Verified empirically: the leaked key invoked send-email
-- and reached real business logic tonight, hours after it was supposedly dead.
--
-- Fix, two parts:
--   1. This migration: every cron job's outer bearer now reads from
--      vault.cron_bearer_key (see the accompanying execute_sql call that
--      created it) instead of a literal — so no future migration file can leak
--      a live credential into git history again, which is exactly how this
--      happened the first time.
--   2. A companion PR adds an in-function auth check to all 12 edge functions,
--      requiring the caller's bearer to match CRON_ENGINE_KEY (already set,
--      already equals this same value) — so even a validly-signed old JWT that
--      slips past verify_jwt is rejected by the function itself.
--
-- Whoever revokes the legacy JWT secret in the Supabase dashboard (the deeper
-- fix — see the incident memory) should also rotate vault.cron_bearer_key and
-- CRON_ENGINE_KEY together, since all three must stay in sync.

do $$
declare
  v_secret text;
  v_cmd text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_bearer_key';

  if v_secret is null or length(v_secret) < 20 then
    raise exception 'aborting: vault.cron_bearer_key is missing or too short';
  end if;

  -- reconcile-pending-payments (*/5 * * * *)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/reconcile-pending-payments'
  );
  perform cron.schedule('reconcile-pending-payments', '*/5 * * * *', v_cmd);

  -- settle-payouts (0 2 * * 1-5)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/settle-payouts'
  );
  perform cron.schedule('settle-payouts', '0 2 * * 1-5', v_cmd);

  -- request-due-riders (* * * * *)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/request-due-riders'
  );
  perform cron.schedule('request-due-riders', '* * * * *', v_cmd);

  -- reconcile-bolt-rides (*/5 * * * *)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/reconcile-bolt-rides'
  );
  perform cron.schedule('reconcile-bolt-rides', '*/5 * * * *', v_cmd);

  -- scheduled-order-alerts (* * * * *)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/scheduled-order-alerts'
  );
  perform cron.schedule('scheduled-order-alerts', '* * * * *', v_cmd);

  -- audit-alerts (*/5 * * * *)
  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/audit-alerts'
  );
  perform cron.schedule('audit-alerts', '*/5 * * * *', v_cmd);
end $$;
