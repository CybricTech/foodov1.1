-- Registers the pg_cron job that pings the audit-alerts edge function every 5
-- minutes (see supabase/functions/audit-alerts and
-- app/api/cron/audit-alerts/route.ts). Same technique as
-- 20260809113541_fix_scheduled_order_alerts_cron: lift a known-good bearer
-- token from an existing working job rather than writing a secret into a
-- migration file. This token authenticates against Supabase's own Edge
-- Function gateway (verify_jwt); the engine route has its own separate
-- CRON_ENGINE_KEY check.
do $$
declare
  v_token text;
  v_cmd   text;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_token
  from cron.job
  where jobname = 'request-due-riders';

  if v_token is null or length(v_token) < 20 then
    raise exception 'aborting: could not lift a bearer token from the request-due-riders job';
  end if;

  v_cmd := format(
    'SELECT net.http_post('
    || 'url := %L, '
    || 'headers := jsonb_build_object(%L, %L, %L, %L), '
    || 'body := %L::jsonb);',
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/audit-alerts',
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_token,
    '{}'
  );

  perform cron.schedule('audit-alerts', '*/5 * * * *', v_cmd);
end $$;
