/** Single source of truth for shop theme defaults (sellercentral + shop injector). */

import {
  DEFAULT_ATC_CODE,
  DEFAULT_GHOST_BUTTON_CODE,
  DEFAULT_OUTLINE_BUTTON_CODE,
  DEFAULT_PRIMARY_BUTTON_CODE,
  DEFAULT_SECONDARY_BUTTON_CODE,
} from "./default-button-css.js";

const TYPO_LEVEL = (overrides = {}) => ({
  font_size: "1rem",
  font_weight: "400",
  font_style: "normal",
  color: "#111827",
  letter_spacing: "0",
  line_height: "1.5",
  font_family: "",
  ...overrides,
});

export const DEFAULT_SHOP_STYLES = {
  colors: {
    primary: "#ff971c",
    secondary: "#111827",
    accent: "#ef8200",
    text: "#111827",
    background: "#ffffff",
  },
  topbar: {
    variant: "default",
    enabled: false,
    /** "inline" = alle Einträge nebeneinander; "carousel" = nacheinander, zeitgesteuert + Wischen/Pfeile */
    display_mode: "inline",
    /** Sekunden zwischen automatischen Slides (Karussell, min 2) */
    carousel_interval_sec: 5,
    /** Einträge: Text + optionaler Link (Pfad z.B. /contact) */
    items: [],
    bg_color: "#111827",
    text_color: "#ffffff",
    height: "40px",
    font_size: "13px",
    font_weight: "400",
    shadow: "none",
    border_bottom: "none",
  },
  header: {
    variant: "default",
    bg_color: "#ffffff",
    /** Optional URL — liegt unter Farbe/Verlauf (background-size: cover) */
    bg_image_url: "",
    /** Solid fallback / Verlauf Startfarbe */
    bg_gradient_enabled: false,
    /** Zweite Verlaufsfarbe (Zielton bei Intensität 100%) */
    bg_gradient_end: "#0f766e",
    /** CSS linear-gradient Winkel in Grad (z. B. 180 = oben → unten) */
    bg_gradient_angle: 135,
    /** 0–100: wie stark zur zweiten Farbe überblendet wird */
    bg_gradient_intensity: 75,
    text_color: "#111827",
    height: "72px",
    shadow: "0 2px 8px rgba(0,0,0,0.08)",
    border_bottom: "1px solid #f3f4f6",
    /** Nur auf passenden Routen — leeres Objekt = überall Standard */
    scopes: {
      category: {},
      collection: {},
    },
  },
  secondNav: {
    variant: "default",
    bg_color: "#f9fafb",
    text_color: "#374151",
    active_color: "#ff971c",
    height: "44px",
    font_size: "14px",
    font_weight: "500",
    /** Link-Darstellung je Viewport: classic = Text + Hover-Unterstrich, pill = Frostglas-Kachel */
    link_style_desktop: "classic",
    link_style_tablet: "pill",
    link_style_mobile: "pill",
    /** Glasmorphism-Kacheln je Link (Desktop/Mobil/Tablet) */
    pill_background: "rgba(255,255,255,0.30)",
    pill_border: "none",
    pill_backdrop: "blur(12px)",
    /** px — Prozent macht breite Links zu „Pillen“/Zylinder; nur Ecken leicht runden */
    pill_border_radius: "10px",
    pill_padding: "6px 14px",
    pill_shadow: "none",
  },
  footer: {
    bg_color: "#111827",
    text_color: "#d1d5db",
    border_top: "none",
  },
  typography: {
    google_font_family: "",
    /** @deprecated use body — kept for migration */
    font_family: "Inter, system-ui, sans-serif",
    body: TYPO_LEVEL({
      font_size: "16px",
      line_height: "1.6",
      color: "#111827",
      font_weight: "400",
    }),
    h1: TYPO_LEVEL({
      font_size: "clamp(28px,5vw,52px)",
      font_weight: "800",
      color: "#111827",
      letter_spacing: "-0.02em",
      line_height: "1.15",
    }),
    h2: TYPO_LEVEL({
      font_size: "clamp(22px,3.5vw,36px)",
      font_weight: "700",
      color: "#111827",
      letter_spacing: "-0.01em",
      line_height: "1.2",
    }),
    h3: TYPO_LEVEL({
      font_size: "clamp(1.15rem,2.4vw,1.65rem)",
      font_weight: "700",
      line_height: "1.25",
      letter_spacing: "-0.01em",
    }),
    h4: TYPO_LEVEL({
      font_size: "clamp(1.05rem,1.8vw,1.2rem)",
      font_weight: "600",
      line_height: "1.3",
    }),
    h5: TYPO_LEVEL({
      font_size: "1rem",
      font_weight: "600",
      line_height: "1.35",
    }),
    /** Produktseite: Titel in der Buybox (semantisch oft h1, visuell eigenes Profil) */
    product_title: TYPO_LEVEL({
      font_size: "clamp(1.25rem, 2.5vw, 1.75rem)",
      font_weight: "700",
      line_height: "1.3",
      letter_spacing: "-0.02em",
    }),
    /** Kategorie-, Kollektions-, Marken-Überschriften (Listing-Seiten, nicht Fließtext/Blog) */
    catalog_title: TYPO_LEVEL({
      font_size: "clamp(1.125rem, 2.8vw, 2rem)",
      font_weight: "700",
      line_height: "1.2",
      letter_spacing: "-0.02em",
    }),
    /** Kategorien-Dropdown / Mega-Menü Einträge (nicht Second-Nav-Leiste) */
    menu_catalog: TYPO_LEVEL({
      font_size: "15px",
      font_weight: "500",
      line_height: "1.35",
      color: "#374151",
    }),
  },
  scrollUpButton: {
    variant: "default",
    bg_color: "#ff971c",
    icon_color: "#ffffff",
    border_radius: "50%",
    size: "44px",
    shadow: "0 4px 12px rgba(0,0,0,0.2)",
    border: "none",
  },
  /** Kollektion-Template (shop/[handle]) görünüm ayarları */
  collection_template: {
    banner_style: "strip",    // "strip" | "medium" | "tall" | "none"
    show_sidebar: true,
    sidebar_width: "220px",
    products_per_row: 4,
    products_per_row_mobile: 2,
    richtext_align: "left",   // "left" | "center"
    richtext_max_width: "700px",
    content_padding_x: "32px",
  },
  /** Kategorie-Template (shop/category/[slug]) görünüm ayarları */
  category_template: {
    banner_style: "strip",
    show_sidebar: true,
    sidebar_width: "280px",
    products_per_row: 4,
    products_per_row_mobile: 2,
    richtext_align: "left",
    richtext_max_width: "700px",
    content_padding_x: "32px",
  },
  buttons: {
    add_to_cart: {
      label: "Add to Cart Button",
      variants: [{ name: "Orange Theme (Standard)", code: DEFAULT_ATC_CODE, active: true }],
    },
    primary: {
      label: "Primary Button",
      variants: [{ name: "Current Shop Button", code: DEFAULT_PRIMARY_BUTTON_CODE, active: true }],
    },
    secondary: {
      label: "Secondary Button",
      variants: [{ name: "Outlined Secondary", code: DEFAULT_SECONDARY_BUTTON_CODE, active: true }],
    },
    ghost: {
      label: "Ghost Button",
      variants: [{ name: "Transparent Ghost", code: DEFAULT_GHOST_BUTTON_CODE, active: true }],
    },
    outline: {
      label: "Outline Button",
      variants: [{ name: "Outline Accent", code: DEFAULT_OUTLINE_BUTTON_CODE, active: true }],
    },
  },
};
