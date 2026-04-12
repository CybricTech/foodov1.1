# Claude Code Task: WhatsApp Merchant Order Alerts

## Context

Multi-tenant restaurant SaaS platform. Turborepo monorepo, Next.js 14 + Supabase + TypeScript.

**Existing notification infrastructure:**
- `supabase/functions/send-sms/index.ts` — Deno Edge Function that sends SMS via Termii
  (primary) with Twilio fallback. Handles multiple event types including `new_order_merchant`.
- `apps/web/app/api/webhooks/paystack/route.ts` — calls `send-sms` twice after order
  creation: once for customer confirmation, once for merchant new order alert.
- `sms_logs` table — logs every notification attempt with status, provider, event_type.

**What we're changing:**
- Replace the merchant `new_order_merchant` SMS with a rich WhatsApp message via Termii's
  WhatsApp channel.
- Customer SMS notifications (order_confirmed etc.) stay exactly as they are — untouched.
- The WhatsApp message goes to a merchant-configured WhatsApp number stored on the restaurant.
- If no WhatsApp number is set, fall back to SMS on the restaurant's `phone` field.

**Termii WhatsApp API** — Termii supports WhatsApp as a channel. The API call is identical
to SMS but with `channel: "whatsapp"` instead of `channel: "generic"`. The `from` field
must be a pre-approved WhatsApp sender ID or phone number registered with Termii.
Endpoint: `https://api.ng.termii.com/api/sms/send`

---

## PHASE 1 — Database Migration

### Migration `020_merchant_whatsapp.sql`

Add WhatsApp number field to restaurants table:

```sql
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

COMMENT ON COLUMN restaurants.whatsapp_number IS
  'Merchant WhatsApp number for order alerts (E.164 format, e.g. +2348012345678). 
   If set, order alerts go via WhatsApp instead of SMS.';
```

Also add `channel` column to `sms_logs` to track whether a notification was sent via
SMS or WhatsApp:

```sql
ALTER TABLE sms_logs
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('sms', 'whatsapp'));
```

---

## PHASE 2 — Update send-sms Edge Function

File: `supabase/functions/send-sms/index.ts`

### Changes:

**1. Add `whatsapp_number` to the restaurant fetch:**
```typescript
const { data: restaurant } = await supabase
  .from('restaurants')
  .select('name, phone, whatsapp_number')
  .eq('id', restaurantId)
  .single();
```

**2. For `new_order_merchant` events, fetch full order details:**

When `eventType === 'new_order_merchant'`, fetch the complete order with items so we
can build a rich WhatsApp message:

```typescript
const { data: order } = await supabase
  .from('orders')
  .select(`
    id,
    order_number,
    customer_name,
    customer_phone,
    fulfillment_type,
    delivery_address,
    special_instructions,
    subtotal_kobo,
    delivery_fee_kobo,
    total_kobo,
    order_items (
      item_name,
      quantity,
      line_total_kobo,
      selected_options
    )
  `)
  .eq('id', orderId)
  .single();
```

**3. Build a rich WhatsApp message for merchant new order alerts:**

Replace the simple `new_order_merchant` message in `buildMessage()` with a detailed
formatter. The message should be clear, readable on a phone screen, and use WhatsApp
formatting (bold with *asterisks*, line breaks):

```
🍽️ *New Order #ORD-XXXXX*

👤 *Customer:* John Doe
📞 *Phone:* +2348012345678

📦 *Items:*
• Jollof Rice x2 — ₦3,600
• Chicken Suya x1 — ₦2,500
• Zobo Drink x1 — ₦800

🏠 *Fulfillment:* Delivery
📍 *Address:* 15 Adeola Odeku Street, Victoria Island, Lagos

📝 *Special Instructions:* Extra spicy please

💰 *Subtotal:* ₦6,900
🚚 *Delivery Fee:* ₦2,800
💳 *Total Paid:* ₦9,700
```

If fulfillment_type is "pickup", replace the delivery section with:
```
🏠 *Fulfillment:* Pickup (customer will collect)
```

If no special instructions, omit that line entirely.

For selected_options on items — if an item has options selected (e.g. size, extras),
show them indented under the item:
```
• Grilled Chicken x1 — ₦4,500
  ↳ Size: Large
  ↳ Extra: Coleslaw
```

**4. Add `sendViaTermiiWhatsApp` function:**

```typescript
async function sendViaTermiiWhatsApp(
  phone: string,
  message: string
): Promise<boolean> {
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: phone,
      from: TERMII_SENDER_ID,
      sms: message,
      type: 'plain',
      api_key: TERMII_API_KEY,
      channel: 'whatsapp',  // <-- key difference from SMS
    }),
  });

  if (res.status === 429) return false;
  const body = await res.json().catch(() => ({}));
  return res.ok && body.code !== 'err';
}
```

**5. Update the routing logic for `new_order_merchant`:**

```typescript
// For merchant new order alerts:
if (eventType === 'new_order_merchant') {
  const whatsappNumber = restaurant?.whatsapp_number;
  
  if (whatsappNumber) {
    // Send rich WhatsApp message to merchant's WhatsApp number
    const whatsappMessage = buildWhatsAppOrderMessage(order, restaurantName);
    sent = await sendViaTermiiWhatsApp(whatsappNumber, whatsappMessage);
    provider = 'termii';
    channel = 'whatsapp';
    
    // If WhatsApp fails, fall back to SMS on the same number
    if (!sent) {
      const simpleMessage = buildMessage(eventType, orderNumber, restaurantName);
      sent = await sendViaTermii(whatsappNumber, simpleMessage);
      channel = 'sms';
    }
  } else {
    // No WhatsApp number — fall back to SMS on restaurant phone
    recipientPhone = restaurant?.phone ?? undefined;
    if (recipientPhone) {
      const simpleMessage = buildMessage(eventType, orderNumber, restaurantName);
      sent = await sendViaTermii(recipientPhone, simpleMessage);
      channel = 'sms';
    }
  }
} else {
  // All other events (customer notifications) — existing SMS logic unchanged
  // ... existing Termii → Twilio fallback logic
}
```

**6. Update sms_logs insert to include channel:**
```typescript
await supabase.from('sms_logs').insert({
  // ... existing fields ...
  channel: channel, // 'whatsapp' or 'sms'
});
```

---

## PHASE 3 — Merchant Dashboard Settings

File: `apps/web/components/dashboard/settings-client.tsx`

### Add WhatsApp Number field to the existing settings form

In the contact/notification section of the settings form, add a WhatsApp number field:

**UI:**
- Label: "WhatsApp Alert Number"
- Input: phone number field with a WhatsApp icon (use the phone icon from lucide-react
  since there's no WhatsApp icon — or use a 📱 emoji in the label)
- Placeholder: "+2348012345678"
- Helper text: "Order alerts will be sent to this WhatsApp number. Must be in international
  format (e.g. +2348012345678)"
- Show a green WhatsApp badge next to the field if a number is already saved:
  "✓ WhatsApp alerts active"
- If empty, show: "No WhatsApp number set — alerts will be sent via SMS"

**Validation:**
- Must start with + followed by digits
- Must be between 10 and 15 characters
- Nigerian numbers: +234XXXXXXXXXX format

**Save:** Include `whatsapp_number` in the existing settings PATCH call. The settings
form already has a save mechanism — just add this field to it.

### Update the settings API route

File: `apps/web/app/api/merchant/settings/route.ts` (or wherever merchant settings
are saved — find the correct route that handles the settings form PATCH)

Add `whatsapp_number` to the accepted fields:
```typescript
whatsapp_number: z.string().regex(/^\+[0-9]{9,14}$/).nullable().optional(),
```

Save it to `restaurants.whatsapp_number`.

---

## PHASE 4 — Admin WhatsApp Alert Number

### Migration `020_merchant_whatsapp.sql` (extend the same migration)

Add an admin-level WhatsApp alert number to `platform_settings`:

```sql
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS admin_whatsapp_number TEXT;

COMMENT ON COLUMN platform_settings.admin_whatsapp_number IS
  'Platform admin WhatsApp number. Receives a copy of every new order alert
   across all restaurants on the platform. E.164 format.';
```

### Update `send-sms` Edge Function for admin copy

After sending the merchant WhatsApp alert (or SMS fallback), always send a second
copy to the admin WhatsApp number if it is set in `platform_settings`.

Fetch admin number alongside platform settings:
```typescript
const { data: platformSettings } = await supabase
  .from('platform_settings')
  .select('admin_whatsapp_number')
  .single();

const adminWhatsappNumber = platformSettings?.admin_whatsapp_number;
```

The admin message should be the same rich WhatsApp message as the merchant receives,
but with the restaurant name prepended so the admin knows which restaurant the order
is from:

```
🏪 *[Restaurant Name]*

🍽️ *New Order #ORD-XXXXX*

👤 *Customer:* John Doe
📞 *Phone:* +2348012345678

📦 *Items:*
• Jollof Rice x2 — ₦3,600
• Chicken Suya x1 — ₦2,500

🏠 *Fulfillment:* Delivery
📍 *Address:* 15 Adeola Odeku Street, Lagos

💰 *Subtotal:* ₦6,900
🚚 *Delivery Fee:* ₦2,800
💳 *Total Paid:* ₦9,700
```

Send this as a fire-and-forget after the merchant notification:
```typescript
if (adminWhatsappNumber && eventType === 'new_order_merchant') {
  const adminMessage = buildAdminWhatsAppOrderMessage(order, restaurantName);
  sendViaTermiiWhatsApp(adminWhatsappNumber, adminMessage).catch(console.error);
  // Log to sms_logs with restaurant_id of the originating restaurant
}
```

### Admin Dashboard Settings UI

File: `apps/web/components/admin/settlements-client.tsx` or the admin settings section

Add an **"Admin Notifications"** panel in the admin dashboard alongside the existing
service charge and delivery pricing config panels:

- Label: "Admin WhatsApp Alert Number"
- Input: phone number field
- Placeholder: "+2348012345678"  
- Helper text: "All new orders from all restaurants will be sent to this number"
- Show green badge "✓ Active — receiving all order alerts" if a number is saved
- Save button calls `PATCH /api/admin/platform-settings` with `{ admin_whatsapp_number }`

### Update `PATCH /api/admin/platform-settings/route.ts`

Add `admin_whatsapp_number` to the accepted fields:
```typescript
admin_whatsapp_number: z.string().regex(/^\+[0-9]{9,14}$/).nullable().optional(),
```

### Admin Merchants List

File: `apps/web/components/admin/merchants-client.tsx`

In the merchants list table, add a WhatsApp status indicator column:
- 💬 green badge "WhatsApp" if `whatsapp_number` is set
- "SMS only" in grey if not set

This helps the admin quickly see which merchants have WhatsApp alerts configured
and can prompt unset merchants to add their number during onboarding.

---

## PHASE 5 — Deploy Updated Edge Function

After all code changes, deploy the updated send-sms function:
```bash
npx supabase functions deploy send-sms
```

---

## Implementation Order

1. **Migration `020_merchant_whatsapp.sql`** — add `whatsapp_number` to restaurants,
   `admin_whatsapp_number` to platform_settings, `channel` to sms_logs
2. **Update `send-sms` Edge Function** — add WhatsApp routing, rich message builder,
   full order fetch, merchant alert, admin copy
3. **Deploy Edge Function** — `npx supabase functions deploy send-sms`
4. **Merchant settings UI** — add WhatsApp number field with validation and status badge
5. **Update merchant settings API** — accept and save `whatsapp_number`
6. **Update `PATCH /api/admin/platform-settings`** — accept and save `admin_whatsapp_number`
7. **Admin notifications panel** — add WhatsApp number field in admin dashboard settings
8. **Admin merchants list** — add WhatsApp status indicator column
9. **Regenerate types** — `npx supabase gen types typescript --project-id hcyxbmfbyvgybriloffo > packages/database/src/types.ts`
10. **Push and deploy**

---

## Key Rules

- **Customer SMS notifications are untouched** — only `new_order_merchant` event type
  changes. Do not modify any customer-facing notification logic.
- **WhatsApp number is optional on both levels** — if merchant has no WhatsApp number,
  fall back to SMS on restaurant phone. If admin number is not set, skip silently.
  Never block order creation if any notification fails.
- **Admin alert is always a copy** — it fires after the merchant alert regardless of
  whether the merchant alert succeeded or failed. Two independent fire-and-forget calls.
- **All notification calls remain fire-and-forget** — wrap in `.catch(console.error)`,
  never await in the webhook critical path.
- **Phone format** — always store and send in E.164 format (+234XXXXXXXXXX).
  Validate on save in both the merchant and admin settings forms.
- **Rich message only for WhatsApp** — if falling back to SMS, use the simple
  existing `buildMessage()` format. SMS has a 160 character limit; the rich message
  will exceed it.
- **sms_logs channel field** — always log whether the notification went via 'whatsapp'
  or 'sms' so the admin can see delivery channel in the SMS logs page.
- **Admin copy logs** — log the admin WhatsApp alert in sms_logs as well, using the
  originating restaurant_id and order_id so it's traceable.