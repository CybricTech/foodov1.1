/**
 * NativeWind (Tailwind) configuration for the Kitchyn Merchant app.
 *
 * Brand tokens are imported from the shared `@foodo/tokens` package so the
 * mobile palette stays byte-identical to web. We require the compiled token
 * objects directly; `@foodo/tokens` is pure data (no react-native / react-dom),
 * so it is safe to require from this Node-evaluated config.
 */
const {
  primary,
  cinnabar,
  dixie,
  viridian,
  gold,
  black,
  white,
  radius,
} = require("@foodo/tokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary,
        cinnabar,
        dixie,
        viridian,
        gold,
        black,
        white,
        // Semantic aliases for status UI.
        error: cinnabar,
        warning: dixie,
        success: viridian,
      },
      borderRadius: {
        xl: `${radius.xl}px`,
        "2xl": `${radius["2xl"]}px`,
        "3xl": `${radius["3xl"]}px`,
      },
      fontFamily: {
        sans: ["Geist", "System"],
        display: ["Poppins", "System"],
      },
    },
  },
  plugins: [],
};
