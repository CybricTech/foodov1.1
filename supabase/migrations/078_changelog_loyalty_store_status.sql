-- ============================================================
-- 078: Draft "What's New" entries for the loyalty + store-status features.
--
-- Inserted as DRAFTS (published_at left NULL) so they appear in the admin
-- /admin/changelog list ready to review, tweak, and publish — they do NOT
-- go live to merchants until published from the admin portal.
-- ============================================================

INSERT INTO changelog_entries (title, body, tag, version_label, published_at)
VALUES
  (
    'Reward your regulars with loyalty stamp cards',
    'Set up a stamp card in Marketing → Loyalty: choose how many stamps unlock a reward — free delivery, a free item, or money off — and your customers start earning automatically on every paid order. They see their progress at checkout, and the reward applies itself the moment they qualify.',
    'new',
    'June 2026',
    NULL
  ),
  (
    'Open or close your store in one tap',
    'Your store status now lives right at the top of your dashboard. Tap it to open or close instantly — and when you close, pick a message for customers from quick suggestions or the ones you''ve used before, so you never have to type it out from scratch.',
    'improved',
    'June 2026',
    NULL
  );
