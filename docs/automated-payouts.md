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
4. **Set settlement to Manual/controlled** (Settings → Settlements). Transfers
   are funded from your Paystack **balance**; the default daily auto-sweep to
   your bank would empty it. Keep funds on-balance, sweep your own profit
   deliberately.
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
   (Requires the `app.supabase_url` / `app.service_role_key` GUCs already used by
   the other crons — migrations 016/081.)

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
