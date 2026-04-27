import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // White-label brand color — injected per-restaurant via CSS variable
        primary: "var(--brand-color, #2D6A4F)",
        "primary-foreground": "#ffffff",
        // Design system from prototype
        viridian: {
          100: "#E8F5EE",
          200: "#C6E6D4",
          500: "#2D6A4F",
        },
        // Dashboard brand palette
        purple: {
          50:  "#F5EEFF",
          100: "#E0AAFF",
          200: "#C77DFF",
          400: "#9D4EDD",
          500: "#7B2CBF",
          600: "#5A189A",
          700: "#3C096C",
          800: "#240046",
          900: "#10002B",
        },
        cinnabar: {
          100: "#FDEAEA",
          200: "#F5C0C3",
          500: "#E63946",
        },
        dixie: {
          100: "#FFF3E0",
          500: "#F4A261",
        },
        gold: {
          DEFAULT: "#FFC629",
          50:      "#FFFBEB",
          100:     "#FFF3CD",
          600:     "#CC9800",
        },
        black: {
          50:  "#F9F9F9",
          100: "#F2F2F2",
          200: "#E0E0E0",
          400: "#9E9E9E",
          500: "#757575",
          900: "#212121",
          950: "#121212",
        },
      },
      fontFamily: {
        sans:     ["Geist", "system-ui", "sans-serif"],
        epilogue: ["Epilogue", "system-ui", "sans-serif"],
        jakarta:  ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl:  "12px",
        "2xl": "16px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
