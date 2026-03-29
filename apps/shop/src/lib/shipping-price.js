import { normalizeIsoCountryCode } from "@/lib/iso-country";

/**
 * Resolves shipping price (cents) from API `prices` map (any key casing).
 * @param {Record<string, unknown>|null|undefined} prices
 * @param {string} countryCode - market country e.g. GB, gb
 * @param {string} [fallbackCountry="DE"] - only if primary missing
 * @returns {number|null}
 */
export function getShippingPriceCents(prices, countryCode, fallbackCountry = "DE") {
  if (!prices || typeof prices !== "object") return null;
  const want = normalizeIsoCountryCode(countryCode);
  const byIso = {};
  for (const [k, v] of Object.entries(prices)) {
    const iso = normalizeIsoCountryCode(k);
    if (!iso) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) byIso[iso] = n;
  }
  if (want && Object.prototype.hasOwnProperty.call(byIso, want)) return byIso[want];
  const fb = normalizeIsoCountryCode(fallbackCountry);
  if (fb && Object.prototype.hasOwnProperty.call(byIso, fb)) return byIso[fb];
  return null;
}
