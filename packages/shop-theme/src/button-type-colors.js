/**
 * Editable button colors (Sellercentral) → CSS vars --btn-{type}-{key}
 * Fallbacks in default-button-css.js match these defaults.
 */

export const DEFAULT_BUTTON_COLORS = {
  add_to_cart: {
    bg: "#ff971c",
    border: "#ef8200",
    hover_bg: "#ef8200",
    icon_bg: "#ef8200",
    text: "#ffffff",
    icon_stroke: "#ffffff",
    disabled_bg: "#9ca3af",
    disabled_border: "#9ca3af",
  },
  primary: {
    bg: "#ffb14d",
    shine: "#ff971c",
    text: "#131313",
    border: "#000000",
    shadow: "#000000",
    hover_bg: "#ff971c",
    hover_text: "#ffffff",
    hover_border: "#0d3b66",
    hover_shadow: "#0d3b66",
  },
  secondary: {
    bg: "#ffffff",
    text: "#111827",
    border: "#111827",
    hover_bg: "#111827",
    hover_text: "#ffffff",
  },
  ghost: {
    text: "#ff971c",
    hover_bg: "rgba(255, 151, 28, 0.12)",
    hover_text: "#ef8200",
  },
  outline: {
    accent: "#ff971c",
    hover_text: "#ffffff",
  },
};

/** CSS custom property suffix after --btn-{prefix}- */
export const BUTTON_COLOR_VAR_PREFIX = {
  add_to_cart: "atc",
  primary: "primary",
  secondary: "secondary",
  ghost: "ghost",
  outline: "outline",
};

/**
 * @param {Record<string, Record<string, string>>} buttons — merged theme.buttons
 * @returns {string} lines for :root (no wrapping braces)
 */
export function buildButtonColorVarLines(buttons) {
  if (!buttons || typeof buttons !== "object") return "";
  const lines = [];
  for (const [typeKey, prefix] of Object.entries(BUTTON_COLOR_VAR_PREFIX)) {
    const colors = buttons[typeKey]?.colors;
    if (!colors || typeof colors !== "object") continue;
    for (const [k, v] of Object.entries(colors)) {
      if (v == null || String(v).trim() === "") continue;
      const cssKey = k.replace(/_/g, "-");
      lines.push(`  --btn-${prefix}-${cssKey}: ${String(v).trim()};`);
    }
  }
  return lines.join("\n");
}
