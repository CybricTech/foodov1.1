-- 050: Landing page CMS — blog posts + demo requests
--
-- Two tables to back the public Kitchyn landing page:
--   - blog_posts: editorial content managed from /admin/landing
--   - demo_requests: leads captured from the "Book a Demo" form
--
-- Both are administered through the super_admin role. Public consumption
-- happens through server-side API routes that use the service client, so
-- RLS denies anon/authenticated by default (defense in depth — the API
-- layer enforces what's visible).

-- ─────────────────────────────────────────────────────────────────────────
-- blog_posts: editorial content for the public landing page
--
-- slug is the URL path (e.g. /blog/how-to-grow-orders) and is enforced
-- unique. is_published + published_at gate visibility on the public API.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  excerpt         TEXT,
  content         TEXT NOT NULL,
  cover_image_url TEXT,
  author_name     TEXT NOT NULL DEFAULT 'Kitchyn Team',
  read_minutes    INT,
  is_published    BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON blog_posts (is_published, published_at DESC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx
  ON blog_posts (slug);

-- Auto-maintain updated_at on UPDATE
CREATE OR REPLACE FUNCTION blog_posts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_posts_updated_at_trigger ON blog_posts;
CREATE TRIGGER blog_posts_updated_at_trigger
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION blog_posts_set_updated_at();

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; deny everyone else. Public read happens via API.
DROP POLICY IF EXISTS blog_posts_no_access ON blog_posts;
CREATE POLICY blog_posts_no_access ON blog_posts
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────
-- demo_requests: leads from the "Book a Demo" form
--
-- Captured publicly (POST /api/landing/demo-request). Admin reviews
-- through /admin/landing. Status drives the lifecycle: new → contacted →
-- closed (won or lost — tracked in a follow-up note column if needed).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demo_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'closed_won', 'closed_lost')),
  source          TEXT NOT NULL DEFAULT 'landing',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_requests_status_idx
  ON demo_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION demo_requests_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS demo_requests_updated_at_trigger ON demo_requests;
CREATE TRIGGER demo_requests_updated_at_trigger
  BEFORE UPDATE ON demo_requests
  FOR EACH ROW EXECUTE FUNCTION demo_requests_set_updated_at();

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_requests_no_access ON demo_requests;
CREATE POLICY demo_requests_no_access ON demo_requests
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);
