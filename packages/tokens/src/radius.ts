/**
 * Border-radius scale (in px) ported from the web design system.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 16,
  "3xl": 24,
  full: 9999,
} as const;

export type RadiusScale = typeof radius;
