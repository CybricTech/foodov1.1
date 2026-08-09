-- The scheduled-order-alerts cron job (added with the scheduled-orders work) was
-- built against `current_setting('app.supabase_url')` and
-- `current_setting('app.service_role_key')` — custom GUCs that were never set on
-- this project. Every run since has failed with:
--     ERROR: unrecognized configuration parameter "app.supabase_url"
-- so scheduled-order alerts have never actually fired. Every other http cron job
-- (reconcile-pending-payments, settle-payouts, request-due-riders,
-- reconcile-bolt-rides) hardcodes the project URL and a literal bearer token.
--
-- Rebuild the command in that same shape, lifting the bearer token from an
-- existing working job so the secret is never written into a migration file or
-- moved outside the database.
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
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/scheduled-order-alerts',
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_token,
    '{}'
  );

  perform cron.schedule('scheduled-order-alerts', '* * * * *', v_cmd);
end $$;
