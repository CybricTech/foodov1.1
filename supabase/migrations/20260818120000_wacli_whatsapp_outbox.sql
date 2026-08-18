-- wacli WhatsApp relay outbox — a temporary bridge to a self-hosted wacli
-- (WhatsApp Web client, runs on a Pi) instance until the merchant is on the
-- official Meta WhatsApp Business API via Infobip. Sits as an extra rung in
-- the new_order_merchant ladder in supabase/functions/send-sms, alongside
-- the Infobip lane (see docs/infobip-whatsapp-migration.md).
--
-- The Pi never gets direct table access. It only talks to the wacli-relay
-- edge function, authenticated with its own WACLI_RELAY_KEY bearer secret
-- (independent of CRON_ENGINE_KEY, so it can be rotated/revoked without
-- touching internal cron auth). That edge function uses the service_role key
-- server-side, which bypasses RLS — so this table deliberately has no
-- policies for anon/authenticated rather than trying to scope a FOR ALL
-- (see the FOR-ALL-without-WITH-CHECK lesson from the 2026-08 RLS audit).

CREATE TABLE whatsapp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  -- Linked sms_logs row so delivery status shows up in the existing SMS Logs
  -- admin screen alongside the Infobip/Termii lanes.
  sms_log_id UUID REFERENCES sms_logs(id),
  to_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'sent', 'failed')),
  provider_ref TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

CREATE INDEX whatsapp_outbox_pending_idx ON whatsapp_outbox (created_at)
  WHERE status = 'pending';

-- Reclaim stuck rows: a poller that claimed a row and then crashed/lost its
-- network before reporting back would otherwise strand it in 'claimed'
-- forever. The relay's claim query looks at claimed_at, not just status.
CREATE INDEX whatsapp_outbox_claimed_idx ON whatsapp_outbox (claimed_at)
  WHERE status = 'claimed';

ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;
-- No policies added on purpose — default-deny for anon/authenticated.
REVOKE ALL ON whatsapp_outbox FROM anon, authenticated;
