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

/** Smallest defined price in the map (valid ISO keys only); last resort when country + DE miss. */
export function getLowestShippingPriceCents(prices) {
  if (!prices || typeof prices !== "object") return null;
  let min = null;
  for (const [k, v] of Object.entries(prices)) {
    const iso = normalizeIsoCountryCode(k);
    if (!iso) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) continue;
    if (min === null || n < min) min = n;
  }
  return min;
}

/** Store PDP/cart copy: selected country, then DE, then any listed country. */
export function resolveShippingQuoteCents(prices, countryCode) {
  const primary = getShippingPriceCents(prices, countryCode, "DE");
  if (primary != null) return primary;
  return getLowestShippingPriceCents(prices);
}

/**
 * Strict lookup: only returns a price if the exact country has an entry.
 * Returns null if the country is not covered — used to block purchase.
 */
export function resolveShippingQuoteStrict(prices, countryCode) {
  return getShippingPriceCents(prices, countryCode, null);
}

const normShipGroupId = (x) => String(x ?? "").trim().toLowerCase();

/** Match cart line `shipping_group_id` to `/store/shipping-groups` row (UUID string case/format safe). */
export function findShippingGroup(shippingGroups, groupIdRaw) {
  if (groupIdRaw == null || String(groupIdRaw).trim() === "") return null;
  const want = normShipGroupId(groupIdRaw);
  return (shippingGroups || []).find((g) => normShipGroupId(g?.id) === want) || null;
}
