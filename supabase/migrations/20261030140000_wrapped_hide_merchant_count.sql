-- ============================================================================
-- Kitchyn Wrapped — never reveal how many merchants Kitchyn has.
--
-- The rank card used to say "Ranked #3 of 42", and the stats JSON (readable by
-- each owner) carried `rank` and `ranked_restaurants`. Both disclose the size
-- of the platform. wrapped_compute_stats now emits only `top_percent`, rounded
-- to a bucket (1 / 5 / 10 / 25 / 50, NULL below the top half or with fewer
-- than 5 ranked kitchens), and already-published editions are scrubbed.
-- ============================================================================

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

  -- Where this merchant stands among live Kitchyn kitchens by orders over the
  -- same window (all-time editions compare all-time totals). Only a rounded
  -- percentile bucket leaves this function — never the merchant's rank or how
  -- many kitchens there are, so the platform's size can't be read off it.
  WITH counts AS (
    SELECT r.id, COUNT(o.id) AS n
    FROM restaurants r
    JOIN orders o ON o.restaurant_id = r.id
     AND o.payment_status = 'paid' AND o.status <> 'cancelled'
     AND o.created_at < p_to
     AND (p_scope = 'all_time' OR o.created_at >= p_from)
    WHERE NOT r.is_test
    GROUP BY r.id
  ), standing AS (
    SELECT COUNT(*) AS total,
           1 + COUNT(*) FILTER (WHERE n > COALESCE((SELECT n FROM counts WHERE id = p_restaurant), 0)) AS place
    FROM counts
  )
  SELECT jsonb_build_object('top_percent',
    CASE
      WHEN total < 5 THEN NULL                       -- too few to say anything
      WHEN CEIL(100.0 * place / total) <= 1  THEN 1
      WHEN CEIL(100.0 * place / total) <= 5  THEN 5
      WHEN CEIL(100.0 * place / total) <= 10 THEN 10
      WHEN CEIL(100.0 * place / total) <= 25 THEN 25
      WHEN CEIL(100.0 * place / total) <= 50 THEN 50
    END
  ) INTO v_rank
  FROM standing;

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

REVOKE ALL ON FUNCTION wrapped_compute_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION wrapped_compute_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;

-- Scrub editions already published with the raw rank/count.
UPDATE merchant_wrapped
SET stats = (stats - 'rank' - 'ranked_restaurants')
  || jsonb_build_object('top_percent',
       CASE
         WHEN COALESCE((stats->>'ranked_restaurants')::INT, 0) < 5 THEN NULL
         WHEN CEIL(100.0 * (stats->>'rank')::INT / (stats->>'ranked_restaurants')::INT) <= 1  THEN 1
         WHEN CEIL(100.0 * (stats->>'rank')::INT / (stats->>'ranked_restaurants')::INT) <= 5  THEN 5
         WHEN CEIL(100.0 * (stats->>'rank')::INT / (stats->>'ranked_restaurants')::INT) <= 10 THEN 10
         WHEN CEIL(100.0 * (stats->>'rank')::INT / (stats->>'ranked_restaurants')::INT) <= 25 THEN 25
         WHEN CEIL(100.0 * (stats->>'rank')::INT / (stats->>'ranked_restaurants')::INT) <= 50 THEN 50
       END)
WHERE stats ? 'ranked_restaurants' OR stats ? 'rank';

notify pgrst, 'reload schema';
