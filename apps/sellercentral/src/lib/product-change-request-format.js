/**
 * Human-readable display for product change request values (often JSON strings from DB).
 */

export function formatChangeRequestValueForDisplay(raw) {
  if (raw == null || raw === "") return "—";
  const s = String(raw).trim();
  if (!s) return "—";
  try {
    const p = JSON.parse(s);
    if (p === null) return "null";
    if (typeof p === "object" && !Array.isArray(p)) {
      const entries = Object.entries(p);
      if (entries.length === 0) return "{}";
      return entries.map(([k, v]) => {
        const vv = v === null || v === undefined
          ? ""
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
        return `${k}: ${vv}`;
      }).join("\n");
    }
    if (Array.isArray(p)) {
      if (p.length === 0) return "[]";
      return p.map((x, i) => `${i + 1}. ${formatChangeRequestValueForDisplay(typeof x === "string" ? x : JSON.stringify(x))}`).join("\n");
    }
    return String(p);
  } catch {
    return s;
  }
}

/** Short one-line preview for notifications (no newlines). */
export function formatChangeRequestValuePreview(raw, maxLen = 100) {
  const full = formatChangeRequestValueForDisplay(raw);
  const oneLine = full.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function fieldNameDisplayLabel(fieldName, locale = "de") {
  const f = String(fieldName || "").trim();
  if (!f) return "—";
  if (f === "title") {
    if (locale === "tr") return "Başlık";
    if (locale === "de") return "Titel";
    return "Title";
  }
  if (f === "description") {
    if (locale === "tr") return "Açıklama";
    if (locale === "de") return "Beschreibung";
    return "Description";
  }
  if (f.startsWith("metadata.")) {
    const key = f.replace(/^metadata\./, "");
    if (locale === "tr") return `Meta: ${key}`;
    if (locale === "de") return `Metadaten (${key})`;
    return `Metadata (${key})`;
  }
  return f;
}
