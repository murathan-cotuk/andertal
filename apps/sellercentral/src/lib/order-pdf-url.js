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

/**
 * All /admin-hub/* PDF endpoints require a Bearer token (no cookie/query fallback —
 * see requireSellerAuth in server.js), so a plain <a href> or window.open() to one of
 * these URLs always 401s ("Unauthorized") — the browser navigation can't attach the
 * header. Fetch it with the token instead and trigger the download from the blob.
 */
export async function downloadAuthenticatedPdf(url, filename) {
  if (!url || url === "#") throw new Error("PDF URL not available");
  const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "document.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
