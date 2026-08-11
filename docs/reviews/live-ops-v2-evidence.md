# Live Operations v2 — QA Evidence Report

**QA Agent**: EvidenceQA (screenshot-obsessed, fantasy-allergic)
**Date**: 2026-08-10
**Repo**: `/Users/amir/Downloads/Repos/foodov1.1` (Turborepo · Next.js 14.2.29 + 14.2.35 dev)
**Object under test**: Upgraded admin Live Operations page `/admin` (spec: `docs/live-ops-v2-ux.md`)
**Dev server**: `npx turbo run dev --filter=@foodo/web` → **http://localhost:3002** (3000/3001 occupied by other processes; log at `/var/folders/gs/hgf4jndx1nj3s87g34r92tqh0000gn/T/opencode/liveops-dev.log`)
**Browser**: Playwright 1.62.1 + Chromium 1234 (installed into user cache, NOT the repo)

> **Evidence note (transparency)**: This model cannot render images inline, so every screenshot claim below is backed by (a) the PNG file itself, (b) pixel-level analysis (mean color / unique-color / per-pixel diff via a custom PNG decoder), and (c) machine-readable DOM extraction (exact copy, computed styles, scroll geometry) captured in `live-ops-v2-evidence/dom-evidence.json`, `api-probes.json`, `console-errors.json`. Each claim cites one of these. No "trust me" claims.

---

## 0. Reality check — auth situation (decides what can be verified visually)

**Findings**:
- `/admin` is gated by middleware → Supabase cookie session; `requireAdmin()` (`apps/web/lib/api/require-admin.ts`) requires `user_profiles.role = 'super_admin'`. No dev bypass exists.
- Supabase is **hosted** (`hcyxbmfbyvgybriloffo.supabase.co`, from `.env`) — no local stack to seed.
- **Credential sweep (exhaustive)**: `grep` across `.env`, `apps/web/.env`, `docs/**`, `scripts/**`, `supabase/migrations/**`, `supabase/seeds/dev.sql`, `supabase/functions/**` → **zero test credentials**. Only hit is `admin@cybric.tech`, which is a Resend *sending domain* (verified in [claude-code-prompt-email-notifications.md] line 21), not a login.
- `supabase/seeds/dev.sql` seeds restaurants/menu items only — **no `auth.users` rows**, no passwords anywhere.
- Per ground rules: **no credential fabrication, no repo modification, no migration application.** A negative login attempt (`no-such-admin@foodo.ng`) was made solely to document the login wall's rejection behavior.

**Consequence**: The authenticated page body of `/admin` **could not be rendered**. Items 1–6, 8, 9 (page-body parts) are therefore **NOT VERIFIABLE VISUALLY**; they are verified **statically** (code paths, wiring, exact spec class strings) plus runtime verification of everything *outside* the auth wall. Item 7 (API) and item 10 (console) **were** runtime-verified. This is documented per item below — nothing is dressed up as visual proof that isn't.

---

## 1. Runtime evidence captured

| File | What it is | How verified |
|---|---|---|
| `live-ops-v2-evidence/01-admin-login-wall-desktop.png` | `/admin` unauthenticated → **307** → `/admin/login?redirect=%2Fadmin` (login wall) | Playwright redirect-chain capture; 1280×900; mean RGB [20,2,47] (dark purple-900 brand) |
| `live-ops-v2-evidence/02-login-page-desktop.png` | Login page (same URL — redirect target) | DOM text: `Admin Access / Enter your credentials / Email / Password / Continue` |
| `live-ops-v2-evidence/03-login-form-filled.png` | Login form with values entered | 0.31% pixel diff vs 02 (form fill visible) |
| `live-ops-v2-evidence/04-login-invalid-creds-error.png` | **Negative login attempt result** | **7.75% pixel diff vs 03**; DOM error copy: `Invalid login credentials` (Supabase auth surfaced); URL unchanged | 
| `live-ops-v2-evidence/05-mobile-admin-login-wall.png` | Mobile (390×844) login wall | no horizontal overflow: `scrollWidth=390 == clientWidth=390` |
| `live-ops-v2-evidence/06-mobile-login-page.png` | Mobile login page | identical to 05 (both are the redirect target — expected) |
| `live-ops-v2-evidence/07-public-storefront-sanity.png` | Public storefront renders (control) | 662 unique color buckets vs 83 on login wall — completely different page, app healthy |
| `live-ops-v2-evidence/api-probes.json` | API probe results (fetch in browser context) | see §3 |
| `live-ops-v2-evidence/console-errors.json` | Console error/warning inventory | see §7 |
| `live-ops-v2-evidence/dom-evidence.json` | DOM extraction: copy, fields, focus sequence, error copy, mobile geometry | machine-readable |

Pixel analysis tool: `pngstats.py` (zlib PNG decoder), output inline below for each screenshot pair used as evidence.

---

## 2. PASS/FAIL summary table

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Page composes top→bottom per spec (11 blocks + drawer) | **NOT VERIFIABLE VISUALLY** (auth wall) — static: **PASS** | §4.1 static wiring map |
| 2 | Load state (skeleton while RSC loads) | **NOT VERIFIABLE VISUALLY** — static: **PASS w/ 1 deviation** | §4.2 (skeleton exists; KPI grid ≠ new anatomy) |
| 3 | Search matches merchant name AND order number | **NOT VERIFIABLE VISUALLY** — static: **PASS** | §4.3 |
| 4 | LIVE badge + "synced Xs ago" hidden when live | **NOT VERIFIABLE VISUALLY** — static: **PASS** | §4.4 |
| 5 | Live feed filters actually filter | **NOT VERIFIABLE VISUALLY** — static: **PASS** | §4.5 |
| 6 | Closed/paused merchants cap 12 + "+N more" → /admin/merchants | **NOT VERIFIABLE VISUALLY** — static: **PASS** | §4.6 |
| 7 | `/api/admin/order-detail` 401 unauth / 400 no orderId | **PARTIAL PASS (runtime 401; 400 static-only)** | §3 runtime probes |
| 8 | A11y spot-check (KPI links, focus, aria-modal, esc) | **PARTIAL**: drawer a11y static PASS; login-wall keyboard runtime-verified; page-body keyboard NOT VERIFIABLE VISUALLY | §4.8 |
| 9 | Mobile 390px: 2-col KPI, no overflow, feed collapse, bottom nav | **PARTIAL**: login wall no-overflow runtime PASS; /admin grids static PASS | §4.9 |
| 10 | Console errors during all of the above | **PASS — clean** (4 expected errors from deliberate probes, 0 app bugs) | §7 |

---

## 3. Item 7 — API endpoint probes (RUNTIME, real HTTP)

Probes executed via curl AND browser-context fetch against `http://localhost:3002`:

| Probe | HTTP | Body |
|---|---|---|
| `GET /api/admin/order-detail` (no auth, no orderId) | **401** | `{"error":"Unauthorized"}` |
| `GET /api/admin/order-detail?orderId=00000000-…-0001` (no auth) | **401** | `{"error":"Unauthorized"}` |
| `GET /api/admin/order-detail?orderId=not-a-uuid` (no auth) | **401** | `{"error":"Unauthorized"}` |
| `GET /api/admin/system-health` (no auth) | **401** | `{"error":"Unauthorized"}` |
| `GET /admin` | **307** → `/admin/login?redirect=%2Fadmin` | login wall |
| `GET /admin/login` | **200** | renders (DOM-extracted) |

**400 branch — static-only**: `requireAdmin()` runs **before** orderId validation in `route.ts` (`const auth = await requireAdmin(); if (auth.error) return auth.error;` precedes the `!orderId → 400` check). The 400 path (`{"error":"orderId query parameter is required"}`) and the UUID-format 400 (`"orderId must be a valid UUID"`) are unreachable without a valid super_admin session; both branches are present in code. **Needs a manual re-check after login is possible.**

---

## 4. Per-item evidence (1–6, 8, 9 — static; runtime where possible)

### 4.1 Item 1 — Page composition (top→bottom, `apps/web/components/admin/live-ops-client.tsx` + `ops/*`)

Static render order in `LiveOpsClient` matches spec §2 exactly:

1. Header: `h1` "Live Operations" (text-2xl font-extrabold text-black-900), LIVE badge, subtitle → `NewOrderNotifier` (ops-notifier) **before** search input in `flex items-center gap-2` (§4.1) — L660-697
2. `SystemHealthStrip` right after header (“first element in the page stack”) — L698. Spec §4.2 markup confirmed: `bg-white rounded-2xl border border-black-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5`, items Payments/Supabase/Webhooks with state suffix, next-peak clock item.
3. `OpsKpiRow` — `grid grid-cols-2 xl:grid-cols-4 gap-3` (§4.3) — 4 cards: Active Orders (Zap), Late Orders (AlertTriangle, red tone when >0, href /admin/late-orders, sub "past ETA — review"/"all on time"), Unconfirmed (Clock, gold when >0, sub "pending > 10m"), GMV Today (Flame, sub "paid orders", delta slot) — `ops/ops-kpi-row.tsx`
4. `OpsSecondaryRow` — `grid grid-cols-2 md:grid-cols-3 gap-3` (§4.4): Orders Today / Open Merchants `${openCount}/${totalActiveMerchants}` / Delivered·Cancelled; chips below in `mt-2 flex flex-wrap items-center gap-2` — Riders Online (Bike, /admin/riders, `min-h-10 rounded-full`), Settlements (Wallet, /admin/settlements) — `ops/ops-secondary-row.tsx`
5. `OpsSlaStrip` — `grid grid-cols-2 xl:grid-cols-4 gap-3` — 4 muted cards; **null → "—" + "no data"** — `ops/ops-sla-strip.tsx` (see §5 resilience)
6. `OpsHourlyChart` — collapsible, **`useState(false)` collapsed by default** (§5), expand button `h-10 w-10 rounded-full` + ChevronDown rotate-180, `aria-expanded`, `aria-label` "Expand/Collapse hourly throughput chart"; Recharts ComposedChart (bars #7B2CBF/#E0AAFF, lines #0E9F6E/#9E9E9E dashed), legend swatches, empty-day → "No orders yet today" — `ops/ops-hourly-chart.tsx`
7. Order Pipeline chips — unchanged copy (`Clear filter ×`, status chips) — L738-775
8. Merchant board `xl:col-span-2` open cards + **closed list `slice(0, 12)`** + feed `xl:sticky xl:top-4` right rail — L820-1000
9. `OrderDetailDrawer` — right slide-over `role="dialog" aria-modal="true"`, backdrop, focus trap, Esc closes — `ops/order-detail-drawer.tsx`
10. Page wrapper `<div className="p-4 md:p-6 pb-24 space-y-6">` ✓

**Spec-deviation found (§13-style issue) — GMV value source**: `OpsKpiRow` is called with `gmvTodayKobo={summaryToday.gmv_kobo}` (RPC value) — `live-ops-client.tsx` L709. Spec §4.3 mandates **`formatKobo(derived.gmvToday)`** (realtime-derived, "fresher than RPC"). `derived.gmvToday` exists (L503-567) but is unused. **Impact in the current migration-not-applied world: GMV Today shows ₦0 (RPC fallback) even when paid orders exist in the realtime snapshot** — this weakens the resilience story for exactly the KPI the spec called out. Delta badge itself is correctly derived (`summaryToday.gmv_kobo` vs `summaryLastWeek.gmv_kobo/7`, null→hidden) per §3.

### 4.2 Item 2 — Load state skeleton

`apps/web/app/admin/(protected)/loading.tsx` exists (default export `AdminLiveOpsLoading`, `animate-pulse`), mirroring header / KPI strip / pipeline / merchant board + feed rail. Capturing this visually requires passing the auth wall (it renders as the unauthenticated RSC resolves → redirect happens first), so **not visual-verifiable**.
**Deviation (Low)**: skeleton KPI strip is the OLD 8-card grid (`grid-cols-2 md:grid-cols-4 xl:grid-cols-8`, 8 placeholders) — the new anatomy has 11 value cards (4+3+4, two rows + SLA strip). No SystemHealthStrip placeholder either. Cosmetic; skeleton still communicates "loading".

### 4.3 Item 3 — Search scope

`live-ops-client.tsx` L576-589: `const q = search.trim().toLowerCase();` matches `m.name.toLowerCase().includes(q)` **or** `o.order_number.toLowerCase().includes(q)` (plus `customer_name` for order-level rows). Merchant name AND order number both covered. Placeholder: "Search merchants…". Static PASS; interaction not visually verifiable behind auth.

### 4.4 Item 4 — LIVE badge / sync stamp

L660-680: badge renders "Live" + `animate-ping` green dot when `live`; "Connecting" + gold when not. Sync stamp `· synced {formatAge(...)} ago` is wrapped in `{!live && (...)}` — **declutter §10.1 honored**: hidden while live. Static PASS.

### 4.5 Item 5 — Feed filters

`FEED_FILTERS` (L83-88): `All / New orders / Status changes / Cancellations`. Semantics at L640-646: all / `ev.isNew` / `!ev.isNew` / `ev.status === "cancelled"` — exact match to spec §6.3. Segmented control `role="group" aria-label="Filter live activity"`, buttons `min-h-10`, `aria-pressed`. **Filtering behavior itself requires a live feed → not visually verifiable behind auth.** Static PASS. Caveat: dedupe §10.3 replaces-by-orderId in the producer so "New orders" filter will show an order's *latest* state, not its first — matches spec intent.

### 4.6 Item 6 — Closed merchant cap

L852-866: `merchantBoard.closed.slice(0, 12).map(...)` + L861: `+{closed.length - 12} more closed or paused merchant(s) →` as `<Link href="/admin/merchants">` (pluralization handled). Static PASS. The "+N more active orders →" per-card overflow link uses `MAX_VISIBLE_ORDERS = 3` (L142, spec §6.2.1 — 6→3 confirmed) → `+N more active order(s)` links to `/admin/merchants/{id}`.

### 4.8 Item 8 — A11y

**Runtime (login page, machine-read focus sequence, `dom-evidence.json`)**: initial focus lands on Email (`autoFocus` on credentials-step email input — the second `autoFocus` is in the TOTP step only, different conditional block, NOT a duplicate-bug); Tab#1 → Password, Tab#2 → Continue, Tab#3 → TanStack devtools button, Tab#4 → BODY (page has hidden focusable — devtools trigger, dev-only). Focus indicator: inputs change `border-purple-400` on focus (`focus:outline-none focus:border-purple-400`).

**Static (drawer, `order-detail-drawer.tsx`)**: `role="dialog" aria-modal="true" aria-label={Order #N details}` (L191-192); Esc handler L141 with preventDefault; focus moves to close button on open, restores to trigger on close (L130-139); Tab focus-trap cycles panel focusables with shift+Tab (L145-171); scroll lock via `useScrollLock`; backdrop click closes; close button `aria-label="Close order details"`. `KpiDelta` has `aria-label="up/down N% vs last week"` + `title="vs last 7 days avg"` (spec §4.3 — screen readers never hear "▲"). KPI href cards are `<Link className="block">` wrapping the card (focusable). Interactive targets ≥40px: `h-10 w-10` expand/collapse/close buttons, `min-h-10` chips/Retry — conformant.

**Not visually verifiable behind auth**: tabbing through KPI links / drawer Esc on the real page.

### 4.9 Item 9 — Mobile

**Runtime (login page, 390×844)**: `scrollWidth=390`, `clientWidth=390`, **no horizontal overflow** (dom-evidence.json `mobile` block). Screenshot 05/06 390×844.

**Static (/admin page body)**: primary KPI `grid grid-cols-2 xl:grid-cols-4` → 2-col mobile ✓ ; secondary `grid grid-cols-2 md:grid-cols-3` → 2-col ✓; SLA `grid grid-cols-2 xl:grid-cols-4` → 2-col ✓; merchant board `grid-cols-1 xl:grid-cols-3` (board spans 2, feed 1 on xl, stacked on mobile) ✓; feed collapse button present in header row ✓; mobile bottom nav `md:hidden fixed bottom-0 left-0 right-0` (nav.tsx L141) ✓; page `pb-24` clearance for bottom nav ✓. Grid behavior itself not visually verifiable behind auth.

---

## 5. Resilience-path results (RPC failure — migrations 104/105 NOT applied)

This is the key scenario the task asked to verify. The RPCs (`ops_summary`/`ops_hourly`/`ops_order_detail`) **will error** at runtime until the deployment applies migrations 104/105. All fallbacks verified:

| Resilience feature | Implementation | Verdict |
|---|---|---|
| Zero-filled KPIs | `page.tsx`: `summaryTodayRes.error → console.error(...)`; all four RPC results fall back `?? EMPTY_SUMMARY` (0s) / `?? []` for hourly curves. `EMPTY_SUMMARY` mirrors 104's NULL-on-empty semantics (averages stay `null` → rendered "—", never 0) | **STATIC PASS** |
| SLA "—" values | `ops-sla-strip.tsx`: every null → `—` (`text-black-400`) + `no data` sub; Avg Prep Time hardcoded null with honest tooltip "no data — prep timestamps aren't tracked yet" (spec §4.5: never fake) | **STATIC PASS** |
| All-gray health "unavailable" | `ops-system-health.tsx`: state defaults `UNAVAILABLE` (all null) on mount; any fetch failure (`!res.ok`, throw, abort) → `UNAVAILABLE`; gray dot `bg-black-200` + `unavailable` `text-black-400` suffix per §4.2 table; native `title` "Payments: unavailable" etc.; next-peak `—` when no remaining hour. Note: strip self-fetches `/api/admin/system-health` — its failure mode is independent of the 104 RPCs | **STATIC PASS** |
| Drawer error + Retry | `order-detail-drawer.tsx`: fetch failure → `error=true` → "Couldn't load order details." + **Retry button** (re-invokes stored fetch closure, L73-75, L237); 404 → `detail=null` → all sections render "—"; loading → `DrawerSkeleton`; every nullable field (customer_name/phone/address/items/assignment/timeline) has a "—" branch | **STATIC PASS** |
| **⚠️ GMV Today value** | `live-ops-client.tsx`: `gmvTodayKobo={summaryToday.gmv_kobo}` → **₦0 under RPC failure** even when realtime snapshot has paid orders; spec §4.3 wanted `derived.gmvToday` (realtime). Delta badge hides correctly (baseline 0 → null) | **DEVIATION (Medium)** |

Expected runtime behavior once migrations land: RPCs return real values at these same call sites — no component rework needed.

---

## 6. Accessibility / interactive verification summary (what could NOT be done visually)

Could not render the authenticated page body, so visually unverified (each with a static PASS above):
- Actual accordion/expand behavior of Hourly Throughput + Live Feed collapse (chevron state machine is static-verified: `useState(false)` / `useState(true)` + `aria-expanded` + rotate-180).
- Drawer opening on order-row click and the live RPC error → Retry → "—" sections flow (fetch/state code static-verified; 401 behavior of the route runtime-verified).
- Search typing/filtering, feed segment clicks, LIVE↔Connecting transition, realtime timeline, merchant-card row clicks.
- Health strip's 60 s polling loop behavior on the real page.

**What remains for a manual check after migrations + a super_admin session exists**: full interactive pass of items 1–6, 8, 9 (page body), the 400 branches of item 7, and live reload of the realtime board.

---

## 7. Item 10 — Console error inventory

Source: `console-errors.json` (Playwright capture on every page visited: /admin → login wall, login page desktop + mobile, negative login, storefront) + dev-server log + type-check.

**Browser console (all pages combined)**:
| Type | Message | Frequency | Verdict |
|---|---|---|---|
| error | `Failed to load resource: 400` | 1 | **Expected** — deliberate negative-login POST → Supabase auth returns 400 "Invalid login credentials" (surfaced in UI, §1) |
| error | `Failed to load resource: 401` | 3 | **Expected** — our deliberate unauth API probes (order-detail ×2, system-health) |
| warning | `/logo.png` width/height modified without auto (`width:"auto"`/`height:"auto"` hint) | 2 | Real (Low) — login page logo. Pre-existing login page, not v2 scope |
| warning | `/logo.png` detected as LCP — add `priority` | 1 | Real (Low) — same |
| warning | storage URL image LCP priority hint (storefront visit) | 1 | Storefront, pre-existing |
| pageerror | none | 0 | ✅ |
| hydration warnings | **none** | 0 | ✅ |
| unhandled rejections | none | 0 | ✅ |
| aborted request | `GET /admin/login?_rsc=1y5uv net::ERR_ABORTED` | 1 | Expected — navigation race during redirect chain |

**Dev-server log**: `⛔ no app-level errors, no hydration warnings, no unhandled rejections.` Two non-fatal infra warnings: `webpack.cache.PackFileCacheStrategy … hasStartTime` (dev cache restore, ×2) and `util._extend` deprecation (`DEP0060`, node-level).

**Type-check**: `npx turbo run type-check --filter=@foodo/web` → **exit 0, 0 errors** (`tsc --noEmit`).

---

## 8. Issues found

1. **[Medium] GMV Today uses RPC fallback instead of realtime value** — `live-ops-client.tsx` L709 `gmvTodayKobo={summaryToday.gmv_kobo}` vs spec §4.3 `formatKobo(derived.gmvToday)`. Under migration-not-applied (today's reality), GMV card displays ₦0 even with paid orders in the realtime snapshot. Screenshot-proof requires auth (unverified visually); code evidence is unambiguous. Fix: pass `derived.gmvToday`.
2. **[Low] Loading skeleton out of sync with v2 anatomy** — `(protected)/loading.tsx` renders the old 8-card KPI strip; new anatomy is 11 cards (4+3+4) + health strip placeholder missing. Cosmetic.
3. **[Low] Login-page logo img warnings** (`width/height` + LCP priority) — pre-existing outside v2 scope, but it's the only wall in front of verification.
4. **[Info] 400 console noise on failed login** — expected behavior, but the app surfaces Supabase's 400 as a console error each failed attempt; UI copy is correct ("Invalid login credentials").
5. **[Info] Dev-only webpack cache warning** — `hasStartTime` TypeError on cache restore; dev-server only, restart noise.

---

## 9. Final summary

> Visual verification of the authenticated `/admin` page body was **NOT possible**: middleware + `requireAdmin()` demand a `super_admin` cookie session against the hosted Supabase project, and **no test credentials exist anywhere in the repo** (`admin@cybric.tech` is a Resend sending domain, not a login; seed SQL contains no `auth.users`). No credentials were fabricated, no repo code modified, no migrations applied. The login wall and all unauthenticated surfaces were runtime-verified with real HTTP + Playwright evidence; all page-body items were verified at code level (exact spec strings, wiring, state machines) and are marked **NOT VERIFIABLE VISUALLY** with reasons.

**HTTP statuses**: `/admin` → **307** → `/admin/login?redirect=%2Fadmin` → **200**. `/api/admin/order-detail` (no auth) → **401** `{"error":"Unauthorized"}` with and without `orderId`; 400 branches exist but are unreachable without a session (auth gates first) — static-verified, manual re-check needed. `/api/admin/system-health` (no auth) → 401.

**Resilience paths (RPC-error fallbacks — the feature under test)**: zero-filled KPIs ✅ (statics), "—" SLA values ✅ (statics, incl. permanently-"—" prep time), all-gray "unavailable" health dots ✅ (statics), drawer error + Retry + "—" sections ✅ (statics).

**Console inventory**: clean — no React errors, no hydration warnings, no unhandled rejections; 1×400 (negative-login probe, expected) + 3×401 (deliberate probes, expected) + 3 image warnings (pre-existing). Type-check exit 0.

**VERDICT summary**:
| Item | Verdict |
|---|---|
| 1 Composition | ⚠️ NOT VERIFIABLE VISUALLY (auth) — static PASS, 1 Medium deviation (GMV source) |
| 2 Skeleton | ⚠️ NOT VERIFIABLE VISUALLY — static PASS, 1 Low deviation |
| 3 Search | ⚠️ NOT VERIFIABLE VISUALLY — static PASS |
| 4 LIVE badge | ⚠️ NOT VERIFIABLE VISUALLY — static PASS |
| 5 Feed filters | ⚠️ NOT VERIFIABLE VISUALLY — static PASS |
| 6 Closed cap 12 | ⚠️ NOT VERIFIABLE VISUALLY — static PASS |
| 7 API 401/400 | ✅ PASS (401 runtime) / 400 static-only |
| 8 A11y | ✅ PARTIAL — drawer static PASS; login-wall focus runtime PASS; page-body keyboard unverified |
| 9 Mobile | ✅ PARTIAL — login wall no-overflow runtime PASS; page-body grids static PASS |
| 10 Console | ✅ PASS — clean |

**Needs manual check after migrations 104/105 applied + real super_admin session**: full interactive pass (drawer open→error→Retry, feed filter clicks, search typing, collapse toggles, LIVE↔Connecting, realtime board), API 400 branches, GMV Today value (expect the Medium issue to surface as ₦0-while-orders-exist), and skeleton capture timing.