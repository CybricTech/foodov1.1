# Live Operations v2 — UX Architecture & Component Contract

**Owner:** ArchitectUX (this document)
**Audience:** Frontend agents (live-ops refactor), data agent (ops RPCs / `ops-types.ts`), LuxuryDeveloper (polish)
**Status:** Ready for implementation — this is the contract. Deviations require an architecture review.
**Scope:** Admin "Live Operations" page upgrade only. `docs/live-ops-v2-ux.md` is the only file this spec touches.

---

## 1. Non-negotiable constraints (read these first)

1. **No new design tokens.** Only the existing Tailwind palette may be used: `black-50/100/200/400/500/900/950`, `purple-50/100/200/400/500/600/700/800/900`, `viridian-100/200/500`, `cinnabar-100/200/500`, `dixie-100/500`, `gold/50/100/600`, default palette (emerald/orange) where already used, `rounded-xl/2xl/full`, `shadow-card`, `animate-ping/pulse/fade-in/slide-up`. Do **not** use `viridian-600`, `dixie-400`, `dixie-600`, `cinnabar-600`, `black-300/600/700` — these appear in stale code but are **not defined tokens**; treat them as bugs.
2. **No new CSS, keyframes, or JS files outside the component list in §2.** All states reuse existing `animate-*` utilities.
3. **Every interactive target ≥ 40×40px** (`h-10 w-10` or `min-h-10`). 11px labels are permitted **only as static text**, never as buttons.
4. No new external dependencies. Recharts is already a dependency (used in finance-overview). No drawer/modal library — implement focus trap manually.
5. Realtime/channel logic, snapshot refetch, and the LIVE/CONNECTING badge semantics stay exactly as they are in `live-ops-client.tsx` — this wave only restructures rendering around them.
6. All copy strings are final as written in this doc.

---

## 2. Page anatomy (top → bottom)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (unchanged) — Live Operations + LIVE badge + subtitle  │
│        + [🔔 NewOrderNotifier] + [Search]                     │
├──────────────────────────────────────────────────────────────┤
│ SYSTEM HEALTH STRIP (NEW) — 3 dots + next peak, compact row   │
├──────────────────────────────────────────────────────────────┤
│ PRIMARY KPI ROW (4 cards) — Active Orders · Late Orders ·     │
│        Unconfirmed · GMV Today — each w/ KpiDelta badge       │
├──────────────────────────────────────────────────────────────┤
│ SECONDARY KPI ROW (3 compact cards) — Orders Today ·          │
│        Open Merchants · Delivered / Cancelled                 │
│        + link chips: Riders Online → /admin/riders            │
│                    Settlements → /admin/settlements           │
├──────────────────────────────────────────────────────────────┤
│ SLA STRIP (4 compact cards, muted) — Avg Prep Time · Avg      │
│        Delivery Time · Avg Order Value · Cancellation Rate    │
├──────────────────────────────────────────────────────────────┤
│ HOURLY THROUGHPUT (collapsible, Recharts, collapsed default)  │
├──────────────────────────────────────────────────────────────┤
│ ORDER PIPELINE (unchanged)                                    │
├───────────────────────────────┬──────────────────────────────┤
│ MERCHANT BOARD (xl:col-span-2)│ LIVE FEED (sticky right rail) │
│  Open merchants (cards)       │  collapse + segmented filter  │
│  Closed list (cap 12)         │                              │
└───────────────────────────────┴──────────────────────────────┘
ORDER DETAIL DRAWER (fixed overlay, right slide-over)
```

Page wrapper keeps: `<div className="p-4 md:p-6 pb-24 space-y-6">` (§4.1).

### Component → file map (all under `apps/web/components/admin/ops/`)

| Component | File | Responsibility |
|---|---|---|
| `KpiDelta` | `ops/kpi-delta.tsx` | ▲/▼ pct badge vs last-week baseline (GMV only this wave) |
| `OpsKpiRow` | `ops/ops-kpi-row.tsx` | PRIMARY row: 4 KPI cards embedding `KpiDelta` |
| `OpsSecondaryRow` | `ops/ops-secondary-row.tsx` | SECONDARY row: 3 compact cards + 2 link chips |
| `OpsSlaStrip` | `ops/ops-sla-strip.tsx` | SLA strip: 4 compact muted metrics |
| `OpsHourlyChart` | `ops/ops-hourly-chart.tsx` | Collapsible Recharts ComposedChart |
| `LiveFeed` | `ops/ops-live-feed.tsx` | Feed: collapse toggle + segmented filter + dedupe |
| `NewOrderNotifier` | `ops/ops-notifier.tsx` | Bell opt-in, beep, browser Notification |
| `SystemHealthStrip` | `ops/ops-system-health.tsx` | Health dots + next expected peak |
| `OrderDetailDrawer` | `ops/order-detail-drawer.tsx` | Right slide-over; internal `DrawerSection`, `DrawerSkeleton`, `DrawerTimeline` |

`apps/web/components/admin/live-ops-client.tsx` is **refactored to compose** these, keeps: realtime channel, snapshot refetch, `derived` computation, pipeline chips, `MerchantCard`/`OrderRow` (with edits in §6), `Kpi` (edited for delta slot), header, search.

New page props enter via `apps/web/app/admin/(protected)/page.tsx` → `LiveOpsClient` (unchanged prop-drilling pattern). The type contract **already exists**: `apps/web/lib/admin/ops-types.ts` (`LiveOpsClientProps` + `OpsSummary` + `OpsHourlyRow` + `OpsOrderDetail`), backed by `supabase/migrations/104_ops_summary.sql` (`ops_summary`, `ops_hourly`, `ops_order_detail` RPCs). Frontend agents **import from `@/lib/admin/ops-types` — never redefine these shapes.** The four new props are **required, non-nullable** (the server page always supplies them; on RPC failure the page passes zeroed/default data per the data agent's contract). §3 documents the semantics that matter for UI rendering.

---

## 3. Data contract — `apps/web/lib/admin/ops-types.ts` (already landed, 104 migration)

Import from `@/lib/admin/ops-types`. **Field semantics that drive rendering (do not re-derive):**

```ts
import type {
  OpsSummary,
  OpsHourlyRow,
  OpsOrderDetail,
  LiveOpsClientProps,   // the four new props: summaryToday, summaryLastWeek, hourlyToday, hourlyYesterday
} from "@/lib/admin/ops-types";
```

- **`OpsSummary`** (one row from `ops_summary(p_from, p_to)`):
  - `orders_count` — all statuses incl. cancelled, `gmv_kobo` (paid only), `delivered_count`, `cancelled_count`.
  - `avg_prep_minutes` — **ALWAYS null** (schema has no `confirmed_at`/`ready_at`); the "Avg Prep Time" card therefore renders `—` permanently until a later migration adds prep timestamps. Do not compute a fake prep time client-side.
  - `avg_delivery_minutes` — total order-to-door mean (`delivered_at − created_at`) over delivered orders; null when none delivered.
  - `avg_order_value_kobo` — `gmv_kobo / orders_count`; null when `orders_count = 0`.
  - `cancellation_rate` — 0..1 (`cancelled / orders`); null when `orders_count = 0`.
  - **There is no active/late/unconfirmed count in the contract.** Consequences are pinned in §4.3 and §13.
- **`OpsHourlyRow`** — 24 rows per day (hour 0–23, Africa/Lagos): `hour`, `orders_count`, `gmv_kobo`, `delivered_count`.
- **`OpsOrderDetail`** (single object from `ops_order_detail(p_order_id)`) — **flat**, not nested:
  - Order fields: `id`, `order_number`, `status`, `payment_status`, `fulfillment_type`, `total_kobo`, `subtotal_kobo`, `delivery_fee_kobo`, `service_fee_kobo`, `vat_kobo`.
  - Customer: `customer_name`, `customer_phone`, `delivery_address`, `special_instructions` (all nullable).
  - `items: OpsOrderItemDetail[]` — `{ name, quantity, unit_price_kobo, total_kobo }` (line total is **`total_kobo`**, not `line_total_kobo`).
  - `assignment: OpsAssignmentDetail | null` — null for pickup/no assignment; fields `rider_name`, `rider_phone`, `assigned_at`, `picked_up_at`, `delivered_at`. **No `accepted_at` exists.**
  - `timeline: { label: string; at: string }[]` — **labels are pre-resolved server-side** (e.g. "Order placed", "Assigned to rider", "Picked up", "Delivered", "Cancelled"), ascending, nulls dropped. There is no per-step status key → dot coloring rule in §7.3.

### New `LiveOpsClient` props (required, non-nullable)

```ts
{
  summaryToday: OpsSummary;       // ops_summary for today (Africa/Lagos)
  summaryLastWeek: OpsSummary;    // ops_summary for the trailing 7 days — the ONLY
                                  // historical baseline the contract provides
  hourlyToday: OpsHourlyRow[];    // ops_hourly(today), 24 rows
  hourlyYesterday: OpsHourlyRow[];// ops_hourly(yesterday), 24 rows
}
```

### Delta rule (fixes the contract for `KpiDelta` inputs)

- Today value `t` comes from `summaryToday` (GMV only, see §4.3 — the other primary metrics have no RPC baseline and stay delta-less this wave, per §13).
- Baseline `b = summaryLastWeek.gmv_kobo / 7` (mean daily GMV of the trailing 7 days — the honest comparison the shipped data supports).
- `deltaPct = (b <= 0 || t == null) ? null : ((t - b) / b) * 100`. **`null`/non-finite ⇒ badge hidden** (covers zero baselines and blocked metrics).
- A same-day-last-week comparison (the product's original "vs same day last week" tooltip) **requires a data contract addition** (ops_summary columns for active/late/unconfirmed counts plus a same-day baseline call) — tracked in §13, out of scope for this wave.

---

## 4. Header, health strip, KPI rows, SLA

### 4.1 Header (unchanged, one addition)

Keep the existing header block exactly (`text-2xl font-extrabold text-black-900` h1, LIVE badge, subtitle). Changes:

- Subtitle sync stamp — **declare a declutter, see §10.1**: render `<span className="text-black-400"> · synced {formatAge(...)} ago</span>` **only when `!live`** (drop the current unconditional `mounted &&` render).
- Add `NewOrderNotifier` in the right-side controls, **before** the search input, wrapped with search in a `flex items-center gap-2`.

### 4.2 `SystemHealthStrip` — `ops/ops-system-health.tsx`

Placeholder row under the header, first element in the page stack.

**Props**

```ts
// ServiceStatus (without null) imported from "@/lib/admin/health-checks":
//   "healthy" | "degraded" | "down"
{
  paymentGateway: ServiceStatus | null; // ← /api/admin/system-health service key "paystack"
  supabase: ServiceStatus | null;       // ← service key "database"
  webhooks: ServiceStatus | null;       // ← service key "bolt" (Bolt ride-state webhook feed —
                                        //    the delivery signal feed that matters to live ops;
                                        //    remapping only via data agent)
  hourlyYesterday: OpsHourlyRow[];      // for "next expected peak"
}
```

The server page computes the three statuses from `runHealthChecks()` (`@/lib/admin/health-checks`) in its existing `Promise.all` and passes them. **If health data is absent (wave not merged, fetch failed), the page passes `null` for all three — the strip renders every item "unavailable".**

**Markup.** Container: `bg-white rounded-2xl border border-black-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5`.

Each item (dot + label) — label always `text-xs text-black-500`:

| State | Dot | State suffix |
|---|---|---|
| healthy | `h-1.5 w-1.5 rounded-full bg-viridian-500` | none |
| degraded | `h-1.5 w-1.5 rounded-full bg-dixie-500` | `text-dixie-500` "degraded" |
| down | `h-1.5 w-1.5 rounded-full bg-cinnabar-500` | `text-cinnabar-500` "down" |
| **unavailable (null)** | `h-1.5 w-1.5 rounded-full bg-black-200` | `text-black-400` "unavailable" |

Items: `Payments`, `Supabase`, `Webhooks`. Suffix word separated by a space: `<span className="text-xs">Payments</span> <span className="text-xs font-semibold text-black-400">unavailable</span>` (state colors as above, `font-semibold`). Include native `title` on each item: `{label}: {state}`.

**Next expected peak** (last item): `Clock` icon `h-3 w-3 text-black-400` + `text-xs text-black-500` "Next peak" + value `text-xs font-semibold text-black-900`. Computed inside the component: the hour bucket with the **highest `orders_count` among `hour > current Lagos hour`** in `hourlyYesterday`; format value as `19:00`. If no remaining hour or all buckets are 0/null → value is `—` in `text-black-400`.

### 4.3 PRIMARY KPI row — `OpsKpiRow` + `KpiDelta`

**Grid:** `grid grid-cols-2 xl:grid-cols-4 gap-3` (§9).

Card = the existing `Kpi` card shell, extended with an optional `delta` slot:

```ts
interface KpiDeltaProps {
  deltaPct: number | null;        // null → render nothing
  invert?: boolean;               // true: up = red (Late, Unconfirmed)
}
```

- Hidden entirely when `deltaPct == null`.
- Arrow: `▲` (up) / `▼` (down) — plain glyphs, no icon component.
- Label: `▲ 12%` — `Math.abs(deltaPct).toFixed(0)%`, no decimals.
- Classes: `text-[11px] font-semibold`; up + !invert → `text-emerald-700`; down + !invert → `text-cinnabar-500`; up + invert → `text-cinnabar-500`; down + invert → `text-emerald-700`.
- **A11y:** `aria-label` on the element, exactly `up 12% vs last week` / `down 12% vs last week` (screen readers never hear "▲").
- **Tooltip:** native `title="vs last 7 days avg"` (repo precedent: `ServiceDot` in `system-health-widget.tsx`). **Intentional deviation:** the original product copy "vs same day last week" is restored only when the data contract ships a same-day-last-week baseline (§13.10).
- Placement: rendered in the card's sub-line slot **before** any existing `sub` text: `<div className="mt-0.5 flex items-center gap-1.5">` containing `KpiDelta` (when non-null) and the existing `sub` `<p className="text-[11px] text-black-400 mt-0.5 truncate">` unchanged.

Card values keep existing sources & tones (realtime-derived, fresher than RPC):
- **Active Orders** — `derived.activeOrders.length`, `Zap`, no tone, sub none. **No delta this wave** (no historical baseline for an in-flight point-in-time count in the data contract).
- **Late Orders** — `derived.lateCount`, `AlertTriangle`, `text-cinnabar-500` when > 0, href `/admin/late-orders`, sub `past ETA — review` / `all on time`. **No delta this wave** (no `late_orders` column in `ops_summary`).
- **Unconfirmed** — `derived.staleCount`, `Clock`, gold when > 0, sub `pending > 10m` (this sub-label **is** the SLA — do not add another). **No delta this wave** (no `unconfirmed_orders` column in `ops_summary`).
- **GMV Today** — `formatKobo(derived.gmvToday)`, `Flame`, sub `paid orders`, **delta `gmv_kobo` vs `summaryLastWeek.gmv_kobo / 7` (not inverted: up = green)**.

The `KpiDelta` UI contract (§4.3, `invert` flag included) ships complete and ready — when a later migration adds `late_orders`/`unconfirmed_orders` and same-day-last-week baselines, the cards light up with zero component changes. **Do not** invent client-side baselines (last week's orders are not in the client snapshot — the snapshot query only returns today + in-flight).

### 4.4 SECONDARY KPI row — `OpsSecondaryRow`

**Grid:** `grid grid-cols-2 md:grid-cols-3 gap-3` (§9). Compact cards, muted (smaller value, `black-400` label):

```
<div className="bg-white rounded-2xl border border-black-200 px-3.5 py-3">
  <p className="text-[11px] text-black-400 font-medium truncate">{label}</p>
  <p className="text-lg font-extrabold text-black-900 mt-1">{value}</p>
  {sub && <p className="text-[11px] text-black-400 mt-0.5 truncate">{sub}</p>}
</div>
```

| Card | Value | Sub |
|---|---|---|
| Orders Today | `derived.ordersToday.toLocaleString()` | `today` |
| Open Merchants | `${openCount}/${totalActiveMerchants}` | `accepting new orders` |
| Delivered / Cancelled | `${derived.deliveredToday} · ${derived.cancelledToday}` | `delivered · cancelled today` |

**Link chips** (below the cards, wraps): `mt-2 flex flex-wrap items-center gap-2` (mobile) — same markup on all breakpoints; at `md:` the 3 cards occupy the row and the chips sit under the third card area.

Chip markup (interactive ⇒ ≥40px via `min-h-10`):

```tsx
<Link href="/admin/riders" className="inline-flex items-center gap-1.5 rounded-full
  border border-black-200 bg-white min-h-10 px-3 text-[11px] font-semibold text-black-500
  hover:bg-black-50 hover:text-purple-600 transition-colors">
  <Bike className="h-3.5 w-3.5" /> Riders Online · {ridersOnline}
</Link>
```

(Identical for `Settlements` with `Wallet` icon, `pendingSettlements`, href `/admin/settlements`. Drop the old `Kpi`-card links for these two metrics entirely — they move to chips; they must not appear twice.)

### 4.5 SLA strip — `OpsSlaStrip`

**Grid:** `grid grid-cols-2 xl:grid-cols-4 gap-3` (§9). Same compact muted card as §4.4 (label `text-[11px] text-black-500 font-medium` — slightly stronger than secondary, still "muted" vs primary).

Values from `summaryToday`; **`null` ⇒ value renders `—`** in `text-black-400` and sub renders `no data` (`text-[11px] text-black-400`). The "—" is a deliberate no-data signal (not "0").

| Card | Value format | Sub | Null condition |
|---|---|---|---|
| Avg Prep Time | `{n} min` | `prep → ready` | **Always `—`** — no `confirmed_at`/`ready_at` in schema (104); renders `—` + `no data` permanently until a later migration adds prep timestamps. Never fake it from other columns. |
| Avg Delivery Time | `{n} min` | `order → door` | no delivered orders (this is total fulfillment time: `delivered_at − created_at`) |
| Avg Order Value | `formatKobo(n)` | `per paid order` | `orders_count = 0` |
| Cancellation Rate | `(n * 100).toFixed(1)%` | `of orders today` | `orders_count = 0` |

---

## 5. Hourly throughput — `OpsHourlyChart`

Card: `bg-white rounded-2xl border border-black-200 p-4`. Full-width block (§9).

**Header row** (always visible):
- Title: `text-xs font-semibold text-black-500 uppercase tracking-widest` — "Hourly Throughput".
- Right side: `flex items-center gap-2` → caption `text-[11px] text-black-400` "today vs yesterday" + expand button.

**Expand button** (≥40px): `h-10 w-10 rounded-full flex items-center justify-center text-black-500 hover:bg-black-50 transition-colors` containing `<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />`; `aria-expanded={open}`; `aria-label={open ? "Collapse hourly throughput chart" : "Expand hourly throughput chart"}`. **Default `useState(false)` — collapsed by default.** When collapsed, no chart body renders.

**Chart body** when expanded — Recharts `ComposedChart` exactly per the finance-overview precedent (raw hex literals are the existing chart language, see `finance-overview-client.tsx`):

- Wrapper: `<div className="h-72">` + `<ResponsiveContainer width="100%" height="100%">`.
- Data shape (component-internal reshape of the two `OpsHourlyRow[]` props): `{ hour: string, ordersToday: n, ordersYesterday: n, gmvToday: n, gmvYesterday: n }` — `hour` label `${String(h).padStart(2, "0")}:00`; `ordersToday/ordersYesterday ← orders_count`, `gmvToday/gmvYesterday ← gmv_kobo`.
- `<CartesianGrid strokeDasharray="3 3" stroke="#F2F2F2" />`.
- XAxis: `dataKey="hour"`, `tick={{ fontSize: 11, fill: "#9E9E9E" }}`, `axisLine={{ stroke: "#E0E0E0" }}`, `tickLine={false}`.
- Left YAxis (orders): `yAxisId="orders"`, integer only (`allowDecimals={false}`), `width={36}`, `tick={{ fontSize: 11, fill: "#9E9E9E" }}`, `axisLine={false}`, `tickLine={false}`.
- Right YAxis (GMV, kobo): `yAxisId="gmv"`, `orientation="right"`, `width={52}`, same tick styling, `tickFormatter` = the compact-kobo formatter copied verbatim from `formatChartKobo` in `finance-overview-client.tsx` (≤ 8 lines; copy, do not import).
- `<Bar dataKey="ordersToday" name="Orders today" fill="#7B2CBF" radius={[4, 4, 0, 0]} maxBarSize={14} />` — **bars today = brand purple (#7B2CBF = purple-500)**.
- `<Bar dataKey="ordersYesterday" name="Orders yesterday" fill="#E0AAFF" radius={[4, 4, 0, 0]} maxBarSize={14} />` — yesterday = light purple (#E0AAFF = purple-100). Yesterday's series always sits behind today's.
- `<Line type="monotone" dataKey="gmvToday" name="GMV today" stroke="#0E9F6E" strokeWidth={2} dot={false} yAxisId="gmv" />` — GMV = viridian-ish green (#0E9F6E, existing chart green).
- `<Line type="monotone" dataKey="gmvYesterday" name="GMV yesterday" stroke="#9E9E9E" strokeWidth={2} strokeDasharray="4 4" dot={false} yAxisId="gmv" />` — yesterday's line **dashed gray** (#9E9E9E = black-400) so it never competes with today's solid green.
- `<Tooltip formatter>`: orders → `[String(value), name]`; gmv → `[formatKobo(Number(value)), name]`.
- Legend (below chart, finance pattern): `<div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-black-400">` with swatches `w-3 h-0.5` / `w-3 h-3 rounded-sm`:
  - `<span className="w-3 h-3 rounded-sm bg-[#7B2CBF]" /> Orders today`
  - `<span className="w-3 h-3 rounded-sm bg-[#E0AAFF]" /> Orders yesterday`
  - `<span className="w-3 h-0.5 bg-[#0E9F6E]" /> GMV today`
  - `<span className="w-3 h-0.5 bg-[#9E9E9E]" /> GMV yesterday`

**Empty day (all-zero series):** if `hourlyToday` and `hourlyYesterday` are both empty or every point has `orders_count === 0 && gmv_kobo === 0`, the expanded body renders `<p className="text-black-400 text-sm py-10 text-center">No orders yet today</p>` — no chart, no legend.

---

## 6. Order pipeline + merchant board edits

### 6.1 Order pipeline — unchanged
Copy-for-copy, classes-for-classes as today (chips, delivered/cancelled today pills, "Clear filter ×"). No delta work.

### 6.2 `MerchantCard` edits

1. **`MAX_VISIBLE_ORDERS` 6 → 3.** `const MAX_VISIBLE_ORDERS = 3;` (module constant in `live-ops-client.tsx`). The "+N more active orders →" link (`block px-4 py-2.5 text-xs font-semibold text-purple-600 hover:bg-purple-50`) already handles the overflow → unchanged markup, now with N = `visible.length - 3`.
2. **Closed list cap 12.** In `LiveOpsClient`, render `merchantBoard.closed.slice(0, 12)`; when `merchantBoard.closed.length > 12`, render after the grid:
   ```tsx
   <Link href="/admin/merchants" className="block px-4 py-2.5 text-xs font-semibold
     text-purple-600 hover:bg-purple-50">
     +{closed.length - 12} more closed or paused merchant{s} →
   </Link>
   ```
3. **Order rows become the drawer trigger.** `OrderRow` gains `onClick: () => void` and renders as `<button type="button" className={cn(existing row classes, "w-full text-left cursor-pointer hover:bg-black-50 transition-colors")}>` — `w-full` inside the card's divide-y list, no padding change. `MerchantCard` gains `onOpenOrder: (order: LiveOrderRow) => void` and threads it through.
4. Every other `MerchantCard` detail (header, logo, badges, `today · formatKobo(gmvKobo)`, active count, paused/closed states, quiet empty text) is unchanged.

### 6.3 Live feed — `LiveFeed` (`ops/ops-live-feed.tsx`)

**Props:** `{ feed: FeedEvent[]; now: number; mounted: boolean; onOpenOrder: (order: { id: string; order_number: string; status: string }) => void }`.
`FeedEvent` type moves to this file (exported) or stays in `live-ops-client.tsx` and is imported — **one definition only**, `live-ops-client.tsx` remains the owner of the type and pushes events (§10.3 dedupe applies in the producer).

**Markup:**
- Container: `space-y-3 xl:sticky xl:top-4` (unchanged sticky rail).
- Header row: `flex flex-wrap items-center justify-between gap-2` containing:
  - Title `text-xs font-semibold text-black-500 uppercase tracking-widest` "Live Activity"
  - Collapse button (≥40px): `h-10 w-10 rounded-full flex items-center justify-center text-black-500 hover:bg-black-50 transition-colors`, `ChevronDown` with `rotate-180` when open, `aria-expanded`, `aria-label="Collapse live activity"` / `"Expand live activity"`. **Default expanded.**
- Segmented filter (only rendered when feed is expanded): 
  ```tsx
  <div className="flex flex-wrap items-center gap-1 rounded-xl border border-black-200 bg-white p-1" role="group" aria-label="Filter live activity">
    <button className="rounded-lg min-h-10 px-3 text-xs font-semibold transition-colors {active ? 'bg-purple-50 text-purple-700' : 'text-black-500 hover:bg-black-50'}" aria-pressed={active}>All</button>
    ... New orders / Status changes / Cancellations
  </div>
  ```
  Filter semantics on `FeedEvent`: **All** → all; **New orders** → `ev.isNew`; **Status changes** → `!ev.isNew`; **Cancellations** → `ev.status === "cancelled"`.
- List: unchanged card shell `bg-white rounded-2xl border border-black-200 divide-y divide-black-100 max-h-[70vh] overflow-y-auto`. Empty state `p-6 text-center text-sm text-black-500` "Waiting for activity…" (unchanged — but see §10.3: an order whose event is filtered by dedupe still counts as activity; only a zero-length filtered list shows this).
- Feed items: existing visual (dot + `#orderNumber` + event text + merchant + age). Item wraps in a clickable row: `w-full text-left cursor-pointer hover:bg-black-50 transition-colors px-4 py-3` (≥40px row height from py) calling `onOpenOrder({ id: ev.orderId, order_number: ev.orderNumber, status: ev.status })`.

---

## 7. Order detail drawer — `OrderDetailDrawer` (`ops/order-detail-drawer.tsx`)

### 7.1 Trigger contract

`LiveOpsClient` state: `const [selected, setSelected] = useState<{ id: string; order_number: string; status: string } | null>(null)`. Board rows pass the full `LiveOrderRow` (extra fields ignored by the drawer); feed rows pass the minimal shape. Both call `setSelected`. Drawer mounts when `selected != null`.

### 7.2 Props

```ts
{
  order: { id: string; order_number: string; status: string } | null;
  onClose: () => void;
}
```

### 7.3 Anatomy

**Backdrop:** `<div className="fixed inset-0 bg-black-900/50 z-40 animate-fade-in" onClick={onClose} />` (repo pattern: cart-sheet).

**Panel** (right slide-over):
```
className="fixed right-0 top-0 z-50 h-full w-full max-w-md bg-white shadow-xl flex flex-col animate-fade-in"
role="dialog"
aria-modal="true"
aria-label={`Order ${order.order_number} details`}
```
`useScrollLock(order != null)` — existing hook, `@/lib/hooks/use-scroll-lock`.

**Header** (`flex items-center justify-between border-b border-black-100 px-5 py-4 shrink-0`):
- Left: `<p className="text-sm font-bold text-black-900">#{order_number}</p>` + status badge `<span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_BADGE[status])}>` (reuse the existing `STATUS_BADGE` map).
- Right: close button ≥40px — `h-10 w-10 rounded-full bg-black-100 text-black-500 hover:bg-black-200 flex items-center justify-center transition-colors`, `<X size={16} />`, `aria-label="Close order details"`.

**Body** (`flex-1 overflow-y-auto divide-y divide-black-100`): sections in order — Customer, Order items, Payment, Assignment, Timeline.

Each section uses `DrawerSection` (internal): `<section className="px-5 py-4">` with `<h3 className="text-[11px] font-semibold text-black-500 uppercase tracking-widest mb-2.5">`. Static 11px headings are allowed (§1.3).

**Per-section content & empty rules (empty = value renders `—` in `text-black-400`):**

1. **Customer** (`Customer`):
   - `customer_name`: `text-sm font-semibold text-black-900`.
   - `customer_phone`: `<a href={`tel:${customer_phone}`} className="text-sm text-purple-600 hover:text-purple-700 transition-colors">` (interactive ⇒ add `min-h-10 inline-flex items-center`).
   - `delivery_address`: `text-sm text-black-500` (multi-line allowed, no truncate).
   - `special_instructions` when present: `<p className="text-xs text-gold-600 italic mt-1.5">"{special_instructions}"</p>` (gold-italic pattern matches the paused-merchant closure message).
2. **Order items** (`Items`): rows `flex items-baseline justify-between gap-3 py-1.5`:
   - Left: `<p className="text-sm font-semibold text-black-900">Name × {qty}</p>` with `<p className="text-xs text-black-400">unit {formatKobo(unit_price_kobo)}</p>` under it.
   - Right: `<p className="text-sm font-semibold text-black-900 tabular-nums">{formatKobo(total_kobo)}</p>` — **field is `total_kobo`** (line total; see §3).
3. **Payment** (`Payment`): label/value rows `flex items-center justify-between py-1 text-sm` — label `text-black-500`, value `text-black-900 tabular-nums`. Rows: `subtotal_kobo` (Subtotal), `delivery_fee_kobo` (Delivery fee), `service_fee_kobo` (Service fee), `vat_kobo` (VAT — legitimately 0 for pickup, renders `—` when null). Separator + total: `border-t border-black-100 mt-2 pt-2` — label `Total` (font-semibold black-900), value `text-base font-extrabold text-purple-600 tabular-nums` from top-level `total_kobo`. If `payment_status !== "paid"`, append `<p className="text-xs font-semibold text-gold-600 mt-2">unpaid</p>` (matches OrderRow pattern).
4. **Assignment** (`Assignment`): driven by `assignment: OpsAssignmentDetail | null`. Null ⇒ single `—` (pickup / unassigned). Otherwise: `rider_name` `text-sm font-semibold text-black-900`; `rider_phone` as `tel:` link (same classes as customer phone); timestamp lines `text-xs text-black-400` — only when present: `Assigned {assigned_at}`, `Picked up {picked_up_at}`, `Delivered {delivered_at}` (each `toLocaleString("en-NG")`). **No `accepted_at` exists — do not render one.**
5. **Timeline** (`DrawerTimeline`): powered by `timeline: { label, at }[]` — **labels arrive pre-resolved from the RPC** (no status keys). Vertical list `space-y-2.5`; step row `flex items-start gap-3`:
   - Dot: `mt-1.5 h-2 w-2 rounded-full bg-purple-500`. **Terminal override:** if `order.status === "delivered"`, the last step's dot is `bg-viridian-500`; if `order.status === "cancelled"`, `bg-cinnabar-500`. (STATUS_DOT is keyed by status and cannot map these labels.)
   - Label: `text-sm text-black-900` (from `label`); time right-aligned `<span className="ml-auto text-xs text-black-400 tabular-nums">{at.toLocaleString("en-NG")}</span>`. The RPC drops nulls, so no `—` rows occur in the timeline itself.

### 7.4 Drawer states

- **Loading** (`DrawerSkeleton`, while RPC pending): `px-5 py-4 space-y-3 animate-pulse` with placeholder blocks `h-4 bg-black-100 rounded-lg` in widths `w-full` / `w-3/4` / `w-1/2` per section; header still shows `#order_number` + status badge from the trigger row immediately.
- **RPC error**: body center `px-5 py-10 text-center`:
  - `<p className="text-sm text-black-500 mb-3">Couldn't load order details.</p>`
  - Retry button ≥40px: `inline-flex items-center gap-1.5 rounded-xl border border-black-200 bg-white min-h-10 px-3 text-xs font-semibold text-purple-600 hover:bg-black-50 transition-colors` — "Retry" (re-fetches the RPC).
- **Empty result**: RPC returns null/empty ⇒ body renders normally, every section shows `—` (no dedicated error).
- **RPC call:** `supabase.rpc("ops_order_detail", { p_order_id: order.id })` via the existing `createBrowserClient()` instance passed in from `LiveOpsClient` (prop `supabase`); result parsed to `OpsOrderDetail` from `@/lib/admin/ops-types` (single object — the RPC returns one row; §3). Param name `p_order_id` and the returned shape are fixed by migration 104 / `ops-types.ts` — do not change either side here.

---

## 8. NewOrderNotifier — `ops/ops-notifier.tsx` (sounds & notifications)

### 8.1 Props & wiring

```ts
{
  newOrderSignal: LiveOrderRow | null;   // set by LiveOpsClient on each INSERT event
}
```

`LiveOpsClient` keeps `const [newOrderSignal, setNewOrderSignal] = useState<LiveOrderRow | null>(null)` and sets it in the existing INSERT handler (right after `pushFeed`). The notifier owns all persistence/permission/audio/notification logic.

### 8.2 Header control

- Placement: header right cluster, before search (§4.1).
- Button ≥40px: `relative h-10 w-10 rounded-full border border-black-200 bg-white flex items-center justify-center hover:bg-black-50 transition-colors`; icon `Bell` `h-4 w-4` — `text-black-500` off, `text-purple-600` on (`BellRing` icon when on).
- Active indicator: `<span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-purple-500 ring-2 ring-white" />` when on.
- `aria-pressed={alertsOn}`; `aria-label` = `title` = **"Alert me on new orders"** (exact copy) when off, `"New order alerts on"` when on.
- Below the bell, a visually hidden status region: `<span className="sr-only" role="status" aria-live="polite" />` — text updated to **"New order alerts enabled"** / **"New order alerts disabled"**.

### 8.3 Behavior

- On mount: `alertsOn = localStorage.getItem("live-ops-alerts") === "on"` (guard `typeof window`). No permission request ever at mount/load.
- Click to toggle ON (only path that can request permission):
  1. If `typeof Notification !== "undefined"` and `Notification.permission === "default"` → `await Notification.requestPermission()` **at this click only**.
  2. Alerts enable regardless of the permission result (denied ⇒ sound-only mode; the beep still works — AudioContext starts from the user gesture of the click).
  3. `localStorage.setItem("live-ops-alerts", "on")`.
  - Toggle OFF: `localStorage.setItem("live-ops-alerts", "off")` — no other side effects.
- On `newOrderSignal` change (and only when `alertsOn`, with a `lastNotifiedIdRef` guard so the same order id never double-fires):
  1. **Beep** — synthesized, no asset file; copy the proven pattern from `apps/web/components/dashboard/order-queue-client.tsx` `playNewOrderSound()` (AudioContext oscillator 880 → 1100 → 880 Hz, 0.5s, gain 0.3, silent catch).
  2. **Browser Notification** (only if `Notification.permission === "granted"`): `new Notification("New order #" + order_number, { body: merchantName + " — " + formatKobo(total_kobo) })` — merchantName resolved from `merchantsRef` in the producer (pass the merchant name as a second prop-ready field on the signal object: `newOrderSignal: { order: LiveOrderRow; merchantName: string } | null` — the INSERT handler already has both).

---

## 9. Layout breakpoints

| Region | < md | ≥ md (768) | ≥ xl (1280) |
|---|---|---|---|
| Page wrapper | `p-4 pb-24 space-y-6` | `md:p-6` | same |
| Header controls | bell + search wrap | wrap | row |
| SystemHealthStrip | `flex flex-wrap` (wraps 2-up naturally) | same | same |
| Primary KPI | `grid-cols-2` (2-up) | `grid-cols-2` | `xl:grid-cols-4` |
| Secondary | `grid-cols-2` | `md:grid-cols-3` | same |
| SLA strip | `grid-cols-2` | `grid-cols-2` | `xl:grid-cols-4` |
| Hourly chart | full width | full width | full width (spans the whole content column; it sits above the board/feed grid, not inside it) |
| Board + feed | `grid-cols-1` stack | stack | `xl:grid-cols-3` — board `xl:col-span-2`, feed `xl:sticky xl:top-4` |

Existing breakpoint values only: sm=640, md=768, lg=1024, xl=1280 (Tailwind defaults). No new breakpoints.

---

## 10. Declutter rules (explicit)

1. **"synced Xs ago" only when stale.** The header subtitle renders `· synced {formatAge(...)} ago` **only when `live === false`** (drop the unconditional `mounted &&` render). When live, subtitle is exactly: `Every merchant and every order on Kitchyn, right now`. When connecting/disconnected, the LIVE badge shows `Connecting` (gold) and the sync stamp reappears — the stamp's only job is explaining staleness, so it must not display during a healthy stream.
2. **Unconfirmed KPI**: count stays `derived.staleCount`; its sub-label is the SLA — `pending > 10m` — no extra text, no second metric.
3. **No duplicate order per viewport.**
   - **Feed dedupe (producer-side, `live-ops-client.tsx`):** `pushFeed` changes from append to **replace-by-orderId + move-to-front**:
     ```ts
     setFeed((prev) => [{ ...ev, key: `${ev.orderId}-${Date.now()}` }, ...prev.filter(e => e.orderId !== ev.orderId)].slice(0, 40));
     ```
     An order appears **at most once** in the feed; a status transition replaces its entry in place with the new status text. Seed events keep `key: seed-${id}` (they're already unique per id).
   - **Board:** unchanged behavior already guarantees one row per order per merchant (single `byMerchant` map, no duplication).
   - Between board and feed, a row may appear in both (board = queue state, feed = event stream) — that is **not** a duplication violation; only within a single list is one order allowed once.

---

## 11. Accessibility checklist (must all land)

- [ ] Drawer: `Esc` closes; focus moves to the close button on open; focus returns to the trigger element on close (capture the trigger with a ref before `setSelected`).
- [ ] Drawer: manual focus trap — on `Tab` inside the panel, cycle among `button, a[href], [tabindex]:not([tabindex="-1"])` query results; no `inert`/library required.
- [ ] Drawer: `role="dialog"`, `aria-modal="true"`, `aria-label="Order #<num> details"` on the panel.
- [ ] `KpiDelta`: `aria-label` `up 12% vs last week` / `down 12% vs last week` + `title="vs last 7 days avg"` (glyph arrows are aria-hidden by default text content — the aria-label overrides).
- [ ] Notifier: `aria-pressed`, `aria-label` copy per §8.2, `role="status" aria-live="polite"` region announcing enable/disable.
- [ ] Expand/collapse toggles (hourly chart, feed): `aria-expanded` + descriptive `aria-label`.
- [ ] Segmented filter: `role="group"` + `role="button"`-less `aria-pressed` buttons.
- [ ] All interactive targets ≥ 40×40px: `h-10 w-10` icon buttons; `min-h-10` chips/segments/retry; `tel:` links `min-h-10 inline-flex items-center`.
- [ ] Static 11px labels permitted only as text; never wrapped in buttons.
- [ ] Focus-visible relies on the existing global `:focus-visible` outline (globals.css) — do not remove it.

---

## 12. States reference

| State | Where | Rendering |
|---|---|---|
| LIVE | header badge | existing green ping badge (unchanged) |
| CONNECTING | header badge + subtitle stamp | existing gold badge; `· synced X ago` visible (§10.1) |
| Drawer loading | drawer body | `DrawerSkeleton` (`animate-pulse bg-black-100` blocks) |
| Drawer RPC error | drawer body | `Couldn't load order details.` + Retry chip (§7.4) |
| Health unavailable | health strip | gray dot `bg-black-200` + `unavailable` `text-black-400` (§4.2) |
| Chart empty day | hourly body | `No orders yet today` `text-black-400 text-sm py-10 text-center` (§5) |
| SLA no data | SLA cards | `—` value + `no data` sub (§4.5) |
| KPI delta no baseline | KPI cards | badge hidden (§3) |
| Board empty | board | existing `bg-white rounded-2xl border border-black-200 p-8 text-center text-sm text-black-500` "No merchants are open right now." |
| Feed empty | feed | existing `p-6 text-center text-sm text-black-500` "Waiting for activity…" |

---

## 13. Design decisions frontend agents must NOT override

1. The exact class strings in this doc are the design language — no token substitutions, no new utility classes, no arbitrary hex outside the chart literals in §5.
2. No new CSS/keyframes/animations — reuse `animate-fade-in` (backdrop, drawer panel), `animate-pulse` (skeletons), `animate-ping` (LIVE badge only).
3. Primary KPI values stay **realtime-derived** (client `derived` state); RPC summaries feed **only** deltas. Never confuse the two sources.
4. Chart colors are fixed: today purple `#7B2CBF` bars + green `#0E9F6E` line, yesterday light purple `#E0AAFF` bars + dashed gray `#9E9E9E` line. Swap and the "today vs yesterday" grammar breaks.
5. Drawer opens from **both** board rows and feed items via the same `selected` state; the drawer fetches its own detail via the RPC — never pass the full `LiveOrderRow` as the source of truth for items/payment/assignment.
6. `MAX_VISIBLE_ORDERS = 3`, closed cap 12, feed cap 40 with replace-by-orderId dedupe — these numbers are product requirements, not style choices.
7. Notification permission is requested **only** on the user's explicit toggle-on click. No auto-request, no service worker, no audio asset.
8. 11px labels may be text only. Any button that looks like it could carry an 11px label must instead be ≥40px (e.g. segmented filters use `min-h-10` with `text-xs`).
9. "—" is the no-data glyph everywhere (SLA, drawer sections, timeline, next peak). It is never "0" or "N/A".
10. **Delta discipline (data contract reality):** only GMV Today carries a delta this wave, computed against `summaryLastWeek.gmv_kobo / 7` (trailing-7-day daily mean). Active Orders / Late Orders / Unconfirmed deltas **render hidden** until `ops_summary` gains `late_orders`/`unconfirmed_orders` columns and the page supplies a same-day-last-week baseline — no client-side baseline invention, no fake prep-time ("Avg Prep Time" stays `—`; the schema has no `confirmed_at`/`ready_at`). The GMV badge tooltip reads "vs last 7 days avg" — the product copy "vs same day last week" is on hold until that same-day baseline exists (do not ship a tooltip that misdescribes the metric).
11. `/api/admin/system-health` service keys are fixed: "paystack" → Payments, "database" → Supabase, "bolt" → Webhooks. Remapping requires a data-agent change plus this doc's approval.