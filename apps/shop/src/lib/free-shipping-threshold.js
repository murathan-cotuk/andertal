import { normalizeIsoCountryCode as normalizeIso } from "@/lib/iso-country";

/**
 * Resolves free-shipping threshold (cents) for a single country.
 * - Normalizes ISO keys (case, UK→GB).
 * - Never applies another country's threshold (avoids GB using DE's lower limit).
 * - Uses env fallback only when thresholds are missing/null (not loaded).
 * - An empty object `{}` means thresholds were configured but no rule applies — returns null (no env fallback).
 */

function toCents(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * @param {Record<string, unknown> | null | undefined} rawThresholds - API `free_shipping_thresholds`
 * @param {string} countryCode - market / ISO (e.g. gb → GB)
 * @param {number | null | undefined} envFallbackCents - `NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_CENTS`
 * @returns {number | null}
 */
export function resolveFreeShippingThresholdCents(rawThresholds, countryCode, envFallbackCents) {
  const code = normalizeIso(countryCode);
  const env = toCents(envFallbackCents);

  if (!rawThresholds || typeof rawThresholds !== "object") {
    return env;
  }

  const byCountry = {};
  for (const [k, v] of Object.entries(rawThresholds)) {
    const iso = normalizeIso(k);
    if (!iso) continue;
    const cents = toCents(v);
    if (cents != null) byCountry[iso] = cents;
  }

  if (Object.keys(byCountry).length === 0) {
    return null;
  }

  if (!code) {
    return env;
  }

  if (Object.prototype.hasOwnProperty.call(byCountry, code)) {
    return byCountry[code];
  }

  return null;
}
