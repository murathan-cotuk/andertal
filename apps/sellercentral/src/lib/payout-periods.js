/**
 * 15-Tage-Abrechnungszeiträume (1–15 / 16–Monatsende).
 */

export const ALL_PAYOUT_PERIODS_KEY = "__all__";

export function generatePayoutPeriods(count = 12) {
  const periods = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const mm = String(month + 1).padStart(2, "0");
    const ym = `${year}-${mm}`;
    const secondStart = `${ym}-16`;
    const secondEnd = `${ym}-${String(daysInMonth).padStart(2, "0")}`;
    const firstStart = `${ym}-01`;
    const firstEnd = `${ym}-15`;
    periods.push({
      label: `16.${mm}.${year} – ${String(daysInMonth).padStart(2, "0")}.${mm}.${year}`,
      startDate: secondStart,
      endDate: secondEnd,
      start: secondStart,
      end: secondEnd,
      key: `${ym}-2`,
      year,
    });
    periods.push({
      label: `01.${mm}.${year} – 15.${mm}.${year}`,
      startDate: firstStart,
      endDate: firstEnd,
      start: firstStart,
      end: firstEnd,
      key: `${ym}-1`,
      year,
    });
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return periods;
}

export function currentPayoutPeriodKey() {
  const now = new Date();
  const half = now.getDate() <= 15 ? "1" : "2";
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${half}`;
}

export function getCurrentPayoutPeriod() {
  const periods = generatePayoutPeriods(12);
  const key = currentPayoutPeriodKey();
  return periods.find((p) => p.key === key) || periods[0];
}

export function initialPayoutPeriodKey(periods) {
  const key = currentPayoutPeriodKey();
  return periods.some((p) => p.key === key) ? key : periods[0]?.key || key;
}

/** Jeder Kalendertag im Abrechnungszeitraum (inkl. Start/Ende). */
export function eachDayInPeriod(period) {
  if (!period?.startDate || !period?.endDate) return [];
  const [sy, sm, sd] = period.startDate.split("-").map(Number);
  const [ey, em, ed] = period.endDate.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const days = [];
  while (cur <= end) {
    const key = toLocalDateKey(cur);
    days.push({
      key,
      label: cur.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** Tagesumsatz im gewählten Zeitraum (COALESCE delivery_date, created_at). */
export function buildPeriodRevenueChart(period, orders, getOrderCents) {
  const days = eachDayInPeriod(period).map((d) => ({ ...d, revenue: 0, orders: 0 }));
  for (const o of orders) {
    if (!isOrderInPayoutPeriod(o, period)) continue;
    const day = toLocalDateKey(o?.created_at);
    const bucket = days.find((d) => d.key === day);
    if (bucket) {
      bucket.revenue += getOrderCents(o);
      bucket.orders += 1;
    }
  }
  return days;
}

/** YYYY-MM-DD in local calendar (matches payments DATE filter intent). */
export function toLocalDateKey(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Order in period by order date (same as billing / seller ledger). */
export function isOrderInPayoutPeriod(order, period) {
  if (!period?.startDate || !period?.endDate) return false;
  const day = toLocalDateKey(order?.created_at);
  if (!day) return false;
  return day >= period.startDate && day <= period.endDate;
}

export function isReturnInPayoutPeriod(ret, period) {
  if (!period?.startDate || !period?.endDate) return false;
  const day = toLocalDateKey(ret?.created_at);
  if (!day) return false;
  return day >= period.startDate && day <= period.endDate;
}
