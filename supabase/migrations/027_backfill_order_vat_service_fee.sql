-- Back-fill vat_kobo and service_fee_kobo on existing orders from payment metadata.
-- Orders placed before migration 026 have these columns defaulting to 0 even though
-- the values were stored in the linked payment's metadata at checkout.

UPDATE orders o
SET
  vat_kobo         = COALESCE((p.metadata->>'vat_kobo')::bigint, 0),
  service_fee_kobo = COALESCE((p.metadata->>'service_fee_kobo')::bigint, 0)
FROM payments p
WHERE o.payment_id = p.id
  AND (
    (o.vat_kobo = 0         AND (p.metadata->>'vat_kobo')::bigint > 0)
    OR
    (o.service_fee_kobo = 0 AND (p.metadata->>'service_fee_kobo')::bigint > 0)
  );
