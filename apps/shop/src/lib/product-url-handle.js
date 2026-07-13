/**
 * Product URL slug for the current storefront language.
 * Per-locale handles live in metadata.translations[locale].handle (sellercentral).
 * Format: {handle}-a-{8chars} where 8chars = last 8 chars of Medusa ULID (without prod_ prefix).
 */
export function storefrontProductHandle(product, locale) {
  if (!product) return "";
  const loc = String(locale || "de").toLowerCase();
  const tr = product.metadata?.translations?.[loc];
  const h = ((tr?.handle || "").trim() || String(product.handle || "").trim());
  if (!h) return "";
  const rawId = String(product.id || "").replace(/^prod_/i, "").toLowerCase();
  const shortCode = rawId.length >= 8 ? rawId.slice(-8) : rawId;
  return shortCode ? `${h}-a-${shortCode}` : h;
}

/** Extracts the base handle from a URL segment that may include an -a-{8char} or legacy {8char} suffix. */
export function baseHandleFromUrl(urlHandle) {
  if (!urlHandle) return "";
  const h = String(urlHandle);
  const lastDash = h.lastIndexOf("-");
  if (lastDash < 1) return h;
  const suffix = h.slice(lastDash + 1);
  if (!/^[a-z0-9]{8}$/.test(suffix)) return h;
  // New format: handle-a-{8chars} → strip "-a-{8chars}"
  const withoutSuffix = h.slice(0, lastDash);
  if (withoutSuffix.endsWith("-a")) return withoutSuffix.slice(0, -2);
  // Legacy format: handle-{8chars} → strip "-{8chars}"
  return withoutSuffix;
}
