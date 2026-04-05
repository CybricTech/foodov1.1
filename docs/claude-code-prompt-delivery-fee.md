# Claude Code Task: Dynamic Delivery Fee Calculation

## Context

This is a multi-tenant restaurant SaaS platform (Turborepo monorepo). Stack: Next.js 14
(App Router) + Supabase + TypeScript + Tailwind + Zustand. Currency stored in kobo (NGN × 100).

**Relevant existing files:**
- `apps/web/app/[restaurant_slug]/checkout/page.tsx` — checkout UI (currently has a free-text `deliveryAddress` field)
- `apps/web/app/api/checkout/initialize/route.ts` — computes total, creates payment record. Currently uses `restaurant.delivery_fee` (a flat BIGINT field on restaurants table)
- `packages/utils/src/constants.ts` — shared enums
- `packages/database/src/types.ts` — Supabase generated types

**Environment variables already set:**
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — browser-safe key (for Places Autocomplete)
- `GOOGLE_MAPS_API_KEY` — server-side key (for Distance Matrix API calls)

---

## Task: Implement Distance-Based Delivery Fee

Replace the current flat `delivery_fee` field with a dynamic distance-based fee calculated
using Google Maps Distance Matrix API. The fee is calculated server-side and shown to the
customer at checkout before they pay.

---

## Pricing Formula

The formula is fully admin-configurable — all four pricing parameters are stored in the
`platform_settings` table and fetched at runtime. The constants in `packages/utils/src/constants.ts`
are fallback defaults only, used if the DB fetch fails.

```
delivery_fee_kobo = BASE_FEE + (distance_km * PER_KM_RATE)
capped at MAX_FEE, blocked if distance > MAX_RADIUS_KM
```

**Default values (seeded into platform_settings):**
- Base fee: ₦2,300 (230,000 kobo)
- Per km rate: ₦150/km (15,000 kobo/km)
- Max radius: 25km
- Max fee cap: ₦15,000 (1,500,000 kobo)

**Examples at defaults:**
- 2km → ₦2,300 + ₦300 = ₦2,600
- 5km → ₦2,300 + ₦750 = ₦3,050
- 10km → ₦2,300 + ₦1,500 = ₦3,800
- 20km → ₦2,300 + ₦3,000 = ₦5,300

---

## Database Changes

### Migration `018_delivery_pricing.sql`

Add coordinates to restaurants table (needed for distance calculation origin):

```sql
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS latitude   NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude  NUMERIC(10, 7);
```

Remove the old flat `delivery_fee` dependency — the column can stay for backward compat
but the app will no longer use it as the source of truth for checkout. Add a comment:

```sql
COMMENT ON COLUMN restaurants.delivery_fee IS 
  'DEPRECATED: Use dynamic distance-based pricing via /api/delivery/fee endpoint instead';
```

Also add `delivery_distance_km` and `delivery_fee_kobo_calculated` snapshot columns to
`orders` so we record what was charged and the distance at time of order:

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_distance_km        NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS delivery_fee_kobo_calculated BIGINT;
```

### Migration `019_delivery_pricing_settings.sql`

Add delivery pricing config columns to the existing `platform_settings` singleton table
so the admin can control the formula from the dashboard:

```sql
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS delivery_base_fee_kobo    BIGINT NOT NULL DEFAULT 230000,
  ADD COLUMN IF NOT EXISTS delivery_per_km_rate_kobo BIGINT NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS delivery_max_radius_km    INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS delivery_max_fee_kobo     BIGINT NOT NULL DEFAULT 1500000;

-- Update the existing singleton row with defaults
UPDATE platform_settings SET
  delivery_base_fee_kobo    = 230000,
  delivery_per_km_rate_kobo = 15000,
  delivery_max_radius_km    = 25,
  delivery_max_fee_kobo     = 1500000
WHERE delivery_base_fee_kobo IS NULL;
```

---

## New API Route: Calculate Delivery Fee

### `apps/web/app/api/delivery/fee/route.ts`

**Method:** GET
**Query params:** `restaurantId`, `destinationAddress`

This route:
1. Fetches pricing config from `platform_settings` (falls back to constants if DB fails)
2. Fetches restaurant `latitude` and `longitude` from DB
3. Calls Google Maps Distance Matrix API (server-side using `GOOGLE_MAPS_API_KEY`)
4. Applies the admin-configured pricing formula
5. Returns fee, distance, and estimated time

```typescript
// GET /api/delivery/fee?restaurantId=xxx&destinationAddress=encoded+address

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  DELIVERY_BASE_FEE_KOBO,
  DELIVERY_PER_KM_RATE_KOBO,
  DELIVERY_MAX_RADIUS_KM,
  DELIVERY_MAX_FEE_KOBO,
} from '@foodo/utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get('restaurantId');
  const destinationAddress = searchParams.get('destinationAddress');

  if (!restaurantId || !destinationAddress) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch admin-configured pricing from platform_settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('delivery_base_fee_kobo, delivery_per_km_rate_kobo, delivery_max_radius_km, delivery_max_fee_kobo')
    .single();

  // Fall back to constants if DB fetch fails
  const baseFeeKobo = settings?.delivery_base_fee_kobo ?? DELIVERY_BASE_FEE_KOBO;
  const perKmRateKobo = settings?.delivery_per_km_rate_kobo ?? DELIVERY_PER_KM_RATE_KOBO;
  const maxRadiusKm = settings?.delivery_max_radius_km ?? DELIVERY_MAX_RADIUS_KM;
  const maxFeeKobo = settings?.delivery_max_fee_kobo ?? DELIVERY_MAX_FEE_KOBO;

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('latitude, longitude, name, address')
    .eq('id', restaurantId)
    .single();

  if (!restaurant?.latitude || !restaurant?.longitude) {
    return NextResponse.json({
      feeKobo: baseFeeKobo,
      distanceKm: null,
      durationMinutes: null,
      fallback: true,
      message: 'Using base delivery fee — restaurant location not configured',
    });
  }

  const origin = `${restaurant.latitude},${restaurant.longitude}`;
  const destination = encodeURIComponent(destinationAddress);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=metric&key=${apiKey}`;

  const mapsRes = await fetch(mapsUrl);
  const mapsData = await mapsRes.json();

  const element = mapsData?.rows?.[0]?.elements?.[0];

  if (!element || element.status !== 'OK') {
    return NextResponse.json(
      { error: 'Could not calculate distance for this address. Please check the address and try again.' },
      { status: 422 }
    );
  }

  const distanceMeters = element.distance.value;
  const distanceKm = distanceMeters / 1000;
  const durationSeconds = element.duration.value;
  const durationMinutes = Math.ceil(durationSeconds / 60);

  if (distanceKm > maxRadiusKm) {
    return NextResponse.json(
      { error: `Sorry, this location is outside our delivery area (${Math.round(distanceKm)}km away, max is ${maxRadiusKm}km).` },
      { status: 422 }
    );
  }

  const calculatedFee = baseFeeKobo + Math.round(distanceKm * perKmRateKobo);
  const feeKobo = Math.min(calculatedFee, maxFeeKobo);

  return NextResponse.json({
    feeKobo,
    distanceKm: Math.round(distanceKm * 10) / 10,
    durationMinutes,
    breakdown: {
      baseFeeKobo,
      distanceKm: Math.round(distanceKm * 10) / 10,
      perKmRateKobo,
      distanceChargeKobo: Math.round(distanceKm * perKmRateKobo),
    },
  });
}
```

---

## Update Checkout Page

File: `apps/web/app/[restaurant_slug]/checkout/page.tsx`

### Changes needed:

**1. Replace the plain `deliveryAddress` text input with Google Places Autocomplete**

Load the Google Maps JavaScript API with Places library in the checkout page. Use the
`@types/google.maps` package (already in devDependencies). Implement autocomplete on
the delivery address field so customers get address suggestions as they type.

The autocomplete should be biased to Nigeria (componentRestrictions: { country: 'ng' })
and biased toward Abuja (location bias using Abuja coordinates: lat 9.0579, lng 7.4951,
radius 50000 meters).

```typescript
// Load Maps script dynamically (add to useEffect)
const script = document.createElement('script');
script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
script.async = true;
document.head.appendChild(script);
```

**2. Add delivery fee state and calculation**

When the customer selects a delivery address from autocomplete AND fulfillment type is
"delivery", immediately call `GET /api/delivery/fee` to get the dynamic fee. Show a
loading state while fetching. Display the result clearly.

Add these state variables:
```typescript
const [deliveryFeeKobo, setDeliveryFeeKobo] = useState<number | null>(null);
const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
const [deliveryFeeError, setDeliveryFeeError] = useState('');
const [distanceKm, setDistanceKm] = useState<number | null>(null);
const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
const [selectedPlaceAddress, setSelectedPlaceAddress] = useState('');
```

Call the fee API when address is selected from Places autocomplete:
```typescript
async function calculateDeliveryFee(address: string) {
  setDeliveryFeeLoading(true);
  setDeliveryFeeError('');
  try {
    const res = await fetch(
      `/api/delivery/fee?restaurantId=${restaurant.id}&destinationAddress=${encodeURIComponent(address)}`
    );
    const data = await res.json();
    if (!res.ok) {
      setDeliveryFeeError(data.error ?? 'Could not calculate delivery fee');
      setDeliveryFeeKobo(null);
    } else {
      setDeliveryFeeKobo(data.feeKobo);
      setDistanceKm(data.distanceKm);
      setDurationMinutes(data.durationMinutes);
    }
  } catch {
    setDeliveryFeeError('Could not calculate delivery fee. Please try again.');
  } finally {
    setDeliveryFeeLoading(false);
  }
}
```

**3. Show delivery fee breakdown in the order summary**

In the order summary section, show:
```
Subtotal:          ₦X,XXX
Delivery fee:      ₦X,XXX  (Xkm · ~XX mins)
─────────────────────────
Total:             ₦X,XXX
```

While loading: show a spinner next to "Delivery fee: Calculating..."
If error: show the error message in red, disable the Pay button
If pickup: show "Delivery fee: Free"

**4. Block payment if delivery fee not calculated**

For delivery orders, the Pay button should be disabled until:
- A valid address has been selected from Places autocomplete
- The fee API has returned successfully (deliveryFeeKobo is not null)
- deliveryFeeError is empty

**5. Pass calculated fee to checkout/initialize**

Update the `handlePay` function to pass the calculated `deliveryFeeKobo` to
`/api/checkout/initialize` instead of relying on the restaurant's flat fee:

```typescript
body: JSON.stringify({
  restaurantId: restaurant.id,
  // ... existing fields ...
  deliveryAddress: selectedPlaceAddress,
  deliveryFeeKobo: fulfillmentType === 'delivery' ? (deliveryFeeKobo ?? 0) : 0,
  deliveryDistanceKm: distanceKm,
})
```

---

## Update Checkout Initialize Route

File: `apps/web/app/api/checkout/initialize/route.ts`

**Changes:**

1. Add `deliveryFeeKobo` and `deliveryDistanceKm` to the `InitializeSchema`:
```typescript
deliveryFeeKobo: z.number().int().min(0).optional(),
deliveryDistanceKm: z.number().min(0).optional(),
```

2. Replace the current flat fee logic:
```typescript
// OLD — remove this:
const deliveryFeeKobo = data.fulfillmentType === 'delivery' 
  ? (restaurant.delivery_fee ?? 0) : 0;

// NEW — use the client-calculated fee (re-verified server-side below):
const deliveryFeeKobo = data.fulfillmentType === 'delivery'
  ? (data.deliveryFeeKobo ?? 0) : 0;
```

3. **Server-side re-verification** — fetch pricing from `platform_settings` and
   re-call Distance Matrix API to verify the fee wasn't tampered with client-side.
   Both the `/api/delivery/fee` route and this route must use the same
   `platform_settings` values as the source of truth. If the re-calculated fee
   differs by more than 10% from what the client sent, reject with 422
   "Delivery fee mismatch — please refresh and try again."

4. Store `deliveryDistanceKm` in the payment metadata so it flows through to the order.

---

## Update Paystack Webhook

File: `apps/web/app/api/webhooks/paystack/route.ts`

When creating the order (step 5), also save `delivery_distance_km`:
```typescript
delivery_distance_km: (meta.delivery_distance_km as number) || null,
delivery_fee_kobo_calculated: (meta.delivery_fee_kobo as number) || 0,
```

---

## Update Restaurant Settings (Admin + Merchant)

### Merchant Dashboard Settings

File: `apps/web/components/dashboard/settings-client.tsx`

Add a **"Restaurant Location"** section with:
- A Google Maps embed showing the restaurant's current pinned location
- Latitude and Longitude fields (read-only display, set via map pin)
- A "Set Location on Map" button that opens a map picker modal
- Instructions: "Set your restaurant's location accurately — this is used to calculate delivery fees for your customers"

When the merchant saves their location, call:
`PATCH /api/merchant/settings` with `{ latitude, longitude }`

### New API route: `apps/web/app/api/merchant/location/route.ts`

```typescript
// PATCH — update restaurant lat/lng
// Verify the user is merchant_owner for this restaurant
// Update restaurants table with new latitude/longitude
```

### Admin Dashboard

In `apps/web/app/admin/(protected)/merchants/page.tsx` and the merchants client,
show a location status indicator — green if lat/lng is set, yellow warning if not.
Admins should be able to set the location for any restaurant via the banking page
or a new location field.

---

## Admin Dashboard — Delivery Pricing Config

### Extend `apps/web/app/admin/(protected)/settlements/page.tsx`

Add a **"Delivery Pricing"** configuration panel alongside the existing service charge
config. This gives the admin full control over the delivery fee formula from the dashboard.

The panel should have these fields (all inputs in naira/km, stored as kobo internally):

- **Base fee (₦)** — minimum fee regardless of distance. Input in naira, multiply × 100 before saving.
- **Per km rate (₦/km)** — charged on top of base fee per km of road distance.
- **Max delivery radius (km)** — orders beyond this distance are rejected at checkout.
- **Max fee cap (₦)** — no delivery fee can exceed this regardless of distance.

**Live formula preview** — updates in real time as the admin types:
```
e.g. at 3km → ₦X,XXX | at 7km → ₦X,XXX | at 15km → ₦X,XXX
```

**Save button** — calls `PATCH /api/admin/platform-settings` with the four new fields.

### Update `apps/web/app/api/admin/platform-settings/route.ts`

Extend the existing PATCH handler to also accept and save these four fields:
```typescript
// Add to the PATCH body schema:
delivery_base_fee_kobo:    z.number().int().min(0).optional(),
delivery_per_km_rate_kobo: z.number().int().min(0).optional(),
delivery_max_radius_km:    z.number().int().min(1).max(100).optional(),
delivery_max_fee_kobo:     z.number().int().min(0).optional(),
```

Values sent from the UI will be in naira — convert to kobo (× 100) before saving to DB.

File: `apps/web/app/delivery/[share_link_token]/page.tsx`

Add delivery distance and estimated time to the tracking page if available:
```
📍 Estimated delivery: ~XX minutes (X.Xkm)
```

---

## New Utility Functions

Add to `packages/utils/src/constants.ts`:

```typescript
// ─── Delivery Pricing ────────────────────────────────────────────────────────
export const DELIVERY_BASE_FEE_KOBO = 230000;     // ₦2,300
export const DELIVERY_PER_KM_RATE_KOBO = 15000;   // ₦150 per km  
export const DELIVERY_MAX_RADIUS_KM = 25;
export const DELIVERY_MAX_FEE_KOBO = 1500000;     // ₦15,000
export const DELIVERY_MIN_FEE_KOBO = 230000;      // ₦2,300
```

Add to `packages/utils/src/currency.ts` (or create if needed):

```typescript
export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm > DELIVERY_MAX_RADIUS_KM) return -1; // signals out of range
  const fee = DELIVERY_BASE_FEE_KOBO + Math.round(distanceKm * DELIVERY_PER_KM_RATE_KOBO);
  return Math.min(fee, DELIVERY_MAX_FEE_KOBO);
}
```

---

## Implementation Order

1. **Migration `018_delivery_pricing.sql`** — add lat/lng to restaurants, distance/fee columns to orders
2. **Migration `019_delivery_pricing_settings.sql`** — add delivery pricing columns to platform_settings
3. **Constants** — add delivery pricing fallback constants to `packages/utils/src/constants.ts`
4. **`/api/delivery/fee` route** — new GET endpoint, fetches pricing from platform_settings
5. **Update `/api/checkout/initialize`** — accept `deliveryFeeKobo` + server-side re-verification using platform_settings
6. **Update `PATCH /api/admin/platform-settings`** — accept and save the four delivery pricing fields
7. **Admin delivery pricing config panel** — add to settlements/settings page with live formula preview
8. **Update checkout page** — Places autocomplete + dynamic fee display + block pay until fee calculated
9. **Update Paystack webhook** — save distance snapshot to order
10. **Merchant location settings** — lat/lng picker in settings dashboard
11. **Admin location indicator** — show warning if restaurant has no coordinates set
12. **Update delivery tracking page** — show distance and estimated time
13. **Regenerate types** — `npx supabase gen types typescript --project-id hcyxbmfbyvgybriloffo > packages/database/src/types.ts`

---

## Key Rules

- **Never trust client-submitted fees blindly** — always re-verify server-side in `/api/checkout/initialize`
- The `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is used ONLY in the browser for Places Autocomplete
- The `GOOGLE_MAPS_API_KEY` is used ONLY server-side for Distance Matrix calls — never expose it to the browser
- If a restaurant has no lat/lng set, fall back to the base fee (₦2,300) with a `fallback: true` flag — don't block orders
- Places Autocomplete must be restricted to Nigeria (`componentRestrictions: { country: 'ng' }`)
- The address stored in the order must be the full formatted address from Google Places (not what the user typed)
- Pickup orders always have `deliveryFeeKobo = 0` — no calculation needed
