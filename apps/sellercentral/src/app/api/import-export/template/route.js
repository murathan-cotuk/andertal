import ExcelJS from "exceljs";
import { getImportApiMessages, resolveRequestLocale } from "@/lib/import-export-i18n";
import { lt } from "@/lib/locale-text";
import { productExcelTemplateFilename } from "@/lib/download-names";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];


function langLabelsFor(locale) {
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

const DEFAULT_BACKEND = "https://api.andertal.com";

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
    const slug = String(node.slug || node.handle || "").trim();
    const name = String(node.name || node.title || slug || "").trim();
    const path = parentPath ? `${parentPath} › ${name}` : name;
    if (slug || node.id) {
      out.push({
        id: node.id,
        slug: slug || String(node.id || ""),
        handle: String(node.handle || "").trim(),
        name,
        path,
      });
    }
    const children = node.children || node.category_children;
    if (Array.isArray(children) && children.length) {
      out.push(...flattenCategoryTree(children, path));
    }
  }
  return out;
}

function flattenCategoryList(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (list.some((c) => Array.isArray(c?.children) && c.children.length)) {
    return flattenCategoryTree(list);
  }
  const byId = new Map();
  for (const c of list) {
    if (c?.id) byId.set(String(c.id), { ...c, children: [] });
  }
  if (byId.size === 0) return flattenCategoryTree(list);
  const roots = [];
  byId.forEach((node) => {
    const pid = node.parent_id != null ? String(node.parent_id) : "";
    if (pid && byId.has(pid)) byId.get(pid).children.push(node);
    else roots.push(node);
  });
  return flattenCategoryTree(roots);
}

function categoryMatchKeys(c) {
  return [c.slug, c.handle, c.id]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
}

async function loadCategoriesFlat(backendUrl, authHeaders, locale) {
  const loc = locale ? `&locale=${encodeURIComponent(locale)}` : "";
  const urls = [
    `${backendUrl}/admin-hub/v1/categories?tree=true&active=true${loc}`,
    `${backendUrl}/admin-hub/categories?tree=true&active=true${loc}`,
    `${backendUrl}/admin-hub/v1/categories?all=true&active=true${loc}`,
    `${backendUrl}/admin-hub/categories?all=true&active=true${loc}`,
  ];
  for (const u of urls) {
    try {
      const data = await fetchJson(u, { headers: authHeaders });
      const raw = data.tree || data.categories || [];
      const flat = flattenCategoryList(Array.isArray(raw) ? raw : []);
      if (flat.length) return flat;
    } catch {
      /* try next */
    }
  }
  return [];
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadReferenceData(backendUrl, sellerToken, locale) {
  const authHeaders = sellerToken
    ? { Authorization: `Bearer ${sellerToken}` }
    : {};

  let catsFlat = [];
  try {
    catsFlat = await loadCategoriesFlat(backendUrl, authHeaders, locale);
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

  let metafieldDefs = {};
  try {
    if (sellerToken) {
      const data = await fetchJson(`${backendUrl}/admin-hub/metafield-definitions`, { headers: authHeaders });
      metafieldDefs = data?.definitions && typeof data.definitions === "object" ? data.definitions : {};
    }
  } catch {
    metafieldDefs = {};
  }

  return { catsFlat, brands, shippingGroups, metafieldDefs };
}

/** Column definitions — no collection_handles, no handle_*; shipping + extra options + metafields */
function buildColumns(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  const LANG_LABELS = langLabelsFor(loc);
  const cols = [];

  const core = [
    { key: "product_type", label: "product_type", note: x("Dropdown: parent | child", "Açılır liste: parent | child", "Liste: parent | child", "Lista: parent | child", "Elenco: parent | child", "Dropdown: parent | child"), width: 14, group: "core" },
    { key: "sku", label: "sku", note: x("Unique product SKU (required)", "Benzersiz ürün SKU (zorunlu)", "SKU produit unique (obligatoire)", "SKU único del producto (obligatorio)", "SKU prodotto univoco (obbligatorio)", "Eindeutige Produkt-SKU (Pflicht)"), width: 20, group: "core" },
    { key: "parent_sku", label: "parent_sku", note: x("Child only: parent row SKU", "Yalnızca child: üst satır SKU", "Enfant uniquement: SKU parent", "Solo child: SKU fila padre", "Solo child: SKU riga padre", "Nur Child: SKU der Parent-Zeile"), width: 20, group: "core" },
    { key: "status", label: "status", note: x("Dropdown: draft | published", "Açılır liste: draft | published", "Liste: draft | published", "Lista: draft | published", "Elenco: draft | published", "Dropdown: draft | published"), width: 13, group: "core" },
    { key: "ean", label: "ean", note: x("EAN / GTIN", "EAN / GTIN", "EAN / GTIN", "EAN / GTIN", "EAN / GTIN", "EAN / GTIN"), width: 18, group: "core" },
    { key: "inventory", label: "inventory", note: x("Inventory quantity", "Stok adedi", "Quantité en stock", "Cantidad en inventario", "Quantità a magazzino", "Lagerbestand"), width: 12, group: "core" },
    { key: "brand", label: "brand", note: x("Dropdown: brand name from list", "Açılır liste: listedeki marka adı", "Liste: nom de marque", "Lista: nombre de marca", "Elenco: nome marca", "Dropdown: Markenname aus Liste"), width: 18, group: "core" },
    { key: "type", label: "type", note: x("Product type", "Ürün tipi", "Type de produit", "Tipo de producto", "Tipo prodotto", "Produkttyp"), width: 16, group: "core" },
    { key: "category_slug", label: "category_slug", note: x("Dropdown: exact category slug from list", "Açılır liste: listedeki kategori slug", "Liste: slug catégorie exact", "Lista: slug de categoría exacto", "Elenco: slug categoria esatto", "Dropdown: exakter Kategorie-Slug aus Liste"), width: 22, group: "core" },
    { key: "shipping_group", label: "shipping_group", note: x("Dropdown: shipping group name", "Açılır liste: kargo grubu adı", "Liste: nom groupe livraison", "Lista: nombre grupo envío", "Elenco: nome gruppo spedizione", "Dropdown: Versandgruppenname"), width: 22, group: "core" },
    { key: "manufacturer", label: "manufacturer", note: x("GPSR: manufacturer (required)", "GPSR: üretici (zorunlu)", "GPSR: fabricant (obligatoire)", "GPSR: fabricante (obligatorio)", "GPSR: produttore (obbligatorio)", "GPSR: Hersteller (Pflicht)"), width: 26, group: "core" },
    { key: "manufacturer_information", label: "manufacturer_information", note: x("GPSR: manufacturer information (required)", "GPSR: üretici bilgisi (zorunlu)", "GPSR: informations fabricant (obligatoire)", "GPSR: información fabricante (obligatorio)", "GPSR: informazioni produttore (obbligatorio)", "GPSR: Herstellerangaben (Pflicht)"), width: 42, group: "core" },
    { key: "responsible_person_information", label: "responsible_person_information", note: x("GPSR: responsible person in EU (required)", "GPSR: AB sorumlu kişi (zorunlu)", "GPSR: personne responsable UE (obligatoire)", "GPSR: persona responsable UE (obligatorio)", "GPSR: persona responsabile UE (obbligatorio)", "GPSR: verantwortliche Person in der EU (Pflicht)"), width: 42, group: "core" },
    { key: "weight_grams", label: "weight_grams", note: x("Weight in grams", "Ağırlık (gram)", "Poids en grammes", "Peso en gramos", "Peso in grammi", "Gewicht in Gramm"), width: 14, group: "core" },
    { key: "dim_length_cm", label: "dim_length_cm", note: x("Length in cm", "Uzunluk (cm)", "Longueur en cm", "Longitud en cm", "Lunghezza in cm", "Länge in cm"), width: 14, group: "core" },
    { key: "dim_width_cm", label: "dim_width_cm", note: x("Width in cm", "Genişlik (cm)", "Largeur en cm", "Ancho en cm", "Larghezza in cm", "Breite in cm"), width: 13, group: "core" },
    { key: "dim_height_cm", label: "dim_height_cm", note: x("Height in cm", "Yükseklik (cm)", "Hauteur en cm", "Altura en cm", "Altezza in cm", "Höhe in cm"), width: 13, group: "core" },
    { key: "image_url_1", label: "image_url_1", note: x("Image URL 1 (main image)", "Görsel URL 1 (ana görsel)", "URL image 1 (principale)", "URL imagen 1 (principal)", "URL immagine 1 (principale)", "Bild-URL 1 (Hauptbild)"), width: 40, group: "core" },
    { key: "image_url_2", label: "image_url_2", note: x("Image URL 2", "Görsel URL 2", "URL image 2", "URL imagen 2", "URL immagine 2", "Bild-URL 2"), width: 40, group: "core" },
    { key: "image_url_3", label: "image_url_3", note: x("Image URL 3", "Görsel URL 3", "URL image 3", "URL imagen 3", "URL immagine 3", "Bild-URL 3"), width: 40, group: "core" },
    { key: "image_url_4", label: "image_url_4", note: x("Image URL 4", "Görsel URL 4", "URL image 4", "URL imagen 4", "URL immagine 4", "Bild-URL 4"), width: 40, group: "core" },
    { key: "image_url_5", label: "image_url_5", note: x("Image URL 5", "Görsel URL 5", "URL image 5", "URL imagen 5", "URL immagine 5", "Bild-URL 5"), width: 40, group: "core" },
    { key: "swatch_image_url", label: "swatch_image_url", note: x("Swatch image URL", "Swatch görsel URL", "URL image swatch", "URL imagen muestra", "URL immagine campione", "Swatch-Bild-URL"), width: 28, group: "core" },
    { key: "option1_name", label: "variation1_name", note: x("Parent: variation 1 name (e.g. color)", "Parent: varyasyon 1 adı (örn. renk)", "Parent: nom variation 1 (ex. couleur)", "Parent: nombre variación 1 (ej. color)", "Parent: nome variante 1 (es. colore)", "Parent: Variante 1 Name (z. B. Farbe)"), width: 18, group: "variations" },
    { key: "option1_value", label: "variation1_value", note: x("Child: variation 1 value (e.g. red)", "Child: varyasyon 1 değeri (örn. kırmızı)", "Enfant: valeur variation 1 (ex. rouge)", "Child: valor variación 1 (ej. rojo)", "Child: valore variante 1 (es. rosso)", "Child: Variante 1 Wert (z. B. rot)"), width: 18, group: "variations" },
    { key: "option2_name", label: "variation2_name", note: x("Parent: variation 2 name (e.g. size)", "Parent: varyasyon 2 adı (örn. beden)", "Parent: nom variation 2 (ex. taille)", "Parent: nombre variación 2 (ej. talla)", "Parent: nome variante 2 (es. taglia)", "Parent: Variante 2 Name (z. B. Größe)"), width: 18, group: "variations" },
    { key: "option2_value", label: "variation2_value", note: x("Child: variation 2 value (e.g. M)", "Child: varyasyon 2 değeri (örn. M)", "Enfant: valeur variation 2 (ex. M)", "Child: valor variación 2 (ej. M)", "Child: valore variante 2 (es. M)", "Child: Variante 2 Wert (z. B. M)"), width: 18, group: "variations" },
    { key: "option3_name", label: "variation3_name", note: x("Parent: variation 3 name (optional)", "Parent: varyasyon 3 adı (isteğe bağlı)", "Parent: nom variation 3 (optionnel)", "Parent: nombre variación 3 (opcional)", "Parent: nome variante 3 (opzionale)", "Parent: Variante 3 Name (optional)"), width: 18, group: "variations" },
    { key: "option3_value", label: "variation3_value", note: x("Child: variation 3 value", "Child: varyasyon 3 değeri", "Enfant: valeur variation 3", "Child: valor variación 3", "Child: valore variante 3", "Child: Variante 3 Wert"), width: 18, group: "variations" },
    { key: "option4_name", label: "variation4_name", note: x("Parent: variation 4 name (optional)", "Parent: varyasyon 4 adı (isteğe bağlı)", "Parent: nom variation 4 (optionnel)", "Parent: nombre variación 4 (opcional)", "Parent: nome variante 4 (opzionale)", "Parent: Variante 4 Name (optional)"), width: 18, group: "variations" },
    { key: "option4_value", label: "variation4_value", note: x("Child: variation 4 value", "Child: varyasyon 4 değeri", "Enfant: valeur variation 4", "Child: valor variación 4", "Child: valore variante 4", "Child: Variante 4 Wert"), width: 18, group: "variations" },
    { key: "option5_name", label: "variation5_name", note: x("Parent: variation 5 name (optional)", "Parent: varyasyon 5 adı (isteğe bağlı)", "Parent: nom variation 5 (optionnel)", "Parent: nombre variación 5 (opcional)", "Parent: nome variante 5 (opzionale)", "Parent: Variante 5 Name (optional)"), width: 18, group: "variations" },
    { key: "option5_value", label: "variation5_value", note: x("Child: variation 5 value", "Child: varyasyon 5 değeri", "Enfant: valeur variation 5", "Child: valor variación 5", "Child: valore variante 5", "Child: Variante 5 Wert"), width: 18, group: "variations" },
    { key: "option6_name", label: "variation6_name", note: x("Parent: variation 6 name (optional)", "Parent: varyasyon 6 adı (isteğe bağlı)", "Parent: nom variation 6 (optionnel)", "Parent: nombre variación 6 (opcional)", "Parent: nome variante 6 (opzionale)", "Parent: Variante 6 Name (optional)"), width: 18, group: "variations" },
    { key: "option6_value", label: "variation6_value", note: x("Child: variation 6 value", "Child: varyasyon 6 değeri", "Enfant: valeur variation 6", "Child: valor variación 6", "Child: valore variante 6", "Child: Variante 6 Wert"), width: 18, group: "variations" },
    { key: "unit_type", label: "unit_type", note: x("Dropdown: kg | g | L | ml | piece", "Açılır liste: kg | g | L | ml | piece", "Liste: kg | g | L | ml | piece", "Lista: kg | g | L | ml | piece", "Elenco: kg | g | L | ml | piece", "Dropdown: kg | g | L | ml | piece"), width: 12, group: "core" },
    { key: "unit_value", label: "unit_value", note: x("e.g. 200", "örn. 200", "ex. 200", "ej. 200", "es. 200", "z. B. 200"), width: 12, group: "core" },
    { key: "per_unit", label: "per_unit", note: x("Reference quantity for price per unit (g/ml => 1000, kg/l/piece => 1)", "Birim fiyat referans miktarı (g/ml => 1000, kg/l/piece => 1)", "Quantité de référence prix unitaire", "Cantidad referencia precio unitario", "Quantità riferimento prezzo unitario", "Referenzmenge für Grundpreis (g/ml => 1000, kg/l/piece => 1)"), width: 12, group: "core" },
    { key: "price", label: "price", note: x("Gross selling price in EUR (one price for all markets)", "Tüm pazarlar için EUR brüt satış fiyatı", "Prix de vente TTC en EUR (un prix pour tous les marchés)", "Precio de venta bruto en EUR (un precio para todos los mercados)", "Prezzo di vendita lordo in EUR (un prezzo per tutti i mercati)", "Verkaufspreis brutto in EUR (ein Preis für alle Märkte)"), width: 14, group: "price_eur" },
    { key: "price_uvp", label: "price_uvp", note: x("RRP / list price in EUR (optional)", "EUR tavsiye edilen perakende fiyat (isteğe bağlı)", "Prix conseillé en EUR (optionnel)", "PVP / precio tachado en EUR (opcional)", "Prezzo di listino in EUR (opzionale)", "UVP / Streichpreis in EUR (optional)"), width: 14, group: "price_eur" },
    { key: "price_sale", label: "price_sale", note: x("Sale price in EUR (optional)", "EUR indirimli fiyat (isteğe bağlı)", "Prix promo en EUR (optionnel)", "Precio de oferta en EUR (opcional)", "Prezzo promozionale in EUR (opzionale)", "Aktionspreis in EUR (optional)"), width: 14, group: "price_eur" },
    { key: "weee_number", label: "weee_number", note: x("WEEE reg. no. (e-waste registration)", "WEEE kayıt no. (elektronik atık)", "N° enregistrement DEEE", "N.º registro RAEE", "N. registro RAEE", "WEEE-Reg.-Nr. (Elektroaltgeräte-Registrierung)"), width: 22, group: "core" },
    { key: "eprel_number", label: "eprel_number", note: x("EPREL reg. no. (EU energy label)", "EPREL kayıt no. (AB enerji etiketi)", "N° enregistrement EPREL", "N.º registro EPREL", "N. registro EPREL", "EPREL-Reg.-Nr. (EU-Energielabel)"), width: 22, group: "core" },
  ];
  cols.push(...core);

  const FILE_SLOTS = 5;
  for (let i = 1; i <= FILE_SLOTS; i++) {
    cols.push(
      { key: `file_${i}_url`, label: `file_${i}_url`, note: x(`File ${i} URL (PDF or image)`, `Dosya ${i} URL (PDF veya görsel)`, `Fichier ${i} URL (PDF ou image)`, `Archivo ${i} URL (PDF o imagen)`, `File ${i} URL (PDF o immagine)`, `Datei ${i} URL (PDF oder Bild)`), width: 44, group: "files", outline: 1 },
      { key: `file_${i}_name`, label: `file_${i}_name`, note: x(`File ${i} name (e.g. datasheet.pdf)`, `Dosya ${i} adı (örn. urun-fisi.pdf)`, `Nom fichier ${i} (ex. fiche.pdf)`, `Nombre archivo ${i} (ej. ficha.pdf)`, `Nome file ${i} (es. scheda.pdf)`, `Datei ${i} Name (z.B. Produktdatenblatt.pdf)`), width: 30, group: "files", outline: 1 }
    );
  }

  for (let i = 1; i <= METAFIELD_PAIRS; i++) {
    cols.push(
      {
        key: `metafield_${i}_key`,
        label: `metafield_${i}_key`,
        note: x(`Eigenschaft ${i} title — pick from the dropdown or type a new title (needs superuser approval before the product appears in the shop)`, `Eigenschaft ${i} başlık — listeden seçin veya yeni yazın (shop’ta görünmesi için superuser onayı gerekir)`, `Eigenschaft ${i} titre — liste ou saisie libre (approbation superuser avant affichage boutique)`, `Eigenschaft ${i} título — elija o escriba uno nuevo (aprobación de superusuario para la tienda)`, `Eigenschaft ${i} titolo — scegli o scrivi (approvazione superuser per lo shop)`, `Eigenschaft ${i} Titel — aus der Liste wählen oder neuen Titel eingeben (Shop-Sichtbarkeit erst nach Superuser-Freigabe)`),
        width: 22,
        group: "metafields",
        outline: 1,
      },
      {
        key: `metafield_${i}_value`,
        label: `metafield_${i}_value`,
        note: x(`Eigenschaft ${i} value — dropdown of catalog values; you may type a custom value (approval required)`, `Eigenschaft ${i} değer — katalog değerleri; özel değer yazılabilir (onay gerekir)`, `Eigenschaft ${i} valeur — valeurs catalogue ; saisie libre possible (approbation requise)`, `Eigenschaft ${i} valor — valores del catálogo; puede escribir uno propio (requiere aprobación)`, `Eigenschaft ${i} valore — valori catalogo; testo libero possibile (approvazione richiesta)`, `Eigenschaft ${i} Wert — Katalogwerte im Dropdown; eigener Wert möglich (Freigabe nötig)`),
        width: 34,
        group: "metafields",
        outline: 1,
      }
    );
  }

  for (const lang of LANGS) {
    cols.push(
      { key: `title_${lang}`, label: `title_${lang}`, note: x(`Title (${LANG_LABELS[lang]})`, `Başlık (${LANG_LABELS[lang]})`, `Titre (${LANG_LABELS[lang]})`, `Título (${LANG_LABELS[lang]})`, `Titolo (${LANG_LABELS[lang]})`, `Titel (${LANG_LABELS[lang]})`), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `description_${lang}`, label: `description_${lang}`, note: x(`Description HTML (${LANG_LABELS[lang]}) — parent/child`, `Açıklama HTML (${LANG_LABELS[lang]}) — parent/child`, `Description HTML (${LANG_LABELS[lang]}) — parent/enfant`, `Descripción HTML (${LANG_LABELS[lang]}) — parent/child`, `Descrizione HTML (${LANG_LABELS[lang]}) — parent/child`, `Beschreibung HTML (${LANG_LABELS[lang]}) — Parent/Child`), width: 50, group: `lang_${lang}`, outline: 1 },
      { key: `bullet1_${lang}`, label: `bullet1_${lang}`, note: x("Bullet point 1", "Madde 1", "Point 1", "Viñeta 1", "Punto 1", "Stichpunkt 1"), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet2_${lang}`, label: `bullet2_${lang}`, note: x("Bullet point 2", "Madde 2", "Point 2", "Viñeta 2", "Punto 2", "Stichpunkt 2"), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet3_${lang}`, label: `bullet3_${lang}`, note: x("Bullet point 3", "Madde 3", "Point 3", "Viñeta 3", "Punto 3", "Stichpunkt 3"), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet4_${lang}`, label: `bullet4_${lang}`, note: x("Bullet point 4", "Madde 4", "Point 4", "Viñeta 4", "Punto 4", "Stichpunkt 4"), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `bullet5_${lang}`, label: `bullet5_${lang}`, note: x("Bullet point 5", "Madde 5", "Point 5", "Viñeta 5", "Punto 5", "Stichpunkt 5"), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `seo_title_${lang}`, label: `seo_title_${lang}`, note: x(`SEO title (${LANG_LABELS[lang]})`, `SEO başlık (${LANG_LABELS[lang]})`, `Titre SEO (${LANG_LABELS[lang]})`, `Título SEO (${LANG_LABELS[lang]})`, `Titolo SEO (${LANG_LABELS[lang]})`, `SEO Titel (${LANG_LABELS[lang]})`), width: 36, group: `lang_${lang}`, outline: 1 },
      { key: `seo_description_${lang}`, label: `seo_description_${lang}`, note: x(`SEO description (${LANG_LABELS[lang]})`, `SEO açıklama (${LANG_LABELS[lang]})`, `Description SEO (${LANG_LABELS[lang]})`, `Descripción SEO (${LANG_LABELS[lang]})`, `Descrizione SEO (${LANG_LABELS[lang]})`, `SEO Beschreibung (${LANG_LABELS[lang]})`), width: 50, group: `lang_${lang}`, outline: 1 },
      { key: `seo_keywords_${lang}`, label: `seo_keywords_${lang}`, note: x(`SEO keywords (${LANG_LABELS[lang]})`, `SEO anahtar kelimeler (${LANG_LABELS[lang]})`, `Mots-clés SEO (${LANG_LABELS[lang]})`, `Palabras clave SEO (${LANG_LABELS[lang]})`, `Parole chiave SEO (${LANG_LABELS[lang]})`, `SEO Keywords (${LANG_LABELS[lang]})`), width: 40, group: `lang_${lang}`, outline: 1 },
    );
  }

  return cols;
}

const COLORS = {
  core: { argb: "FF1E3A5F" },
  lang: { argb: "FF1D6F42" },
  price: { argb: "FF7B3F00" },
  price_eur: { argb: "FF7B3F00" },
  seo: { argb: "FF4A235A" },
  meta: { argb: "FF5F4B0B" },
  files: { argb: "FF1A5276" },
  coreBg: { argb: "FFCCE5FF" },
  langBg: { argb: "FFD5F5E3" },
  priceBg: { argb: "FFFDEBD0" },
  price_eurBg: { argb: "FFFDEBD0" },
  seoBg: { argb: "FFF3E5F5" },
  metaBg: { argb: "FFF9E79F" },
  filesBg: { argb: "FFD6EAF8" },
  groupRow: { argb: "FFE8F4F8" },
};

function headerFill(bg) {
  return { type: "pattern", pattern: "solid", fgColor: bg };
}
function border() {
  const thin = { style: "thin", color: { argb: "FFCCCCCC" } };
  return { top: thin, left: thin, bottom: thin, right: thin };
}

const INFO_SHEET_TITLES = { de: "Anleitung", en: "Guide", tr: "Kılavuz", fr: "Guide", it: "Guida", es: "Guía" };

function buildLocalizedInstructions(locale, { categoryRows, brandNames, shipNames }) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const L = {
    de: {
      title: "ANDERTAL — Produkte per Excel importieren",
      intro: "Diese Arbeitsmappe hat zwei Blätter: „Products“ (Ihre Daten) und „Anleitung“ (Spaltenhilfe). Die URL-Handles (SEO-Pfade) werden vom System automatisch aus dem Titel erzeugt — keine handle_*-Spalten.",
      categoriesTitle: "Für dieses Template gewählte Kategorien (category_slug exakt so eintragen):",
      noCats: "(Keine Kategorieauswahl — alle aktiven Kategorien stehen in den Dropdowns.)",
      slugsHeader: "slug\tPfad",
      brandsTitle: "Marken (Dropdown „brand“) — nur exakt diese Namen sind gültig; sonst schlägt der Import fehl:",
      shipTitle: "Versandgruppen (Dropdown „shipping_group“) — Namen wie unter Einstellungen > Versand:",
      colsTitle: "Wichtige Spalten (Blatt „Products“, ab Zeile 4)",
      rowStructure: "Zeilen 1–3: Gruppenkopf, Spaltenname, Kurzhinweis — nicht löschen.",
      parentChild: "Parent-Zeilen: gemeinsame Texte, Bilder, Preise, Kategorie, Marke, Versandgruppe, optionN_name (Optionstitel). Child-Zeilen: gleiche product_type-Spalte „child“, parent_sku, varianten-spezifisch optionN_value, SKU, EAN, Lager, optionale Bilder/Swatch. Titel/Beschreibung/Bullets werden zentral über title, description, bullet1..bullet5 gepflegt.",
      options: "Varianten: Mindestens zwei Optionen (option1/option2) sind im Beispiel; Sie können option3_name … option6_name (und passende *_value in Child-Zeilen) nutzen. Weitere Optionen können Sie analog ergänzen (option7_name …), sofern Sie die Spalten in Excel hinzufügen — der Import liest alle fortlaufenden optionN_*-Spalten.",
      metafields: `Eigenschaften: metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). Titel und Werte kommen aus Metaobjects (Dropdown). Eigene Titel/Werte dürfen eingetippt werden — das Produkt bleibt im Shop unsichtbar, bis ein Superuser sie freigibt. Parent-Zeile → Produkt; Child-Zeile → Variante.`,
      noCollection: "Kollektionen werden bei diesem Import nicht per Excel gesetzt — bitte im Anschluss in der Oberfläche zuordnen, falls nötig.",
      prices: "Preise nur in EUR: price (Verkaufspreis brutto), price_uvp, price_sale — keine länderbezogenen Preisspalten. MwSt. und Versand je Markt separat. Komma als Dezimaltrenner (z. B. 29,99).",
      comments: "Leere Datenzeilen werden übersprungen. Zeilen mit SKU beginnend mit # sind Kommentare.",
      skuUpdate:
        "Bestehende Produkte: Stimmt die Parent-SKU mit einer SKU im System überein, wird das Produkt aktualisiert — es wird nur überschrieben, was in der Excel-Zelle gefüllt ist; leere Zellen lassen die bisherigen Werte unverändert.",
      brandsCount: (n) => `(${n} Marken im Dropdown verfügbar)`,
    },
    en: {
      title: "ANDERTAL — Import products via Excel",
      intro: 'This workbook has two sheets: "Products" (your data) and "Guide" (column help). URL handles are generated automatically from the title — there are no handle_* columns.',
      categoriesTitle: "Categories selected for this template (use these category_slug values exactly):",
      noCats: "(No category filter — dropdowns list all active categories.)",
      slugsHeader: "slug\tpath",
      brandsTitle: 'Brands ("brand" dropdown) — only these exact names are accepted:',
      shipTitle: 'Shipping groups ("shipping_group" dropdown) — names as in Settings > Shipping:',
      colsTitle: 'Key columns (sheet "Products", from row 4)',
      rowStructure: "Rows 1–3: group header, column key, short hint — do not delete.",
      parentChild: 'Parent rows: shared copy, images, prices, category, brand, shipping group, optionN_names. Child rows: product_type = child, parent_sku, per-variant optionN_value, SKU, EAN, stock, optional images/swatch. Use title, description and bullet1..bullet5 as single shared content fields.',
      options: "Variants: the sample uses two options; you may use option3…option6 (add option7_name / option7_value columns in Excel if needed — import reads consecutive optionN_* columns).",
      metafields: `Eigenschaften: metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). Titles and values come from Metaobjects (dropdowns). You may type a custom title/value — the product stays hidden in the shop until a superuser approves it. Parent row → product; child row → variant.`,
      noCollection: "Collections are not set via this Excel import — assign in the UI afterward if needed.",
      prices: "Prices in EUR only: price, price_uvp, price_sale — no per-country price columns. VAT and shipping vary by market. Use comma decimals (e.g. 29,99).",
      comments: "Empty rows are skipped. Rows with SKU starting with # are comments.",
      skuUpdate:
        "Existing products: If the parent row SKU matches a product SKU in the system, that product is updated — only cells you fill in Excel overwrite data; empty cells keep the previous values.",
      brandsCount: (n) => `(${n} brands available in the dropdown)`,
    },
    tr: {
      title: "ANDERTAL — Excel ile ürün içe aktarma",
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
      metafields: `Eigenschaften: metafield_N_key / metafield_N_value. Başlık ve değerler Metaobjects’ten gelir (açılır liste). Listede yoksa yazabilirsiniz — superuser onaylayana kadar ürün shop’ta görünmez. Parent satır → ürün; child satır → varyant.`,
      noCollection: "Koleksiyonlar bu Excel ile atanmaz — gerekirse arayüzden ekleyin.",
      prices: "Fiyatlar yalnızca EUR: price, price_uvp, price_sale. Ülkeye göre fiyat sütunu yok. Virgül ondalık (örn. 29,99).",
      comments: "Boş satırlar atlanır. SKU # ile başlayan satırlar yorum sayılır.",
      skuUpdate:
        "Mevcut ürünler: Parent SKU sistemdeki bir SKU ile eşleşirse ürün güncellenir — yalnızca doldurduğunuz hücreler üzerine yazılır; boş hücreler önceki değeri korur.",
      brandsCount: (n) => `(${n} marka açılır listede mevcut)`,
    },
    fr: {
      title: "ANDERTAL — Importer des produits via Excel",
      intro: 'Ce classeur comporte deux feuilles : « Products » (vos données) et « Guide » (aide colonnes). Les handles URL sont générés automatiquement à partir du titre — pas de colonnes handle_*.',
      categoriesTitle: "Catégories sélectionnées pour ce modèle (category_slug exactement) :",
      noCats: "(Aucun filtre — les listes déroulantes affichent toutes les catégories actives.)",
      slugsHeader: "slug\tchemin",
      brandsTitle: 'Marques (liste « brand ») — seuls ces noms exacts sont acceptés :',
      shipTitle: 'Groupes d\'expédition (« shipping_group ») — noms comme dans Paramètres > Expédition :',
      colsTitle: 'Colonnes clés (feuille « Products », à partir de la ligne 4)',
      rowStructure: "Lignes 1–3 : en-tête de groupe, clé de colonne, courte aide — ne pas supprimer.",
      parentChild: 'Lignes parent : textes, images, prix, catégorie, marque, groupe d\'expédition, optionN_name partagés. Lignes enfant : product_type = child, parent_sku, optionN_value, SKU, EAN, stock par variante. title, description et bullet1..bullet5 sont partagés.',
      options: "Variantes : l'exemple utilise deux options ; option3…option6 possibles ; ajoutez option7_name / option7_value dans Excel si besoin.",
      metafields: `Eigenschaften : metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). Titres et valeurs issus des Metaobjects (listes). Saisie libre possible — le produit reste masqué en boutique jusqu’à approbation superuser. Ligne parent → produit ; ligne enfant → variante.`,
      noCollection: "Les collections ne sont pas définies via cet import Excel — assignez-les dans l'interface si nécessaire.",
      prices: "Prix en EUR uniquement : price, price_uvp, price_sale. Virgule décimale (ex. 29,99).",
      comments: "Les lignes vides sont ignorées. Les lignes dont le SKU commence par # sont des commentaires.",
      skuUpdate: "Produits existants : si la SKU parent correspond, seules les cellules remplies écrasent les données ; les cellules vides conservent les valeurs précédentes.",
      brandsCount: (n) => `(${n} marques disponibles dans la liste)`,
    },
    es: {
      title: "ANDERTAL — Importar productos vía Excel",
      intro: 'Este libro tiene dos hojas: "Products" (sus datos) y "Guide" (ayuda de columnas). Los handles URL se generan automáticamente del título — sin columnas handle_*.',
      categoriesTitle: "Categorías seleccionadas para esta plantilla (category_slug exacto):",
      noCats: "(Sin filtro — los desplegables listan todas las categorías activas.)",
      slugsHeader: "slug\truta",
      brandsTitle: 'Marcas (desplegable "brand") — solo estos nombres exactos:',
      shipTitle: 'Grupos de envío ("shipping_group") — nombres como en Ajustes > Envío:',
      colsTitle: 'Columnas clave (hoja "Products", desde fila 4)',
      rowStructure: "Filas 1–3: cabecera de grupo, clave de columna, nota breve — no eliminar.",
      parentChild: 'Filas parent: textos, imágenes, precios, categoría, marca, grupo de envío y optionN_name compartidos. Filas child: product_type = child, parent_sku, optionN_value, SKU, EAN, stock por variante.',
      options: "Variantes: el ejemplo usa dos opciones; puede usar option3…option6; añada option7_name / option7_value en Excel si hace falta.",
      metafields: `Eigenschaften: metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). Títulos y valores de Metaobjects (desplegables). Puede escribir valores propios — el producto no aparece en la tienda hasta que un superusuario los apruebe. Fila parent → producto; fila child → variante.`,
      noCollection: "Las colecciones no se asignan con este Excel — asígnelas en la interfaz si es necesario.",
      prices: "Precios solo en EUR: price, price_uvp, price_sale. Use coma decimal (ej. 29,99).",
      comments: "Se omiten filas vacías. Las filas con SKU que empieza por # son comentarios.",
      skuUpdate: "Productos existentes: si la SKU parent coincide, solo las celdas rellenas sobrescriben datos; las vacías conservan valores anteriores.",
      brandsCount: (n) => `(${n} marcas disponibles en el desplegable)`,
    },
    it: {
      title: "ANDERTAL — Importare prodotti via Excel",
      intro: 'Questa cartella ha due fogli: "Products" (i tuoi dati) e "Guide" (aiuto colonne). Gli handle URL sono generati automaticamente dal titolo — nessuna colonna handle_*.',
      categoriesTitle: "Categorie selezionate per questo modello (category_slug esatto):",
      noCats: "(Nessun filtro — i menu a tendina elencano tutte le categorie attive.)",
      slugsHeader: "slug\tpercorso",
      brandsTitle: 'Marchi (menu "brand") — solo questi nomi esatti:',
      shipTitle: 'Gruppi spedizione ("shipping_group") — nomi come in Impostazioni > Spedizione:',
      colsTitle: 'Colonne chiave (foglio "Products", dalla riga 4)',
      rowStructure: "Righe 1–3: intestazione gruppo, chiave colonna, nota breve — non eliminare.",
      parentChild: 'Righe parent: testi, immagini, prezzi, categoria, marca, gruppo spedizione e optionN_name condivisi. Righe child: product_type = child, parent_sku, optionN_value, SKU, EAN, stock per variante.',
      options: "Varianti: l'esempio usa due opzioni; è possibile usare option3…option6; aggiungere option7_name / option7_value in Excel se serve.",
      metafields: `Eigenschaften: metafield_N_key / metafield_N_value (N=1…${METAFIELD_PAIRS}). Titoli e valori dai Metaobjects (menu a tendina). Puoi scrivere valori propri — il prodotto resta nascosto nello shop finché un superuser non li approva. Riga parent → prodotto; riga child → variante.`,
      noCollection: "Le collezioni non si impostano con questo Excel — assegnarle nell'interfaccia se necessario.",
      prices: "Prezzi solo in EUR: price, price_uvp, price_sale. Usare la virgola decimale (es. 29,99).",
      comments: "Le righe vuote vengono saltate. Le righe con SKU che inizia per # sono commenti.",
      skuUpdate: "Prodotti esistenti: se la SKU parent corrisponde, solo le celle compilate sovrascrivono i dati; le vuote mantengono i valori precedenti.",
      brandsCount: (n) => `(${n} marchi disponibili nel menu)`,
    },
  };
  const pack = L[loc] || L.en;

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
  lines.push(["", brandNames.length ? pack.brandsCount(brandNames.length) : "(—)"]);
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
  return { lines, sheetTitle: `📋 ${INFO_SHEET_TITLES[loc] || "Guide"}` };
}

function defDisplayLabel(key, def, locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc && loc !== "de") {
    const t = def?.label_i18n?.[loc]?.label;
    if (t != null && String(t).trim()) return String(t).trim();
  }
  return String(def?.label || key).trim() || key;
}

function fillListsSheet(ws, lists) {
  const { productTypes, statuses, unitTypes, categorySlugs, brandNames, shipNames, titleAliases, allValues } = lists;

  productTypes.forEach((v, i) => { ws.getCell(i + 1, 1).value = v; });
  statuses.forEach((v, i) => { ws.getCell(i + 1, 2).value = v; });
  unitTypes.forEach((v, i) => { ws.getCell(i + 1, 3).value = v; });
  categorySlugs.forEach((v, i) => { ws.getCell(i + 1, 4).value = v; });
  brandNames.forEach((v, i) => { ws.getCell(i + 1, 5).value = v; });
  shipNames.forEach((v, i) => { ws.getCell(i + 1, 6).value = v; });
  (titleAliases || []).forEach((v, i) => { ws.getCell(i + 1, 7).value = v; });
  (allValues || []).forEach((v, i) => { ws.getCell(i + 1, 8).value = v; });

  ws.state = "veryHidden";
  ws.columns = [
    { width: 14 }, { width: 12 }, { width: 10 },
    { width: 28 }, { width: 22 }, { width: 26 },
    { width: 28 }, { width: 28 },
  ];

  return {
    rA: { col: 1, start: 1, end: Math.max(1, productTypes.length) },
    rB: { col: 2, start: 1, end: Math.max(1, statuses.length) },
    rC: { col: 3, start: 1, end: Math.max(1, unitTypes.length) },
    rD: { col: 4, start: 1, end: Math.max(1, categorySlugs.length) },
    rE: { col: 5, start: 1, end: Math.max(1, brandNames.length) },
    rF: { col: 6, start: 1, end: Math.max(1, shipNames.length) },
    rTitles: { col: 7, start: 1, end: Math.max(1, (titleAliases || []).length) },
    rValues: { col: 8, start: 1, end: Math.max(1, (allValues || []).length) },
  };
}

function applyListValidation(ws, colIndex, listRef, maxRow = 5000, { allowCustom = false } = {}) {
  if (!listRef || listRef.end < listRef.start) return;
  const letter = colLetter(listRef.col);
  const f = `Lists!$${letter}$${listRef.start}:$${letter}$${listRef.end}`;
  const targetLetter = colLetter(colIndex);
  ws.dataValidations.add(`${targetLetter}4:${targetLetter}${maxRow}`, {
    type: "list",
    allowBlank: true,
    formulae: [`=${f}`],
    showErrorMessage: !allowCustom,
    ...(allowCustom ? { showInputMessage: false } : {}),
  });
}

async function buildWorkbook({
  locale,
  categoriesForList,
  brands,
  shippingGroups,
  metafieldDefs,
}) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Andertal Sellercentral";
  wb.created = new Date();

  const categorySlugs = [...new Set(categoriesForList.map((c) => c.slug))].sort();
  const brandNames = [...new Set(brands.map((b) => String(b.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shipNames = [...new Set(shippingGroups.map((g) => String(g.name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const ws = wb.addWorksheet("Products", {
    properties: { defaultColWidth: 16 },
    views: [{ state: "frozen", ySplit: 3, xSplit: 0 }],
  });

  const cols = buildColumns(loc);
  cols.forEach((col, i) => {
    const exCol = ws.getColumn(i + 1);
    exCol.width = col.width;
  });

  const groupSegments = [];
  cols.forEach((col, i) => {
    const g = col.group;
    const colNo = i + 1;
    const last = groupSegments[groupSegments.length - 1];
    if (last && last.group === g && last.end === colNo - 1) {
      last.end = colNo;
    } else {
      groupSegments.push({ group: g, start: colNo, end: colNo });
    }
  });

  // Column grouping/outline intentionally disabled.

  const groupMeta = {
    core: { label: x("Core", "Temel", "Noyau", "Núcleo", "Nucleo", "Kern"), bg: COLORS.coreBg, fg: COLORS.core },
    variations: { label: x("Variations", "Varyasyonlar", "Variantes", "Variaciones", "Varianti", "Varianten"), bg: COLORS.coreBg, fg: COLORS.core },
    seo: { label: "SEO", bg: COLORS.seoBg, fg: COLORS.seo },
    metafields: { label: x("Eigenschaften", "Eigenschaften", "Eigenschaften", "Eigenschaften", "Eigenschaften", "Eigenschaften"), bg: COLORS.metaBg, fg: COLORS.meta },
    price_eur: { label: x("💰 Prices (EUR)", "💰 Fiyatlar (EUR)", "💰 Prix (EUR)", "💰 Precios (EUR)", "💰 Prezzi (EUR)", "💰 Preise (EUR)"), bg: COLORS.price_eurBg, fg: COLORS.price_eur },
    files: { label: x("📁 Files (optional)", "📁 Dosyalar (isteğe bağlı)", "📁 Fichiers (optionnel)", "📁 Archivos (opcional)", "📁 File (opzionale)", "📁 Dateien (optional)"), bg: COLORS.filesBg, fg: COLORS.files },
  };
  const uiLangLabels = langLabelsFor(loc);
  LANGS.forEach((l) => {
    groupMeta[`lang_${l}`] = { label: `🌐 ${uiLangLabels[l]}`, bg: COLORS.langBg, fg: COLORS.lang };
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
    cell.border = border();
    if (seg.end > seg.start) ws.mergeCells(1, seg.start, 1, seg.end);
  }

  const row2 = ws.getRow(2);
  row2.height = 28;
  cols.forEach((col, i) => {
    const cell = row2.getCell(i + 1);
    cell.value = col.label;
    const isLang = col.group.startsWith("lang_");
    const isPri = col.group === "price_eur" || col.group.startsWith("price_");
    const isMeta = col.group === "metafields";
    const isFiles = col.group === "files";
    cell.fill = headerFill(
      isLang ? COLORS.langBg : isPri ? COLORS.price_eurBg : col.group === "seo" ? COLORS.seoBg : isMeta ? COLORS.metaBg : isFiles ? COLORS.filesBg : COLORS.coreBg
    );
    cell.font = {
      bold: true,
      color: isLang ? COLORS.lang : isPri ? COLORS.price_eur : col.group === "seo" ? COLORS.seo : isMeta ? COLORS.meta : isFiles ? COLORS.files : COLORS.core,
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

  const exBrand = brandNames[0] || "brand-name";
  const exCat = categorySlugs[0] || "category-slug";
  const exShip = shipNames[0] || "";

  const titleKey = loc === "de" ? "title_de" : `title_${loc === "en" ? "en" : loc}`;
  const descKey = loc === "de" ? "description_de" : `description_${loc === "en" ? "en" : loc}`;
  const bullet1Key = loc === "de" ? "bullet1_de" : `bullet1_${loc === "en" ? "en" : loc}`;
  const bullet2Key = loc === "de" ? "bullet2_de" : `bullet2_${loc === "en" ? "en" : loc}`;
  const bullet3Key = loc === "de" ? "bullet3_de" : `bullet3_${loc === "en" ? "en" : loc}`;

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
    unit_type: "g",
    unit_value: 200,
    per_unit: 1000,
    weight_grams: 200,
    image_url_1: "https://example.com/img/shirt-001.jpg",
    option1_name: x("Color", "Renk", "Couleur", "Color", "Colore", "Farbe"),
    option2_name: x("Size", "Beden", "Taille", "Talla", "Taglia", "Größe"),
    [titleKey]: x("Basic T-Shirt", "Basic Tişört", "T-shirt basique", "Camiseta básica", "T-shirt basic", "T-Shirt Basic"),
    [descKey]: x("<p>High-quality basic t-shirt.</p>", "<p>Kaliteli basic tişört.</p>", "<p>T-shirt basique de qualité.</p>", "<p>Camiseta básica de calidad.</p>", "<p>T-shirt basic di qualità.</p>", "<p>Hochwertiges Basic T-Shirt.</p>"),
    [bullet1Key]: x("100% cotton", "%100 pamuk", "100 % coton", "100 % algodón", "100% cotone", "100% Baumwolle"),
    [bullet2Key]: x("Machine washable", "Makinede yıkanabilir", "Lavable en machine", "Lavable a máquina", "Lavabile in lavatrice", "Maschinenwaschbar"),
    [bullet3Key]: x("Regular fit", "Regular fit", "Coupe regular", "Corte regular", "Vestibilità regular", "Regular Fit"),
    price: "29,99",
    price_uvp: "39,99",
  }, "FFFAFAFA");

  setRow(5, {
    product_type: "child",
    sku: "SHIRT-001-ROT-S",
    parent_sku: "SHIRT-001",
    ean: "4012345678902",
    inventory: 50,
    image_url_1: "https://example.com/img/shirt-001-rot.jpg",
    swatch_image_url: "https://example.com/img/swatch-rot.jpg",
    option1_value: x("Red", "Kırmızı", "Rouge", "Rojo", "Rosso", "Rot"),
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
    option1_value: x("Red", "Kırmızı", "Rouge", "Rojo", "Rosso", "Rot"),
    option2_value: "M",
  }, "FFEAF6FF");

  const categoryRowsForInfo = categoriesForList.slice().sort((a, b) => a.path.localeCompare(b.path));
  const { lines: instrLines, sheetTitle } = buildLocalizedInstructions(loc, {
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
      t.startsWith("ANDERTAL") ||
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
  const defs = metafieldDefs && typeof metafieldDefs === "object" ? metafieldDefs : {};
  const titleAliases = [];
  const seenAlias = new Set();
  const allValues = [];
  const seenVal = new Set();
  for (const [key, def] of Object.entries(defs)) {
    const k = String(key || "").trim();
    if (!k) continue;
    const label = defDisplayLabel(k, def, loc);
    for (const alias of [label, k, def?.label].map((x) => String(x || "").trim()).filter(Boolean)) {
      const lk = alias.toLowerCase();
      if (seenAlias.has(lk)) continue;
      seenAlias.add(lk);
      titleAliases.push(alias);
    }
    for (const v of (Array.isArray(def?.values) ? def.values : [])) {
      const s = String(v || "").trim();
      if (!s) continue;
      const lk = s.toLowerCase();
      if (seenVal.has(lk)) continue;
      seenVal.add(lk);
      allValues.push(s);
    }
    const vi18n = def?.values_i18n && typeof def.values_i18n === "object" ? def.values_i18n : {};
    const locMap = vi18n[loc];
    if (locMap && typeof locMap === "object") {
      for (const translated of Object.values(locMap)) {
        const s = String(translated || "").trim();
        if (!s) continue;
        const lk = s.toLowerCase();
        if (seenVal.has(lk)) continue;
        seenVal.add(lk);
        allValues.push(s);
      }
    }
  }
  titleAliases.sort((a, b) => a.localeCompare(b, loc));
  allValues.sort((a, b) => a.localeCompare(b, loc));

  const listRefs = fillListsSheet(listsWs, {
    productTypes: ["parent", "child"],
    statuses: ["draft", "published"],
    unitTypes: ["kg", "g", "L", "ml", "piece"],
    categorySlugs: categorySlugs.length ? categorySlugs : ["—"],
    brandNames: brandNames.length ? brandNames : ["—"],
    shipNames: shipNames.length ? shipNames : ["—"],
    titleAliases: titleAliases.length ? titleAliases : ["—"],
    allValues: allValues.length ? allValues : ["—"],
  });

  const ix = (k) => keyIndex[k] + 1;
  applyListValidation(ws, ix("product_type"), listRefs.rA);
  applyListValidation(ws, ix("status"), listRefs.rB);
  applyListValidation(ws, ix("unit_type"), listRefs.rC);
  applyListValidation(ws, ix("category_slug"), listRefs.rD);
  applyListValidation(ws, ix("brand"), listRefs.rE);
  applyListValidation(ws, ix("shipping_group"), listRefs.rF);
  if (titleAliases.length) {
    for (let i = 1; i <= 6; i++) {
      applyListValidation(ws, ix(`option${i}_name`), listRefs.rTitles, 5000, { allowCustom: true });
      applyListValidation(ws, ix(`option${i}_value`), listRefs.rValues, 5000, { allowCustom: true });
    }
    for (let i = 1; i <= METAFIELD_PAIRS; i++) {
      applyListValidation(ws, ix(`metafield_${i}_key`), listRefs.rTitles, 5000, { allowCustom: true });
      applyListValidation(ws, ix(`metafield_${i}_value`), listRefs.rValues, 5000, { allowCustom: true });
    }
  }

  return wb.xlsx.writeBuffer();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawLocale = typeof body.locale === "string" ? body.locale : "de";
    const locale = rawLocale.split("-")[0].toLowerCase();
    const msg = getImportApiMessages(locale);
    const sellerToken = typeof body.sellerToken === "string" ? body.sellerToken : "";
    const selectedCategorySlugs = Array.isArray(body.selectedCategorySlugs)
      ? body.selectedCategorySlugs.map((s) => String(s).trim()).filter(Boolean)
      : [];
    const selectedCategoriesIn = Array.isArray(body.selectedCategories)
      ? body.selectedCategories
      : [];

    if (selectedCategorySlugs.length === 0 && selectedCategoriesIn.length === 0) {
      return Response.json(
        { error: msg.templateSelectCategory },
        { status: 400 }
      );
    }

    const backendUrl = getBackendBase();
    const { catsFlat, brands, shippingGroups, metafieldDefs } = await loadReferenceData(backendUrl, sellerToken, locale);

    const byKey = new Map();
    for (const c of catsFlat) {
      for (const k of categoryMatchKeys(c)) {
        if (!byKey.has(k)) byKey.set(k, c);
      }
    }

    const categoriesForList = [];
    const seen = new Set();
    const pushCat = (c) => {
      const slug = String(c?.slug || "").trim();
      if (!slug || seen.has(slug.toLowerCase())) return;
      seen.add(slug.toLowerCase());
      categoriesForList.push({
        id: c.id,
        slug,
        name: String(c.name || slug).trim(),
        path: String(c.path || c.breadcrumb || c.name || slug).trim(),
      });
    };

    for (const raw of selectedCategorySlugs) {
      const hit = byKey.get(String(raw).trim().toLowerCase());
      if (hit) pushCat(hit);
    }
    for (const row of selectedCategoriesIn) {
      const slug = String(row?.slug || row?.handle || "").trim();
      if (!slug) continue;
      const hit = byKey.get(slug.toLowerCase());
      pushCat(hit || { slug, name: row.name || slug, path: row.breadcrumb || row.path || slug });
    }
    for (const raw of selectedCategorySlugs) {
      const slug = String(raw).trim();
      if (slug) pushCat({ slug, name: slug, path: slug });
    }

    if (categoriesForList.length === 0) {
      return Response.json(
        {
          error: msg.templateCategoriesNotFound,
        },
        { status: 400 }
      );
    }

    const buf = await buildWorkbook({
      locale,
      categoriesForList,
      brands,
      shippingGroups,
      metafieldDefs,
    });

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${productExcelTemplateFilename(locale)}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("Template POST:", e);
    return Response.json({ error: e.message || msg.templateFailed }, { status: 500 });
  }
}

export async function GET(request) {
  const locale = resolveRequestLocale(request);
  const msg = getImportApiMessages(locale);
  return Response.json(
    {
      error: msg.templateGetHint,
    },
    { status: 405 }
  );
}
