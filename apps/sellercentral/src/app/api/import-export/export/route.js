import ExcelJS from "exceljs";

const DEFAULT_BACKEND = "https://andertal-medusa-backend.onrender.com";

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

// ── Product row mapper ────────────────────────────────────────────────────────
function mapProductRow(p) {
  const meta = (p.metadata && typeof p.metadata === "object") ? p.metadata : {};
  const variants = Array.isArray(p.variants) ? p.variants : [];

  // Images
  const mediaArr = Array.isArray(meta.media) ? meta.media : [];
  const legacyImg = str(meta.image_url || meta.image || meta.thumbnail || p.thumbnail || "");
  const allImages = mediaArr.length > 0 ? mediaArr : (legacyImg ? [legacyImg] : []);

  // Prices
  const priceCents = p.price_cents ?? (p.price != null ? Math.round(Number(p.price) * 100) : 0);
  const price = priceCents ? (priceCents / 100).toFixed(2) : "";
  const compareAtCents = meta.uvp_cents ?? meta.compare_at_price_cents ?? meta.rabattpreis_cents ?? null;
  const compareAt = compareAtCents ? (compareAtCents / 100).toFixed(2) : "";

  // Region prices (prices object: { de: "XX", at: "XX", ... })
  const prices = meta.prices && typeof meta.prices === "object" ? meta.prices : {};
  const priceDE = str(prices.de || "");
  const priceAT = str(prices.at || "");
  const priceCH = str(prices.ch || "");

  // Bullet points
  const bullets = Array.isArray(meta.bullet_points) ? meta.bullet_points : [];

  // Translations (DE is canonical)
  const translations = meta.translations && typeof meta.translations === "object" ? meta.translations : {};
  const trDE = translations.de && typeof translations.de === "object" ? translations.de : {};
  const trTR = translations.tr && typeof translations.tr === "object" ? translations.tr : {};
  const trEN = translations.en && typeof translations.en === "object" ? translations.en : {};
  const trFR = translations.fr && typeof translations.fr === "object" ? translations.fr : {};

  // Metafields
  const metafields = Array.isArray(meta.metafields) ? meta.metafields : [];
  const metafieldsStr = metafields.map((mf) => `${str(mf.key)}:${str(mf.value)}`).join(" | ");

  // Custom attributes (non-system metadata keys)
  const SYSTEM_KEYS = new Set([
    "media", "image_url", "image", "thumbnail", "ean", "sku", "bullet_points",
    "translations", "variation_groups", "metafields", "shipping_group_id",
    "collection_id", "collection_ids", "admin_category_id", "category_id",
    "seller_id", "product_id", "brand_id", "brand_logo", "brand_handle",
    "brand", "brand_name", "shop_name", "store_name", "seller_name",
    "hersteller", "hersteller_information", "verantwortliche_person_information",
    "seo_keywords", "seo_meta_title", "seo_meta_description",
    "publish_date", "return_days", "return_cost", "return_kostenlos",
    "related_product_ids", "dimensions", "dimensions_length", "dimensions_width",
    "dimensions_height", "weight", "weight_grams", "unit_type", "unit_value",
    "unit_reference", "shipping_info", "versand", "rabattpreis_cents",
    "uvp_cents", "price_cents", "compare_at_price_cents", "sale_price_cents",
    "review_count", "review_avg", "sold_last_month", "is_new", "badge", "sale",
    "prices",
  ]);
  const customAttrs = Object.entries(meta)
    .filter(([k, v]) => !SYSTEM_KEYS.has(k) && !k.startsWith("_") && v != null && v !== "")
    .map(([k, v]) => `${k}:${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" | ");

  // Variants summary
  const variantsSummary = variants
    .map((v) => {
      const opts = Array.isArray(v.option_values) ? v.option_values.map((o) => str(o.value)).filter(Boolean).join("/") : str(v.value || v.name || "");
      return [opts, str(v.sku), str(v.ean), v.inventory != null ? String(v.inventory) : ""].filter(Boolean).join(" | ");
    })
    .filter(Boolean)
    .join("  //  ");

  // Dimensions & weight
  const dims = meta.dimensions || {};
  const weightG = meta.weight_grams ?? (meta.weight ? Math.round(Number(meta.weight) * 1000) : "");

  // SEO
  const seoTitle = str(meta.seo_meta_title || trDE.seo_title || "");
  const seoDesc = str(meta.seo_meta_description || trDE.seo_description || "");

  return {
    "SKU":                 str(p.sku),
    "Name":                str(trDE.title || p.title),
    "EAN":                 str(meta.ean),
    "Status":              str(p.status),
    "Beschreibung":        str(trDE.description || p.description),
    "Preis (EUR)":         price,
    "Vergleichspreis (EUR)": compareAt,
    "Preis DE":            priceDE,
    "Preis AT":            priceAT,
    "Preis CH":            priceCH,
    "Bestand":             p.inventory != null ? String(p.inventory) : "",
    "Foto URL 1":          str(allImages[0] || ""),
    "Foto URL 2":          str(allImages[1] || ""),
    "Foto URL 3":          str(allImages[2] || ""),
    "Foto URL 4":          str(allImages[3] || ""),
    "Foto URL 5":          str(allImages[4] || ""),
    "Bullet Point 1":      str(bullets[0] || ""),
    "Bullet Point 2":      str(bullets[1] || ""),
    "Bullet Point 3":      str(bullets[2] || ""),
    "Bullet Point 4":      str(bullets[3] || ""),
    "Bullet Point 5":      str(bullets[4] || ""),
    "Metafelder":          metafieldsStr,
    "Eigene Attribute":    customAttrs,
    "Varianten":           variantsSummary,
    "Name (TR)":           str(trTR.title || ""),
    "Name (EN)":           str(trEN.title || ""),
    "Name (FR)":           str(trFR.title || ""),
    "Beschreibung (TR)":   str(trTR.description || ""),
    "Beschreibung (EN)":   str(trEN.description || ""),
    "Beschreibung (FR)":   str(trFR.description || ""),
    "Marke":               str(meta.brand_name || meta.brand || ""),
    "Hersteller":          str(meta.hersteller || ""),
    "Gewicht (g)":         weightG != null ? String(weightG) : "",
    "Länge (cm)":          str(dims.length ?? meta.dimensions_length ?? ""),
    "Breite (cm)":         str(dims.width ?? meta.dimensions_width ?? ""),
    "Höhe (cm)":           str(dims.height ?? meta.dimensions_height ?? ""),
    "SEO Titel":           seoTitle,
    "SEO Beschreibung":    seoDesc,
    "Kategorie":           str(meta.admin_category_id || meta.category_id || p.collection_id || ""),
    "Handle":              str(p.handle),
    "Verkäufer":           str(p.seller_id || meta.seller_id || ""),
    "Erstellt":            str(p.created_at || ""),
    "Aktualisiert":        str(p.updated_at || ""),
    "ID":                  str(p.id),
  };
}

const PRODUCT_COLUMNS = [
  "SKU", "Name", "EAN", "Status", "Beschreibung",
  "Preis (EUR)", "Vergleichspreis (EUR)", "Preis DE", "Preis AT", "Preis CH", "Bestand",
  "Foto URL 1", "Foto URL 2", "Foto URL 3", "Foto URL 4", "Foto URL 5",
  "Bullet Point 1", "Bullet Point 2", "Bullet Point 3", "Bullet Point 4", "Bullet Point 5",
  "Metafelder", "Eigene Attribute", "Varianten",
  "Name (TR)", "Name (EN)", "Name (FR)",
  "Beschreibung (TR)", "Beschreibung (EN)", "Beschreibung (FR)",
  "Marke", "Hersteller", "Gewicht (g)", "Länge (cm)", "Breite (cm)", "Höhe (cm)",
  "SEO Titel", "SEO Beschreibung", "Kategorie", "Handle", "Verkäufer",
  "Erstellt", "Aktualisiert", "ID",
];

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
    return { rows: arr.map(mapProductRow), columns: PRODUCT_COLUMNS };
  }
  return { rows: arr.map((row) => flattenObject(row)), columns: null };
}

function normalizeSellerKey(flat) {
  return (
    str(flat["Verkäufer"] || flat.seller_id || flat["metadata.seller_id"] || "platform_admin")
  );
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
    const backendUrl = getBackendBase();
    const token = str(body.sellerToken);
    if (!token) return Response.json({ error: "Missing seller token" }, { status: 401 });

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
    return Response.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
