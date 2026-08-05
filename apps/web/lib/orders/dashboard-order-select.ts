/**
 * The one column list every merchant-facing order board fetches.
 *
 * Was written out separately in four places — the owner queue page, the
 * frontline page, and the frontline client's reconnect catch-up (twice) — which
 * drifted. Migration 101 moved the rider onto its own track and made
 * `rider_requested_at` and `dispatch_state` the fields the merchant UI keys its
 * whole handover on, and not one of those four copies was updated. The columns
 * were therefore `undefined` on every card, forever, so:
 *
 *   - "Assign Rider" (gated on !rider_requested_at) never went away, and the
 *     merchant re-tapped it indefinitely on an order that already had a rider
 *   - "Kitchyn rider handling" (gated on rider_requested_at) could never render
 *   - "Hand to Rider" stayed on screen for a platform-lane order and the API
 *     answered 403 to every tap
 *
 * A single constant does not prevent someone forgetting a column, but it does
 * make forgetting it a one-line fix in one place rather than a silent
 * divergence between the page that renders a board and the query that refills
 * it after a reconnect.
 *
 * Keep in step with:
 *   - `ORDERS_SELECT` in apps/mobile/src/features/orders/types.ts (same board,
 *     different client)
 *   - the `orders` Realtime publication column list (migration 103) — anything
 *     read here that must also update live has to be published there too
 */
export const DASHBOARD_ORDER_SELECT = `
  id, order_number, status, payment_status, fulfillment_type,
  customer_name, customer_phone, subtotal_kobo, delivery_fee_kobo,
  vat_kobo, service_fee_kobo, discount_kobo, discount_code, total_kobo, created_at,
  special_instructions, delivery_address, estimated_delivery_at,
  scheduled_for, activated_at,
  dispatch_type, dispatch_state, rider_requested_at,
  order_items (id, item_name, quantity, line_total_kobo, selected_options, menu_items (prep_time_minutes))
`;
