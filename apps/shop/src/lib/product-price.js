/**
 * Single EUR list price in metadata.prices — country keys are legacy; VAT/shipping vary by market.
 */

export function getPriceEntryFromMap(prices, countryCode, marketCountry) {
  if (!prices || typeof prices !== "object") return null;
  const code = String(countryCode || "").trim().toUpperCase();
  const market = String(marketCountry || "").trim().toUpperCase();
  const direct = prices[code] || prices[market];
  if (direct && typeof direct === "object") return direct;
  if (prices.EUR && typeof prices.EUR === "object") return prices.EUR;
  if (prices.DE && typeof prices.DE === "object") return prices.DE;
  for (const v of Object.values(prices)) {
    if (v && typeof v === "object" && v.brutto_cents != null) return v;
  }
  return null;
}

export function getBruttoCentsFromPricesMap(prices, countryCode, marketCountry) {
  const entry = getPriceEntryFromMap(prices, countryCode, marketCountry);
  if (entry?.brutto_cents == null) return null;
  const n = Number(entry.brutto_cents);
  return Number.isFinite(n) ? n : null;
}

export function getUvpCentsFromPricesMap(prices, countryCode, marketCountry) {
  const entry = getPriceEntryFromMap(prices, countryCode, marketCountry);
  if (entry?.uvp_cents == null) return null;
  const n = Number(entry.uvp_cents);
  return Number.isFinite(n) ? n : null;
}

export function getSaleCentsFromPricesMap(prices, countryCode, marketCountry) {
  const entry = getPriceEntryFromMap(prices, countryCode, marketCountry);
  if (entry?.sale_cents == null) return null;
  const n = Number(entry.sale_cents);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sale / Rabattpreis: variant prices map → product prices map → legacy rabattpreis_cents.
 * Matches ProductCard so PDP and listing show the same discounted price.
 */
export function resolveProductSaleCents(product, variant, countryCode, marketCountry) {
  const vm = variant?.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
  const pm = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const fromVariantMap = getSaleCentsFromPricesMap(
    vm.prices && typeof vm.prices === "object" ? vm.prices : {},
    countryCode,
    marketCountry,
  );
  if (fromVariantMap != null && fromVariantMap > 0) return fromVariantMap;
  const fromProductMap = getSaleCentsFromPricesMap(
    pm.prices && typeof pm.prices === "object" ? pm.prices : {},
    countryCode,
    marketCountry,
  );
  if (fromProductMap != null && fromProductMap > 0) return fromProductMap;
  const legacyVariant = vm.rabattpreis_cents != null ? Number(vm.rabattpreis_cents) : null;
  if (legacyVariant != null && Number.isFinite(legacyVariant) && legacyVariant > 0) return legacyVariant;
  const legacyProduct = pm.rabattpreis_cents != null ? Number(pm.rabattpreis_cents) : null;
  if (legacyProduct != null && Number.isFinite(legacyProduct) && legacyProduct > 0) return legacyProduct;
  return null;
}
