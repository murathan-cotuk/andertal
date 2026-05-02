import { mergeButtonCatalog } from "./button-merge.js";
import { DEFAULT_SHOP_STYLES } from "./defaults.js";

/** @param {unknown} value */
function normalizeSecondNavLinkStyle(value, fallback) {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "classic" || s === "pill") return s;
  return fallback;
}

function cloneTypo(t) {
  return {
    ...t,
    body: { ...t.body },
    h1: { ...t.h1 },
    h2: { ...t.h2 },
    h3: { ...t.h3 },
    h4: { ...t.h4 },
    h5: { ...t.h5 },
    product_title: { ...t.product_title },
    catalog_title: { ...t.catalog_title },
    menu_catalog: { ...t.menu_catalog },
  };
}

function deepMergeTypography(base, loaded) {
  if (!loaded || typeof loaded !== "object") return cloneTypo(base.typography);
  const {
    body: lb,
    h1: lh1,
    h2: lh2,
    h3: lh3,
    h4: lh4,
    h5: lh5,
    product_title: lpt,
    catalog_title: lct,
    menu_catalog: lmc,
    ...restLoaded
  } = loaded;
  const out = {
    ...base.typography,
    ...restLoaded,
    body: { ...base.typography.body, ...(lb || {}) },
    h1: { ...base.typography.h1, ...(lh1 || {}) },
    h2: { ...base.typography.h2, ...(lh2 || {}) },
    h3: { ...base.typography.h3, ...(lh3 || {}) },
    h4: { ...base.typography.h4, ...(lh4 || {}) },
    h5: { ...base.typography.h5, ...(lh5 || {}) },
    product_title: { ...base.typography.product_title, ...(lpt || {}) },
    catalog_title: { ...base.typography.catalog_title, ...(lct || {}) },
    menu_catalog: { ...base.typography.menu_catalog, ...(lmc || {}) },
  };

  // Legacy flat keys → nested
  if (loaded.font_size && !loaded.body?.font_size) {
    out.body = { ...out.body, font_size: loaded.font_size };
  }
  if (loaded.line_height && !loaded.body?.line_height) {
    out.body = { ...out.body, line_height: loaded.line_height };
  }
  if (loaded.color && !loaded.body?.color) {
    out.body = { ...out.body, color: loaded.color };
  }
  if (
    loaded.font_family &&
    !loaded.google_font_family?.trim?.() &&
    !(loaded.body || {}).font_family
  ) {
    out.body = { ...out.body, font_family: loaded.font_family };
  }

  const migrateH = (level, legacySize, legacyWeight, legacyColor, legacySpacing) => {
    if (loaded[legacySize]) out[level].font_size = loaded[legacySize];
    if (loaded[legacyWeight]) out[level].font_weight = loaded[legacyWeight];
    if (loaded[legacyColor]) out[level].color = loaded[legacyColor];
    if (loaded[legacySpacing]) out[level].letter_spacing = loaded[legacySpacing];
  };

  migrateH("h1", "h1_size", "h1_weight", "h1_color", "h1_spacing");
  migrateH("h2", "h2_size", "h2_weight", "h2_color", "h2_spacing");

  return out;
}

/**
 * Merge API-loaded theme with defaults and migrate older shapes.
 * @param {Record<string, unknown>} loaded
 */
export function mergeLoadedShopStyles(loaded = {}) {
  const typography = deepMergeTypography(DEFAULT_SHOP_STYLES, loaded.typography);

  return {
    colors: { ...DEFAULT_SHOP_STYLES.colors, ...(loaded.colors || {}) },
    topbar: { ...DEFAULT_SHOP_STYLES.topbar, ...(loaded.topbar || {}) },
    header: {
      ...DEFAULT_SHOP_STYLES.header,
      ...(loaded.header || {}),
      scopes: {
        category: {
          ...(DEFAULT_SHOP_STYLES.header.scopes?.category || {}),
          ...(loaded.header?.scopes?.category || {}),
        },
        collection: {
          ...(DEFAULT_SHOP_STYLES.header.scopes?.collection || {}),
          ...(loaded.header?.scopes?.collection || {}),
        },
      },
    },
    secondNav: (() => {
      const merged = { ...DEFAULT_SHOP_STYLES.secondNav, ...(loaded.secondNav || {}) };
      const r = String(merged.pill_border_radius ?? "").trim();
      /* Früherer Shop-Default 20% — auf langen Labels wie eine Pille */
      if (r === "20%") merged.pill_border_radius = DEFAULT_SHOP_STYLES.secondNav.pill_border_radius;
      const def = DEFAULT_SHOP_STYLES.secondNav;
      merged.link_style_desktop = normalizeSecondNavLinkStyle(merged.link_style_desktop, def.link_style_desktop);
      merged.link_style_tablet = normalizeSecondNavLinkStyle(merged.link_style_tablet, def.link_style_tablet);
      merged.link_style_mobile = normalizeSecondNavLinkStyle(merged.link_style_mobile, def.link_style_mobile);
      return merged;
    })(),
    footer: { ...DEFAULT_SHOP_STYLES.footer, ...(loaded.footer || {}) },
    typography,
    scrollUpButton: { ...DEFAULT_SHOP_STYLES.scrollUpButton, ...(loaded.scrollUpButton || {}) },
    mobileChrome: { ...DEFAULT_SHOP_STYLES.mobileChrome, ...(loaded.mobileChrome || {}) },
    collection_template: { ...DEFAULT_SHOP_STYLES.collection_template, ...(loaded.collection_template || {}) },
    category_template: { ...DEFAULT_SHOP_STYLES.category_template, ...(loaded.category_template || {}) },
    buttons: mergeButtonCatalog(DEFAULT_SHOP_STYLES.buttons, loaded.buttons || {}),
  };
}
