/**
 * Apply document favicon via same-origin /api/brand-favicon.
 * Mobile Chrome often ignores cross-origin CDN <link rel=icon> hrefs; Next auto
 * /icon routes also collide across apps — keep a single same-origin proxy.
 *
 * Icon links rendered by React/Next (metadata) are only re-pointed, never removed: React
 * later updates/deletes its own nodes, and a node that is already gone throws
 * "removeChild of null", which aborts that React commit and freezes UI updates.
 * Only the links this helper created itself (data-andertal-favicon) are replaced.
 */
export function applyDocumentFavicon(url = "/api/brand-favicon") {
  if (typeof document === "undefined") return;
  const href = String(url || "/api/brand-favicon").trim() || "/api/brand-favicon";
  const bust = href.includes("?") ? `${href}&v=${Date.now()}` : `${href}?v=${Date.now()}`;

  const existing = document.querySelectorAll(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='apple-touch-icon-precomposed']",
  );
  existing.forEach((el) => {
    if (el.dataset.andertalFavicon === "1") el.parentNode?.removeChild(el);
    else el.setAttribute("href", bust);
  });

  const add = (rel, sizes) => {
    const link = document.createElement("link");
    link.setAttribute("rel", rel);
    link.setAttribute("href", bust);
    if (sizes) link.setAttribute("sizes", sizes);
    link.setAttribute("type", "image/png");
    link.dataset.andertalFavicon = "1";
    document.head.appendChild(link);
  };

  add("icon", "any");
  add("shortcut icon");
  add("apple-touch-icon", "180x180");
}
