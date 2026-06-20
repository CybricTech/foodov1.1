# Automated Merchant Payouts (Paystack Transfers)

This is the core money-out system. It replaces the manual "admin records a bank
transfer" step with a daily cron that pays each merchant their canonical net via
Paystack Transfers — **without** changing the settlement math, the wallet ledger,
the 24h hold, or refund control.

> Golden rule: nothing moves money until a human flips two switches, and the
> first thing the system does when switched on is **log only** (shadow mode).

---

## How it flows

```
customer pays ─▶ 100% to our Paystack balance
                     │  (webhook creates order, credits wallet, 24h hold)
                     ▼
        order sits unsettled until its 24h hold elapses
                     │
   daily cron 02:00 UTC ─▶ settle-payouts edge fn ─▶ POST /api/cron/settle-payouts
                     │        (engine: canonical net, lock orders, transfer)
                     ▼
        Paystack Transfer ─▶ merchant bank (their saved account)
                     │
        transfer.success webhook ─▶ settlement = paid  (wallet recomputed)
        transfer.failed   webhook ─▶ orders released, retried next run
```

The merchant's **payout account is whatever they have saved in settings**. Saving
bank details verifies the account and creates a Paystack transfer recipient; the
engine pays that recipient. Change the account → recipient is refreshed → next
payout goes to the new account.

---

## Funding model — the top-up float (READ THIS FIRST)

Paystack **Transfers can only draw from your Paystack balance** (`source: "balance"`).
But this account is on **standard automatic daily settlement** — every morning
(~01:43 UTC, confirmed via `GET /settlement`) Paystack sweeps the available
balance to the Kuda bank account, leaving the Paystack balance at **₦0**. The
payout cron runs at 02:00 UTC, i.e. **~17 min after the sweep**. So with nothing
else done, the engine has **no money to transfer** and pays no one.

**Chosen model: keep a top-up float on the Paystack balance.** Auto-settlement
stays on; you separately keep enough on the Paystack balance to cover ~a day of
vendor payouts, and replenish it from your bank. The engine already preflights
the balance and **safely skips + alerts** any merchant it can't fund (it never
half-pays), and the Settlements page shows the live balance vs. what enrolled
merchants are owed, with a red warning on a shortfall.

**⚠️ The one thing you MUST verify before going live:** does a topped-up float
*survive* the daily settlement sweep, or does settlement sweep it too? Test it
empirically — top up a small amount today, then after tomorrow's ~01:43 sweep
re-check `GET /balance` (or the Settlements page):
- **Float persists** → you can keep a standing float; the 02:00 cron works as-is.
- **Float gets swept** → either top up in the 01:43–02:00 window (impractical) or
  **move the cron earlier** so it runs before the sweep, *or* ask Paystack to make
  topped-up transfer funds exempt from settlement. Do not flip to live until this
  is resolved, or every transfer fails "insufficient balance".

(The alternative — asking Paystack support for **manual/deferred settlement** so
collections never leave the balance — remains open as a cleaner long-term model;
it needs Paystack to actually enable it and was not in effect as of 2026-06-20.)

---

## Phase 0 — Paystack dashboard setup (do once, in TEST first)

Your dashboard has a **Test / Live** toggle. Do all of this in **Test** first;
the entire flow works with fake money there.

1. **API keys** (Settings → API Keys & Webhooks): copy `sk_test_…`. Put it in
   Vercel env as `PAYSTACK_SECRET_KEY` (test environment). Never commit it.
   - Note: secrets with `$` must be escaped in `.env` (`\$`) — dotenv-expand
     otherwise mangles them.
2. **Webhook URL**: set it to `https://<your-app>/api/webhooks/paystack` for both
   test and live. (The handler verifies the HMAC signature and already handles
   `transfer.success/failed/reversed`.)
3. **Disable OTP for transfers** (Settings → Preferences/Transfers). Without
   this, automated transfers freeze in an `otp` state. Paystack may make you
   confirm this change once via email.
4. **Settlement / funding** (Settings → Settlements). Transfers are funded from
   your Paystack **balance**, but this account auto-settles to the bank daily and
   drains it — see "Funding model — the top-up float" above. Keep the balance
   funded with a float (chosen model), or get Paystack to switch you to manual
   settlement.
5. **Registered business**: confirmed (required for third-party transfers).

---

## Deploy steps

1. **Env (Vercel, web app)** — already present for collection; payouts reuse them:
   - `PAYSTACK_SECRET_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (the cron route authenticates the trigger with this)
   - `NEXT_PUBLIC_SUPABASE_URL`
2. **Migration**: apply `082_automated_payouts.sql` (adds the flags, the
   duplicate-payout unique index, and schedules the daily cron). Defaults are
   fail-safe: `auto_payout_enabled = false`, `auto_payout_shadow = true`.
3. **Edge function**: deploy `settle-payouts` and set its secret:
   ```
   supabase functions deploy settle-payouts
   supabase secrets set APP_BASE_URL=https://<your-web-app-domain>
   ```
4. **Cron auth GUCs (CRITICAL — this is the #1 thing that silently breaks payouts).**
   The pg_cron job authenticates to the edge function with the service-role key,
   read from two database GUCs. If they're unset, the nightly job ERRORs on every
   run (`unrecognized configuration parameter "app.supabase_url"`) and **pays no
   one, with no other symptom**. `ALTER DATABASE … SET` needs superuser, so set
   them in the **Supabase Dashboard → SQL editor** (not via the service role / MCP,
   which gets `42501`):
   ```sql
   ALTER DATABASE postgres SET app.supabase_url     = 'https://<ref>.supabase.co';
   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
   ```
   If you can't set GUCs, schedule the job with the URL + bearer **inlined**
   instead (what prod currently runs — see the runbook "the nightly job isn't
   running" entry).
5. **Verify the cron is actually alive** (do this after every deploy/migration —
   a scheduled job is not a running job):
   ```sql
   SELECT status, start_time, return_message
   FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'settle-payouts')
   ORDER BY start_time DESC LIMIT 3;
   ```
   `status = succeeded` + an HTTP 200 body = healthy. Any `ERROR: unrecognized
   configuration parameter …` = the GUCs above are unset.

---

## Go-live checklist (staging → main)

The payout engine, the Paystack lib, and the recipient-creating banking route
live on the **`staging`** branch only — **`main` (production) does not have them
yet**. Staging and production share **one database** and the **same Paystack
account** (`e605` — "Foodo Technologies Limited"), so merging is mainly about
getting the *code* to production. Work top to bottom; nothing moves money until
the final ramp.

**A. Prerequisites (before merge)**
- [ ] **Paystack settlement = Manual / Titan.** On Paystack v2 there's no
      "automatic off" toggle — the equivalent is the **Paystack Titan ("PT")
      account** (intermediary balance). Confirm with Paystack support: *"Will
      collected funds stay available in my Paystack balance so I can disburse via
      the Transfers API, instead of auto-settling to my bank?"* Verify objectively:
      `GET /balance` shows **available** (not just pending) funds. Funds still
      clear ~T+1 before they're available — which lines up with the 24h hold.
- [ ] **Disable OTP for transfers** (Paystack → Settings → Preferences/Transfers),
      else automated transfers freeze in `otp` state.
- [ ] **Live webhook set** → `https://kitchyn.app/api/webhooks/paystack` (handles
      `transfer.success/failed/reversed`).
- [ ] **Close the live real-transfer loop** on staging once the Titan balance is
      available (one small real payout landing in a merchant bank).

**B. Merge + deploy (brings code to production)**
- [ ] Merge `staging` → `main`, deploy. This ships the cron route, the Paystack
      lib, and the new bank-save route (creates a live recipient on every save).
- [ ] Migration 082 **schema** (flags + dup-payout unique index) is already applied
      to the shared DB. Apply the **pg_cron schedule** portion via the Supabase CLI
      (`supabase db push` / apply 082) so the daily job actually exists.
- [ ] Deploy the **`settle-payouts` edge function** + `supabase secrets set
      APP_BASE_URL=https://kitchyn.app`.
- [ ] **Recipient backfill (one-time):** every merchant that set their bank under
      the *old* (Monnify) route has no/stale `paystack_recipient_code`. Create live
      recipients for all merchants that have bank details but no valid recipient.
      (The engine's on-the-fly fallback also covers this, but backfill is cleaner.)

**C. Verify (still inert)**
- [ ] Flags at fail-safe defaults: `platform_settings.auto_payout_enabled = false`,
      `auto_payout_shadow = true`, **0 merchants** opted in. Merge + cron is a no-op
      until you change these.
- [ ] Manually `POST /api/cron/settle-payouts` once → returns `{ disabled: true }`
      (master switch off) — confirms wiring without moving money.

**D. Ramp (the only steps that move money)** — see "Rollout" below.

---

## Rollout — the safe ramp

1. **Test mode, end-to-end**: in Paystack Test, save a merchant's bank account
   (creates a recipient), then trigger the engine and watch a transfer +
   `transfer.success` webhook flip a settlement to `paid`. Force a **failed**
   transfer too and confirm the orders are released back to pending.
2. **Shadow in production**: with `auto_payout_enabled = true` and
   `auto_payout_shadow = true`, the daily cron logs `WOULD PAY …` lines and moves
   nothing. Reconcile those against what you'd pay manually for a few days.
3. **One pilot merchant**: set the merchant's `auto_payout_enabled = true`, flip
   `auto_payout_shadow = false`. Watch one small real payout land.
4. **Ramp**: enable more merchants by setting their `auto_payout_enabled = true`
   as their bank accounts are verified. Everyone else stays on manual — both
   paths share one settlement formula, so they never diverge.

### The switches (platform_settings)

| Flag | Default | Meaning |
|---|---|---|
| `auto_payout_enabled` | `false` | Master switch. False = cron is a no-op. |
| `auto_payout_shadow` | `true` | True = compute + log only, no money moves. |

Per-merchant: `restaurants.auto_payout_enabled` (+ a `paystack_recipient_code`,
set automatically when the merchant saves a bank account).

---

## Operator runbook

- **Enable a merchant**: confirm they've saved a bank account (the settings save
  verifies it and creates the recipient), then set
  `restaurants.auto_payout_enabled = true`.
- **Go live (whole platform)**: set `platform_settings.auto_payout_shadow = false`
  once shadow logs reconcile.
- **A payout failed**: it shows as a `settlements` row with `status='failed'` and
  a `failure_reason`. Its orders were automatically released and the **next daily
  run retries them**. Common causes: insufficient Paystack balance (top up your
  balance / pause your settlement sweep), or a bad recipient (merchant re-saves
  their account).
- **Insufficient balance**: the engine preflights your Paystack balance and skips
  (does not half-pay) when it can't fund a merchant — alerts to console/PostHog.
  Fund the balance; the skipped merchant is paid on the next run.
- **The nightly job isn't running (no shadow logs, no settlements, no alerts)**:
  the cron is almost certainly dying on unset GUCs. Check it with the verify query
  in Deploy step 5. The robust fix that doesn't depend on GUCs is to re-schedule
  the job with the URL + bearer **inlined** (this is what prod runs):
  ```sql
  SELECT cron.schedule('settle-payouts', '0 2 * * *', $cmd$
    SELECT net.http_post(
      url := 'https://<ref>.supabase.co/functions/v1/settle-payouts',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer <service_role_key>'),
      body := '{}'::jsonb);
  $cmd$);
  ```
  The inlined key now lives in `cron.job.command` — factor it into key rotation.
  To test without waiting for 02:00 UTC, fire the edge function once via pg_net
  and read the response from `net._http_response`; in shadow mode it moves no
  money and returns `{"shadow":true,…,"wouldPay":[…]}`.
- **Refund an order**: process the customer refund out-of-band, then mark the
  order via `POST /api/admin/orders/refund` (`{ order_id }`). If the order hasn't
  been settled yet (within the 24h hold — the normal case) it's removed from the
  merchant's payout automatically. If it was **already paid out**, the endpoint
  refuses and tells you to recover via the merchant's next settlement.

---

## Why it's safe (invariants)

- **No double pay**: each transfer uses a deterministic `reference`
  (`STL-<rest8>-<period>`); Paystack dedupes on it, and a partial unique index
  forbids a second automated settlement per merchant per day.
- **No paying refunded orders**: the 24h hold + the refund endpoint keep
  refunded orders out of settlement; an already-paid order can't be silently
  reversed (it blocks).
- **No phantom payments**: a settlement is only `paid` when the
  `transfer.success` webhook confirms it; failures release the orders.
- **No ledger drift**: wallet counters are always recomputed from source
  (orders + paid settlements), never blindly incremented.
- **Manual fallback always available**: automation is per-merchant opt-in and
  shares the one settlement formula with the manual route.
