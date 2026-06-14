-- ============================================================
-- 076: Remember a merchant's recent closure messages.
--
-- The store open/close control on the dashboard home lets a merchant
-- close with a custom message. To make that one-tap rather than retyping,
-- we keep a short history of recently-used messages on the restaurant and
-- surface them as tappable chips alongside built-in suggestions.
--
-- A plain text[] (newest-first, capped client-side) keeps this simple — no
-- new table/RLS. restaurants is published to Realtime with an explicit
-- column list, so adding a column does not change what Realtime decodes.
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS closure_message_history TEXT[] NOT NULL DEFAULT '{}';
