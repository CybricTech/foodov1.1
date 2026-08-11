# Infobip WhatsApp migration — merchant new-order alerts

Merchant new-order alerts go out over **Infobip** as the Meta WhatsApp Business
API BSP. This replaces an earlier Interakt integration (never went live) and,
before that, Termii's WhatsApp channel. The Twilio SMS fallback is retired.

Status: **code shipped, inert until Infobip is configured.** With any of
`INFOBIP_API_KEY` / `INFOBIP_BASE_URL` / `INFOBIP_SENDER` unset, the WhatsApp
branch fails immediately and merchants fall through to Termii SMS — so
deploying ahead of sender registration and template approval is safe.

---

## 1. The constraint that shapes everything

Business-initiated WhatsApp messages must use a **pre-approved template**.
Free-form text is only possible inside the 24-hour customer-service window,
which opens when the *user* messages *you*. A merchant receiving a new-order
alert never messaged us first, so that window never applies and a template is
mandatory on **every** send.

This is a **Meta platform rule, not a vendor one** — it did not change when we
moved off Interakt and will not change with any future BSP.

It is also why the old rich message could not be ported.
`buildWhatsAppOrderMessage()` emits a **variable-length** item list; templates
have a **fixed** number of placeholders, so a variable-length list cannot be
expressed. The alert is therefore compact, with a button to the dashboard.

## 2. The template to create

Templates are registered against a **WhatsApp Business Account tied to the
BSP**. Anything approved under a previous provider does **not** carry over —
it must be recreated in Infobip and re-approved by Meta.

Create under **Content → Templates**, category **Utility** (not Marketing —
this is transactional; filing it as Marketing risks rejection and marketing
rate limits).

**Name:** `new_order_merchant` — must match `INFOBIP_TEMPLATE_NAME`
**Language:** `en` — must match `INFOBIP_TEMPLATE_LANG`

**Header (text):** `NEW ORDER 🛎️`

**Body:**
```
Hello! You have a new order waiting on Kitchyn.

Order number: {{1}}
Customer: {{2}}
Number of items: {{3}}
Order total: {{4}}
Fulfilment method: {{5}}

Please open your dashboard to review the items and confirm this order as
soon as you can.
```

**Footer:** `Click button to see dashboard`

**Button:** one **static** URL button labelled `View Order` →
`https://kitchyn.app/dashboard/frontline/orders`

Static, not dynamic, on purpose: the orders board ignores query params, so a
per-order dynamic URL would look like a deep link while landing on the plain
board. The code therefore sends **no `buttons`**. Upgrade to a dynamic URL only
once the board can open a specific order from a param.

### Template copy rules (learned the hard way)

Meta rejected a first draft — `New order {{1}} from {{2}}. {{3}} item(s) ·
{{4}} · {{5}}` — with *"too many variables / increase the length of the
message"*. When editing, respect all three:

- **Density** — plenty of literal text per variable. Don't compress it back.
- **Adjacency** — never two variables separated only by punctuation
  (`{{4}} · {{5}}` was part of the problem). One per labelled line.
- The body must not **begin or end** with a variable.

### Placeholder order

Positional, and must match the approved template exactly — a count mismatch
fails the send.

| Slot | Value | Example |
|------|-------|---------|
| `{{1}}` | order number | `AR-2213` |
| `{{2}}` | customer name | `Lukman Adekola` |
| `{{3}}` | total item count | `3` |
| `{{4}}` | order total | `₦21,890` |
| `{{5}}` | fulfillment type | `Delivery` / `Pickup` |

## 3. Environment variables

Set on the `send-sms` edge function:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `INFOBIP_API_KEY` | yes | — | Sent as `Authorization: App <key>` — **not** Bearer, **not** Basic. Needs the `whatsapp:message:send` scope. |
| `INFOBIP_BASE_URL` | yes | — | **Account-specific** host, e.g. `xxxxx.api.infobip.com`. There is no shared host. Scheme optional; trailing slashes trimmed. |
| `INFOBIP_SENDER` | yes | — | Registered WhatsApp sender number, digits only, e.g. `2348012345678`. |
| `INFOBIP_TEMPLATE_NAME` | no | `new_order_merchant` | Must match the approved template. |
| `INFOBIP_TEMPLATE_LANG` | no | `en` | Must match the approved language exactly (`en` ≠ `en_US`). |

Removed: `TWILIO_*`, `INTERAKT_*`.

## 4. API shape

`POST {INFOBIP_BASE_URL}/whatsapp/1/message/template`

```jsonc
{
  "messages": [{
    "from": "<INFOBIP_SENDER>",
    "to": "2348012345678",        // international, no '+'
    "messageId": "<orderId>",      // echoed on the status webhook
    "content": {
      "templateName": "new_order_merchant",
      "language": "en",
      "templateData": { "body": { "placeholders": ["...", "...", "...", "...", "..."] } }
    }
  }]
}
```

**Infobip returns HTTP 200 even for a rejected message.** The per-message
`status.groupName` is the real outcome, so the code inspects it and treats
`REJECTED` / `UNDELIVERABLE` as a failure rather than trusting the status code.
`PENDING` / `ACCEPTED` mean accepted for delivery only.

## 5. Delivery ladder

```
merchant has whatsapp_number ?
  ├── yes → Infobip template  ──fail──▶ Termii SMS (same number)
  └── no  → Termii SMS on restaurant phone   (no further fallback)
```

Twilio is gone from both paths. A Termii failure is now terminal for that send;
pg_cron retries cover transient outages.

## 6. Free-trial limits

The Infobip trial is **not** usable for real merchant traffic:

- test sender only
- 100 free messages
- **messages to verified numbers only** — a real merchant's number will not
  receive anything until it is verified, or until funds are added and a real
  sender is registered

Plan to add funds and register a production sender before switching merchants
over, and expect the fallback to SMS in the meantime.

## 7. Known gaps

- **Admin copy still uses Termii WhatsApp.** Moving it needs a *second*
  approved template (the admin variant is prefixed with the restaurant name, so
  it has a different placeholder set). Left untouched rather than pointed at a
  template that does not exist.
- **Status webhook not wired.** The send response only confirms *accepted for
  delivery*; the real DELIVERED/EXPIRED/REJECTED outcome arrives on a webhook.
  We store Infobip's id in `sms_logs.provider_ref` and pass `orderId` as
  `messageId`, so both join keys exist — but no receiver has been built, so
  `sms_logs.status` stays at `sent` and never advances. Natural next task.

## 8. Verifying

1. Set the three required env vars; redeploy `send-sms`.
2. While on trial, **verify the destination number in Infobip first**.
3. Place a test order on a merchant with a `whatsapp_number` set.
4. Expect an `sms_logs` row: `provider = 'infobip'`, `channel = 'whatsapp'`,
   `status = 'sent'`, `provider_ref` populated.
5. On failure the function logs Infobip's whole response body — check
   `status.description` for the reason (unregistered sender, unknown template
   name, placeholder count mismatch, unverified recipient on trial).
