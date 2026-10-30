-- ============================================================================
-- Kitchyn Wrapped — a monthly, Spotify-Wrapped-style story for merchants.
--
-- On the LAST day of every month (09:00 Africa/Lagos) a pg_cron job snapshots
-- each merchant's numbers for that month into merchant_wrapped. The
-- dashboard (web + mobile owner app) surfaces a new edition exactly like
-- "What's New" (migration 074): a pill with an unread dot, auto-opening once.
--
-- Editions:
--   • A merchant's FIRST edition is all-time — everything since they joined.
--     So the launch edition (2026-10, published when this migration is
--     applied) is all-time for every merchant, and a merchant who joins later also gets an all-time
--     debut before switching to monthly.
--   • Every later edition covers just that calendar month, with the previous
--     month's orders/revenue stored alongside for "up X%" callouts.
--
-- Snapshots (rather than a live query) keep the numbers frozen — a merchant
-- replaying October's story in March sees October — and make the story load
-- instantly with a single-row read.
--
-- Reconciliation rules (match the merchant analytics page):
--   • A counted order is payment_status = 'paid' AND status <> 'cancelled'.
--   • Revenue = total_kobo − service_fee_kobo (the service fee is Kitchyn's;
--     same as orderRevenue() in analytics-client.tsx and settlement gross).
--   • Day/hour grouping is Africa/Lagos (UTC+1, no DST), as in 098 / 104.
--   • restaurants.is_test merchants are never published or ranked.
--
-- Access: owners read their own restaurant's PUBLISHED editions (staff never
-- see revenue); super_admin reads all. Compute/publish functions are
-- service_role-only (the cron runs as postgres).
-- ============================================================================

-- ──────────────────────────────────────────────────────────
-- 1. merchant_wrapped — one edition per merchant per month
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_wrapped (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  period_key     TEXT NOT NULL CHECK (period_key ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM'
  scope          TEXT NOT NULL CHECK (scope IN ('all_time', 'month')),
  period_start   TIMESTAMPTZ NOT NULL,
  period_end     TIMESTAMPTZ NOT NULL,          -- exclusive
  stats          JSONB NOT NULL,
  published_at   TIMESTAMPTZ,                   -- NULL = draft (hidden)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (restaurant_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_merchant_wrapped_latest
  ON merchant_wrapped (restaurant_id, period_key DESC)
  WHERE published_at IS NOT NULL;

ALTER TABLE merchant_wrapped ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_wrapped_owner_read" ON merchant_wrapped;
CREATE POLICY "merchant_wrapped_owner_read"
  ON merchant_wrapped FOR SELECT
  USING (
    published_at IS NOT NULL
    AND published_at <= now()
    AND restaurant_id = public.get_my_restaurant_id()
    AND public.get_my_role() = 'merchant_owner'
  );

DROP POLICY IF EXISTS "merchant_wrapped_admin_all" ON merchant_wrapped;
CREATE POLICY "merchant_wrapped_admin_all"
  ON merchant_wrapped FOR ALL
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- Per-user "seen" marker: the period_key of the last edition they watched.
-- user_profiles_own already lets a user stamp their own row (see 074).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_seen_wrapped_key TEXT;

-- ──────────────────────────────────────────────────────────
-- 2. wrapped_compute_stats — the numbers behind one story
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wrapped_compute_stats(
  p_restaurant UUID,
  p_from       TIMESTAMPTZ,
  p_to         TIMESTAMPTZ,
  p_scope      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name          TEXT;
  v_joined        TIMESTAMPTZ;
  v_core          JSONB;
  v_top_items     JSONB;
  v_distinct_items INT;
  v_customers     JSONB;
  v_top_customer  JSONB;
  v_weekdays      JSONB;
  v_hours         JSONB;
  v_best_day      JSONB;
  v_reviews       JSONB;
  v_top_review    JSONB;
  v_first_order   JSONB;
  v_rank          JSONB;
  v_previous      JSONB := NULL;
  v_prev_from     TIMESTAMPTZ;
BEGIN
  SELECT name, created_at INTO v_name, v_joined
  FROM restaurants WHERE id = p_restaurant;

  -- Counted orders for this merchant in the window, with Lagos-local fields.
  CREATE TEMP TABLE IF NOT EXISTS _wr_orders (
    id UUID, created_at TIMESTAMPTZ, local_ts TIMESTAMP, revenue BIGINT,
    fulfillment_type TEXT, order_number TEXT, cust_key TEXT, cust_name TEXT
  ) ON COMMIT DROP;
  TRUNCATE _wr_orders;

  INSERT INTO _wr_orders
  SELECT o.id, o.created_at, o.created_at AT TIME ZONE 'Africa/Lagos',
         (o.total_kobo - COALESCE(o.service_fee_kobo, 0))::BIGINT,
         o.fulfillment_type, o.order_number,
         COALESCE(o.customer_id::TEXT, NULLIF(o.customer_phone, '')),
         COALESCE(NULLIF(c.full_name, ''), NULLIF(o.customer_name, ''))
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.restaurant_id = p_restaurant
    AND o.payment_status = 'paid'
    AND o.status <> 'cancelled'
    AND o.created_at >= p_from
    AND o.created_at <  p_to;

  SELECT jsonb_build_object(
    'orders',          COUNT(*),
    'revenue_kobo',    COALESCE(SUM(revenue), 0),
    'aov_kobo',        CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(revenue)::NUMERIC / COUNT(*)) END,
    'delivery_orders', COUNT(*) FILTER (WHERE fulfillment_type = 'delivery'),
    'pickup_orders',   COUNT(*) FILTER (WHERE fulfillment_type <> 'delivery'),
    'days_active',     COUNT(DISTINCT local_ts::DATE)
  ) INTO v_core
  FROM _wr_orders;

  -- Top dishes by quantity (grouped by menu item so renames don't split a dish).
  WITH items AS (
    SELECT oi.menu_item_id,
           SUM(oi.quantity)::BIGINT AS qty,
           SUM(oi.line_total_kobo)::BIGINT AS rev,
           (ARRAY_AGG(oi.item_name ORDER BY w.created_at DESC))[1] AS name
    FROM order_items oi
    JOIN _wr_orders w ON w.id = oi.order_id
    GROUP BY oi.menu_item_id
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'name', t.name, 'quantity', t.qty, 'revenue_kobo', t.rev, 'image_url', mi.image_url
    ) ORDER BY t.qty DESC, t.rev DESC) FILTER (WHERE t.rn <= 5), '[]'::JSONB),
    COUNT(*)::INT
  INTO v_top_items, v_distinct_items
  FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY qty DESC, rev DESC) AS rn FROM items) t
  LEFT JOIN menu_items mi ON mi.id = t.menu_item_id;

  -- Customers: total, new (first-ever counted order falls in the window), repeat.
  WITH per AS (
    SELECT cust_key, COUNT(*) AS n, SUM(revenue) AS spent,
           (ARRAY_AGG(cust_name ORDER BY created_at DESC) FILTER (WHERE cust_name IS NOT NULL))[1] AS name
    FROM _wr_orders WHERE cust_key IS NOT NULL
    GROUP BY cust_key
  ), firsts AS (
    SELECT COALESCE(o.customer_id::TEXT, NULLIF(o.customer_phone, '')) AS cust_key,
           MIN(o.created_at) AS first_at
    FROM orders o
    WHERE o.restaurant_id = p_restaurant
      AND o.payment_status = 'paid' AND o.status <> 'cancelled'
      AND COALESCE(o.customer_id::TEXT, NULLIF(o.customer_phone, '')) IN (SELECT cust_key FROM per)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'customers',        (SELECT COUNT(*) FROM per),
    'new_customers',    (SELECT COUNT(*) FROM firsts WHERE first_at >= p_from),
    'repeat_customers', (SELECT COUNT(*) FROM per WHERE n >= 2)
  ),
  (SELECT jsonb_build_object(
      'first_name', INITCAP(SPLIT_PART(TRIM(name), ' ', 1)),
      'orders', n, 'spent_kobo', spent)
   FROM per WHERE n >= 2
   ORDER BY n DESC, spent DESC LIMIT 1)
  INTO v_customers, v_top_customer;

  -- When the kitchen is busiest: Mon..Sun (ISO dow 1..7 → index 0..6), 0..23h.
  SELECT jsonb_agg(COALESCE(c.n, 0) ORDER BY d.i) INTO v_weekdays
  FROM generate_series(1, 7) AS d(i)
  LEFT JOIN (SELECT EXTRACT(ISODOW FROM local_ts)::INT AS i, COUNT(*) AS n
             FROM _wr_orders GROUP BY 1) c USING (i);

  SELECT jsonb_agg(COALESCE(c.n, 0) ORDER BY h.i) INTO v_hours
  FROM generate_series(0, 23) AS h(i)
  LEFT JOIN (SELECT EXTRACT(HOUR FROM local_ts)::INT AS i, COUNT(*) AS n
             FROM _wr_orders GROUP BY 1) c USING (i);

  SELECT jsonb_build_object('date', d, 'orders', n, 'revenue_kobo', rev) INTO v_best_day
  FROM (SELECT local_ts::DATE AS d, COUNT(*) AS n, SUM(revenue) AS rev
        FROM _wr_orders GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 1) b;

  -- Reviews left in the window.
  SELECT jsonb_build_object(
    'rating_avg',      ROUND(AVG(rating)::NUMERIC, 1),
    'rating_count',    COUNT(*),
    'five_star_count', COUNT(*) FILTER (WHERE rating = 5)
  ) INTO v_reviews
  FROM reviews
  WHERE restaurant_id = p_restaurant AND is_approved
    AND created_at >= p_from AND created_at < p_to;

  SELECT jsonb_build_object(
    'name', INITCAP(SPLIT_PART(TRIM(reviewer_name), ' ', 1)),
    'comment', TRIM(comment), 'rating', rating) INTO v_top_review
  FROM reviews
  WHERE restaurant_id = p_restaurant AND is_approved AND rating >= 4
    AND LENGTH(TRIM(COALESCE(comment, ''))) BETWEEN 12 AND 180
    AND created_at >= p_from AND created_at < p_to
  ORDER BY rating DESC, created_at DESC LIMIT 1;

  IF p_scope = 'all_time' THEN
    SELECT jsonb_build_object('at', created_at, 'order_number', order_number)
    INTO v_first_order
    FROM _wr_orders ORDER BY created_at LIMIT 1;
  END IF;

  -- Where this merchant ranks among live Kitchyn kitchens by orders over the
  -- same window (all-time editions compare all-time totals).
  WITH counts AS (
    SELECT r.id, COUNT(o.id) AS n
    FROM restaurants r
    JOIN orders o ON o.restaurant_id = r.id
     AND o.payment_status = 'paid' AND o.status <> 'cancelled'
     AND o.created_at < p_to
     AND (p_scope = 'all_time' OR o.created_at >= p_from)
    WHERE NOT r.is_test
    GROUP BY r.id
  )
  SELECT jsonb_build_object(
    'ranked_restaurants', COUNT(*),
    'rank', 1 + COUNT(*) FILTER (WHERE n > COALESCE((SELECT n FROM counts WHERE id = p_restaurant), 0))
  ) INTO v_rank
  FROM counts;

  IF p_scope = 'month' THEN
    v_prev_from := p_from - INTERVAL '1 month';
    SELECT jsonb_build_object(
      'orders', COUNT(*),
      'revenue_kobo', COALESCE(SUM(total_kobo - COALESCE(service_fee_kobo, 0)), 0))
    INTO v_previous
    FROM orders
    WHERE restaurant_id = p_restaurant
      AND payment_status = 'paid' AND status <> 'cancelled'
      AND created_at >= v_prev_from AND created_at < p_from;
  END IF;

  RETURN jsonb_build_object(
      'version',         1,
      'scope',           p_scope,
      'restaurant_name', v_name,
      'joined_at',       v_joined,
      'period_start',    p_from,
      'period_end',      p_to,
      'top_items',       v_top_items,
      'distinct_items',  v_distinct_items,
      'top_customer',    v_top_customer,
      'weekday_counts',  v_weekdays,
      'hour_counts',     v_hours,
      'best_day',        v_best_day,
      'top_review',      v_top_review,
      'first_order',     v_first_order,
      'previous',        v_previous
    )
    || v_core || v_customers || v_reviews || v_rank;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 3. wrapped_publish_month — snapshot every merchant for one month
--    p_month: any date inside the month (default: this month, Lagos time).
--    p_to:    where the numbers stop (default: now(), capped at month end).
--    Idempotent per (restaurant, month): re-running refreshes the numbers
--    without re-notifying anyone (seen-state is keyed by period_key), and a
--    merchant's first edition stays all-time.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wrapped_publish_month(
  p_month DATE DEFAULT NULL,
  p_to    TIMESTAMPTZ DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start DATE := date_trunc('month', COALESCE(p_month, (now() AT TIME ZONE 'Africa/Lagos')::DATE))::DATE;
  v_key   TEXT := to_char(v_month_start, 'YYYY-MM');
  v_from  TIMESTAMPTZ := v_month_start::TIMESTAMP AT TIME ZONE 'Africa/Lagos';
  v_month_end TIMESTAMPTZ := (v_month_start + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE 'Africa/Lagos';
  v_to    TIMESTAMPTZ := LEAST(COALESCE(p_to, now()), v_month_end);
  v_count INT := 0;
  r       RECORD;
  v_scope TEXT;
  v_start TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT rs.id, rs.created_at
    FROM restaurants rs
    WHERE NOT rs.is_test
      AND rs.created_at < v_to
      AND (
        -- Merchants with something to celebrate this month…
        EXISTS (
          SELECT 1 FROM orders o
          WHERE o.restaurant_id = rs.id
            AND o.payment_status = 'paid' AND o.status <> 'cancelled'
            AND o.created_at >= v_from AND o.created_at < v_to
        )
        -- …plus anyone already holding this month's edition (a refresh).
        OR EXISTS (SELECT 1 FROM merchant_wrapped mw
                   WHERE mw.restaurant_id = rs.id AND mw.period_key = v_key)
      )
  LOOP
    -- First edition (no earlier one) = all-time since they joined.
    IF EXISTS (SELECT 1 FROM merchant_wrapped
               WHERE restaurant_id = r.id AND period_key < v_key) THEN
      v_scope := 'month';
      v_start := v_from;
    ELSE
      v_scope := 'all_time';
      v_start := LEAST(r.created_at, (SELECT MIN(created_at) FROM orders WHERE restaurant_id = r.id));
    END IF;

    INSERT INTO merchant_wrapped (restaurant_id, period_key, scope, period_start, period_end, stats, published_at)
    VALUES (r.id, v_key, v_scope, v_start, v_to,
            wrapped_compute_stats(r.id, v_start, v_to, v_scope)
              || jsonb_build_object('period_key', v_key),
            now())
    ON CONFLICT (restaurant_id, period_key) DO UPDATE
      SET scope = EXCLUDED.scope,
          period_start = EXCLUDED.period_start,
          period_end = EXCLUDED.period_end,
          stats = EXCLUDED.stats;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 4. wrapped_cron_tick — runs daily; does the right thing for the date.
--    • Last day of the month (Lagos): publish this month's edition, so the
--      story drops while the month is still on merchants' minds.
--    • 1st of the month: quietly top up last month's editions with the final
--      hours of the last day, so a replay shows the complete month.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION wrapped_cron_tick()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Africa/Lagos')::DATE;
BEGIN
  IF EXTRACT(DAY FROM v_today + 1) = 1 THEN
    RETURN wrapped_publish_month(v_today);
  ELSIF EXTRACT(DAY FROM v_today) = 1 THEN
    -- Refresh only: merchants without last month's edition aren't added late.
    UPDATE merchant_wrapped mw
    SET period_end = (v_today::TIMESTAMP AT TIME ZONE 'Africa/Lagos'),
        stats = wrapped_compute_stats(mw.restaurant_id, mw.period_start,
                  v_today::TIMESTAMP AT TIME ZONE 'Africa/Lagos', mw.scope)
                || jsonb_build_object('period_key', mw.period_key)
    WHERE mw.period_key = to_char(v_today - 1, 'YYYY-MM');
    RETURN 0;
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION wrapped_compute_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION wrapped_publish_month(DATE, TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION wrapped_cron_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION wrapped_compute_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION wrapped_publish_month(DATE, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION wrapped_cron_tick() TO service_role;

-- ──────────────────────────────────────────────────────────
-- 5. Daily schedule — 08:00 UTC (09:00 Lagos), so on the last day of the
--    month the story is waiting when merchants open their dashboard.
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('merchant-wrapped-tick');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'merchant-wrapped-tick',
      '0 8 * * *',
      $cron$ SELECT public.wrapped_cron_tick(); $cron$
    );
    RAISE NOTICE 'merchant-wrapped-tick cron scheduled (daily 08:00 UTC)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled — skipping merchant-wrapped-tick schedule';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 6. Launch edition — publish the current month (all-time for everyone)
--    right away. The last-day tick refreshes it in place (no second
--    notification) and the 1st-of-month tick tops it up to month end.
-- ──────────────────────────────────────────────────────────
SELECT wrapped_publish_month();

notify pgrst, 'reload schema';
