/**
 * Destination VAT split for shop order UI. Keep rates in sync with
 * apps/medusa-backend/src/goods-vat.js (invoice PDF).
 */

const DEFAULT_STANDARD_RATES = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25, EE: 24, ES: 21,
  FI: 25.5, FR: 20, GR: 24, HR: 25, HU: 27, IE: 23, IT: 22, LT: 21, LU: 17,
  LV: 21, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SE: 25, SI: 22, SK: 23,
  CH: 8.1, GB: 20, TR: 20, NO: 25, US: 0,
}

export function normalizeCountryCode(country) {
  const s = String(country || "").trim().toUpperCase();
  if (s.length >= 2 && /^[A-Z]{2}/.test(s)) return s.slice(0, 2);
  return "";
}

export function getGoodsVatRatePercent(country) {
  const cc = normalizeCountryCode(country);
  if (cc && Object.prototype.hasOwnProperty.call(DEFAULT_STANDARD_RATES, cc)) {
    return Number(DEFAULT_STANDARD_RATES[cc]);
  }
  return 19;
}

export function formatVatPercent(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return String(n);
}

export function splitInclusiveVat(grossCents, ratePercent) {
  const gross = Math.max(0, Math.round(Number(grossCents) || 0));
  const rate = Number(ratePercent);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { grossCents: gross, netCents: gross, vatCents: 0, ratePercent: 0 };
  }
  const vatCents = Math.round((gross * rate) / (100 + rate));
  return { grossCents: gross, netCents: gross - vatCents, vatCents, ratePercent: rate };
}

export function destinationCountryFromOrder(order) {
  return normalizeCountryCode((order && (order.country || order.billing_country)) || "") || "DE";
}

/** Coupon portion of order.discount_cents. Mirrors medusa-backend/src/order-money.js. */
export function orderCouponDiscountCents(order) {
  return Math.max(0, Number(order?.coupon_discount_cents) || 0);
}

/** Bonus (loyalty-points) portion of order.discount_cents — the remainder after coupon. */
export function orderBonusDiscountCents(order) {
  const discount = Math.max(0, Number(order?.discount_cents) || 0);
  return Math.max(0, discount - orderCouponDiscountCents(order));
}
