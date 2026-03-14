# Product Requirements Document
## Platform: [PLATFORM_NAME] — Multi-Tenant White-Label Online Ordering & Growth Marketing Platform

**Version:** 1.1 (MVP)
**Status:** Active Blueprint
**Audience:** AI Development Agents & Lead Developer
**Last Updated:** 2026-03-09
**Changelog:** v1.1 — Finalised tech stack; corrected logistics model to platform-owned rider network; removed OTP from customer checkout flow.

---

## AGENT INSTRUCTION PREAMBLE

This document is the **authoritative system blueprint** for the platform. Every feature, data model, and constraint defined here is binding. When generating code, components, queries, or logic:

- **Never hallucinate table names, column names, or relationships.** All schema definitions are explicit in Section 6.
- **Always scope queries and data access by `restaurant_id`** unless the actor is a `super_admin`. There are no exceptions.
- **Treat every section as a constraint, not a suggestion.** Deviations require explicit human developer approval logged in a decision record.
- **The tech stack is fixed:** See Section 0 (Tech Stack) for the complete, finalised stack. Do not introduce frameworks, libraries, or services outside of what is defined there without explicit human developer approval logged in the Decision Log.
- **Performance is a first-class feature.** Nigeria-optimized load constraints (sub-2MB initial payload, offline resilience) must be validated at every build step.

---

## TABLE OF CONTENTS

0. [Tech Stack (Finalised)](#0-tech-stack-finalised)
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Target Market & User Personas](#2-target-market--user-personas)
3. [Product Vision & Strategic Positioning](#3-product-vision--strategic-positioning)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [User Roles & Permission Model](#5-user-roles--permission-model)
6. [Data Model (Canonical Schema)](#6-data-model-canonical-schema)
7. [Feature Specifications](#7-feature-specifications)
   - 7.1 [Consumer Storefront PWA](#71-consumer-storefront-pwa)
   - 7.2 [Payments — Paystack Integration](#72-payments--paystack-integration)
   - 7.3 [Merchant Dashboard PWA](#73-merchant-dashboard-pwa)
   - 7.4 [Dual-Track Logistics Engine](#74-dual-track-logistics-engine)
   - 7.5 [Native Rider App (iOS/Android)](#75-native-rider-app-iosandroid)
   - 7.6 [Super Admin Dashboard](#76-super-admin-dashboard)
   - 7.7 [Notifications — Termii/Twilio SMS](#77-notifications--termiitwilio-sms)
   - 7.8 [CRM & Customer Data Capture](#78-crm--customer-data-capture)
8. [Multi-Tenancy Architecture Rules](#8-multi-tenancy-architecture-rules)
9. [Performance & Infrastructure Constraints](#9-performance--infrastructure-constraints)
10. [Security Model](#10-security-model)
11. [Integrations Reference](#11-integrations-reference)
12. [MVP Success Metrics](#12-mvp-success-metrics)
13. [Out of Scope (v1)](#13-out-of-scope-v1)
14. [Open Questions & Decision Log](#14-open-questions--decision-log)

---

## 0. Tech Stack (Finalised)

> **Agent Rule:** This section is the single source of truth for all technology choices. Every library, framework, and service used in the codebase must appear here. Do not introduce unlisted dependencies.

### Monorepo Structure

**Tool:** Turborepo

```
/apps
  /web          → Next.js 14+ (Storefront PWA + Merchant Dashboard PWA + Super Admin)
  /rider        → Expo (React Native) — Native iOS/Android Rider App
/packages
  /database     → Supabase-generated TypeScript types + shared query helpers
  /ui           → Shared UI primitives (if applicable across web surfaces)
  /utils        → Shared utilities: phone formatting (E.164), currency (kobo↔NGN), constants
```

### Layer-by-Layer Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Web Framework** | Next.js 14+ (App Router) | Server Components for storefront SEO/performance; API Route Handlers replace a separate backend; `/[restaurant_slug]` dynamic routing maps directly to multi-tenant model |
| **Styling** | Tailwind CSS | Zero runtime CSS cost; utility-first theming via CSS variables for `primary_color` white-labelling |
| **Backend / Database** | Supabase (PostgreSQL) | Native RLS for `restaurant_id` isolation; managed Postgres; no separate DB server |
| **Auth** | Supabase Auth | Phone OTP (riders), Email+Password (merchants, admins); SSR session helpers for Next.js |
| **Realtime** | Supabase Realtime | Order queue push for Merchant Dashboard; delivery assignment push for Rider App |
| **File Storage** | Supabase Storage | Menu images, restaurant logos/banners; CDN-served with image transformation |
| **Background Jobs / Events** | Supabase Edge Functions + pg_cron | Webhook handlers (Paystack), SMS dispatch, SMS retry, dispatch polling. No external job queue (no Bull, no Inngest) for MVP |
| **Rider App** | Expo (React Native) | Shares React mental model with web team; OTA updates via Expo without App Store re-submission; `expo-location` (background GPS), `expo-notifications` (push), `expo-task-manager` |
| **Cart / Client State** | Zustand | Lightweight, no boilerplate; persists to `localStorage` for cart across refreshes |
| **Server State / Caching** | TanStack Query (React Query) | Caching, background refetch, optimistic updates for mutations on Dashboard |
| **Payments** | Paystack | Non-negotiable for Nigeria. Popup JS + server-side webhook verification |
| **SMS — Primary** | Termii | Nigeria-optimised delivery rates; DND bypass capability |
| **SMS — Fallback** | Twilio | Automatic fallback if Termii returns non-2xx |
| **Email** | Resend + React Email | Merchant onboarding credentials, password resets, Super Admin alerts. Generous free tier; clean Next.js integration |
| **Deployment** | Vercel (web) + Expo EAS (rider app) | Vercel for Next.js; Expo EAS Build for App Store / Play Store submissions |
| **Type Safety** | TypeScript (end-to-end) | Supabase CLI generates types from schema into `/packages/database`. All apps consume these types. No `any` without explicit justification |
| **Bundle Analysis** | @next/bundle-analyzer | Run on every release to enforce sub-2MB storefront constraint |
| **CI Performance** | Lighthouse CI | Enforces TTI < 3s and payload < 2MB on every PR targeting `main` |

### What Is Explicitly Excluded

The following are **banned from the MVP codebase**. Do not introduce them:

- Redux / Redux Toolkit (use Zustand + TanStack Query)
- Prisma or any ORM (use Supabase client + generated types directly)
- Express / Fastify / separate Node.js server (Next.js Route Handlers + Supabase Edge Functions cover all cases)
- Bull / BullMQ / Inngest / Trigger.dev (use pg_cron + Edge Functions)
- Flutter (Rider App is Expo React Native)
- Firebase (Supabase covers all Firebase use cases)
- Any analytics SDK on the storefront critical path (zero third-party scripts blocking initial load)

---

## 1. Executive Summary & Problem Statement

### The Aggregator Trap

Independent restaurants in Nigeria — particularly mid-to-high-end establishments in Abuja (Wuse 2, Maitama, Gwarinpa) — currently face a structural revenue problem with no clean solution:

**Path A — Aggregator Marketplaces (Chowdeck, Glovo, Mano):**
- Commission rates of 25–35% per order extracted at the transaction layer.
- The customer relationship belongs to the aggregator. The restaurant receives no customer contact data, purchase history, or re-marketing capability.
- Restaurants are renting access to customers they are simultaneously paying to acquire.

**Path B — Manual WhatsApp Ordering:**
- Zero commission, but entirely unscalable.
- No structured order queue, no payment confirmation, and endemic payment fraud (fake transfer screenshots).
- No customer data capture. No analytics.

**This platform is the third path.** It is restaurant-owned digital infrastructure: a branded storefront the restaurant controls, a payment layer they trust, and a CRM that belongs entirely to them.

### Core Value Proposition

> "Stop paying 30% per order to rent your own customers. Own your storefront. Own your data. Own your growth."

The business model analogy is **Owner.com** (US market), applied to the Nigerian independent restaurant segment.

---

## 2. Target Market & User Personas

### Primary Market (MVP Pilot)
- **Geography:** Abuja, Nigeria — specifically Wuse 2, Maitama, and Gwarinpa neighborhoods.
- **Segment:** Mid-to-high-end independent restaurants and cloud kitchens.
- **Characteristics:** Restaurants with existing customer bases, average order values above ₦5,000, and current active presence on at least one aggregator platform.

### Expansion Roadmap
- Phase 2: Lagos, Port Harcourt, Kano (Nigeria-wide)
- Phase 3: Ghana, Kenya, other African markets

### User Personas

#### Persona 1: The Restaurant Owner / Manager (`merchant`)
- **Name:** Amara, 38, owns "The Copper Pot" in Maitama
- **Goals:** Reduce commission bleeding, understand her returning customers, run promotions directly to past buyers.
- **Frustrations:** Chowdeck gives her order counts, not customer names. WhatsApp orders get lost. She can't trust "proof of transfers."
- **Device:** iPhone 13, high familiarity with WhatsApp Business and Instagram. Intermittent WiFi at the restaurant.
- **Dashboard access:** Mobile-first PWA, minimum 3 logins/day expected.

#### Persona 2: The Customer (`customer`)
- **Name:** Chidi, 29, works in Wuse 2
- **Goals:** Order food from his favorite spots quickly, pay securely, track his delivery.
- **Frustrations:** Switching between apps per restaurant is friction. He doesn't want to create yet another account.
- **Device:** Android mid-range phone on 4G LTE. Bandwidth-constrained. Expects sub-3-second load times.

#### Persona 3: The Platform Rider (`rider`)
- **Name:** Emeka, 24, currently doing deliveries for Chowdeck and Glovo in Wuse 2
- **Goals:** Maximise earning hours across multiple platforms, get clear pickup/dropoff instructions, confirm deliveries easily, track his earnings in one place.
- **Why he joins this network:** More order volume from a new source; no exclusivity required — he continues working other platforms.
- **Device:** Android entry-level phone. Native app required for GPS accuracy, push notifications, and offline resilience.

#### Persona 4: The Platform Operator (`super_admin`)
- **Name:** Platform operations team
- **Goals:** Onboard new merchants, monitor platform health, resolve payment disputes, view cross-merchant analytics.
- **Device:** Desktop browser (responsive web, not mobile-first).

---

## 3. Product Vision & Strategic Positioning

### What This Platform Is NOT
- It is **not a marketplace.** There is no platform-level customer discovery. Each restaurant's storefront is accessed directly via the restaurant's own branded URL.
- It is **not a SaaS tool sold to IT departments.** The primary beneficiary and daily user is the restaurant owner themselves.

### What This Platform IS — Including Logistics

Unlike a pure software play, this platform **also owns a rider network** as a deliberate competitive advantage. This is the "Nigerian Factor" response: restaurants cannot reliably self-solve logistics, and depending on third-party providers like Kwik or Gokada creates a new dependency. By recruiting riders who are already active on Chowdeck and Glovo — without requiring exclusivity — the platform builds a supply-side asset that competitors cannot quickly replicate.

**The logistics layer serves two functions:**
1. **A value-add service** for restaurants that have no in-house riders, letting them summon a platform rider on demand.
2. **A flexibility tool** for restaurants that do have their own riders, letting them share delivery info from the dashboard to their rider and manually progress order status.

This positions logistics as infrastructure the platform *provides*, not a dependency the platform *has*.

### Two Delivery Modes (Merchant-Controlled)

**Mode A — "Summon a Rider" (Platform Network):**
- Restaurant has no available in-house rider.
- Merchant taps "Request Platform Rider" from the order card.
- Dispatch logic (Section 7.4) finds the nearest available platform rider and assigns them.
- Rider is notified via the Rider App. The order progresses automatically through status updates as the rider acts.

**Mode B — "Share Delivery" (Own Rider):**
- Restaurant has their own rider available.
- Merchant taps "Share Delivery Info" — generates a structured delivery card (customer name, address, order summary, contact number) shareable via WhatsApp, SMS, or a direct link.
- Merchant manually taps "Mark as Out for Delivery" in the dashboard.
- This triggers the customer's "Your order is on the way" SMS notification immediately.
- Merchant taps "Mark as Delivered" when confirmed.

**Agent Rule:** Mode B does NOT require a `delivery_assignments` record with a `rider_id`. It creates a `delivery_assignments` record with `dispatch_type = 'own_rider'` and `rider_id = NULL`. Status is progressed manually by the merchant, not automatically by the Rider App.

### Rider Network Strategy

- Riders sign up via the Rider App (phone OTP, basic profile, vehicle type).
- Riders are **not employees** — they are an on-demand network. No exclusivity required.
- Platform riders are scoped as `role = 'platform_rider'` in `user_profiles`, distinct from `'rider'` (restaurant's own staff rider — reserved for future use if restaurants want to onboard their own rider into the app formally).
- Super Admin manages rider onboarding, activation, and suspension.
- Rider earnings are tracked per delivery. Payout mechanism is out of scope for MVP (logged as OQ-006).

### Competitive Differentiation Matrix

| Dimension | Chowdeck / Glovo | WhatsApp | This Platform |
|---|---|---|---|
| Commission | 25–35% | 0% | Flat SaaS fee |
| Customer Data Ownership | Aggregator's | None | Restaurant's |
| Branded Experience | Aggregator brand | None | Restaurant brand |
| Payment Trust | High | Low (fraud) | High (Paystack) |
| Logistics | Aggregator's fleet | Manual / self-arrange | Platform rider network + own rider support |
| Scalability | High | None | High |
| Direct Re-marketing | No | Limited | Yes (CRM + SMS) |

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     SUPABASE (Backend)                   │
│  PostgreSQL │ Auth │ Realtime │ Storage │ Edge Functions  │
│  pg_cron (scheduled jobs)                                │
└────────┬────────────────────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │         Next.js 14+ Application            │
    │   Turborepo /apps/web                      │
    │   (Vercel deployment)                      │
    └──┬──────────────┬──────────────┬───────────┘
       │              │              │
 ┌─────▼──────┐  ┌────▼──────┐  ┌───▼──────────┐
 │  Consumer  │  │ Merchant  │  │  Super Admin  │
 │  Storefront│  │ Dashboard │  │  Dashboard    │
 │  (PWA)     │  │  (PWA)    │  │  (Responsive) │
 └─────┬──────┘  └────┬──────┘  └───────────────┘
       │              │
 ┌─────▼──────────────▼──────────────────────────┐
 │              External Services                 │
 │  Paystack │ Termii │ Twilio │ Resend            │
 └───────────────────────────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │  Expo Rider App      │
         │  (React Native)      │
         │  Turborepo /apps/rider│
         │  (Expo EAS Build)    │
         └─────────────────────┘
```

### Routing Strategy

Each merchant storefront is accessed via a unique slug-based URL:
- Pattern: `[platform-domain]/[restaurant-slug]` (e.g., `order.platform.com/the-copper-pot`)
- Alternatively: Custom domains via DNS CNAME to platform (Phase 2 feature).
- The `restaurant_slug` resolves to a `restaurant_id` on every request. All subsequent data queries are scoped to that `restaurant_id`.

---

## 5. User Roles & Permission Model

| Role | Identifier | Auth Provider | Access Scope |
|---|---|---|---|
| Customer | `customer` | No auth required for checkout. Optional Supabase Auth (Phone OTP) for order history. | Own orders and profile only |
| Merchant Owner | `merchant_owner` | Supabase Auth (Email/Password) | All data for their `restaurant_id` |
| Merchant Staff | `merchant_staff` | Supabase Auth (Email/Password) | Order queue and menu for their `restaurant_id` (read-heavy) |
| Platform Rider | `platform_rider` | Supabase Auth (Phone OTP) | Assigned deliveries only; no `restaurant_id` scoping — platform-wide rider pool |
| Super Admin | `super_admin` | Supabase Auth (Email/Password + MFA) | All data across all `restaurant_id`s; rider management |

### Row-Level Security (RLS) Principle

**This is the most critical architectural rule of the entire system.**

All Supabase tables that contain restaurant-specific data MUST have RLS policies enforcing `restaurant_id` scoping. The `super_admin` role bypasses RLS via a service role key used only in server-side Edge Functions — never exposed to the client.

```sql
-- Example RLS policy template (apply to ALL tenant-scoped tables)
CREATE POLICY "restaurant_isolation" ON [table_name]
  FOR ALL
  USING (restaurant_id = (SELECT restaurant_id FROM user_profiles WHERE id = auth.uid()));
```

---

## 6. Data Model (Canonical Schema)

> **Agent Rule:** These are the authoritative table and column names. Do not invent aliases, do not rename columns in queries, do not assume columns exist that are not listed here.

### `restaurants`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
slug             TEXT UNIQUE NOT NULL         -- URL identifier (e.g., "the-copper-pot")
name             TEXT NOT NULL
description      TEXT
logo_url         TEXT
banner_url       TEXT
primary_color    TEXT                         -- Hex code for white-label theming
phone            TEXT
address          TEXT
city             TEXT
state            TEXT
is_active        BOOLEAN DEFAULT true
accepts_orders   BOOLEAN DEFAULT true         -- Toggle to pause ordering
logistics_default TEXT DEFAULT 'platform_rider'
  -- 'platform_rider' | 'own_rider' | 'third_party'
delivery_radius_km NUMERIC(5,2)
min_order_amount NUMERIC(10,2)
estimated_delivery_minutes INTEGER
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### `user_profiles`
```sql
id               UUID PRIMARY KEY REFERENCES auth.users(id)
restaurant_id    UUID REFERENCES restaurants(id)  -- NULL for customers, platform_riders, and super_admins
role             TEXT NOT NULL
  -- Role enum: 'customer' | 'merchant_owner' | 'merchant_staff' | 'platform_rider' | 'super_admin'
full_name        TEXT
phone            TEXT
email            TEXT
avatar_url       TEXT
vehicle_type     TEXT                         -- 'bicycle' | 'motorcycle' | 'car' — platform_rider only, NULL for others
is_active        BOOLEAN DEFAULT true
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### `menu_categories`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
name             TEXT NOT NULL
display_order    INTEGER DEFAULT 0
is_active        BOOLEAN DEFAULT true
created_at       TIMESTAMPTZ DEFAULT now()
```

### `menu_items`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
category_id      UUID REFERENCES menu_categories(id)
name             TEXT NOT NULL
description      TEXT
price            NUMERIC(10,2) NOT NULL
image_url        TEXT
is_available     BOOLEAN DEFAULT true
is_featured      BOOLEAN DEFAULT false
prep_time_minutes INTEGER
display_order    INTEGER DEFAULT 0
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### `menu_item_options` (modifier groups, e.g., "Choose size")
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
menu_item_id     UUID NOT NULL REFERENCES menu_items(id)
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
name             TEXT NOT NULL                -- e.g., "Choose Size"
is_required      BOOLEAN DEFAULT false
min_selections   INTEGER DEFAULT 0
max_selections   INTEGER DEFAULT 1
```

### `menu_item_option_choices`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
option_id        UUID NOT NULL REFERENCES menu_item_options(id)
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
name             TEXT NOT NULL                -- e.g., "Large"
price_modifier   NUMERIC(10,2) DEFAULT 0
is_available     BOOLEAN DEFAULT true
```

### `customers` (CRM table — separate from auth)
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
user_id          UUID REFERENCES user_profiles(id)  -- NULL for guest/phone-only orders
phone            TEXT NOT NULL
full_name        TEXT
email            TEXT
total_orders     INTEGER DEFAULT 0
total_spent      NUMERIC(12,2) DEFAULT 0
last_order_at    TIMESTAMPTZ
first_order_at   TIMESTAMPTZ
notes            TEXT                         -- Merchant-added notes (e.g., "VIP, no onions")
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()

UNIQUE(restaurant_id, phone)                  -- One CRM record per phone per restaurant
```

### `orders`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
customer_id      UUID REFERENCES customers(id)
order_number     TEXT NOT NULL                -- Human-readable: e.g., "CP-0042"
status           TEXT NOT NULL DEFAULT 'pending'
  -- Status enum: 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup'
  -- | 'assigned_to_rider' | 'in_transit' | 'delivered' | 'cancelled'
fulfillment_type TEXT NOT NULL               -- 'delivery' | 'pickup'
delivery_address TEXT
delivery_lat     NUMERIC(10,7)
delivery_lng     NUMERIC(10,7)
subtotal         NUMERIC(10,2) NOT NULL
delivery_fee     NUMERIC(10,2) DEFAULT 0
discount_amount  NUMERIC(10,2) DEFAULT 0
total_amount     NUMERIC(10,2) NOT NULL
payment_status   TEXT NOT NULL DEFAULT 'pending'
  -- Payment status enum: 'pending' | 'paid' | 'failed' | 'refunded'
payment_ref      TEXT                         -- Paystack reference
special_instructions TEXT
rider_id         UUID REFERENCES user_profiles(id)
estimated_delivery_at TIMESTAMPTZ
delivered_at     TIMESTAMPTZ
cancelled_reason TEXT
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

### `order_items`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id         UUID NOT NULL REFERENCES orders(id)
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
menu_item_id     UUID NOT NULL REFERENCES menu_items(id)
item_name        TEXT NOT NULL                -- Snapshot at time of order
item_price       NUMERIC(10,2) NOT NULL       -- Snapshot at time of order
quantity         INTEGER NOT NULL DEFAULT 1
selected_options JSONB                        -- Snapshot of chosen modifiers
line_total       NUMERIC(10,2) NOT NULL
```

### `delivery_assignments`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id         UUID NOT NULL REFERENCES orders(id)
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
rider_id         UUID REFERENCES user_profiles(id)    -- NULL for 'own_rider' and 'third_party' dispatch types
dispatch_type    TEXT NOT NULL
  -- 'platform_rider'   → assigned to a platform_rider from the network (rider_id set)
  -- 'own_rider'        → restaurant's own rider; merchant manually progresses status (rider_id NULL)
  -- 'third_party'      → external dispatch API (rider_id NULL)
third_party_provider TEXT                    -- e.g., 'kwik', 'gokada' — only for 'third_party'
third_party_ref  TEXT                        -- External tracking ID — only for 'third_party'
share_link_token TEXT UNIQUE                 -- Short-lived token for "Share Delivery Info" link — only for 'own_rider'
status           TEXT NOT NULL DEFAULT 'assigned'
  -- 'assigned' | 'en_route_pickup' | 'picked_up' | 'en_route_dropoff' | 'delivered' | 'failed'
  -- For 'own_rider': status is updated manually by the merchant ('assigned' → 'en_route_dropoff' → 'delivered')
assigned_at      TIMESTAMPTZ DEFAULT now()
picked_up_at     TIMESTAMPTZ
delivered_at     TIMESTAMPTZ
rider_lat        NUMERIC(10,7)               -- Last known GPS (updated by Rider App — platform_rider only)
rider_lng        NUMERIC(10,7)
```

### `platform_riders` (extended profile for platform_rider role)
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id          UUID NOT NULL UNIQUE REFERENCES user_profiles(id)
is_online        BOOLEAN DEFAULT false        -- Rider is available to accept jobs
current_lat      NUMERIC(10,7)               -- Last known location (updated by Rider App)
current_lng      NUMERIC(10,7)
active_deliveries INTEGER DEFAULT 0          -- Denormalised counter for load balancing
total_deliveries  INTEGER DEFAULT 0
total_earnings_kobo BIGINT DEFAULT 0         -- Lifetime earnings in kobo (payout logic Phase 2)
last_seen_at     TIMESTAMPTZ
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
```

**Agent Rule:** `platform_riders` has NO `restaurant_id` column — it is a platform-global table. Its RLS policy allows a `platform_rider` to read and update only their own row (`user_id = auth.uid()`). Super Admin can read and update all rows via service role.


```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
order_id         UUID NOT NULL REFERENCES orders(id)
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
paystack_ref     TEXT UNIQUE NOT NULL
paystack_status  TEXT NOT NULL               -- Raw status from Paystack webhook
amount_kobo      BIGINT NOT NULL             -- Always store in smallest unit (kobo)
currency         TEXT NOT NULL DEFAULT 'NGN'
channel          TEXT                        -- 'card' | 'bank_transfer' | 'ussd' etc.
paid_at          TIMESTAMPTZ
metadata         JSONB                       -- Raw Paystack response snapshot
created_at       TIMESTAMPTZ DEFAULT now()
```

### `sms_logs`
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
restaurant_id    UUID NOT NULL REFERENCES restaurants(id)
recipient_phone  TEXT NOT NULL
message_body     TEXT NOT NULL
provider         TEXT NOT NULL               -- 'termii' | 'twilio'
provider_ref     TEXT
status           TEXT                        -- 'queued' | 'sent' | 'delivered' | 'failed'
event_type       TEXT                        -- 'order_confirmation' | 'order_status_update' | 'marketing'
created_at       TIMESTAMPTZ DEFAULT now()
```

### `platform_settings` (Super Admin global config)
```sql
key              TEXT PRIMARY KEY
value            JSONB NOT NULL
updated_by       UUID REFERENCES user_profiles(id)
updated_at       TIMESTAMPTZ DEFAULT now()
```

---

## 7. Feature Specifications

---

### 7.1 Consumer Storefront PWA

**Platform:** Progressive Web App (mobile-first)
**Access URL Pattern:** `[domain]/[restaurant_slug]`
**Auth:** Phone number OTP via Supabase. Guest checkout (phone-only) must also be supported.

#### 7.1.1 Storefront Home Page

- Renders the restaurant's `logo_url`, `banner_url`, `name`, and `primary_color` theme.
- Displays `menu_categories` as a horizontally scrollable sticky tab bar.
- Displays `menu_items` grouped by `category_id`, filtered to `is_available = true`.
- Featured items (`is_featured = true`) surface in a hero carousel at the top.
- If `accepts_orders = false`, display a "We're currently closed" banner. Menu is still visible but cart is disabled.

**Performance Constraint:** The full storefront initial load MUST be under 2MB. Menu data fetched via Supabase; images served via CDN with lazy loading. Use Next.js `Image` component with explicit `width`/`height` to prevent layout shift.

#### 7.1.2 Menu Item Detail & Options

- Tapping a menu item opens a bottom sheet (not a new page) to preserve scroll position.
- Displays item image, description, price, and all `menu_item_options`.
- Required options (`is_required = true`) must be selected before "Add to Cart" is enabled.
- Quantity stepper (min: 1).
- "Add to Cart" appends to local cart state.

#### 7.1.3 Cart

- Cart state is managed client-side (Zustand or React Context). It is NOT persisted to the database until checkout.
- Cart persists across page refreshes via `localStorage`.
- Shows all `order_items`, individual prices, subtotal, and estimated `delivery_fee`.
- Delivery fee is calculated based on `delivery_radius_km` config (flat-rate for MVP; distance-based in Phase 2).
- Minimum order validation against `min_order_amount`.

#### 7.1.4 Checkout Flow

Checkout must be frictionless. There is **no authentication gate** before completing a purchase. OTP is never required at checkout.

**Step 1 — Identity (Frictionless):**
- Collect three fields only: **Full Name**, **Phone Number**, **Email (optional)**.
- No OTP. No account creation prompt. No password.
- Phone number is the CRM key. It is normalized to E.164 (`+234XXXXXXXXXX`) on input.
- **Returning customer detection:** If the entered phone number matches an existing `customers` record for this `restaurant_id`, pre-fill the name field automatically (fetched via a server action — do not expose other customer data client-side).
- The `customers` upsert (CRM capture) happens after payment confirmation, not at this step.

**Step 2 — Fulfillment:**
- Toggle: Delivery or Pickup.
- If Delivery: Address text input field. Special instructions text area.
- If Pickup: Estimated pickup time display only.

**Step 3 — Payment (Paystack):**
- Call Paystack Initialize Transaction API server-side. Open Paystack Popup (or redirect to hosted page on low-end devices).
- On `success` callback from Paystack: create `orders` and `order_items` records.
- On `close`/`failure`: display error state, allow retry. Do NOT create an order record.
- Order status set to `pending` on creation; moves to `confirmed` only after Paystack webhook verification (see 7.2.2).

**Agent Rule:** The `orders` record MUST NOT be created until payment success is confirmed by the Paystack popup callback AND subsequently verified by the server-side webhook. The popup callback alone is client-side and spoofable — it triggers optimistic UX only. The webhook is the source of truth.

**COD Exception:** If Cash on Delivery is enabled for the merchant (`payment_method = 'cash_on_delivery'`), the order is created immediately on Step 3 confirmation with `payment_status = 'pending'`. No Paystack call is made.

**Optional Account Creation (Post-Order):**
- After a successful order, display a non-intrusive prompt: "Save your details for faster checkout next time."
- If accepted: send OTP to their phone to create a Supabase Auth account. This links their `customers` record to a `user_profiles` entry.
- This is the only point in the customer journey where OTP is used — and only if the customer opts in.

**When OTP IS required (non-checkout contexts):**
- Customer explicitly accessing their order history (`/[slug]/orders` — account login).
- Merchant logging into the dashboard.
- Platform rider logging into the Rider App.
- Super Admin logging into the admin panel (OTP via TOTP MFA).

#### 7.1.5 Order Tracking Page

- Route: `/[restaurant_slug]/orders/[order_id]`
- Real-time order status updates via Supabase Realtime subscription on `orders.status`.
- Visual progress stepper: `Confirmed → Preparing → Ready → On the Way → Delivered`.
- If `delivery_assignment.rider_id` is set and Rider App is broadcasting GPS: show live map with rider pin (Phase 2; for MVP show status text only).
- SMS notification sent at each status change (see 7.7).

---

### 7.2 Payments — Paystack Integration

#### 7.2.1 Checkout Initiation

- Server-side: Before opening Paystack popup, create a Paystack transaction via the Paystack Initialize Transaction API.
- Store the `paystack_ref` in the client session.
- Amount must be passed in **kobo** (multiply NGN amount by 100).
- Metadata payload must include: `{ restaurant_id, order_items_snapshot, customer_phone }`.

#### 7.2.2 Webhook Verification (Critical Path)

Paystack sends a POST webhook to a Supabase Edge Function endpoint.

```
POST /api/webhooks/paystack
```

**Verification steps (all mandatory):**
1. Validate `X-Paystack-Signature` header using HMAC-SHA512 with the Paystack Secret Key. Reject any request that fails signature validation with a `401`.
2. Parse event body. Only handle `charge.success` events. Ignore all others with a `200` (acknowledge receipt).
3. Verify `data.reference` exists in `payments` table with `paystack_status = 'pending'`.
4. Update `payments` record: `paystack_status = 'success'`, `paid_at = now()`, `metadata = [raw response]`.
5. Update linked `orders` record: `payment_status = 'paid'`, `status = 'confirmed'`.
6. Trigger: Push new order to Merchant Dashboard via Supabase Realtime.
7. Trigger: Send order confirmation SMS to customer (see 7.7).
8. Return `200` to Paystack.

**Idempotency:** If webhook is received for an already-processed `paystack_ref`, return `200` silently without re-processing.

---

### 7.3 Merchant Dashboard PWA

**Platform:** Progressive Web App (mobile-first)
**Auth:** Email + Password via Supabase Auth
**URL:** `[domain]/dashboard` (scoped to logged-in merchant's `restaurant_id`)

#### 7.3.1 Order Queue (Primary Screen)

This is the screen a merchant sees constantly. It must be the default landing page after login.

- Three columns / tabs: **New Orders**, **In Progress**, **Completed** (today).
- New orders appear via Supabase Realtime subscription on `orders WHERE restaurant_id = [current]`.
- Each order card displays: `order_number`, customer name, `fulfillment_type`, `total_amount`, items summary, `created_at` timestamp.
- **New order audio alert:** Browser `AudioContext` API plays a notification sound on new `INSERT` event. Must work on mobile (requires user interaction first — prompt on first dashboard load).
- Order card actions:
  - **Confirm** (moves `pending` → `confirmed`): Triggers prep timer.
  - **Mark Ready** (moves `preparing` → `ready_for_pickup`): Triggers logistics dispatch (see 7.4).
  - **Cancel** (with required reason): Triggers refund flow via Paystack Refund API.
- **Offline resilience:** Last known order queue is cached in `localStorage`/IndexedDB. If Supabase Realtime connection drops, display a "Reconnecting..." banner. Do NOT clear the order queue on disconnect.

#### 7.3.2 Menu Management

- CRUD operations on `menu_categories` and `menu_items`.
- Image upload: directly to Supabase Storage bucket `menu-images/[restaurant_id]/`.
- Toggle `is_available` per item (e.g., "86" a sold-out item instantly).
- Set `display_order` via drag-and-drop (react-beautiful-dnd or equivalent).
- Reorder saves a batch update to Supabase.

#### 7.3.3 CRM (Customer Profiles)

- Table view of all `customers` for this `restaurant_id`.
- Columns: Name, Phone, Total Orders, Total Spent, Last Order Date.
- Sort by: Total Spent DESC (default), Last Order, First Order.
- Tap a customer: opens profile with order history.
- Merchant can add `notes` to a customer profile.
- **Export:** CSV download of all customer records (phone, name, order count, total spend). This is the core "data ownership" deliverable.

#### 7.3.4 Analytics (MVP — Basic)

- Date range picker (default: last 30 days).
- Metrics cards: Total Revenue, Total Orders, Average Order Value, New Customers.
- Top 5 items by order count.
- All metrics are scoped to `restaurant_id` and computed in Supabase via server-side queries or materialized views (avoid heavy client-side aggregation).

#### 7.3.5 Settings

- Restaurant profile: name, logo, banner, `primary_color`, phone, address.
- Operating hours (stored as JSONB in `restaurants` table, Phase 2 feature for auto-toggle `accepts_orders`).
- `min_order_amount` configuration.
- `delivery_fee` configuration (flat rate for MVP).
- **Default logistics mode:** Platform Rider / Own Rider / Third-Party. This sets the pre-selected mode shown on each order card, but merchants can override per order.

---

### 7.4 Logistics Engine (Three-Mode)

The logistics engine determines how a delivery is fulfilled. It supports three modes, selected by the merchant per order or configured as a restaurant-level default. The engine is triggered when an order reaches `ready_for_pickup` status.

#### 7.4.1 Dispatch Mode Decision Logic

```
WHEN order.status → 'ready_for_pickup':

  IF merchant selected 'own_rider' for this order:
    → Mode B: Own Rider flow (see 7.4.3)

  ELSE IF merchant.logistics_default == 'platform_rider'
       OR merchant taps "Request Platform Rider":
    → Mode A: Platform Rider dispatch (see 7.4.2)

  ELSE IF merchant.logistics_default == 'third_party':
    → Mode C: Third-party API dispatch (see 7.4.4)
```

This logic runs in a Supabase Edge Function triggered by an `orders` UPDATE event. The merchant can also manually override the mode from the order card in the dashboard before dispatch is triggered.

#### 7.4.2 Mode A — Platform Rider Dispatch

The platform maintains its own rider network. Riders sign up independently via the Rider App and are managed by Super Admin.

**Assignment logic (MVP — load balancing):**
1. Query `platform_riders WHERE is_online = true AND active_deliveries < 3` ordered by `active_deliveries ASC`.
2. Assign to the top result.
3. If no riders available: notify merchant via dashboard alert and SMS to manually choose Mode B or C.
4. Create `delivery_assignments` record: `dispatch_type = 'platform_rider'`, `rider_id = [assigned]`, `status = 'assigned'`.
5. Push assignment to Rider App via Supabase Realtime on `delivery_assignments` channel filtered by `rider_id`.
6. Increment `platform_riders.active_deliveries` for assigned rider.

**GPS-proximity-based assignment** is a Phase 2 enhancement. MVP uses load balancing only.

#### 7.4.3 Mode B — Own Rider (Share Delivery Info)

Used when the restaurant has their own rider available and does not need the platform network.

**Flow:**
1. Merchant taps "Use My Own Rider" on the order card.
2. System creates `delivery_assignments` record: `dispatch_type = 'own_rider'`, `rider_id = NULL`, `status = 'assigned'`.
3. System generates a `share_link_token` (short UUID) stored in `delivery_assignments`.
4. Dashboard renders a "Share Delivery" button. Tapping it opens a share sheet with:
   - A pre-formatted text message containing: customer name, delivery address, customer phone, order summary, and a link to the delivery card (`/delivery/[share_link_token]`).
   - Share targets: WhatsApp (primary), SMS, Copy Link.
5. The `/delivery/[share_link_token]` page is a public, minimal page accessible without auth — displays pickup and dropoff details for the rider.
6. **Merchant manually progresses order status:**
   - Taps "Mark as Out for Delivery" → `orders.status = 'in_transit'` → triggers customer SMS notification.
   - Taps "Mark as Delivered" → `orders.status = 'delivered'` → triggers customer delivery confirmation SMS.

**Agent Rule:** The `/delivery/[share_link_token]` route is public but token-gated. Tokens are single-use context only — they do not grant any write access. The page is read-only. Tokens expire 6 hours after creation.

#### 7.4.4 Mode C — Third-Party Dispatch API

Fully automated. No manual steps by the merchant.

- Supabase Edge Function calls the third-party provider API (e.g., Kwik Delivery).
- Payload: restaurant address (pickup), `orders.delivery_address` (dropoff), customer contact, order value.
- On successful API response: create `delivery_assignments` record: `dispatch_type = 'third_party'`, `third_party_provider`, `third_party_ref`.
- Poll or webhook the provider for status updates; mirror to `delivery_assignments.status` and `orders.status`.

**Agent Rule:** Third-party API credentials are stored in Supabase Vault / environment variables. Never in the database. Never on the client.

---

### 7.5 Native Rider App (iOS/Android)

**Platform:** Expo (React Native). Native iOS/Android — NOT a PWA.
**Monorepo location:** `/apps/rider`
**Auth:** Phone OTP via Supabase Auth.
**Scope:** Platform riders only (`role = 'platform_rider'`). These are independent riders in the platform's network — not restaurant employees.

#### 7.5.1 Onboarding Flow

- Download app → Enter phone → OTP verification → Create profile (name, vehicle type).
- Profile enters `is_active = false` pending Super Admin approval.
- On approval: rider receives SMS confirmation and can go online.

#### 7.5.2 Core Screens

**Home / Status:**
- Toggle: **Go Online / Go Offline** — updates `platform_riders.is_online`.
- When online: rider is eligible for dispatch. Shows "Waiting for orders..." state.
- When a delivery is assigned: screen transitions to Active Delivery view automatically.

**Active Delivery:**
- Shows pickup details (restaurant name, address) and dropoff details (customer name, address, phone).
- Map view with pickup pin and dropoff pin.
- Action buttons progress the delivery:
  - `En Route to Pickup` → `Picked Up` → `En Route to Dropoff` → `Delivered`
- Each action updates `delivery_assignments.status` and the linked `orders.status` via Supabase.
- On `Picked Up`: `platform_riders.active_deliveries` stays at current count.
- On `Delivered`: decrement `platform_riders.active_deliveries`; increment `platform_riders.total_deliveries`.

**New Assignment Alert:**
- Supabase Realtime subscription on `delivery_assignments WHERE rider_id = auth.uid()`.
- Push notification (via `expo-notifications` / FCM) on new assignment even when app is backgrounded.
- Rider has 60 seconds to **Accept** or **Decline**.
- On Decline: re-enter dispatch queue, assign to next eligible rider. Notify merchant if no riders accept after 2 attempts.

**GPS Broadcasting:**
- When status is `en_route_pickup` or `en_route_dropoff`: broadcast GPS coordinates every 10 seconds to `platform_riders.current_lat` / `platform_riders.current_lng` AND `delivery_assignments.rider_lat` / `delivery_assignments.rider_lng`.
- Stop broadcasting when `delivered` or `failed`.
- Use `expo-location` in background mode, accuracy set to `Balanced` for battery optimisation.

**Earnings History:**
- Read-only list of completed deliveries grouped by day: date, restaurant name, delivery address, earnings per delivery.
- Total lifetime earnings display.
- Payout mechanism is out of scope for MVP (OQ-006).

#### 7.5.3 Offline Handling

- Cache current active delivery details locally in `AsyncStorage`.
- Queue status update actions (e.g., "Picked Up" tap) and retry on reconnect.
- Display "Offline — syncing..." banner when Supabase Realtime connection is lost.

---

### 7.6 Super Admin Dashboard

**Platform:** Responsive Web (desktop-first, NOT mobile-first)
**Auth:** Email + Password + TOTP MFA (enforced, no exceptions)
**URL:** `[domain]/admin`

#### 7.6.1 Merchant Management

- List all `restaurants` with: name, slug, city, `is_active`, total orders (all-time), total revenue (all-time), date onboarded.
- **Onboard new merchant:**
  1. Create `restaurants` record.
  2. Create `user_profiles` record for merchant owner.
  3. Send onboarding email with credentials and storefront URL.
- Toggle `is_active` (disables all ordering for a merchant without deleting data).
- Impersonate merchant (view their dashboard as read-only) — uses service role with audit log.

#### 7.6.2 Platform Analytics

- Aggregate metrics across all merchants: Total GMV, Total Orders, Active Merchants, New Merchants This Month.
- Per-merchant revenue table, sortable.
- These queries use the service role key (server-side only). Client never receives cross-merchant raw data.

#### 7.6.3 Payment Disputes & Refunds

- Search orders by `paystack_ref` or `order_number`.
- Trigger Paystack refund via API (Supabase Edge Function).
- Log all admin actions with `admin_id` and timestamp in an `audit_logs` table.

#### 7.6.4 SMS & Notification Logs

- View `sms_logs` across all restaurants.
- Filter by status (`failed` for debugging), provider, event type.
- Retry failed SMS sends.

#### 7.6.5 Rider Network Management

- List all `platform_riders` with: name, phone, vehicle type, `is_online`, `total_deliveries`, `total_earnings_kobo`, `last_seen_at`, `is_active`.
- Approve new rider applications (set `user_profiles.is_active = true`).
- Suspend a rider (set `is_active = false`, force offline).
- View a rider's full delivery history.
- View riders currently online and their last known location on a map (Phase 2 — for MVP, table view only).



**Provider Priority:** Termii (primary, Nigeria-optimized). Twilio as fallback.
**Trigger:** All SMS are sent from Supabase Edge Functions, never from the client.

#### SMS Event Matrix

| Event | Recipient | Template |
|---|---|---|
| Order Confirmed (payment success) | Customer | "Hi [Name], your order #[ORDER_NUM] from [Restaurant] has been confirmed! Total: ₦[AMOUNT]. Track it here: [LINK]" |
| Order Being Prepared | Customer | "Your order #[ORDER_NUM] is being prepared. We'll notify you when it's on the way." |
| Order Out for Delivery (all modes) | Customer | "Your order #[ORDER_NUM] is on its way! Estimated arrival: [TIME]." |
| Order Delivered | Customer | "Your order #[ORDER_NUM] has been delivered. Enjoy your meal! 🎉" |
| Order Cancelled | Customer | "Your order #[ORDER_NUM] has been cancelled. A refund of ₦[AMOUNT] will be processed within 3-5 business days." |
| New Order Alert | Merchant | "New order #[ORDER_NUM] received! ₦[AMOUNT]. Log in to confirm: [DASHBOARD_LINK]" |
| No Platform Rider Available | Merchant | "No platform riders available for order #[ORDER_NUM]. Please use your own rider or select another delivery option in your dashboard." |
| Rider Approved (onboarding) | Platform Rider | "Welcome to [Platform]! Your rider account is approved. Open the app to go online and start earning." |

#### Implementation Rules

- All SMS text is sent from the Edge Function, not stored as templates in the database (for MVP).
- Phone numbers must be normalized to E.164 format (`+234XXXXXXXXXX`) before sending.
- Every SMS send attempt MUST create an `sms_logs` record with `status = 'queued'` before the API call, updated to `'sent'` or `'failed'` on response.
- Respect Termii rate limits. Queue SMS sends with exponential backoff on `429` responses.

---

### 7.8 CRM & Customer Data Capture

The CRM is not a separate module — it is a consequence of every order placed. The `customers` table is the core data asset the platform generates for the restaurant.

#### Customer Profile Upsert Logic

On every successful checkout, execute:

```sql
INSERT INTO customers (restaurant_id, phone, full_name, email, first_order_at, last_order_at, total_orders, total_spent)
VALUES ([restaurant_id], [phone], [name], [email], now(), now(), 1, [order_total])
ON CONFLICT (restaurant_id, phone)
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = COALESCE(EXCLUDED.email, customers.email),
  last_order_at = now(),
  total_orders = customers.total_orders + 1,
  total_spent = customers.total_spent + EXCLUDED.total_spent,
  updated_at = now();
```

**Agent Rule:** This upsert logic must run AFTER payment is confirmed (i.e., triggered by the Paystack webhook handler, not at checkout initiation). `total_orders` and `total_spent` are denormalized counters — always update them here, do not rely on COUNT queries for display.

#### CRM Export

- Endpoint: `GET /api/merchant/customers/export` (authenticated, scoped by `restaurant_id`)
- Returns CSV with columns: `full_name`, `phone`, `email`, `total_orders`, `total_spent`, `first_order_at`, `last_order_at`, `notes`
- This is the primary mechanism for a merchant to run external campaigns (bulk SMS, WhatsApp broadcast).

---

## 8. Multi-Tenancy Architecture Rules

These rules are non-negotiable and must be enforced at every layer.

### Rule 1: `restaurant_id` on Every Tenant Table
Every table containing restaurant-specific data MUST have a `restaurant_id UUID NOT NULL` column. There are no exceptions. A table without this column is either a platform-global table (e.g., `platform_settings`) or a join table.

### Rule 2: RLS on Every Tenant Table
Every tenant table MUST have an active RLS policy. Disabling RLS for performance is forbidden. Use Supabase indexes and `EXPLAIN ANALYZE` to resolve performance issues instead.

### Rule 3: No Cross-Tenant Queries from the Client
The client (browser/PWA) MUST never be able to query data across `restaurant_id` boundaries. All cross-tenant operations (e.g., platform analytics) are performed server-side via Supabase Edge Functions using the service role key.

### Rule 4: `restaurant_id` Passed, Never Assumed
When writing any function, component, or query, the `restaurant_id` MUST be explicitly passed as a parameter. Do NOT infer `restaurant_id` from a global store, URL, or context without explicitly validating it against the authenticated user's profile in the database.

### Rule 5: The Storefront Slug-to-ID Resolution
The `restaurant_slug` in the URL is a public-facing identifier. The first operation of any storefront page load MUST resolve `restaurant_slug → restaurant_id` and pass the `restaurant_id` to all child queries. Cache the resolved `restaurant_id` for the duration of the session.

---

## 9. Performance & Infrastructure Constraints

These are first-class product requirements, not engineering preferences.

| Constraint | Target | Enforcement |
|---|---|---|
| Initial page load (Storefront) | < 2MB total transfer | Lighthouse CI in build pipeline |
| Time to Interactive (Storefront) | < 3 seconds on simulated 4G | Lighthouse CI |
| Images | WebP format, lazy-loaded, CDN-served | Next.js `Image` component, Supabase Storage CDN |
| Bundle splitting | Route-based code splitting | Next.js default; audit with `@next/bundle-analyzer` |
| Offline order queue (Merchant Dashboard) | Last 50 orders cached | IndexedDB via `idb` library |
| Supabase Realtime reconnect | Auto-reconnect with backoff | Handle `CLOSED` channel state explicitly |
| Font loading | Preload critical fonts; `font-display: swap` | CSS + `<link rel="preload">` |
| Third-party scripts | Zero on storefront critical path | Paystack SDK loaded async post-interaction |

### Nigeria-Specific Optimizations

- **Image sizes:** Menu item images must be compressed to < 80KB per image before storage. Enforce this in the upload pipeline via Sharp or Supabase Edge Function image processing.
- **SMS over Push:** Rely on SMS for critical notifications (order updates) rather than push notifications. SMS delivery is more reliable on Nigerian networks.
- **Avoid WebSockets for non-critical data:** Use Supabase Realtime only for order queue (high value). Use standard REST polling for analytics and reports.
- **Cache static storefront data:** Menu data changes infrequently. Cache menu API responses for 60 seconds via Next.js `revalidate`. Use `stale-while-revalidate` for instant repeat visits.

---

## 10. Security Model

### Authentication
- **Customers (checkout):** No authentication required. Phone number + name collected at checkout. No OTP, no session.
- **Customers (order history / account):** Optional Supabase Auth via Phone OTP. Session stored in `localStorage`. 24-hour session expiry. Opt-in only — prompted post-order, never as a gate.
- **Merchants:** Email + Password. Session stored in `httpOnly` cookie via Supabase SSR Auth helpers. 7-day session with sliding expiry.
- **Super Admin:** Email + Password + TOTP MFA enforced at the Supabase level. IP allowlist recommended (Phase 2).
- **Platform Riders:** Phone OTP via Supabase Auth. Session in `expo-secure-store` (React Native). 30-day session.

### Secret Management
- Paystack Secret Key: Supabase Vault or environment variable. Never in database. Never on client.
- Termii/Twilio credentials: Same as above.
- Third-party dispatch API keys: Same as above.
- All secrets accessed only within Supabase Edge Functions.

### Input Validation
- All user inputs (addresses, special instructions, names) sanitized server-side before database insertion.
- Paystack webhook: Validate HMAC-SHA512 signature on every request (see 7.2.2).
- Phone number normalization: Enforce E.164 format on input before storage.

### Audit Logging
- All Super Admin actions (merchant creation, impersonation, refunds) logged to `audit_logs` table: `actor_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`.

---

## 11. Integrations Reference

### Paystack
- **Docs:** https://paystack.com/docs/api/
- **Endpoints used:** Initialize Transaction, Verify Transaction, Refund
- **Webhook event:** `charge.success`
- **Keys:** `PAYSTACK_PUBLIC_KEY` (client-safe), `PAYSTACK_SECRET_KEY` (server-only)
- **Currency:** NGN (amounts in kobo)

### Termii
- **Docs:** https://developers.termii.com/
- **Endpoint:** `https://api.ng.termii.com/api/sms/send`
- **Auth:** API key in request body
- **Key:** `TERMII_API_KEY` (server-only)

### Twilio (Fallback)
- **Auth:** Account SID + Auth Token
- **Keys:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (server-only)

### Resend (Email)
- **Docs:** https://resend.com/docs
- **Use cases:** Merchant onboarding emails, password reset, Super Admin alerts
- **Templates:** Built with React Email (`/packages/email-templates`)
- **Key:** `RESEND_API_KEY` (server-only)

### Expo EAS (Rider App Build & Distribution)
- **Docs:** https://docs.expo.dev/eas/
- **Build:** EAS Build for iOS (.ipa) and Android (.apk/.aab) binaries
- **Updates:** EAS Update for OTA JavaScript updates without App Store re-submission
- **Push notifications:** Expo Push Notification Service → FCM (Android) / APNs (iOS)

### Third-Party Dispatch (Placeholder — Mode C)
- Provider TBD (Kwik Delivery, Gokada, or direct negotiation)
- Integration interface: standardised adapter pattern so provider can be swapped without changing core logistics logic.
- Required API capabilities: create delivery, get status, webhook/poll for status updates.

---

## 12. MVP Success Metrics

These metrics define a successful MVP pilot. They are measurable and time-bound.

| Metric | Target | Measurement Method |
|---|---|---|
| Dashboard Stickiness | ≥ 3 merchant logins/day | `user_profiles` session logs, first 30 days |
| Commission Savings | ≥ ₦100,000 saved/merchant in Month 1 | (Orders through platform × avg commission rate on aggregators) |
| Customer Data Growth | ≥ 100 unique customer profiles per merchant | `COUNT(*) FROM customers WHERE restaurant_id = [id]` |
| Payment Success Rate | ≥ 95% of initiated transactions complete | `payments` table success ratio |
| Page Load (Storefront) | < 2MB / < 3s TTI | Lighthouse CI |
| Order Cancellation Rate | < 5% | `orders WHERE status = 'cancelled'` ratio |

---

## 13. Out of Scope (v1)

The following features are explicitly excluded from the MVP build. Do not implement them. Do not build architecture that assumes them.

- Native iOS/Android app store applications for customers or merchants (storefront and dashboard are PWAs only)
- Points-based loyalty programs
- AI-powered menu recommendations
- Distance-based dynamic delivery fee calculation (use flat rate for MVP)
- Custom domain support (CNAME to platform)
- Multi-location support per merchant (one restaurant = one account for MVP)
- In-app chat between customer and merchant
- Scheduled/advance orders
- Table QR code ordering (dine-in)
- Platform-level marketplace / restaurant discovery page
- Subscription/recurring orders
- GPS-proximity-based rider assignment (MVP uses load balancing; proximity is Phase 2)
- Live customer-facing rider map tracking (Phase 2)
- Platform rider payout/withdrawal system (tracked in earnings, payout mechanism is Phase 2)
- Rider exclusivity or employment contracts (riders are independent, non-exclusive network participants)

---

## 14. Open Questions & Decision Log

| ID | Question | Status | Decision | Date |
|---|---|---|---|---|
| OQ-001 | Which third-party dispatch provider to integrate first (Kwik, Gokada, or other)? | Open | — | — |
| OQ-002 | What is the platform's SaaS pricing model (flat monthly fee, per-order fee, or revenue share)? | Open | — | — |
| OQ-003 | Does the Rider App need to be built in-house, or can it be deferred to a Phase 2 contracted team? | Open | — | — |
| OQ-004 | Should the Super Admin dashboard support multiple admin users with role-based access, or is single super_admin sufficient for MVP? | Open | — | — |
| OQ-005 | Cash on Delivery (COD) — is it required for MVP pilot restaurants? | Open | — | — |
| OQ-006 | Platform rider payout mechanism — bank transfer, wallet, or manual? What is the per-delivery fee structure? | Open | — | — |
| DL-001 | PWA for merchant dashboard instead of native app | Decided | Faster to market; merchant persona is comfortable with mobile web; revisit for Phase 2 | 2026-02-26 |
| DL-002 | Supabase as primary backend | Decided | Realtime built-in, RLS native, fast iteration; acceptable vendor dependency at this stage | 2026-02-26 |
| DL-003 | Expo (React Native) for Rider App over Flutter | Decided | Shared React mental model with web team; OTA updates without App Store resubmission; battle-tested location/notification libraries | 2026-03-09 |
| DL-004 | Turborepo monorepo for web + rider app + shared packages | Decided | Shared Supabase types, utilities, and constants across apps; single repo simplifies CI | 2026-03-09 |
| DL-005 | No OTP gate on customer checkout | Decided | OTP friction kills conversion, especially on Nigerian mobile networks; phone number collected frictionlessly; OTP offered post-order as opt-in only | 2026-03-09 |
| DL-006 | Platform-owned rider network instead of third-party logistics dependency | Decided | Competitive moat; recruits existing Chowdeck/Glovo riders without exclusivity; positions logistics as platform value-add, not dependency | 2026-03-09 |
| DL-007 | Resend + React Email added to stack for transactional email | Decided | Required for merchant onboarding, password reset, admin alerts; clean Next.js integration | 2026-03-09 |

---

*This document is a living specification. All material changes require a version bump and a new entry in the Decision Log.*
