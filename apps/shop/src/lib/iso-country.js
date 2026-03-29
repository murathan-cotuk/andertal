/**
 * Canonical ISO 3166-1 alpha-2 for shop + shipping APIs (uppercase).
 * UK → GB (United Kingdom).
 */
export function normalizeIsoCountryCode(code) {
  const u = String(code ?? "").trim().toUpperCase();
  if (u === "UK") return "GB";
  return /^[A-Z]{2}$/.test(u) ? u : "";
}
