# Implementation Plan — Returning Customer Banner, Order ETA, Late Orders

Scope confirmed with user 2026-04-28:
- 2-week merchant session: **DONE** via `supabase/config.toml` `[auth.sessions] inactivity_timeout = "336h"` (production must mirror via Supabase dashboard).
- This plan covers the remaining four pieces.

---

## Feature 1 — Returning customer banner on storefront

**Goal.** When a customer who placed an order on this device revisits the same restaurant's storefront (`/<slug>`), show a sticky banner: "Your order is cooking" with a tap-to-track link.

**Data persistence (localStorage).**
Key: `kitchyn:lastOrder:<restaurant_slug>` → JSON `{ orderId, orderNumber, savedAt }`.
- Written at successful checkout (existing checkout success handler).
- Read on storefront mount.
- Cleared automatically when the order's status becomes `delivered`, `cancelled`, or when `savedAt` is older than 24h (defensive — server is source of truth).

**Component.**
New client component `apps/web/components/storefront/active-order-banner.tsx`:
1. Reads localStorage key on mount.
2. Fetches `orders.id, status, order_number, fulfillment_type, estimated_delivery_at` for that ID via the public RLS policy `orders_public_read_by_id`.
3. If status ∈ {pending, confirmed, preparing, ready_for_pickup, assigned_to_rider, in_transit} → render banner.
4. If status is terminal → clear localStorage and render nothing.
5. Subscribes to `postgres_changes` on `orders` so banner status flips live.

**Mount point.** `apps/web/app/[restaurant_slug]/page.tsx` (storefront landing) — top of page, above hero/menu. Sticky on scroll.

**Banner copy by status.**
- `pending` → "We've received your order"
- `confirmed` / `preparing` → "Your order is cooking — ETA Xm"
- `ready_for_pickup` → "Ready for pickup"
- `assigned_to_rider` / `in_transit` → "Out for delivery — ETA Xm"

Tapping the banner routes to `/{slug}/orders/{orderId}`.

**Files.**
- NEW `apps/web/components/storefront/active-order-banner.tsx`
- EDIT `apps/web/app/[restaurant_slug]/page.tsx` (mount banner)
- EDIT checkout success path to write the localStorage key. Locate via grep for the redirect to `/orders/{id}` after successful Paystack payment confirmation. Most likely in `apps/web/components/storefront/checkout-*.tsx` or the payment callback route.

---

## Feature 2 — Per-order completion time + delivery ETA

**Inputs we already have.**
- `menu_items.prep_time_minutes` (nullable INTEGER) — set per item, populated via CSV upload and manual edit.
- `order_items.menu_item_id` — links back to menu item.
- `orders.estimated_delivery_at TIMESTAMPTZ` — column already exists, currently unused/unpopulated.
- `orders.created_at` — placed-at timestamp.
- `orders.fulfillment_type` — `delivery` | `pickup`.

**ETA formula.**
```
item_completion_minutes = MAX(prep_time_minutes) across this order's items
                          (default 20 if all items NULL)
delivery_buffer = 30 minutes if fulfillment_type = 'delivery' else 0
estimated_delivery_at = created_at + (item_completion_minutes + delivery_buffer) minutes
```

Use `MAX` (not `SUM`) because prep happens in parallel in a kitchen — the order is ready when the slowest item is done. This is industry-standard.

**Where ETA is computed.**
At order creation (server-side). The order placement endpoint inserts the row, then in the same transaction (or right after) computes max prep time from the items it just inserted and updates `estimated_delivery_at`. Locate the order-create handler — likely `apps/web/app/api/checkout/route.ts` or similar; will confirm during implementation.

**Schema migration.** None required — `estimated_delivery_at` already exists. We will, however, add an index for the late-orders cron query:
```sql
CREATE INDEX IF NOT EXISTS orders_estimated_delivery_open
  ON orders (estimated_delivery_at)
  WHERE status NOT IN ('delivered', 'cancelled');
```
This is a partial index — keeps it tiny since most orders are in terminal states.

**Backfill.** One-shot in the migration: for each non-terminal order with NULL `estimated_delivery_at`, compute and set it from existing `order_items` joined to `menu_items`. Terminal orders left NULL.

---

## Feature 3 — Richer tracking page with countdown

**Current state.** `apps/web/app/[restaurant_slug]/orders/[order_id]/page.tsx` shows status icon, order items, basic info. Live-updates via Supabase Realtime.

**Additions.**
1. **ETA card.** Displays `estimated_delivery_at` formatted ("12:45 PM, today") and a live countdown ("23m 14s remaining"). Countdown updates every 1s via `setInterval`. Once countdown hits 0, the card flips to red "Running late — your restaurant has been notified" copy. The card is hidden once `status = delivered`.
2. **Order details section.**
   - Customer name + phone (already collected, currently not shown).
   - Fulfillment type with appropriate icon + delivery address (if delivery).
   - Subtotal, delivery fee, VAT, service charge, total — separate lines.
   - Special instructions (if any).
   - Order number (already shown).
   - Placed at + estimated delivery at + delivered at (if delivered).
3. **Rider info** when `status` ∈ {assigned_to_rider, in_transit}: rider name + phone (link to call). Source: `orders.rider_id` → `user_profiles`.

**No schema changes.** All fields already exist on `orders` / `order_items`.

**Files.**
- EDIT `apps/web/app/[restaurant_slug]/orders/[order_id]/page.tsx` — add ETA card, expanded details, rider section. Keep existing realtime subscription (it already syncs status changes; ETA updates ride along).
- NEW `apps/web/components/storefront/order-eta-countdown.tsx` — extracted countdown component to keep the page file readable (it has interval logic that needs its own cleanup).

---

## Feature 4 — Late orders (server-side cron + admin view)

**Definition.** An order is "late" iff:
- `status NOT IN ('delivered', 'cancelled')`, AND
- `estimated_delivery_at < now()`.

This is a **derived view**, not a column we flip. No risk of stale flags, no race with status updates. The admin late-orders list is just `SELECT * FROM orders WHERE status NOT IN ('delivered','cancelled') AND estimated_delivery_at < now()`.

**Why we still need a cron.** The user asked for a server-side cron. Two legitimate jobs for it:
1. **Notify on first-late.** When an order crosses into late status, send an alert to the merchant (WhatsApp / email — both exist in this codebase). Without the cron we'd need polling on the client.
2. **Stamp `late_at` on first detection** so we have an audit trail of when each order went late, and to prevent duplicate notifications.

**Schema migration.**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS orders_late_open
  ON orders (late_at)
  WHERE late_at IS NOT NULL AND status NOT IN ('delivered','cancelled');
```

**Cron (pg_cron — already enabled in migration 033).**
New migration `035_late_orders_cron.sql`:

```sql
CREATE OR REPLACE FUNCTION mark_late_orders() RETURNS void AS $$
BEGIN
  UPDATE orders
     SET late_at = now(),
         updated_at = now()
   WHERE late_at IS NULL
     AND estimated_delivery_at IS NOT NULL
     AND estimated_delivery_at < now()
     AND status NOT IN ('delivered','cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT cron.schedule(
  'mark-late-orders',
  '* * * * *',                      -- every minute
  $cron$ SELECT mark_late_orders(); $cron$
);
```

Cron runs every minute. Pure SQL — no edge function call needed for the marking step. Notification dispatch hooks off the `late_at` change via a separate trigger or via the existing notification path (decide during implementation; likely a trigger that posts to the existing `dispatch-order` or a new `notify-late-order` edge function — but ONLY if cheap; otherwise defer notifications to a later iteration and just surface the list to admin).

**Admin view.**
- New route `apps/web/app/admin/(protected)/late-orders/page.tsx` — server component, lists all currently-late open orders with: restaurant name, order #, placed at, ETA, minutes overdue, customer name + phone, status. Each row links to the existing merchant detail or a per-order admin detail page.
- New nav entry in `apps/web/components/admin/nav.tsx` between "Disputes" and "SMS Logs": `{ href: "/admin/late-orders", label: "Late Orders", icon: AlertTriangle, exact: false }`.
- No new RLS — admin uses `createServiceClient`.

**Files.**
- NEW `supabase/migrations/035_late_orders_cron.sql` (column + index + function + cron + backfill mark)
- NEW `apps/web/app/admin/(protected)/late-orders/page.tsx`
- NEW `apps/web/components/admin/late-orders-client.tsx` (table with auto-refresh every 60s)
- EDIT `apps/web/components/admin/nav.tsx` (add nav item)

---

## Order of execution

1. **Migration 035** (schema + cron + backfill) — foundation, deploy first so `estimated_delivery_at` is populated and cron is running before any UI ships that depends on it.
2. **ETA computation in checkout** — start populating `estimated_delivery_at` for new orders.
3. **Tracking page enhancements** — surface ETA + countdown + richer details.
4. **Returning customer banner** — depends on tracking page existing, requires localStorage write at checkout success.
5. **Admin late-orders view** — read-only consumer of the data the cron is already producing.

Each step is independently shippable and reversible.

---

## Out of scope (explicitly)

- Customer notifications when their order is late (could be added later — for now they see countdown + "running late" copy on tracking page).
- Manual ETA override by merchant (could come from frontline UI later).
- Adjusting ETA mid-order based on kitchen progress (would need new merchant action; deferred).
- Late-order escalation rules (e.g. >30m late → page admin). Deferred until we see real frequency.

---

## Open questions for user before implementation

1. **Notifications when an order goes late** — do you want to notify the **merchant** the moment their order crosses ETA? (WhatsApp + email infra already exists.) If yes, this is one extra hop in migration 035; if no, the admin view alone covers it.
2. **Late-order persistence** — when a late order eventually gets delivered, do you want it to disappear from the admin Late Orders list, or keep showing with a "Delivered late" badge for the day? (Cheap either way; affects the SQL filter on the admin view.)
3. **Default prep time** — when items have NULL `prep_time_minutes`, plan defaults to 20m. OK or different number?
