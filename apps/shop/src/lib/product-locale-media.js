/**
 * Product / variant images stored by sellercentral:
 * - Gallery: metadata.media (DE) or metadata.translations[locale].media when set.
 * - Variants: image_url (default) + image_urls[locale] overrides.
 */

export function localizedProductMediaList(product, locale) {
  const meta = product?.metadata || {};
  const loc = String(locale || "de").toLowerCase();
  const tr = meta.translations?.[loc];
  if (tr && Array.isArray(tr.media) && tr.media.length > 0) return tr.media;
  return Array.isArray(meta.media) ? meta.media : [];
}

export function variantImageUrlForLocale(variant, locale) {
  if (!variant) return "";
  const loc = String(locale || "de").toLowerCase();
  const map = variant.image_urls && typeof variant.image_urls === "object" ? variant.image_urls : {};
  if (map[loc]) return map[loc];
  const keys = Object.keys(map).filter((k) => map[k] != null && String(map[k]).trim() !== "");
  if (keys.length === 0) return variant.image_url || "";
  if (map.de) return map.de;
  if (loc === "de") return variant.image_url || "";
  return variant.image_url || "";
}

/**
 * Returns the full image list for a variant in the given locale.
 * Priority: locale-specific media → default media → single image_url fallback.
 */
export function variantMediaForLocale(variant, locale) {
  if (!variant) return [];
  const loc = String(locale || "de").toLowerCase();
  const vMeta = variant.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
  // 1. Locale-specific media in translations
  const tr = vMeta.translations;
  if (tr && tr[loc] && Array.isArray(tr[loc].media) && tr[loc].media.length > 0) {
    return tr[loc].media.filter((u) => u && String(u).trim());
  }
  // 2. Default variant media (locale-agnostic)
  if (Array.isArray(vMeta.media) && vMeta.media.length > 0) {
    return vMeta.media.filter((u) => u && String(u).trim());
  }
  // 3. Fallback: single cover image
  const single = variantImageUrlForLocale(variant, locale);
  return single ? [single] : [];
}

/**
 * Returns locale-specific variant content overrides (title, description, bullet_points).
 * Falls back to DE canonical fields when no locale translation exists.
 */
export function variantLocaleContent(variant, locale) {
  if (!variant) return {};
  const loc = String(locale || "de").toLowerCase();
  const vMeta = variant.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
  const trMap = vMeta.translations && typeof vMeta.translations === "object" ? vMeta.translations : {};
  const tr = trMap[loc] || {};
  const trDe = trMap.de || {};
  return {
    title: tr.title || trDe.title || variant.title || null,
    description: tr.description || trDe.description || vMeta.description || null,
    bullet_points: Array.isArray(tr.bullet_points) && tr.bullet_points.length > 0
      ? tr.bullet_points
      : (Array.isArray(trDe.bullet_points) && trDe.bullet_points.length > 0
          ? trDe.bullet_points
          : (Array.isArray(vMeta.bullet_points) ? vMeta.bullet_points : null)),
  };
}
