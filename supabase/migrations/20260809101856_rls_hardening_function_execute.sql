-- Postgres grants EXECUTE to PUBLIC on every newly created function, so the
-- targeted "revoke ... from anon, authenticated" in the previous migration was
-- a no-op wherever the PUBLIC grant (ACL entry "=X/postgres") was still present.
-- Verified: redeem_discount was still callable by anon afterwards, returning
-- HTTP 200. Only finance_* and upsert_customer were actually locked, because
-- those two happened to have explicit grants rather than the PUBLIC default.
--
-- Strip PUBLIC/anon/authenticated EXECUTE across the whole public schema and
-- grant it explicitly to service_role, which is what every server-side caller
-- uses. Excludes extension-owned functions. Verified beforehand that no column
-- DEFAULT and no CHECK constraint calls a function, so this cannot break writes.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname not in ('get_my_role', 'get_my_restaurant_id')
      and not exists (
        select 1 from pg_depend dep
        where dep.objid = p.oid and dep.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- get_my_role() and get_my_restaurant_id() must stay executable by BOTH anon
-- and authenticated. The restaurant_isolation policies on the public storefront
-- tables (restaurants, menu_items, menu_categories, ...) call them, and RLS
-- evaluates every applicable policy — so revoking EXECUTE from anon made those
-- policies error and took all logged-out storefront reads down with
-- "permission denied". Caught during verification; anon is granted back below.
revoke all on function public.get_my_role()          from public;
revoke all on function public.get_my_restaurant_id() from public;
grant execute on function public.get_my_role()          to anon, authenticated, service_role;
grant execute on function public.get_my_restaurant_id() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
