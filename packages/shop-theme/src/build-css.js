import { applyLayoutPresets } from "./layout-presets.js";
import { mergeLoadedShopStyles } from "./merge-styles.js";
import { buildButtonColorVarLines } from "./button-type-colors.js";
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

function levelFontFamily(typo, levelKey) {
  const level = typo[levelKey] || {};
  const explicit = (level.font_family || "").trim();
  if (explicit) return explicit;
  const g = (typo.google_font_family || "").trim();
  if (g) return `"${g.replace(/"/g, "")}", system-ui, sans-serif`;
  const legacy = (typo.font_family || "").trim();
  if (legacy) return legacy;
  return `"Inter", system-ui, sans-serif`;
}

function getActiveCode(buttons, key) {
  const btn = buttons?.[key];
  if (!btn?.variants?.length) return "";
  const active = btn.variants.find((v) => v.active) || btn.variants[0];
  return active?.code || "";
}

/**
 * Google Fonts CSS2 URL — broad ital/wght bundle for storefront.
 * @param {string} family
 */
export function buildGoogleFontsLinkHref(family) {
  const name = (family || "").trim();
  if (!name) return null;
  const enc = encodeURIComponent(name).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${enc}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700&display=swap`;
}

/**
 * @param {Record<string, unknown>} rawStyles — from API or defaults
 * @param {{ merge?: boolean }} opts — merge defaults + migrations when true
 */
export function buildShopThemeCSS(rawStyles, opts = { merge: true }) {
  const merged = opts.merge === false ? rawStyles : mergeLoadedShopStyles(rawStyles || {});
  const styles = applyLayoutPresets(merged);
  const colors = { ...styles.colors };
  const primary = colors.primary || "#ff971c";

  const topbar = resolveSectionStrings(styles.topbar, primary);
  const header = resolveHeaderStringsForCss(styles.header, primary);
  const secondNav = resolveSectionStrings(styles.secondNav, primary);
  const headerChromeByVp = buildHeaderChromeBackgroundsByViewport(header, primary);
  const secondNavVp = buildSecondNavSurfacesByViewport(secondNav);
  const footer = styles.footer || {};
  const typo = styles.typography || {};
  const scrollUp = resolveSectionStrings(styles.scrollUpButton, primary);
  const buttons = styles.buttons || {};

  const bodyFont = levelFontFamily(typo, "body");

  const h = (n) => typo[`h${n}`] || {};
  const pt = typo.product_title || {};
  const ct = typo.catalog_title || {};
  const mc = typo.menu_catalog || {};
  const v = (level, prop, fall) => {
    const val = level[prop];
    return val !== undefined && val !== "" ? val : fall;
  };

  const buttonColorCssVars = buildButtonColorVarLines(buttons);

  const vars = `:root {
  --shop-primary:    ${colors.primary};
  --shop-secondary:  ${colors.secondary};
  --shop-accent:     ${colors.accent};
  --shop-text:       ${colors.text};
  --shop-bg:         ${colors.background};
  --topbar-bg:       ${topbar.bg_color};
  --topbar-text:     ${topbar.text_color};
  --topbar-height:   ${topbar.height};
  --topbar-fs:       ${topbar.font_size};
  --topbar-fw:       ${topbar.font_weight};
  --topbar-shadow:   ${topbar.shadow || "none"};
  --topbar-border-bottom: ${topbar.border_bottom || "none"};
  --header-bg:       ${header.bg_color};
  --header-chrome-bg: ${headerChromeByVp.desktop};
  --header-text:     ${header.text_color};
  --header-h:        ${header.height};
  --header-shadow:   ${header.shadow};
  --header-border:   ${header.border_bottom};
  --second-nav-bg:   ${secondNavVp.desktop.bg};
  --second-nav-border: ${secondNavVp.desktop.border};
  --second-nav-text: ${secondNavVp.desktop.text};
  --second-nav-active: ${secondNavVp.desktop.active};
  --second-nav-h:    ${secondNav.height};
  --second-nav-fs:   ${secondNav.font_size};
  --second-nav-fw:   ${secondNav.font_weight};
  --second-nav-pill-bg:       ${secondNav.pill_background != null && secondNav.pill_background !== "" ? secondNav.pill_background : "rgba(255,255,255,0.32)"};
  --second-nav-pill-border: ${secondNav.pill_border != null && secondNav.pill_border !== "" ? secondNav.pill_border : "none"};
  --second-nav-pill-backdrop: ${secondNav.pill_backdrop != null && secondNav.pill_backdrop !== "" ? secondNav.pill_backdrop : "blur(12px)"};
  --second-nav-pill-radius:   ${secondNav.pill_border_radius != null && secondNav.pill_border_radius !== "" ? secondNav.pill_border_radius : "10px"};
  --second-nav-pill-padding:  ${secondNav.pill_padding != null && secondNav.pill_padding !== "" ? secondNav.pill_padding : "6px 14px"};
  --second-nav-pill-shadow:   ${secondNav.pill_shadow != null && secondNav.pill_shadow !== "" ? secondNav.pill_shadow : "none"};
  --footer-bg:       ${footer.bg_color};
  --footer-text:     ${footer.text_color};
  --footer-border:   ${footer.border_top};
  --body-font:       ${bodyFont};
  --body-fs:         ${v(typo.body, "font_size", "16px")};
  --body-lh:         ${v(typo.body, "line_height", "1.6")};
  --body-color:      ${v(typo.body, "color", "#111827")};
  --body-fw:         ${v(typo.body, "font_weight", "400")};
  --body-style:      ${v(typo.body, "font_style", "normal")};
  --h1-fs:           ${v(h(1), "font_size", "clamp(28px,5vw,52px)")};
  --h1-fw:           ${v(h(1), "font_weight", "800")};
  --h1-style:        ${v(h(1), "font_style", "normal")};
  --h1-color:        ${v(h(1), "color", "#111827")};
  --h1-ls:           ${v(h(1), "letter_spacing", "-0.02em")};
  --h1-lh:           ${v(h(1), "line_height", "1.15")};
  --h1-ff:           ${levelFontFamily(typo, "h1")};
  --h2-fs:           ${v(h(2), "font_size", "clamp(22px,3.5vw,36px)")};
  --h2-fw:           ${v(h(2), "font_weight", "700")};
  --h2-style:        ${v(h(2), "font_style", "normal")};
  --h2-color:        ${v(h(2), "color", "#111827")};
  --h2-ls:           ${v(h(2), "letter_spacing", "-0.01em")};
  --h2-lh:           ${v(h(2), "line_height", "1.2")};
  --h2-ff:           ${levelFontFamily(typo, "h2")};
  --h3-fs:           ${v(h(3), "font_size", "1.25rem")};
  --h3-fw:           ${v(h(3), "font_weight", "700")};
  --h3-style:        ${v(h(3), "font_style", "normal")};
  --h3-color:        ${v(h(3), "color", "#111827")};
  --h3-ls:           ${v(h(3), "letter_spacing", "-0.01em")};
  --h3-lh:           ${v(h(3), "line_height", "1.25")};
  --h3-ff:           ${levelFontFamily(typo, "h3")};
  --h4-fs:           ${v(h(4), "font_size", "1.125rem")};
  --h4-fw:           ${v(h(4), "font_weight", "600")};
  --h4-style:        ${v(h(4), "font_style", "normal")};
  --h4-color:        ${v(h(4), "color", "#111827")};
  --h4-ls:           ${v(h(4), "letter_spacing", "0")};
  --h4-lh:           ${v(h(4), "line_height", "1.3")};
  --h4-ff:           ${levelFontFamily(typo, "h4")};
  --h5-fs:           ${v(h(5), "font_size", "1rem")};
  --h5-fw:           ${v(h(5), "font_weight", "600")};
  --h5-style:        ${v(h(5), "font_style", "normal")};
  --h5-color:        ${v(h(5), "color", "#111827")};
  --h5-ls:           ${v(h(5), "letter_spacing", "0")};
  --h5-lh:           ${v(h(5), "line_height", "1.35")};
  --h5-ff:           ${levelFontFamily(typo, "h5")};
  --product-title-fs:    ${v(pt, "font_size", "clamp(1.25rem, 2.5vw, 1.75rem)")};
  --product-title-fw:    ${v(pt, "font_weight", "700")};
  --product-title-style: ${v(pt, "font_style", "normal")};
  --product-title-color: ${v(pt, "color", "#111827")};
  --product-title-ls:    ${v(pt, "letter_spacing", "-0.02em")};
  --product-title-lh:    ${v(pt, "line_height", "1.3")};
  --product-title-ff:    ${levelFontFamily(typo, "product_title")};
  --catalog-title-fs:    ${v(ct, "font_size", "clamp(1.125rem, 2.8vw, 2rem)")};
  --catalog-title-fw:    ${v(ct, "font_weight", "700")};
  --catalog-title-style: ${v(ct, "font_style", "normal")};
  --catalog-title-color: ${v(ct, "color", "#111827")};
  --catalog-title-ls:    ${v(ct, "letter_spacing", "-0.02em")};
  --catalog-title-lh:    ${v(ct, "line_height", "1.2")};
  --catalog-title-ff:    ${levelFontFamily(typo, "catalog_title")};
  --menu-catalog-fs:     ${v(mc, "font_size", "15px")};
  --menu-catalog-fw:     ${v(mc, "font_weight", "500")};
  --menu-catalog-style:  ${v(mc, "font_style", "normal")};
  --menu-catalog-color:  ${v(mc, "color", "#374151")};
  --menu-catalog-ls:     ${v(mc, "letter_spacing", "0")};
  --menu-catalog-lh:     ${v(mc, "line_height", "1.35")};
  --menu-catalog-ff:     ${levelFontFamily(typo, "menu_catalog")};
  --scroll-up-bg:    ${scrollUp.bg_color};
  --scroll-up-icon:  ${scrollUp.icon_color};
  --scroll-up-r:     ${scrollUp.border_radius};
  --scroll-up-size:  ${scrollUp.size};
  --scroll-up-shadow: ${scrollUp.shadow};
  --scroll-up-border: ${scrollUp.border || "none"};
${buttonColorCssVars ? `\n${buttonColorCssVars}` : ""}
}
@media (max-width: 1023px) {
  :root {
    --header-chrome-bg: ${headerChromeByVp.tablet};
    --second-nav-bg: ${secondNavVp.tablet.bg};
    --second-nav-border: ${secondNavVp.tablet.border};
    --second-nav-text: ${secondNavVp.tablet.text};
    --second-nav-active: ${secondNavVp.tablet.active};
  }
}
@media (max-width: 767px) {
  :root {
    --header-chrome-bg: ${headerChromeByVp.mobile};
    --second-nav-bg: ${secondNavVp.mobile.bg};
    --second-nav-border: ${secondNavVp.mobile.border};
    --second-nav-text: ${secondNavVp.mobile.text};
    --second-nav-active: ${secondNavVp.mobile.active};
  }
}`;

  const componentCSS = `
body {
  font-family: var(--body-font);
  font-size: var(--body-fs);
  line-height: var(--body-lh);
  font-weight: var(--body-fw);
  font-style: var(--body-style);
  color: var(--body-color);
  background: var(--shop-bg);
}
h1 {
  font-family: var(--h1-ff);
  font-size: var(--h1-fs);
  font-weight: var(--h1-fw);
  font-style: var(--h1-style);
  color: var(--h1-color);
  letter-spacing: var(--h1-ls);
  line-height: var(--h1-lh);
}
h2 {
  font-family: var(--h2-ff);
  font-size: var(--h2-fs);
  font-weight: var(--h2-fw);
  font-style: var(--h2-style);
  color: var(--h2-color);
  letter-spacing: var(--h2-ls);
  line-height: var(--h2-lh);
}
h3 {
  font-family: var(--h3-ff);
  font-size: var(--h3-fs);
  font-weight: var(--h3-fw);
  font-style: var(--h3-style);
  color: var(--h3-color);
  letter-spacing: var(--h3-ls);
  line-height: var(--h3-lh);
}
h4 {
  font-family: var(--h4-ff);
  font-size: var(--h4-fs);
  font-weight: var(--h4-fw);
  font-style: var(--h4-style);
  color: var(--h4-color);
  letter-spacing: var(--h4-ls);
  line-height: var(--h4-lh);
}
h5 {
  font-family: var(--h5-ff);
  font-size: var(--h5-fs);
  font-weight: var(--h5-fw);
  font-style: var(--h5-style);
  color: var(--h5-color);
  letter-spacing: var(--h5-ls);
  line-height: var(--h5-lh);
}
/* Katalog / PDP: eigene Rollen, unabhängig von Fließtext-Überschriften (h1–h5) */
.shop-typo-product-title {
  font-family: var(--product-title-ff);
  font-size: var(--product-title-fs);
  font-weight: var(--product-title-fw);
  font-style: var(--product-title-style);
  color: var(--product-title-color);
  letter-spacing: var(--product-title-ls);
  line-height: var(--product-title-lh);
  margin: 0;
}
.shop-typo-catalog-title {
  font-family: var(--catalog-title-ff);
  font-size: var(--catalog-title-fs);
  font-weight: var(--catalog-title-fw);
  font-style: var(--catalog-title-style);
  color: var(--catalog-title-color);
  letter-spacing: var(--catalog-title-ls);
  line-height: var(--catalog-title-lh);
}
.shop-typo-catalog-title--on-dark {
  color: #fff !important;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}
.shop-typo-menu-catalog {
  font-family: var(--menu-catalog-ff);
  font-size: var(--menu-catalog-fs);
  font-weight: var(--menu-catalog-fw);
  font-style: var(--menu-catalog-style);
  color: var(--menu-catalog-color);
  letter-spacing: var(--menu-catalog-ls);
  line-height: var(--menu-catalog-lh);
}
.topbar {
  background: var(--topbar-bg) !important;
  color: var(--topbar-text) !important;
  min-height: var(--topbar-height) !important;
  height: auto !important;
  font-size: var(--topbar-fs);
  font-weight: var(--topbar-fw);
  box-shadow: var(--topbar-shadow);
  border-bottom: var(--topbar-border-bottom);
}
.topbar a, .topbar span, .topbar p { color: var(--topbar-text) !important; }
.shop-header-chrome {
  background: var(--header-chrome-bg) !important;
  box-shadow: var(--header-shadow) !important;
  border-bottom: var(--header-border) !important;
  transition: background 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;
}
.shop-header-chrome.landing-clear {
  background: transparent !important;
  box-shadow: none !important;
  border-bottom: none !important;
}
.shop-header-main {
  background: transparent !important;
  color: var(--header-text) !important;
  min-height: var(--header-h);
  box-shadow: none !important;
  border-bottom: none !important;
}
.second-nav {
  background: var(--second-nav-bg) !important;
  color: var(--second-nav-text) !important;
  min-height: var(--second-nav-h);
  font-size: var(--second-nav-fs);
  font-weight: var(--second-nav-fw);
  border: var(--second-nav-border) !important;
}
.second-nav a,
nav.second-nav a { color: var(--second-nav-text) !important; }
.second-nav a.shop-second-nav-link,
nav.second-nav a.shop-second-nav-link {
  background: var(--second-nav-pill-bg) !important;
  border: var(--second-nav-pill-border) !important;
  backdrop-filter: var(--second-nav-pill-backdrop) !important;
  -webkit-backdrop-filter: var(--second-nav-pill-backdrop) !important;
  border-radius: var(--second-nav-pill-radius) !important;
  padding: var(--second-nav-pill-padding) !important;
  box-shadow: var(--second-nav-pill-shadow) !important;
  text-decoration: none !important;
}
.second-nav a.active,
.second-nav a:hover,
nav.second-nav a.active,
nav.second-nav a:hover { color: var(--second-nav-active) !important; }
.second-nav a.shop-second-nav-link:hover,
nav.second-nav a.shop-second-nav-link:hover {
  color: var(--second-nav-active) !important;
  text-decoration: none !important;
}
footer, .site-footer {
  background: var(--footer-bg) !important;
  color: var(--footer-text) !important;
  border-top: var(--footer-border) !important;
}
footer a, .site-footer a { color: var(--footer-text) !important; }
.scroll-up-btn {
  width: var(--scroll-up-size) !important;
  height: var(--scroll-up-size) !important;
  min-width: var(--scroll-up-size) !important;
  min-height: var(--scroll-up-size) !important;
  background: var(--scroll-up-bg) !important;
  border-radius: var(--scroll-up-r) !important;
  box-shadow: var(--scroll-up-shadow) !important;
  border: var(--scroll-up-border) !important;
}
.scroll-up-btn svg,
.scroll-up-btn .scroll-up-icon {
  stroke: var(--scroll-up-icon) !important;
  fill: none !important;
  color: var(--scroll-up-icon) !important;
}
`.trim();

  const atcCode = getActiveCode(buttons, "add_to_cart");
  const primCode = getActiveCode(buttons, "primary");
  const secCode = getActiveCode(buttons, "secondary");
  const ghostCode = getActiveCode(buttons, "ghost");
  const outlineCode = getActiveCode(buttons, "outline");

  return [vars, componentCSS, atcCode, primCode, secCode, ghostCode, outlineCode].filter(Boolean).join("\n\n");
}
