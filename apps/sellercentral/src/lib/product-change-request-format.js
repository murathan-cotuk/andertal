/**
 * Human-readable display for product change request values (often JSON strings from DB).
 */

import { lt } from "@/lib/locale-text";

const URL_KEY_RE = /^(swatch_image|image|img|url|src|href|link|photo|picture|thumbnail|icon|avatar|cover|banner)$/i;
const PRIMARY_KEY_RE = /^(value|name|label|title|text|display_name)$/i;

function stripHtml(s) {
  if (typeof s !== "string") return String(s ?? "");
  return s.replace(/<[^>]*>/g, " ").replace(/&(?:[a-z]+|#\d+);/gi, " ").replace(/\s+/g, " ").trim() || "—";
}

function formatObjectFields(obj) {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return String(obj ?? "");
  const entries = Object.entries(obj).filter(([k]) => !URL_KEY_RE.test(k));
  if (entries.length === 0) return "—";
  const primaryEntry = entries.find(([k]) => PRIMARY_KEY_RE.test(k));
  if (primaryEntry && typeof primaryEntry[1] !== "object") return String(primaryEntry[1] ?? "") || "—";
  return entries.map(([k, v]) => {
    const vv = v == null ? "" : typeof v === "object" ? formatObjectFields(v) : String(v);
    return `${k}: ${vv}`;
  }).join(", ");
}

export function formatChangeRequestValueForDisplay(raw) {
  if (raw == null || raw === "") return "—";
  const s = String(raw).trim();
  if (!s) return "—";

  if (/<[a-z][^>]*>/i.test(s)) return stripHtml(s);

  try {
    const p = JSON.parse(s);
    if (p === null) return "—";
    if (typeof p === "object" && !Array.isArray(p)) {
      const entries = Object.entries(p).filter(([k]) => !URL_KEY_RE.test(k));
      if (entries.length === 0) return "—";
      return entries.map(([k, v]) => {
        const vv = v == null ? "" : typeof v === "object" ? formatObjectFields(v) : String(v);
        return `${k}: ${vv}`;
      }).join("\n");
    }
    if (Array.isArray(p)) {
      if (p.length === 0) return "—";
      return p.map((x, i) => {
        const label = typeof x === "object" && x !== null && !Array.isArray(x)
          ? formatObjectFields(x)
          : formatChangeRequestValueForDisplay(typeof x === "string" ? x : JSON.stringify(x));
        return `${i + 1}. ${label}`;
      }).join("\n");
    }
    return String(p);
  } catch {
    if (s.includes("<") && s.includes(">")) return stripHtml(s);
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
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (f === "title") {
    return lt(loc, "Title", "Başlık", "Titre", "Título", "Titolo", "Titel");
  }
  if (f === "description") {
    return lt(loc, "Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung");
  }
  if (f.startsWith("metadata.")) {
    const key = f.replace(/^metadata\./, "");
    return lt(loc, `Metadata (${key})`, `Meta: ${key}`, `Métadonnées (${key})`, `Metadatos (${key})`, `Metadati (${key})`, `Metadaten (${key})`);
  }
  if (f.startsWith("metafield.")) {
    const key = f.replace(/^metafield\./, "");
    return lt(loc, `Metafield (${key})`, `Metafield (${key})`, `Métachamp (${key})`, `Metacampo (${key})`, `Metacampo (${key})`, `Metafeld (${key})`);
  }
  return f;
}
