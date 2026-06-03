<wizard-report>
# PostHog post-wizard report

The wizard has completed three rounds of PostHog integration across the Foodo/Kitchyn platform. This final run adds **6 new server-side events** to the most critical — and previously untracked — business flows: payment webhook order creation (Paystack + Monnify), checkout initialization, merchant onboarding, landing page demo requests, and order status updates from the merchant dashboard.

**New in this run (server-side webhooks & routes):**

| Event | Description | File |
|---|---|---|
| `order created` | Fires when a Paystack webhook confirms payment and creates an order | `apps/web/app/api/webhooks/paystack/route.ts` |
| `order created` | Fires when a Monnify webhook confirms payment and creates an order | `apps/web/app/api/webhooks/monnify/route.ts` |
| `checkout initiated` | Fires when a checkout is initialized and the payment record is inserted into the DB | `apps/web/app/api/checkout/initialize/route.ts` |
| `merchant onboarded` | Fires when an admin successfully creates a new restaurant + merchant owner account | `apps/web/app/api/admin/merchants/onboard/route.ts` |
| `demo request submitted` | Server-side: fires when a landing page demo request is saved to the database | `apps/web/app/api/landing/demo-request/route.ts` |
| `order status updated` | Fires when a merchant changes an order's status from the dashboard | `apps/web/app/api/dashboard/orders/update-status/route.ts` |

**From run 2 (client-side, still active):**

| Event | Description | File |
|---|---|---|
| `checkout_started` | Customer enters phone and proceeds into the checkout form | `apps/web/app/[restaurant_slug]/checkout/page.tsx` |
| `payment_initiated` | Customer taps Pay Now and the payment gateway is launched | `apps/web/app/[restaurant_slug]/checkout/page.tsx` |
| `payment_cancelled` | Customer dismisses the payment gateway without completing payment | `apps/web/app/[restaurant_slug]/checkout/page.tsx` |
| `promo_code_applied` | Customer applies a discount code at checkout | `apps/web/app/[restaurant_slug]/checkout/page.tsx` |
| `demo_request_submitted` | A prospective merchant submits the Book a Demo form (client-side) | `apps/web/app/_components/demo-modal.tsx` |
| `merchant_login` | A merchant signs in to the dashboard | `apps/web/app/dashboard/login/page.tsx` |

**From run 1 (server-side admin events, still active):**

| Event | Description | File |
|---|---|---|
| `order placed` | Customer completes payment and an order is confirmed | `apps/web/app/api/checkout/status/route.ts` |
| `order dispatched` | Merchant dispatches an order to a rider | `apps/web/app/api/dispatch/route.ts` |
| `order delivered` | Admin marks an order as delivered | `apps/web/app/api/admin/orders/mark-delivered/route.ts` |
| `merchant activated` | Admin enables a merchant to accept orders | `apps/web/app/api/admin/merchants/toggle-active/route.ts` |
| `merchant deleted` | Admin permanently deletes a merchant | `apps/web/app/api/admin/merchants/delete/route.ts` |
| `staff member created` | Merchant owner creates a staff account | `apps/web/app/api/dashboard/staff/create/route.ts` |
| `staff member deleted` | Merchant owner removes a staff account | `apps/web/app/api/dashboard/staff/delete/route.ts` |
| `bank account updated` | Merchant saves payout bank account details | `apps/web/app/api/merchant/banking/route.ts` |
| `settlement recorded` | Admin records a manual settlement payout | `apps/web/app/api/admin/settlements/record/route.ts` |
| `rider approved` | Admin approves a rider account | `apps/web/app/api/admin/riders/toggle-active/route.ts` |

## Next steps

We've built an **Analytics basics** dashboard with 5 insights covering the full order lifecycle and business health:

- [Analytics basics dashboard](https://eu.posthog.com/project/191720/dashboard/718226)
- [Orders Created Over Time](https://eu.posthog.com/project/191720/insights/2OSCaYf0) — daily order creation trend (Paystack + Monnify)
- [Checkout Conversion Funnel](https://eu.posthog.com/project/191720/insights/RFFzSfHj) — 3-step funnel: checkout started → payment initialized → order created
- [Demo Requests & Merchant Onboardings](https://eu.posthog.com/project/191720/insights/Bwx9GpP9) — lead generation vs merchant conversion side-by-side
- [Order Status Updates by Status](https://eu.posthog.com/project/191720/insights/JIj34hkg) — fulfillment pipeline breakdown by status
- [Payment Cancellations vs Orders Created](https://eu.posthog.com/project/191720/insights/qLWGORH4) — checkout abandonment signal

**Previous dashboards:**
- [Client-side analytics dashboard](https://eu.posthog.com/project/191720/dashboard/718211)
- [Analytics basics (run 1)](https://eu.posthog.com/project/191720/dashboard/718197)

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
