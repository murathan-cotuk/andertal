import ExcelJS from "exceljs";
import { getImportApiMessages, resolveRequestLocale } from "@/lib/import-export-i18n";

const DEFAULT_BACKEND = "https://api.andertal.com";

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Product export (import-compatible: parent + child rows per variant) ───────
const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const METAFIELD_PAIRS = 15;

function centsToExcelPrice(cents) {
  if (cents == null || cents === "") return "";
  const n = Number(cents);
  if (Number.isNaN(n)) return "";
  return (n / 100).toFixed(2).replace(".", ",");
}

function getEurPriceBlock(meta, p) {
  const pricesMap = meta?.prices && typeof meta.prices === "object" ? meta.prices : {};
  return (
    (pricesMap.EUR && typeof pricesMap.EUR === "object" ? pricesMap.EUR : null) ||
    (pricesMap.DE && typeof pricesMap.DE === "object" ? pricesMap.DE : null) ||
    Object.values(pricesMap).find((v) => v && typeof v === "object" && v.brutto_cents != null) ||
    null
  );
}

function getVariantEurPriceBlock(vMeta, parentBlock) {
  const pricesMap = vMeta?.prices && typeof vMeta.prices === "object" ? vMeta.prices : {};
  const block =
    (pricesMap.EUR && typeof pricesMap.EUR === "object" ? pricesMap.EUR : null) ||
    (pricesMap.DE && typeof pricesMap.DE === "object" ? pricesMap.DE : null) ||
    null;
  return block || parentBlock;
}

function productImages(meta, p) {
  const mediaArr = Array.isArray(meta.media) ? meta.media : [];
  const legacyImg = str(meta.image_url || meta.image || meta.thumbnail || p.thumbnail || "");
  return mediaArr.length > 0 ? mediaArr.map((u) => str(u)).filter(Boolean) : (legacyImg ? [legacyImg] : []);
}

function variantImage(v, vMeta) {
  const url = str(v.image_url || v.image || vMeta?.image_url || "");
  if (url) return url;
  const media = Array.isArray(vMeta?.media) ? vMeta.media : [];
  return media.length ? str(media[0]) : "";
}

function optionValueAt(v, index) {
  const opts = Array.isArray(v?.option_values) ? v.option_values : [];
  const o = opts[index];
  if (o == null) return "";
  if (typeof o === "string" || typeof o === "number") return String(o).trim();
  return str(o.value || o.label || "");
}

function matrixVariantsOf(p) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  return variants.filter((v) => Array.isArray(v.option_values) && v.option_values.length > 0);
}

function applyLangFields(row, translations, lang) {
  const tr = translations[lang] && typeof translations[lang] === "object" ? translations[lang] : {};
  const bullets = Array.isArray(tr.bullet_points) ? tr.bullet_points : [];
  if (tr.title) row[`title_${lang}`] = str(tr.title);
  if (tr.description) row[`description_${lang}`] = str(tr.description);
  for (let i = 0; i < 5; i++) {
    if (bullets[i]) row[`bullet${i + 1}_${lang}`] = str(bullets[i]);
  }
  if (tr.seo_title) row[`seo_title_${lang}`] = str(tr.seo_title);
  if (tr.seo_description) row[`seo_description_${lang}`] = str(tr.seo_description);
  if (tr.seo_keywords) row[`seo_keywords_${lang}`] = str(tr.seo_keywords);
}

function applyMetafieldsToRow(row, metafields) {
  const list = Array.isArray(metafields) ? metafields : [];
  for (let i = 0; i < METAFIELD_PAIRS; i++) {
    const mf = list[i];
    if (!mf) continue;
    row[`metafield_${i + 1}_key`] = str(mf.key);
    row[`metafield_${i + 1}_value`] = str(mf.value);
  }
}

function findSwatchForOptionValue(variationGroups, optionIndex, value) {
  const groups = Array.isArray(variationGroups) ? variationGroups : [];
  const g = groups[optionIndex];
  if (!g || !Array.isArray(g.options)) return "";
  const val = str(value).toLowerCase();
  const opt = g.options.find((o) => str(o.value).toLowerCase() === val);
  return str(opt?.swatch_image || opt?.swatch_image_url || "");
}

function buildParentImportRow(p, meta, hasChildren) {
  const tr = meta.translations && typeof meta.translations === "object" ? meta.translations : {};
  const trDE = tr.de && typeof tr.de === "object" ? tr.de : {};
  const bullets = Array.isArray(meta.bullet_points) ? meta.bullet_points : Array.isArray(trDE.bullet_points) ? trDE.bullet_points : [];
  const eur = getEurPriceBlock(meta, p);
  const images = productImages(meta, p);
  const variationGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : [];
  const parentSku = str(p.sku) || str(meta.ean) || str(p.id);

  const row = {
    product_type: "parent",
    sku: parentSku,
    parent_sku: "",
    status: str(p.status),
    ean: str(meta.ean),
    inventory: hasChildren ? "" : (p.inventory != null ? String(p.inventory) : ""),
    brand: str(meta.brand_name || meta.brand || ""),
    type: str(meta.type || ""),
    category_slug: str(meta.category_slug || meta.category_handle || ""),
    shipping_group: str(meta.shipping_group_name || meta.shipping_group || ""),
    manufacturer: str(meta.hersteller || meta.manufacturer || ""),
    manufacturer_information: str(meta.hersteller_information || meta.manufacturer_information || ""),
    responsible_person_information: str(meta.verantwortliche_person_information || meta.responsible_person_information || ""),
    weight_grams: meta.weight_grams != null ? String(meta.weight_grams) : "",
    dim_length_cm: str(meta.dimensions_length ?? meta.dimensions?.length ?? ""),
    dim_width_cm: str(meta.dimensions_width ?? meta.dimensions?.width ?? ""),
    dim_height_cm: str(meta.dimensions_height ?? meta.dimensions?.height ?? ""),
    unit_type: str(meta.unit_type || ""),
    unit_value: meta.unit_value != null ? String(meta.unit_value) : "",
    per_unit: meta.unit_reference != null ? String(meta.unit_reference) : "",
    price: centsToExcelPrice(eur?.brutto_cents ?? p.price_cents ?? (p.price != null ? Math.round(Number(p.price) * 100) : null)),
    price_uvp: centsToExcelPrice(eur?.uvp_cents ?? meta.uvp_cents ?? meta.compare_at_price_cents),
    price_sale: centsToExcelPrice(eur?.sale_cents ?? meta.rabattpreis_cents),
    weee_number: str(meta.weee_number || ""),
    eprel_number: str(meta.eprel_number || ""),
    Verkäufer: str(p.seller_id || meta.seller_id || ""),
    _product_id: str(p.id),
  };

  for (let n = 0; n < variationGroups.length && n < 6; n++) {
    row[`option${n + 1}_name`] = str(variationGroups[n]?.name);
  }

  for (let i = 0; i < 5; i++) {
    row[`image_url_${i + 1}`] = str(images[i] || "");
  }

  for (const lang of LANGS) {
    applyLangFields(row, tr, lang);
  }
  if (!row.title_de) row.title_de = str(trDE.title || p.title);
  if (!row.description_de) row.description_de = str(trDE.description || p.description);
  if (!row.seo_title_de) row.seo_title_de = str(meta.seo_meta_title || trDE.seo_title);
  if (!row.seo_description_de) row.seo_description_de = str(meta.seo_meta_description || trDE.seo_description);
  for (let i = 0; i < 5; i++) {
    if (!row[`bullet${i + 1}_de`] && bullets[i]) row[`bullet${i + 1}_de`] = str(bullets[i]);
  }

  applyMetafieldsToRow(row, meta.metafields);
  return row;
}

function buildChildImportRow(p, v, parentSku, variationGroups) {
  const vMeta = v.metadata && typeof v.metadata === "object" ? v.metadata : {};
  const meta = (p.metadata && typeof p.metadata === "object") ? p.metadata : {};
  const parentEur = getEurPriceBlock(meta, p);
  const vEur = getVariantEurPriceBlock(vMeta, parentEur);
  const optCount = Math.max(
    Array.isArray(variationGroups) ? variationGroups.length : 0,
    Array.isArray(v.option_values) ? v.option_values.length : 0,
  );

  const row = {
    product_type: "child",
    sku: str(v.sku) || "",
    parent_sku: parentSku,
    status: "",
    ean: str(v.ean || vMeta.ean || ""),
    inventory: v.inventory != null ? String(v.inventory) : (v.inventory_quantity != null ? String(v.inventory_quantity) : ""),
    brand: "",
    type: "",
    category_slug: "",
    shipping_group: "",
    manufacturer: "",
    manufacturer_information: "",
    responsible_person_information: "",
    weight_grams: vMeta.weight_grams != null ? String(vMeta.weight_grams) : "",
    dim_length_cm: "",
    dim_width_cm: "",
    dim_height_cm: "",
    unit_type: vMeta.unit_type != null ? str(vMeta.unit_type) : "",
    unit_value: vMeta.unit_value != null ? String(vMeta.unit_value) : "",
    per_unit: vMeta.unit_reference != null ? String(vMeta.unit_reference) : "",
    price: centsToExcelPrice(vEur?.brutto_cents ?? v.price_cents ?? (v.price != null ? Math.round(Number(v.price) * 100) : null)),
    price_uvp: centsToExcelPrice(vEur?.uvp_cents ?? v.compare_at_price_cents),
    price_sale: centsToExcelPrice(vEur?.sale_cents),
    swatch_image_url: str(v.swatch_image_url || v.swatch_image || ""),
    Verkäufer: str(p.seller_id || meta.seller_id || ""),
    _product_id: str(p.id),
  };

  const img = variantImage(v, vMeta);
  if (img) row.image_url_1 = img;

  for (let n = 0; n < optCount && n < 6; n++) {
    const val = optionValueAt(v, n);
    row[`option${n + 1}_value`] = val;
    if (n === 0 && !row.swatch_image_url) {
      const sw = findSwatchForOptionValue(variationGroups, n, val);
      if (sw) row.swatch_image_url = sw;
    }
  }

  const vTr = vMeta.translations && typeof vMeta.translations === "object" ? vMeta.translations : {};
  for (const lang of LANGS) {
    applyLangFields(row, vTr, lang);
  }

  applyMetafieldsToRow(row, vMeta.metafields);
  return row;
}

/** One product → parent row + one row per variant (child). Simple products: parent only. */
function expandProductToImportRows(p) {
  const meta = (p.metadata && typeof p.metadata === "object") ? p.metadata : {};
  const matrix = matrixVariantsOf(p);
  const parentSku = str(p.sku) || str(meta.ean) || str(p.id);
  const variationGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : [];
  const rows = [buildParentImportRow(p, meta, matrix.length > 0)];
  for (const v of matrix) {
    rows.push(buildChildImportRow(p, v, parentSku, variationGroups));
  }
  return rows;
}

function buildImportExportColumns() {
  const cols = [
    "product_type", "sku", "parent_sku", "status", "ean", "inventory",
    "brand", "type", "category_slug", "shipping_group",
    "manufacturer", "manufacturer_information", "responsible_person_information",
    "weight_grams", "dim_length_cm", "dim_width_cm", "dim_height_cm",
    "image_url_1", "image_url_2", "image_url_3", "image_url_4", "image_url_5",
    "swatch_image_url",
  ];
  for (let i = 1; i <= 6; i++) {
    cols.push(`option${i}_name`, `option${i}_value`);
  }
  cols.push("unit_type", "unit_value", "per_unit", "price", "price_uvp", "price_sale", "weee_number", "eprel_number");
  for (let i = 1; i <= 5; i++) {
    cols.push(`file_${i}_url`, `file_${i}_name`);
  }
  for (let i = 1; i <= METAFIELD_PAIRS; i++) {
    cols.push(`metafield_${i}_key`, `metafield_${i}_value`);
  }
  for (const lang of LANGS) {
    cols.push(
      `title_${lang}`, `description_${lang}`,
      `bullet1_${lang}`, `bullet2_${lang}`, `bullet3_${lang}`, `bullet4_${lang}`, `bullet5_${lang}`,
      `seo_title_${lang}`, `seo_description_${lang}`, `seo_keywords_${lang}`,
    );
  }
  cols.push("Verkäufer", "_product_id");
  return cols;
}

const PRODUCT_COLUMNS = buildImportExportColumns();

// ── Generic row flattener for non-product datasets ────────────────────────────
function flattenObject(obj, prefix = "", out = {}) {
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    out[prefix] = obj.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    return out;
  }
  if (typeof obj !== "object") { out[prefix] = obj; return out; }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = "";
    else if (typeof v === "object" && !Array.isArray(v)) flattenObject(v, key, out);
    else if (Array.isArray(v)) out[key] = v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    else out[key] = v;
  }
  return out;
}

async function fetchDataset(backendUrl, token, key) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const map = {
    products: { url: `${backendUrl}/admin-hub/products?limit=5000`, root: "products", structured: true },
    orders: { url: `${backendUrl}/admin-hub/v1/orders?limit=5000`, root: "orders" },
    customers: { url: `${backendUrl}/admin-hub/v1/customers?limit=5000`, root: "customers" },
    transactions: { url: `${backendUrl}/admin-hub/v1/transactions?limit=5000`, root: "transactions" },
    ranking: { url: `${backendUrl}/admin-hub/v1/ranking/products?limit=5000`, root: "products" },
  };
  const conf = map[key];
  if (!conf) return { rows: [], columns: null };
  const data = await fetchJson(conf.url, { headers });
  const arr = Array.isArray(data?.[conf.root]) ? data[conf.root] : [];
  if (conf.structured) {
    const rows = [];
    for (const p of arr) {
      rows.push(...expandProductToImportRows(p));
    }
    return { rows, columns: PRODUCT_COLUMNS };
  }
  return { rows: arr.map((row) => flattenObject(row)), columns: null };
}

function normalizeSellerKey(flat) {
  return str(flat.Verkäufer || flat.seller_id || flat["metadata.seller_id"] || "platform_admin");
}

function normalizeDateKey(flat) {
  return str(flat["Erstellt"] || flat.created_at || flat.date || flat.updated_at || "");
}

function applyFilters(rows, filters = {}, ctx = {}) {
  const q = str(filters.search).toLowerCase();
  const status = str(filters.status).toLowerCase();
  const from = str(filters.date_from);
  const to = str(filters.date_to);
  const sellerFilter = str(filters.seller_id);
  const forcedSellerId = str(ctx.forcedSellerId);
  return rows.filter((row) => {
    const sellerKey = normalizeSellerKey(row);
    if (forcedSellerId && sellerKey !== forcedSellerId) return false;
    if (sellerFilter && sellerKey !== sellerFilter) return false;
    if (status) {
      const s = str(row["Status"] || row.status || "").toLowerCase();
      if (s !== status) return false;
    }
    if (from || to) {
      const rawDate = normalizeDateKey(row);
      if (rawDate) {
        const t = new Date(rawDate).getTime();
        if (!Number.isNaN(t)) {
          if (from) { const ft = new Date(from).getTime(); if (!Number.isNaN(ft) && t < ft) return false; }
          if (to) { const tt = new Date(to).getTime() + 86399999; if (!Number.isNaN(tt) && t > tt) return false; }
        }
      }
    }
    if (q) {
      const hay = Object.values(row).map((v) => str(v).toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function collectColumns(rows) {
  const set = new Set();
  for (const row of rows) for (const k of Object.keys(row)) set.add(k);
  const base = ["id", "title", "sku", "status", "seller_id", "created_at", "updated_at"];
  const all = [...set];
  all.sort((a, b) => a.localeCompare(b));
  return [...base.filter((x) => set.has(x)), ...all.filter((x) => !base.includes(x))];
}

function toCsv(columns, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c] ?? "")).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

async function toXlsx(columns, rows, groupBySeller = false, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Andertal Sellercentral";
  wb.created = new Date();

  // Summary sheet
  const ws0 = wb.addWorksheet("Info");
  ws0.columns = [{ width: 26 }, { width: 80 }];
  [
    ["Erstellt am", new Date().toISOString()],
    ["Datensätze", Array.isArray(meta.datasets) ? meta.datasets.join(", ") : ""],
    ["Zeilen gesamt", String(meta.totalRows ?? rows.length)],
    ["Format", "xlsx"],
    ["Suchfilter", str(meta.filters?.search)],
    ["Statusfilter", str(meta.filters?.status)],
    ["Datum von", str(meta.filters?.date_from)],
    ["Datum bis", str(meta.filters?.date_to)],
  ].forEach((r, i) => {
    ws0.addRow(r);
    if (i === 0) ws0.getRow(1).font = { bold: true };
  });

  const addSheet = (name, sheetRows) => {
    const ws = wb.addWorksheet(name.substring(0, 31));
    ws.addRow(columns);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, columns.length) } };
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    for (const row of sheetRows) ws.addRow(columns.map((c) => row[c] ?? ""));
    for (let i = 2; i <= ws.rowCount; i++) {
      if (i % 2 === 0) ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }
    const sampleSize = Math.min(sheetRows.length, 200);
    ws.columns.forEach((col, colIdx) => {
      const key = columns[colIdx] || "";
      let maxLen = Math.max(12, key.length + 2);
      for (let i = 0; i < sampleSize; i++) {
        const v = sheetRows[i]?.[key];
        const l = String(v ?? "").length;
        if (l > maxLen) maxLen = l;
      }
      col.width = Math.min(60, Math.max(12, maxLen + 2));
    });
  };

  if (groupBySeller) {
    const buckets = new Map();
    for (const row of rows) {
      const s = normalizeSellerKey(row);
      if (!buckets.has(s)) buckets.set(s, []);
      buckets.get(s).push(row);
    }
    for (const [sellerId, sellerRows] of buckets.entries()) addSheet(`seller_${sellerId}`, sellerRows);
  } else {
    addSheet("Inventar", rows);
  }
  return wb.xlsx.writeBuffer();
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locale = body.locale
      ? String(body.locale).slice(0, 2).toLowerCase()
      : resolveRequestLocale(request);
    const msg = getImportApiMessages(locale);
    const backendUrl = getBackendBase();
    const token = str(body.sellerToken);
    if (!token) return Response.json({ error: msg.missingSellerToken }, { status: 401 });

    const headers = { Authorization: `Bearer ${token}` };
    const accountRes = await fetchJson(`${backendUrl}/admin-hub/v1/seller/account`, { headers });
    const sellerUser = accountRes?.sellerUser || accountRes?.user || {};
    const isSuperuser = !!sellerUser?.is_superuser;
    const ownSellerId = str(sellerUser?.seller_id);

    const datasets = Array.isArray(body.datasets) && body.datasets.length
      ? body.datasets.filter((x) => ["products", "orders", "customers", "transactions", "ranking"].includes(x))
      : ["products"];
    const includeAllSellers = !!body.include_all_sellers;
    const forcedSellerId = !isSuperuser ? ownSellerId : (includeAllSellers ? "" : "platform_admin");
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};

    let rows = [];
    let structuredColumns = null;
    for (const ds of datasets) {
      const { rows: part, columns } = await fetchDataset(backendUrl, token, ds);
      if (columns && !structuredColumns) structuredColumns = columns;
      rows.push(...part);
    }
    rows = applyFilters(rows, filters, { forcedSellerId });

    const columns = structuredColumns ?? collectColumns(rows);

    if (body.preview) {
      return Response.json({
        ok: true,
        is_superuser: isSuperuser,
        seller_id: ownSellerId || null,
        total: rows.length,
        columns,
      });
    }

    const format = str(body.format || "xlsx").toLowerCase();
    const fileBase = `andertal-inventar-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      const text = toCsv(columns, rows);
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        },
      });
    }

    const buf = await toXlsx(
      columns,
      rows,
      isSuperuser && includeAllSellers && !!body.group_by_seller,
      { datasets, filters, totalRows: rows.length }
    );
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || msg.exportFailed }, { status: 500 });
  }
}
