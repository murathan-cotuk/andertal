import ExcelJS from "exceljs";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const COUNTRIES = ["DE", "AT", "CH", "FR", "IT", "ES", "TR", "US"];

const LANG_LABELS = { de: "Deutsch", en: "English", tr: "Türkçe", fr: "Français", it: "Italiano", es: "Español" };
const COUNTRY_LABELS = {
  DE: "Deutschland (EUR)", AT: "Österreich (EUR)", CH: "Schweiz (CHF)",
  FR: "Frankreich (EUR)", IT: "Italien (EUR)", ES: "Spanien (EUR)",
  TR: "Türkei (TRY)", US: "USA (USD)",
};

const DEFAULT_BACKEND = "https://belucha-medusa-backend.onrender.com";

const METAFIELD_PAIRS = 15; // template shows 15; import accepts any metafield_N_key/value columns

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

/** 1-based column index → Excel letters */
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

function flattenCategoryTree(nodes, parentPath = "") {
  const out = [];
  for (const node of nodes || []) {
    const slug = (node.slug || "").trim();
    const name = (node.name || slug || "").trim();
    const path = parentPath ? `${parentPath} › ${name}` : name;
    if (slug) out.push({ id: node.id, slug, name, path });
    const children = node.children || node.category_children;
    if (Array.isArray(children) && children.length) {
      out.push(...flattenCategoryTree(children, path));
    }
  }
  return out;
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadReferenceData(backendUrl, sellerToken) {
  const authHeaders = sellerToken
    ? { Authorization: `Bearer ${sellerToken}` }
    : {};

  let catsFlat = [];
  try {
    const u = `${backendUrl}/admin-hub/v1/categories?tree=true&active=true`;
    const data = await fetchJson(u);
    const tree = data.tree || data.categories || [];
    catsFlat = flattenCategoryTree(Array.isArray(tree) ? tree : []);
  } catch {
    catsFlat = [];
  }

  let brands = [];
  try {
    if (sellerToken) {
      const data = await fetchJson(`${backendUrl}/admin-hub/brands`, { headers: authHeaders });
      brands = Array.isArray(data.brands) ? data.brands : [];
    }
  } catch {
    brands = [];
  }

  let shippingGroups = [];
  try {
    if (sellerToken) {
      const data = await fetchJson(`${backendUrl}/admin-hub/v1/shipping-groups`, { headers: authHeaders });
      shippingGroups = Array.isArray(data.groups) ? data.groups : [];
    }
  } catch {
    shippingGroups = [];
  }

  return { catsFlat, brands, shippingGroups };
}

/** Column definitions — no collection_handles, no handle_*; shipping + extra options + metafields */
function buildColumns() {
  const cols = [];

  const core = [
    { key: "product_type", label: "product_type", note: "Dropdown: parent | child", width: 14, group: "core" },
    { key: "sku", label: "sku", note: "Eindeutige Artikel-Nr. (Pflicht)", width: 20, group: "core" },
    { key: "parent_sku", label: "parent_sku", note: "Nur child: SKU der Parent-Zeile", width: 20, group: "core" },
    { key: "status", label: "status", note: "Dropdown: draft | published", width: 13, group: "core" },
    { key: "ean", label: "ean", note: "EAN / GTIN", width: 18, group: "core" },
    { key: "inventory", label: "inventory", note: "Lagerbestand (Zahl)", width: 12, group: "core" },
    { key: "brand", label: "brand", note: "Dropdown: Markenname wie in der Liste", width: 18, group: "core" },
    { key: "type", label: "type", note: "Produkttyp / Bezeichnung (frei)", width: 16, group: "core" },
    { key: "category_slug", label: "category_slug", note: "Dropdown: exakter Slug aus der Kategorienliste", width: 22, group: "core" },
    { key: "shipping_group", label: "shipping_group", note: "Dropdown: Versandgruppe (Name)", width: 22, group: "core" },
    { key: "hersteller", label: "hersteller", note: "GPSR: Hersteller (Pflicht)", width: 26, group: "core" },
    { key: "hersteller_information", label: "hersteller_information", note: "GPSR: Hersteller-Informationen (Pflicht)", width: 42, group: "core" },
    { key: "verantwortliche_person_information", label: "verantwortliche_person_information", note: "GPSR: Verantwortliche Person EU (Pflicht)", width: 42, group: "core" },
    { key: "weight_grams", label: "weight_grams", note: "Gewicht in Gramm", width: 14, group: "core" },
    { key: "dim_length_cm", label: "dim_length_cm", note: "Länge cm", width: 14, group: "core" },
    { key: "dim_width_cm", label: "dim_width_cm", note: "Breite cm", width: 13, group: "core" },
    { key: "dim_height_cm", label: "dim_height_cm", note: "Höhe cm", width: 13, group: "core" },
    { key: "image_url_1", label: "image_url_1", note: "Bild-URL 1 (Parent/Hauptbild)", width: 40, group: "core" },
    { key: "image_url_2", label: "image_url_2", note: "Bild-URL 2", width: 40, group: "core" },
    { key: "image_url_3", label: "image_url_3", note: "Bild-URL 3", width: 40, group: "core" },
    { key: "image_url_4", label: "image_url_4", note: "Bild-URL 4", width: 40, group: "core" },
    { key: "image_url_5", label: "image_url_5", note: "Bild-URL 5", width: 40, group: "core" },
    { key: "swatch_image_url", label: "swatch_image_url", note: "Farbmuster-URL (oft Variante 1)", width: 28, group: "core" },
    { key: "option1_name", label: "option1_name", note: "Parent: z.B. Farbe", width: 16, group: "core" },
    { key: "option1_value", label: "option1_value", note: "Child: z.B. Rot", width: 16, group: "core" },
    { key: "option2_name", label: "option2_name", note: "Parent: z.B. Größe", width: 16, group: "core" },
    { key: "option2_value", label: "option2_value", note: "Child: z.B. M", width: 14, group: "core" },
    { key: "option3_name", label: "option3_name", note: "Parent: weitere Option (optional)", width: 16, group: "core" },
    { key: "option3_value", label: "option3_value", note: "Child: Wert für Option 3", width: 16, group: "core" },
    { key: "option4_name", label: "option4_name", note: "Parent: weitere Option (optional)", width: 16, group: "core" },
    { key: "option4_value", label: "option4_value", note: "Child: Wert für Option 4", width: 16, group: "core" },
    { key: "option5_name", label: "option5_name", note: "Parent: weitere Option (optional)", width: 16, group: "core" },
    { key: "option5_value", label: "option5_value", note: "Child: Wert für Option 5", width: 16, group: "core" },
    { key: "option6_name", label: "option6_name", note: "Parent: weitere Option (optional)", width: 16, group: "core" },
    { key: "option6_value", label: "option6_value", note: "Child: Wert für Option 6", width: 16, group: "core" },
    { key: "unit_type", label: "unit_type", note: "Dropdown: kg | g | L | ml | stück", width: 12, group: "core" },
    { key: "unit_value", label: "unit_value", note: "z.B. 200", width: 12, group: "core" },
  ];
  cols.push(...core);

  for (const lang of LANGS) {
    cols.push(
      { key: `variant_title_${lang}`, label: `variant_title_${lang}`, note: `Child: Variant Titel (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_description_${lang}`, label: `variant_description_${lang}`, note: `Child: Variant Beschreibung (${LANG_LABELS[lang]})`, width: 38, group: "core" },
      { key: `variant_bullet1_${lang}`, label: `variant_bullet1_${lang}`, note: `Child: Variant Bullet 1 (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_bullet2_${lang}`, label: `variant_bullet2_${lang}`, note: `Child: Variant Bullet 2 (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_bullet3_${lang}`, label: `variant_bullet3_${lang}`, note: `Child: Variant Bullet 3 (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_bullet4_${lang}`, label: `variant_bullet4_${lang}`, note: `Child: Variant Bullet 4 (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_bullet5_${lang}`, label: `variant_bullet5_${lang}`, note: `Child: Variant Bullet 5 (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_seo_title_${lang}`, label: `variant_seo_title_${lang}`, note: `Child: Variant SEO Titel (${LANG_LABELS[lang]})`, width: 30, group: "core" },
      { key: `variant_seo_description_${lang}`, label: `variant_seo_description_${lang}`, note: `Child: Variant SEO Beschreibung (${LANG_LABELS[lang]})`, width: 40, group: "core" },
      { key: `variant_seo_keywords_${lang}`, label: `variant_seo_keywords_${lang}`, note: `Child: Variant SEO Keywords (${LANG_LABELS[lang]})`, width: 30, group: "core" },
    );
  }

  for (let i = 1; i <= METAFIELD_PAIRS; i++) {
    cols.push(
      { key: `metafield_${i}_key`, label: `metafield_${i}_key`, note: `Metafeld ${i} — technischer Schlüssel`, width: 22, group: "metafields", outline: 1 },
      { key: `metafield_${i}_value`, label: `metafield_${i}_value`, note: `Metafield ${i} — Wert (Text)`, width: 34, group: "metafields", outline: 1 }
    );
  }
  for (let i = 1; i <= METAFIELD_PAIRS; i++) {
    cols.push(
      { key: `variant_metafield_${i}_key`, label: `variant_metafield_${i}_key`, note: `Child Variant-Metafeld ${i} — key`, width: 24, group: "metafields", outline: 1 },
      { key: `variant_metafield_${i}_value`, label: `variant_metafield_${i}_value`, note: `Child Variant-Metafeld ${i} — value`, width: 34, group: "metafields", outline: 1 }
    );
  }

  for (const lang of LANGS) {
    cols.push(
      { key: `title_${lang}`, label: `title_${lang}`, note: `Titel (${LANG_LABELS[lang]})`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `description_${lang}`, label: `description_${lang}`, note: `Beschreibung HTML (${LANG_LABELS[lang]})`, width: 50, group: `lang_${lang}`, outline: 1 },
      { key: `bullet1_${lang}`, label: `bullet1_${lang}`, note: `Stichpunkt 1`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet2_${lang}`, label: `bullet2_${lang}`, note: `Stichpunkt 2`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet3_${lang}`, label: `bullet3_${lang}`, note: `Stichpunkt 3`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet4_${lang}`, label: `bullet4_${lang}`, note: `Stichpunkt 4`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet5_${lang}`, label: `bullet5_${lang}`, note: `Stichpunkt 5`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `seo_title_${lang}`, label: `seo_title_${lang}`, note: `SEO Titel (${LANG_LABELS[lang]})`, width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `seo_description_${lang}`, label: `seo_description_${lang}`, note: `SEO Beschreibung (${LANG_LABELS[lang]})`, width: 50, group: `lang_${lang}`, outline: 1 },
      { key: `seo_keywords_${lang}`, label: `seo_keywords_${lang}`, note: `SEO Keywords (${LANG_LABELS[lang]})`, width: 40, group: `lang_${lang}`, outline: 1 },
    );
  }

  for (const country of COUNTRIES) {
    cols.push(
      { key: `price_brutto_${country}`, label: `price_brutto_${country}`, note: `Brutto (${COUNTRY_LABELS[country]})`, width: 20, group: `price_${country}`, outline: 1 },
      { key: `price_uvp_${country}`, label: `price_uvp_${country}`, note: `UVP`, width: 18, group: `price_${country}`, outline: 1 },
      { key: `price_sale_${country}`, label: `price_sale_${country}`, note: `Aktionspreis`, width: 18, group: `price_${country}`, outline: 1 },
    );
  }

  cols.push(
    { key: "seo_title", label: "seo_title", note: "SEO-Titel", width: 36, group: "seo", outline: 1 },
    { key: "seo_description", label: "seo_description", note: "SEO-Beschreibung", width: 60, group: "seo", outline: 1 },
    { key: "seo_keywords", label: "seo_keywords", note: "Stichwörter (Komma)", width: 36, group: "seo", outline: 1 },
  );

  return cols;
}

const COLORS = {
  core: { argb: "FF1E3A5F" },
  lang: { argb: "FF1D6F42" },
  price: { argb: "FF7B3F00" },
  seo: { argb: "FF4A235A" },
  meta: { argb: "FF5F4B0B" },
  coreBg: { argb: "FFCCE5FF" },
  langBg: { argb: "FFD5F5E3" },
  priceBg: { argb: "FFFDEBD0" },
  seoBg: { argb: "FFF3E5F5" },
  metaBg: { argb: "FFF9E79F" },
  groupRow: { argb: "FFE8F4F8" },
};

function headerFill(bg) {
  return { type: "pattern", pattern: "solid", fgColor: bg };
}
function border() {
  const thin = { style: "thin", color: { argb: "FFCCCCCC" } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

const INFO_SHEET_TITLES = {
  de: "Anleitung",
  en: "Guide",
  tr: "Kılavuz",
  fr: "Guide",
  it: "Guida",
  es: "Guía",
};

function buildLocalizedInstructions(locale, { categoryRows, brandNames, shipNames }) {
  const allowed = ["de", "en", "tr", "fr", "it", "es"];
  const loc = allowed.includes(locale) ? locale : "de";
  const L = {
    de: {
      title: "BELUCHA — Produkte per Excel importieren",
      intro: "Diese Arbeitsmappe hat zwei Blätter: „Products“ (Ihre Daten) und „Anleitung“ (Spaltenhilfe). Die URL-Handles (SEO-Pfade) werden vom System automatisch aus dem Titel erzeugt — keine handle_*-Spalten.",
      categoriesTitle: "Für dieses Template gewählte Kategorien (category_slug exakt so eintragen):",
      noCats: "(Keine Kategorieauswahl — alle aktiven Kategorien stehen in den Dropdowns.)",
      slugsHeader: "slug\tPfad",
      brandsTitle: "Marken (Dropdown „brand“) — nur exakt diese Namen sind gültig; sonst schlägt der Import fehl:",
      shipTitle: "Versandgruppen (Dropdown „shipping_group“) — Namen wie unter Einstellungen > Versand:",
      colsTitle: "Wichtige Spalten (Blatt „Products“, ab Zeile 4)",
      rowStructure: "Zeilen 1–3: Gruppenkopf, Spaltenname, Kurzhinweis — nicht löschen.",
      parentChild: "Parent-Zeilen: gemeinsame Texte, Bilder, Preise, Kategorie, Marke, Versandgruppe, optionN_name (Optionstitel). Child-Zeilen: gleiche product_type-Spalte „child“, parent_sku, varianten-spezifisch optionN_value, SKU, EAN, Lager, optionale Bilder/Swatch.",
      options: "Varianten: Mindestens zwei Optionen (option1/option2) sind im Beispiel; Sie können option3_name … option6_name (und passende *_value in Child-Zeilen) nutzen. Weitere Optionen können Sie analog ergänzen (option7_name …), sofern Sie die Spalten in Excel hinzufügen — der Import liest alle fortlaufenden optionN_*-Spalten.",
      metafields: `Metafelder: Paare metafield_N_key / metafield_N_value (hier N=1…${METAFIELD_PAIRS}). Sie können weitere Paare mit N=16,17,… als neue Spalten anfügen — der Import übernimmt alle solchen Spalten.`,
      noCollection: "Kollektionen werden bei diesem Import nicht per Excel gesetzt — bitte im Anschluss in der Oberfläche zuordnen, falls nötig.",
      prices: "Preise mit Punkt als Dezimaltrenner (z.B. 29.99). HTML in description_* ist erlaubt.",
      comments: "Leere Datenzeilen werden übersprungen. Zeilen mit SKU beginnend mit # sind Kommentare.",
      skuUpdate:
        "Bestehende Produkte: Stimmt die Parent-SKU mit einer SKU im System überein, wird das Produkt aktualisiert — es wird nur überschrieben, was in der Excel-Zelle gefüllt ist; leere Zellen lassen die bisherigen Werte unverändert.",
    },
    en: {
      title: "BELUCHA — Import products via Excel",
      intro: 'This workbook has two sheets: "Products" (your data) and "Guide" (column help). URL handles are generated automatically from the title — there are no handle_* columns.',
      categoriesTitle: "Categories selected for this template (use these category_slug values exactly):",
      noCats: "(No category filter — dropdowns list all active categories.)",
      slugsHeader: "slug\tpath",
      brandsTitle: 'Brands ("brand" dropdown) — only these exact names are accepted:',
      shipTitle: 'Shipping groups ("shipping_group" dropdown) — names as in Settings > Shipping:',
      colsTitle: 'Key columns (sheet "Products", from row 4)',
      rowStructure: "Rows 1–3: group header, column key, short hint — do not delete.",
      parentChild: 'Parent rows: shared copy, images, prices, category, brand, shipping group, optionN_names. Child rows: product_type = child, parent_sku, per-variant optionN_value, SKU, EAN, stock, optional images/swatch.',
      options: "Variants: the sample uses two options; you may use option3…option6 (add option7_name / option7_value columns in Excel if needed — import reads consecutive optionN_* columns).",
      metafields: `Metafields: pairs metafield_N_key / metafield_N_value (here N=1…${METAFIELD_PAIRS}). Add columns for N=16,17,… as needed — all pairs are imported.`,
      noCollection: "Collections are not set via this Excel import — assign in the UI afterward if needed.",
      prices: "Use a dot for decimals (e.g. 29.99). HTML is allowed in description_*.",
      comments: "Empty rows are skipped. Rows with SKU starting with # are comments.",
      skuUpdate:
        "Existing products: If the parent row SKU matches a product SKU in the system, that product is updated — only cells you fill in Excel overwrite data; empty cells keep the previous values.",
    },
    tr: {
      title: "BELUCHA — Excel ile ürün içe aktarma",
      intro: "Bu çalışma kitabı iki sayfa içerir: “Products” (verileriniz) ve “Kılavuz”. URL adresleri başlıktan otomatik oluşur; handle_* sütunları yoktur.",
      categoriesTitle: "Bu şablon için seçilen kategoriler (category_slug tam olarak):",
      noCats: "(Kategori seçilmedi — aşağı açılır listeler tüm aktif kategorileri gösterir.)",
      slugsHeader: "slug\tyol",
      brandsTitle: "Markalar (“brand”) — yalnızca bu adlar geçerlidir:",
      shipTitle: "Kargo grupları (“shipping_group”) — Ayarlar > Kargo adlarıyla aynı:",
      colsTitle: "Önemli sütunlar (“Products” sayfası, 4. satırdan itibaren)",
      rowStructure: "1–3. satırlar: grup başlığı, sütun adı, kısa not — silmeyin.",
      parentChild: "Parent satırlar: ortak metin, görseller, fiyat, kategori, marka, kargo grubu, optionN_name. Child: product_type = child, parent_sku, varyant için optionN_value, SKU, stok vb.",
      options: "Örnekte iki seçenek vardır; option3…option6 kullanılabilir; daha fazlası için Excel’de option7_name / option7_value sütunları eklenebilir.",
      metafields: `Metafield çiftleri: metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). N=16 ve sonrası sütun eklenebilir — içe aktarma hepsini okur.`,
      noCollection: "Koleksiyonlar bu Excel ile atanmaz — gerekirse arayüzden ekleyin.",
      prices: "Ondalık ayırıcı nokta (örn. 29.99). description_* alanında HTML kullanılabilir.",
      comments: "Boş satırlar atlanır. SKU # ile başlayan satırlar yorum sayılır.",
    },
  };
  const pack = { de: L.de, en: L.en, tr: L.tr, fr: L.en, it: L.en, es: L.en }[loc] || L.de;

  const lines = [];
  lines.push(["", pack.title]);
  lines.push(["", ""]);
  lines.push(["", pack.intro]);
  lines.push(["", ""]);
  lines.push(["", pack.categoriesTitle]);
  if (categoryRows.length === 0) {
    lines.push(["", pack.noCats]);
  } else {
    lines.push(["", pack.slugsHeader]);
    for (const c of categoryRows) {
      lines.push(["", `${c.slug}\t${c.path}`]);
    }
  }
  lines.push(["", ""]);
  lines.push(["", pack.brandsTitle]);
  lines.push(["", brandNames.length ? `(${brandNames.length} Marken im Dropdown verfügbar)` : "(—)"]);
  lines.push(["", ""]);
  lines.push(["", pack.shipTitle]);
  if (shipNames.length === 0) {
    lines.push(["", "(—)"]);
  } else {
    for (const n of shipNames) lines.push(["", `• ${n}`]);
  }
  lines.push(["", ""]);
  lines.push(["", pack.colsTitle]);
  lines.push(["", pack.rowStructure]);
  lines.push(["", pack.parentChild]);
  lines.push(["", pack.options]);
  lines.push(["", pack.metafields]);
  lines.push(["", pack.noCollection]);
  lines.push(["", pack.prices]);
  lines.push(["", pack.comments]);
  if (pack.skuUpdate) lines.push(["", pack.skuUpdate]);
  return { lines, sheetTitle: `📋 ${INFO_SHEET_TITLES[loc] || "Anleitung"}` };
}

function fillListsSheet(ws, lists) {
  const { productTypes, statuses, unitTypes, categorySlugs, brandNames, shipNames } = lists;

  productTypes.forEach((v, i) => { ws.getCell(i + 1, 1).value = v; });
  statuses.forEach((v, i) => { ws.getCell(i + 1, 2).value = v; });
  unitTypes.forEach((v, i) => { ws.getCell(i + 1, 3).value = v; });
  categorySlugs.forEach((v, i) => { ws.getCell(i + 1, 4).value = v; });
  brandNames.forEach((v, i) => { ws.getCell(i + 1, 5).value = v; });
  shipNames.forEach((v, i) => { ws.getCell(i + 1, 6).value = v; });

  ws.state = "veryHidden";
  ws.columns = [
    { width: 14 }, { width: 12 }, { width: 10 },
    { width: 28 }, { width: 22 }, { width: 26 },
  ];

  return {
    rA: { col: 1, start: 1, end: Math.max(1, productTypes.length) },
    rB: { col: 2, start: 1, end: Math.max(1, statuses.length) },
    rC: { col: 3, start: 1, end: Math.max(1, unitTypes.length) },
    rD: { col: 4, start: 1, end: Math.max(1, categorySlugs.length) },
    rE: { col: 5, start: 1, end: Math.max(1, brandNames.length) },
    rF: { col: 6, start: 1, end: Math.max(1, shipNames.length) },
  };
}

function applyListValidation(ws, colIndex, listRef, maxRow = 5000) {
  if (!listRef || listRef.end < listRef.start) return;
  const letter = colLetter(listRef.col);
  const f = `Lists!$${letter}$${listRef.start}:$${letter}$${listRef.end}`;
  const targetLetter = colLetter(colIndex);
  ws.dataValidations.add(`${targetLetter}4:${targetLetter}${maxRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${f}`],
  });
}

async function buildWorkbook({
  locale,
  categoriesForList,
  brands,
  shippingGroups,
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Belucha Sellercentral";
  wb.created = new Date();

  const categorySlugs = [...new Set(categoriesForList.map((c) => c.slug))].sort();
  const brandNames = [...new Set(brands.map((b) => String(b.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shipNames = [...new Set(shippingGroups.map((g) => String(g.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const ws = wb.addWorksheet("Products", {
    properties: { outlineLevelCol: 1, defaultColWidth: 16 },
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
  });

  const cols = buildColumns();
  cols.forEach((col, i) => {
    const exCol = ws.getColumn(i + 1);
    exCol.width = col.width;
    if (col.outline) {
      exCol.outlineLevel = col.outline;
      exCol.hidden = true;
    }
  });

  const groups = {};
  cols.forEach((col, i) => {
    const g = col.group;
    if (!groups[g]) groups[g] = { start: i + 1, end: i + 1 };
    else groups[g].end = i + 1;
  });

  const groupMeta = {
    core: { label: "Core", bg: COLORS.coreBg, fg: COLORS.core },
    seo: { label: "SEO", bg: COLORS.seoBg, fg: COLORS.seo },
    metafields: { label: "Metafields (optional +)", bg: COLORS.metaBg, fg: COLORS.meta },
  };
  LANGS.forEach((l) => {
    groupMeta[`lang_${l}`] = { label: `🌐 ${LANG_LABELS[l]}`, bg: COLORS.langBg, fg: COLORS.lang };
  });
  COUNTRIES.forEach((c) => {
    groupMeta[`price_${c}`] = { label: `💰 ${COUNTRY_LABELS[c]}`, bg: COLORS.priceBg, fg: COLORS.price };
  });

  const row1 = ws.getRow(1);
  row1.height = 20;
  for (const [g, span] of Object.entries(groups)) {
    const meta = groupMeta[g];
    if (!meta) continue;
    const cell = ws.getCell(1, span.start);
    cell.value = meta.label;
    cell.fill = headerFill(meta.bg);
    cell.font = { bold: true, color: meta.fg, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border();
    if (span.end > span.start) ws.mergeCells(1, span.start, 1, span.end);
  }

  const row2 = ws.getRow(2);
  row2.height = 28;
  cols.forEach((col, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = col.label;
    const isLang = col.group.startsWith("lang_");
    const isPri = col.group.startsWith("price_");
    const isMeta = col.group === "metafields";
    cell.fill = headerFill(
      isLang ? COLORS.langBg : isPri ? COLORS.priceBg : col.group === "seo" ? COLORS.seoBg : isMeta ? COLORS.metaBg : COLORS.coreBg
    );
    cell.font = {
      bold: true,
      color: isLang ? COLORS.lang : isPri ? COLORS.price : col.group === "seo" ? COLORS.seo : isMeta ? COLORS.meta : COLORS.core,
      size: 9,
    };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = border();
    if (col.note) cell.note = col.note;
  });

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

  const keyIndex = {};
  cols.forEach((col, i) => {
    keyIndex[col.key] = i;
  });

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
    for (let j = 0; j < cols.length; j++) {
      const c = row.getCell(j + 1);
      if (!c.value && c.value !== 0) {
        c.fill = headerFill({ argb: bgArgb });
        c.border = border();
      }
    }
  }

  const exBrand = brandNames[0] || "Markenname";
  const exCat = categorySlugs[0] || "kategorie-slug";
  const exShip = shipNames[0] || "";

  setRow(4, {
    product_type: "parent",
    sku: "SHIRT-001",
    status: "published",
    ean: "4012345678901",
    inventory: "",
    brand: exBrand,
    type: "T-Shirt",
    category_slug: exCat,
    shipping_group: exShip,
    weight_grams: 200,
    image_url_1: "https://example.com/img/shirt-001.jpg",
    option1_name: "Farbe",
    option2_name: "Größe",
    title_de: "T-Shirt Basic",
    description_de: "<p>Hochwertiges Basic T-Shirt.</p>",
    bullet1_de: "100% Baumwolle",
    bullet2_de: "Maschinenwaschbar",
    bullet3_de: "Regular Fit",
    title_en: "Basic T-Shirt",
    description_en: "<p>High-quality basic T-shirt.</p>",
    price_brutto_DE: "29.99",
    price_uvp_DE: "39.99",
    price_brutto_AT: "29.99",
    price_brutto_CH: "32.00",
    seo_title: "Basic T-Shirt kaufen",
    seo_description: "Jetzt Basic T-Shirt online bestellen.",
  }, "FFFAFAFA");

  setRow(5, {
    product_type: "child",
    sku: "SHIRT-001-ROT-S",
    parent_sku: "SHIRT-001",
    ean: "4012345678902",
    inventory: 50,
    image_url_1: "https://example.com/img/shirt-001-rot.jpg",
    swatch_image_url: "https://example.com/img/swatch-rot.jpg",
    option1_value: "Rot",
    option2_value: "S",
  }, "FFEAF6FF");

  setRow(6, {
    product_type: "child",
    sku: "SHIRT-001-ROT-M",
    parent_sku: "SHIRT-001",
    ean: "4012345678903",
    inventory: 80,
    image_url_1: "https://example.com/img/shirt-001-rot.jpg",
    swatch_image_url: "https://example.com/img/swatch-rot.jpg",
    option1_value: "Rot",
    option2_value: "M",
  }, "FFEAF6FF");

  const categoryRowsForInfo = categoriesForList.slice().sort((a, b) => a.path.localeCompare(b.path));
  const { lines: instrLines, sheetTitle } = buildLocalizedInstructions(locale, {
    categoryRows: categoryRowsForInfo,
    brandNames,
    shipNames,
  });

  const wsInfo = wb.addWorksheet(sheetTitle.substring(0, 31), { properties: { defaultColWidth: 88 } });
  wsInfo.state = "veryHidden";
  wsInfo.getColumn(1).width = 4;
  wsInfo.getColumn(2).width = 92;

  instrLines.forEach((rowPair, i) => {
    const row = wsInfo.getRow(i + 1);
    const cell = row.getCell(2);
    cell.value = rowPair[1];
    const t = String(rowPair[1] || "");
    if (
      t.startsWith("BELUCHA") ||
      t.includes("Categories selected") ||
      t.includes("Kategorien") ||
      t.includes("gewählte") ||
      t.includes("Marken") ||
      t.includes("Brands") ||
      t.includes("Versand") ||
      t.includes("Shipping") ||
      t.includes("kargo") ||
      t.includes("Wichtige") ||
      t.includes("Key columns") ||
      t.includes("Önemli") ||
      t.startsWith("Zeilen ") ||
      t.startsWith("Rows ")
    ) {
      cell.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    } else {
      cell.font = { size: 10 };
    }
    row.height = 16;
  });

  const listsWs = wb.addWorksheet("Lists");
  const listRefs = fillListsSheet(listsWs, {
    productTypes: ["parent", "child"],
    statuses: ["draft", "published"],
    unitTypes: ["kg", "g", "L", "ml", "stück"],
    categorySlugs: categorySlugs.length ? categorySlugs : ["—"],
    brandNames: brandNames.length ? brandNames : ["—"],
    shipNames: shipNames.length ? shipNames : ["—"],
  });

  const ix = (k) => keyIndex[k] + 1;
  applyListValidation(ws, ix("product_type"), listRefs.rA);
  applyListValidation(ws, ix("status"), listRefs.rB);
  applyListValidation(ws, ix("unit_type"), listRefs.rC);
  applyListValidation(ws, ix("category_slug"), listRefs.rD);
  applyListValidation(ws, ix("brand"), listRefs.rE);
  applyListValidation(ws, ix("shipping_group"), listRefs.rF);

  return wb.xlsx.writeBuffer();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawLocale = typeof body.locale === "string" ? body.locale : "de";
    const locale = rawLocale.split("-")[0].toLowerCase();
    const sellerToken = typeof body.sellerToken === "string" ? body.sellerToken : "";
    const selectedCategorySlugs = Array.isArray(body.selectedCategorySlugs)
      ? body.selectedCategorySlugs.map((s) => String(s).trim()).filter(Boolean)
      : [];

    if (selectedCategorySlugs.length === 0) {
      return Response.json(
        { error: "Bitte mindestens eine Kategorie wählen, bevor Sie die Vorlage laden." },
        { status: 400 }
      );
    }

    const backendUrl = getBackendBase();
    const { catsFlat, brands, shippingGroups } = await loadReferenceData(backendUrl, sellerToken);

    const slugSet = new Set(selectedCategorySlugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
    const categoriesForList = catsFlat.filter((c) => slugSet.has(String(c.slug || "").trim().toLowerCase()));
    if (categoriesForList.length === 0) {
      return Response.json(
        {
          error:
            "Keine der gewählten Kategorien wurde im System gefunden. Bitte erneut auswählen oder Slugs prüfen.",
        },
        { status: 400 }
      );
    }

    const buf = await buildWorkbook({
      locale,
      categoriesForList,
      brands,
      shippingGroups,
    });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="belucha-produkte-template.xlsx"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("Template POST:", e);
    return Response.json({ error: e.message || "Template failed" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json(
    {
      error:
        "Bitte die Vorlage über die Import/Export-Seite herunterladen (POST mit Kategorieauswahl und Anmeldung).",
    },
    { status: 405 }
  );
}
