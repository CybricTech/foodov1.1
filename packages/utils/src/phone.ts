/**
 * Phone number utilities — Nigerian E.164 format (+234XXXXXXXXXX)
 *
 * PRD §7.1.4: Phone number is the CRM key. It is normalized to E.164 (+234XXXXXXXXXX) on input.
 * PRD §7.7: Phone numbers must be normalized to E.164 format before sending SMS.
 */

const NIGERIA_COUNTRY_CODE = "234";
const NIGERIA_PREFIX = "+234";

/**
 * Normalize a Nigerian phone number to E.164 format.
 * Handles:
 *   - 08012345678  → +2348012345678
 *   - 8012345678   → +2348012345678
 *   - +2348012345678 → +2348012345678 (no-op)
 *   - 2348012345678  → +2348012345678
 */
export function normalizeToE164(phone: string): string {
  // Strip all non-digit characters except leading +
  const stripped = phone.replace(/[^\d+]/g, "");

  // Already E.164
  if (stripped.startsWith("+234") && stripped.length === 14) {
    return stripped;
  }

  // Remove leading +
  const digits = stripped.replace(/^\+/, "");

  // +234XXXXXXXXXX → 234XXXXXXXXXX (10 digit local)
  if (digits.startsWith(NIGERIA_COUNTRY_CODE) && digits.length === 13) {
    return `+${digits}`;
  }

  // 0XXXXXXXXXX → +234XXXXXXXXXX
  if (digits.startsWith("0") && digits.length === 11) {
    return `${NIGERIA_PREFIX}${digits.slice(1)}`;
  }

  // XXXXXXXXXX (10 digits, no leading 0)
  if (!digits.startsWith("0") && digits.length === 10) {
    return `${NIGERIA_PREFIX}${digits}`;
  }

  throw new Error(
    `Cannot normalize phone number to E.164: "${phone}". ` +
      `Expected a Nigerian number in format 08012345678, 8012345678, or +2348012345678.`
  );
}

/**
 * Validate that a string is a valid Nigerian phone number (can be normalized).
 */
export function isValidNigerianPhone(phone: string): boolean {
  try {
    normalizeToE164(phone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a phone number for display (e.g., +234 801 234 5678).
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith("+234") || e164.length !== 14) return e164;
  const local = e164.slice(4); // 10 digits
  return `+234 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/**
 * Mask a phone number for display to protect PII (e.g., +234 *** **** 5678).
 */
export function maskPhone(e164: string): string {
  if (!e164.startsWith("+234") || e164.length !== 14) return "***";
  const last4 = e164.slice(-4);
  return `+234 *** **** ${last4}`;
}
