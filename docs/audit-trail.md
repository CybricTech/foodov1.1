# Audit trail — what we record and how

Written after the 2026-08-08 breach, where we could not answer *"who signed in,
when, from where"* beyond 24 hours. This is the standard for anything that needs
to be traceable on the platform.

## Why three layers

The obvious approach — log everything from the API routes — cannot work here.
Ten merchant write paths go **straight from the browser to PostgREST** and never
touch a route:

| Component | Writes |
| --- | --- |
| `menu-manager-client` | `menu_items`, `menu_categories`, options (**prices**) |
| `order-queue-client` | `orders` (status) |
| `frontline-orders-client` | `orders` (**delete**) |
| `frontline-menu-client` | `menu_items` |
| `settings-client`, `store-status-control` | `restaurants` |
| `marketing-client` | `discounts` |
| `loyalty-config` | `loyalty_programs` |
| `changelog-admin-client` | `changelog_entries` |
| `whats-new` | `user_profiles` |

Anything enforced only in the application has a permanent blind spot over those.
So the change trail lives in **database triggers**, and the app layer is used
only for business context a row diff cannot express.

## Layer 1 — `public.auth_events`

Permanent sign-in / sign-out history, fed by triggers on `auth.sessions`
(which already carries `ip` and `user_agent`).

- `sign_in` — a row is inserted into `auth.sessions`
- `sign_out` — that row is deleted

> `sign_out` means **"session ended"**, not strictly "the user clicked log out" —
> Supabase also deletes rows when pruning expired sessions.

`email` is denormalised onto the row so the trail survives deletion of the user.

Supabase's own `auth.audit_log_entries` is empty on this project and its log API
retains only 24 hours, which is why we keep our own.

## Layer 2 — `public.activity_log`

Row-level change trail for sensitive tables. One generic trigger function,
`public.log_activity()`, attached per table with the **watched columns** passed
as trigger arguments.

```sql
create trigger log_activity_menu_items
  after insert or update or delete on public.menu_items
  for each row execute function public.log_activity(
    'name', 'price_kobo', 'is_available', 'track_inventory', 'stock_quantity', 'is_addon_only');
```

Anything not listed is ignored entirely. **This is the volume control** — `orders`
is written constantly for reasons nobody needs to audit (`rider_alert_sent_at`,
`updated_at`), and an update that touches no watched column writes no row at all.

Currently watched:

| Table | Ops | Rationale |
| --- | --- | --- |
| `user_profiles` | I/U/D | `role` — the exact column the attacker escalated through |
| `orders` | U/D | status/dispatch/money; **D** because the frontline UI can delete |
| `menu_items` | I/U/D | price and availability are the merchant money levers |
| `restaurants` | U | commercial terms, banking, store state |
| `discounts` | I/U/D | money |
| `loyalty_programs` | I/U/D | money |
| `settlements` | I/U/D | money |
| `wallet_transactions` | U/D | inserts are the normal ledger flow (4k rows); *mutating* a ledger row after the fact is the interesting event |

### Actor attribution — the one caveat

- **Browser writes** carry a JWT, so `actor_id` resolves and `actor_role` is `authenticated`.
- **Server-route writes** use the service client, which has no JWT — so `actor_id`
  is `null` and `actor_role` is `service`.

A route can opt in to proper attribution by setting the actor on the connection
in the same transaction:

```sql
select set_config('app.actor_id', '<user-uuid>', true);
```

`log_activity()` prefers that over the JWT subject. Closing this gap across the
server routes is layer 3.

## Layer 3 — `public.audit_logs` (existing, not yet standardised)

Business/semantic events where a row diff is not enough — *"settlement recorded,
bank reference X"*, *"rider dispatched via Bolt"*. It works, but today it is 25
hand-rolled inserts with four different spellings of the actor (`user.id`,
`guard.userId`, `auth.userId`, `auth.user.id`), all fire-and-forget, and the
table has no `restaurant_id` or `actor_role`. Consolidating these behind a single
`recordAudit()` helper is the remaining work.

## Access control

Audit data is **read-only to everyone except the service role**.

- `anon` — no access at all (verified: `42501 permission denied`)
- `authenticated` — `SELECT` only, gated by RLS to `get_my_role() = 'super_admin'`
- `service_role` — full access
- Triggers are `SECURITY DEFINER`, so writes succeed even though the acting role
  has no `INSERT` grant

Both trigger functions swallow their own exceptions. **Auditing must never be
able to break authentication or a business write.**

## Retention

A nightly `pg_cron` job (`prune-audit-data`, 03:30) enforces:

- **24 months** — full trail, long enough for settlement disputes
- **90 days** — `ip` and `user_agent` are nulled out

IP addresses are personal data under the NDPR. Keeping them indefinitely is hard
to justify; 90 days covers incident investigation.

## Cost

At current volume (~13 orders/day, ~29 sign-ins/day):

- ~150–200 rows/day, roughly **7 MB/month**
- ~0.1–0.3 ms added per write
- **zero** extra Vercel compute — this is all database-side

> **Never add `auth_events` or `activity_log` to the `supabase_realtime`
> publication.** Realtime WAL polling was the root cause of the 2026-06-11
> usage-exhaustion incident. The publication is `puballtables = false`, so new
> tables do not join automatically — keep it that way.

## Adding a new table to the trail

1. Pick the watched columns. Be strict: high-churn bookkeeping columns will
   generate volume for no signal.
2. Attach the trigger, passing those columns as arguments.
3. Choose the operations deliberately — skip `INSERT` where the base table
   already records creation (see `wallet_transactions`).
4. Verify with a rolled-back probe that a watched change writes exactly one row
   and an unwatched change writes none.
