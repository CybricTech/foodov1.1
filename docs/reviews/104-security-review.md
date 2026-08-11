# Security Review — migration 104: Admin live-ops RPCs (`ops_summary`, `ops_hourly`, `ops_order_detail`)

- **Reviewer:** Security Engineer
- **Date:** 2026-08-10
- **Subject:** `supabase/migrations/104_ops_summary.sql`
- **Mode:** REVIEW ONLY — no files modified. Findings + fix list for the Backend Architect's follow-up pass.

---

## 1. Scope & files reviewed

| File | Role in review |
|---|---|
| `supabase/migrations/104_ops_summary.sql` | The subject migration (244 lines) |
| `supabase/migrations/098_admin_finance_rpcs.sql` | The pattern 104 claims to clone, incl. `finance_assert_admin()` (lines 33–49) and its REVOKE/GRANT block (341–349) |
| `supabase/migrations/099_fix_finance_summary_group_by.sql`, `100_fix_finance_order_economics_bigint_cast.sql` | Later uses of the same pattern (both call `PERFORM finance_assert_admin()`; both re-grant `authenticated`) |
| `supabase/migrations/006_fix_rls_recursion.sql` | `get_my_role()` (lines 14–20) + tenant-isolation policy baseline |
| `20260809101638_rls_hardening.sql`, `20260809101856_rls_hardening_function_execute.sql`, `20260809102158_fix_restaurant_guard_security_invoker.sql`, `20260809110000_lock_down_orders_and_restaurants_anon.sql`, `20260809120000_audit_trail_layers_1_and_2.sql`, `20260809134837_audit_trail_view.sql`, `20260809150000_fix_cron_bearer_and_vault_secret.sql` | Post-incident 2026-08-09 RLS/security hardening set — conventions 104 is held to |
| `001_initial_schema.sql`, `005_schema_align.sql`, `026_order_vat_service_fee.sql`, `044_add_dispatch_type_to_orders.sql`, `063_idempotent_rider_alerts.sql`, `069_restaurant_test_flag.sql`, `087_scheduled_orders.sql`, `095_bolt_ride_booking.sql`, `101_dispatch_policy.sql`, `103_realtime_dispatch_columns.sql` | Schema/column existence + realtime publication whitelist |
| `apps/web/app/admin/(protected)/page.tsx` (live-ops server page), `(protected)/layout.tsx`, `(protected)/riders/page.tsx`, `(protected)/finance/page.tsx`, `(protected)/disputes/page.tsx`, `(protected)/late-orders/page.tsx`, `(protected)/scheduled-orders/page.tsx`, `components/admin/live-ops-client.tsx`, `components/admin/ops/*`, `lib/admin/ops-types.ts` | App-side precedent for existing PII exposure and RPC callers |

## 2. Summary verdict: **APPROVED-WITH-FIXES**

The three functions are well-constructed: correct `SET search_path = public`, `STABLE` (never `IMMUTABLE`), read-only, no dynamic SQL, no realtime dependency, full REVOKE coverage, guard invoked before any data access, and every referenced column exists (verified against 001/005/026/069).

Two findings require fixes before/with deployment:

1. **HIGH** — `finance_assert_admin()` has a NULL-bypass (`get_my_role() <> 'super_admin'` is NULL for a profile-less authenticated user → guard silently passes), **and** 104 re-grants `EXECUTE` to `authenticated`, which re-opens a path the 2026-08-09 hardening set deliberately closed (`20260809101856` strips `authenticated` EXECUTE schema-wide; `20260809134837` grants service_role only). Combined: an authenticated JWT holder **without a `user_profiles` row** can call all three RPCs and read platform-wide KPIs and arbitrary order PII (customer phone/address, rider name/phone).
2. **LOW** — `ops_order_detail` deliberately skips the `is_test` exclusion that the two aggregate functions apply; make this decision explicit or parameterisable.

Everything else is consistent with repo precedent (098 finance RPCs also return platform-wide data; admin pages already serve the same PII over the service client) or is INFO-level hardening.

---

## 3. Findings table

| # | Severity | Finding | Fix recommendation | File + line |
|---|---|---|---|---|
| F-01 | **HIGH** | `finance_assert_admin()` fails open for authenticated users with **no `user_profiles` row**: `get_my_role()` returns NULL, `NULL <> 'super_admin'` is NULL, PL/pgSQL `IF NULL` → no raise → gate passes. Combined with 104's `GRANT EXECUTE … TO authenticated`, any profile-less authenticated session can call `ops_summary`/`ops_hourly`/`ops_order_detail` and read platform-wide GMV and arbitrary order PII (customer_name, customer_phone, delivery_address, special_instructions, rider_name/rider_phone). No `handle_new_user` trigger exists in the migrations (grep: none), so profile-less auth sessions are structurally possible. | **104-side (mandatory):** drop `authenticated` from the GRANT — every real caller is a server component on the service client (evidence: `finance/page.tsx` uses `createServiceClient()`; live-ops page uses `createServiceClient()`; ops-* components receive RPC results as props from a server page) → `GRANT EXECUTE … TO service_role` only. **098-side (follow-up hardening):** make the guard fail closed — see Fix 2 (verbatim SQL in §5). | 104 lines 242–244; guard def 098 lines 34–49 (flaw at line 42); hardening precedent `20260809101856` lines 12–30 |
| F-02 | **MEDIUM** | 104's `GRANT EXECUTE … TO authenticated` contradicts the 08-09 hardening posture (`20260809101856` revoked anon/authenticated EXECUTE across the whole public schema; `20260809134837` grants service_role only). On an **existing** DB (hardening already applied), 104's grant **re-opens** the path; on a **fresh** DB the hardening migration runs after 104 (filename order) and strips it again — i.e. final grants differ by environment. | Same fix as F-01: grant `service_role` only. This makes fresh and existing environments identical and neutralises the re-opened path. | 104 lines 242–244; `20260809101856` lines 12–30; `20260809134837` lines 48–49 |
| F-03 | **LOW** | `ops_order_detail` has no `r.is_test = false` join (banner comment says "…except the drill-down" is intentional). Not a bypass — single row by UUID, admin-gated, and service-role clients can already read any order — but it is an inconsistency with the two aggregate functions and with the client's test-exclusion rule; a future caller could render test orders into a KPI view by accident. | Keep as is (documented) **or** add a `p_include_test BOOLEAN DEFAULT false` parameter (default `false`, drill-down passes `true` when the UI opens from a test context). No other change needed. | 104 lines 176–232 (no is_test filter); comment lines 16–20 |
| F-04 | **LOW** | `rider_name`/`rider_phone` (user_profiles join) is **new** surface in an RPC. Not a new capability — `user_profiles_admin` FOR ALL (001/006) already lets super_admin read full_name/phone over the authenticated client, and the admin app is service-client anyway — but it is the one field set 104 exposes that no current admin page passes through an RPC. Order PII itself (customer_name/phone/address) is already served to the same audience by the live-ops page over the service client (`page.tsx` line 49) and by disputes/late-orders/scheduled-orders/riders pages. | No action required for the order PII (precedent). For rider PII: keep it gated behind super_admin/service_role as fixed in F-01/F-02. Consider masking `rider_phone` (e.g. last 4 digits) if a non-admin role ever gains access — not applicable today. | 104 lines 194–207 (user_profiles join); precedent `apps/web/app/admin/(protected)/page.tsx` line 49 |
| F-05 | INFO | `SET search_path = public` does not explicitly neutralise `pg_temp`. If the `authenticated` role holds TEMP on the database, a temp object named `orders`/`order_items`/etc. could shadow the public tables inside a SECURITY DEFINER function. This is repo-wide convention (098 identical, all 2026 hardening functions identical) and the F-01 grant fix removes the only attacker-reachable role; noted as hardening, not a defect of 104. | Optional hardening: `SET search_path = public, pg_temp` (explicitly search pg_temp last) in new SECURITY DEFINER functions; or revoke TEMP from anon/authenticated once. Not blocking. | 104 lines 53, 98, 153 |
| F-06 | INFO | No upper bound on `p_from`/`p_to` — an admin can aggregate the entire order history in one call. Same as 098 finance RPCs; performance/abuse consideration only, no cross-role exposure (F-01 fixes the reachable caller set). | No action required; optionally document an app-side cap (e.g. 366 days) in the dashboard caller. | 104 lines 83–85 |
| F-07 | INFO | Correctness guard-rail (learned from migration 100's exact-type-match bug): all `RETURN QUERY` column types verified against the tables — TEXT/BIGINT/NUMERIC/INTEGER/JSONB all match; `COALESCE(SUM(bigint) FILTER…)::BIGINT`, `ROUND(EXTRACT(EPOCH…)…)::NUMERIC`, `generate_series(0,23)::INTEGER` are all sound. | No action required. | 104 lines 41–87, 90–129, 132–234 |

---

## 4. Checklist results (per mandate)

1. **Definer safety (ops_order_detail).** `SECURITY DEFINER` (lines 152) + `SET search_path = public` (153) + guard first (156). A caller passing the admin gate can read **any order by UUID** — this is the intended live-ops drill-down, and it is consistent with repo precedent: 098's finance RPCs return platform-wide data to the same caller set, and the live-ops server page already returns the same PII columns (customer_name, customer_phone, delivery_address, special_instructions) for up to 1000 orders over the service client. **No new data class beyond rider name/phone (F-04).** The only defect is which callers can pass the gate (F-01).
2. **Admin gate.** `PERFORM finance_assert_admin()` is the **first** statement in all three functions (lines 56, 101, 156) — before any table access. Signature `finance_assert_admin()` (zero args) exists in 098 (lines 34–49, `RETURNS VOID`); calls match the 098/099/100 idiom exactly. Exception disposition: `RAISE EXCEPTION` — aborts the call/transaction, no data returned, no catch inside 104. **Effectiveness caveat:** the guard itself fails open for profile-less authenticated users (F-01, HIGH).
3. **search_path.** Set in all three functions (lines 53, 98, 153) and in `finance_assert_admin` (098 line 37) and `get_my_role()` (006 line 17). **No dynamic SQL anywhere in 104** — zero injection surface.
4. **Grants.** `REVOKE ALL … FROM PUBLIC, anon` for all three (lines 239–241) removes the creation-time PUBLIC default; explicit `GRANT … TO authenticated, service_role` (242–244). No residual execute path: only the owner (postgres) bypasses, which is universal in this repo. **Problem:** the `authenticated` grant (F-01/F-02).
5. **Write capability.** All three functions are pure SELECT; `STABLE` (plpgsql STABLE also enforces no writes at runtime). No INSERT/UPDATE/DELETE, no volatile calls. ✓
6. **PII exposure.** Consistent with existing admin exposure: admin layout enforces super_admin (`layout.tsx` lines 26–36, server-verified via service client), all admin order reads already happen on the service client with the same columns. New: rider full_name/phone via `user_profiles` (F-04, LOW). The 2026-08-08 incident's lesson (20260809110000) was anon exposure — 104 creates **zero** anon exposure (REVOKE + rejected by guard).
7. **Predicate safety.** `ops_summary` (line 85) and `ops_hourly` (line 117) both keep `r.is_test = false` — intact, matching the client-side exclusion (live-ops page lines 70–79). `ops_order_detail` intentionally omits it (F-03, LOW, documented). No enumeration vector beyond the intended admin read of platform-wide data (same capability as 098).
8. **Volatility.** `STABLE` on all three — correct. `IMMUTABLE` would be wrong (tables + `AT TIME ZONE` on session-agnostic timestamptz is fine under STABLE; the WAT date math never needs constant-folding). ✓
9. **Column existence.** Verified per table: **orders** id/order_number/status/payment_status/fulfillment_type/total_kobo/subtotal_kobo/delivery_fee_kobo/service_fee_kobo/vat_kobo/customer_name/customer_phone/delivery_address/special_instructions/created_at/updated_at/delivered_at/restaurant_id — all exist (001 lines 248–277; 005 lines 11–19; 026 lines 2–4). **restaurants** id/is_test (069). **order_items** id/order_id/item_name/quantity (001 lines 296–306) + item_price_kobo/line_total_kobo (005 lines 31–33). **delivery_assignments** order_id/rider_id/assigned_at/picked_up_at/delivered_at (001 lines 347–369; unique order_id index 063). **user_profiles** id/full_name/phone (001 lines 51–67). ✓
10. **Realtime/pubsub.** 104 contains **no** publication statements; it depends only on direct table reads. The 103 whitelist (id, restaurant_id, order_number, status, dispatch_type, …` — heavy text fields excluded) is untouched. ✓

---

## 5. Prioritized fix list (for the Backend Architect, copy-pasteable)

### Fix 1 — HIGH: service_role-only EXECUTE in 104 (kills F-01 reachability + F-02 environment drift)

Replace lines 239–244 of `104_ops_summary.sql` with:

```sql
-- ── Permissions ─────────────────────────────────────────────────────────────
-- Grant alignment with 20260809101856_rls_hardening_function_execute.sql:
-- no anon/authenticated EXECUTE anywhere on the public schema. Every caller
-- (admin server components) uses the service client; finance_assert_admin()
-- remains as defense-in-depth for any future authenticated grant.
REVOKE ALL ON FUNCTION ops_summary(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ops_hourly(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ops_order_detail(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ops_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION ops_hourly(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION ops_order_detail(UUID) TO service_role;
```

> Note: `REVOKE … FROM authenticated` is added so that on an existing DB (where the 08-09 hardening already stripped authenticated) re-applying 104 is idempotent, and on a fresh DB the result matches the hardening end-state exactly.

### Fix 2 — HIGH (follow-up migration, e.g. `105`: fail-closed guard for ALL admin RPCs incl. 098/099/100)

The NULL-bypass lives in 098, so it must be fixed in its own migration (104 cannot `CREATE OR REPLACE` it without silently altering the three finance RPCs' behaviour — it should, but that is a separate review surface). Verbatim:

```sql
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
```

### Fix 3 — LOW (product decision, not a defect): `is_test` in the drill-down

Either keep the documented "drill-down includes test orders" behaviour and add a comment on the caller contract, or add `p_include_test BOOLEAN DEFAULT false` and filter `AND (p_include_test OR r.is_test = false)` in `ops_order_detail`. Default must stay `false` to match the aggregates.

### Fix 4 — INFO (optional hardening): `search_path` pg_temp

For new SECURITY DEFINER functions going forward, use `SET search_path = public, pg_temp` (explicitly last) — or revoke TEMP from anon/authenticated once. Not required if Fix 1 ships.

---

## 6. Touched files

- **Written:** `docs/reviews/104-security-review.md` (this file)
- **Not modified:** `supabase/migrations/104_ops_summary.sql` and every other file — review-only per mandate.