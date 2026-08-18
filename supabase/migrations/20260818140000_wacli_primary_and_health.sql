-- Makes wacli the PRIMARY merchant WhatsApp lane (Termii/Twilio retired), and
-- adds the retry + watchdog machinery that lets it run unattended.
--
-- Three problems this solves:
--
--   1. provider = 'wacli' was rejected. sms_logs_provider_check never listed
--      it, so the outbox hand-off in send-sms would have failed its log write
--      on every order. Caught before the Pi ever ran; nothing was lost.
--
--   2. A failed send was terminal. The poller reported 'failed' once and the
--      row died there — a momentary WhatsApp hiccup silently cost a merchant
--      their order alert. Now there are bounded retries with backoff.
--
--   3. Nothing noticed when the bridge went down. A Pi that is off, unplugged,
--      or whose WhatsApp session got unlinked would queue orders forever in
--      silence. wacli_poller_health + the wacli-health cron turn that into an
--      email, which is the whole point of "works when I'm not on seat".

-- ── 1. Allow provider = 'wacli' ───────────────────────────────────────────────
-- termii/twilio/interakt/infobip are KEPT: historical sms_logs rows still carry
-- them and dropping a value from the CHECK would fail against existing data.
-- They simply have no live send path any more.
ALTER TABLE sms_logs DROP CONSTRAINT IF EXISTS sms_logs_provider_check;
ALTER TABLE sms_logs ADD CONSTRAINT sms_logs_provider_check
  CHECK (provider IN ('termii', 'twilio', 'sendchamp', 'interakt', 'infobip', 'wacli'));

-- ── 2. Bounded retries on the outbox ─────────────────────────────────────────
ALTER TABLE whatsapp_outbox
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  -- NULL = eligible immediately. Set on each failure to now() + backoff, so a
  -- retry doesn't hot-loop against whatever just rejected it.
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN whatsapp_outbox.attempts IS
  'Delivery attempts so far. At 5 the row goes terminal-failed and the health
   check alerts rather than retrying forever.';

-- The claim path filters on next_attempt_at, so it belongs in the partial index.
DROP INDEX IF EXISTS whatsapp_outbox_pending_idx;
CREATE INDEX whatsapp_outbox_pending_idx
  ON whatsapp_outbox (next_attempt_at NULLS FIRST, created_at)
  WHERE status = 'pending';

-- ── 3. Poller liveness ───────────────────────────────────────────────────────
-- Singleton row (the CHECK on a boolean PK is what enforces "exactly one").
-- wacli-relay stamps last_seen_at on every claim; the health check reads it.
CREATE TABLE IF NOT EXISTS wacli_poller_health (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_seen_at TIMESTAMPTZ,
  -- Alert dedup — without this a Pi left off overnight emails every 5 minutes.
  last_alert_at TIMESTAMPTZ,
  last_alert_reason TEXT
);

INSERT INTO wacli_poller_health (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE wacli_poller_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wacli_poller_health FROM anon, authenticated;

-- ── 4. Watchdog cron ─────────────────────────────────────────────────────────
-- Every 5 minutes. Bearer comes from vault, never a literal — see
-- 20260809150000_fix_cron_bearer_and_vault_secret.sql for why that matters.
DO $$
DECLARE
  v_secret text;
  v_cmd text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_bearer_key';

  IF v_secret IS NULL OR length(v_secret) < 20 THEN
    RAISE EXCEPTION 'aborting: vault.cron_bearer_key is missing or too short';
  END IF;

  v_cmd := format(
    $c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='cron_bearer_key')), body := '{}'::jsonb);$c$,
    'https://hcyxbmfbyvgybriloffo.supabase.co/functions/v1/wacli-health'
  );
  PERFORM cron.schedule('wacli-health', '*/5 * * * *', v_cmd);
END $$;
