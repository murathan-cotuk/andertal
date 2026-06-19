/**
 * Backend PDF endpoints (admin-hub).
 * kind: "invoice" | "lieferschein" | "versandlabel" | "retoure"
 */
export function getOrderPdfDownloadUrl(orderId, kind, locale = "de") {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) || "";
  const base = String(raw).trim().replace(/\/$/, "");
  if (!base || !orderId) return "#";
  const path = kind || "invoice";
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const q = `?locale=${encodeURIComponent(loc)}`;
  return `${base}/admin-hub/v1/orders/${encodeURIComponent(orderId)}/pdf/${path}${q}`;
}
