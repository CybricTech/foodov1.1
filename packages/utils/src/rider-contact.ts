/**
 * Rider contact — whose phone a Bolt driver gets for the pickup.
 *
 * The Ride Booker API has exactly one contact slot per ride: `user: {name,
 * phone}`, the "client" the driver treats as the person at the pickup. There is
 * no sender/receiver split like Bolt Send has in the consumer app. Historically
 * that slot held Kitchyn's ops line, so every "I'm outside, where are you?" call
 * landed on ops, who then had to phone the merchant anyway.
 *
 * Putting the merchant in that slot gives the driver what Bolt Send's "Receive"
 * flow gives a human booker: the pickup contact is the business holding the
 * food, and the customer's number (the real receiver) already travels in
 * note_to_driver. Who answers at pickup is the merchant; who answers at the door
 * is the customer; ops is only the fallback.
 *
 * Three inputs decide the number, and they are kept apart on purpose:
 *
 *   platform_settings.bolt_rider_contact_mode   ROLLOUT   ops | selected | merchant
 *   restaurants.rider_contact_selected          ROLLOUT   admin-set, per store
 *   restaurants.rider_contact_phone             CHOICE    merchant-set; NULL =
 *                                                         "use my WhatsApp number"
 *
 * The rollout is admin-only. The merchant's choice is theirs to edit at any
 * time, and it is respected only once the rollout includes their store.
 *
 * Everything here is pure and never throws — it runs inside ride booking, where
 * a bad phone number must cost a call to ops, never a delivery.
 */

import { normalizeToE164 } from "./phone";

// ── Rollout ─────────────────────────────────────────────────────────────────

/** `platform_settings.bolt_rider_contact_mode`. */
export type RiderContactMode = "ops" | "selected" | "merchant";

export const RIDER_CONTACT_MODES: readonly RiderContactMode[] = [
  "ops",
  "selected",
  "merchant",
] as const;

/**
 * Anything unrecognised — a missing column before the migration lands, a null
 * from a failed read — resolves to "ops": the pre-feature behaviour, where every
 * driver calls Kitchyn. Failing toward ops means a misconfiguration can only
 * ever reroute calls to us, never silently to a merchant who didn't expect them.
 */
export function resolveRiderContactMode(raw: unknown): RiderContactMode {
  return RIDER_CONTACT_MODES.includes(raw as RiderContactMode)
    ? (raw as RiderContactMode)
    : "ops";
}

/** Whether a store's drivers get the merchant's number rather than the ops line. */
export function isMerchantRiderContactLive(mode: RiderContactMode, selected: boolean): boolean {
  return mode === "merchant" || (mode === "selected" && selected === true);
}

// ── Phone numbers ───────────────────────────────────────────────────────────

/**
 * A Nigerian mobile in E.164: +234, then a 70x/80x/81x/90x/91x network prefix,
 * then 8 digits. Same pattern as the CHECK on restaurants.rider_contact_phone.
 *
 * Deliberately stricter than `isValidNigerianPhone`, which accepts any ten
 * digits after +234. This number gets handed to a stranger on a motorbike who
 * calls it from a mobile network, so it has to be one they can actually ring.
 * A landline, a foreign WhatsApp number, or a typo isn't worth a booking that
 * fails at the gate. All of those fall back to ops instead.
 */
export const NIGERIAN_MOBILE_E164_RE = /^\+234[789][01]\d{8}$/;

/**
 * Normalises a Nigerian mobile number to E.164, or returns null.
 *
 * Accepts the ways merchants actually type their numbers: 0803 123 4567,
 * 803-123-4567, +234 803 123 4567, 2348031234567, and "+234 (0) 803…". That
 * last one is common on Nigerian business cards, and normalizeToE164 rejects
 * it because the trunk 0 makes it one digit too long.
 */
export function normalizeNigerianMobile(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return null;
  if (digits.startsWith("2340") && digits.length === 14) {
    digits = `234${digits.slice(4)}`;
  }
  let e164: string;
  try {
    e164 = normalizeToE164(digits);
  } catch {
    return null;
  }
  return NIGERIAN_MOBILE_E164_RE.test(e164) ? e164 : null;
}

// ── The merchant's side ─────────────────────────────────────────────────────

/** Where the merchant's rider number comes from. */
export type MerchantRiderPhoneSource = "merchant_custom" | "merchant_whatsapp";

/**
 * The number a merchant has said riders should call, ignoring rollout.
 *
 * `ok: false` carries the source that *would* have been used, so the UI can say
 * which number is the problem: their WhatsApp number or the one they typed.
 */
export type MerchantRiderPhone =
  | { ok: true; phone: string; source: MerchantRiderPhoneSource }
  | {
      ok: false;
      reason: "no_number" | "invalid_number";
      source: MerchantRiderPhoneSource | null;
    };

/**
 * A custom number, when set, wins outright. If it's unusable we do not quietly
 * fall through to WhatsApp. The merchant chose a different number on purpose,
 * often because WhatsApp is the owner's personal phone and the kitchen phone is
 * the one that gets answered. Ringing the number they opted out of would be
 * worse than ringing ops.
 */
export function resolveMerchantRiderPhone(input: {
  customPhone: string | null | undefined;
  whatsappNumber: string | null | undefined;
}): MerchantRiderPhone {
  const custom = input.customPhone?.trim();
  if (custom) {
    const phone = normalizeNigerianMobile(custom);
    return phone
      ? { ok: true, phone, source: "merchant_custom" }
      : { ok: false, reason: "invalid_number", source: "merchant_custom" };
  }

  const whatsapp = input.whatsappNumber?.trim();
  if (whatsapp) {
    const phone = normalizeNigerianMobile(whatsapp);
    return phone
      ? { ok: true, phone, source: "merchant_whatsapp" }
      : { ok: false, reason: "invalid_number", source: "merchant_whatsapp" };
  }

  return { ok: false, reason: "no_number", source: null };
}

// ── The booking's side ──────────────────────────────────────────────────────

/** `bolt_rides.rider_contact_source` — whose phone a ride was booked with. */
export type RiderContactSource = "ops" | MerchantRiderPhoneSource;

/** Why a ride went out with the ops line. Null whenever a merchant number was used. */
export type RiderContactFallbackReason =
  /** Rollout mode is "ops" — the feature is off for everyone. */
  | "rollout_off"
  /** Rollout mode is "selected" and this store hasn't been selected. */
  | "not_selected"
  /** No custom number and no WhatsApp number. */
  | "no_number"
  /** The number we would have used isn't a Nigerian mobile. */
  | "invalid_number"
  /** The store's contact fields couldn't be read. Booking carried on regardless. */
  | "lookup_failed";

export interface ResolvedRiderContact {
  /** E.164. Exactly what goes into Bolt's `user.phone`. */
  phone: string;
  source: RiderContactSource;
  fallbackReason: RiderContactFallbackReason | null;
}

/** The number a ride is booked with. Always returns something bookable. */
export function resolveRiderContact(input: {
  mode: RiderContactMode;
  /** restaurants.rider_contact_selected */
  selected: boolean;
  customPhone: string | null | undefined;
  whatsappNumber: string | null | undefined;
  /** platform_settings.bolt_rider_contact_phone — already E.164 by its CHECK. */
  opsPhone: string;
}): ResolvedRiderContact {
  if (!isMerchantRiderContactLive(input.mode, input.selected)) {
    return {
      phone: input.opsPhone,
      source: "ops",
      fallbackReason: input.mode === "selected" ? "not_selected" : "rollout_off",
    };
  }

  const merchant = resolveMerchantRiderPhone(input);
  if (merchant.ok) {
    return { phone: merchant.phone, source: merchant.source, fallbackReason: null };
  }
  return { phone: input.opsPhone, source: "ops", fallbackReason: merchant.reason };
}

// ── Merchant input ──────────────────────────────────────────────────────────

/**
 * Validates what a merchant typed into the "different number" field.
 *
 * Blank means "use my WhatsApp number", which is stored as NULL rather than
 * as a copy of it. A copy would quietly go stale the day they change WhatsApp
 * numbers. NULL keeps following it.
 */
export function parseRiderContactInput(
  raw: unknown
): { ok: true; phone: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, phone: null };
  if (typeof raw !== "string") return { ok: false, error: "Phone number must be text" };
  if (!raw.trim()) return { ok: true, phone: null };

  const phone = normalizeNigerianMobile(raw);
  return phone
    ? { ok: true, phone }
    : {
        ok: false,
        error: "Enter a Nigerian mobile number, e.g. 0803 123 4567 or +234 803 123 4567",
      };
}

// ── Shared API shape ────────────────────────────────────────────────────────

/** GET/PATCH /api/merchant/rider-contact. Read by web settings and the mobile app. */
export interface RiderContactStatus {
  /** restaurants.rider_contact_phone. NULL = follow the WhatsApp number. */
  customPhone: string | null;
  /** restaurants.whatsapp_number, as stored (may be unnormalised). */
  whatsappNumber: string | null;
  /** Whether the rollout includes this store right now. */
  live: boolean;
  /** What riders get once live, given the numbers above. */
  merchant: MerchantRiderPhone;
}
