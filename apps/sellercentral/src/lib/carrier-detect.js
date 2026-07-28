"use client";

/**
 * Best-effort carrier guess purely from the SHAPE of a manually typed tracking number
 * (no external lookup) — used to auto-select a carrier badge/logo as soon as the seller
 * types a tracking number, instead of asking them to pick a carrier up front.
 * Returns a carrier key matching CARRIER_LOGOS in ShipLabelModal.jsx, or "" if unsure.
 */
export function detectCarrierFromTrackingNumber(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  const compact = v.replace(/\s+/g, "");

  // UPS: "1Z" + 16 alphanumeric characters — distinctive prefix, checked first.
  if (/^1Z[0-9A-Z]{16}$/i.test(compact)) return "ups";

  // DPD: exactly 14 digits.
  if (/^\d{14}$/.test(compact)) return "dpd";

  // GLS: 11-12 digits.
  if (/^\d{11,12}$/.test(compact)) return "gls";

  // Everything else numeric (10-20 digits) — DHL is this platform's only integrated
  // carrier today, and by far the most common shape sellers will type, so it's the
  // sensible default guess; the seller can still override the detected carrier manually.
  if (/^\d{10,20}$/.test(compact)) return "dhl";

  return "";
}
