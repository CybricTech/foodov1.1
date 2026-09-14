-- Account deletion requests (App Store / Google Play account-deletion requirement).
--
-- Written by POST /api/merchant/account/deletion-request (Kitchyn Merchant app
-- "Delete account", or the web dashboard) via the service role. Ops fulfil the
-- request manually within the 30-day window promised on /delete-account, then
-- mark it completed.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- SET NULL (not cascade): fulfilling a request deletes the auth user, and the
  -- request row must survive as the record that deletion was completed.
  user_id uuid references auth.users(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  email text not null,
  role text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status);

-- At most one open request per user; the API route relies on this to stay
-- idempotent under concurrent submissions (a losing insert gets 23505 and the
-- route returns the existing pending row instead).
create unique index if not exists account_deletion_requests_one_pending_per_user_idx
  on public.account_deletion_requests (user_id)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;
-- No policies: only the service role (used exclusively by the
-- /api/merchant/account/deletion-request route and ops tooling) can read or
-- write this table.
