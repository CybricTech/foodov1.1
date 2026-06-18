// Maps a dashboard order row (snake_case DB shape + embedded order_items) to the
// ReceiptOrder the ESC/POS builder expects.

import type { ReceiptOrder } from "./escpos";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toReceiptOrder(o: any): ReceiptOrder {
  return {
    orderNumber: o.order_number,
    createdAt: o.created_at,
    fulfillmentType: o.fulfillment_type === "pickup" ? "pickup" : "delivery",
    customerName: o.customer_name ?? null,
    customerPhone: o.customer_phone ?? null,
    deliveryAddress: o.delivery_address ?? null,
    specialInstructions: o.special_instructions ?? null,
    items: (o.order_items ?? []).map((it: any) => ({
      name: it.item_name,
      quantity: it.quantity,
      lineTotalKobo: it.line_total_kobo ?? 0,
      options: (it.selected_options ?? []).map((opt: any) => ({
        optionName: opt.optionName ?? opt.option_name ?? "",
        choices: (opt.choices ?? []).map((c: any) => ({
          choiceName: c.choiceName ?? c.choice_name ?? "",
          priceModifierKobo: c.priceModifierKobo ?? c.price_modifier_kobo ?? 0,
          quantity: c.quantity,
        })),
      })),
    })),
    subtotalKobo: o.subtotal_kobo ?? 0,
    deliveryFeeKobo: o.delivery_fee_kobo ?? 0,
    vatKobo: o.vat_kobo ?? 0,
    serviceFeeKobo: o.service_fee_kobo ?? 0,
    discountKobo: o.discount_kobo ?? 0,
    totalKobo: o.total_kobo ?? 0,
  };
}

/** Order statuses that belong to the first kanban stage (print these). */
export const NEW_STAGE_STATUSES = ["pending", "confirmed"];
