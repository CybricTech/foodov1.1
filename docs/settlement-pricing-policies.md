# Foodo Settlement & Pricing Policies

> **Last updated**: April 2026
> **Configurable via**: Admin Portal → Settings (`/admin/settings`)

---

## Revenue Model

Foodo generates revenue through two streams applied to every order on the platform.

### 1. Service Fee (100% to Foodo)

A service fee is charged on every order. **Foodo retains 100%** of the service fee.

| Parameter | Current Value | Configurable |
|---|---|---|
| Service charge % | 0.0% | ✅ Settings → Platform Fee Configuration |
| Fixed fee (₦) | ₦200 | ✅ Settings → Platform Fee Configuration |

**Formula**: `service_fee = (subtotal × service_charge_pct) + service_charge_fixed_kobo`

### 2. Delivery Fee Commission

Foodo's cut of the delivery fee depends on **who handles the delivery**:

| Delivery Handler | Foodo Keeps | Restaurant Keeps |
|---|---|---|
| **Foodo (platform_rider)** | 100% of delivery fee | ₦0 |
| **Restaurant (own_rider)** | 10% of delivery fee | 90% of delivery fee |
| **Third-party** | 10% of delivery fee | 90% of delivery fee |

**Pickup orders**: Delivery fee is ₦0 — no delivery commission applies.

---

### 3. VAT (Value Added Tax)

VAT is **per-restaurant** — each restaurant can optionally set their own VAT percentage. When set, VAT is calculated on the subtotal and charged to the customer at checkout.

| Parameter | Default | Configurable |
|---|---|---|
| VAT percentage | `null` (disabled) | ✅ Merchant Dashboard → Settings |

**Formula**: `vat = subtotal × (vat_percentage / 100)`

> **Important**: VAT belongs to the restaurant. It is included in the restaurant's settlement (they are responsible for remitting it to FIRS). Foodo does NOT take a cut of VAT.

---

## Delivery Pricing

Delivery fees are calculated dynamically based on distance:

| Parameter | Current Value | Configurable |
|---|---|---|
| Base fee | ₦1,800 | ✅ Settings → Delivery Pricing |
| Per km rate | ₦150/km | ✅ Settings → Delivery Pricing |
| Max radius | 25 km | ✅ Settings → Delivery Pricing |
| Max fee cap | ₦15,000 | ✅ Settings → Delivery Pricing |

**Formula**: `delivery_fee = min(base_fee + (distance_km × per_km_rate), max_fee_cap)`

---

## Settlement Process

### Schedule
- Settlements are processed **daily at 9:00 AM WAT (08:00 UTC)**
- A pg_cron job triggers the `process-settlements` edge function at this time

### Hold Period
- After an order is paid, the restaurant's share enters a **hold period** before becoming available
- Current hold period: **24 hours** (configurable in Settings → Platform Fee Configuration)

### Settlement Flow

```
Order Paid → Wallet Credit (pending) → Hold Period → Available Balance → Daily Settlement → Bank Transfer via Paystack
```

1. **Order completed**: Customer payment is received via Paystack
2. **Wallet credit**: Restaurant's share is credited to their wallet as `pending`
3. **Hold period**: Funds remain pending for the configured hold hours
4. **Release**: At the next settlement run, pending funds past the hold period move to `available`
5. **Bank transfer**: Available balance is transferred to the restaurant's Paystack recipient account
6. **Settlement record**: A settlement record is created tracking the transfer status

### Restaurant's Settlement Amount

For each order, the restaurant receives:

```
restaurant_settlement = subtotal + vat + delivery_fee - foodo_delivery_cut
```

Where:
- **vat** = subtotal × restaurant's VAT percentage (0 if not set)
- **foodo_delivery_cut** = 100% of delivery fee (if Foodo delivers) OR 10% of delivery fee (if restaurant delivers)
- **service_fee** = 100% goes to Foodo (customer pays it separately, not deducted from restaurant)

So effectively:
- **Foodo delivers**: `restaurant_gets = subtotal + vat`
- **Restaurant delivers**: `restaurant_gets = subtotal + vat + (90% × delivery_fee)`

### Manual Settlement Trigger
- Super admins can manually trigger a settlement for any restaurant from the Settlements page
- Navigate to: Admin → Settlements → Merchant Settlements → Click merchant → "Settle" button

---

## Configurable Parameters

All configurable values are managed via the **Admin Settings page** (`/admin/settings`):

| Setting | Location | Effect |
|---|---|---|
| Service charge % | Platform Fee Configuration | Percentage of subtotal charged as service fee |
| Fixed fee (₦) | Platform Fee Configuration | Flat fee added to service charge |
| Hold period (hours) | Platform Fee Configuration | Hours before funds become available for settlement |
| Delivery base fee | Delivery Pricing | Starting delivery fee |
| Delivery per-km rate | Delivery Pricing | Added per kilometer of distance |
| Delivery max radius | Delivery Pricing | Maximum delivery distance |
| Delivery max fee cap | Delivery Pricing | Maximum delivery fee regardless of distance |
| Admin WhatsApp | Admin Notifications | WhatsApp number for order alerts |
| Admin Email | Admin Notifications | Email address for order alerts |
| VAT percentage | Merchant Dashboard → Settings | Per-restaurant VAT rate (set by restaurant) |

> **Note**: Changes to pricing and fee configuration apply to **new orders only**. Existing orders retain the values they were created with.

---

## Database Schema

### Key Tables

| Table | Purpose |
|---|---|
| `orders` | Stores subtotal_kobo, delivery_fee_kobo, service_fee_kobo per order |
| `delivery_assignments` | Tracks dispatch_type (platform_rider / own_rider / third_party) per order |
| `restaurant_wallets` | Pending and available balances per restaurant |
| `wallet_transactions` | Immutable ledger of all credits and debits |
| `settlements` | Payout records with Paystack transfer tracking |
| `platform_settings` | Singleton table with all configurable fee/pricing values |

### Wallet Transaction Types

| Type | Direction | Description |
|---|---|---|
| `order_credit` | credit | Restaurant's share of an order |
| `service_charge` | debit | Foodo's service fee deduction |
| `logistics_fee` | debit | Foodo's delivery fee deduction |
| `settlement_debit` | debit | Bank transfer payout |
| `manual_adjustment` | credit/debit | Admin manual adjustment |
