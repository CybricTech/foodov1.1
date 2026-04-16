# Claude Code Task: Merchant Detail Page (Admin)

## Context

Multi-tenant restaurant SaaS (Kitchyn). Turborepo monorepo, Next.js 14 App Router +
Supabase + TypeScript + Tailwind. Admin panel lives at `/admin/(protected)/`.

**Existing relevant files:**
- `apps/web/app/admin/(protected)/analytics/page.tsx` — shows "Top Merchants by Revenue"
  list. Each merchant row is a plain `<div>`. We need to make each row clickable and
  link to the new merchant detail page.
- `apps/web/app/admin/(protected)/merchants/page.tsx` — merchants list page
- `apps/web/components/admin/merchants-client.tsx` — merchants list client component
- `apps/web/app/admin/(protected)/layout.tsx` — admin layout with nav

**Existing DB tables relevant to this feature:**
- `restaurants` — id, name, slug, city, is_active, created_at, latitude, longitude,
  whatsapp_number, notification_email, bank_account_name, bank_account_number,
  paystack_recipient_code, logistics_default
- `orders` — id, restaurant_id, order_number, status, fulfillment_type, customer_name,
  customer_phone, subtotal_kobo, delivery_fee_kobo, total_kobo, created_at,
  delivery_distance_km
- `order_items` — order_id, restaurant_id, item_name, quantity, line_total_kobo,
  selected_options
- `customers` — restaurant_id, phone, full_name, total_orders, total_spent_kobo,
  last_order_at, first_order_at
- `wallet_transactions` — restaurant_id, type, direction, amount_kobo, status,
  created_at
- `restaurant_wallets` — restaurant_id, pending_balance_kobo, available_balance_kobo,
  total_earned_kobo, total_withdrawn_kobo
- `settlements` — restaurant_id, amount_kobo, status, paid_at, created_at

**Existing patterns to follow:**
- Server components fetch data via `createServiceClient()` from `@/lib/supabase/server`
- `formatKobo` from `@foodo/utils` for currency display
- Tailwind classes use custom colors: `text-black-900`, `text-black-500`,
  `bg-purple-500`, `bg-viridian-500`, `border-black-200`, `rounded-2xl`
- `export const dynamic = "force-dynamic"` on all admin pages

---

## Task: Build Merchant Detail Page

### STEP 1 — Make analytics merchant rows clickable

File: `apps/web/app/admin/(protected)/analytics/page.tsx`

Find the merchant row `<div>` in the Top Merchants section:
```tsx
<div
  key={m.id}
  className="flex items-center gap-4 px-4 py-3 border-b..."
>
```

Wrap it in a Next.js `<Link>` pointing to `/admin/merchants/${m.id}`:
```tsx
<Link
  href={`/admin/merchants/${m.id}`}
  key={m.id}
  className="flex items-center gap-4 px-4 py-3 border-b border-black-200 
             last:border-0 hover:bg-purple-50 transition-colors cursor-pointer"
>
```

Import `Link` from `next/link`.

---

### STEP 2 — Create the merchant detail page

File: `apps/web/app/admin/(protected)/merchants/[id]/page.tsx`

This is a **server component** that fetches all merchant data in parallel and
renders the full detail view.

**Data to fetch (all in parallel via Promise.all):**

```typescript
const [
  restaurant,           // restaurant row
  wallet,               // restaurant_wallets row
  ordersThisMonth,      // orders created_at >= startOfMonth
  ordersLastMonth,      // orders created_at between startOfLastMonth and startOfMonth
  ordersAllTime,        // all orders count + sum
  topItems,             // top 5 menu items by order count
  customers,            // total unique customers + repeat rate
  recentOrders,         // last 50 orders for the table
  walletTransactions,   // last 20 wallet transactions
  recentSettlements,    // last 10 settlements
  platformRevenue,      // sum of service_charge + logistics_fee wallet_transactions
] = await Promise.all([...])
```

**Computed KPI values:**

```typescript
// Revenue
const gmvThisMonth = ordersThisMonth.reduce((s, o) => s + o.total_kobo, 0)
const gmvLastMonth = ordersLastMonth.reduce((s, o) => s + o.total_kobo, 0)
const gmvAllTime = ordersAllTime.reduce((s, o) => s + o.total_kobo, 0)
const gmvGrowth = gmvLastMonth > 0 
  ? ((gmvThisMonth - gmvLastMonth) / gmvLastMonth) * 100 
  : null

// Orders
const ordersThisMonthCount = ordersThisMonth.length
const ordersLastMonthCount = ordersLastMonth.length
const ordersAllTimeCount = ordersAllTime.length
const ordersGrowth = ordersLastMonthCount > 0
  ? ((ordersThisMonthCount - ordersLastMonthCount) / ordersLastMonthCount) * 100
  : null

// Average order value
const avgOrderValue = ordersAllTimeCount > 0 
  ? gmvAllTime / ordersAllTimeCount 
  : 0

// Repeat customer rate
const totalCustomers = customers.length
const repeatCustomers = customers.filter(c => c.total_orders > 1).length
const repeatRate = totalCustomers > 0 
  ? (repeatCustomers / totalCustomers) * 100 
  : 0

// Platform revenue from this merchant
const kitchynRevenue = walletTransactions
  .filter(t => t.type === 'service_charge' || t.type === 'logistics_fee')
  .reduce((s, t) => s + t.amount_kobo, 0)
```

---

### STEP 3 — Page layout and UI

The page should have the following sections in order:

**3a. Page header**
```
← Back to Analytics         [restaurant name]
                             Active · Lagos · Since [date]
```
Back link goes to `/admin/analytics`.
Show active/inactive badge. Show city and `created_at` formatted as "Since Jan 2025".

**3b. KPI Cards — 2 rows of 4**

Row 1 — Revenue & Orders:
1. **GMV This Month** — value + growth % vs last month (green if positive, red if negative)
2. **Total Orders This Month** — count + growth % vs last month
3. **Avg Order Value** — lifetime average
4. **Kitchyn Revenue** — platform earnings from this merchant (service charge + logistics)

Row 2 — Customer & Wallet:
5. **Total Customers** — unique customers lifetime
6. **Repeat Customer Rate** — % with more than 1 order
7. **Wallet Balance** — pending + available (two sub-values)
8. **Total Settled** — lifetime payouts to merchant

Each card: white background, `rounded-2xl`, `border border-black-200`, label in small
uppercase, value in bold large text, growth indicator where applicable.

**3c. Orders Table (client component)**

Create `apps/web/components/admin/merchant-orders-client.tsx` as a client component
that receives `initialOrders` and handles filtering client-side.

Columns:
| Order # | Date & Time | Customer | Items | Total | Status | Fulfillment | Distance |

- **Order #** — show order_number, truncated, monospace font
- **Date & Time** — formatted as "Apr 15, 2:30 PM"
- **Customer** — customer_name + customer_phone on second line
- **Items** — count of items (e.g. "3 items") with tooltip or expand
- **Total** — formatted in naira
- **Status** — colored badge:
  - confirmed: blue
  - preparing: yellow  
  - ready_for_pickup: orange
  - in_transit: purple
  - delivered: green
  - cancelled: red
- **Fulfillment** — "🏠 Pickup" or "🛵 Delivery"
- **Distance** — show delivery_distance_km if delivery, "—" if pickup

**Filters above the table:**
- Date range: Today / This Week / This Month / All Time (default: This Month)
- Status: All / Active / Completed / Cancelled
- Fulfillment: All / Delivery / Pickup

**Export CSV button** — exports filtered orders as CSV with all columns.

**3d. Wallet & Settlement section**

Two side-by-side panels:

Left — **Recent Wallet Transactions** (last 20):
Table: Date | Type | Description | Amount | Direction | Status
- Type badges: order_credit (green), service_charge (red), logistics_fee (red),
  settlement_debit (blue), manual_adjustment (grey)
- Direction: show ↑ credit in green, ↓ debit in red

Right — **Recent Settlements** (last 10):
Table: Date | Amount | Status | Transfer Ref | Paid At
- Status badges: pending (yellow), processing (blue), paid (green), failed (red)

**3e. Merchant Info panel**

A simple info card at the bottom showing:
- Restaurant slug
- WhatsApp number (if set) or "Not configured"
- Notification email (if set) or "Not configured"  
- Bank account (masked: show bank_account_name + last 4 digits of account number)
- Paystack recipient code (if set) or "Not configured"
- Logistics mode (platform_rider / own_rider / third_party)
- Location (lat/lng if set, or "Not configured" with yellow warning)

---

### STEP 4 — Add merchant detail link from merchants list

File: `apps/web/components/admin/merchants-client.tsx`

In the merchant list rows, add a clickable area or a "View Details" button that
links to `/admin/merchants/${r.id}`. Use a `<Link>` or router.push.

---

### STEP 5 — Add route to admin nav (optional)

The merchant detail page doesn't need a nav entry since it's accessed via the
analytics and merchants list pages. No nav changes needed.

---

## Implementation Order

1. Make analytics merchant rows clickable with Link to `/admin/merchants/[id]`
2. Create `apps/web/app/admin/(protected)/merchants/[id]/page.tsx` — server
   component with all data fetching and KPI computation
3. Create `apps/web/components/admin/merchant-orders-client.tsx` — client
   component with orders table + filters + CSV export
4. Add "View Details" link to merchants list client component
5. Push and deploy

---

## Key Rules

- Follow existing admin page patterns exactly — `force-dynamic`, `createServiceClient`,
  `formatKobo`, same Tailwind color tokens
- The page must handle the case where a merchant has no orders yet gracefully —
  show zero states, not errors
- All monetary values displayed using `formatKobo()` from `@foodo/utils`
- Dates formatted consistently — use `toLocaleDateString('en-NG')` or similar
- The orders table must be a separate client component to enable client-side filtering
  without a full page reload
- Growth indicators: show "—" if last month had 0 orders (can't compute % from 0)
- If restaurant not found (invalid ID), redirect to `/admin/merchants`
- Keep the page mobile-friendly — stack the KPI cards 2×4 on mobile, 4×2 on desktop
