# Kitchyn Merchant Mobile App — Product Requirements Document (PRD)

**Status:** Draft v1
**Author:** Engineering
**Date:** 2026-06-08
**Owner:** Amir
**Platforms (phase 1):** Android (Google Play). iOS (App Store) is a fast-follow.

---

## 1. Summary

Kitchyn currently ships a responsive web platform with three surfaces: a public
storefront, a super-admin console, and a **merchant platform** (`/dashboard`).
This PRD covers a **native mobile app for the merchant platform only** — a
professional, store-grade Android app that gives restaurant owners and their
frontline (kitchen/counter) staff a first-class phone experience for running
their operation: receiving orders in real time, advancing them through the
kitchen, managing the menu, and (for owners) tracking money and growth.

The app is a **functional replica of the web merchant dashboard**, re-built with
native mobile patterns — not a webview wrapper. This distinction is central to
both Google Play approval and to the product feeling trustworthy to a merchant
who is running their business from it.

### Why native, why now
- **New orders are time-critical.** The single most valuable thing the app does
  is wake a phone with a **native push notification + persistent sound** the
  moment an order lands — even when the app is backgrounded or the screen is
  off. The web dashboard can only alert while a tab is open and foregrounded.
- **Frontline reality is mobile.** Kitchen and counter staff already run the
  frontline view on phones in noisy, low-connectivity environments. A native app
  with offline resilience and OS-level notifications fits that context far
  better than a browser tab.
- **Trust and retention.** An installed icon on the home screen, biometric
  login, and reliable alerts materially improve daily-active usage and reduce
  missed orders (our most damaging failure mode).

---

## 2. Goals & Non-Goals

### 2.1 Goals
1. Deliver a Play Store–approved, professional native Android app for the
   merchant platform covering **owner** and **frontline staff** roles.
2. Achieve **reliable real-time order intake** with native push notifications and
   audible/repeating alerts that survive backgrounding and screen-off.
3. Reach **functional parity** with the web dashboard for day-to-day operations
   (orders, menu, customers, marketing, analytics, wallet, settings).
4. **Reuse the existing backend** (Supabase + Next.js API routes) with zero or
   minimal server changes; share types and business logic with the web app.
5. Meet Google Play's quality, privacy, and data-safety requirements on first
   submission (see §10).

### 2.2 Non-Goals (phase 1)
- The **customer storefront** and **super-admin console** are out of scope. This
  app is merchant-facing only.
- The **rider app** is explicitly out of scope (it is currently inactive).
- No new business capabilities that don't exist on web. Parity first; mobile-only
  enhancements (e.g. richer push, biometric login) are the only additions.
- iOS ships as a fast-follow once the Android app is stable; the architecture is
  cross-platform from day one so iOS is incremental, not a rewrite.

---

## 3. Users & Roles

The merchant platform has two authenticated roles, both served by this app. The
backend already enforces them (`user_profiles.role`), and login routing today
sends each role to a different surface.

| Role | Web surface today | What they do | Mobile priority |
|---|---|---|---|
| **`merchant_owner`** | Full dashboard (`/dashboard/*`) | Runs the whole business: orders, menu, money, growth, settings, staff | P0 |
| **`merchant_staff`** (frontline) | Frontline view (`/dashboard/frontline/*`) | Kitchen/counter operations: accept & advance orders, toggle item availability | P0 |

**Key design principle:** role determines the app's home and navigation, exactly
as on web. An owner lands on the full experience (with a "Frontline mode" they
can enter for the simplified kitchen view); staff land directly in the
streamlined frontline experience and never see money/settings.

### Personas
- **The Owner ("Amaka").** Runs one restaurant, checks orders and revenue
  throughout the day from her phone, sets up promos, and watches payouts. Wants
  confidence that money is correct and nothing is being missed.
- **The Frontline Operator ("Tunde").** Works the kitchen/counter. Needs the
  loudest, simplest, most reliable order screen possible, works one-handed,
  often on weak Wi-Fi. Does not care about analytics or money.

---

## 4. Scope — Feature Inventory (derived from the web platform)

Each capability below maps to a real screen/component in `apps/web`. This is the
parity surface for phase 1. Priority: **P0** = launch-blocking, **P1** = launch
target, **P2** = fast-follow.

### 4.1 Authentication & Session (P0)
- Email + password login via Supabase Auth (`supabase.auth.signInWithPassword`).
- Persistent secure session (token storage in OS keychain/keystore).
- Role-based routing on launch (owner → dashboard, staff → frontline).
- Sign out.
- **Mobile additions:** biometric unlock (Face/fingerprint) on relaunch, "stay
  signed in," and a clear password-reset path.
- *Backend:* existing Supabase Auth. No change.

### 4.2 Orders — Frontline / Kitchen Queue (P0) — *the core of the app*
Mirrors `frontline-orders-client.tsx` and `order-queue-client.tsx`.
- Kanban of orders across columns: **New** (pending/confirmed) → **In Progress**
  (preparing) → **In Transit** (ready/assigned/in_transit) → **Completed**
  (delivered).
- Real-time arrival of new orders via Supabase Realtime (`postgres_changes` on
  `orders`), with **catch-up refetch on reconnect**.
- Per-order detail: items, quantities, selected options/modifiers, special
  instructions, customer name/phone, fulfillment type (delivery/pickup),
  address, price breakdown (subtotal, delivery fee, VAT, service fee, discount,
  total — all in kobo, formatted ₦).
- Advance order status (Accept, Mark Preparing, Mark Ready, etc.) via
  `POST /api/dashboard/orders/update-status`.
- **Dispatch a ready order**: choose platform rider or own rider via
  `POST /api/dashboard/orders/dispatch` (triggers Telegram rider alert
  server-side).
- One-tap call customer (native dialer); open address in maps.
- **New-order alerting (mobile-critical):**
  - Foreground: repeating in-app sound + visual highlight (parity with web's
    3-second repeat loop) with mute toggle.
  - Background / screen-off: **native push notification** (FCM) with sound,
    delivered even when the app is closed. This is the headline mobile feature
    and requires a small backend addition (see §7).

### 4.3 Orders — Owner View (P0)
Owners get the same queue plus the richer order-management affordances from the
web `order-queue-client` (e.g. broader filtering/history). Owners can switch
into Frontline mode for the simplified kitchen layout.

### 4.4 Menu Management (P0 core / P1 full)
Mirrors `menu-manager-client.tsx` (owner) and `frontline-menu-client.tsx` (staff).
- **Frontline (P0):** toggle item **availability / sold-out** quickly — the
  highest-frequency menu action during service.
- **Owner (P1):** full CRUD — categories, items, descriptions, prices,
  images, and option groups/choices with price modifiers. This is the largest
  surface on web (~1,900 LOC) and is staged after the order loop is solid.

### 4.5 Customers (P1)
Mirrors `customers-client.tsx`.
- Customer list with search, per-customer order history
  (`/api/dashboard/customers/[id]/orders`), and CSV export
  (`/api/merchant/customers/export`) shared via the native share sheet.

### 4.6 Marketing (P1)
Mirrors `marketing-client.tsx`.
- Create/manage **promo codes** (discount type/value).
- **SMS campaigns** to customer segments via
  `POST /api/dashboard/marketing/sms-campaign` (SendChamp under the hood).

### 4.7 Analytics (P1)
Mirrors `analytics-client.tsx`.
- Revenue trend, orders by day, orders by hour, new customers, key KPIs.
- Native-friendly charts; date-range selection. Read-only.

### 4.8 Wallet / Settlements (P1) — owner only
Mirrors `wallet-client.tsx`.
- Available balance, expected payout, pending, total withdrawn, average order
  net, payout history. Manual-settlement model (no in-app withdrawal trigger;
  matches web). Strictly **read-only** display of money — no new financial
  actions introduced on mobile.

### 4.9 Settings (P1) — owner only
Mirrors `settings-client.tsx`.
- Restaurant profile, bank account (payout destination), delivery pricing &
  location, notification email, password change, **staff management**
  (create/reset/deactivate the one frontline staff account via
  `/api/dashboard/staff/*`).

### 4.10 Connectivity & Reliability (P0, cross-cutting)
Mirrors the connection-state/catch-up system documented in
[frontline-reliability.md](frontline-reliability.md).
- Connection banner (offline / reconnecting / online) using native network state
  + Realtime channel health.
- Catch-up refetch on reconnect.
- **Offline action queue (P2):** the web doc's Layer 3 design (IndexedDB →
  native MMKV/SQLite queue with idempotency keys) is a natural mobile fast-follow
  and is more valuable on mobile than web. Deferred from launch.

### Out of scope for this app
Customer storefront, checkout, super-admin console, rider app, delivery tracking
pages.

---

## 5. Platform Map: Web Surface → Mobile Screen

| Web route / component | Mobile screen | Role | Phase |
|---|---|---|---|
| `/dashboard/login` | Login (+ biometric) | both | P0 |
| `/dashboard/frontline/orders` | Orders queue (kitchen) | staff + owner | P0 |
| `/dashboard/frontline/menu` | Availability toggles | staff + owner | P0 |
| `/dashboard` (home) | Owner home / overview | owner | P0 |
| `/dashboard/orders` | Owner orders | owner | P0 |
| `/dashboard/menu` | Menu manager (full CRUD) | owner | P1 |
| `/dashboard/customers` | Customers | owner | P1 |
| `/dashboard/marketing` | Marketing (promos, SMS) | owner | P1 |
| `/dashboard/analytics` | Analytics | owner | P1 |
| `/dashboard/wallet` | Wallet (read-only) | owner | P1 |
| `/dashboard/settings` | Settings + staff mgmt | owner | P1 |

---

## 6. UX & Design Requirements

- **Brand:** Kitchyn. Reuse the existing palette (purple primary; dixie/cinnabar/
  viridian for states), logo, and the look established in `tailwind.config.ts`
  and `design.md`. The app must feel like the same product as the web dashboard.
- **Native patterns:** OS-native navigation (bottom tabs mirroring the web bottom
  nav), pull-to-refresh, native share sheet, native dialer/maps intents, haptics
  on key actions, and respect for safe areas / large screens / dark mode.
- **One-handed frontline:** large tap targets, high-contrast status colors, a
  persistent connection banner that consumes layout (can't be missed), and a
  prominent mute/sound control.
- **Accessibility:** WCAG-aligned contrast, dynamic font scaling, screen-reader
  labels on all actionable elements, and non-color-only status cues.
- **Localization/format:** Nigeria defaults — ₦ currency formatting from kobo
  (reuse `@foodo/utils` `formatKobo`), `en-NG` dates, local phone formatting.

---

## 7. Backend & Data

**Principle: reuse the existing backend; minimize server change.**

- **Auth & data:** Supabase Auth + Postgres via the Supabase JS client directly
  from the app (same RLS-protected access the web uses), plus the existing
  Next.js API routes under `/api/dashboard/*` and `/api/merchant/*` for actions
  (status update, dispatch, SMS campaign, staff, exports).
- **Real-time:** Supabase Realtime `postgres_changes` channels per restaurant
  (identical to web).
- **Shared logic:** consume `@foodo/database` (types) and `@foodo/utils`
  (kobo/money/settlement formatting) so money math is identical across surfaces.
  Note: `@foodo/ui` is web/Tailwind/React-DOM and **cannot** be shared — mobile
  needs its own component layer (see implementation plan).

### Required backend additions (small, additive)
1. **Push notifications for new orders (P0).** A server hook on order insert
   (Supabase DB webhook / Edge Function, or extend the existing order-creation
   path) that sends an FCM push to the restaurant's registered device tokens.
   Requires:
   - A `device_tokens` table (`user_id`, `restaurant_id`, `token`, `platform`,
     `created_at`, `last_seen`) + register/unregister endpoints.
   - An FCM sender (service account) invoked on new `orders` rows for that
     restaurant.
2. **(P2) Idempotent, lifecycle-validated `update-status`** — already specced in
   [frontline-reliability.md](frontline-reliability.md) §Layer 3 (accept
   `expectedFromStatus`, `Idempotency-Key`). Enables the offline action queue.

Everything else (login, orders read/realtime, status update, dispatch, menu,
customers, marketing, analytics, wallet, settings) works against today's API
with no change.

---

## 8. Real-Time & Notification Behavior (detailed)

| State | Behavior |
|---|---|
| App foreground, order arrives | Realtime event → card animates into "New", repeating sound until acknowledged, badge count updates. Mute toggle respected. |
| App background / screen off | FCM push with sound + order summary. Tap opens directly to the order. |
| App killed | FCM data+notification push still delivered by the OS. |
| Network drops | Connection banner → "offline"; actions disabled or (P2) queued. |
| Realtime channel drops, net ok | Banner → "reconnecting"; on recovery, catch-up refetch reconciles state. |
| Reconnect | Refetch latest orders, replace local state, banner → "online" (auto-dismiss). |

Notification permission is requested with a clear pre-prompt explaining "we'll
alert you when a new order arrives" before the OS dialog (Android 13+ runtime
permission).

---

## 9. Non-Functional Requirements

- **Performance:** cold start < 3s on a mid-range Android; order list interaction
  60fps; realtime event → on-screen < 1s.
- **Reliability:** no missed-order class of bug — push + realtime + catch-up are
  redundant paths. Crash-free sessions > 99.5%.
- **Battery/data:** efficient realtime usage; respect Doze/background limits.
- **Security:** tokens in Keystore; biometric gate; no secrets in the bundle;
  certificate handling per platform norms; RLS enforced server-side.
- **Observability:** Sentry (mobile SDK, same org `kitchyn-qv`) for crashes/perf
  and PostHog mobile SDK for product analytics, mirroring web instrumentation.
- **Min OS:** Android 8.0 (API 26)+ target; build target current Play
  requirement (API 35 at time of writing).

---

## 10. Google Play Compliance (approval-critical)

This app must pass review on first submission. Requirements:

1. **Not a webview wrapper.** Native UI and native navigation throughout. Google
   rejects low-effort webview "repackaging" under the minimum-functionality/spam
   policy. Our app is natively built (this is why we are not wrapping the web
   dashboard — see implementation plan §repo decision).
2. **Data safety form.** Declare data collected (email, name, phone of staff/
   owner; customer data is processed on behalf of merchants), purpose, and that
   data is encrypted in transit and deletable. Maintain an accurate Play Console
   Data Safety section.
3. **Privacy policy.** Public URL required; must cover account data, analytics
   (PostHog/Sentry), notifications (FCM token), and deletion requests.
4. **Account deletion.** Play requires an in-app and web path to request account/
   data deletion for apps with accounts. Provide a "Delete account" flow/route.
5. **Permissions justification.** Only request what's used (notifications,
   network, optional phone-dialer intent). Justify `POST_NOTIFICATIONS`.
6. **Target API level & app bundle (AAB).** Ship as a signed AAB meeting the
   current target-API requirement; enroll in Play App Signing.
7. **Content rating & category.** Business/Food & Drink; complete the rating
   questionnaire.
8. **Sensitive data / financials.** Wallet is read-only; no payment instruments
   are collected in-app, avoiding financial-services policy friction.
9. **Pre-launch report & testing tracks.** Use internal → closed → production
   tracks; fix pre-launch report crashes before promotion.

---

## 11. Success Metrics

- **Adoption:** % of active merchants with the app installed and signed in within
  60 days of launch.
- **Reliability:** reduction in missed/late orders attributable to alerting;
  median time-to-acknowledge a new order (target < 60s).
- **Engagement:** daily active merchant rate vs web-only baseline.
- **Quality:** crash-free sessions > 99.5%; Play store rating ≥ 4.3; zero policy
  strikes.
- **Notification efficacy:** push delivery + open rate on new-order alerts.

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Play rejection as "webview/low-functionality" | Launch blocked | Build natively (not a wrapper); rich native UX; testing tracks |
| Push reliability on Android (Doze, OEM kill) | Missed orders | FCM high-priority data messages + realtime + catch-up redundancy; foreground service consideration for active service hours |
| Monorepo (Metro) friction with Next.js workspace | Slower setup | Isolate Expo app config; share only non-DOM packages; documented Metro config |
| Auth latency (existing ~600ms `getUser` cost) | Sluggish launch | Use Supabase session locally on device; async profile enrich; track via Sentry (see performance-audit-2026-06) |
| Money/display drift from web | Trust damage | Reuse `@foodo/utils` formatting & settlement helpers; never re-implement kobo math |
| Scope creep to full parity at once | Delayed launch | Phase by priority: ship the order loop first |

---

## 13. Phased Delivery (product view)

- **Phase 0 — Foundation:** project setup, auth, navigation shell, shared
  packages wired, Sentry/PostHog.
- **Phase 1 — The Order Loop (MVP, launch-blocking):** frontline orders queue,
  realtime, push notifications, status advance, dispatch, availability toggle,
  connection/catch-up. *This is a shippable, valuable app on its own.*
- **Phase 2 — Owner parity:** home overview, full menu manager, customers,
  marketing, analytics, wallet, settings, staff management.
- **Phase 3 — Mobile excellence:** offline action queue, biometric, deep links,
  iOS release.

Detailed sequencing, architecture, and tasks are in
[mobile-app-implementation-plan.md](mobile-app-implementation-plan.md).

---

## 14. Open Questions

1. One frontline staff account per restaurant is the current model — confirm
   whether mobile should support multiple staff devices/accounts.
2. Should owners receive new-order push by default, or only when no staff device
   is registered/active?
3. Do we want a foreground service during declared "open hours" for maximum alert
   reliability (stronger guarantee, more battery, extra Play disclosure)?
4. iOS timeline commitment — fast-follow weeks vs. parallel.
