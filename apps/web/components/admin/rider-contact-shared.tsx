"use client";

import { cn } from "@foodo/ui";
import {
  formatPhoneDisplay,
  normalizeNigerianMobile,
  type MerchantRiderPhone,
  type RiderContactStatus,
} from "@foodo/utils";

/**
 * Pieces shared by the two admin surfaces that decide whether a store gives
 * Bolt drivers its own number: the per-merchant card on the merchant page,
 * and the all-stores list in Settings › Dispatch. Both write through
 * PATCH /api/admin/merchants/rider-contact, so they can't drift apart.
 */

/** PATCH one store's selection and/or rider number. Throws with the API's message. */
export async function patchStoreRiderContact(
  restaurantId: string,
  payload: { selected?: boolean; phone?: string | null }
): Promise<{ status: RiderContactStatus | null; selected: boolean }> {
  const res = await fetch("/api/admin/merchants/rider-contact", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to save");
  return data as { status: RiderContactStatus | null; selected: boolean };
}

/** Stored WhatsApp numbers vary in format. Show the tidy form when there is one. */
export function displayPhone(raw: string): string {
  const e164 = normalizeNigerianMobile(raw);
  return e164 ? formatPhoneDisplay(e164) : raw;
}

/**
 * Why a store's own number can't be used, in a sentence an admin can act on,
 * or null when it can. Selecting such a store is allowed, since the number can
 * be fixed afterwards, but its drivers keep calling Kitchyn until it is.
 */
export function merchantPhoneProblem(
  merchant: MerchantRiderPhone,
  whatsappNumber: string | null
): string | null {
  if (merchant.ok) return null;
  if (merchant.reason === "no_number") return "No WhatsApp or rider number set";
  if (merchant.source === "merchant_whatsapp") {
    return whatsappNumber
      ? `WhatsApp number ${whatsappNumber} isn't a Nigerian mobile`
      : "WhatsApp number isn't a Nigerian mobile";
  }
  return "Rider number isn't a Nigerian mobile";
}

/** The purple on/off switch used across admin settings. */
export function RiderContactSwitch({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Use Copper Pot's number". */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative w-12 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-60",
        checked ? "bg-purple-500" : "bg-black-200"
      )}
    >
      <span
        className={cn(
          "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform",
          checked ? "left-7" : "left-1"
        )}
      />
    </button>
  );
}
