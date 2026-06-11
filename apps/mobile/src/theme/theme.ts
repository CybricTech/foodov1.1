/**
 * Mobile theme — a typed, JS-accessible mirror of the brand tokens for use in
 * places where NativeWind className strings aren't ergonomic (e.g. passing a
 * color into a native prop like StatusBar, ActivityIndicator, splash, etc.).
 *
 * Source of truth is `@foodo/tokens` — do not redefine colors here.
 */
import {
  primary,
  cinnabar,
  dixie,
  viridian,
  gold,
  black,
  white,
  radius,
  fontFamily,
} from "@foodo/tokens";

export const theme = {
  colors: {
    primary,
    cinnabar,
    dixie,
    viridian,
    gold,
    black,
    white,
    /** Brand purple used for the app shell / splash. */
    brand: primary[500],
    brandDark: primary[600],
    background: white,
    foreground: black[900],
    muted: black[500],
    border: black[200],
    success: viridian[500],
    warning: dixie[500],
    error: cinnabar[500],
  },
  radius,
  fontFamily,
} as const;

export type AppTheme = typeof theme;
