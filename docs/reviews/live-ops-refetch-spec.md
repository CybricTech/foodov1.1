# Live Operations v2 — Refetch / Polling Strategy Spec

**Owner:** Performance Benchmarker
**Audience:** Senior Developer (implements in `live-ops-client.tsx`, next wave), Backend Architect (already in flight on `page.tsx`)
**Status:** Committed — one strategy, no options. Deviations require a performance review.
**Scope of implementation:** `apps/web/components/admin/live-ops-client.tsx` **only**.
**Do NOT touch:** `apps/web/app/admin/(protected)/page.tsx` (Backend Architect), `apps/web/components/shared/router-auto-refresh.tsx` (shared, layout-mounted), `apps/web/lib/admin/ops-types.ts`, `supabase/migrations/104_ops_summary.sql` (landed).

---

## 1. The problem

Every 120 seconds — and on every connection drop — `refetchSnapshot` (`live-ops-client.tsx` lines 246–286) pulls a **17-column × up-to-1000-row orders snapshot** plus the full active-merchant list over Supabase REST, then replaces client state. Two compounding defects:

1. **Payload**: a 1000-row snapshot is 350–800 KB per call (~570 KB typical), re-downloaded every 2 minutes for as long as the tab is open, even when nothing changed.
2. **The `.limit(1000)` ceiling bug**: today's KPIs (Orders Today, GMV Today, delivered/cancelled) are derived **client-side** from this capped array (`derived`, lines 385–464). On any day where `[orders created today] + [active orders of any age] > 1000`, the board rows **and the KPI sums** silently truncate. Counts that should be "1,247 orders today" render as the sum of the first 1000 matching rows.

Meanwhile a second, independent freshness mechanism already exists: `RouterAutoRefresh intervalMs={20_000}` mounted in `app/admin/(protected)/layout.tsx:41` re-runs the page's server components every 20 s, which re-fetches the page data server-side and streams a fresh RSC payload. As of today the client ignores most of it (see §4), but the mechanism is mandatory, layout-wide, and free of new code.

**Goal**: kill the periodic 20-column snapshot entirely; make KPI freshness come from one clear mechanism; keep realtime as the row-level source of truth for the board.

---

## 2. Payload math (before vs after)

### 2.1 Cost of one current snapshot (orders select, 17 columns)

| Component | Typical bytes |
|---|---|
| JSON key overhead per order row (17 keys + quotes/colons/commas) | ≈ 310 B |
| UUID pairs (`id`, `restaurant_id`) | 72 B |
| `order_number`, `status`, `payment_status`, `fulfillment_type`, `dispatch_type` | ≈ 50 B |
| `total_kobo`, `customer_name`, `customer_phone` | ≈ 36 B |
| `delivery_address`, `special_instructions` | ≈ 55 B (very variable, 10–140 B) |
| 4 timestamps (`created_at`, `updated_at`, `estimated_delivery_at`, `delivered_at`) | ≈ 70 B (ISO-8601 ×2–4, nulls shrink this) |
| `cancelled_reason` | ≈ 4–34 B (usually `null`) |
| **Per row total** | **≈ 350–550 B** |
| **1000-row orders payload** | **≈ 350–550 KB** (observed realistic range 200–800 KB) |
| Merchants (10 columns × 40–100 active) | ≈ 10–30 KB |
| **Per snapshot** | **≈ 360–580 KB typical, ≤ 830 KB worst** |

### 2.2 Cost of the replacement endpoints (RPCs from migration 104)

| Endpoint | Payload |
|---|---|
| `ops_summary(p_from, p_to)` — 1 row, 8 numeric/null columns | **≈ 200 B** (≈ 160 B keys + ≈ 40 B values) |
| `ops_hourly(p_day)` — 24 rows × 4 ints | ≈ 1.2 KB |
| `ops_order_detail(p_order_id)` — on-demand drill-down only | ≈ 1 KB + items; not part of any poll |
| Narrow reconnect fallback (orders today-only, `.limit(200)` + merchants) | ≈ 40–100 KB, **only when degraded** |

**Per-call reduction of the KPI source**: ≈ 570 KB → ≈ 0.2 KB ≈ **2,700×** (range 1,800–4,000×).

### 2.3 Steady-state traffic on the Live Ops page

| Stream | Frequency | Per call | Bytes/min |
|---|---|---|---|
| **BEFORE**: client snapshot (orders + merchants) | 1 / 120 s | ≈ 570 KB | ≈ 285 KB/min |
| **AFTER**: client snapshot | **deleted** | — | **0 KB/min** |
| BEFORE+AFTER (unchanged, layout-mandated): `router.refresh()` RSC payload (page.tsx fetches the same orders+merchants server-side) | 3 / min | ≈ 450–650 KB | ≈ 1.4–1.9 MB/min |
| AFTER (rejected — see §5): client `ops_summary` poll | 1 / 60 s | ≈ 200 B | ≈ 3.3 B/min |
| AFTER (degraded realtime only): narrow fallback | per reconnect | ≤ 100 KB | ≈ 0 normally |

**Impact of deleting the snapshot**: client-initiated POST-S-graph traffic on the page drops from ≈ 285 KB/min (≈ 17 MB/hour, ≈ **90–140 MB per 8 h ops shift**, ≈ 270–420 MB/day with the tab open) to **≈ 0 KB/min steady-state**, plus 2,000–4,000× lighter KPI refreshes and zero truncation. The `router.refresh()` RSC stream remains the dominant cost and is **out of scope for this wave** — flag for Backend Architect: page.tsx still selects up to 1000 rows per render at 3 renders/min (~4,320 renders/day); a future wave should bound that query (active statuses only + today window) since the board only ever renders `MAX_VISIBLE_ORDERS = 6` rows per merchant.

---

## 3. The committed strategy (one, not a menu)

> **KPI freshness**: the layout's 20 s `router.refresh()` is the **single** server-side KPI freshness mechanism. The v2 client consumes the `ops_summary` / `ops_hourly` / count props **directly from props** (never copied into state), so every 20 s server render pushes fresh numbers. **No client-side `ops_summary` poll is added.**
>
> **Board freshness**: realtime (orders INSERT/UPDATE + restaurants UPDATE) remains the row-level source of truth — unchanged.
>
> **The 2-minute 20-column snapshot is deleted outright.** On reconnect, a **narrow fallback** (orders today-only, `.limit(200)`, plus merchants) runs **only if** realtime was degraded — defined as `live !== "SUBSCRIBED"` for **> 60 s** — and **merges** into state by id (never replaces).
>
> **Backfill gap (new)**: a tiny props-sync upsert merges `initialOrders` / `initialMerchants` into state on every props change, so the 20 s `router.refresh()` repairs any rows/merchants missed while realtime was down and makes the stale "until the next snapshot refresh" comment (line ~298) obsolete.
>
> The 15 s age/lateness tick, the feed, the pipeline, and the realtime channel logic are **unchanged**. Rider count + settlements are count-only server-side props — unchanged.

### 3.1 What happens in each scenario

| Scenario | Mechanism that keeps the page correct |
|---|---|
| Steady state, realtime healthy | Realtime events drive board rows; 20 s `router.refresh()` drives KPI props (max staleness 20 s) |
| Realtime dead but network up (< 60 s) | Nothing needed — channel resubscribes, Supabase replays missed events on subscribe |
| Realtime dead or network down (> 60 s) | On reconnect: narrow fallback fires (today-only orders, `.limit(200)`) **and** `RouterAutoRefresh` fires its own throttled `router.refresh()` (5 s throttle) — both bounded, both idempotent, merged by id |
| New merchant created / order inserted during a gap | Props-sync upsert picks it up on the next `router.refresh()` (≤ 20 s) |
| Day rollover (WAT) | `ops_summary` runs on WAT boundaries server-side (migration 104 convention); the client never computes a day boundary — see §5 |

---

## 4. RouterAutoRefresh interaction (read before implementing)

`RouterAutoRefresh intervalMs={20_000}` is mounted in **`app/admin/(protected)/layout.tsx:41`** — it wraps every admin route and **cannot be opted out per page** without touching shared code (out of scope). It fires `router.refresh()` on: pathname change, tab visibility, reconnect (5 s throttle), and every 20 s.

**Critical behavior discovered in the current client**: `LiveOpsClient` seeds `orders` / `merchants` from `initialOrders` / `initialMerchants` in `useState` initializers and **never reconciles prop changes**. Today the 20 s refresh only visibly updates `ridersOnline` and `pendingSettlements` (read directly in JSX). For v2 this means:

- The new props (`summaryToday`, `summaryLastWeek`, `hourlyToday`, `hourlyYesterday` — `ops-types.ts` `LiveOpsClientProps`) **must be read directly in render** (like `ridersOnline` is today), so the 20 s server render updates them. Do **not** copy them into `useState`.
- Add the props-sync upsert (§3) so the 20 s refresh also repairs board state. Without the snapshot, this is the only periodic backfill for missed realtime events.

**Cost of the 20 s refresh (context, not this wave's problem)**: each `router.refresh()` re-runs page.tsx server-side and streams ≈ 450–650 KB of RSC payload (the 1000-row orders array serialized as client-component props) ≈ 1.4–1.9 MB/min. It is layout-mandated, so it costs the same whether or not the client polls — which is exactly why we do not stack a second mechanism on top of it.

---

## 5. Decision record — why NO client `ops_summary` poll (rejected)

The original brief floated a client-side `ops_summary` poll at 60 s (~200 B/call — trivially cheap in bytes). It is **rejected** after measuring against the mechanism that already exists:

| Criterion | 20 s `router.refresh()` (chosen) | 60 s client RPC poll (rejected) |
|---|---|---|
| Max KPI staleness | **20 s** | 60 s — 3× staler |
| Marginal cost | **Zero new code/cost** — already mounted on the layout; its RSC payload is paid regardless | Adds a second mechanism: +1 authenticated RPC/min + client state plumbing |
| Coverage | **All server props**: summary ×2, hourly ×2, riders, settlements, merchants — one mechanism | Only `ops_summary(today)` — riders/settlements/week-last still need the RSC path anyway |
| Day-boundary correctness | Server computes WAT `[midnight, next-day)` in SQL (migration 104) | Client must duplicate the WAT boundary — a correctness risk for zero benefit |
| Backfill of missed rows | Yes, via props-sync upsert | No |
| Failure mode | Needs network (same as the RPC poll) | Tie |

**Commitment: no `ops_summary` RPC is ever invoked from the browser for polling.** The only browser-initiated RPC is `ops_order_detail` on drawer open (per `docs/live-ops-v2-ux.md`) and the narrow REST fallback when degraded.

---

## 6. Realtime & degradation contract

- **Board truth stays realtime**: orders `INSERT` / `UPDATE`, restaurants `UPDATE` subscriptions — unchanged, including the test-merchant drop guard.
- **"Degraded" is defined** as `live !== "SUBSCRIBED"` **for more than 60 seconds** (tracked with a `lastSubscribedAtRef` updated in the existing `.subscribe((status) => …)` callback — this also gives the `lastSync` badge a truthful meaning: "realtime was healthy at X").
- **Reconnect handler becomes**: if degraded → run the narrow fallback; if not degraded → just update `lastSync` (the channel resubscription replays missed events; no REST needed).
- **Narrow fallback query** (replaces the snapshot in the reconnect path only):
  - Orders: same 17 columns, but **today-only** (`created_at >= local midnight`, no `.status.in(active)` branch) and **`.limit(200)`**.
  - Merchants: identical to today (`.eq("is_active", true)`), then the same `is_test` filter.
  - **Merge, never replace**: upsert fetched orders by id into existing state; keep existing rows outside the 200-row window. Replacing would drop valid older active rows that the window simply didn't include.
- **`.limit(1000)` → `.limit(200)` is safe for KPIs**: after this wave, KPI numbers come exclusively from server-side `ops_summary` (`COUNT(*)` over the full range — **no cap, no truncation**). The fallback's 200-row ceiling affects **board rows only**, and only during degraded realtime. The ceiling bug recorded in §1 is thereby fixed at the root: counts no longer truncate, ever.
- **15 s tick** (`setNow`, ages/lateness/open-hours): unchanged, keep the comment.
- **Order INSERT drop guard**: keep the merchant-existence check, but update the comment so it points at the 20 s props-sync upsert as the backfill, not "the next snapshot refresh".

---

## 7. Implementation checklist for Senior Developer

All edits in `apps/web/components/admin/live-ops-client.tsx`.

1. **Delete the 120 s snapshot interval** (the `useEffect` calling `setInterval(refetchSnapshot, 120_000)`).
2. **Repurpose `refetchSnapshot` → narrow fallback** for the reconnect path only:
   ```ts
   // Orders: today-only, small ceiling. Board repairs only — KPIs come from
   // server ops_summary props, never from this array.
   supabase.from("orders")
     .select("id, restaurant_id, order_number, status, …") // same 17 columns
     .gte("created_at", start.toISOString())
     .order("created_at", { ascending: false })
     .limit(200)
   ```
   Keep the merchants fetch identical. Keep the `is_test` filter. Change the final `setOrders(...)` to an **upsert-by-id merge** (preserve rows outside the window), and update the stale comment at line ~298 to reference the 20 s props-sync backfill.
3. **Add degradation tracking**:
   ```ts
   const lastSubscribedAtRef = useRef(0);
   // inside .subscribe((status) => { … }):
   if (status === "SUBSCRIBED") { lastSubscribedAtRef.current = Date.now(); setLastSync(Date.now()); }
   ```
4. **Replace the reconnect effect** (currently line ~371) with:
   ```ts
   useEffect(() => {
     if (!connection) return;
     return connection.onReconnect(() => {
       if (Date.now() - lastSubscribedAtRef.current > 60_000) refetchFallback();
       else setLastSync(Date.now());
     });
   }, [connection, refetchFallback]);
   ```
5. **Add the props-sync upsert** — this is what makes `router.refresh()` (20 s) the backfill:
   ```ts
   const firstRender = useRef(true);
   useEffect(() => {
     if (firstRender.current) { firstRender.current = false; return; }
     setMerchants(initialMerchants); // server truth; refreshed every 20 s
     setOrders((prev) => {
       const byId = new Map(prev.map((o) => [o.id, o]));
       for (const o of initialOrders) byId.set(o.id, o); // server wins; keep extras
       return [...byId.values()];
     });
   }, [initialOrders, initialMerchants]);
   ```
6. **KPI props are read directly in render** — `summaryToday`, `summaryLastWeek`, `hourlyToday`, `hourlyYesterday` (and today's `ridersOnline` / `pendingSettlements`): never copy into `useState`; they refresh on every 20 s server render. **Do not** add any `ops_summary` RPC call client-side (see §5).
7. **Leave unchanged**: realtime channel + subscription callbacks, 15 s tick, feed, pipeline, `MerchantCard` / `OrderRow`, LIVE badge (the badge's `live` state also drives `lastSubscribedAtRef`).
8. **Update the "synced … ago" badge semantics comment**: it now means "realtime last SUBSCRIBED at", not "last full snapshot at".

### Assumed page.tsx (Backend Architect, in flight — do not implement here)
Server page supplies `summaryToday`, `summaryLastWeek`, `hourlyToday`, `hourlyYesterday` as required non-null props (`LiveOpsClientProps` in `ops-types.ts`), sourced from `ops_summary` ×2 (today `[WAT midnight, next day)` + trailing 7 days) and `ops_hourly` ×2 (today + yesterday).

---

## 8. Verification checklist (definition of done for the Senior Developer wave)

- [ ] Network tab: during 10 min idle with realtime healthy, **zero** `POST /rest/v1/orders` requests from the browser (was: 5 snapshot calls ≈ 2.8 MB).
- [ ] RPC tab: zero `ops_summary` / `ops_hourly` invocations from the browser; `ops_order_detail` only on drawer open.
- [ ] Kill the websocket (devtools offline) for > 60 s, restore: one narrow fallback fires, board rows for the gap appear, no rows outside the window are dropped.
- [ ] Orders Today / GMV Today flip a value within ≤ 20 s of a DB-side update (single KPI mechanism, `router.refresh`).
- [ ] A > 1000-orders test day: KPIs show the true count (server-side `COUNT(*)`, no truncation) while the board renders ≤ 200 repair rows max during degradation.
- [ ] `lastSync` badge shows the last realtime-healthy time and stops claiming a "full sync".
- [ ] Type-check: `npx turbo run type-check --filter=@foodo/web` passes.

---

**Performance Benchmarker** · 2026-08-10
**Status**: strategy committed; snapshot elimination ≈ 285 KB/min → 0 KB/min client-initiated (≈ 90–140 MB per 8 h shift saved), KPI refresh payload reduced ≈ 2,700× per call, `.limit(1000)` KPI truncation eliminated.