-- ============================================================
-- 074: "What's New" changelog / feature announcements.
--
-- A DB-backed changelog so we can publish feature announcements to
-- merchants (owner + frontline) WITHOUT a deploy — instantly feeding
-- both the web dashboard and the native mobile app from one source.
--
-- Each merchant user sees an unseen entry once (a branded popup on
-- their next home load), tracked per-user via
-- user_profiles.last_seen_changelog_at, and can reopen the full list
-- anytime from the "What's New" button.
--
-- Authoring is admin-only (super_admin); merchants get read-only
-- access to PUBLISHED entries (published_at set and not in the future).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. changelog_entries — one announcement
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS changelog_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  title         TEXT NOT NULL,
  body          TEXT NOT NULL,                 -- short markdown/plain description
  tag           TEXT NOT NULL DEFAULT 'new'
                  CHECK (tag IN ('new', 'improved', 'fixed')),
  image_url     TEXT,                          -- optional hero image
  version_label TEXT,                          -- optional, e.g. "June 2026"

  -- Publishing: NULL = draft (invisible to merchants). Set to make it live.
  published_at  TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Merchants list published entries newest-first; this index serves that.
CREATE INDEX IF NOT EXISTS idx_changelog_published
  ON changelog_entries (published_at DESC)
  WHERE published_at IS NOT NULL;

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read PUBLISHED entries (owner + frontline +
-- admin). Drafts and future-dated entries stay hidden until live.
DROP POLICY IF EXISTS "changelog_read_published" ON changelog_entries;
CREATE POLICY "changelog_read_published"
  ON changelog_entries FOR SELECT
  USING (published_at IS NOT NULL AND published_at <= now());

-- Super admins author and manage everything.
DROP POLICY IF EXISTS "changelog_admin_all" ON changelog_entries;
CREATE POLICY "changelog_admin_all"
  ON changelog_entries FOR ALL
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION set_changelog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_changelog_updated_at ON changelog_entries;
CREATE TRIGGER trg_changelog_updated_at
  BEFORE UPDATE ON changelog_entries
  FOR EACH ROW EXECUTE FUNCTION set_changelog_updated_at();

-- ──────────────────────────────────────────────────────────
-- 2. Per-user "seen" marker
--    user_profiles_own (FOR ALL, id = auth.uid()) already lets a user
--    update their own row, so the client stamps this directly — no extra
--    function or policy needed. user_profiles is NOT in the Realtime
--    publication, so adding a column is safe.
-- ──────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_seen_changelog_at TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────
-- 3. Seed the first entry — the features we just shipped.
-- ──────────────────────────────────────────────────────────
INSERT INTO changelog_entries (title, body, tag, version_label, published_at)
VALUES
  (
    'See your pending payouts before settlement',
    'Open Wallet → Payouts to see a clear breakdown of everything you''ve earned but haven''t been paid yet — your food sales and delivery earnings, with exactly what Kitchyn takes shown line by line.',
    'new',
    'June 2026',
    now()
  ),
  (
    'Set prep time per item & adjust each order''s ETA',
    'Add a prep time to any menu item, and when you accept an order you can confirm or tweak how long it''ll take — the customer sees an accurate, up-to-date estimate.',
    'new',
    'June 2026',
    now()
  );
