/**
 * Layout “variants” are data-only presets merged before CSS generation.
 * Merchant values win (spread order).
 */

const PRIMARY_TOKEN = "__PRIMARY__";

/** @param {Record<string, Record<string, unknown>>} variants */
export function applyLayoutPresets(styles) {
  const topV = styles?.topbar?.variant || "default";
  const headV = styles?.header?.variant || "default";
  const navV = styles?.secondNav?.variant || "default";
  const upV = styles?.scrollUpButton?.variant || "default";

  return {
    ...styles,
    topbar: { ...TOPBAR_PRESETS[topV], ...(styles.topbar || {}) },
    header: { ...HEADER_PRESETS[headV], ...(styles.header || {}) },
    secondNav: { ...SECOND_NAV_PRESETS[navV], ...(styles.secondNav || {}) },
    scrollUpButton: { ...SCROLL_UP_PRESETS[upV], ...(styles.scrollUpButton || {}) },
  };
}

export const TOPBAR_PRESET_LABELS = [
  { value: "default", label: "Standard" },
  { value: "minimal", label: "Schmal / minimal" },
  { value: "elevated", label: "Mit Schatten" },
  { value: "accent_line", label: "Akzent-Linie unten" },
];

export const HEADER_PRESET_LABELS = [
  { value: "default", label: "Standard" },
  { value: "flat", label: "Flach (ohne Schatten)" },
  { value: "floating", label: "Leicht schwebend" },
  { value: "underline", label: "Nur Unterstrich" },
];

export const SECOND_NAV_PRESET_LABELS = [
  { value: "default", label: "Standard" },
  { value: "compact", label: "Kompakt" },
  { value: "pill_bar", label: "Pill-Hintergrund" },
  { value: "contrast", label: "Kontrast-Leiste" },
];

export const SCROLL_UP_PRESET_LABELS = [
  { value: "default", label: "Standard (rund)" },
  { value: "soft", label: "Weich abgerundet" },
  { value: "square", label: "Eckig" },
  { value: "outline", label: "Outline / transparent" },
];

const TOPBAR_PRESETS = {
  default: {},
  minimal: { height: "34px", font_size: "12px", font_weight: "500" },
  elevated: { shadow: "0 6px 22px rgba(15, 23, 42, 0.14)" },
  accent_line: { border_bottom: `2px solid ${PRIMARY_TOKEN}` },
};

const HEADER_PRESETS = {
  default: {},
  flat: { shadow: "none" },
  floating: { shadow: "0 10px 40px -12px rgba(15, 23, 42, 0.18)", border_bottom: "none" },
  underline: { shadow: "none", border_bottom: "1px solid rgba(148, 163, 184, 0.45)" },
};

const SECOND_NAV_PRESETS = {
  default: {},
  compact: { height: "38px", font_size: "13px" },
  pill_bar: { bg_color: "#f1f5f9", font_weight: "600" },
  contrast: {
    bg_color: "#1e293b",
    text_color: "#f8fafc",
    active_color: PRIMARY_TOKEN,
  },
};

const SCROLL_UP_PRESETS = {
  default: { border_radius: "50%" },
  soft: { border_radius: "16px", shadow: "0 10px 28px rgba(15, 23, 42, 0.18)" },
  square: { border_radius: "8px" },
  outline: {
    bg_color: "transparent",
    border: `2px solid ${PRIMARY_TOKEN}`,
    icon_color: PRIMARY_TOKEN,
    shadow: "0 2px 12px rgba(15, 23, 42, 0.08)",
  },
};
