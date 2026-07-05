-- ============================================================
-- 085: Per-program participant roster for the admin loyalty page.
--
-- The admin loyalty page can look up one phone at a time. This function powers
-- a "view everyone in the program" mode: given a program, return every distinct
-- customer phone that has any stamp activity, with their current balance, total
-- earned, ledger row count, and last activity — so admins can see the whole
-- program without knowing a number first.
--
-- Called via the service client (super-admin only API route), so no RLS/DEFINER
-- concerns; plain STABLE function.
-- ============================================================

CREATE OR REPLACE FUNCTION loyalty_program_participants(p_program_id UUID)
RETURNS TABLE (
  customer_phone TEXT,
  balance INTEGER,
  total_earned INTEGER,
  stamp_count BIGINT,
  last_activity TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    customer_phone,
    COALESCE(SUM(delta), 0)::int                               AS balance,
    COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0)::int      AS total_earned,
    COUNT(*)                                                   AS stamp_count,
    MAX(created_at)                                            AS last_activity
  FROM loyalty_stamps
  WHERE program_id = p_program_id
  GROUP BY customer_phone
  ORDER BY balance DESC, last_activity DESC;
$$;
