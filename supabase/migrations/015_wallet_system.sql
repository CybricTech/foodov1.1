-- ── Restaurant Wallets (one per restaurant) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_wallets (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           UUID NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  pending_balance_kobo    BIGINT NOT NULL DEFAULT 0 CHECK (pending_balance_kobo >= 0),
  available_balance_kobo  BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_kobo >= 0),
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
                      'order_credit',
                      'service_charge',
                      'logistics_fee',
                      'settlement_debit',
                      'manual_adjustment'
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
  paystack_transfer_code  TEXT,
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
