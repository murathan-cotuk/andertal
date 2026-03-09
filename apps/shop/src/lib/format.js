/**
 * Format number with comma as decimal separator (e.g. 9,95)
 */
export function formatDecimal(num) {
  if (num == null || Number.isNaN(Number(num))) return "0,00";
  const n = Number(num);
  const fixed = n.toFixed(2);
  return fixed.replace(".", ",");
}

/**
 * Format price in cents to string with comma (e.g. 995 -> "9,95")
 */
export function formatPriceCents(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "0,00";
  const value = Number(cents) / 100;
  return formatDecimal(value);
}

/**
 * Get title and description for a product in the given locale (from metadata.translations).
 * Falls back to product.title / product.description when no translation exists.
 */
export function getLocalizedProduct(product, locale) {
  if (!product) return { title: "", description: "" };
  const tr = product.metadata?.translations;
  if (tr && tr[locale]) {
    return {
      title: tr[locale].title ?? product.title ?? "",
      description: tr[locale].description ?? product.description ?? "",
    };
  }
  return {
    title: product.title ?? "",
    description: product.description ?? "",
  };
}

/**
 * Strip HTML tags and return plain text (for product description preview)
 */
export function htmlToText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip HTML and truncate to maxLen (for search dropdown – plain text only).
 * Use in frontend only; no backend sanitization needed.
 */
export function stripHtmlForSearch(html, maxLen = 120) {
  const text = htmlToText(html);
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + "…";
}
