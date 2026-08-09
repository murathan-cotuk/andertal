/**
 * Backend PDF endpoints (admin-hub).
 * kind: "invoice" | "lieferschein" | "versandlabel" | "retoure"
 * opts: { carrier?, tracking? } — Lieferschein overrides (e.g. Versand before save)
 */
export function getOrderPdfDownloadUrl(orderId, kind, locale = "de", opts = {}) {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) || "";
  const base = String(raw).trim().replace(/\/$/, "");
  if (!base || !orderId) return "#";
  const path = kind || "invoice";
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const params = new URLSearchParams({ locale: loc });
  if (opts.carrier) params.set("carrier", String(opts.carrier));
  if (opts.tracking) params.set("tracking", String(opts.tracking));
  return `${base}/admin-hub/v1/orders/${encodeURIComponent(orderId)}/pdf/${path}?${params.toString()}`;
}
