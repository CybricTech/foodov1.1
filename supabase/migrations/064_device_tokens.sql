-- Device push tokens for the Kitchyn Merchant mobile app.
--
-- One row per Expo push token. A token maps to exactly one merchant user +
-- restaurant; the mobile app upserts on conflict(expo_push_token) so a device
-- that re-registers (token rotation, re-login) refreshes its row in place.
--
-- The send-push Edge Function (service role, bypasses RLS) reads tokens by
-- restaurant_id to fan a "new order" notification out to every registered
-- device for that restaurant. RLS scopes all client access to the owning user.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (expo_push_token)
);

create index if not exists idx_device_tokens_restaurant_id
  on public.device_tokens (restaurant_id);

alter table public.device_tokens enable row level security;

-- A user may read/insert/update/delete only their own device rows. The service
-- role (used by the register/unregister routes + send-push function) bypasses
-- RLS entirely, so no service-role policy is needed.
create policy "device_tokens_select_own"
  on public.device_tokens
  for select
  using (user_id = auth.uid());

create policy "device_tokens_insert_own"
  on public.device_tokens
  for insert
  with check (user_id = auth.uid());

create policy "device_tokens_update_own"
  on public.device_tokens
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "device_tokens_delete_own"
  on public.device_tokens
  for delete
  using (user_id = auth.uid());
