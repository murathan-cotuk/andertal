/**
 * Product URL slug for the current storefront language.
 * Per-locale handles live in metadata.translations[locale].handle (sellercentral).
 * Appends an 8-char unique code from the product ID (last 8 chars of Medusa ULID)
 * so sellers can identify and search products by URL code.
 */
export function storefrontProductHandle(product, locale) {
  if (!product) return "";
  const loc = String(locale || "de").toLowerCase();
  const tr = product.metadata?.translations?.[loc];
  const h = ((tr?.handle || "").trim() || String(product.handle || "").trim());
  if (!h) return "";
  const rawId = String(product.id || "").replace(/^prod_/i, "").toLowerCase();
  const shortCode = rawId.length >= 8 ? rawId.slice(-8) : rawId;
  return shortCode ? `${h}-${shortCode}` : h;
}

/** Extracts the base handle from a URL segment that may include an 8-char ID suffix. */
export function baseHandleFromUrl(urlHandle) {
  if (!urlHandle) return "";
  const h = String(urlHandle);
  const lastDash = h.lastIndexOf("-");
  if (lastDash < 1) return h;
  const suffix = h.slice(lastDash + 1);
  // 8-char alphanumeric suffix = product short code
  if (/^[a-z0-9]{8}$/.test(suffix)) return h.slice(0, lastDash);
  return h;
}
