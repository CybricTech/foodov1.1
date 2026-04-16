# Claude Code Task: Email Order Notifications via Resend

## Context

Multi-tenant restaurant SaaS platform (Kitchyn). Turborepo monorepo, Next.js 14 +
Supabase + TypeScript. Currency stored in kobo (NGN × 100).

**Existing infrastructure:**
- `supabase/functions/send-email/index.ts` — Deno Edge Function that sends email via
  Resend. Already has templates for merchant-onboarding, password-reset, super-admin-alert.
  Uses `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars.
- `supabase/functions/send-sms/index.ts` — handles SMS/WhatsApp notifications. The
  `new_order_merchant` event currently tries WhatsApp/SMS but is pending Termii approval.
- `apps/web/app/api/webhooks/paystack/route.ts` — fires send-sms after order creation.
  This is where we need to also fire send-email.

**Environment variables already set:**
- `RESEND_API_KEY` — real Resend API key, verified and funded
- `RESEND_FROM_EMAIL` — currently set to `no-reply@foodo.ng` (needs updating)

**Sending domain:** `admin@cybric.tech` — verified in Resend dashboard.

---

## Task: Implement Email Order Notifications

Add two email notifications that fire on every new order:
1. **Merchant alert** — sent to the restaurant's registered email address
2. **Admin alert** — sent to a configurable admin email in platform_settings

Both fire alongside the existing SMS/WhatsApp notifications — email is an additional
channel, not a replacement.

---

## PHASE 1 — Database Migration

### Migration `023_admin_alert_email.sql`

Add admin alert email to platform_settings:

```sql
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS admin_alert_email TEXT;

COMMENT ON COLUMN platform_settings.admin_alert_email IS
  'Platform admin email address. Receives a copy of every new order 
   alert across all restaurants. If null, no admin email is sent.';
```

Also add `email` column to restaurants if not already present (for merchant
alert destination):

```sql
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS notification_email TEXT;

COMMENT ON COLUMN restaurants.notification_email IS
  'Email address for order alert notifications. Falls back to the 
   merchant owner email from user_profiles if not set.';
```

---

## PHASE 2 — Update send-email Edge Function

File: `supabase/functions/send-email/index.ts`

### Changes:

**1. Update RESEND_FROM to use cybric.tech:**
```typescript
const RESEND_FROM = Deno.env.get('RESEND_FROM_EMAIL') ?? 'admin@cybric.tech';
```

**2. Add `new_order_merchant` and `new_order_admin` templates to buildHtml():**

The merchant email template should be clean, mobile-friendly HTML showing:

```
Subject: 🍽️ New Order #ORD-XXXXX — [Restaurant Name]

Body:
- Kitchyn header (use #1a1a2e as header background, white text)
- "New Order Received!" heading
- Order number + timestamp
- Customer details: Name, Phone
- Items table: Item name | Qty | Price
  - Show selected options indented under each item
- Fulfillment type (Delivery or Pickup)
- Delivery address (if delivery)
- Special instructions (if any)
- Price breakdown:
    Subtotal:      ₦X,XXX
    Delivery fee:  ₦X,XXX  (show only if delivery)
    VAT:           ₦X,XXX  (show only if > 0)
    Service fee:   ₦X,XXX
    ─────────────────────
    Total Paid:    ₦X,XXX
- Footer: "Powered by Kitchyn"
```

The admin email template is identical but adds the restaurant name prominently
at the top so the admin knows which restaurant the order is from:

```
Subject: 🏪 [Restaurant Name] — New Order #ORD-XXXXX

Body:
- Same as merchant template but with restaurant name as first line
```

**3. Update EmailPayload interface:**
```typescript
interface EmailPayload {
  template: 
    | 'merchant-onboarding' 
    | 'password-reset' 
    | 'super-admin-alert'
    | 'new_order_merchant'
    | 'new_order_admin';
  to: string;
  props: Record<string, unknown>;
}
```

The `props` for order emails should include:
```typescript
{
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: 'delivery' | 'pickup';
  deliveryAddress?: string;
  specialInstructions?: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number; // in kobo
    options?: Array<{
      optionName: string;
      choices: Array<{ choiceName: string; priceModifier: number }>;
    }>;
  }>;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  vatKobo: number;
  serviceFeeKobo: number;
  totalKobo: number;
  createdAt: string;
}
```

**4. Add formatKobo helper inside the edge function:**
```typescript
function formatKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}
```

---

## PHASE 3 — Update Paystack Webhook

File: `apps/web/app/api/webhooks/paystack/route.ts`

After the existing SMS fire-and-forget calls (step 9), add email notifications
as additional fire-and-forget calls.

**Fetch merchant email:**
The merchant email comes from either:
1. `restaurants.notification_email` if set
2. Otherwise fetch from `user_profiles` where `restaurant_id = restaurantId` 
   and `role = 'merchant_owner'` → use their `email`

**Fetch admin email:**
From `platform_settings.admin_alert_email`

**Fire email notifications:**
```typescript
const edgeEmailUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;

// Merchant order alert email
if (merchantEmail) {
  fetch(edgeEmailUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'new_order_merchant',
      to: merchantEmail,
      props: {
        restaurantName,
        orderNumber: order.order_number,
        customerName: meta.customer_name,
        customerPhone: meta.customer_phone,
        fulfillmentType: meta.fulfillment_type,
        deliveryAddress: meta.delivery_address ?? null,
        specialInstructions: meta.special_instructions ?? null,
        items: meta.items,
        subtotalKobo: meta.subtotal_kobo,
        deliveryFeeKobo: meta.delivery_fee_kobo,
        vatKobo: meta.vat_kobo ?? 0,
        serviceFeeKobo: meta.service_fee_kobo ?? 0,
        totalKobo: meta.subtotal_kobo + meta.delivery_fee_kobo,
        createdAt: new Date().toISOString(),
      },
    }),
  }).catch(console.error);
}

// Admin order alert email
if (adminAlertEmail) {
  fetch(edgeEmailUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'new_order_admin',
      to: adminAlertEmail,
      props: {
        // same as merchant props above
      },
    }),
  }).catch(console.error);
}
```

---

## PHASE 4 — Admin Dashboard Settings

File: `apps/web/components/admin/settlements-client.tsx` (or wherever the
admin notifications panel is)

Add **"Email Notifications"** section to the existing Admin Notifications panel
alongside the WhatsApp number field:

- Label: "Admin Alert Email"
- Input: email field
- Placeholder: "admin@cybric.tech"
- Helper text: "All new orders from all restaurants will be sent to this email"
- Show green badge "✓ Active" if an email is saved
- Save via existing `PATCH /api/admin/platform-settings`

### Update `PATCH /api/admin/platform-settings/route.ts`

Add `admin_alert_email` to accepted fields:
```typescript
admin_alert_email: z.string().email().nullable().optional(),
```

---

## PHASE 5 — Merchant Dashboard Settings

File: `apps/web/components/dashboard/settings-client.tsx`

Add **"Notification Email"** field to the existing settings form:

- Label: "Order Alert Email"
- Input: email field  
- Placeholder: "orders@yourrestaurant.com"
- Helper text: "New order alerts will be sent to this email address"
- Show green badge "✓ Email alerts active" if set
- If empty: "No notification email set"
- Save via existing merchant settings PATCH, include `notification_email` field

### Update merchant settings API route

Add `notification_email` to accepted fields:
```typescript
notification_email: z.string().email().nullable().optional(),
```

---

## PHASE 6 — Update Supabase Secret

Update `RESEND_FROM_EMAIL` secret to use cybric.tech:
```bash
npx supabase secrets set RESEND_FROM_EMAIL=admin@cybric.tech
```

---

## PHASE 7 — Deploy Edge Function

```bash
npx supabase functions deploy send-email
```

---

## Implementation Order

1. **Migration `023_admin_alert_email.sql`** — add admin_alert_email to 
   platform_settings, notification_email to restaurants
2. **Update send-email Edge Function** — add new_order_merchant and 
   new_order_admin templates with full HTML
3. **Update Paystack webhook** — fetch merchant + admin emails, fire 
   email notifications fire-and-forget after order creation
4. **Update PATCH /api/admin/platform-settings** — accept admin_alert_email
5. **Admin notifications panel** — add email field alongside WhatsApp field
6. **Merchant settings** — add notification_email field
7. **Update RESEND_FROM_EMAIL secret** — set to admin@cybric.tech
8. **Deploy send-email edge function** — `npx supabase functions deploy send-email`
9. **Regenerate types** — `npx supabase gen types typescript --project-id hcyxbmfbyvgybriloffo > packages/database/src/types.ts`
10. **Push and deploy to Vercel**

---

## Key Rules

- **Email is additive** — fires alongside SMS/WhatsApp, never replaces it
- **All email calls are fire-and-forget** — `.catch(console.error)`, never 
  awaited in the webhook critical path
- **Never block order creation** if email fails
- **From address must be** `admin@cybric.tech` — this domain is verified in Resend
- **Merchant email resolution order:**
  1. `restaurants.notification_email` if set
  2. `user_profiles.email` where role = 'merchant_owner' for this restaurant
  3. Skip if neither found — don't error
- **Admin email:** only send if `platform_settings.admin_alert_email` is set
- **HTML emails must be mobile-friendly** — max-width 600px, inline styles only
  (email clients don't support external CSS)
- **All amounts displayed in naira** — divide kobo by 100 for display
- **Update all "Foodo" references** in the send-email function to "Kitchyn"
