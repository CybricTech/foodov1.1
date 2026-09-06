create table if not exists public.merchant_support_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  whatsapp_number text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists merchant_support_tickets_restaurant_id_idx
  on public.merchant_support_tickets (restaurant_id);

create index if not exists merchant_support_tickets_status_idx
  on public.merchant_support_tickets (status);

alter table public.merchant_support_tickets enable row level security;
-- No policies: only the service role (used exclusively by the
-- merchant-support-api edge function) can read or write this table.
