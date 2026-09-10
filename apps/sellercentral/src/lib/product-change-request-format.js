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

/** Plain-text preview for empty SEO fields (product name / description as placeholder). */
export function seoPlainPreview(html, max = 160) {
  const s = String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (!max || s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
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

/* ── Human-readable field-by-field diff ─────────────────────────────────────────
 * Change-request values are usually JSON blobs (translations, compliance_review …).
 * Dumping them raw is unreadable. buildChangeRequestDiff() turns "old vs new" into
 * a flat list of the leaf paths that actually changed:  de › title:  "x" → "y".
 */

function tryParseJson(raw) {
  if (raw == null) return { ok: false, value: raw };
  if (typeof raw === "object") return { ok: true, value: raw };
  const s = String(raw).trim();
  if (!s || !(s.startsWith("{") || s.startsWith("["))) return { ok: false, value: raw };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false, value: raw };
  }
}

function leafToText(v) {
  if (v == null) return "";
  if (typeof v === "string") return /<[a-z][^>]*>/i.test(v) ? stripHtml(v) : v.trim();
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

/** Collapse an object/array into Map<path, text>. Arrays use 1-based indices. */
function flattenValue(value, prefix, out) {
  if (value == null || typeof value !== "object") {
    out.set(prefix, leafToText(value));
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      if (prefix) out.set(prefix, "—");
      return out;
    }
    value.forEach((item, i) => flattenValue(item, prefix ? `${prefix} › ${i + 1}` : String(i + 1), out));
    return out;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    if (prefix) out.set(prefix, "—");
    return out;
  }
  for (const k of keys) flattenValue(value[k], prefix ? `${prefix} › ${k}` : k, out);
  return out;
}

/**
 * @returns {{kind:"scalar", before:string, after:string, changed:boolean}
 *          |{kind:"fields", rows:Array<{path:string, before:string|null, after:string|null, status:"added"|"removed"|"changed"}>}}
 */
function isEmptyish(raw) {
  if (raw == null) return true;
  const s = String(raw).trim();
  return !s || s === "—" || s === "null" || s === "{}" || s === "[]";
}

export function buildChangeRequestDiff(oldRaw, newRaw) {
  const a = tryParseJson(oldRaw);
  const b = tryParseJson(newRaw);
  const aObj = a.ok && a.value !== null && typeof a.value === "object";
  const bObj = b.ok && b.value !== null && typeof b.value === "object";

  // Field-by-field diff when both sides are structured, or one side is structured
  // and the other is empty (first-time set / cleared). A plain scalar-vs-object
  // change falls back to a before/after block.
  const canFieldDiff =
    (aObj || isEmptyish(oldRaw)) && (bObj || isEmptyish(newRaw)) && (aObj || bObj);
  if (!canFieldDiff) {
    const before = formatChangeRequestValueForDisplay(oldRaw);
    const after = formatChangeRequestValueForDisplay(newRaw);
    return { kind: "scalar", before, after, changed: before !== after };
  }

  const aFlat = flattenValue(aObj ? a.value : {}, "", new Map());
  const bFlat = flattenValue(bObj ? b.value : {}, "", new Map());
  const paths = new Set([...aFlat.keys(), ...bFlat.keys()]);
  const rows = [];
  for (const p of paths) {
    const hasA = aFlat.has(p);
    const hasB = bFlat.has(p);
    const before = hasA ? aFlat.get(p) : null;
    const after = hasB ? bFlat.get(p) : null;
    if ((before ?? "") === (after ?? "")) continue;
    rows.push({
      path: p || "—",
      before,
      after,
      status: !hasA || before === "" ? "added" : !hasB || after === "" ? "removed" : "changed",
    });
  }
  rows.sort((x, y) => x.path.localeCompare(y.path, undefined, { numeric: true }));
  return { kind: "fields", rows };
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
    const known = {
      translations: lt(loc, "Translations", "Çeviriler", "Traductions", "Traducciones", "Traduzioni", "Übersetzungen"),
      seo: "SEO",
      seo_i18n: lt(loc, "SEO (per language)", "SEO (dile göre)", "SEO (par langue)", "SEO (por idioma)", "SEO (per lingua)", "SEO (je Sprache)"),
      bullet_points: lt(loc, "Bullet points", "Madde işaretleri", "Points clés", "Puntos", "Punti elenco", "Aufzählungspunkte"),
      compliance_review: lt(loc, "Compliance check", "Uygunluk kontrolü", "Contrôle de conformité", "Control de conformidad", "Controllo di conformità", "Compliance-Prüfung"),
      compliance_profile_id: lt(loc, "Compliance profile", "Uygunluk profili", "Profil de conformité", "Perfil de conformidad", "Profilo di conformità", "Compliance-Profil"),
      custom_fields: lt(loc, "Custom fields", "Özel alanlar", "Champs personnalisés", "Campos personalizados", "Campi personalizzati", "Benutzerdefinierte Felder"),
    };
    if (known[key]) return known[key];
    return lt(loc, `Metadata (${key})`, `Meta: ${key}`, `Métadonnées (${key})`, `Metadatos (${key})`, `Metadati (${key})`, `Metadaten (${key})`);
  }
  if (f.startsWith("metafield.")) {
    const key = f.replace(/^metafield\./, "");
    return lt(loc, `Metafield (${key})`, `Metafield (${key})`, `Métachamp (${key})`, `Metacampo (${key})`, `Metacampo (${key})`, `Metafeld (${key})`);
  }
  return f;
}
