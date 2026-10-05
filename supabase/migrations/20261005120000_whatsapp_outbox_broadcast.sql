-- Allow non-order messages (e.g. merchant announcements/apologies) in the
-- whatsapp_outbox. The relay and poller never read order_id, and sms_log_id
-- is already nullable, so broadcast rows flow through unchanged.
ALTER TABLE whatsapp_outbox ALTER COLUMN order_id DROP NOT NULL;
