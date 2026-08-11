# Interakt WhatsApp migration — merchant new-order alerts

Replaces Termii's WhatsApp channel with **Interakt** (a Meta WhatsApp Business
API BSP) for merchant new-order alerts, and retires the Twilio SMS fallback.

Status: **code shipped, inert until an approved template exists.** With
`INTERAKT_API_KEY` unset the WhatsApp branch fails immediately and merchants
fall through to Termii SMS, so deploying ahead of Meta approval is safe.

---

## 1. The constraint that shapes everything

Interakt's send endpoint accepts **approved templates only** — free-form text is
not supported. Merchant alerts are *business-initiated* (the merchant never
messaged us first), so the 24-hour customer-service window never applies and a
template is mandatory on **every** send.

This is why the old rich message could not be ported. `buildWhatsAppOrderMessage()`
emits a **variable-length** item list with per-item options; WhatsApp templates
have a **fixed** number of placeholders (`{{1}}`, `{{2}}`…), so a variable-length
list is structurally impossible. Template parameters also cannot contain
newlines, tabs, or long runs of spaces — ruling out passing the whole block as a
single variable.

The alert is therefore compact, with a button through to the dashboard.

> The newline restriction is widely reported but we could **not** confirm it in
> Meta's official docs. The compact design sidesteps it entirely, so it does not
> block us — but verify before attempting a multi-line variable later.

## 2. The template to create

Create in the Interakt dashboard, then submit for Meta approval (~1–2 days).
Category: **Utility** (not Marketing — this is a transactional alert).

**Name:** `new_order_merchant` — must match `INTERAKT_TEMPLATE_NAME`
**Language:** `en` — must match `INTERAKT_TEMPLATE_LANG`

**Body:**
```
New order {{1}} from {{2}}.
{{3}} item(s) · {{4}} · {{5}}
Open your dashboard to accept it.
```

**Variable order is positional and must match exactly.** A count mismatch is
Meta error `132000` and the send fails outright.

| Slot | Value | Example |
|------|-------|---------|
| `{{1}}` | order number | `AR-2213` |
| `{{2}}` | customer name | `Lukman Adekola` |
| `{{3}}` | total item count | `3` |
| `{{4}}` | order total | `₦21,890` |
| `{{5}}` | fulfillment type | `Delivery` / `Pickup` |

**Button:** one **static** URL button labelled `View Order`, pointing at
`https://kitchyn.app/dashboard/frontline/orders`.

Static, not dynamic, on purpose: the orders board ignores query params, so a
per-order dynamic URL would look like a deep link while landing on the plain
board. The code therefore sends **no `buttonValues`** — supplying them for a
button that carries no variable is itself an error. Upgrade to a dynamic URL
only once the board can open a specific order from a param.

Also **turn "Enable Button Click Tracking" OFF**. Interakt's own notice says it
works only for templates sent via Campaigns, not via the API — and we send via
the API. Leaving it on wraps the URL in a tracking redirect that buys nothing
and adds a failure mode.

## 3. Environment variables

Set on the `send-sms` edge function:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `INTERAKT_API_KEY` | yes | — | Developer Settings. Sent as `Authorization: Basic <key>` — already base64 from Interakt, do **not** re-encode. |
| `INTERAKT_TEMPLATE_NAME` | no | `new_order_merchant` | Must match the approved template. |
| `INTERAKT_TEMPLATE_LANG` | no | `en` | Must match the approved language. |

Removed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.

**API access needs the Growth plan minimum** — public APIs are unavailable on
Starter.

## 4. Delivery ladder after this change

```
merchant has whatsapp_number ?
  ├── yes → Interakt template  ──fail──▶ Termii SMS (same number)
  └── no  → Termii SMS on restaurant phone   (no further fallback)
```

Twilio is gone from both paths. A Termii failure is now terminal for that send;
pg_cron retries cover transient outages.

## 5. Known gaps

- **Admin copy still uses Termii WhatsApp.** Moving it needs a *second*
  approved template (the admin variant is prefixed with the restaurant name, so
  it has a different variable set). Left untouched rather than pointed at a
  template that does not exist.
- **Status webhook not wired.** Interakt's send response only confirms
  *accepted for delivery*; the real Sent/Delivered/Read/Failed outcome arrives
  on a webhook. We store the returned id in `sms_logs.provider_ref` and pass
  `orderId` as `callbackData`, so both join keys exist — but no webhook receiver
  has been built, so `sms_logs.status` stays at `sent` and never advances to
  `delivered`. This is the natural next piece of work.
- **Nigerian numbers only.** `splitPhoneForInterakt()` returns `null` for
  anything that isn't a 13-digit `234…` number rather than guessing a country
  code, so a non-Nigerian merchant silently falls through to SMS.

## 6. Verifying after approval

1. Set `INTERAKT_API_KEY`; redeploy `send-sms`.
2. Place a test order on a merchant with a `whatsapp_number` set.
3. Expect a `sms_logs` row: `provider = 'interakt'`, `channel = 'whatsapp'`,
   `status = 'sent'`, `provider_ref` populated.
4. On failure, check the function logs — Interakt's error body is logged whole.
   `132000` means the variable count drifted from the approved template.
