-- 046: Monnify payment gateway — additive columns alongside paystack_*
--
-- Strategy: Option A (truly surgical). Existing paystack_* columns and rows
-- remain untouched so any in-flight Paystack transactions continue to settle
-- through the legacy code paths during cutover. New orders/settlements write
-- to monnify_* columns. Roll-back is a code revert — no data loss.

-- ─────────────────────────────────────────────────────────────────────────
-- payments: Monnify reference + status + gateway discriminator
--
-- payment_provider lets us filter "all Monnify orders" without an OR across
-- paystack_status / monnify_status. Defaults to 'paystack' so existing rows
-- backfill correctly; new orders write 'monnify'.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS monnify_ref TEXT,
  ADD COLUMN IF NOT EXISTS monnify_status TEXT,
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'paystack';

CREATE UNIQUE INDEX IF NOT EXISTS payments_monnify_ref_unique
  ON payments (monnify_ref)
  WHERE monnify_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_payment_provider_idx
  ON payments (payment_provider);

-- ─────────────────────────────────────────────────────────────────────────
-- restaurants: Monnify bank verification flag
--
-- Monnify disbursements take bank details directly per request — no
-- "transfer recipient" concept. We use a verified-at timestamp instead of
-- a recipient_code as the "ready for settlement" marker. Set when the
-- merchant's account is validated through Monnify's account/validate API.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS monnify_bank_verified_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────
-- settlements: Monnify disbursement references
--
-- monnify_disbursement_reference is OUR reference (sent on the request).
-- monnify_transaction_reference is Monnify's internal id (returned in the
-- response and on the disbursement webhook).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS monnify_disbursement_reference TEXT,
  ADD COLUMN IF NOT EXISTS monnify_transaction_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS settlements_monnify_disbursement_ref_unique
  ON settlements (monnify_disbursement_reference)
  WHERE monnify_disbursement_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS settlements_monnify_transaction_ref_idx
  ON settlements (monnify_transaction_reference)
  WHERE monnify_transaction_reference IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- monnify_auth_tokens: shared, persistent token cache
--
-- Monnify access tokens expire after 1 hour. Caching the token in a single-
-- row table lets every Next.js instance and Edge Function reuse the same
-- token until it expires, avoiding hundreds of redundant /auth/login calls
-- per minute under load. Singleton constraint enforces exactly one row.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monnify_auth_tokens (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT monnify_auth_tokens_singleton CHECK (id = 'singleton')
);

-- Service role can read/write; no public access. RLS off — this table is
-- only ever accessed from server contexts using the service role key.
ALTER TABLE monnify_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Deny everyone by default. The service role bypasses RLS, so backend code
-- continues to work; no client should ever see this table.
DROP POLICY IF EXISTS monnify_auth_tokens_no_access ON monnify_auth_tokens;
CREATE POLICY monnify_auth_tokens_no_access ON monnify_auth_tokens
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);
