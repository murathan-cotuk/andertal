const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";

export function ltField(obj, field, locale) {
  if (!obj) return "";
  if (!locale || locale === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[locale]?.[field] ?? obj?.[field] ?? "";
}

export function assetField(obj, field, locale) {
  return String(ltField(obj, field, locale) || obj?.[field] || "").trim();
}

export function itemBody(item, locale) {
  return ltField(item, "body", locale) || ltField(item, "description", locale) || "";
}

export function resolveUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
  return `${BACKEND_URL}/uploads/${url}`;
}

export function slideOverlayOpacity(slide) {
  const raw = slide?.overlay ?? slide?.overlay_opacity;
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n > 1 ? n / 100 : n);
}

export function fontFamilyStack(key) {
  const map = {
    serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
    sans: '"Manrope", "Segoe UI", system-ui, sans-serif',
    instrument_serif: '"Instrument Serif", Georgia, serif',
    manrope: '"Manrope", "Segoe UI", system-ui, sans-serif',
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  };
  return map[key] || map.sans;
}

export function inferFeatureGridVariant(container, index) {
  if (container.variant === "stats_strip" || container.variant === "price_cards" || container.variant === "cards") {
    return container.variant;
  }
  if (index === 0) return "stats_strip";
  if (index === 2) return "price_cards";
  return "cards";
}

export function parseStepsHtml(html) {
  if (!html || !/<li[\s>]/i.test(html)) return [];
  return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => m[1])
    .map((chunk) => {
      const strong = chunk.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
      const title = strong ? strong[1].replace(/<[^>]+>/g, "").trim() : "";
      const rest = chunk
        .replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/^[\s—\-–:]+/, "")
        .trim();
      return { t: title || rest.slice(0, 48), d: rest || title };
    })
    .filter((s) => s.t);
}
