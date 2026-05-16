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
