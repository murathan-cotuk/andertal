const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/design-system/**/*.{js,ts,jsx,tsx}",
    path.resolve(__dirname, "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#FF6A00",
          hover: "#E65F00",
          active: "#CC5400",
          light: "#FFF2E6",
        },
        dark: {
          900: "#1A1A1A",
          800: "#2A2A2A",
          700: "#3A3A3A",
          600: "#555555",
          500: "#777777",
        },
        background: {
          main: "#FFFFFF",
          soft: "#FAFAFA",
          card: "#FFFFFF",
        },
        border: {
          light: "#EEEEEE",
        },
        state: {
          success: "#1F9D55",
          error: "#E02424",
          warning: "#F59E0B",
          info: "#2563EB",
        },
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
        "3xl": "64px",
      },
      fontFamily: {
        sans: ['"Inter"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "sans-serif"],
      },
      fontSize: {
        h1: ["40px", { lineHeight: "1.4" }],
        h2: ["32px", { lineHeight: "1.4" }],
        h3: ["24px", { lineHeight: "1.4" }],
        h4: ["20px", { lineHeight: "1.5" }],
        "body-lg": ["18px", { lineHeight: "1.5" }],
        body: ["16px", { lineHeight: "1.5" }],
        small: ["14px", { lineHeight: "1.6" }],
        micro: ["12px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        card: "12px",
        button: "8px",
        input: "8px",
        modal: "16px",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.04)",
        "card-hover": "0 6px 20px rgba(0,0,0,0.08)",
        modal: "0 20px 60px rgba(0,0,0,0.15)",
      },
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
