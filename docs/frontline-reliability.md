# Frontline Reliability & Offline Capability

## Problem Statement

The frontline view ([apps/web/app/dashboard/frontline/orders](../apps/web/app/dashboard/frontline/orders)) is the primary operational tool for kitchen staff. It must continue to function — or at least fail clearly — when the network is unreliable. The kitchen environment has three failure modes that hurt operations:

1. **Device loses internet entirely** — Wi-Fi router drops, mobile data dies, captive portal expires. Staff continue tapping buttons but nothing reaches the server. Orders are silently lost. Staff don't know.
2. **Realtime channel drops while internet is fine** — the WebSocket to Supabase Realtime closes (idle timeout, server restart, transient network blip). New orders arrive in the database but never reach the screen. Staff appear to have no orders.
3. **Staff act on stale state** — staff member A marks an order "preparing" while offline; meanwhile staff member B already marked it "delivered" online. When A reconnects, replaying their local change would regress the order.

This document covers how each failure is handled, what's currently shipped, and the design for the remaining work.

---

## Architecture Overview

Three independent layers, each addressing a different failure mode:

| Layer | Detects | Status |
|---|---|---|
| **Connection state** | Device-level network + Supabase realtime channel health | ✅ Shipped |
| **Catch-up on reconnect** | Events missed while the realtime channel was down | ✅ Shipped |
| **Offline action queue** | User actions taken while offline; conflict resolution | ⏳ Designed, not shipped |

---

## Layer 1 — Connection State Detection (Shipped)

### How it works

A React context (`ConnectionProvider`) combines two signals:

- **`navigator.onLine`** + `online`/`offline` window events — tells us if the device has any network at all.
- **Supabase realtime channel state** — reported by whichever component owns an active channel (currently the orders client). Tells us whether we can actually reach Supabase.

The provider derives one of three statuses:

```
offline       → device has no network
reconnecting  → device is online but realtime channel is failing
online        → both healthy
```

### Files

- [apps/web/lib/connection-context.tsx](../apps/web/lib/connection-context.tsx) — provider, hook (`useConnection`)
- [apps/web/components/dashboard/connection-banner.tsx](../apps/web/components/dashboard/connection-banner.tsx) — Canva-style sticky banner
- [apps/web/components/dashboard/frontline-shell.tsx](../apps/web/components/dashboard/frontline-shell.tsx) — wraps frontline routes with `ConnectionProvider` and renders the banner
- [apps/web/components/dashboard/frontline-orders-client.tsx](../apps/web/components/dashboard/frontline-orders-client.tsx) — calls `reportRealtimeStatus(true|false)` from its channel subscribe callback

### Banner behavior

- **Offline** — red bar (`cinnabar-500`) with WiFi-off icon, "No internet connection · Trying to reconnect…"
- **Reconnecting** — amber bar (`dixie-500`) with spinner, "Reconnecting to server · Updates may be delayed"
- **Restored** — green bar (`viridian-500`) with WiFi icon, "Back online · All updates synced", auto-dismisses after 2.5s

The banner uses `sticky top-0` so it consumes layout space and pushes content down — staff can't miss it.

### Subscribe callback pattern

The orders client listens to channel state via the `subscribe()` callback:

```ts
.subscribe((channelStatus) => {
  if (intentional) return;            // don't report on intentional unsubscribe
  if (channelStatus === "SUBSCRIBED") {
    reportRealtimeStatus(true);
  } else if (
    channelStatus === "CHANNEL_ERROR" ||
    channelStatus === "TIMED_OUT"
  ) {
    reportRealtimeStatus(false);
  }
})
```

`CLOSED` is intentionally ignored because it fires both on real disconnects *and* when the component unmounts. The `intentional` flag prevents a stale "reconnecting" banner from appearing after navigating away.

---

## Layer 2 — Catch-up on Reconnect (Shipped)

### How it works

Supabase Realtime does **not** replay events that occurred while the WebSocket was down. So the moment a connection is restored, we need to re-sync state.

The provider exposes `onReconnect(callback)` — anyone can register a function to run when status transitions from `offline` or `reconnecting` back to `online`. The orders client registers a `runCatchup()` that simply re-fetches the most recent 200 orders and replaces local state.

```ts
const { onReconnect } = useConnection();
useEffect(() => onReconnect(runCatchup), [onReconnect, runCatchup]);
```

### Why a full refetch instead of a diff query

A diff query (`updated_at > lastSyncedAt`) is more efficient but requires:

- An `updated_at` column on `orders` with a trigger that maintains it on every update
- Careful handling of new orders (with `created_at`) vs status changes (with `updated_at`)

Refetching 200 orders is ~50–150KB and runs only on reconnect. Cheap, correct, no schema changes. We can switch to a diff query later if it shows up in profiling.

### What this guarantees

- New orders that arrived while offline appear immediately after reconnect.
- Status changes made by other staff/admins while offline appear immediately after reconnect.
- The user is never stuck on a stale view for longer than ~1 second after the WebSocket recovers.

### What this does NOT guarantee

- Actions taken locally while offline are not synced. They are simply lost (the API call fails). See Layer 3.

---

## Layer 3 — Offline Action Queue (Not Yet Shipped)

This is the hardest piece because of conflict resolution. The design below is the recommended path.

### The problem

When staff tap "Accept" or "Mark Ready" while offline:

- Today: the optimistic UI update applies, the `fetch()` call fails, the optimistic update is reverted, an error toast appears.
- Desired: the optimistic update applies, the action is queued locally, when the connection returns the queue drains against the API, conflicts are surfaced clearly.

### Storage

Use **IndexedDB** (via [`idb`](https://github.com/jakearchibald/idb), 1KB) over `localStorage` because:

- IndexedDB is async (won't block the main thread when the queue is large)
- Survives PWA standalone-mode tab closes
- Has structured storage (no JSON serialization dance)
- Larger quota (typically 50%+ of disk vs ~5MB for localStorage)

Schema:

```ts
type QueuedAction = {
  id: string;              // uuid, also used as idempotency key
  orderId: string;
  fromStatus: string;      // status when the user tapped
  toStatus: string;        // status they're requesting
  attemptedAt: number;     // timestamp
  attempts: number;        // retry counter
};
```

### Drain logic

On `onReconnect`:

1. Read all queued actions, sorted by `attemptedAt` ascending.
2. For each, POST to `/api/dashboard/orders/update-status` with the `id` as an `Idempotency-Key` header.
3. Server returns `200` (applied), `409` (conflict — current status is no longer `fromStatus`), or `5xx` (retry).
4. On `200` or `409`, remove from queue. On `5xx`, increment `attempts` and retry next reconnect; after N attempts, surface to the user as a permanent failure.

### Conflict resolution: server-side validation

The current `update-status` endpoint accepts any status transition. It needs to enforce the lifecycle:

```
pending → confirmed → preparing → ready_for_pickup → assigned_to_rider → in_transit → delivered
                                                                                     → cancelled (from any non-terminal state)
```

API change:

- Accept `expectedFromStatus` in the request body.
- If the row's current status doesn't match `expectedFromStatus`, return `409 Conflict` with the actual current status.
- If the requested transition is not in the allowed graph, return `400 Bad Request`.
- Add an `Idempotency-Key` header to dedupe accidental double-submits during drain.

### Conflict resolution: client UX

When a `409` comes back from a queued action, show a toast:

> Order #ABC-1234 was already marked **Ready** by another staff member. Your "Preparing" change was discarded.

The local state is then re-synced via the catchup query so the screen reflects truth.

### Pending-sync indicator

When the queue is non-empty, the connection banner switches to a fourth state:

```
syncing → "Syncing N pending update(s)…"
```

This makes the recovery visible and prevents staff from thinking the system is silently dropping work.

### Why this is hard

- **Lifecycle enforcement** requires every status-changing code path (admin overrides, dispatch automation, customer-side cancellation) to go through the validated transition logic — otherwise the staff queue can corrupt state.
- **Idempotency** requires the API to be safe to call twice with the same key, which means storing the key alongside the row or in a dedicated `applied_actions` table for the retention window.
- **Long offline windows** (hours) raise the conflict probability dramatically. We may want to refuse to apply queued actions that are older than N hours and require manual review.

### Estimated effort

~5–7 days of work end-to-end:

- Day 1: IndexedDB queue + `enqueue/drain` API
- Day 2: Wire into the orders client (replace direct `fetch` with `enqueue`)
- Day 3: API changes — `expectedFromStatus`, idempotency, transition validation
- Day 4: Conflict toast UX, syncing banner state
- Day 5: Integration testing under simulated network conditions (Chrome DevTools throttling + airplane mode)
- Day 6–7: Staff training, gradual rollout, monitoring

---

## Open Questions

1. **PWA service worker** — do we register one? If yes, the Background Sync API can drain the queue even when the tab is closed. If no, the user must reopen the app for sync to happen. Worth a separate decision.
2. **Polling fallback** — when the realtime channel is down for >30 seconds but `navigator.onLine` is true, should we switch to a 10-second poll loop as a safety net? Adds load but rules out a "channel works but events get lost" failure mode.
3. **Time skew** — `attemptedAt` is from the device clock. If the device clock is wrong, queue ordering breaks. Server-side `received_at` may be more reliable for ordering on the server side.
4. **Staff awareness** — should we add an explicit "you are offline, your last action will sync when you reconnect" tooltip on action buttons when offline? Or trust the banner alone?

---

## Testing

### Connection banner

- DevTools → Network tab → set throttling to "Offline". Banner should appear within ~1s.
- Set back to "Online". Banner should briefly turn green, then dismiss.
- Block the Supabase realtime endpoint specifically (e.g., via `chrome://net-internals` host blocking). Banner should show "Reconnecting" while internet remains up.

### Catch-up

- Open frontline view. Open a second tab and create an order via the storefront.
- Disconnect frontline tab (DevTools offline).
- Create another order from the second tab.
- Reconnect frontline tab. Both orders should appear; status of any modified orders should reflect current truth.

### Offline queue (when shipped)

- Disconnect, mark order "Preparing", reconnect — order should advance.
- Disconnect on device A, mark "Preparing"; meanwhile on device B (online) mark same order "Ready"; reconnect device A — toast about conflict, screen reflects "Ready".
