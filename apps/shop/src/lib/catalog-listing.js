/**
 * Shared facet / sort helpers for collection and category catalog pages.
 */

export const SORT_OPTIONS = [
  { value: "default", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "title_asc", label: "Name A–Z" },
  { value: "title_desc", label: "Name Z–A" },
];

export const PER_PAGE = 24;

/** Display titles for normalized facet keys (matches CategoryTemplate / brand listing). */
const FACET_GROUP_TITLE_OVERRIDES = {
  brand_name: "Marke",
  farbe: "Farbe",
  colour: "Colour",
  color: "Color",
  material: "Material",
  size: "Größe",
  groesse: "Größe",
  typ: "Typ",
  style: "Style",
  gender: "Gender",
  age_group: "Altersgruppe",
  season: "Saison",
};

export function getFacetGroupTitle(key) {
  const k = String(key || "").trim();
  return FACET_GROUP_TITLE_OVERRIDES[k] ?? k.replace(/_/g, " ");
}

export const FACET_SKIP = new Set([
  "media", "image_url", "image", "thumbnail",
  "review_count", "review_avg", "sold_last_month",
  "rabattpreis_cents", "uvp_cents", "price_cents", "compare_at_price_cents", "sale_price_cents",
  "is_new", "badge", "sale",
  "ean", "sku",
  "bullet_points", "translations", "variation_groups", "metafields",
  "shipping_group_id",
  "collection_id", "collection_ids", "admin_category_id", "category_id",
  "seller_id", "product_id",
  "brand", "brand_id", "brand_name", "brand_logo", "brand_handle",
  "shop_name", "store_name", "seller_name",
  "hersteller", "hersteller_information", "verantwortliche_person_information",
  "seo_keywords", "seo_meta_title", "seo_meta_description",
  "publish_date", "return_days", "return_cost", "return_kostenlos",
  "related_product_ids",
  "dimensions", "dimensions_length", "dimensions_width", "dimensions_height",
  "weight", "weight_grams", "unit_type", "unit_value", "unit_reference",
  "shipping_info", "versand",
]);

export function normalizeFacetKey(key) {
  const raw = String(key || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return "";
  if (["farbe", "color", "colour", "farben"].includes(raw)) return "farbe";
  if (["groesse", "größe", "size", "sizes"].includes(raw)) return "groesse";
  if (["material", "materials", "stoff"].includes(raw)) return "material";
  return raw;
}

export function variationGroupFacetKey(group, fallbackIndex) {
  const raw = group?.key || group?.name || group?.title || `option_${fallbackIndex + 1}`;
  return normalizeFacetKey(raw);
}

export function inferFacetKeyFromValue(value, fallbackKey = "") {
  const s = String(value || "").trim();
  const lower = s.toLowerCase();
  if (!s) return normalizeFacetKey(fallbackKey);

  const sizeTokens = new Set([
    "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl",
    "2xs", "3xs", "2xl", "3xl", "4xl", "5xl",
  ]);
  const colorTokens = new Set([
    "blue", "green", "pink", "red", "yellow", "orange", "purple", "violet",
    "black", "white", "grey", "gray", "brown", "beige", "navy", "gold",
    "silver", "rose", "rosa", "pinke", "pembe", "blau", "gruen", "grün",
    "rot", "gelb", "orange", "lila", "schwarz", "weiss", "weiß", "grau",
    "braun", "beige", "marine", "gold", "silber",
  ]);

  if (sizeTokens.has(lower)) return "groesse";
  if (/^\d{1,3}$/.test(s)) return "groesse";
  if (/^\d{1,3}([.,]\d+)?\s?(cm|mm|kg|g|ml|l|eu|us|uk)$/.test(lower)) return "groesse";
  if (/^\d{2,3}\/\d{2,3}$/.test(s)) return "groesse";
  if (colorTokens.has(lower)) return "farbe";

  return normalizeFacetKey(fallbackKey);
}

export function getProductBasePriceCents(product) {
  const firstVariantPrice = product?.variants?.[0]?.prices?.[0]?.amount;
  if (firstVariantPrice != null) return Number(firstVariantPrice) || 0;
  if (product?.price != null) return Math.round(Number(product.price) * 100) || 0;
  return 0;
}

export function isDiscountedProduct(product) {
  const base = getProductBasePriceCents(product);
  const sale = product?.metadata?.rabattpreis_cents != null ? Number(product.metadata.rabattpreis_cents) : null;
  return sale != null && sale > 0 && sale < base;
}

export function isRecentProduct(product, months = 2) {
  const now = new Date();
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - months);
  const candidates = [
    product?.created_at,
    product?.metadata?.publish_date,
    product?.metadata?.created_at,
    product?.updated_at,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d >= threshold;
  }
  return false;
}

export function productSalesScore(product) {
  const meta = product?.metadata || {};
  return Number(meta.sold_last_month || meta.sold || meta.sales_count || 0) || 0;
}

function isCleanValue(s) {
  if (!s || s.length > 80) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/uploads/")) return false;
  return true;
}

function addFacetValue(f, key, rawVal) {
  const normalizedKey = normalizeFacetKey(key);
  if (!normalizedKey || FACET_SKIP.has(normalizedKey) || normalizedKey.startsWith("_")) return;
  const vals = Array.isArray(rawVal) ? rawVal : [rawVal];
  vals.forEach((x) => {
    if (x == null || typeof x === "object") return;
    const s = String(x).trim();
    if (!isCleanValue(s)) return;
    if (!f[normalizedKey]) f[normalizedKey] = new Set();
    f[normalizedKey].add(s);
  });
}

export function buildFacetsFromProducts(products) {
  const f = {};
  (products || []).forEach((p) => {
    const meta = typeof p.metadata === "object" && p.metadata ? p.metadata : {};

    Object.entries(meta).forEach(([k, v]) => {
      const nk = normalizeFacetKey(k);
      if (FACET_SKIP.has(nk) || nk.startsWith("_")) return;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) return;
      addFacetValue(f, nk, v);
    });

    if (Array.isArray(meta.metafields)) {
      meta.metafields.forEach(({ key, value } = {}) => {
        const nk = normalizeFacetKey(key);
        if (!nk || value == null || value === "") return;
        if (FACET_SKIP.has(nk) || nk.startsWith("_")) return;
        addFacetValue(f, nk, value);
      });
    }

    if (Array.isArray(p.variants)) {
      p.variants.forEach((variant) => {
        const variantMeta = typeof variant?.metadata === "object" && variant.metadata ? variant.metadata : {};

        Object.entries(variantMeta).forEach(([k, v]) => {
          const nk = normalizeFacetKey(k);
          if (FACET_SKIP.has(nk) || nk.startsWith("_")) return;
          if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return;
          if (v !== null && typeof v === "object" && !Array.isArray(v)) return;
          addFacetValue(f, nk, v);
        });

        if (Array.isArray(variantMeta.metafields)) {
          variantMeta.metafields.forEach(({ key, value } = {}) => {
            const nk = normalizeFacetKey(key);
            if (!nk || value == null || value === "") return;
            if (FACET_SKIP.has(nk) || nk.startsWith("_")) return;
            addFacetValue(f, nk, value);
          });
        }

        if (Array.isArray(variant?.option_values)) {
          const groups = Array.isArray(p.variation_groups) ? p.variation_groups : [];
          variant.option_values.forEach((value, idx) => {
            const groupKey = inferFacetKeyFromValue(value, variationGroupFacetKey(groups[idx], idx));
            addFacetValue(f, groupKey, value);
          });
        }
      });
    }
  });

  return Object.fromEntries(
    Object.entries(f)
      .map(([k, s]) => [k, [...s].sort()])
      .filter(([, v]) => v.length > 0 && v.length <= 50),
  );
}

export function filterProductsByFacets(products, filters) {
  let out = [...(products || [])];
  Object.entries(filters || {}).forEach(([k, vals]) => {
    if (!vals?.length) return;
    out = out.filter((p) => {
      const meta = p.metadata || {};
      const normalizedKey = normalizeFacetKey(k);
      const direct = meta[k];
      if (direct != null && (Array.isArray(direct) ? direct : [direct]).some((x) => vals.includes(String(x).trim()))) return true;
      const directNormalized = meta[normalizedKey];
      if (directNormalized != null && (Array.isArray(directNormalized) ? directNormalized : [directNormalized]).some((x) => vals.includes(String(x).trim()))) return true;
      if (Array.isArray(meta.metafields) && meta.metafields.some((mf) => mf?.key === k && vals.includes(String(mf.value ?? "").trim()))) return true;
      if (Array.isArray(meta.metafields) && meta.metafields.some((mf) => normalizeFacetKey(mf?.key) === normalizedKey && vals.includes(String(mf.value ?? "").trim()))) return true;
      if (Array.isArray(p.variants) && p.variants.some((v) => {
        const variantMeta = typeof v?.metadata === "object" && v.metadata ? v.metadata : {};
        const directVariant = variantMeta[k];
        if (directVariant != null && (Array.isArray(directVariant) ? directVariant : [directVariant]).some((x) => vals.includes(String(x).trim()))) return true;
        const directVariantNormalized = variantMeta[normalizedKey];
        if (directVariantNormalized != null && (Array.isArray(directVariantNormalized) ? directVariantNormalized : [directVariantNormalized]).some((x) => vals.includes(String(x).trim()))) return true;
        if (Array.isArray(variantMeta.metafields) && variantMeta.metafields.some((mf) => normalizeFacetKey(mf?.key) === normalizedKey && vals.includes(String(mf.value ?? "").trim()))) return true;
        const ov = Array.isArray(v.option_values) ? v.option_values : [];
        const groups = Array.isArray(p.variation_groups) ? p.variation_groups : [];
        return ov.some((x, idx) => inferFacetKeyFromValue(x, variationGroupFacetKey(groups[idx], idx)) === normalizedKey && vals.includes(String(x).trim()));
      })) return true;
      return false;
    });
  });
  return out;
}

export function applyCatalogSort(sorted, sort, { bestsellerOnly = false } = {}) {
  const out = [...sorted];
  if (bestsellerOnly && sort === "default") {
    out.sort((a, b) => productSalesScore(b) - productSalesScore(a));
  }
  if (sort === "newest") {
    out.sort((a, b) => {
      const da = a.metadata?.publish_date ? new Date(a.metadata.publish_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const db = b.metadata?.publish_date ? new Date(b.metadata.publish_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
      return db - da;
    });
  }
  if (sort === "price_asc") {
    out.sort((a, b) => (a.variants?.[0]?.prices?.[0]?.amount ?? 0) - (b.variants?.[0]?.prices?.[0]?.amount ?? 0));
  }
  if (sort === "price_desc") {
    out.sort((a, b) => (b.variants?.[0]?.prices?.[0]?.amount ?? 0) - (a.variants?.[0]?.prices?.[0]?.amount ?? 0));
  }
  if (sort === "title_asc") {
    out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }
  if (sort === "title_desc") {
    out.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
  }
  return out;
}
