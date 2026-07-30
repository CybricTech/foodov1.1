# Dispatch redesign — merchant policy + time-driven rider requests

Status: **built** (2026-07-30), not yet enabled. Depends on the Bolt branch (migrations
094–096) landing first. Ships inert: `timed_rider_request_enabled = false` and every merchant
backfilled to `hybrid`, so applying the migrations and deploying changes nothing.

Two things landed beyond the plan below, both from questions raised during the build:

- **Ride tracking link to the customer.** `GET /rides/details` returns a Bolt-hosted tracking
  page; it's stored on `bolt_rides.tracking_url` and appended to the "on its way" SMS. Absent
  on the manual lane (no ride_id to query), so the message falls back to its plain wording
  rather than shipping a dangling "Track your rider:".
- **Migration 102** carries the per-minute cron separately from 101's schema.

Run the tests with `npm test` (27 cases, `packages/utils/src/dispatch-policy.test.ts` — the
first vitest suite in this repo). Drive the timer with `node scripts/dispatch-sim.mjs`.

---

## 1. The problem with what we have

Three separate ideas are currently collapsed into one click.

When a merchant taps **Mark Ready** on a delivery order, `order-queue-client.tsx` shows a
two-button picker, and `/api/dashboard/orders/dispatch` then does four unrelated things in
one transaction:

1. decides which lane the order goes down (`platform_rider` vs `own_rider`),
2. writes the delivery-fee wallet split,
3. advances `orders.status`,
4. asks for a rider — Bolt API or Telegram, decided by `dispatchRideForOrder()`.

Three consequences follow:

**The merchant's declared logistics setup is decorative.** `restaurants.logistics_default`
exists (migration 001) with `platform_rider | own_rider | third_party`, and the merchant can
edit it in Settings — but nothing in the dispatch path reads it. Every merchant gets the same
picker. A pickup-only, no-riders merchant is shown "Platform Rider" and a merchant we've
agreed to deliver for is shown "In-House".

**The rider is requested too late.** The request only fires once the food is already cooked.
Rider search plus travel-to-store is dead time that the customer waits through, on top of the
prep time they were quoted. We already know when the food will be ready — the merchant tells
us at accept, and we store it in `orders.estimated_delivery_at`.

**`assigned_to_rider` means two things.** It is both "a rider has been asked for" and "the
merchant is locked out of this order" (`update-status/route.ts:90-102`). That conflation is
what makes moving the request earlier hard: today, requesting a rider necessarily takes the
Mark Ready button away from the merchant.

## 2. What we're building

Two independent axes, which is the whole point of the redesign:

| Axis | Values | Set by | Answers |
|---|---|---|---|
| **Dispatch policy** (per merchant) | `platform` · `in_house` · `hybrid` | merchant, in Settings | *who* rides |
| **Fulfilment mode** (platform-wide) | automatic · manual | admin, in Admin › Settings | *how* we ask |

The policy decides *when and whether* a rider is requested. The mode decides only whether
that request goes out as a Bolt API booking or as a Telegram note for a human to book. A
Platform merchant behaves identically under both modes from the merchant's side — the
difference is invisible to them, which is what makes the switch safe to flip mid-service.

### Per-policy behaviour

| Policy | Merchant sees at Ready | Rider requested when | `dispatch_type` |
|---|---|---|---|
| `platform` | no picker — just **Mark Ready** | **whichever comes first**: `estimated_delivery_at − lead`, or Mark Ready | `platform_rider`, stamped at accept |
| `in_house` | no picker — **Mark Ready** then **Hand to Rider** | never | `own_rider`, stamped at accept |
| `hybrid` | today's two-button picker | at the picker click (unchanged) | stamped at the picker |

`in_house` keeps `ready_for_pickup` as a real state — it's a genuine kitchen milestone, and
pickup orders need it regardless. What's removed is the *choice*, replaced by a single
"Hand to Rider → In Transit" button. That is today's own-rider flow minus the fork.

## 3. The status model

The core structural change: **`orders.status` tracks the food; a new `orders.dispatch_state`
tracks the rider.** They advance independently, because from now on a rider can be en route
while the food is still in the pan.

```
status:         confirmed → preparing → ready_for_pickup → in_transit → delivered
dispatch_state:              pending  → requested → booked → driver_assigned → picked_up → delivered
```

`dispatch_state = picked_up` is what drives `status → in_transit` — the rider physically
having the food is the real transition, and it's a fact the Bolt webhook already reports.
In the manual lane the admin riders console advances it.

Merchant card reads: `#1042 · Preparing · 🛵 Rider booked, 6 min away`.

Why a column on `orders` rather than reading `bolt_rides.state`: `bolt_rides` only exists for
the Bolt lane. `dispatch_state` has to be true in the manual lane too, and it's what the
kanban, the mobile app and the admin console all render. It's a projection — `bolt_rides` and
`delivery_assignments` remain the source of truth for their own lanes.

This also retires the `assigned_to_rider` overload. That status stays valid for historical
rows and for the transition period, but new platform-lane orders express "rider assigned"
through `dispatch_state`, so the merchant keeps their Mark Ready button.

## 4. Schema (migration 101)

094–096 are still uncommitted; 097–100 are merged. New work starts at **101**.

```sql
-- Per-merchant policy. Deliberately a NEW column, not a new value on
-- logistics_default — see §5.
ALTER TABLE restaurants
  ADD COLUMN dispatch_policy TEXT NOT NULL DEFAULT 'hybrid'
    CHECK (dispatch_policy IN ('platform','in_house','hybrid')),
  ADD COLUMN dispatch_policy_locked_at TIMESTAMPTZ,   -- admin brake; NULL = merchant may edit
  ADD COLUMN rider_request_lead_minutes INTEGER
    CHECK (rider_request_lead_minutes IS NULL OR rider_request_lead_minutes BETWEEN 0 AND 120);

-- The rider track.
ALTER TABLE orders
  ADD COLUMN dispatch_state TEXT
    CHECK (dispatch_state IS NULL OR dispatch_state IN (
      'not_required','pending','requested','booked','driver_assigned',
      'picked_up','delivered','failed','cancelled')),
  ADD COLUMN rider_request_due_at TIMESTAMPTZ,
  ADD COLUMN rider_requested_at   TIMESTAMPTZ;

-- Platform defaults + rollout switch.
ALTER TABLE platform_settings
  ADD COLUMN rider_request_lead_minutes  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN timed_rider_request_enabled BOOLEAN NOT NULL DEFAULT false;

-- Cron scan: due, not yet requested. Partial keeps it tiny (pattern from 081/095).
CREATE INDEX orders_rider_request_due
  ON orders (rider_request_due_at)
  WHERE rider_requested_at IS NULL AND rider_request_due_at IS NOT NULL;
```

**Backfill: everyone to `hybrid`.** Not derived from `logistics_default`. `hybrid` is exactly
today's behaviour, so the migration is a no-op at runtime and merchants move onto the new
lanes deliberately, one at a time. `logistics_default` was never enforced, so backfilling
from it would silently change behaviour based on a field nobody has been maintaining.

**`rider_requested_at` is the outer idempotency latch** — one claim per order covering both
transports and both triggers, claimed atomically the way `rider_alert_sent_at` is
(`.is('rider_requested_at', null)`, migration 063 pattern). The two existing latches
(`rider_alert_sent_at` for Telegram, `bolt_booking_claimed_at` for Bolt) stay as inner,
transport-level dedup. Outer claim = "a request is in flight"; inner = "this transport fired".

## 5. Why `logistics_default` is not reused — the money landmine

`recompute_restaurant_wallet` (migration 059) resolves an order's dispatch lane as:

```sql
COALESCE(o.dispatch_type, da.dispatch_type, r.logistics_default)
```

and feeds it to `foodo_order_net_kobo`, whose CASE is:

```sql
WHEN p_dispatch = 'platform_rider'              THEN p_delivery
WHEN p_dispatch IN ('own_rider','third_party')  THEN ROUND(p_delivery * p_dc_pct)
ELSE 0
```

Adding `hybrid` to `logistics_default`'s CHECK would make every order with a NULL
`dispatch_type` at a hybrid merchant fall through to `ELSE 0` — **we'd silently stop taking
the 10% delivery commission**, in the canonical formula, on the fallback path, with no error.
The same shape recurs in `080`, `089` and `098`.

So: `dispatch_policy` is a new column that no financial CASE can see. `logistics_default`
stays exactly as it is, demoted in a COMMENT to "legacy settlement fallback for orders that
predate `dispatch_type` stamping — not a dispatch control". The merchant Settings dropdown
that edits it today is replaced by the policy selector, which writes `dispatch_policy` only.

## 6. Code architecture

### One chokepoint: `requestRiderForOrder()`

New `apps/web/lib/delivery/request-rider.ts`. `dispatchRideForOrder()` already establishes
"exactly one place decides Bolt vs Telegram"; this moves the chokepoint one level up so the
*lane commit* and the *wallet split* live inside it too, instead of being duplicated between
the dispatch route and the new cron.

```
requestRiderForOrder(supabase, orderId, source)
  1. load order + restaurant policy; guard: delivery, not cancelled, lane = platform
  2. claim orders.rider_requested_at atomically   ← outer latch; a lost claim returns "skipped"
  3. commit the lane:  stamp dispatch_type='platform_rider'
                       upsert delivery_assignments
                       commitDeliverySplit()      ← extracted from the dispatch route verbatim
  4. dispatchRideForOrder()                        ← existing: Bolt API or Telegram note
  5. set dispatch_state
```

Four callers, one implementation:

- the T-10 cron,
- **Mark Ready** on a `platform`-policy order (early-ready path),
- the hybrid picker → Platform Rider (existing dispatch route, now a thin wrapper),
- admin manual re-book (`/api/admin/bolt/rides/book`).

`commitDeliverySplit()` is a straight extraction of `dispatch/route.ts:146-244` — same
amounts, same idempotency check on an existing `logistics_fee` row, same
`increment_wallet_pending` call. Only the clock moves.

### The T-10 trigger

`pg_cron (every minute) → net.http_post → edge fn dispatch-due-riders → /api/cron/request-due-riders`

The same three-hop chain as 081, 082 and 096, for the same reason: the logic lives in the
Next.js route so it shares one implementation with every other caller, and the edge function
is a thin auth shim.

Rejected alternatives: a pg_cron job per order (unbounded job table); Vercel cron (worse
minute-granularity reliability, and the codebase already standardises on the chain above);
anything involving sleeping in a transaction.

Migration 062's lesson applies directly — `mark_late_orders` overlapping itself exhausted the
60-connection Micro instance and took auth down with it. So: one indexed query against the
partial index above, `BATCH_LIMIT 50`, per-item try/catch, no long transactions, route
returns fast. Worth considering folding this into the existing per-minute
`scheduled-order-alerts` job rather than adding a fourth per-minute cron; separate is
cleaner to reason about, shared is safer for the instance. Decide at build time.

### Computing `rider_request_due_at`

Set in `update-status` at the same point `estimatedReadyMinutes` is applied
(`route.ts:112-121`), when policy is `platform` and fulfilment is delivery:

```
due_at = estimated_delivery_at − COALESCE(restaurant.lead, platform.lead, 10) minutes
```

- Prep time ≤ lead (merchant says "5 minutes") → `due_at = now()`, fires on the next tick, ≤60s.
- Merchant revises the ETA later → recompute `due_at`, as long as `rider_requested_at` is still NULL.
- No prep minutes given → `estimated_delivery_at` is NULL → `due_at` NULL → the order simply
  falls back to the Mark Ready trigger. **A rider request is never silently dropped.**
- Scheduled orders: `due_at` stays NULL until activation. The merchant accepts near the slot,
  so the normal path takes over from there.

## 7. New failure modes this introduces

Booking ~10 minutes earlier widens two windows that barely existed before. These are part of
the build, not follow-ups:

**Cancel-after-book.** Today the ride is booked at Ready, so a cancellation almost never
races it. At T-10 it will. Extract `lib/bolt/cancel-ride.ts` from the admin cancel route and
call it whenever an order with a live `dispatch_state` is cancelled; in the manual lane, post
a `❌ CANCEL ride for #1042` note to the same Telegram group. Bolt refuses cancellation past
`DRIVING_WITH_CLIENT`, which surfaces to the admin rather than being swallowed.

**Orphan ledger rows on cancellation.** Balances are safe — `recompute_restaurant_wallet`
excludes `status IN ('cancelled','pending')`, so a cancelled order drops out of
`pending_balance_kobo` automatically and the derived wallet is correct with no reversal. But
the `wallet_transactions` rows written by `commitDeliverySplit()` would remain as a
misleading audit trail for a delivery that never happened. The cancel path should void them.
This is a ledger-hygiene bug, not a balance bug — worth stating precisely so nobody
"fixes" the balance.

**Rider arrives before the food.** The merchant beat their estimate in the wrong direction.
Needs a merchant-side "Running late — push the rider back" action that resets `due_at` and,
if a ride is booked but no driver is assigned yet, cancels and re-books. The existing
`bolt_autobook_stopped_at` brake is the right interlock. Ship in phase 2 unless real usage
says otherwise — but the data model above already supports it.

## 8. Admin controls (the on/off switch)

`platform_settings.bolt_booking_enabled`, `bolt_booking_shadow` and `bolt_environment`
already exist from migration 095 and are already read by `readBoltSettings()`. **They have no
UI** — the riders page only displays them read-only. So the "switch it on and off from the
admin portal" ask is mostly a UI build on top of switches that already work:

Admin › Settings gains a Dispatch section:
- **Automated Bolt booking** — on/off (`bolt_booking_enabled`). Off = Telegram note, unchanged.
- **Shadow mode** — estimate and log, book nothing (`bolt_booking_shadow`).
- **Environment** — sandbox / production.
- **Rider request lead time** — global default, minutes.
- **Time-driven rider requests** — master rollout switch (`timed_rider_request_enabled`).

Admin › Merchants › [id] gains: current policy (read-only display), the per-merchant lead
override, and the policy lock. Since policy is merchant-editable, changes should write an
audit line visible to admin — a merchant flipping themselves to `platform` starts spending
our Bolt budget, and `dispatch_policy_locked_at` is the brake if that's ever abused.

## 9. Testing — before anything deploys

There is **no test runner in this repo** — no vitest, no jest, no playwright, zero test
files. So this is a scripted-manual plan in the shape of `docs/automated-payouts.md`, which
is the pattern that worked for the last money-touching feature. Three properties below exist
specifically to make this feature testable; they are design decisions, not afterthoughts.

### What makes it testable

**The due time is a stored column, not a computed predicate.** The cron scans
`rider_request_due_at <= now()`, not `estimated_delivery_at <= now() + lead`. That's the
difference between forcing a trigger with one `UPDATE orders SET rider_request_due_at =
now()` and having to falsify a customer-facing ETA to test. Any order, any state, fires on
the next tick.

**The cron route takes `{ dry_run: true }`** and returns
`{ dry_run: true, would_request: [{order_number, policy, due_at, lane}] }` without claiming
a latch, writing a split, or contacting anyone — the same shape as the payout engine's
`{"shadow":true,…,"wouldPay":[…]}`. It also takes `{ order_ids: [...] }` to scope a run to
one order. Both are service-role only.

**The route is directly invocable**, so no test ever waits for a pg_cron tick — fire the edge
function via pg_net and read `net._http_response`, exactly as documented for the payout cron.

**Nothing spends money until deliberately unlocked.** `bolt_booking_shadow = true` estimates
and logs but books nothing; `bolt_environment = 'sandbox'` is a mocked, isolated API on
Bolt's live host that speaks identical shapes. Both already exist and are already honoured by
`readBoltSettings()`.

One gap to close: in shadow mode `dispatchRideForOrder()` deliberately **falls through to the
real Telegram alert**. That's correct for a production shadow run — a human should still book
the ride — but it means a 2am test order pages the real rider group. Add
`TELEGRAM_TEST_CHAT_ID` and route alerts there for orders belonging to the designated test
merchant (the Copper Pot flow used for scheduled-order testing). The `dry_run` path never
calls `dispatchRideForOrder()` at all.

### Where to run it

| Target | Good for | Limit |
|---|---|---|
| **Local** — `supabase start` + `npm run dev` | migration 101, policy routing, the whole cron path, Bolt sandbox calls | inbound Bolt webhooks can't reach localhost — see below |
| **Supabase branch** (`create_branch`) | rehearsing 101 against a real copy of prod schema, incl. the settlement check in §5 | costs money; confirm first |
| **Vercel preview** | full end-to-end with a reachable webhook URL | shares the prod DB unless pointed at a branch — point it at a branch |

If the sandbox can't deliver a webhook to a local box, don't tunnel — let
`reconcile-bolt-rides` poll instead. It converges the identical state machine, and testing
that path is worthwhile in its own right, since it's the safety net for webhooks that never
arrive in production.

### Test matrix

Each row is a scenario to run and record before the corresponding rollout phase.

**Policy routing** — no rider involved, fastest to verify:
1. `hybrid` merchant → picker still appears, both buttons behave exactly as today. This is
   the regression guard for every existing merchant.
2. `in_house` → no picker; Mark Ready then Hand to Rider → `in_transit`; `dispatch_type`
   stamped `own_rider`; **no** rider request, no Telegram, no Bolt call.
3. `platform` → no picker; merchant keeps Mark Ready throughout.
4. Pickup order at a `platform` merchant → `dispatch_state = not_required`, never scanned.

**Timing** — the new machinery:
5. Accept with 35 min prep → `due_at` lands at T−10. Force `due_at = now()`, tick, exactly
   one request fires.
6. Accept with 5 min prep (≤ lead) → `due_at = now()`, fires within 60s.
7. Accept with no prep minutes → `due_at` NULL, never scanned, and Mark Ready still triggers
   the request. **This is the "silently dropped rider" case — verify it explicitly.**
8. Early ready: Mark Ready at T−20 → request fires immediately; then let the clock pass T−10
   → cron finds nothing (outer latch held). **Exactly one request, not two.**
9. Merchant revises ETA upward before the request fires → `due_at` moves. Revises after →
   `due_at` frozen, request already out.
10. Two ticks racing the same order → one claim wins, one returns `skipped`.

**Money** — run these against a branch, not prod:
11. `commitDeliverySplit()` on a `platform` order produces byte-identical wallet rows to
    today's dispatch route for the same order. Diff them.
12. Migration 101 applied → `recompute_all_restaurant_wallets()` → **every wallet balance
    unchanged**. This is the §5 landmine's tripwire; a single moved figure means
    `dispatch_policy` leaked into a settlement CASE.
13. Cancel after split committed → order drops out of `pending_balance_kobo`, ledger rows
    voided.

**Bolt lane** — via `scripts/bolt-sandbox.mjs`:
14. Full happy path: request → `SEARCHING` → `DRIVER_ON_ROUTE_TO_CLIENT` →
    `ARRIVED_AT_CLIENT` → `DRIVING_WITH_CLIENT` → `COMPLETED`, asserting `dispatch_state`
    tracks it and `picked_up` is what flips `status` to `in_transit` — while `status` is
    still `preparing` for the first two hops. That interleaving is the whole redesign; it is
    the single most important scenario here.
15. Cancel while `SEARCHING` → ride cancelled, order clean.
16. Cancel at `DRIVING_WITH_CLIENT` → Bolt returns `INVALID_STATE_FOR_CANCELLATION`, surfaced
    to the admin, not swallowed.
17. `NO_DRIVER_FOUND` → falls back to Telegram, order never stranded.
18. Receipt arrives → `fare_kobo` recorded, `delivery_cost_source = 'bolt'`.

**Admin controls:**
19. Toggle automated booking off mid-flight → next request goes out as a Telegram note, no
    Bolt call, in-flight rides unaffected.
20. `timed_rider_request_enabled = false` → cron is a no-op platform-wide. The kill switch
    must be verified working *before* it's needed.

### Worth adding: a small unit suite

Two functions decide, on every order, who pays for the delivery: the policy → lane resolver
and the `due_at` calculator. Both are pure, both are cheap to test, and one wrong answer from
the first is a silent revenue leak of exactly the kind §5 describes. Standing up vitest for
those two alone would be the highest-value automated coverage in this feature. Optional —
say the word and I'll include it.

## 10. Rollout

Each step is independently reversible. Phase 0 is the testing above; nothing below starts
until the matrix is recorded.

1. Ship migration 101 + code with `timed_rider_request_enabled = false` and every merchant on
   `hybrid`. **Zero behaviour change** — pure dead code plus a no-op column.
2. Ship the admin and merchant UI. Policy is selectable but nothing is time-triggered yet.
3. Move one cooperative merchant to `platform` with automated booking **off**. Telegram note
   now arrives at T-10 instead of at Ready. Validate the lead time against a real kitchen for
   a week — this is the step that tells us whether 10 minutes is right.
4. Turn `bolt_booking_shadow` off for real API bookings on that merchant's orders.
5. Roll out per merchant. `timed_rider_request_enabled = false` is the single kill switch that
   returns everything to Ready-triggered dispatch.

## 11. Surfaces to touch

- **DB**: migration 101; edge function `dispatch-due-riders`.
- **API**: `dashboard/orders/dispatch` (thinned to a hybrid-picker wrapper),
  `dashboard/orders/update-status` (compute `due_at`, early-ready trigger, cancel hook),
  new `cron/request-due-riders`, `admin/bolt/rides/*` (share the extracted cancel).
- **New lib**: `delivery/request-rider.ts`, `delivery/commit-delivery-split.ts`,
  `bolt/cancel-ride.ts`.
- **Testing**: `scripts/dispatch-sim.mjs` — put a given order at a given policy and force its
  `due_at`, so §9's matrix is a few commands rather than hand-written SQL each time. Pairs
  with the existing `scripts/bolt-sandbox.mjs` for the ride half.
- **Web**: `order-queue-client`, `frontline-orders-client`, `settings-client` (policy
  selector replacing the `logistics_default` dropdown), `settings-admin-client`,
  `riders-client`, `merchant-detail-client`.
- **Mobile** (active app): `orders/order-card`, `orders/orders-screen`,
  `orders/dispatch-modal` (hidden for non-hybrid), `orders/types`.
- Rider app: excluded, not deployed.
