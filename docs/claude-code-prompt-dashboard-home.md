# Claude Code Task: Merchant Dashboard Home Page

## Context

Multi-tenant restaurant SaaS (Kitchyn). Turborepo monorepo, Next.js 14 App Router +
Supabase + TypeScript + Tailwind. Merchant dashboard lives at `/dashboard/(protected)/`.

**Current state:**
- `apps/web/app/dashboard/(protected)/page.tsx` — currently renders `<OrderQueueClient>`
  directly. This needs to be replaced with a proper home page. The order queue moves
  to `/dashboard/orders` (a new route).
- `apps/web/components/dashboard/nav.tsx` — current nav has "Orders" linking to
  `/dashboard` (exact: true). This needs updating.
- Tailwind colors: `text-black-900`, `text-black-500`, `text-black-400`,
  `bg-purple-500`, `bg-purple-50`, `text-purple-600`, `border-black-100`,
  `rounded-2xl`, `bg-cinnabar-500` (red), `bg-viridian-500` (green)
- Currency: always use `formatKobo()` from `@foodo/utils`
- Server data: `createServiceClient()` from `@/lib/supabase/server`
- Auth: `getDashboardUser()` from `@/lib/supabase/cached-queries`

**Relevant DB columns on orders table:**
`id, order_number, status, payment_status, fulfillment_type, customer_name,
customer_phone, total_kobo, created_at, restaurant_id`

**Order statuses:** `pending`, `confirmed`, `preparing`, `ready_for_pickup`,
`assigned_to_rider`, `in_transit`, `delivered`, `cancelled`

**Active order statuses** (needs attention): `confirmed`, `preparing`, `ready_for_pickup`

---

## Task: Build the Merchant Dashboard Home Page

---

## STEP 1 — Move Order Queue to its own route

Create `apps/web/app/dashboard/(protected)/orders/page.tsx`:
- Copy the exact content of the current `page.tsx` (which renders `<OrderQueueClient>`)
- This becomes the dedicated orders page at `/dashboard/orders`

Update `apps/web/app/dashboard/(protected)/page.tsx`:
- Replace everything with the new home page (described in Step 2 below)

Update `apps/web/components/dashboard/nav.tsx`:
- Change the "Orders" nav item:
  ```typescript
  { href: "/dashboard/orders", label: "Orders", icon: ClipboardList, exact: false }
  ```
- Add a new "Home" nav item at the top:
  ```typescript
  { href: "/dashboard", label: "Home", icon: Home, exact: true }
  ```
  Import `Home` from `lucide-react`

---

## STEP 2 — Create the Home Page Server Component

File: `apps/web/app/dashboard/(protected)/page.tsx`

This is a **server component** that fetches data and passes it to a client component.

```typescript
export const dynamic = "force-dynamic";
```

**Data to fetch server-side:**

Fetch the restaurant record to get `accepts_orders` status:
```typescript
const { data: restaurant } = await supabase
  .from("restaurants")
  .select("id, name, accepts_orders")
  .eq("id", restaurantId)
  .single();
```

Fetch all orders for the selected time range. Since the time filter is client-side,
fetch the last 30 days of orders server-side (enough for all filter options):
```typescript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const { data: orders } = await supabase
  .from("orders")
  .select(
    "id, order_number, status, payment_status, fulfillment_type, customer_name, total_kobo, created_at"
  )
  .eq("restaurant_id", restaurantId)
  .neq("status", "cancelled")
  .eq("payment_status", "paid")
  .gte("created_at", thirtyDaysAgo)
  .order("created_at", { ascending: false });
```

Pass `restaurant` and `orders` to the client component:
```typescript
return (
  <DashboardHomeClient
    restaurant={restaurant}
    initialOrders={orders ?? []}
  />
);
```

---

## STEP 3 — Create the Home Page Client Component

File: `apps/web/components/dashboard/dashboard-home-client.tsx`

This is a `"use client"` component that handles:
- Time filter state
- KPI computation based on filtered orders
- Real-time subscription for new orders

### 3a. Time Filter Types

```typescript
type TimeFilter = 
  | "today"
  | "yesterday" 
  | "last_30min"
  | "last_12h"
  | "last_7days"
  | "last_30days"
  | "custom";
```

### 3b. Filter Logic

For each filter, compute the `fromDate` cutoff:
```typescript
function getFromDate(filter: TimeFilter, customFrom?: Date): Date {
  const now = new Date();
  switch (filter) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "yesterday": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 1);
      return d;
    }
    case "last_30min":
      return new Date(now.getTime() - 30 * 60 * 1000);
    case "last_12h":
      return new Date(now.getTime() - 12 * 60 * 60 * 1000);
    case "last_7days":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "last_30days":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "custom":
      return customFrom ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
```

For "yesterday" filter also compute a `toDate` (end of yesterday):
```typescript
function getToDate(filter: TimeFilter, customTo?: Date): Date | null {
  if (filter === "yesterday") {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()); // midnight = start of today
  }
  if (filter === "custom" && customTo) return customTo;
  return null; // null means "up to now"
}
```

Filter orders client-side:
```typescript
const filteredOrders = initialOrders.filter(order => {
  const createdAt = new Date(order.created_at);
  const from = getFromDate(activeFilter, customFrom);
  const to = getToDate(activeFilter, customTo);
  return createdAt >= from && (to === null || createdAt < to);
});
```

### 3c. KPI Computation

```typescript
const revenue = filteredOrders.reduce((sum, o) => sum + (o.total_kobo ?? 0), 0);
const orderCount = filteredOrders.length;
const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
```

### 3d. Active Orders

Active orders are NOT filtered by time — they are always the current live orders:
```typescript
// From initialOrders (all 30 days), active = confirmed/preparing/ready_for_pickup
// But we need ALL active orders, not just last 30 days
// Fetch these separately via real-time subscription
```

Use a Supabase real-time subscription to keep active orders live:
```typescript
const [activeOrders, setActiveOrders] = useState(
  initialOrders.filter(o => 
    ["confirmed", "preparing", "ready_for_pickup"].includes(o.status)
  )
);

// Subscribe to orders table for this restaurant
// On INSERT or UPDATE, refresh active orders
```

### 3e. Recent Orders

Last 5 orders from `filteredOrders` (already sorted descending by created_at):
```typescript
const recentOrders = filteredOrders.slice(0, 5);
```

---

## STEP 4 — UI Layout

### 4a. Top Tags Row

Two tags side by side, left-aligned:

**Tag 1 — Time Filter (clickable):**
A pill/chip that shows the current filter label. On click, opens a dropdown menu
with these options:
- Today ← default selected
- Yesterday
- Last 30 minutes
- Last 12 hours
- Last 7 days
- Last 30 days
- Date range... (opens two date inputs for custom from/to)

Style: `bg-purple-50 text-purple-600 font-semibold text-sm px-3 py-1.5 rounded-full`
with a small chevron-down icon on the right. When dropdown is open, use
`bg-purple-500 text-white`.

**Tag 2 — Store Status (display only, NOT clickable):**
Shows current `restaurant.accepts_orders` value:
- If true: green pill `bg-viridian-50 text-viridian-600` with a green dot → "Open"
- If false: red pill `bg-cinnabar-50 text-cinnabar-600` with a red dot → "Closed"

No click handler. Display only. To change status, merchant goes to Settings.

Layout:
```tsx
<div className="flex items-center gap-2 px-4 pt-4">
  <TimeFilterTag /> {/* clickable */}
  <StoreStatusTag /> {/* display only */}
</div>
```

### 4b. KPI Cards

Three cards in a row (3 columns on all screen sizes, stack to 1 column on very small):

```tsx
<div className="grid grid-cols-3 gap-3 px-4 mt-4">
  <KPICard label="Revenue" value={formatKobo(revenue)} />
  <KPICard label="Orders" value={orderCount.toString()} />
  <KPICard label="Avg Order" value={formatKobo(avgOrderValue)} />
</div>
```

Each card: `bg-white rounded-2xl border border-black-100 px-3 py-3`
Label: `text-xs text-black-400 font-medium`
Value: `text-lg font-extrabold text-black-900 mt-1`

Keep values compact — if revenue is large, abbreviate (e.g. ₦124K not ₦124,000.00).
Use this helper:
```typescript
function abbreviateKobo(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000) return `₦${(naira / 1_000).toFixed(1)}K`;
  return `₦${naira.toFixed(0)}`;
}
```

### 4c. Active Orders Section

Only show this section if `activeOrders.length > 0`.

```tsx
{activeOrders.length > 0 && (
  <div className="mx-4 mt-4 bg-dixie-50 border border-dixie-200 rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="w-2 h-2 rounded-full bg-dixie-500 animate-pulse" />
      <p className="text-sm font-bold text-dixie-700">
        {activeOrders.length} order{activeOrders.length > 1 ? "s" : ""} need attention
      </p>
    </div>
    {activeOrders.map(order => (
      <Link href={`/dashboard/orders`} key={order.id}>
        <div className="flex items-center justify-between py-2 border-b border-dixie-100 last:border-0">
          <div>
            <p className="text-sm font-semibold text-black-900">
              #{order.order_number}
            </p>
            <p className="text-xs text-black-400">{order.customer_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <span className="text-sm font-medium text-black-900">
              {formatKobo(order.total_kobo)}
            </span>
          </div>
        </div>
      </Link>
    ))}
  </div>
)}
```

If `activeOrders.length === 0`, show nothing (no empty state needed here).

### 4d. Recent Orders Section

Always show, even if empty.

```tsx
<div className="mx-4 mt-4 bg-white rounded-2xl border border-black-100 overflow-hidden">
  <div className="px-4 py-3 border-b border-black-100">
    <h2 className="text-sm font-bold text-black-900">Recent Orders</h2>
  </div>

  {recentOrders.length === 0 ? (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-black-400">No orders in this period</p>
    </div>
  ) : (
    recentOrders.map(order => (
      <Link
        key={order.id}
        href={`/${restaurantSlug}/orders/${order.id}`}
        className="flex items-center gap-3 px-4 py-3 border-b border-black-50 last:border-0 hover:bg-black-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-black-900">
              #{order.order_number}
            </p>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-xs text-black-400 mt-0.5 truncate">
            {order.customer_name}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-black-900">
            {formatKobo(order.total_kobo)}
          </p>
          <p className="text-xs text-black-400">
            {timeAgo(order.created_at)}
          </p>
        </div>
      </Link>
    ))
  )}
</div>
```

**timeAgo helper:**
```typescript
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
```

**StatusBadge component:**
```typescript
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending:          { label: "Pending",    className: "bg-black-100 text-black-500" },
    confirmed:        { label: "Confirmed",  className: "bg-blue-100 text-blue-600" },
    preparing:        { label: "Preparing",  className: "bg-dixie-100 text-dixie-600" },
    ready_for_pickup: { label: "Ready",      className: "bg-purple-100 text-purple-600" },
    in_transit:       { label: "In Transit", className: "bg-purple-100 text-purple-600" },
    delivered:        { label: "Delivered",  className: "bg-viridian-100 text-viridian-600" },
    cancelled:        { label: "Cancelled",  className: "bg-cinnabar-100 text-cinnabar-500" },
  };
  const { label, className } = config[status] ?? { label: status, className: "bg-black-100 text-black-500" };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}
```

---

## STEP 5 — Real-time Subscription

In `DashboardHomeClient`, subscribe to new and updated orders via Supabase Realtime.
When a new order comes in or an order status changes, update both `activeOrders` and
prepend to `initialOrders` state so recent orders list updates without a page refresh:

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`home-${restaurantId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "orders",
      filter: `restaurant_id=eq.${restaurantId}`,
    }, (payload) => {
      if (payload.eventType === "INSERT") {
        setOrders(prev => [payload.new as Order, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        setOrders(prev =>
          prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
        );
      }
    })
    .subscribe();

  return () => { channel.unsubscribe(); };
}, [restaurantId]);
```

Derive `activeOrders` and `recentOrders` from the `orders` state so they update
automatically when realtime events come in.

---

## STEP 6 — Restaurant slug for order links

The server component needs to fetch the restaurant slug so the client component
can build correct order detail links (`/[restaurant_slug]/orders/[order_id]`).

Add `slug` to the restaurant select:
```typescript
.select("id, name, slug, accepts_orders")
```

Pass `restaurant.slug` to `DashboardHomeClient` as a prop.

---

## Implementation Order

1. Create `apps/web/app/dashboard/(protected)/orders/page.tsx` — move order queue here
2. Update nav — add Home item, update Orders href to `/dashboard/orders`
3. Update `apps/web/app/dashboard/(protected)/page.tsx` — new server component
4. Create `apps/web/components/dashboard/dashboard-home-client.tsx` — full client component
5. Push and deploy

---

## Key Rules

- `export const dynamic = "force-dynamic"` on the server page
- Active orders section is NOT affected by the time filter — always shows current live orders
- Recent orders IS affected by the time filter
- The store status tag is display only — no click handler
- Time filter dropdown closes when user clicks outside (use a click-outside handler or
  blur event)
- For "custom" date range, show two date inputs (from and to) inline in the dropdown
- All monetary values use `abbreviateKobo()` for KPI cards, `formatKobo()` for order rows
- The page must work on mobile — all elements are full width friendly
- Do not remove or modify `OrderQueueClient` — it just moves to a new route
- The restaurant slug must be passed to the client component for order detail links
