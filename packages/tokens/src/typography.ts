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

/**
 * Resolved per-weight native family names used by the mobile app (React Native
 * needs one family per weight; see `apps/mobile/src/lib/fonts.ts`). Kept here so
 * the mapping lives alongside the platform-agnostic font tokens, but it's only
 * consumed by the mobile runtime. Web continues to use `fontFamily` above.
 */
export const nativeFontFamily = {
  /** Body / UI — Geist (matches web `sans`). */
  body: {
    regular: "Geist_400Regular",
    medium: "Geist_500Medium",
    semibold: "Geist_600SemiBold",
    bold: "Geist_700Bold",
    extrabold: "Geist_800ExtraBold",
  },
  /** Display / headings — Poppins (matches web display family). */
  display: {
    regular: "Poppins_400Regular",
    medium: "Poppins_500Medium",
    semibold: "Poppins_600SemiBold",
    bold: "Poppins_700Bold",
    extrabold: "Poppins_800ExtraBold",
  },
} as const;

export type NativeFontFamilyTokens = typeof nativeFontFamily;
