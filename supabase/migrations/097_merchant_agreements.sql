-- ============================================================================
-- 097: Merchant agreements — view/sign/countersign via DocuSeal
-- ============================================================================
-- Every merchant gets a per-merchant copy of the lawyer-prepared Merchant
-- Agreement (template: "Kitchyn X Drizzy's Bites ltd Merchant Agreement",
-- sealed 2026-07-03, kept in DocuSeal as a reusable template with fillable
-- fields). Flow:
--
--   draft            — created by admin, not yet sent
--   sent             — DocuSeal submission created; merchant notified
--   merchant_signed  — merchant completed their signing form (webhook)
--   completed        — Kitchyn countersigned; final combined PDF archived
--   declined         — a signer declined in DocuSeal (webhook)
--   expired          — DocuSeal submission expired (webhook)
--   voided           — admin voided locally (e.g. superseded by a new draft)
--
-- One ACTIVE agreement per merchant: generating a new draft voids any prior
-- non-completed agreement for the same restaurant (enforced in the API layer).
--
-- The signed PDFs are legal documents — they live in a PRIVATE storage bucket
-- (`merchant-agreements`) and are served only via short-lived signed URLs
-- generated server-side. DocuSeal holds the authoritative copy; our bucket is
-- the archive that survives without provider access.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_agreements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,

  status                  TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','merchant_signed','completed','declined','expired','voided')),

  -- Which template revision was used (bump when the lawyer replaces the doc).
  template_version        TEXT NOT NULL DEFAULT 'sealed-2026-07-03',

  -- DocuSeal linkage (null until sent / if DocuSeal not configured).
  docuseal_submission_id  BIGINT,
  merchant_signer_email   TEXT,
  kitchyn_signer_email    TEXT,

  -- Merchant legal identity + Schedule 1 fee-terms snapshot used to prefill
  -- the submission. Kept so we can re-render/audit exactly what was agreed.
  legal_name              TEXT,
  rc_number               TEXT,
  fee_terms               JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Signing metadata (filled from DocuSeal webhooks).
  merchant_signed_at      TIMESTAMPTZ,
  countersigned_at        TIMESTAMPTZ,

  -- Archive copies in the private bucket (storage object paths).
  unsigned_pdf_path       TEXT,
  final_pdf_path          TEXT,

  created_by              UUID REFERENCES user_profiles(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_agreements_restaurant
  ON merchant_agreements (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_agreements_status
  ON merchant_agreements (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_agreements_docuseal_submission
  ON merchant_agreements (docuseal_submission_id)
  WHERE docuseal_submission_id IS NOT NULL;

COMMENT ON TABLE merchant_agreements IS
  'Per-merchant Merchant Agreement instances signed via DocuSeal (migration 097). '
  'fee_terms is the Schedule 1 snapshot used to prefill the submission.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Writes go through API routes with the service role (default deny, no write
-- policies). Merchants can READ their own restaurant's agreements; super_admin
-- reads everything.
ALTER TABLE merchant_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_agreements_merchant_read ON merchant_agreements;
CREATE POLICY merchant_agreements_merchant_read ON merchant_agreements
  FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

DROP POLICY IF EXISTS merchant_agreements_admin_all ON merchant_agreements;
CREATE POLICY merchant_agreements_admin_all ON merchant_agreements
  FOR ALL TO authenticated
  USING (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');

-- ── Private archive bucket ──────────────────────────────────────────────────
-- Private (public = false): no anonymous or direct authenticated reads.
-- All reads go through server-generated signed URLs; all writes are service
-- role only (default deny — same idiom as blog-images writes in 051).
INSERT INTO storage.buckets (id, name, public)
VALUES ('merchant-agreements', 'merchant-agreements', false)
ON CONFLICT (id) DO NOTHING;
