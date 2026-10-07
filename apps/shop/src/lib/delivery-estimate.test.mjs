import test from "node:test";
import assert from "node:assert/strict";
import { germanHolidays, estimateDeliveryDate, addBusinessDays } from "./delivery-estimate.js";

const iso = (d) => d.toISOString().slice(0, 10);

test("German nationwide holidays incl. Easter-based ones (2026)", () => {
  const h = germanHolidays(2026);
  for (const d of ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-10-03", "2026-12-25", "2026-12-26"]) {
    assert.ok(h.has(d), d);
  }
  assert.equal(h.size, 9);
});

test("weekends and holidays are skipped", () => {
  // Thu 2026-04-02 + 1 business day → Good Friday + Easter Monday skipped → Tue 2026-04-07
  assert.equal(iso(addBusinessDays(new Date(Date.UTC(2026, 3, 2)), 1)), "2026-04-07");
  // Fri 2026-10-09 + 1 → Mon 2026-10-12
  assert.equal(iso(addBusinessDays(new Date(Date.UTC(2026, 9, 9)), 1)), "2026-10-12");
});

test("estimate = handling + transit business days from today (Berlin); null when not configured", () => {
  const wed = new Date("2026-10-07T10:00:00Z");
  assert.equal(iso(estimateDeliveryDate({ handling_days: 1, transit_days: 2 }, wed)), "2026-10-12");
  assert.equal(estimateDeliveryDate({ handling_days: 1, transit_days: null }, wed), null);
  assert.equal(estimateDeliveryDate({}, wed), null);
  // same-day handling still needs at least one transit day
  assert.equal(iso(estimateDeliveryDate({ handling_days: 0, transit_days: 0 }, wed)), "2026-10-08");
  // late evening UTC that is already the next day in Berlin
  assert.equal(iso(estimateDeliveryDate({ handling_days: 0, transit_days: 1 }, new Date("2026-10-07T22:30:00Z"))), "2026-10-09");
});
