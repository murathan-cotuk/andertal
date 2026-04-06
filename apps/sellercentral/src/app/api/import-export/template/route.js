import ExcelJS from "exceljs";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const COUNTRIES = ["DE", "AT", "CH", "FR", "IT", "ES", "TR", "US"];

const LANG_LABELS = { de: "Deutsch", en: "English", tr: "Türkçe", fr: "Français", it: "Italiano", es: "Español" };
const COUNTRY_LABELS = {
  DE: "Deutschland (EUR)", AT: "Österreich (EUR)", CH: "Schweiz (CHF)",
  FR: "Frankreich (EUR)", IT: "Italien (EUR)", ES: "Spanien (EUR)",
  TR: "Türkei (TRY)", US: "USA (USD)",
};

// Column definitions
function buildColumns() {
  const cols = [];

  // ── Core (always visible) ───────────────────────────────────────────────
  const core = [
    { key: "product_type",         label: "product_type",          note: "parent | child",            width: 14, group: "core" },
    { key: "sku",                  label: "sku",                   note: "Unique SKU (required)",      width: 20, group: "core" },
    { key: "parent_sku",           label: "parent_sku",            note: "Parent SKU for child rows",  width: 20, group: "core" },
    { key: "status",               label: "status",                note: "draft | published",          width: 13, group: "core" },
    { key: "ean",                  label: "ean",                   note: "EAN / GTIN",                 width: 18, group: "core" },
    { key: "inventory",            label: "inventory",             note: "Stock quantity",             width: 12, group: "core" },
    { key: "brand",                label: "brand",                 note: "Brand name",                 width: 16, group: "core" },
    { key: "type",                 label: "type",                  note: "Product type",               width: 16, group: "core" },
    { key: "category_slug",        label: "category_slug",         note: "Category slug",              width: 20, group: "core" },
    { key: "collection_handles",   label: "collection_handles",    note: "Comma-sep. handles",         width: 24, group: "core" },
    { key: "weight_grams",         label: "weight_grams",          note: "Weight in grams",            width: 14, group: "core" },
    { key: "dim_length_cm",        label: "dim_length_cm",         note: "Length (cm)",                width: 14, group: "core" },
    { key: "dim_width_cm",         label: "dim_width_cm",          note: "Width (cm)",                 width: 13, group: "core" },
    { key: "dim_height_cm",        label: "dim_height_cm",         note: "Height (cm)",                width: 13, group: "core" },
    { key: "image_url_1",          label: "image_url_1",           note: "Main image URL",             width: 40, group: "core" },
    { key: "image_url_2",          label: "image_url_2",           note: "Image 2 URL",                width: 40, group: "core" },
    { key: "image_url_3",          label: "image_url_3",           note: "Image 3 URL",                width: 40, group: "core" },
    { key: "image_url_4",          label: "image_url_4",           note: "Image 4 URL",                width: 40, group: "core" },
    { key: "image_url_5",          label: "image_url_5",           note: "Image 5 URL",                width: 40, group: "core" },
    { key: "swatch_image_url",     label: "swatch_image_url",      note: "Swatch / color dot image",   width: 28, group: "core" },
    { key: "option1_name",         label: "option1_name",          note: "e.g. Farbe",                 width: 16, group: "core" },
    { key: "option1_value",        label: "option1_value",         note: "e.g. Rot",                   width: 16, group: "core" },
    { key: "option2_name",         label: "option2_name",          note: "e.g. Größe",                 width: 16, group: "core" },
    { key: "option2_value",        label: "option2_value",         note: "e.g. M",                     width: 14, group: "core" },
    { key: "unit_type",            label: "unit_type",             note: "kg|g|L|ml|stück",            width: 12, group: "core" },
    { key: "unit_value",           label: "unit_value",            note: "e.g. 200",                   width: 12, group: "core" },
  ];
  cols.push(...core);

  // ── Language groups ─────────────────────────────────────────────────────
  for (const lang of LANGS) {
    cols.push(
      { key: `title_${lang}`,       label: `title_${lang}`,       note: `Title (${LANG_LABELS[lang]})`,       width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `description_${lang}`, label: `description_${lang}`, note: `HTML description (${LANG_LABELS[lang]})`, width: 50, group: `lang_${lang}`, outline: 1 },
      { key: `handle_${lang}`,      label: `handle_${lang}`,      note: `URL handle (${LANG_LABELS[lang]})`,  width: 28, group: `lang_${lang}`, outline: 1 },
      { key: `bullet1_${lang}`,     label: `bullet1_${lang}`,     note: `Bullet point 1`,                     width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet2_${lang}`,     label: `bullet2_${lang}`,     note: `Bullet point 2`,                     width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet3_${lang}`,     label: `bullet3_${lang}`,     note: `Bullet point 3`,                     width: 36, group: `lang_${lang}`, outline: 1 },
    );
  }

  // ── Pricing groups ──────────────────────────────────────────────────────
  for (const country of COUNTRIES) {
    cols.push(
      { key: `price_brutto_${country}`, label: `price_brutto_${country}`, note: `Gross price (${COUNTRY_LABELS[country]})`, width: 20, group: `price_${country}`, outline: 1 },
      { key: `price_uvp_${country}`,    label: `price_uvp_${country}`,    note: `UVP/MSRP`,                                 width: 18, group: `price_${country}`, outline: 1 },
      { key: `price_sale_${country}`,   label: `price_sale_${country}`,   note: `Sale price`,                               width: 18, group: `price_${country}`, outline: 1 },
    );
  }

  // ── SEO ─────────────────────────────────────────────────────────────────
  cols.push(
    { key: "seo_title",       label: "seo_title",       note: "SEO meta title",       width: 36, group: "seo", outline: 1 },
    { key: "seo_description", label: "seo_description", note: "SEO meta description", width: 60, group: "seo", outline: 1 },
    { key: "seo_keywords",    label: "seo_keywords",    note: "Keywords (comma-sep.)", width: 36, group: "seo", outline: 1 },
  );

  return cols;
}

// Color palette
const COLORS = {
  core:    { argb: "FF1E3A5F" },  // dark blue — header text
  lang:    { argb: "FF1D6F42" },  // dark green
  price:   { argb: "FF7B3F00" },  // dark brown
  seo:     { argb: "FF4A235A" },  // purple

  coreBg:  { argb: "FFCCE5FF" },  // light blue
  langBg:  { argb: "FFD5F5E3" },  // light green
  priceBg: { argb: "FFFDEBD0" },  // light orange
  seoBg:   { argb: "FFF3E5F5" },  // light purple

  groupRow:{ argb: "FFE8F4F8" },  // very light blue for group header row
  required:{ argb: "FFFF6B35" },  // orange for required markers

  example1:{ argb: "FFFAFAFA" },
  example2:{ argb: "FFF0F8FF" },
};

function headerFill(bg) { return { type: "pattern", pattern: "solid", fgColor: bg }; }
function border() {
  const thin = { style: "thin", color: { argb: "FFCCCCCC" } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

export async function GET() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Belucha Sellercentral";
  wb.created = new Date();

  // ── PRODUCTS SHEET ──────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Products", {
    properties: { outlineLevelCol: 1, defaultColWidth: 16 },
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
  });

  const cols = buildColumns();

  // Set column widths and outline levels
  cols.forEach((col, i) => {
    const exCol = ws.getColumn(i + 1);
    exCol.width = col.width;
    if (col.outline) {
      exCol.outlineLevel = col.outline;
      exCol.hidden = true; // collapsed by default
    }
  });

  // ── Row 1: Group header labels ──────────────────────────────────────────
  const row1 = ws.getRow(1);
  row1.height = 20;

  // Track group spans for merging
  const groups = {};
  cols.forEach((col, i) => {
    const g = col.group;
    if (!groups[g]) groups[g] = { start: i + 1, end: i + 1 };
    else groups[g].end = i + 1;
  });

  // Fill group headers
  const groupMeta = {
    core: { label: "⚙ Core Fields (always required)", bg: COLORS.coreBg, fg: COLORS.core },
    seo:  { label: "🔍 SEO", bg: COLORS.seoBg, fg: COLORS.seo },
  };
  LANGS.forEach(l => {
    groupMeta[`lang_${l}`] = { label: `🌐 ${LANG_LABELS[l]} (${l.toUpperCase()})`, bg: COLORS.langBg, fg: COLORS.lang };
  });
  COUNTRIES.forEach(c => {
    groupMeta[`price_${c}`] = { label: `💰 ${COUNTRY_LABELS[c]}`, bg: COLORS.priceBg, fg: COLORS.price };
  });

  for (const [g, span] of Object.entries(groups)) {
    const meta = groupMeta[g];
    if (!meta) continue;
    const cell = ws.getCell(1, span.start);
    cell.value = meta.label;
    cell.fill = headerFill(meta.bg);
    cell.font = { bold: true, color: meta.fg, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border();
    if (span.end > span.start) {
      ws.mergeCells(1, span.start, 1, span.end);
    }
  }

  // ── Row 2: Column names ─────────────────────────────────────────────────
  const row2 = ws.getRow(2);
  row2.height = 28;

  cols.forEach((col, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = col.label;

    const isCore = col.group === "core";
    const isLang = col.group.startsWith("lang_");
    const isPri  = col.group.startsWith("price_");

    cell.fill = headerFill(isLang ? COLORS.langBg : isPri ? COLORS.priceBg : col.group === "seo" ? COLORS.seoBg : COLORS.coreBg);
    cell.font = { bold: true, color: isLang ? COLORS.lang : isPri ? COLORS.price : col.group === "seo" ? COLORS.seo : COLORS.core, size: 9 };
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
    cell.border = border();

    // Add note as comment
    if (col.note) {
      cell.note = col.note;
    }
  });

  // ── Row 3: Sub-header (notes) ───────────────────────────────────────────
  const row3 = ws.getRow(3);
  row3.height = 20;

  cols.forEach((col, i) => {
    const cell = row3.getCell(i + 1);
    cell.value = col.note;
    cell.fill = headerFill({ argb: "FFF7F7F7" });
    cell.font = { italic: true, color: { argb: "FF888888" }, size: 8 };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = border();
  });

  // ── Example rows (parent + 2 children) ─────────────────────────────────
  const keyIndex = {};
  cols.forEach((col, i) => { keyIndex[col.key] = i; });

  function setRow(rowNum, data, bgArgb) {
    const row = ws.getRow(rowNum);
    row.height = 18;
    for (const [key, val] of Object.entries(data)) {
      const i = keyIndex[key];
      if (i === undefined) continue;
      const cell = row.getCell(i + 1);
      cell.value = val;
      cell.fill = headerFill({ argb: bgArgb });
      cell.font = { size: 9 };
      cell.border = border();
      cell.alignment = { vertical: "middle" };
    }
    // fill remaining cells with bg
    for (let i = 0; i < cols.length; i++) {
      const c = row.getCell(i + 1);
      if (!c.value && c.value !== 0) {
        c.fill = headerFill({ argb: bgArgb });
        c.border = border();
      }
    }
  }

  setRow(4, {
    product_type: "parent", sku: "SHIRT-001", status: "published",
    ean: "4012345678901", inventory: "", brand: "MyBrand", type: "T-Shirt",
    category_slug: "t-shirts", collection_handles: "neuheiten,sale",
    weight_grams: 200, image_url_1: "https://example.com/img/shirt-001.jpg",
    option1_name: "Farbe", option2_name: "Größe",
    title_de: "T-Shirt Basic", description_de: "<p>Hochwertiges Basic T-Shirt.</p>",
    handle_de: "t-shirt-basic", bullet1_de: "100% Baumwolle", bullet2_de: "Maschinenwaschbar",
    title_en: "Basic T-Shirt", description_en: "<p>High-quality basic T-shirt.</p>",
    price_brutto_DE: "29.99", price_uvp_DE: "39.99",
    price_brutto_AT: "29.99", price_brutto_CH: "32.00",
    seo_title: "Basic T-Shirt kaufen", seo_description: "Jetzt Basic T-Shirt online bestellen.",
  }, "FFFAFAFA");

  setRow(5, {
    product_type: "child", sku: "SHIRT-001-ROT-S", parent_sku: "SHIRT-001",
    ean: "4012345678902", inventory: 50,
    image_url_1: "https://example.com/img/shirt-001-rot.jpg",
    swatch_image_url: "https://example.com/img/swatch-rot.jpg",
    option1_value: "Rot", option2_value: "S",
  }, "FFEAF6FF");

  setRow(6, {
    product_type: "child", sku: "SHIRT-001-ROT-M", parent_sku: "SHIRT-001",
    ean: "4012345678903", inventory: 80,
    image_url_1: "https://example.com/img/shirt-001-rot.jpg",
    swatch_image_url: "https://example.com/img/swatch-rot.jpg",
    option1_value: "Rot", option2_value: "M",
  }, "FFEAF6FF");

  setRow(7, {
    product_type: "child", sku: "SHIRT-001-BLAU-M", parent_sku: "SHIRT-001",
    ean: "4012345678904", inventory: 60,
    image_url_1: "https://example.com/img/shirt-001-blau.jpg",
    swatch_image_url: "https://example.com/img/swatch-blau.jpg",
    option1_value: "Blau", option2_value: "M",
  }, "FFEAF6FF");

  // ── INSTRUCTIONS SHEET ──────────────────────────────────────────────────
  const wsInfo = wb.addWorksheet("📋 Anleitung", { properties: { defaultColWidth: 80 } });
  wsInfo.getColumn(1).width = 6;
  wsInfo.getColumn(2).width = 80;

  const instructions = [
    ["", ""],
    ["", "📦 BELUCHA PRODUKT-IMPORT — Anleitung"],
    ["", ""],
    ["", "AUFBAU (Amazon-Stil Parent/Child):"],
    ["", "  • Jede Produktvariante ist eine Zeile."],
    ["", "  • Eine parent-Zeile enthält alle gemeinsamen Infos (Titel, Beschreibung, Bilder, SEO...)."],
    ["", "  • Jede child-Zeile enthält die varianten-spezifischen Infos (SKU, EAN, Lager, Option-Werte, Swatch)."],
    ["", "  • Mehrere child-Zeilen verweisen auf denselben parent über das Feld parent_sku."],
    ["", ""],
    ["", "PFLICHTFELDER:"],
    ["", "  • product_type  — 'parent' oder 'child'"],
    ["", "  • sku           — eindeutige Artikel-Nr. (Buchstaben, Zahlen, Bindestriche)"],
    ["", "  • parent_sku    — nur bei child-Zeilen: SKU der parent-Zeile"],
    ["", "  • title_de      — Produktname auf Deutsch (Pflicht für parent-Zeilen)"],
    ["", "  • status        — 'draft' oder 'published'"],
    ["", ""],
    ["", "SPRACHGRUPPEN (+ Symbol zum Aufklappen):"],
    ["", "  • title_de, description_de, handle_de, bullet1_de … (Deutsch)"],
    ["", "  • title_en, description_en, … (Englisch)  usw. für tr, fr, it, es"],
    ["", "  • description_* unterstützt HTML: <p>, <b>, <ul>, <li> usw."],
    ["", ""],
    ["", "PREISGRUPPEN (+ Symbol zum Aufklappen):"],
    ["", "  • price_brutto_DE  — Bruttopreis in EUR für Deutschland"],
    ["", "  • price_uvp_DE     — Unverbindliche Preisempfehlung"],
    ["", "  • price_sale_DE    — Aktionspreis (optional)"],
    ["", "  • Für jedes Land (AT, CH, FR, IT, ES, TR, US) gibt es eigene Spalten."],
    ["", "  • Preise als Dezimalzahl mit Punkt: z.B. 29.99"],
    ["", ""],
    ["", "VARIANTEN-OPTIONEN:"],
    ["", "  • option1_name / option1_value — z.B. 'Farbe' / 'Rot'"],
    ["", "  • option2_name / option2_value — z.B. 'Größe' / 'S'"],
    ["", "  • option1_name wird nur im parent definiert (gilt für alle children)."],
    ["", ""],
    ["", "BILDER:"],
    ["", "  • image_url_1 bis image_url_5 — öffentliche Bild-URLs"],
    ["", "  • swatch_image_url — kleines Farbmuster-Bild für Varianten-Selector"],
    ["", ""],
    ["", "HINWEISE:"],
    ["", "  • Datei muss UTF-8 kodiert sein (Standard bei .xlsx)."],
    ["", "  • Sonderzeichen (ä, ö, ü, ß, é, ñ ...) werden vollständig unterstützt."],
    ["", "  • Leere Zeilen werden übersprungen."],
    ["", "  • Zeilen mit '#' am Anfang der SKU werden als Kommentar ignoriert."],
    ["", ""],
  ];

  instructions.forEach(([, text], i) => {
    const row = wsInfo.getRow(i + 1);
    const cell = row.getCell(2);
    cell.value = text;
    if (text.startsWith("📦") || text.startsWith("AUFBAU") || text.startsWith("PFLICHT") ||
        text.startsWith("SPRACH") || text.startsWith("PREIS") || text.startsWith("VARIANT") ||
        text.startsWith("BILD") || text.startsWith("HINWEIS")) {
      cell.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    } else {
      cell.font = { size: 10 };
    }
    row.height = 16;
  });

  // Generate buffer
  const buf = await wb.xlsx.writeBuffer();

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="belucha-produkte-template.xlsx"',
      "Cache-Control": "no-cache",
    },
  });
}
