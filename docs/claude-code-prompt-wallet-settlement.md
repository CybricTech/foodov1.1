# Claude Code Task: Payment Settlement & Wallet System

## Project Context

This is a multi-tenant restaurant SaaS platform (like Owner.com for Nigeria) built as a
Turborepo monorepo. Stack: Next.js 14 (App Router) + Supabase + TypeScript + Tailwind +
Zustand. Currency is always stored in **kobo** (NGN × 100) as BIGINT. The project name
internally is "Foodo" and packages are namespaced `@foodo/*`.

**Key paths:**
- `apps/web/` — Next.js app (storefront + merchant dashboard + admin panel)
- `supabase/migrations/` — numbered SQL migration files (latest is `012_social_links.sql`)
- `supabase/functions/` — Deno Edge Functions
- `packages/database/src/types.ts` — Supabase generated types (update after schema changes)
- `packages/utils/src/constants.ts` — shared enums/constants

**Existing payment flow:**
1. `POST /api/checkout/initialize` — creates pending `payments` record, calls Paystack
   transaction initialize, returns `accessCode`
2. `POST /api/webhooks/paystack` — verifies HMAC-SHA512, handles `charge.success`, creates
   `orders` + `order_items`, upserts CRM customer, fires SMS notifications
3. `supabase/functions/dispatch-order/` — handles 3 dispatch modes after order is ready

---

## Task: Implement Payment Settlement & Merchant Wallet System

Build the complete wallet and settlement infrastructure described below. Follow the exact
patterns already in the codebase (numbered SQL migrations, Deno edge functions, Next.js
App Router API routes, Supabase service client). Do not introduce new libraries unless
absolutely necessary.

---

## PHASE 1 — Database Migrations

### Migration `013_platform_settings.sql`

Create a singleton config table for platform-level settings:

```sql
CREATE TABLE IF NOT EXISTS platform_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Service charge: apply both fields — set either to 0 to disable that component
  service_charge_pct        NUMERIC(5,4) NOT NULL DEFAULT 0.03,  -- e.g. 0.03 = 3%
  service_charge_fixed_kobo BIGINT NOT NULL DEFAULT 0,           -- flat fee in kobo
  settlement_hold_hours     INTEGER NOT NULL DEFAULT 24,          -- hours before funds become available
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID REFERENCES auth.users(id)
);

-- Singleton enforcement
CREATE UNIQUE INDEX platform_settings_singleton ON platform_settings ((true));

-- Seed default row
INSERT INTO platform_settings (service_charge_pct, service_charge_fixed_kobo, settlement_hold_hours)
VALUES (0.03, 0, 24)
ON CONFLICT DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read/write
CREATE POLICY "platform_settings_admin_only"
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
```

### Migration `014_restaurant_banking.sql`

Add bank account fields to restaurants for Paystack Transfer recipient:

```sql
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS bank_code              TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number    TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name      TEXT,
  ADD COLUMN IF NOT EXISTS paystack_recipient_code TEXT;  -- set after Paystack recipient creation
```

### Migration `015_wallet_system.sql`

Create wallet, wallet_transactions, and settlements tables:

```sql
-- ── Restaurant Wallets (one per restaurant) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_wallets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           UUID NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  pending_balance_kobo    BIGINT NOT NULL DEFAULT 0,   -- earned, not yet available (within hold period)
  available_balance_kobo  BIGINT NOT NULL DEFAULT 0,   -- available for settlement
  total_earned_kobo       BIGINT NOT NULL DEFAULT 0,   -- lifetime gross credits
  total_withdrawn_kobo    BIGINT NOT NULL DEFAULT 0,   -- lifetime settled out
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_merchant_read"
  ON restaurant_wallets FOR SELECT
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "wallet_admin_all"
  ON restaurant_wallets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ── Wallet Transactions (immutable ledger) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  settlement_id     UUID,  -- FK added after settlements table created below
  type              TEXT NOT NULL CHECK (type IN (
                      'order_credit',        -- gross order amount credited
                      'service_charge',      -- platform service charge debited
                      'logistics_fee',       -- delivery fee going to platform
                      'settlement_debit',    -- payout to restaurant bank
                      'manual_adjustment'    -- admin override
                    )),
  amount_kobo       BIGINT NOT NULL,          -- always positive; type determines direction
  direction         TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'available', 'settled')),
  description       TEXT,
  available_at      TIMESTAMPTZ,             -- when pending → available (now + hold_hours)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_txn_merchant_read"
  ON wallet_transactions FOR SELECT
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "wallet_txn_admin_all"
  ON wallet_transactions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE INDEX wallet_transactions_restaurant_id_idx ON wallet_transactions (restaurant_id);
CREATE INDEX wallet_transactions_status_available_at_idx ON wallet_transactions (status, available_at);
CREATE INDEX wallet_transactions_order_id_idx ON wallet_transactions (order_id);

-- ── Settlements (payout records) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           UUID NOT NULL REFERENCES restaurants(id) ON DELETE RESTRICT,
  amount_kobo             BIGINT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  paystack_transfer_code  TEXT,              -- from Paystack initiate transfer response
  paystack_transfer_ref   TEXT,
  failure_reason          TEXT,
  initiated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Back-reference FK from wallet_transactions
ALTER TABLE wallet_transactions
  ADD CONSTRAINT fk_wallet_txn_settlement
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlements_merchant_read"
  ON settlements FOR SELECT
  USING (
    restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "settlements_admin_all"
  ON settlements FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ── Auto-create wallet on restaurant insert ───────────────────────────────────
CREATE OR REPLACE FUNCTION create_restaurant_wallet()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO restaurant_wallets (restaurant_id)
  VALUES (NEW.id)
  ON CONFLICT (restaurant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_restaurant_wallet
  AFTER INSERT ON restaurants
  FOR EACH ROW EXECUTE FUNCTION create_restaurant_wallet();

-- Back-fill wallets for existing restaurants
INSERT INTO restaurant_wallets (restaurant_id)
SELECT id FROM restaurants
ON CONFLICT (restaurant_id) DO NOTHING;
```

### Migration `016_pg_cron_settlement.sql`

Schedule the settlement job (requires pg_cron extension enabled in Supabase Dashboard):

```sql
-- Run every hour — finds pending wallet_transactions past their available_at time
-- and triggers the settle-restaurants edge function
SELECT cron.schedule(
  'release-pending-wallet-balances',
  '0 * * * *',   -- every hour on the hour
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/process-settlements',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

## PHASE 2 — Update Paystack Webhook

File: `apps/web/app/api/webhooks/paystack/route.ts`

After step 8 (the payment.order_id update), add a new **step 9: wallet crediting**.
Replace the existing SMS fire-and-forget section with the following expanded version:

```typescript
// 9. Credit merchant wallet
// Fetch platform settings for service charge config
const { data: settings } = await supabase
  .from('platform_settings')
  .select('service_charge_pct, service_charge_fixed_kobo, settlement_hold_hours')
  .single();

const pct = settings?.service_charge_pct ?? 0.03;
const fixedFee = settings?.service_charge_fixed_kobo ?? 0;
const holdHours = settings?.settlement_hold_hours ?? 24;

const orderTotalKobo = (meta.subtotal_kobo as number) + (meta.delivery_fee_kobo as number);
const deliveryFeeKobo = meta.delivery_fee_kobo as number;
const subtotalKobo = meta.subtotal_kobo as number;

// Service charge is applied on subtotal only (not on delivery fee — delivery goes to platform)
const serviceChargeKobo = Math.round(subtotalKobo * Number(pct)) + Number(fixedFee);

// Net amount restaurant earns = subtotal minus service charge
// Delivery fee goes entirely to platform (settled manually per architecture decision)
const restaurantCreditKobo = subtotalKobo - serviceChargeKobo;

const availableAt = new Date(Date.now() + holdHours * 60 * 60 * 1000).toISOString();

// Ensure wallet exists
await supabase
  .from('restaurant_wallets')
  .upsert({ restaurant_id: restaurantId }, { onConflict: 'restaurant_id' });

// Insert 3 wallet transaction rows atomically
await supabase.from('wallet_transactions').insert([
  {
    restaurant_id: restaurantId,
    order_id: order.id,
    type: 'order_credit',
    direction: 'credit',
    amount_kobo: restaurantCreditKobo,
    status: 'pending',
    available_at: availableAt,
    description: `Order #${order.order_number} — net revenue`,
  },
  {
    restaurant_id: restaurantId,
    order_id: order.id,
    type: 'service_charge',
    direction: 'debit',
    amount_kobo: serviceChargeKobo,
    status: 'settled', // already collected — no hold needed
    description: `Platform fee (${(Number(pct) * 100).toFixed(1)}% + ₦${(Number(fixedFee) / 100).toFixed(0)} fixed) on Order #${order.order_number}`,
  },
  {
    restaurant_id: restaurantId,
    order_id: order.id,
    type: 'logistics_fee',
    direction: 'debit',
    amount_kobo: deliveryFeeKobo,
    status: 'settled', // goes to platform account — manual settlement per architecture
    description: `Delivery fee — Order #${order.order_number}`,
  },
]);

// Update wallet pending_balance and total_earned
await supabase.rpc('increment_wallet_pending', {
  p_restaurant_id: restaurantId,
  p_amount_kobo: restaurantCreditKobo,
});
```

Also create the RPC function in a new migration `017_wallet_rpcs.sql`:

```sql
-- Increment pending balance + total earned atomically
CREATE OR REPLACE FUNCTION increment_wallet_pending(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    pending_balance_kobo = pending_balance_kobo + p_amount_kobo,
    total_earned_kobo    = total_earned_kobo + p_amount_kobo,
    updated_at           = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;

-- Move pending → available for transactions past their available_at
CREATE OR REPLACE FUNCTION release_pending_wallet_balances()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT restaurant_id, SUM(amount_kobo) AS total
    FROM wallet_transactions
    WHERE status = 'pending'
      AND available_at <= now()
    GROUP BY restaurant_id
  LOOP
    UPDATE wallet_transactions
    SET status = 'available'
    WHERE restaurant_id = r.restaurant_id
      AND status = 'pending'
      AND available_at <= now();

    UPDATE restaurant_wallets
    SET
      pending_balance_kobo   = pending_balance_kobo - r.total,
      available_balance_kobo = available_balance_kobo + r.total,
      updated_at             = now()
    WHERE restaurant_id = r.restaurant_id;
  END LOOP;
END;
$$;
```

---

## PHASE 3 — Edge Functions

### `supabase/functions/process-settlements/index.ts`

This function is called by pg_cron every hour. It:
1. Releases pending balances past their `available_at`
2. Finds restaurants with `available_balance_kobo > 0` AND a registered `paystack_recipient_code`
3. Initiates Paystack Transfer for each
4. Creates a `settlements` record
5. Debits the wallet

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // Step 1: Release balances past hold period
  await supabase.rpc('release_pending_wallet_balances');

  // Step 2: Find wallets with available balance + recipient code
  const { data: wallets } = await supabase
    .from('restaurant_wallets')
    .select(`
      id,
      restaurant_id,
      available_balance_kobo,
      restaurants!inner (
        name,
        paystack_recipient_code
      )
    `)
    .gt('available_balance_kobo', 0)
    .not('restaurants.paystack_recipient_code', 'is', null);

  if (!wallets || wallets.length === 0) {
    return new Response(JSON.stringify({ message: 'No settlements due' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = [];

  for (const wallet of wallets) {
    const restaurant = wallet.restaurants as { name: string; paystack_recipient_code: string };
    const amountKobo = wallet.available_balance_kobo;

    try {
      // Step 3: Create settlement record (processing)
      const { data: settlement } = await supabase
        .from('settlements')
        .insert({
          restaurant_id: wallet.restaurant_id,
          amount_kobo: amountKobo,
          status: 'processing',
        })
        .select('id')
        .single();

      if (!settlement) throw new Error('Failed to create settlement record');

      // Step 4: Initiate Paystack Transfer
      const transferRes = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          amount: amountKobo,
          recipient: restaurant.paystack_recipient_code,
          reason: `Settlement for ${restaurant.name}`,
          reference: `SETTLE-${settlement.id}-${Date.now()}`,
          currency: 'NGN',
        }),
      });

      const transferData = await transferRes.json();

      if (!transferRes.ok || !transferData.status) {
        throw new Error(transferData.message ?? 'Paystack transfer failed');
      }

      const transferCode = transferData.data?.transfer_code;
      const transferRef = transferData.data?.reference;

      // Step 5: Update settlement with transfer code
      await supabase
        .from('settlements')
        .update({
          paystack_transfer_code: transferCode,
          paystack_transfer_ref: transferRef,
        })
        .eq('id', settlement.id);

      // Step 6: Debit wallet available_balance
      await supabase
        .from('restaurant_wallets')
        .update({
          available_balance_kobo: 0,  // cleared — all available was settled
          total_withdrawn_kobo: supabase.rpc('get_total_withdrawn', { p_id: wallet.restaurant_id }),
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', wallet.restaurant_id);

      // Simpler debit approach — use raw update:
      await supabase.rpc('debit_wallet_for_settlement', {
        p_restaurant_id: wallet.restaurant_id,
        p_amount_kobo: amountKobo,
      });

      // Step 7: Create settlement_debit wallet transaction
      await supabase.from('wallet_transactions').insert({
        restaurant_id: wallet.restaurant_id,
        settlement_id: settlement.id,
        type: 'settlement_debit',
        direction: 'debit',
        amount_kobo: amountKobo,
        status: 'settled',
        description: `Bank transfer initiated — ${restaurant.name}`,
      });

      // Step 8: Mark available wallet transactions as settled
      await supabase
        .from('wallet_transactions')
        .update({ status: 'settled' })
        .eq('restaurant_id', wallet.restaurant_id)
        .eq('status', 'available');

      results.push({ restaurant_id: wallet.restaurant_id, status: 'initiated', amountKobo });

    } catch (err) {
      console.error(`Settlement failed for ${wallet.restaurant_id}:`, err);
      await supabase
        .from('settlements')
        .update({ status: 'failed', failure_reason: String(err) })
        .eq('restaurant_id', wallet.restaurant_id)
        .eq('status', 'processing');

      results.push({ restaurant_id: wallet.restaurant_id, status: 'failed', error: String(err) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
```

Add `debit_wallet_for_settlement` to migration `017_wallet_rpcs.sql`:

```sql
CREATE OR REPLACE FUNCTION debit_wallet_for_settlement(
  p_restaurant_id UUID,
  p_amount_kobo   BIGINT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE restaurant_wallets
  SET
    available_balance_kobo = available_balance_kobo - p_amount_kobo,
    total_withdrawn_kobo   = total_withdrawn_kobo + p_amount_kobo,
    updated_at             = now()
  WHERE restaurant_id = p_restaurant_id;
END;
$$;
```

### `supabase/functions/paystack-transfer-webhook/index.ts`

Handle Paystack's `transfer.success` and `transfer.failed` webhooks:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const rawBody = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  const hash = createHmac('sha512', Deno.env.get('PAYSTACK_SECRET_KEY')!)
    .update(rawBody)
    .digest('hex');

  if (hash !== signature) return new Response('Unauthorized', { status: 401 });

  const event = JSON.parse(rawBody);

  if (event.event === 'transfer.success') {
    const transferCode = event.data?.transfer_code;
    await supabase
      .from('settlements')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('paystack_transfer_code', transferCode);
  }

  if (event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const transferCode = event.data?.transfer_code;
    const { data: settlement } = await supabase
      .from('settlements')
      .update({ status: 'failed', failure_reason: event.data?.reason ?? 'Transfer failed' })
      .eq('paystack_transfer_code', transferCode)
      .select('restaurant_id, amount_kobo')
      .single();

    // Refund available balance if transfer failed
    if (settlement) {
      await supabase
        .from('restaurant_wallets')
        .update({
          available_balance_kobo: supabase.rpc('restore_failed_settlement', {
            p_restaurant_id: settlement.restaurant_id,
            p_amount_kobo: settlement.amount_kobo,
          }),
        })
        .eq('restaurant_id', settlement.restaurant_id);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

---

## PHASE 4 — Admin API Routes

### `apps/web/app/api/admin/platform-settings/route.ts`

```typescript
// GET — fetch current settings
// PATCH — update service charge or hold hours
// Guard: verify super_admin role via supabase service client + user_profiles lookup
```

### `apps/web/app/api/admin/restaurants/[id]/banking/route.ts`

```typescript
// POST — register restaurant bank account + call Paystack to create transfer recipient
// Body: { bank_code, account_number }
// Steps:
//   1. Verify account via Paystack: GET /bank/resolve?account_number=&bank_code=
//   2. Create recipient: POST /transferrecipient
//   3. Save bank_code, bank_account_number, bank_account_name, paystack_recipient_code to restaurants
```

### `apps/web/app/api/admin/settlements/route.ts`

```typescript
// GET — paginated list of all settlements across all restaurants (admin only)
// POST — manually trigger settlement for a specific restaurant_id (body: { restaurant_id })
//        calls process-settlements edge function with a filter
```

---

## PHASE 5 — Merchant Dashboard Wallet Page

### `apps/web/app/dashboard/(protected)/wallet/page.tsx`

Server component — fetch wallet data server-side via supabase server client:
- Wallet summary (pending balance, available balance, total earned, total withdrawn)
- Recent wallet_transactions (last 30, paginated)
- Recent settlements (last 10)

### `apps/web/components/dashboard/wallet-client.tsx`

Client component with:

**Top section — 4 stat cards:**
- Pending Balance (with tooltip: "Releasing in X hours")
- Available Balance
- Total Earned (lifetime)
- Total Withdrawn (lifetime)

**Transactions tab:**
- Table: Date | Order # | Type | Description | Amount | Direction (credit/debit badge) | Status badge
- Filter by type: All / Credits / Debits / Settlements
- Export to CSV button (reuse the existing `/api/merchant/customers/export` pattern)

**Settlements tab:**
- Table: Date | Amount | Status badge | Transfer Ref | Paid At
- Status badges: pending (yellow), processing (blue), paid (green), failed (red)

**Bank Account section (in Settings — extend existing settings-client.tsx):**
- Show current registered bank account (masked account number)
- "Add Bank Account" form: bank selector (dropdown from Paystack /bank list) + account number field
- On submit: calls the admin banking route which verifies + creates recipient

Use the exact same Tailwind classes and component patterns from `components/dashboard/customers-client.tsx` and `components/dashboard/order-queue-client.tsx` for visual consistency.

---

## PHASE 6 — Admin Dashboard Additions

### Extend `apps/web/app/admin/(protected)/page.tsx`

Add to the existing admin overview:
- Total platform revenue (sum of all `service_charge` wallet_transactions)
- Total logistics fees collected (sum of all `logistics_fee` wallet_transactions)
- Pending settlements count

### New page: `apps/web/app/admin/(protected)/settlements/page.tsx`

- Table of all settlements across all restaurants
- Filter by status
- "Trigger Settlement" button per restaurant (calls POST /api/admin/settlements)
- "Configure Service Charge" panel — form to update `platform_settings` (percentage input + fixed fee input + hold hours)

### New page: `apps/web/app/admin/(protected)/restaurants/[id]/banking/page.tsx`

- View/update bank account for any restaurant
- Shows paystack_recipient_code if set
- Register bank account form

---

## PHASE 7 — Constants & Types

### Update `packages/utils/src/constants.ts`

Add:
```typescript
export const WALLET_TRANSACTION_TYPES = [
  'order_credit',
  'service_charge',
  'logistics_fee',
  'settlement_debit',
  'manual_adjustment',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const SETTLEMENT_STATUSES = ['pending', 'processing', 'paid', 'failed'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];
```

### Regenerate `packages/database/src/types.ts`

After all migrations are applied, run:
```bash
npx supabase gen types typescript --project-id <your-project-id> > packages/database/src/types.ts
```

---

## Implementation Order

Execute in this exact order:

1. **Migrations 013 → 017** — apply all SQL migrations in sequence
2. **RPC functions** — ensure `increment_wallet_pending`, `release_pending_wallet_balances`, `debit_wallet_for_settlement` exist
3. **Update webhook** — extend `apps/web/app/api/webhooks/paystack/route.ts` with wallet crediting (Phase 2)
4. **Edge functions** — create `process-settlements` and `paystack-transfer-webhook`
5. **Admin API routes** — platform-settings, banking, settlements
6. **Regenerate types**
7. **Merchant wallet UI** — wallet page + wallet-client component
8. **Admin UI additions** — settlements page + service charge config
9. **Update constants**

---

## Key Rules to Follow

- All amounts in **kobo (BIGINT)**. Never store NGN floats for financial data.
- All DB writes to financial tables must use the **service role client** (`createServiceClient()`), never the anon client.
- Never skip the HMAC signature check on any Paystack webhook.
- Wallet balance can never go negative — add a check constraint: `CHECK (pending_balance_kobo >= 0 AND available_balance_kobo >= 0)`
- The `wallet_transactions` table is an **immutable ledger** — no UPDATE or DELETE on existing rows. Corrections are new rows with type `manual_adjustment`.
- Follow the existing migration numbering convention: `013_`, `014_`, etc.
- Follow existing RLS patterns — every table has RLS enabled with restaurant isolation for merchants and full access for super_admin.
- The `process-settlements` edge function must be **idempotent** — running it twice should not double-settle.
