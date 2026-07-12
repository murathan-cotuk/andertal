import { applyLayoutPresets } from "./layout-presets.js";

/** @typedef {'desktop'|'tablet'|'mobile'} SecondNavViewportBand */
/** @typedef {'classic'|'pill'} SecondNavLinkStyle */

const DEFAULT_BY_VP = {
  desktop: "classic",
  tablet: "pill",
  mobile: "pill",
};

/**
 * @param {unknown} value
 * @param {SecondNavLinkStyle} fallback
 * @returns {SecondNavLinkStyle}
 */
function normalize(value, fallback) {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "classic" || s === "pill") return s;
  return fallback;
}

/**
 * Effective second-nav link style per viewport (after layout variant presets).
 * Breakpoints match StylesPage: mobile ≤767, tablet 768–1023, desktop ≥1024.
 *
 * @param {Record<string, unknown>} mergedStyles — output of mergeLoadedShopStyles
 * @returns {{ desktop: SecondNavLinkStyle, tablet: SecondNavLinkStyle, mobile: SecondNavLinkStyle }}
 */
export function resolveSecondNavLinkStyles(mergedStyles) {
  const sn = applyLayoutPresets(mergedStyles || {}).secondNav || {};
  return {
    desktop: normalize(sn.link_style_desktop, DEFAULT_BY_VP.desktop),
    tablet: normalize(sn.link_style_tablet, DEFAULT_BY_VP.tablet),
    mobile: normalize(sn.link_style_mobile, DEFAULT_BY_VP.mobile),
  };
}

/**
 * @param {Record<string, unknown>} mergedStyles
 * @param {SecondNavViewportBand} viewport
 * @returns {SecondNavLinkStyle}
 */
export function resolveSecondNavLinkStyleForViewport(mergedStyles, viewport) {
  const all = resolveSecondNavLinkStyles(mergedStyles);
  return all[viewport] || DEFAULT_BY_VP.desktop;
}
