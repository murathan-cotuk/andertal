import ExcelJS from "exceljs";
import { METAOBJECT_LANGS, slugifyMetaKey, resolveSafeMetaobjectKey } from "@/lib/metaobjects-i18n";

export { METAOBJECT_LANGS, slugifyMetaKey, resolveSafeMetaobjectKey };

const HEADER_WORDS = new Set([
  "title", "value", "titles", "values",
  "eigenschaft", "eigenschaften", "wert", "werte",
  "titre", "valeur", "titulo", "valor", "titolo", "valore",
  "baslik", "başlık", "deger", "değer",
]);

const LANG_ALIASES = {
  german: "de", deutsch: "de", de: "de", "de (default / fallback)": "de",
  english: "en", englisch: "en", en: "en",
  french: "fr", francais: "fr", français: "fr", franzosisch: "fr", französisch: "fr", fr: "fr",
  spanish: "es", spanisch: "es", espanol: "es", español: "es", es: "es",
  italian: "it", italienisch: "it", italiano: "it", it: "it",
  turkish: "tr", turkisch: "tr", türkisch: "tr", turkce: "tr", türkçe: "tr", tr: "tr",
};

function cellText(ws, row, col) {
  const cell = ws.getCell(row, col);
  const val = cell?.value;
  if (val == null || val === "") return "";
  if (typeof val === "object") {
    if (typeof val.text === "string" && val.text) return val.text.trim();
    if (val.result != null) return String(val.result).trim();
    if (Array.isArray(val.richText)) return val.richText.map((rt) => String(rt.text || "")).join("").trim();
    return "";
  }
  return String(val).trim();
}

function detectLang(name) {
  const n = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!n) return null;
  if (LANG_ALIASES[n]) return LANG_ALIASES[n];
  const first = n.split(/\s+/)[0];
  return LANG_ALIASES[first] || null;
}

function isHeaderRow(ws, row, langs) {
  const t = cellText(ws, row, langs[0].titleCol).toLowerCase();
  const v = cellText(ws, row, langs[0].valueCol).toLowerCase();
  return HEADER_WORDS.has(t) || HEADER_WORDS.has(v);
}

function normLabel(s) {
  return String(s || "").trim().toLowerCase();
}

export function findExistingDefinitionKey(definitions, titlesByLang) {
  const wanted = new Set(
    Object.values(titlesByLang || {})
      .map(normLabel)
      .filter(Boolean),
  );
  if (!wanted.size) return null;
  for (const [key, def] of Object.entries(definitions || {})) {
    const labels = new Set();
    labels.add(normLabel(key.replace(/_/g, " ")));
    if (def?.label) labels.add(normLabel(def.label));
    const i18n = def?.label_i18n && typeof def.label_i18n === "object" ? def.label_i18n : {};
    for (const loc of Object.keys(i18n)) {
      const l = i18n[loc]?.label;
      if (l) labels.add(normLabel(l));
    }
    for (const w of wanted) {
      if (labels.has(w)) return key;
    }
  }
  return null;
}

function mergeLabelI18n(prev, titlesByLang) {
  const next = { ...(prev && typeof prev === "object" ? prev : {}) };
  for (const [lang, title] of Object.entries(titlesByLang || {})) {
    if (lang === "de") continue;
    const t = String(title || "").trim();
    if (!t) continue;
    next[lang] = { ...(next[lang] || {}), label: t };
  }
  return Object.keys(next).length ? next : null;
}

function mergeValuesI18n(prev, canonical, translationsByLang) {
  const next = { ...(prev && typeof prev === "object" ? prev : {}) };
  for (const [lang, translated] of Object.entries(translationsByLang || {})) {
    if (lang === "de") continue;
    const t = String(translated || "").trim();
    if (!t) continue;
    next[lang] = { ...(next[lang] || {}), [canonical]: t };
  }
  return Object.keys(next).length ? next : null;
}

export function parseMetaobjectWorkbook(workbook) {
  const ws = workbook.worksheets[0];
  if (!ws) return [];

  const langs = [];
  for (let col = 1; col <= 24; col += 2) {
    const name = cellText(ws, 1, col) || cellText(ws, 1, col + 1);
    const code = detectLang(name) || (METAOBJECT_LANGS[(col - 1) / 2] || {}).code;
    if (!code) continue;
    langs.push({ code, titleCol: col, valueCol: col + 1 });
  }
  if (!langs.length) {
    METAOBJECT_LANGS.forEach((L, i) => {
      langs.push({ code: L.code, titleCol: i * 2 + 1, valueCol: i * 2 + 2 });
    });
  }

  let dataStart = 2;
  if (isHeaderRow(ws, 2, langs)) dataStart = 3;

  const rows = [];
  let lastTitles = {};
  const maxRow = Math.max(ws.rowCount || 0, dataStart);
  for (let r = dataStart; r <= maxRow; r++) {
    const titles = {};
    const values = {};
    for (const L of langs) {
      titles[L.code] = cellText(ws, r, L.titleCol);
      values[L.code] = cellText(ws, r, L.valueCol);
    }
    const hasTitle = Object.values(titles).some(Boolean);
    const hasValue = Object.values(values).some(Boolean);
    if (!hasTitle && !hasValue) continue;
    for (const code of Object.keys(titles)) {
      if (!titles[code] && lastTitles[code]) titles[code] = lastTitles[code];
    }
    if (Object.values(titles).some(Boolean)) {
      lastTitles = { ...lastTitles };
      for (const [k, v] of Object.entries(titles)) if (v) lastTitles[k] = v;
    }
    if (!Object.values(values).some(Boolean)) continue;
    rows.push({ titles, values });
  }
  return rows;
}

export function groupImportRows(rows) {
  const groups = [];
  const index = new Map();
  for (const row of rows) {
    const deTitle = String(row.titles?.de || "").trim();
    const anyTitle = deTitle || Object.values(row.titles || {}).find((t) => String(t || "").trim());
    if (!anyTitle) continue;
    const id = normLabel(deTitle || anyTitle);
    if (!index.has(id)) {
      index.set(id, groups.length);
      groups.push({ titles: { ...(row.titles || {}) }, valueRows: [] });
    }
    const g = groups[index.get(id)];
    for (const [k, v] of Object.entries(row.titles || {})) {
      if (String(v || "").trim()) g.titles[k] = String(v).trim();
    }
    const canonical = String(row.values?.de || "").trim()
      || Object.values(row.values || {}).map((v) => String(v || "").trim()).find(Boolean)
      || "";
    if (!canonical) continue;
    g.valueRows.push({ canonical, translations: { ...(row.values || {}) } });
  }
  return groups;
}

export function applyImportGroups(definitions, groups) {
  const next = { ...(definitions || {}) };
  const summary = { created: 0, updated: 0, valuesAdded: 0, remapped: [], skipped: [] };
  for (const g of groups) {
    const deTitle = String(g.titles.de || "").trim()
      || Object.values(g.titles).map((t) => String(t || "").trim()).find(Boolean)
      || "";
    if (!deTitle) continue;
    let key = findExistingDefinitionKey(next, g.titles);
    let created = false;
    if (!key) {
      const rawKey = slugifyMetaKey(deTitle);
      key = resolveSafeMetaobjectKey(deTitle);
      if (!key) {
        summary.skipped.push({ title: deTitle, reason: "system_key" });
        continue;
      }
      if (rawKey && key !== rawKey) {
        summary.remapped.push({ title: deTitle, from: rawKey, to: key });
      }
      if (!next[key]) {
        next[key] = { label: deTitle, values: [], label_i18n: null, values_i18n: null };
        created = true;
        summary.created += 1;
      }
    }
    const def = next[key] || { label: deTitle, values: [], label_i18n: null, values_i18n: null };
    if (g.titles.de) def.label = String(g.titles.de).trim();
    def.label_i18n = mergeLabelI18n(def.label_i18n, g.titles);
    const values = Array.isArray(def.values) ? [...def.values] : [];
    const seen = new Set(values.map((v) => String(v).toLowerCase()));
    let added = 0;
    for (const vr of g.valueRows) {
      const canonical = String(vr.canonical || "").trim();
      if (!canonical) continue;
      const existing = values.find((v) => String(v).toLowerCase() === canonical.toLowerCase());
      const storeAs = existing || canonical;
      if (!existing) {
        values.push(canonical);
        seen.add(canonical.toLowerCase());
        added += 1;
      }
      def.values_i18n = mergeValuesI18n(def.values_i18n, storeAs, vr.translations);
    }
    def.values = values;
    next[key] = def;
    if (!created) {
      summary.updated += 1;
      summary.valuesAdded += added;
    } else {
      summary.valuesAdded += added;
    }
  }
  return { definitions: next, summary };
}

export async function buildMetaobjectTemplateBuffer() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Andertal";
  const ws = wb.addWorksheet("Metaobjects", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  METAOBJECT_LANGS.forEach((L, i) => {
    const c1 = i * 2 + 1;
    const c2 = i * 2 + 2;
    ws.mergeCells(1, c1, 1, c2);
    const header = ws.getCell(1, c1);
    header.value = L.name;
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    header.alignment = { horizontal: "center", vertical: "middle" };
    ws.getCell(2, c1).value = "Title";
    ws.getCell(2, c2).value = "Value";
    ws.getCell(2, c1).font = { bold: true };
    ws.getCell(2, c2).font = { bold: true };
    ws.getCell(2, c1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    ws.getCell(2, c2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    ws.getColumn(c1).width = 18;
    ws.getColumn(c2).width = 18;
  });

  const examples = [
    {
      de: ["Farbe", "Rot"],
      en: ["Color", "Red"],
      fr: ["Couleur", "Rouge"],
      es: ["Color", "Rojo"],
      it: ["Colore", "Rosso"],
      tr: ["Renk", "Kırmızı"],
    },
    {
      de: ["Farbe", "Blau"],
      en: ["Color", "Blue"],
      fr: ["Couleur", "Bleu"],
      es: ["Color", "Azul"],
      it: ["Colore", "Blu"],
      tr: ["Renk", "Mavi"],
    },
  ];
  examples.forEach((ex, idx) => {
    const r = 3 + idx;
    METAOBJECT_LANGS.forEach((L, i) => {
      const pair = ex[L.code] || ["", ""];
      ws.getCell(r, i * 2 + 1).value = pair[0];
      ws.getCell(r, i * 2 + 2).value = pair[1];
    });
  });

  ws.getRow(1).height = 22;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
