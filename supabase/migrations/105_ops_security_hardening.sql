-- ============================================================================
-- 105: Fail-closed admin guard — finance_assert_admin() NULL-bypass fix
-- ============================================================================
-- WHY (Security Fix 2 from docs/reviews/104-security-review.md, F-01/HIGH):
--
-- finance_assert_admin() (migration 098) gates EVERY admin RPC — the finance
-- set (098/099/100) and the live-ops set (104). The original guard compared
-- `get_my_role() <> 'super_admin'`:
--
--   • get_my_role() (migration 006) returns NULL for an authenticated user
--     with NO user_profiles row (`SELECT role FROM user_profiles
--     WHERE id = auth.uid()` → no row → NULL; no handle_new_user trigger
--     exists in the migrations, so profile-less auth sessions are structurally
--     possible).
--   • NULL <> 'super_admin' evaluates to NULL (not TRUE), and PL/pgSQL
--     treats a NULL IF condition as FALSE — so the guard silently PASSED.
--
-- Combined with 104's original `GRANT EXECUTE ... TO authenticated` (now
-- removed by Fix 1), any profile-less authenticated JWT holder could call
-- ops_summary / ops_hourly / ops_order_detail and read platform-wide KPIs and
-- arbitrary order PII (customer phone/address, rider name/phone).
--
-- This OR REPLACE makes the guard fail CLOSED: the authenticated branch now
-- uses `get_my_role() IS DISTINCT FROM 'super_admin'`, which is TRUE for both
-- a non-admin role AND a missing profile row. Signature (RETURNS VOID, zero
-- args, plpgsql STABLE, search_path = public) is unchanged, so 098/099/100/104
-- inherit the fix without any edit to their bodies.
--
-- The REVOKE/GRANT matches the 2026-08-09 hardening posture exactly
-- (20260809101856 strips anon/authenticated EXECUTE schema-wide;
-- 20260809134837 grants service_role only). It is defense-in-depth — the
-- guard is only ever reached from SECURITY DEFINER callers running as the
-- function owner, but auth.role()/auth.uid() reflect the REQUESTING user, not
-- the definer, so the gate still evaluates the caller inside those functions.
-- ============================================================================

-- 105: fail-closed finance_assert_admin — a profile-less authenticated user
-- (get_my_role() = NULL) previously passed the gate: NULL <> 'super_admin'
-- is NULL, and PL/pgSQL treats a NULL IF condition as false. Every admin RPC
-- (098/099/100/104) inherits the guard, so this hardens all of them at once.
CREATE OR REPLACE FUNCTION finance_assert_admin()
RETURNS VOID
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  -- service_role (admin server components) bypasses; authenticated users must
  -- be super_admin with a profile row; anon is rejected; a missing profile
  -- (get_my_role() IS NULL) is now REJECTED instead of silently allowed.
  IF auth.role() = 'authenticated' AND get_my_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION finance_assert_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance_assert_admin() TO service_role;