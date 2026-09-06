-- Unpaid requests live outside orders. A link carries at most one payment that
-- could still take money; retries resume that reference, including across
-- concurrent browser sessions. A gateway's terminal refusal frees it again.
CREATE TABLE public.merchant_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 16 AND 100),
  customer_name text NOT NULL DEFAULT '' CHECK (length(customer_name) <= 100),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 50),
  subtotal_kobo bigint NOT NULL CHECK (subtotal_kobo > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  cancelled_at timestamptz,
  checkout_response jsonb,
  UNIQUE (restaurant_id, request_key)
);
CREATE INDEX merchant_payment_links_restaurant_created_idx
  ON public.merchant_payment_links (restaurant_id, created_at DESC);
ALTER TABLE public.merchant_payment_links ENABLE ROW LEVEL SECURITY;
-- Links are bearer checkout credentials. No direct anonymous access or client
-- writes; authenticated reads remain tenant-isolated and role-checked.
REVOKE ALL ON public.merchant_payment_links FROM anon, authenticated;
GRANT SELECT ON public.merchant_payment_links TO authenticated;
GRANT ALL ON public.merchant_payment_links TO service_role;
CREATE POLICY merchant_payment_links_read ON public.merchant_payment_links
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid()
      AND p.restaurant_id = merchant_payment_links.restaurant_id
      AND p.role IN ('merchant_owner', 'merchant_staff') AND p.is_active = true)
  );

ALTER TABLE public.payments ADD COLUMN payment_link_id uuid
  REFERENCES public.merchant_payment_links(id);

-- At most ONE payment per link that could still take the customer's money.
--
-- 'rejected' is written only on a gateway's final verdict — Paystack
-- failed/abandoned/reversed, Monnify FAILED/EXPIRED/REVERSED. Those drop out of
-- this index and free the link for another attempt. PENDING and PARTIALLY_PAID
-- never reach it, so a bank transfer still in flight keeps blocking a second
-- charge, which is the case that actually risks charging twice.
--
-- The index is the backstop, not the app: if a rejected transaction were ever
-- revived to 'success' after a retry had begun, that UPDATE violates this index
-- and fails loudly instead of quietly producing a second paid order.
CREATE UNIQUE INDEX payments_live_payment_link_idx
  ON public.payments (payment_link_id)
  WHERE payment_link_id IS NOT NULL
    AND paystack_status IS DISTINCT FROM 'rejected'
    AND monnify_status IS DISTINCT FROM 'rejected';

-- The row lock serializes cancellation and payment initialization. The partial
-- unique index above prevents a second live reference even if both requests
-- passed the app's initial read. The trigger also enforces tenant ownership.
CREATE FUNCTION public.guard_payment_link_checkout() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE link public.merchant_payment_links;
BEGIN
  IF NEW.payment_link_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO link FROM public.merchant_payment_links
    WHERE id = NEW.payment_link_id FOR UPDATE;
  IF NOT FOUND OR link.restaurant_id <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Payment link not found' USING ERRCODE = '23514';
  END IF;
  IF link.cancelled_at IS NOT NULL OR link.expires_at <= now() THEN
    RAISE EXCEPTION 'Payment link is no longer available' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_payment_link_checkout BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_link_checkout();

-- Cancelling races a payment that may already be taking money. Attempts the
-- gateway has finally refused are not that, so a link whose only history is
-- failure stays cancellable — otherwise a mistyped order could never be undone.
CREATE FUNCTION public.guard_payment_link_cancel() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at AND EXISTS (
    SELECT 1 FROM public.payments WHERE payment_link_id = OLD.id
      AND paystack_status IS DISTINCT FROM 'rejected'
      AND monnify_status IS DISTINCT FROM 'rejected'
  ) THEN
    RAISE EXCEPTION 'Payment has already started; this link cannot be cancelled';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_payment_link_cancel BEFORE UPDATE ON public.merchant_payment_links
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_link_cancel();
