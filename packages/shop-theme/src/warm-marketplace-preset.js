/**
 * "Warmer Marktplatz" design preset — opt-in.
 *
 * Nothing here changes a shop on its own: Sellercentral → Styles offers a button that merges this
 * preset into the form state, and it only reaches the storefront after the merchant presses Save.
 * Every value maps onto an existing theme field; new button variants are added next to the existing
 * ones (never replacing them), so switching back is one click in the button editor.
 */

import { mergeLoadedShopStyles } from "./merge-styles.js";

export const WARM_MARKETPLACE_PRESET_ID = "warm_marketplace";

export const WARM_PALETTE = {
  ground: "#F6F2EC",
  surface: "#FFFFFF",
  ink: "#1D1B18",
  muted: "#5E574E",
  line: "#E6DFD4",
  brand: "#EE8A12",
  brandHover: "#D97A06",
  brandText: "#A65300",
  brandSoft: "#FCEBD5",
  sale: "#B42318",
};

const DISPLAY_FONT = '"Bricolage Grotesque", Georgia, serif';
const BODY_FONT_NAME = "Instrument Sans";

const P = WARM_PALETTE;

export const WARM_ATC_BUTTON_CODE = `/* ToCartButton — Warmer Marktplatz */
.atc-btn {
  position: relative;
  width: 100%;
  height: 52px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 999px;
  background-color: var(--btn-atc-bg, ${P.brand});
  padding: 0 20px;
  user-select: none;
  box-sizing: border-box;
  transition: background-color 0.2s ease, transform 0.1s ease;
}
.atc-btn:hover:not(:disabled) { background-color: var(--btn-atc-hover-bg, ${P.brandHover}); }
.atc-btn:active:not(:disabled) { transform: scale(0.98); }
.atc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--btn-atc-disabled-bg, #cfc6b8);
}
.atc-btn__text {
  color: var(--btn-atc-text, ${P.ink});
  font-weight: 700;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  order: 2;
}
.atc-btn__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  order: 1;
  pointer-events: none;
}
.atc-btn__icon svg {
  width: 20px;
  height: 20px;
  stroke: var(--btn-atc-icon-stroke, ${P.ink});
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}`;

export const WARM_PRIMARY_BUTTON_CODE = `/* Primary CTA — Warmer Marktplatz */
.shop-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background-color: var(--btn-primary-bg, ${P.ink});
  color: var(--btn-primary-text, #ffffff);
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.1s ease;
}
.shop-btn:hover:not(:disabled) {
  background-color: var(--btn-primary-hover-bg, #3a352f);
  color: var(--btn-primary-hover-text, #ffffff);
}
.shop-btn:active:not(:disabled) { transform: scale(0.98); }
.shop-btn:disabled { opacity: 0.55; cursor: not-allowed; }`;

export const WARM_SECONDARY_BUTTON_CODE = `/* Secondary — Warmer Marktplatz */
.shop-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border: 2px solid var(--btn-secondary-border, ${P.ink});
  border-radius: 999px;
  background: var(--btn-secondary-bg, #ffffff);
  color: var(--btn-secondary-text, ${P.ink});
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}
.shop-btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover-bg, ${P.ink});
  color: var(--btn-secondary-hover-text, #ffffff);
}
.shop-btn-secondary:disabled { opacity: 0.55; cursor: not-allowed; }`;

export const WARM_GHOST_BUTTON_CODE = `/* Ghost — Warmer Marktplatz */
.shop-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--btn-ghost-text, ${P.brandText});
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease;
}
.shop-btn-ghost:hover:not(:disabled) {
  background: var(--btn-ghost-hover-bg, ${P.brandSoft});
  color: var(--btn-ghost-hover-text, ${P.brandText});
}
.shop-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }`;

export const WARM_OUTLINE_BUTTON_CODE = `/* Outline — Warmer Marktplatz */
.shop-btn-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 24px;
  border: 2px solid var(--btn-outline-accent, ${P.brand});
  border-radius: 999px;
  background: transparent;
  color: ${P.ink};
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.shop-btn-outline:hover:not(:disabled) {
  background: var(--btn-outline-accent, ${P.brand});
  color: var(--btn-outline-hover-text, ${P.ink});
}
.shop-btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }`;

const VARIANT_NAME = "Warmer Marktplatz";

const BUTTON_PRESETS = {
  add_to_cart: {
    code: WARM_ATC_BUTTON_CODE,
    colors: {
      bg: P.brand,
      border: P.brand,
      hover_bg: P.brandHover,
      icon_bg: P.brand,
      text: P.ink,
      icon_stroke: P.ink,
      disabled_bg: "#cfc6b8",
      disabled_border: "#cfc6b8",
    },
  },
  primary: {
    code: WARM_PRIMARY_BUTTON_CODE,
    colors: { bg: P.ink, text: "#ffffff", hover_bg: "#3a352f", hover_text: "#ffffff" },
  },
  secondary: {
    code: WARM_SECONDARY_BUTTON_CODE,
    colors: { bg: "#ffffff", text: P.ink, border: P.ink, hover_bg: P.ink, hover_text: "#ffffff" },
  },
  ghost: {
    code: WARM_GHOST_BUTTON_CODE,
    colors: { text: P.brandText, hover_bg: P.brandSoft, hover_text: P.brandText },
  },
  outline: {
    code: WARM_OUTLINE_BUTTON_CODE,
    colors: { accent: P.brand, hover_text: P.ink },
  },
};

const display = (overrides) => ({ font_family: DISPLAY_FONT, color: P.ink, ...overrides });

/** Partial theme — merged over the merchant's current styles by applyWarmMarketplacePreset. */
export const WARM_MARKETPLACE_STYLES = {
  colors: {
    primary: P.brand,
    secondary: P.ink,
    accent: P.brandText,
    text: P.ink,
    background: P.ground,
  },
  topbar: {
    bg_color: P.ink,
    text_color: "#EFE8DD",
    height: "36px",
    font_size: "13px",
    font_weight: "500",
    shadow: "none",
    border_bottom: "none",
  },
  header: {
    variant: "default",
    bg_color: P.surface,
    bg_image_url: "",
    bg_gradient_enabled: false,
    text_color: P.ink,
    icon_color: P.ink,
    shadow: "none",
    border_bottom: `1px solid ${P.line}`,
    height_desktop: "88px",
  },
  secondNav: {
    variant: "default",
    bg_color: P.surface,
    border: "none",
    text_color: P.ink,
    active_color: P.brandText,
    font_size: "15px",
    font_weight: "500",
    link_style_desktop: "classic",
    link_style_tablet: "pill",
    link_style_mobile: "pill",
    pill_background: P.ground,
    pill_border: "none",
    pill_backdrop: "none",
    pill_border_radius: "999px",
    pill_padding: "6px 14px",
    pill_shadow: "none",
    own_color_at_top_desktop: true,
    height_desktop: "52px",
  },
  footer: {
    bg_color: P.ink,
    text_color: "#D6CEC2",
    border_top: `4px solid ${P.brand}`,
  },
  typography: {
    google_font_family: BODY_FONT_NAME,
    body: { font_family: "", color: P.ink, font_size: "16px", line_height: "1.55" },
    h1: display({ font_weight: "800", letter_spacing: "-0.02em", line_height: "1.05" }),
    h2: display({ font_weight: "800", letter_spacing: "-0.015em", line_height: "1.1" }),
    h3: display({ font_weight: "700", letter_spacing: "-0.01em" }),
    h4: display({ font_weight: "700" }),
    h5: { font_family: "", color: P.ink, font_weight: "700" },
    product_title: display({ font_weight: "800", letter_spacing: "-0.02em", line_height: "1.12" }),
    catalog_title: display({ font_weight: "800", letter_spacing: "-0.02em", line_height: "1.05" }),
    menu_catalog: { font_family: "", color: P.ink, font_weight: "500" },
    sidebar_nav: { font_family: "", color: P.ink, font_weight: "700", letter_spacing: "0" },
    sidebar_submenu: { font_family: "", color: P.muted },
  },
  scrollUpButton: {
    variant: "default",
    bg_color: P.ink,
    icon_color: "#ffffff",
    border_radius: "50%",
    shadow: "0 6px 18px rgba(29,27,24,0.25)",
    border: "none",
  },
  mobileChrome: {
    header_on_scroll: "frosted_white",
    bottom_nav_bg: "rgba(255,255,255,0.97)",
    bottom_nav_border_top: `1px solid ${P.line}`,
    bottom_nav_shadow: "0 -2px 12px rgba(29,27,24,0.06)",
  },
};

function mergeSection(prev, patch) {
  return { ...(prev || {}), ...(patch || {}) };
}

function mergeTypography(prev = {}, patch = {}) {
  const out = { ...prev, ...patch };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = { ...(prev[k] || {}), ...v };
  }
  return out;
}

function mergeButtons(prevButtons = {}) {
  const out = { ...prevButtons };
  for (const [key, preset] of Object.entries(BUTTON_PRESETS)) {
    const prev = prevButtons[key] || { label: key, variants: [] };
    const others = (prev.variants || [])
      .filter((v) => v?.name !== VARIANT_NAME)
      .map((v) => ({ ...v, active: false }));
    out[key] = {
      ...prev,
      colors: { ...(prev.colors || {}), ...preset.colors },
      variants: [{ name: VARIANT_NAME, code: preset.code, active: true }, ...others],
    };
  }
  return out;
}

/**
 * Returns a new styles object with the preset applied; the input is not mutated.
 * Merchant-specific content (topbar items, header scopes, logos, SEO, badges, templates) is kept.
 * @param {Record<string, any>} styles
 */
/** Trust messages shown in the dark top bar when the merchant has not written their own. */
export const WARM_TOPBAR_ITEMS = [
  { text: "Käuferschutz bei jeder Bestellung", link: "" },
  { text: "Bonuspunkte auf jeden Einkauf", link: "" },
  { text: "Marken aus Europa", link: "" },
];

/** Only the desktop height comes from the preset; tablet/mobile keep what the merchant had. */
function keepSmallerViewports(prev = {}, fallback) {
  const base = prev.height || fallback;
  return {
    height_tablet: prev.height_tablet || prev.height_desktop || base,
    height_mobile: prev.height_mobile || prev.height_tablet || prev.height_desktop || base,
  };
}

export function applyWarmMarketplacePreset(styles = {}) {
  const s = WARM_MARKETPLACE_STYLES;
  const prevTopbar = styles.topbar || {};
  const hasTopbarItems = Array.isArray(prevTopbar.items) && prevTopbar.items.some((it) => String(it?.text || "").trim());
  return {
    ...styles,
    colors: mergeSection(styles.colors, s.colors),
    topbar: {
      ...mergeSection(prevTopbar, s.topbar),
      ...(hasTopbarItems ? {} : { items: WARM_TOPBAR_ITEMS, enabled: true, display_mode: "inline" }),
    },
    header: { ...mergeSection(styles.header, s.header), ...keepSmallerViewports(styles.header, "72px") },
    secondNav: { ...mergeSection(styles.secondNav, s.secondNav), ...keepSmallerViewports(styles.secondNav, "44px") },
    footer: mergeSection(styles.footer, s.footer),
    typography: mergeTypography(styles.typography, s.typography),
    scrollUpButton: mergeSection(styles.scrollUpButton, s.scrollUpButton),
    mobileChrome: mergeSection(styles.mobileChrome, s.mobileChrome),
    buttons: mergeButtons(styles.buttons),
    design_preset: WARM_MARKETPLACE_PRESET_ID,
  };
}

export const CLASSIC_DESIGN_PRESET_ID = "classic";

/**
 * Styles the storefront renders with. "Warmer Marktplatz" is the default design: when the merchant
 * has never chosen a design (no `design_preset` saved), the preset is applied on top of the saved
 * styles at render time — nothing is written to the database. Once a design is saved in
 * Sellercentral (the preset itself, or "classic"), the saved styles are used exactly as stored.
 * @param {Record<string, any>} raw — styles as loaded from the API
 */
export function resolveStorefrontStyles(raw = {}) {
  const merged = mergeLoadedShopStyles(raw || {});
  const chosen = typeof raw?.design_preset === "string" ? raw.design_preset.trim() : "";
  if (chosen) return merged;
  return applyWarmMarketplacePreset(merged);
}
