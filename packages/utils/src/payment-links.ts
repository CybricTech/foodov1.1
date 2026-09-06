/** Shared by merchant web/mobile and the server. All amounts are kobo. */
export interface PaymentLinkLine {
  menuItemId: string;
  name: string;
  priceKobo: number;
  quantity: number;
  selectedOptions: Array<{
    optionId: string;
    optionName: string;
    choices: Array<{
      choiceId: string;
      choiceName: string;
      priceModifierKobo: number;
      quantity: number;
    }>;
  }>;
  specialRequest?: string;
}

export interface PaymentLinkMenuItem {
  id: string;
  name: string;
  price_kobo: number;
  is_available: boolean;
  track_inventory?: boolean;
  stock_quantity?: number | null;
  options?: Array<{
    id: string;
    name: string;
    min_selections: number;
    max_selections: number | null;
    choices: Array<{
      id: string;
      name: string;
      price_modifier_kobo: number | null;
      is_available: boolean;
    }>;
  }>;
}

export interface PaymentLinkInputLine {
  menuItemId: string;
  quantity: number;
  selectedOptions: Array<{
    optionId: string;
    choices: Array<{ choiceId: string; quantity: number }>;
  }>;
  specialRequest?: string;
}

export type PaymentLinkStatus =
  | "awaiting_payment" | "payment_started" | "payment_failed" | "paid" | "cancelled" | "expired";

export interface MerchantPaymentLinkSummary {
  id: string; customerName: string; items: PaymentLinkLine[]; subtotalKobo: number;
  createdAt: string; expiresAt: string; url: string; orderId: string | null;
  status: PaymentLinkStatus;
}

export interface MerchantPaymentLinksData {
  restaurant: { name: string; slug: string };
  menu: PaymentLinkMenuItem[];
  links: MerchantPaymentLinkSummary[];
}

/** Menu must already be scoped to the authenticated/link restaurant. */
export function pricePaymentLinkItems(
  lines: PaymentLinkInputLine[],
  menu: PaymentLinkMenuItem[],
): PaymentLinkLine[] {
  if (lines.length < 1 || lines.length > 50) throw new Error("Choose between 1 and 50 order lines.");
  const totals = new Map<string, number>();
  return lines.map((line) => {
    const item = menu.find((candidate) => candidate.id === line.menuItemId);
    if (!item || !item.is_available) throw new Error("An item is no longer available. Please update the order.");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new Error("Item quantities must be between 1 and 99.");
    }
    const requested = (totals.get(item.id) ?? 0) + line.quantity;
    totals.set(item.id, requested);
    if (item.track_inventory && requested > (item.stock_quantity ?? 0)) {
      throw new Error(`Only ${item.stock_quantity ?? 0} portions of ${item.name} are available.`);
    }
    const groups = item.options ?? [];
    const optionIds = line.selectedOptions.map((option) => option.optionId);
    if (new Set(optionIds).size !== optionIds.length || optionIds.some((id) => !groups.some((group) => group.id === id))) {
      throw new Error(`Please check the options for ${item.name}.`);
    }
    let priceKobo = item.price_kobo;
    const selectedOptions: PaymentLinkLine["selectedOptions"] = [];
    for (const group of groups) {
      const selected = line.selectedOptions.find((option) => option.optionId === group.id)?.choices ?? [];
      if (new Set(selected.map((choice) => choice.choiceId)).size !== selected.length) {
        throw new Error(`A choice was repeated in ${group.name}.`);
      }
      const choices = selected.map((selection) => {
        const choice = group.choices.find((candidate) => candidate.id === selection.choiceId);
        if (!choice || !choice.is_available) throw new Error(`A choice in ${group.name} is no longer available.`);
        if (!Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 20) {
          throw new Error("Extra quantities must be between 1 and 20.");
        }
        priceKobo += (choice.price_modifier_kobo ?? 0) * selection.quantity;
        return { choiceId: choice.id, choiceName: choice.name, priceModifierKobo: choice.price_modifier_kobo ?? 0, quantity: selection.quantity };
      });
      const count = choices.reduce((sum, choice) => sum + choice.quantity, 0);
      if (count < group.min_selections || (group.max_selections != null && group.max_selections > 0 && count > group.max_selections)) {
        throw new Error(`Please check the number of selections for ${group.name}.`);
      }
      if (choices.length) selectedOptions.push({ optionId: group.id, optionName: group.name, choices });
    }
    if (!Number.isSafeInteger(priceKobo) || priceKobo <= 0) throw new Error(`Please check the price of ${item.name}.`);
    if ((line.specialRequest?.length ?? 0) > 300) throw new Error("Special requests must be 300 characters or fewer.");
    return {
      menuItemId: item.id, name: item.name, priceKobo, quantity: line.quantity, selectedOptions,
      ...(line.specialRequest?.trim() ? { specialRequest: line.specialRequest.trim() } : {}),
    };
  });
}

export interface PaymentLinkPayment {
  order_id: string | null;
  paystack_status?: string | null;
  monnify_status?: string | null;
}

const PAID_STATUSES = ["success", "PAID", "OVERPAID", "paid"];

/**
 * A gateway's FINAL refusal — Paystack failed/abandoned/reversed, Monnify
 * FAILED/EXPIRED/REVERSED, all normalized to 'rejected' before they are stored.
 * Anything else, PENDING included, can still take the customer's money, so it
 * must keep holding the link. Mirrors payments_live_payment_link_idx.
 */
export function isRejectedPayment(payment: PaymentLinkPayment): boolean {
  return payment.paystack_status === "rejected" || payment.monnify_status === "rejected";
}

export function isPaidPayment(payment: PaymentLinkPayment): boolean {
  return Boolean(payment.order_id)
    || PAID_STATUSES.includes(payment.paystack_status ?? "")
    || PAID_STATUSES.includes(payment.monnify_status ?? "");
}

/**
 * The one payment a link's fate hangs on: whichever got paid, else whichever
 * can still be paid. Null once every attempt has been refused — which is what
 * lets the customer start a fresh one. The DB permits at most one live payment
 * per link, so this can never be an arbitrary pick between two open charges.
 */
export function livePaymentLinkPayment<T extends PaymentLinkPayment>(payments: T[]): T | null {
  return payments.find(isPaidPayment) ?? payments.find((payment) => !isRejectedPayment(payment)) ?? null;
}

export function paymentLinkStatus(
  link: { cancelled_at: string | null; expires_at: string },
  payments: PaymentLinkPayment[],
  now = Date.now(),
): PaymentLinkStatus {
  if (payments.some(isPaidPayment)) return "paid";
  // A gateway transaction already issued can still settle after link expiry.
  if (payments.some((payment) => !isRejectedPayment(payment))) return "payment_started";
  if (link.cancelled_at) return "cancelled";
  if (new Date(link.expires_at).getTime() <= now) return "expired";
  // Every attempt was refused, so the link is open for another one.
  if (payments.length) return "payment_failed";
  return "awaiting_payment";
}
