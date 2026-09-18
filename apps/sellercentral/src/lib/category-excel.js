import { lt } from "@/lib/locale-text";

export const CATEGORY_EXCEL_LANGS = ["de", "en", "tr", "fr", "it", "es"];
export const CATEGORY_SHEET_NAME = "Categories";
export const CATEGORY_INDEX_SHEET_NAME = "Index";

export function langLabelsFor(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  return {
    de: x("German", "Almanca", "Allemand", "Alemán", "Tedesco", "Deutsch"),
    en: x("English", "İngilizce", "Anglais", "Inglés", "Inglese", "Englisch"),
    tr: x("Turkish", "Türkçe", "Turc", "Turco", "Turco", "Türkisch"),
    fr: x("French", "Fransızca", "Français", "Francés", "Francese", "Französisch"),
    it: x("Italian", "İtalyanca", "Italien", "Italiano", "Italiano", "Italienisch"),
    es: x("Spanish", "İspanyolca", "Espagnol", "Español", "Spagnolo", "Spanisch"),
  };
}

function richTextToStr(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((rt) => {
      if (rt == null) return "";
      if (typeof rt === "string" || typeof rt === "number") return String(rt);
      if (typeof rt === "object") return String(rt.text || rt.result || "");
      return "";
    })
    .join("")
    .trim();
}

export function excelCellStr(val) {
  if (val == null) return "";
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return String(val).trim();
  }
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return richTextToStr(val);
  if (typeof val === "object") {
    if (typeof val.hyperlink === "string" && val.hyperlink) {
      const label = typeof val.text === "string" ? val.text.trim() : "";
      return label || val.hyperlink.trim();
    }
    if (typeof val.text === "string" && val.text) return val.text.trim();
    if (val.result != null) return String(val.result).trim();
    if (Array.isArray(val.richText)) return richTextToStr(val.richText);
  }
  return "";
}

function cellPlain(cell) {
  if (!cell) return "";
  const fromVal = excelCellStr(cell.value);
  if (fromVal) return fromVal;
  try {
    const t = cell.text;
    if (t != null && String(t).trim()) return String(t).trim();
  } catch (_) {
    /* ExcelJS text getter can throw on some cell types */
  }
  return "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HINT_ROW_RE = /UUID oder Slug|Bestehende Kategorie|leave empty|Richtext HTML|URL-Slug|Übergeordnete|sprachunabhängig|empty to create|leer = neu/i;

export function isCategoryExcelHintRow(get, vals) {
  const id = get(vals, "id");
  const slug = get(vals, "slug");
  const parent = get(vals, "parent_id");
  if (UUID_RE.test(id) || UUID_RE.test(parent)) return false;
  if (slug && /^[a-z0-9][a-z0-9-]{0,80}$/i.test(slug) && !/\s/.test(slug)) return false;
  const nameDe = get(vals, "name_de");
  const nameEn = get(vals, "name_en");
  if (/^(Name|İsim|Nom|Nombre|Nome)\s*\(/i.test(nameDe || nameEn)) return true;
  const blob = [id, slug, parent, nameDe, nameEn].join("\n");
  return HINT_ROW_RE.test(blob);
}

export function buildCategoryExcelColumns(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  const LANG_LABELS = langLabelsFor(loc);
  const cols = [
    {
      key: "id",
      label: "id",
      group: "core",
      width: 38,
      note: x(
        "Existing category UUID (leave empty to create). Export fills this.",
        "Mevcut kategori UUID (yeni için boş bırak). Export doldurur.",
        "UUID existant (vide = créer). L’export le remplit.",
        "UUID existente (vacío = crear). La exportación lo rellena.",
        "UUID esistente (vuoto = crea). L’export lo riempie.",
        "Bestehende Kategorie-UUID (leer = neu anlegen). Export füllt sie.",
      ),
    },
    {
      key: "slug",
      label: "slug",
      group: "core",
      width: 28,
      note: x(
        "URL slug. Empty → generated from German name.",
        "URL slug. Boşsa Almanca isimden üretilir.",
        "Slug URL. Vide → généré depuis le nom allemand.",
        "Slug URL. Vacío → se genera del nombre alemán.",
        "Slug URL. Vuoto → generato dal nome tedesco.",
        "URL-Slug. Leer → aus dem deutschen Namen erzeugt.",
      ),
    },
    {
      key: "parent_id",
      label: "parent_id",
      group: "core",
      width: 38,
      note: x(
        "Parent category: UUID or slug (same file or existing). Empty = top level.",
        "Üst kategori: UUID veya slug (aynı dosya veya mevcut). Boş = kök.",
        "Catégorie parente : UUID ou slug. Vide = racine.",
        "Categoría padre: UUID o slug. Vacío = raíz.",
        "Categoria padre: UUID o slug. Vuoto = radice.",
        "Übergeordnete Kategorie: UUID oder Slug (gleiche Datei oder bestehend). Leer = oberste Ebene.",
      ),
    },
    {
      key: "sort_order",
      label: "sort_order",
      group: "core",
      width: 12,
      note: x("Sort order (number)", "Sıra (sayı)", "Ordre (nombre)", "Orden (número)", "Ordine (numero)", "Sortierung (Zahl)"),
    },
    {
      key: "active",
      label: "active",
      group: "core",
      width: 10,
      note: x("true / false", "true / false", "true / false", "true / false", "true / false", "true / false"),
    },
    {
      key: "image_url",
      label: "image_url",
      group: "core",
      width: 42,
      note: x("Category image URL (all languages)", "Kategori görseli URL (tüm diller)", "URL image (toutes langues)", "URL imagen (todos los idiomas)", "URL immagine (tutte le lingue)", "Kategoriebild-URL (sprachunabhängig)"),
    },
    {
      key: "banner_image_url",
      label: "banner_image_url",
      group: "core",
      width: 42,
      note: x("Banner image URL (all languages)", "Banner görseli URL (tüm diller)", "URL bannière", "URL banner", "URL banner", "Bannerbild-URL (sprachunabhängig)"),
    },
  ];

  for (const lang of CATEGORY_EXCEL_LANGS) {
    const L = LANG_LABELS[lang];
    cols.push(
      {
        key: `name_${lang}`,
        label: `name_${lang}`,
        group: `lang_${lang}`,
        width: 32,
        note: x(`Name (${L})`, `İsim (${L})`, `Nom (${L})`, `Nombre (${L})`, `Nome (${L})`, `Name (${L})`),
      },
      {
        key: `description_${lang}`,
        label: `description_${lang}`,
        group: `lang_${lang}`,
        width: 50,
        note: x(
          `Richtext HTML (${L})`,
          `Richtext HTML (${L})`,
          `HTML richtext (${L})`,
          `HTML richtext (${L})`,
          `HTML richtext (${L})`,
          `Beschreibung / Richtext HTML (${L})`,
        ),
      },
      {
        key: `seo_title_${lang}`,
        label: `seo_title_${lang}`,
        group: `lang_${lang}`,
        width: 36,
        note: x(`SEO meta title (${L})`, `SEO meta başlık (${L})`, `Titre méta SEO (${L})`, `Título meta SEO (${L})`, `Titolo meta SEO (${L})`, `SEO Metatitel (${L})`),
      },
      {
        key: `seo_description_${lang}`,
        label: `seo_description_${lang}`,
        group: `lang_${lang}`,
        width: 46,
        note: x(`SEO meta description (${L})`, `SEO meta açıklama (${L})`, `Meta description SEO (${L})`, `Meta descripción SEO (${L})`, `Meta description SEO (${L})`, `SEO Metabeschreibung (${L})`),
      },
      {
        key: `seo_keywords_${lang}`,
        label: `seo_keywords_${lang}`,
        group: `lang_${lang}`,
        width: 36,
        note: x(`SEO keywords (${L})`, `SEO anahtar kelimeler (${L})`, `Mots-clés SEO (${L})`, `Palabras clave SEO (${L})`, `Parole chiave SEO (${L})`, `SEO Schlüsselwörter (${L})`),
      },
    );
  }

  return cols;
}

export const CATEGORY_EXCEL_COLORS = {
  core: { argb: "FF1E3A5F" },
  lang: { argb: "FF1D6F42" },
  coreBg: { argb: "FFCCE5FF" },
  langBg: { argb: "FFD5F5E3" },
  hintBg: { argb: "FFF7F7F7" },
};

export function headerFill(bg) {
  return { type: "pattern", pattern: "solid", fgColor: bg };
}

export function excelBorder() {
  const thin = { style: "thin", color: { argb: "FFCCCCCC" } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

function colLetter(n) {
  let s = "";
  let c = n;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export function paintCategoryWorkbook(wb, { locale, rows = [], indexRows = [] }) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  const cols = buildCategoryExcelColumns(loc);
  const LANG_LABELS = langLabelsFor(loc);

  const ws = wb.addWorksheet(CATEGORY_SHEET_NAME, {
    properties: { defaultColWidth: 18 },
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
  });

  cols.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  const groupSegments = [];
  cols.forEach((col, i) => {
    const g = col.group;
    const colNo = i + 1;
    const last = groupSegments[groupSegments.length - 1];
    if (last && last.group === g && last.end === colNo - 1) last.end = colNo;
    else groupSegments.push({ group: g, start: colNo, end: colNo });
  });

  const groupMeta = {
    core: { label: x("All languages", "Tüm diller", "Toutes langues", "Todos los idiomas", "Tutte le lingue", "Sprachunabhängig"), bg: CATEGORY_EXCEL_COLORS.coreBg, fg: CATEGORY_EXCEL_COLORS.core },
  };
  CATEGORY_EXCEL_LANGS.forEach((l) => {
    groupMeta[`lang_${l}`] = { label: `🌐 ${LANG_LABELS[l]}`, bg: CATEGORY_EXCEL_COLORS.langBg, fg: CATEGORY_EXCEL_COLORS.lang };
  });

  const row1 = ws.getRow(1);
  row1.height = 20;
  for (const seg of groupSegments) {
    const meta = groupMeta[seg.group];
    if (!meta) continue;
    const cell = ws.getCell(1, seg.start);
    cell.value = meta.label;
    cell.fill = headerFill(meta.bg);
    cell.font = { bold: true, color: meta.fg, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = excelBorder();
    if (seg.end > seg.start) ws.mergeCells(1, seg.start, 1, seg.end);
  }

  const row2 = ws.getRow(2);
  row2.height = 28;
  cols.forEach((col, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = col.label;
    const isLang = String(col.group).startsWith("lang_");
    cell.fill = headerFill(isLang ? CATEGORY_EXCEL_COLORS.langBg : CATEGORY_EXCEL_COLORS.coreBg);
    cell.font = { bold: true, color: isLang ? CATEGORY_EXCEL_COLORS.lang : CATEGORY_EXCEL_COLORS.core, size: 9 };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = excelBorder();
    if (col.note) cell.note = col.note;
  });

  const row3 = ws.getRow(3);
  row3.height = 22;
  cols.forEach((col, i) => {
    const cell = row3.getCell(i + 1);
    cell.value = col.note;
    cell.fill = headerFill(CATEGORY_EXCEL_COLORS.hintBg);
    cell.font = { italic: true, color: { argb: "FF888888" }, size: 8 };
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    cell.border = excelBorder();
  });

  const keyIndex = {};
  cols.forEach((col, i) => {
    keyIndex[col.key] = i;
  });

  (rows || []).forEach((data, rIdx) => {
    const row = ws.getRow(4 + rIdx);
    row.height = 18;
    for (const [key, val] of Object.entries(data || {})) {
      const i = keyIndex[key];
      if (i === undefined) continue;
      const cell = row.getCell(i + 1);
      cell.value = val == null ? "" : val;
      cell.font = { size: 9 };
      cell.border = excelBorder();
      cell.alignment = { vertical: "middle", wrapText: key.startsWith("description_") };
    }
  });

  const idxWs = wb.addWorksheet(CATEGORY_INDEX_SHEET_NAME);
  idxWs.getColumn(1).width = 40;
  idxWs.getColumn(2).width = 28;
  idxWs.getColumn(3).width = 56;
  const idxHeaders = ["id", "slug", x("Path", "Yol", "Chemin", "Ruta", "Percorso", "Pfad")];
  idxHeaders.forEach((h, i) => {
    const cell = idxWs.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10 };
    cell.fill = headerFill(CATEGORY_EXCEL_COLORS.coreBg);
    cell.border = excelBorder();
  });
  (indexRows || []).forEach((row, i) => {
    idxWs.getCell(i + 2, 1).value = row.id || "";
    idxWs.getCell(i + 2, 2).value = row.slug || "";
    idxWs.getCell(i + 2, 3).value = row.path || row.name || "";
  });

  if ((indexRows || []).length) {
    const parentCol = keyIndex.parent_id + 1;
    const letter = colLetter(1);
    const end = Math.max(2, (indexRows || []).length + 1);
    ws.dataValidations.add(`${colLetter(parentCol)}4:${colLetter(parentCol)}5000`, {
      type: "list",
      allowBlank: true,
      formulae: [`=${CATEGORY_INDEX_SHEET_NAME}!$${letter}$2:$${letter}$${end}`],
      showErrorMessage: false,
    });
  }

  return { cols, keyIndex };
}

function rowValues(ws, rowNumber, maxCol) {
  const row = ws.getRow(rowNumber);
  const out = [];
  for (let c = 1; c <= maxCol; c++) out.push(cellPlain(row.getCell(c)));
  return out;
}

export function parseCategoryExcelWorksheet(ws) {
  let maxCol = 0;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      maxCol = Math.max(maxCol, colNumber);
    });
  });
  maxCol = Math.max(maxCol, Number(ws.columnCount) || 0, Number(ws.actualColumnCount) || 0);
  if (maxCol < 1) return { items: [], errors: ["Empty sheet"] };

  let headerRow = 2;
  for (let r = 1; r <= 5; r++) {
    const vals = rowValues(ws, r, maxCol).map((v) => v.toLowerCase());
    if (vals.includes("parent_id") || vals.includes("name_de") || vals.includes("slug") || vals.includes("id")) {
      headerRow = r;
      break;
    }
  }

  const headers = rowValues(ws, headerRow, maxCol).map((h) => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => {
    if (h) idx[h.toLowerCase()] = i;
  });

  const get = (vals, key) => {
    const i = idx[String(key || "").toLowerCase()];
    if (i === undefined) return "";
    return excelCellStr(vals[i]);
  };
  const present = (vals, key) => get(vals, key) !== "";

  let dataStart = headerRow + 1;
  const maybeHint = rowValues(ws, dataStart, maxCol);
  if (isCategoryExcelHintRow(get, maybeHint)) dataStart = headerRow + 2;

  const items = [];
  const errors = [];
  for (let r = dataStart; r <= (ws.rowCount || dataStart); r++) {
    const vals = rowValues(ws, r, maxCol);
    if (!vals.some((v) => v)) continue;
    if (get(vals, "id").startsWith("#") || get(vals, "slug").startsWith("#")) continue;
    if (isCategoryExcelHintRow(get, vals)) continue;

    const translations = {};
    for (const lang of CATEGORY_EXCEL_LANGS) {
      const patch = {};
      if (present(vals, `name_${lang}`)) patch.name = get(vals, `name_${lang}`);
      const description = get(vals, `description_${lang}`) || get(vals, `long_content_${lang}`);
      if (description) patch.long_content = description;
      if (present(vals, `seo_title_${lang}`)) patch.seo_title = get(vals, `seo_title_${lang}`);
      if (present(vals, `seo_description_${lang}`)) patch.seo_description = get(vals, `seo_description_${lang}`);
      if (present(vals, `seo_keywords_${lang}`)) patch.seo_keywords = get(vals, `seo_keywords_${lang}`);
      if (Object.keys(patch).length) translations[lang] = patch;
    }

    const item = {
      row: r,
      id: present(vals, "id") ? get(vals, "id") : undefined,
      slug: present(vals, "slug") ? get(vals, "slug") : undefined,
      parent_id: present(vals, "parent_id") ? get(vals, "parent_id") : undefined,
      sort_order: present(vals, "sort_order") ? get(vals, "sort_order") : undefined,
      active: present(vals, "active") ? get(vals, "active") : undefined,
      image_url: present(vals, "image_url") ? get(vals, "image_url") : undefined,
      banner_image_url: present(vals, "banner_image_url") ? get(vals, "banner_image_url") : undefined,
      translations,
    };

    const hasName = CATEGORY_EXCEL_LANGS.some((l) => translations[l]?.name);
    if (!item.id && !item.slug && !hasName) {
      errors.push({ row: r, error: "Need id, slug or name_de (or another language name)" });
      continue;
    }
    items.push(item);
  }

  return { items, errors };
}

export function categoryToExcelRow(cat) {
  const meta = cat?.metadata && typeof cat.metadata === "object" ? cat.metadata : {};
  const tr = meta.translations && typeof meta.translations === "object" ? meta.translations : {};
  const seoI18n = meta.seo_i18n && typeof meta.seo_i18n === "object" ? meta.seo_i18n : {};
  const row = {
    id: cat.id || "",
    slug: cat.slug || "",
    parent_id: cat.parent_id || "",
    sort_order: cat.sort_order ?? 0,
    active: cat.active === false ? "false" : "true",
    image_url: meta.image_url || cat.image_url || "",
    banner_image_url: meta.banner_image_url || cat.banner_image_url || "",
  };
  for (const lang of CATEGORY_EXCEL_LANGS) {
    const loc = tr[lang] && typeof tr[lang] === "object" ? tr[lang] : {};
    const seo = seoI18n[lang] && typeof seoI18n[lang] === "object" ? seoI18n[lang] : {};
    const isDe = lang === "de";
    const isEn = lang === "en";
    row[`name_${lang}`] = loc.name || (isEn ? cat.name : "") || "";
    row[`description_${lang}`] =
      loc.long_content || loc.description || (isDe ? cat.long_content || meta.richtext : "") || "";
    row[`seo_title_${lang}`] =
      loc.seo_title || seo.meta_title || seo.title || (isDe ? cat.seo_title || meta.meta_title : "") || "";
    row[`seo_description_${lang}`] =
      loc.seo_description ||
      seo.meta_description ||
      seo.description ||
      (isDe ? cat.seo_description || meta.meta_description : "") ||
      "";
    row[`seo_keywords_${lang}`] =
      loc.keywords || loc.seo_keywords || seo.keywords || (isDe ? meta.keywords : "") || "";
  }
  return row;
}

export function flattenCategoryIndex(list) {
  const byId = new Map();
  (list || []).forEach((c) => {
    if (c?.id) byId.set(String(c.id), { ...c, children: [] });
  });
  const roots = [];
  byId.forEach((node) => {
    const pid = node.parent_id != null ? String(node.parent_id) : "";
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  });
  const out = [];
  const walk = (nodes, prefix) => {
    nodes.sort((a, b) => String(a.name || a.slug || "").localeCompare(String(b.name || b.slug || ""), undefined, { sensitivity: "base" }));
    for (const n of nodes) {
      const name = String(n.name || n.slug || n.id || "").trim();
      const path = prefix ? `${prefix} › ${name}` : name;
      out.push({ id: n.id, slug: n.slug || "", name, path });
      if (n.children?.length) walk(n.children, path);
    }
  };
  walk(roots, "");
  return out;
}

/** Parents before children so batched upserts can resolve parent_id within earlier batches. */
export function orderCategoryExcelItems(items) {
  const list = Array.isArray(items) ? items : [];
  const bySlug = new Map();
  const byId = new Map();
  const keyed = list.map((raw, i) => {
    const slug = String(raw.slug || "").trim().toLowerCase();
    const id = String(raw.id || "").trim().toLowerCase();
    const it = { ...raw, _slug: slug, _id: id, _key: id || slug || `row-${raw.row || i + 1}` };
    if (slug) bySlug.set(slug, it);
    if (UUID_RE.test(id)) byId.set(id, it);
    return it;
  });
  const visiting = new Set();
  const seen = new Set();
  const out = [];
  const visit = (it) => {
    const key = it._key;
    if (seen.has(key) || visiting.has(key)) return;
    visiting.add(key);
    const pref = String(it.parent_id || "").trim();
    if (pref) {
      const parent = UUID_RE.test(pref) ? byId.get(pref.toLowerCase()) : bySlug.get(pref.toLowerCase());
      if (parent && parent !== it) visit(parent);
    }
    visiting.delete(key);
    seen.add(key);
    const { _slug, _id, _key, ...rest } = it;
    out.push(rest);
  };
  keyed.forEach(visit);
  return out;
}
