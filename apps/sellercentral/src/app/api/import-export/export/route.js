import ExcelJS from "exceljs";
import { getImportApiMessages, resolveRequestLocale } from "@/lib/import-export-i18n";
import { EXPORT_DATASETS, getExportDataset, resolveExportColumns } from "@/lib/import-export-columns";

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

function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return str(v);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function yesNo(v) {
  return v === true || v === "t" || v === "true" ? "yes" : "no";
}

function mapOrderRow(o) {
  return {
    order_number: o.order_number != null ? String(o.order_number) : "",
    created_at: formatDate(o.created_at),
    order_status: str(o.order_status),
    payment_status: str(o.payment_status),
    delivery_status: str(o.delivery_status),
    email: str(o.email),
    first_name: str(o.first_name),
    last_name: str(o.last_name),
    phone: str(o.phone),
    address_line1: str(o.address_line1),
    address_line2: str(o.address_line2),
    city: str(o.city),
    postal_code: str(o.postal_code),
    country: str(o.country),
    currency: str(o.currency || "EUR"),
    subtotal: centsToExcelPrice(o.subtotal_cents),
    shipping: centsToExcelPrice(o.shipping_cents),
    discount: centsToExcelPrice(o.discount_cents),
    total: centsToExcelPrice(o.total_cents),
    tracking_number: str(o.tracking_number),
    carrier_name: str(o.carrier_name),
    shipped_at: formatDate(o.shipped_at),
    seller_id: str(o.seller_id),
  };
}

function mapTransactionRow(t) {
  return {
    type: str(t.type),
    order_id: str(t.order_id),
    order_number: t.order_number != null ? String(t.order_number) : "",
    created_at: formatDate(t.created_at),
    payment_status: str(t.payment_status),
    delivery_status: str(t.delivery_status),
    currency: str(t.currency || "EUR"),
    total: centsToExcelPrice(t.total_cents),
    commission: centsToExcelPrice(t.commission_cents),
    payout: centsToExcelPrice(t.payout_cents),
    payout_eligible: yesNo(t.payout_eligible),
    store_name: str(t.store_name),
    seller_id: str(t.seller_id),
    customer_id: str(t.customer_id),
    destination_country: str(t.destination_country),
    vat_scheme: str(t.vat_scheme),
    goods_vat_rate_percent: t.goods_vat_rate_percent != null ? String(t.goods_vat_rate_percent) : "",
    goods_net_cents: centsToExcelPrice(t.goods_net_cents),
    goods_vat_cents: centsToExcelPrice(t.goods_vat_cents),
    gross_sale_cents: centsToExcelPrice(t.gross_sale_cents),
    commission_net_cents: centsToExcelPrice(t.commission_cents),
    commission_vat_cents: centsToExcelPrice(t.commission_vat_cents),
    bonus_earned_points: t.bonus_earned_points != null ? String(t.bonus_earned_points) : "",
    bonus_redeemed_cents: centsToExcelPrice(t.bonus_redeemed_cents),
    platform_bonus_funding_cents: centsToExcelPrice(t.platform_bonus_funding_cents),
    customer_paid_cents: centsToExcelPrice(t.customer_paid_cents),
    seller_payout_cents: centsToExcelPrice(t.payout_cents),
    refund_cents: centsToExcelPrice(t.refund_cents),
    stripe_payment_intent_id: str(t.payment_intent_id),
    stripe_transfer_or_payout_id: str(t.stripe_transfer_or_payout_id),
    accounting_category: "",
  };
}

function mapCustomerRow(c) {
  return {
    customer_number: c.customer_number != null ? String(c.customer_number) : "",
    email: str(c.email),
    first_name: str(c.first_name),
    last_name: str(c.last_name),
    phone: str(c.phone),
    country: str(c.country),
    is_registered: yesNo(c.is_registered),
    order_count: c.order_count != null ? String(c.order_count) : "0",
    total_spent: centsToExcelPrice(c.total_spent),
    created_at: formatDate(c.created_at),
  };
}

function mapRankingRow(p) {
  return {
    title: str(p.title),
    handle: str(p.handle),
    status: str(p.status),
    seller_id: str(p.seller_id),
    impressions_30d: p.impressions_30d != null ? String(p.impressions_30d) : "0",
    clicks_30d: p.clicks_30d != null ? String(p.clicks_30d) : "0",
    add_to_cart_30d: p.add_to_cart_30d != null ? String(p.add_to_cart_30d) : "0",
    sales_7d: p.sales_7d != null ? String(p.sales_7d) : "0",
    sales_30d: p.sales_30d != null ? String(p.sales_30d) : "0",
    sales_90d: p.sales_90d != null ? String(p.sales_90d) : "0",
    gmv_30d: centsToExcelPrice(p.gmv_30d_cents),
    review_avg: p.review_avg != null ? String(p.review_avg) : "",
    review_count: p.review_count != null ? String(p.review_count) : "0",
    inventory: p.inventory != null ? String(p.inventory) : "",
    final_score: p.final_score != null ? String(p.final_score) : "",
  };
}

function qs(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function fetchAllPages(url, headers, root, pageSize, maxRows) {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const join = url.includes("?") ? "&" : "?";
    const data = await fetchJson(`${url}${join}limit=${pageSize}&offset=${offset}`, { headers });
    const arr = Array.isArray(data?.[root]) ? data[root] : [];
    rows.push(...arr);
    if (arr.length < pageSize) break;
    offset += pageSize;
  }
  return rows.slice(0, maxRows);
}

async function fetchDataset(backendUrl, token, key, { sellerQuery, status } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (key === "products") {
    const arr = await fetchAllPages(
      `${backendUrl}/admin-hub/products${qs({ seller_id: sellerQuery, status })}`,
      headers,
      "products",
      500,
      5000,
    );
    const rows = [];
    for (const p of arr) rows.push(...expandProductToImportRows(p));
    return rows;
  }
  if (key === "orders") {
    const arr = await fetchAllPages(
      `${backendUrl}/admin-hub/v1/orders${qs({ seller_id: sellerQuery, order_status: status })}`,
      headers,
      "orders",
      200,
      10000,
    );
    return arr.map(mapOrderRow);
  }
  if (key === "transactions") {
    const data = await fetchJson(
      `${backendUrl}/admin-hub/v1/transactions${qs({ seller_id: sellerQuery, include_pending: "true" })}`,
      { headers },
    );
    const arr = Array.isArray(data?.transactions) ? data.transactions : [];
    return arr.map(mapTransactionRow);
  }
  if (key === "customers") {
    const arr = await fetchAllPages(
      `${backendUrl}/admin-hub/v1/customers`,
      headers,
      "customers",
      200,
      5000,
    );
    return arr.map(mapCustomerRow);
  }
  if (key === "ranking") {
    const data = await fetchJson(`${backendUrl}/admin-hub/v1/ranking/products`, { headers });
    const arr = Array.isArray(data?.products) ? data.products : [];
    return arr.map(mapRankingRow);
  }
  return [];
}

function normalizeSellerKey(row) {
  return str(row.Verkäufer || row.seller_id || "");
}

function normalizeDateKey(row) {
  return str(row.created_at || row.shipped_at || "");
}

function applyFilters(rows, filters = {}, datasetKey = "products") {
  const q = str(filters.search).toLowerCase();
  const status = str(filters.status).toLowerCase();
  const from = str(filters.date_from);
  const to = str(filters.date_to);
  const sellerFilter = str(filters.seller_id);
  return rows.filter((row) => {
    if (sellerFilter) {
      const sellerKey = normalizeSellerKey(row);
      if (sellerKey && sellerKey !== sellerFilter) return false;
    }
    if (status && datasetKey !== "products") {
      const s = str(
        row.order_status || row.payment_status || row.status || "",
      ).toLowerCase();
      if (s !== status) return false;
    }
    if (from || to) {
      const rawDate = normalizeDateKey(row);
      if (rawDate) {
        const t = new Date(rawDate).getTime();
        if (!Number.isNaN(t)) {
          if (from) {
            const ft = new Date(from).getTime();
            if (!Number.isNaN(ft) && t < ft) return false;
          }
          if (to) {
            const tt = new Date(to).getTime() + 86399999;
            if (!Number.isNaN(tt) && t > tt) return false;
          }
        }
      } else if (datasetKey !== "products") {
        return false;
      }
    }
    if (q) {
      const hay = Object.values(row).map((v) => str(v).toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function toDelimited(colDefs, rows, delimiter) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(delimiter) || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const headers = colDefs.map((c) => c.label || c.key);
  const lines = [headers.map(esc).join(delimiter)];
  for (const row of rows) {
    lines.push(colDefs.map((c) => esc(row[c.key] ?? "")).join(delimiter));
  }
  return `\uFEFF${lines.join("\n")}`;
}

function addDataSheet(wb, name, colDefs, sheetRows) {
  const ws = wb.addWorksheet(String(name || "Export").substring(0, 31));
  const headers = colDefs.map((c) => c.label || c.key);
  ws.addRow(headers);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (colDefs.length) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: colDefs.length },
    };
  }
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  header.alignment = { vertical: "middle", wrapText: false };
  header.height = 22;
  for (const row of sheetRows) {
    ws.addRow(colDefs.map((c) => row[c.key] ?? ""));
  }
  for (let i = 2; i <= ws.rowCount; i++) {
    if (i % 2 === 0) {
      ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }
  }
  const sampleSize = Math.min(sheetRows.length, 200);
  ws.columns.forEach((col, colIdx) => {
    const label = headers[colIdx] || "";
    const key = colDefs[colIdx]?.key || "";
    let maxLen = Math.max(10, label.length + 2);
    for (let i = 0; i < sampleSize; i++) {
      const l = String(sheetRows[i]?.[key] ?? "").length;
      if (l > maxLen) maxLen = l;
    }
    col.width = Math.min(48, Math.max(12, maxLen + 2));
  });
}

async function toXlsx(sheets, { groupBySeller = false } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Andertal Sellercentral";
  wb.created = new Date();

  for (const sheet of sheets) {
    const colDefs = sheet.columns || [];
    const rows = sheet.rows || [];
    if (groupBySeller) {
      const buckets = new Map();
      for (const row of rows) {
        const s = normalizeSellerKey(row) || "unknown";
        if (!buckets.has(s)) buckets.set(s, []);
        buckets.get(s).push(row);
      }
      for (const [sellerId, sellerRows] of buckets.entries()) {
        const short = String(sellerId).replace(/[^\w-]/g, "").slice(0, 18) || "seller";
        addDataSheet(wb, `${sheet.name}_${short}`.substring(0, 31), colDefs, sellerRows);
      }
    } else {
      addDataSheet(wb, sheet.name, colDefs, rows);
    }
  }

  if (wb.worksheets.length === 0) {
    addDataSheet(wb, "Export", [{ key: "info", label: "info" }], [{ info: "No rows" }]);
  }
  return wb.xlsx.writeBuffer();
}

export async function POST(request) {
  let msg = getImportApiMessages("de");
  try {
    const body = await request.json().catch(() => ({}));
    const locale = body.locale
      ? String(body.locale).slice(0, 2).toLowerCase()
      : resolveRequestLocale(request);
    msg = getImportApiMessages(locale);
    const backendUrl = getBackendBase();
    const token = str(body.sellerToken);
    if (!token) return Response.json({ error: msg.missingSellerToken }, { status: 401 });

    const headers = { Authorization: `Bearer ${token}` };
    const accountRes = await fetchJson(`${backendUrl}/admin-hub/v1/seller/account`, { headers });
    const sellerUser = accountRes?.sellerUser || accountRes?.user || {};
    const isSuperuser = !!sellerUser?.is_superuser;
    const ownSellerId = str(sellerUser?.seller_id);

    const requested = Array.isArray(body.datasets) && body.datasets.length
      ? body.datasets.map(String)
      : [str(body.dataset) || "products"];
    const datasets = [];
    for (const key of requested) {
      const spec = getExportDataset(key);
      if (!spec) continue;
      if (spec.superuserOnly && !isSuperuser) continue;
      if (!datasets.includes(key)) datasets.push(key);
    }
    if (!datasets.length) datasets.push("products");

    const includeAllSellers = !!body.include_all_sellers;
    const sellerQuery = isSuperuser && includeAllSellers ? "" : ownSellerId;
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const selectedKeys = Array.isArray(body.columns) ? body.columns : null;

    if (body.preview) {
      const key = datasets[0];
      const spec = EXPORT_DATASETS[key];
      const cols = resolveExportColumns(key, selectedKeys);
      return Response.json({
        ok: true,
        is_superuser: isSuperuser,
        seller_id: ownSellerId || null,
        dataset: key,
        columns: (spec?.columns || []).map((c) => c.key),
        column_defs: spec?.columns || [],
        groups: spec?.groups || [],
        default_keys: spec?.defaultKeys || [],
        selected: cols.map((c) => c.key),
      });
    }

    const sheets = [];
    for (const key of datasets) {
      const spec = EXPORT_DATASETS[key];
      const raw = await fetchDataset(backendUrl, token, key, {
        sellerQuery,
        status: key === "products" || key === "orders" ? str(filters.status) : "",
      });
      const rows = applyFilters(raw, filters, key);
      const colDefs = resolveExportColumns(key, datasets.length === 1 ? selectedKeys : null);
      sheets.push({ name: spec.sheetName, key, columns: colDefs, rows });
    }

    const format = str(body.format || "xlsx").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const fileBase = `andertal-${datasets.join("-")}-${stamp}`;
    const primary = sheets[0];

    if (format === "csv" || format === "txt") {
      const text = toDelimited(primary.columns, primary.rows, format === "txt" ? "\t" : ",");
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": format === "txt" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.${format}"`,
        },
      });
    }

    const buf = await toXlsx(sheets, {
      groupBySeller: isSuperuser && includeAllSellers && !!body.group_by_seller,
    });
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
