-- Per-item special requests were collected and then thrown away.
--
-- The storefront item sheet has had a "Special requests" textarea since launch
-- (components/storefront/menu-item-sheet.tsx). It writes to the cart store, and
-- the cart sheet and checkout page both render it back to the customer — so the
-- customer watches their note survive all the way to the Pay button and
-- reasonably concludes the kitchen will see it.
--
-- It never left the browser. The checkout POST mapped only
-- (menuItemId, name, priceKobo, quantity, selectedOptions); /api/checkout/initialize
-- had no `specialRequest` in its Zod item schema and so would have stripped it
-- anyway; and there was no column here to insert it into.
--
-- An "arome by harazimi" customer ordered with "without coconut" against an
-- allergy. The kitchen never saw the note, the dish arrived with coconut, and
-- the customer spat it out. That is the failure mode this column closes.
--
-- order-level `orders.special_instructions` is a different field (the note for
-- the restaurant as a whole) and is unaffected.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS special_request text;

COMMENT ON COLUMN order_items.special_request IS
  'Customer free-text request for this specific line item ("no coconut", "extra spicy"), captured in the storefront item sheet. Allergy-bearing: surface it on every merchant-facing order view and kitchen ticket. Distinct from orders.special_instructions, which is the order-wide note.';
