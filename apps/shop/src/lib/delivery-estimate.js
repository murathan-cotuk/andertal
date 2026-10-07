/**
 * Delivery estimate ("Lieferung bis …", Konsept s3): seller handling days + carrier transit days,
 * counted in business days (Mon–Fri, without German nationwide public holidays). Returns null
 * unless the seller configured both values for the shipping group — no invented dates.
 */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Easter Sunday (Gregorian, anonymous algorithm) as a UTC date. */
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** German nationwide public holidays (gesetzliche Feiertage, bundesweit). */
export function germanHolidays(year) {
  const e = easterSunday(year);
  const plus = (days) => ymd(new Date(e.getTime() + days * 86400000));
  return new Set([
    `${year}-01-01`, plus(-2), plus(1), `${year}-05-01`, plus(39), plus(50), `${year}-10-03`, `${year}-12-25`, `${year}-12-26`,
  ]);
}

const isBusinessDay = (d) => {
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !germanHolidays(d.getUTCFullYear()).has(ymd(d));
};

/** Today in Europe/Berlin as a UTC-midnight date. */
function berlinToday(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

export function addBusinessDays(start, days) {
  const d = new Date(start.getTime());
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isBusinessDay(d)) left -= 1;
  }
  return d;
}

/**
 * @param {{ handling_days?: number|null, transit_days?: number|null }} group
 * @returns {Date|null} latest expected delivery day (UTC midnight), or null when not configured
 */
export function estimateDeliveryDate(group, now = new Date()) {
  const h = Number(group?.handling_days);
  const t = Number(group?.transit_days);
  if (group?.handling_days == null || group?.transit_days == null || !Number.isFinite(h) || !Number.isFinite(t) || h < 0 || t < 0) return null;
  return addBusinessDays(berlinToday(now), Math.round(h) + Math.max(1, Math.round(t)));
}

export function formatDeliveryDate(date, locale = "de") {
  if (!date) return "";
  const tag = { de: "de-DE", en: "en-GB", tr: "tr-TR", fr: "fr-FR", it: "it-IT", es: "es-ES" }[String(locale).slice(0, 2)] || "de-DE";
  return date.toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
}
