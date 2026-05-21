# Foodo: System Architecture & Design Document

## 1. Overview
Foodo is a Multi-Tenant White-Label Online Ordering & Growth Marketing Platform tailored for mid-to-high-end independent restaurants in Nigeria. It eliminates the heavy commission burden of aggregators by providing a restaurant-owned storefront, an integrated CRM, and a flexible logistics engine.

## 2. Technical Stack & Monorepo Structure
The project is structured as a **Turborepo** monorepo to maximize code reuse and developer velocity.

### Applications
- `apps/web`: **Next.js 14+ (App Router)**. This single application serves the Consumer Storefront PWA, the Merchant Dashboard PWA, and the Super Admin Panel using dynamic routing based on `[restaurant_slug]`.

### Shared Packages
- `packages/database`: Supabase-generated TypeScript definitions and shared query helpers.
- `packages/ui`: Shared React/Tailwind UI components.
- `packages/utils`: Global utilities (e.g., E.164 phone formatting, currency conversions).
- `packages/email-templates`: React Email components for Resend.

## 3. Backend Architecture (Supabase)
The entire backend operates on **Supabase (PostgreSQL)**, removing the need for a standalone Node.js API server.
- **Data Isolation**: Multi-tenancy is enforced natively via PostgreSQL **Row-Level Security (RLS)**. All tables are strictly scoped by `restaurant_id` unless the user is a `super_admin`.
- **Authentication**: Supabase Auth handles Phone OTP for riders/customers and Email/Password for merchants. Checkout is frictionless and does not force account creation.
- **Realtime**: Supabase Realtime drives the Merchant Dashboard order queue and Rider App dispatch assignments.
- **Storage**: Supabase Storage serves menu images and restaurant logos via CDN.
- **Edge Functions**: Used exclusively for third-party webhooks (Paystack) and SMS dispatching. Background tasks run on `pg_cron`.

## 4. Key Integrations
- **Payments**: **Paystack**. Integrated via popup for the client and a secure Edge Function webhook for server-side verification and order confirmation.
- **SMS**: **Termii** (primary for Nigeria delivery rates) with a **Twilio** fallback mechanism.
- **Emails**: **Resend** combined with React Email.

## 5. Core Data Entities
- `restaurants`: The canonical tenant. Defines branding (`primary_color`, `logo_url`), configuration, and operating logic.
- `user_profiles`: Extends Supabase Auth users. Roles include `customer`, `merchant_owner`, `merchant_staff`, `platform_rider`, and `super_admin`.
- `menu_items` & `menu_categories`: Inventory configuration with options/modifiers.
- `orders` & `order_items`: The transactional backbone.
- `customers`: A CRM record generated frictionlessly via phone number during checkout, regardless of whether the user creates an account.
- `delivery_assignments`: The dispatch record linking orders to logistics modes.

## 6. The Three-Mode Logistics Engine
A core differentiator is the logistics capability, controlled via `delivery_assignments`:
- **Mode A (Platform Rider)**: Automatically assigns orders to the closest available platform-owned rider. Riders use the Expo app to update statuses and stream GPS coordinates.
- **Mode B (Own Rider)**: Generates a secure, temporary `/delivery/[token]` shareable link via WhatsApp for the restaurant's in-house rider. Status is manually progressed by the merchant.
- **Mode C (Third-Party)**: Edge Function integration to external APIs (e.g., Kwik, Gokada).

## 7. Frontend State & Performance
- **Client State**: **Zustand** manages the Cart across sessions (persisted to `localStorage`).
- **Server State**: **TanStack Query** (React Query) handles caching, background refetches, and optimistic updates for dashboard mutations.
- **Styling**: **Tailwind CSS**. White-labeling is achieved dynamically through CSS variables mapped to the restaurant's `primary_color`.
- **Performance Guidelines**: Storefront initial payload is strictly kept under 2MB to accommodate bandwidth-constrained environments. The Merchant Dashboard is built with offline resilience, caching the latest order queue so disconnects do not clear the screen.
