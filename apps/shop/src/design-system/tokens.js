/**
 * Andertal Design System — Premium Marketplace
 * Single source of truth for colors, spacing, typography, shadows, radius.
 * Use via: import { tokens } from '@/design-system/tokens'
 * Tailwind theme is synced from these values in tailwind.config.js
 */

export const tokens = {
  // —— Primary (Brand Orange) — aksiyon rengi, CTA
  primary: {
    DEFAULT: "#ff971c",
    hover: "#E65F00",
    active: "#CC5400",
    light: "#FFF2E6",
  },

  // —— Secondary (Dark Neutral) — metin, siyah yerine antrasit
  dark: {
    900: "#1A1A1A",
    800: "#2A2A2A",
    700: "#3A3A3A",
    600: "#555555",
    500: "#777777",
  },

  // —— Background
  background: {
    main: "#FFFFFF",
    soft: "#FAFAFA",
    card: "#FFFFFF",
  },

  // —— Border
  border: {
    light: "#EEEEEE",
  },

  // —— State
  state: {
    success: "#1F9D55",
    error: "#E02424",
    warning: "#F59E0B",
    info: "#2563EB",
  },

  // —— Spacing (8px grid)
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    "2xl": "48px",
    "3xl": "64px",
  },

  // —— Section / layout
  sectionGap: "64px",
  containerPadding: "24px",

  // —— Typography scale
  fontSize: {
    h1: "40px",
    h2: "32px",
    h3: "24px",
    h4: "20px",
    bodyLg: "18px",
    body: "16px",
    small: "14px",
    micro: "12px",
  },
  lineHeight: {
    tight: 1.4,
    normal: 1.5,
    relaxed: 1.6,
  },
  fontFamily: {
    sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  // —— Border radius
  radius: {
    card: "12px",
    button: "8px",
    input: "8px",
    modal: "16px",
  },

  // —— Shadows (yumuşak)
  shadow: {
    card: "0 2px 8px rgba(0,0,0,0.04)",
    hover: "0 6px 20px rgba(0,0,0,0.08)",
    modal: "0 20px 60px rgba(0,0,0,0.15)",
  },

  // —— Transitions
  transition: {
    fast: "150ms ease",
    base: "200ms ease",
  },

  // —— Layout (component-specific)
  navbar: {
    height: "72px",
    heightCompact: "60px",
    borderBottom: "1px solid #EEEEEE",
  },
  topBar: {
    height: "40px",
    background: "#1A1A1A",
    fontSize: "14px",
  },
  search: {
    dropdownMaxHeight: "400px",
  },
  dropdown: {
    animationMs: 150,
    slidePx: 4,
  },
};

export default tokens;
