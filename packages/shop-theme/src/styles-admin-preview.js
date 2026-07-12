import { applyLayoutPresets } from "./layout-presets.js";
import { mergeLoadedShopStyles } from "./merge-styles.js";
import {
  buildHeaderChromeBackgroundsByViewport,
  resolveHeaderStringsForCss,
} from "./header-chrome.js";
import { buildSecondNavSurfacesByViewport } from "./second-nav-vars.js";

const PRIMARY_TOKEN = "__PRIMARY__";

function replacePrimary(val, primary) {
  if (typeof val !== "string") return val;
  return val.split(PRIMARY_TOKEN).join(primary || "#ff971c");
}

function resolveSectionStrings(section, primary) {
  if (!section || typeof section !== "object") return section;
  const out = { ...section };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") out[k] = replacePrimary(out[k], primary);
  }
  return out;
}

/**
 * Effective header + second-nav surfaces as rendered in the shop (presets + defaults applied).
 * Used by Sellercentral Styles page for placeholders / live hints.
 */
export function resolveEffectiveLayoutSurfaces(rawStyles) {
  const merged = mergeLoadedShopStyles(rawStyles || {});
  const withPresets = applyLayoutPresets(merged);
  const primary = merged.colors?.primary || "#ff971c";
  const header = resolveHeaderStringsForCss(withPresets.header, primary);
  const secondNav = resolveSectionStrings(withPresets.secondNav, primary);
  return {
    headerChrome: buildHeaderChromeBackgroundsByViewport(header, primary),
    secondNav: buildSecondNavSurfacesByViewport(secondNav),
  };
}

/**
 * Recommended unified navbar: transparent gradient header + second nav #f9fafb on scroll reveal.
 * @param {Record<string, unknown>} prev — current styles state
 */
export function applyUnifiedNavbarPreset(prev) {
  const primary = prev?.colors?.primary || "#ff971c";
  return {
    ...prev,
    header: {
      ...(prev.header || {}),
      variant: prev.header?.variant || "floating",
      bg_color: "transparent",
      bg_gradient_enabled: true,
      bg_gradient_enabled_desktop: true,
      bg_gradient_enabled_tablet: true,
      bg_gradient_enabled_mobile: true,
      bg_gradient_end: primary,
      bg_gradient_angle: 180,
      bg_gradient_intensity: 88,
      shadow: "none",
      border_bottom: "none",
      text_color: prev.header?.text_color || "#111827",
    },
    secondNav: {
      ...(prev.secondNav || {}),
      variant: prev.secondNav?.variant || "default",
      bg_color: "#f9fafb",
      bg_desktop: "#f9fafb",
      bg_tablet: "#f9fafb",
      bg_mobile: "#f9fafb",
      border: "none",
      border_desktop: "none",
      border_tablet: "none",
      border_mobile: "none",
      text_color: prev.secondNav?.text_color || "#374151",
      active_color: prev.secondNav?.active_color || primary,
      hide_on_scroll: true,
      chrome_covers_on_scroll: false,
      link_style_desktop: prev.secondNav?.link_style_desktop || "classic",
      link_style_tablet: prev.secondNav?.link_style_tablet || "pill",
      link_style_mobile: prev.secondNav?.link_style_mobile || "pill",
    },
    mobileChrome: {
      ...(prev.mobileChrome || {}),
      header_on_scroll: "frosted_white",
      header_sticky: true,
    },
  };
}
