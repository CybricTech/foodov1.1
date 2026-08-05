-- ============================================================================
-- 103: Publish the rider track (and the scheduling fields) to Realtime
-- ============================================================================
-- Third pass over the `orders` publication column list. 070 narrowed it to cut
-- WAL-decode CPU after the 2026-06-11 usage-exhaustion incident; 072 restored
-- the four columns that narrowing had broken. Both audited the subscribers of
-- the day — and both predate migrations 087 (scheduled orders) and 101 (the
-- rider track), which added columns the merchant boards now read live and never
-- receive.
--
-- A publication column list is not a filter that clients can widen. Postgres
-- emits ONLY the listed columns in the logical-decoding output, so an unlisted
-- column is absent from `payload.new` — permanently, silently, and identically
-- for every subscriber. Both dashboards merge the payload into their local row
-- (`{...o, ...updated}`), so an absent column is not overwritten with null; it
-- simply never changes from whatever the page load put there.
--
-- WHAT THAT BROKE
-- ---------------
-- 101 made orders.rider_requested_at the fact the merchant UI keys the whole
-- handover on: it swaps "Assign Rider" for the "Kitchyn rider handling" pill,
-- and it is what /api/dashboard/orders/update-status checks before refusing a
-- merchant's in_transit. It was not published. Neither was dispatch_state, nor
-- dispatch_type. So a rider requested while the board was open — by the T−10
-- cron, by Mark Ready, or by the merchant's own dispatch click — could not
-- reach the screen. Observed in production on 2026-08-02: a merchant tapped
-- Assign Rider repeatedly on an order that already had a rider en route, and a
-- platform-lane order showed a "Hand to Rider" button the API answered 403 to
-- on every tap.
--
-- 087's scheduled_for / activated_at have the same shape of failure, quieter:
-- both boards detect a pre-order going live by comparing
-- isPendingScheduledOrder(prev) against isPendingScheduledOrder({...prev,
-- ...payload.new}), and the activation cron writes activated_at — the exact
-- column the payload omits. The comparison could never flip, so the chime and
-- the tab jump that stop an activated pre-order being missed never fired. The
-- admin Scheduled Orders board reads both columns off the payload directly.
--
-- WHAT IS STILL EXCLUDED, AND WHY
-- -------------------------------
-- The heavy free-text fields — delivery_address, special_instructions,
-- cancelled_reason — stay out. They are what made the WAL decode expensive in
-- the first place (070's WHY block), they are immutable in practice for the
-- life of an order, and every consumer already has them from its initial fetch.
-- The eleven columns added here are a timestamp, two short enums, a uuid-free
-- text lane and two timestamps: cheap to decode, and each one is read directly
-- off the payload by a live subscriber.
--
-- Adding to this list is the correct move whenever a NEW column has to update a
-- board live. Removing one silently freezes a feature — the failure mode this
-- migration exists to repair, twice over.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE orders;
  END IF;
END $$;

-- 072's twelve, plus:
--   dispatch_type       which lane the order is on (101)
--   dispatch_state      the rider's own lifecycle, independent of status (101)
--   rider_requested_at  the outer "a rider has been asked for" latch (101)
--   scheduled_for       the booked slot of a pre-order (087)
--   activated_at        the moment a pre-order entered the live queue (087)
--   payment_status      read straight off the payload by the admin live-ops feed
ALTER PUBLICATION supabase_realtime
  ADD TABLE orders (
    id, restaurant_id, order_number, status, delivery_status,
    fulfillment_type, payment_status, total_kobo, total_amount,
    created_at, updated_at, late_at, rider_id,
    dispatch_type, dispatch_state, rider_requested_at,
    scheduled_for, activated_at
  );

-- ── Verification ────────────────────────────────────────────────────────────
-- The column list is the whole point of this migration and a typo in it fails
-- silently — exactly like the omissions it repairs. Assert it landed.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(c, ', ')
    INTO missing
    FROM unnest(ARRAY[
      'id', 'restaurant_id', 'status', 'dispatch_type', 'dispatch_state',
      'rider_requested_at', 'scheduled_for', 'activated_at'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND tablename = 'orders'
        AND c = ANY(attnames::text[])
   );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'orders realtime publication is missing: %', missing;
  END IF;

  RAISE NOTICE 'orders realtime publication now carries the rider track';
END $$;
