export { DEFAULT_SHOP_STYLES } from "./defaults.js";
export {
  DEFAULT_ATC_CODE,
  DEFAULT_GHOST_BUTTON_CODE,
  DEFAULT_OUTLINE_BUTTON_CODE,
  DEFAULT_PRIMARY_BUTTON_CODE,
  DEFAULT_SECONDARY_BUTTON_CODE,
} from "./default-button-css.js";
export { mergeLoadedShopStyles } from "./merge-styles.js";
export { buildShopThemeCSS, buildGoogleFontsLinkHref } from "./build-css.js";
export {
  buildHeaderChromeBackground,
  buildHeaderChromeBackgroundForViewport,
  buildHeaderChromeBackgroundsByViewport,
  effectiveGradientEnabled,
  resolveHeaderStringsForCss,
  buildHeaderSurfaceCssVars,
} from "./header-chrome.js";
export { buildHeaderSurfaceCssVarsFromRoute } from "./header-route-vars.js";
export {
  collectTypographyGoogleFamilies,
  buildGoogleFontsLinkHrefForFamilies,
  firstFontFamilyFromCssStack,
} from "./typography-fonts.js";
export { buildSecondNavSurfacesByViewport } from "./second-nav-vars.js";
export {
  resolveSecondNavLinkStyles,
  resolveSecondNavLinkStyleForViewport,
} from "./second-nav-link-style.js";
export {
  resolveViewportTier,
  buildShopLogoSlotsFromSettings,
  pickShopLogoSlot,
} from "./logo-branding.js";
export {
  resolveEffectiveLayoutSurfaces,
  applyUnifiedNavbarPreset,
} from "./styles-admin-preview.js";
export {
  applyLayoutPresets,
  TOPBAR_PRESET_LABELS,
  HEADER_PRESET_LABELS,
  SECOND_NAV_PRESET_LABELS,
  SECOND_NAV_LINK_STYLE_OPTIONS,
  SCROLL_UP_PRESET_LABELS,
} from "./layout-presets.js";
export {
  EU_ORIGIN_META_KEYS,
  EU_ORIGIN_STATUS,
  DEFAULT_MADE_IN_EUROPE_BADGE,
  pickEuOriginFromMetadata,
  isEuOriginVerified,
  mergeMadeInEuropeBadge,
} from "./eu-origin.js";
export { ensureActiveVariant, mergeButtonCatalog, normalizeButtonType } from "./button-merge.js";
export { DEFAULT_BUTTON_COLORS, buildButtonColorVarLines, BUTTON_COLOR_VAR_PREFIX } from "./button-type-colors.js";
