/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#FF6B35",
        "primary-dark": "#E55A25",
        online: "#2D6A4F",
        cinnabar: {
          500: "#E63946",
        },
      },
      borderRadius: {
        card: "16px",
        btn: "12px",
        chip: "999px",
      },
    },
  },
  plugins: [],
};
