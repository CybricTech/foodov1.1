/**
 * Kitchyn brand color tokens — platform-agnostic.
 *
 * These are the canonical brand colors ported from the web platform
 * (`apps/web/tailwind.config.ts`). They are consumed by:
 *   - the web Tailwind config (web), and
 *   - the mobile NativeWind config / theme (`apps/mobile`).
 *
 * Keep this the single source of truth so web and mobile stay brand-identical.
 */

/** Primary brand purple. */
export const primary = {
  50: "#F5EEFF",
  100: "#E0AAFF",
  200: "#C77DFF",
  400: "#9D4EDD",
  500: "#7B2CBF",
  600: "#5A189A",
  700: "#3C096C",
  800: "#240046",
  900: "#10002B",
} as const;

/** Error / destructive — cinnabar. */
export const cinnabar = {
  100: "#FDEAEA",
  500: "#E63946",
} as const;

/** Warning — dixie. */
export const dixie = {
  100: "#FFF3E0",
  500: "#F4A261",
} as const;

/** Success — viridian. */
export const viridian = {
  100: "#E8F5EE",
  500: "#2D6A4F",
} as const;

/** Accent gold. */
export const gold = "#FFC629" as const;

/** Neutral black scale. */
export const black = {
  50: "#F9F9F9",
  100: "#F2F2F2",
  200: "#E0E0E0",
  400: "#9E9E9E",
  500: "#757575",
  900: "#212121",
  950: "#121212",
} as const;

export const white = "#FFFFFF" as const;

/**
 * Semantic state aliases mapped onto the raw palettes above. These are what
 * UI code should reference for status colors so the meaning is explicit.
 */
export const semantic = {
  error: cinnabar,
  warning: dixie,
  success: viridian,
} as const;

export const colors = {
  primary,
  cinnabar,
  dixie,
  viridian,
  gold,
  black,
  white,
} as const;

export type BrandColors = typeof colors;
