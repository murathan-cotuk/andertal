/** Build shop store-categories API query with active locale for auto-translated names. */
export function storeCategoriesQuery(locale, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") q.set(k, String(v));
  }
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc) q.set("locale", loc);
  const s = q.toString();
  return s ? `?${s}` : "";
}
