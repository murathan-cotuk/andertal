"use client";

import { useEffect } from "react";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

// Default styles — used until backend responds (prevents FOUC)
const DEFAULTS = {
  colors: {
    primary:    "#ff971c",
    secondary:  "#111827",
    accent:     "#ef8200",
    text:       "#111827",
    background: "#ffffff",
  },
  topbar: { bg_color: "#111827", text_color: "#ffffff", height: "40px", font_size: "13px", font_weight: "400" },
  header: { bg_color: "#ffffff", text_color: "#111827", height: "72px", shadow: "0 2px 8px rgba(0,0,0,0.08)", border_bottom: "1px solid #f3f4f6" },
  secondNav: { bg_color: "#f9fafb", text_color: "#374151", active_color: "#ff971c", height: "44px", font_size: "14px", font_weight: "500" },
  footer: { bg_color: "#111827", text_color: "#d1d5db", border_top: "none" },
  typography: { font_family: "Inter, system-ui, sans-serif", font_size: "16px", line_height: "1.6", color: "#111827", h1_size: "clamp(28px,5vw,52px)", h1_weight: "800", h1_color: "#111827", h1_spacing: "-0.02em", h2_size: "clamp(22px,3.5vw,36px)", h2_weight: "700", h2_color: "#111827", h2_spacing: "-0.01em" },
  scrollUpButton: { bg_color: "#ff971c", icon_color: "#ffffff", border_radius: "50%", size: "44px", shadow: "0 4px 12px rgba(0,0,0,0.2)" },
};

function getActiveCode(buttons, key) {
  const btn = buttons?.[key];
  if (!btn?.variants?.length) return "";
  const active = btn.variants.find((v) => v.active) || btn.variants[0];
  return active?.code || "";
}

function buildCSS(styles) {
  const colors = { ...DEFAULTS.colors, ...(styles?.colors || {}) };
  const topbar = { ...DEFAULTS.topbar, ...(styles?.topbar || {}) };
  const header = { ...DEFAULTS.header, ...(styles?.header || {}) };
  const secondNav = { ...DEFAULTS.secondNav, ...(styles?.secondNav || {}) };
  const footer = { ...DEFAULTS.footer, ...(styles?.footer || {}) };
  const typo = { ...DEFAULTS.typography, ...(styles?.typography || {}) };
  const scrollUp = { ...DEFAULTS.scrollUpButton, ...(styles?.scrollUpButton || {}) };
  const buttons = styles?.buttons || {};

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
  --header-bg:       ${header.bg_color};
  --header-text:     ${header.text_color};
  --header-h:        ${header.height};
  --header-shadow:   ${header.shadow};
  --header-border:   ${header.border_bottom};
  --second-nav-bg:   ${secondNav.bg_color};
  --second-nav-text: ${secondNav.text_color};
  --second-nav-active: ${secondNav.active_color};
  --second-nav-h:    ${secondNav.height};
  --second-nav-fs:   ${secondNav.font_size};
  --second-nav-fw:   ${secondNav.font_weight};
  --footer-bg:       ${footer.bg_color};
  --footer-text:     ${footer.text_color};
  --footer-border:   ${footer.border_top};
  --body-font:       ${typo.font_family};
  --body-fs:         ${typo.font_size};
  --body-lh:         ${typo.line_height};
  --body-color:      ${typo.color};
  --h1-fs:           ${typo.h1_size};
  --h1-fw:           ${typo.h1_weight};
  --h1-color:        ${typo.h1_color};
  --h1-ls:           ${typo.h1_spacing};
  --h2-fs:           ${typo.h2_size};
  --h2-fw:           ${typo.h2_weight};
  --h2-color:        ${typo.h2_color};
  --h2-ls:           ${typo.h2_spacing};
  --scroll-up-bg:    ${scrollUp.bg_color};
  --scroll-up-icon:  ${scrollUp.icon_color};
  --scroll-up-r:     ${scrollUp.border_radius};
  --scroll-up-size:  ${scrollUp.size};
  --scroll-up-shadow: ${scrollUp.shadow};
}`;

  const componentCSS = `
body { font-family: var(--body-font); font-size: var(--body-fs); line-height: var(--body-lh); color: var(--body-color); background: var(--shop-bg); }
h1 { font-size: var(--h1-fs); font-weight: var(--h1-fw); color: var(--h1-color); letter-spacing: var(--h1-ls); }
h2 { font-size: var(--h2-fs); font-weight: var(--h2-fw); color: var(--h2-color); letter-spacing: var(--h2-ls); }
.topbar { background: var(--topbar-bg) !important; color: var(--topbar-text) !important; height: var(--topbar-height) !important; font-size: var(--topbar-fs); font-weight: var(--topbar-fw); }
.topbar a, .topbar span, .topbar p { color: var(--topbar-text) !important; }
.site-header, header.site-header { background: var(--header-bg) !important; color: var(--header-text) !important; min-height: var(--header-h); box-shadow: var(--header-shadow) !important; border-bottom: var(--header-border) !important; }
.second-nav, nav.second-nav { background: var(--second-nav-bg) !important; color: var(--second-nav-text) !important; min-height: var(--second-nav-h); font-size: var(--second-nav-fs); font-weight: var(--second-nav-fw); }
.second-nav a { color: var(--second-nav-text) !important; }
.second-nav a.active, .second-nav a:hover { color: var(--second-nav-active) !important; }
footer, .site-footer { background: var(--footer-bg) !important; color: var(--footer-text) !important; border-top: var(--footer-border) !important; }
footer a, .site-footer a { color: var(--footer-text) !important; }
.scroll-up-btn { width: var(--scroll-up-size) !important; height: var(--scroll-up-size) !important; background: var(--scroll-up-bg) !important; border-radius: var(--scroll-up-r) !important; box-shadow: var(--scroll-up-shadow) !important; }
.scroll-up-btn svg { stroke: var(--scroll-up-icon) !important; }`.trim();

  const atcCode  = getActiveCode(buttons, "add_to_cart");
  const primCode = getActiveCode(buttons, "primary");
  const secCode  = getActiveCode(buttons, "secondary");

  return [vars, componentCSS, atcCode, primCode, secCode].filter(Boolean).join("\n\n");
}

export default function ShopStylesInjector() {
  useEffect(() => {
    // Inject defaults immediately (no FOUC)
    inject(buildCSS(DEFAULTS));

    // Fetch and apply real styles from backend
    fetch(`${BACKEND_URL}/store/styles`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.styles) inject(buildCSS(data.styles));
      })
      .catch(() => {}); // keep defaults on error
  }, []);

  return null;
}

function inject(css) {
  let tag = document.getElementById("shop-theme-styles");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "shop-theme-styles";
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}
