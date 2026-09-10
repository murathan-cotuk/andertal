/**
 * Product-page (PDP) element catalogue — the single source of truth shared by the
 * shop storefront and the Sellercentral "Product page" editor.
 *
 * The shop PDP keeps its fixed three-column layout (Gallery | Info | Buybox); this
 * list only drives per-element VISIBILITY. Every element defaults to visible, so an
 * empty / missing settings object reproduces today's page exactly.
 *
 * `column` groups the element under one of the three PDP columns in the editor.
 * `labels` is { en, de, tr } — enough for the current Sellercentral locales; other
 * locales fall back to `en`.
 */

export const PDP_COLUMNS = ["gallery", "info", "buybox"];

export const PDP_ELEMENTS = [
  // ── Gallery column ────────────────────────────────────────────────
  { key: "gallery", column: "gallery", labels: { en: "Product images", de: "Produktbilder", tr: "Ürün görselleri" }, locked: true },
  { key: "gallery_thumbnails", column: "gallery", labels: { en: "Image thumbnails", de: "Bild-Miniaturen", tr: "Görsel küçük resimleri" } },
  { key: "wishlist_button", column: "gallery", reorderGroup: "gallery_actions", labels: { en: "Wishlist / heart button", de: "Merkzettel-/Herz-Button", tr: "Favori / kalp butonu" } },
  { key: "share_button", column: "gallery", reorderGroup: "gallery_actions", labels: { en: "Share button", de: "Teilen-Button", tr: "Paylaş butonu" } },
  { key: "made_in_europe_badge", column: "gallery", labels: { en: "“Made in Europe” badge", de: "„Made in Europe“-Badge", tr: "“Made in Europe” rozeti" } },

  // ── Info column (centre) ──────────────────────────────────────────
  { key: "breadcrumb", column: "info", labels: { en: "Breadcrumb", de: "Breadcrumb", tr: "Kırıntı menü" } },
  { key: "title", column: "info", labels: { en: "Product title", de: "Produkttitel", tr: "Ürün başlığı" }, locked: true },
  { key: "brand", column: "info", labels: { en: "Brand name", de: "Markenname", tr: "Marka adı" } },
  { key: "rating", column: "info", labels: { en: "Rating stars & review count", de: "Bewertungssterne & Anzahl", tr: "Puan yıldızları ve yorum sayısı" } },
  { key: "bestseller_badge", column: "info", labels: { en: "Bestseller badge", de: "Bestseller-Badge", tr: "Çok satan rozeti" } },
  { key: "center_price", column: "info", labels: { en: "Price block (centre column)", de: "Preisblock (mittlere Spalte)", tr: "Fiyat bloğu (orta sütun)" } },
  { key: "uvp_strike", column: "info", labels: { en: "RRP / struck-through price", de: "UVP / Streichpreis", tr: "TESK / üstü çizili fiyat" } },
  { key: "variation_selector", column: "info", labels: { en: "Variation selector", de: "Variantenauswahl", tr: "Varyasyon seçici" }, locked: true },
  { key: "bullet_points", column: "info", labels: { en: "Bullet points", de: "Aufzählungspunkte", tr: "Madde işaretleri" } },
  { key: "description", column: "info", labels: { en: "Description text", de: "Beschreibungstext", tr: "Açıklama metni" } },
  { key: "properties_table", column: "info", labels: { en: "Properties table", de: "Eigenschaften-Tabelle", tr: "Özellikler tablosu" } },
  { key: "product_safety", column: "info", labels: { en: "Product safety / GPSR block", de: "Produktsicherheit / GPSR-Block", tr: "Ürün güvenliği / GPSR bloğu" } },
  { key: "category_link", column: "info", labels: { en: "Category link", de: "Kategorie-Link", tr: "Kategori bağlantısı" } },

  // ── Buybox column (right) ─────────────────────────────────────────
  { key: "buybox_price", column: "buybox", labels: { en: "Buybox price", de: "Buybox-Preis", tr: "Buybox fiyatı" }, locked: true },
  { key: "campaign_badge", column: "buybox", labels: { en: "Campaign / discount badge", de: "Kampagnen-/Rabatt-Badge", tr: "Kampanya / indirim rozeti" } },
  { key: "seller", column: "buybox", reorderGroup: "buybox_info", labels: { en: "Seller (“sold by”)", de: "Verkäufer („verkauft von“)", tr: "Satıcı (“satan”)" } },
  { key: "stock_badge", column: "buybox", labels: { en: "Stock / availability badge", de: "Lager-/Verfügbarkeits-Badge", tr: "Stok / bulunurluk rozeti" } },
  { key: "delivery_time", column: "buybox", labels: { en: "Delivery time", de: "Lieferzeit", tr: "Teslimat süresi" } },
  { key: "shipping_cost", column: "buybox", reorderGroup: "buybox_info", labels: { en: "Shipping cost line", de: "Versandkosten-Zeile", tr: "Kargo ücreti satırı" } },
  { key: "quantity_selector", column: "buybox", labels: { en: "Quantity selector", de: "Mengenauswahl", tr: "Adet seçici" } },
  { key: "return_info", column: "buybox", reorderGroup: "buybox_info", labels: { en: "Return / withdrawal info", de: "Rückgabe-/Widerrufs-Info", tr: "İade / cayma bilgisi" } },
  { key: "payment_icons", column: "buybox", labels: { en: "Payment method icons", de: "Zahlungsart-Icons", tr: "Ödeme yöntemi ikonları" } },
  { key: "other_sellers", column: "buybox", labels: { en: "“Other sellers” box", de: "„Andere Verkäufer“-Box", tr: "“Diğer satıcılar” kutusu" } },
];

export const PDP_ELEMENT_KEYS = PDP_ELEMENTS.map((e) => e.key);

/**
 * Groups of adjacent elements whose relative order the editor may change.
 * The array order here is the CANONICAL DEFAULT — it must match exactly how the
 * shop renders these today, so an empty settings object never moves anything.
 *   buybox_info  → InfoList rows in the buybox card (shop order: shipping, returns, seller)
 *   gallery_actions → the icon buttons under the main image (wishlist, then share)
 */
export const PDP_REORDER_GROUPS = {
  gallery_actions: ["wishlist_button", "share_button"],
  buybox_info: ["shipping_cost", "return_info", "seller"],
};

const PDP_ELEMENT_BY_KEY = PDP_ELEMENTS.reduce((acc, e) => {
  acc[e.key] = e;
  return acc;
}, {});

/** Element label for a locale (falls back to English, then the raw key). */
export function pdpElementLabel(key, locale = "en") {
  const el = PDP_ELEMENT_BY_KEY[key];
  if (!el) return key;
  const l = String(locale || "en").slice(0, 2).toLowerCase();
  return el.labels[l] || el.labels.en || key;
}

/**
 * Is a PDP element visible under the given settings object?
 * `settings` is the `settings` blob stored on the `__product_page__` landing row,
 * shaped `{ elements: { <key>: false, ... } }`. Anything not explicitly `false`
 * (and every `locked` element) is visible.
 */
export function pdpElementVisible(settings, key) {
  const el = PDP_ELEMENT_BY_KEY[key];
  if (el?.locked) return true;
  const map = settings && typeof settings === "object" ? settings.elements : null;
  if (!map || typeof map !== "object") return true;
  return map[key] !== false;
}

/**
 * Order the keys of one reorder group given the saved settings.
 * `settings.order` is `{ <reorderGroup>: [key, key, ...] }`. Keys present in the
 * saved list keep that order; any default key missing from it is appended in its
 * natural order. Unknown saved keys are ignored. No saved order → `defaultKeys`.
 */
export function pdpOrderedKeys(settings, groupName, defaultKeys) {
  const saved = settings && typeof settings === "object" && settings.order && typeof settings.order === "object"
    ? settings.order[groupName]
    : null;
  if (!Array.isArray(saved) || saved.length === 0) return [...defaultKeys];
  const allow = new Set(defaultKeys);
  const seen = new Set();
  const out = [];
  for (const k of saved) {
    if (allow.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  }
  for (const k of defaultKeys) if (!seen.has(k)) out.push(k);
  return out;
}

/** Reorder groups → their member element keys, in canonical default order. */
export function pdpReorderGroups() {
  return { ...PDP_REORDER_GROUPS };
}

/** Build the editor's column → elements grouping. */
export function pdpElementsByColumn() {
  return PDP_COLUMNS.map((column) => ({
    column,
    elements: PDP_ELEMENTS.filter((e) => e.column === column),
  }));
}
