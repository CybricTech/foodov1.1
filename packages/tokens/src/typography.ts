/**
 * Typography tokens.
 *
 * Font family *names* are platform-agnostic; the actual font files / loading
 * mechanism differ per platform. Mobile loads these via expo-font (or system
 * fallbacks) and maps them in the NativeWind theme.
 */
export const fontFamily = {
  /** Body / UI text. Geist on web; system stack fallback elsewhere. */
  sans: ["Geist", "system-ui", "sans-serif"],
  /** Display / headings. Poppins or Plus Jakarta Sans. */
  display: ["Poppins", "Plus Jakarta Sans", "system-ui", "sans-serif"],
} as const;

export type FontFamilyTokens = typeof fontFamily;
