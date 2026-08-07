/**
 * Apply document favicon via same-origin /api/brand-favicon.
 * Sellercentral must never point at the shop favicon CDN URL.
 */
export function applyDocumentFavicon(url = "/api/brand-favicon?app=sellercentral") {
  if (typeof document === "undefined") return;
  const href =
    String(url || "/api/brand-favicon?app=sellercentral").trim() ||
    "/api/brand-favicon?app=sellercentral";

  const stale = document.querySelectorAll(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='apple-touch-icon-precomposed']",
  );
  stale.forEach((el) => el.parentNode?.removeChild(el));

  const bust = href.includes("?") ? `${href}&v=${Date.now()}` : `${href}?v=${Date.now()}`;
  const add = (rel, sizes) => {
    const link = document.createElement("link");
    link.setAttribute("rel", rel);
    link.setAttribute("href", bust);
    if (sizes) link.setAttribute("sizes", sizes);
    link.setAttribute("type", "image/png");
    document.head.appendChild(link);
  };

  add("icon", "any");
  add("shortcut icon");
  add("apple-touch-icon", "180x180");
}
