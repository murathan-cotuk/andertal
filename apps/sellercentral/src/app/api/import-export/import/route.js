import ExcelJS from "exceljs";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const COUNTRIES = ["DE", "AT", "CH", "FR", "IT", "ES", "TR", "US"];

function parseCents(val) {
  if (val == null || val === "") return undefined;
  const n = parseFloat(String(val).replace(",", "."));
  if (isNaN(n)) return undefined;
  return Math.round(n * 100);
}

function parseNum(val) {
  if (val == null || val === "") return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function str(val) {
  if (val == null) return "";
  return String(val).trim();
}

/** Parse rows into { parents: Map<sku, row>, children: Map<parent_sku, row[]> } */
function groupRows(rows, headers) {
  const idx = {};
  headers.forEach((h, i) => { idx[str(h)] = i; });
  const get = (row, key) => str(row[idx[key]] ?? "");

  const parents = new Map();
  const children = new Map();

  for (const row of rows) {
    const type = get(row, "product_type").toLowerCase();
    const sku = get(row, "sku");
    if (!sku || sku.startsWith("#")) continue;

    if (type === "parent") {
      parents.set(sku, row);
    } else if (type === "child") {
      const pSku = get(row, "parent_sku");
      if (!pSku) continue;
      if (!children.has(pSku)) children.set(pSku, []);
      children.get(pSku).push(row);
    }
  }
  return { parents, children, idx, get };
}

/** Build product payload from parent row + its children */
function buildProductPayload(parentRow, childRows, idx, get) {
  const G = (key) => get(parentRow, key);

  // Translations
  const translations = {};
  for (const lang of LANGS) {
    const title = G(`title_${lang}`);
    if (!title) continue;
    translations[lang] = {
      title,
      description: G(`description_${lang}`) || undefined,
      handle: G(`handle_${lang}`) || undefined,
      bullet_points: [
        G(`bullet1_${lang}`),
        G(`bullet2_${lang}`),
        G(`bullet3_${lang}`),
      ].filter(Boolean),
    };
  }

  // Prices
  const prices = {};
  for (const country of COUNTRIES) {
    const brutto = parseCents(G(`price_brutto_${country}`));
    const uvp    = parseCents(G(`price_uvp_${country}`));
    const sale   = parseCents(G(`price_sale_${country}`));
    if (brutto != null) {
      prices[country] = { brutto_cents: brutto };
      if (uvp  != null) prices[country].uvp_cents  = uvp;
      if (sale != null) prices[country].sale_cents = sale;
    }
  }

  // Media
  const media = [1,2,3,4,5]
    .map(n => G(`image_url_${n}`))
    .filter(Boolean);

  // Variants + variation groups
  const opt1Name = G("option1_name");
  const opt2Name = G("option2_name");

  const variants = [];
  const optMap1 = {}; // value → { swatch, labels }
  const optMap2 = {};

  for (const cRow of (childRows || [])) {
    const cGet = (key) => get(cRow, key);
    const v1val = cGet("option1_value");
    const v2val = cGet("option2_value");
    const swatchUrl = cGet("swatch_image_url");

    if (v1val && !optMap1[v1val]) optMap1[v1val] = { swatch_image: swatchUrl || undefined };
    if (v2val && !optMap2[v2val]) optMap2[v2val] = {};

    const optionValues = [v1val, v2val].filter(Boolean);

    variants.push({
      sku: cGet("sku") || undefined,
      ean: cGet("ean") || undefined,
      inventory: parseNum(cGet("inventory")) ?? 0,
      option_values: optionValues,
      image_urls: cGet("image_url_1") ? { de: cGet("image_url_1") } : undefined,
    });
  }

  const variationGroups = [];
  if (opt1Name && Object.keys(optMap1).length) {
    variationGroups.push({
      name: opt1Name,
      options: Object.entries(optMap1).map(([value, meta]) => ({ value, swatch_image: meta.swatch_image })),
    });
  }
  if (opt2Name && Object.keys(optMap2).length) {
    variationGroups.push({
      name: opt2Name,
      options: Object.keys(optMap2).map(value => ({ value })),
    });
  }

  const collHandles = G("collection_handles")
    .split(",").map(s => s.trim()).filter(Boolean);

  const payload = {
    title: G("title_de") || G("title_en"),
    description: G("description_de") || G("description_en") || undefined,
    handle: G("handle_de") || undefined,
    status: G("status") || "draft",
    sku: G("sku") || undefined,
    metadata: {
      translations: Object.keys(translations).length ? translations : undefined,
      prices: Object.keys(prices).length ? prices : undefined,
      media: media.length ? media : undefined,
      ean: G("ean") || undefined,
      weight_grams: parseNum(G("weight_grams")),
      dimensions_length: parseNum(G("dim_length_cm")),
      dimensions_width: parseNum(G("dim_width_cm")),
      dimensions_height: parseNum(G("dim_height_cm")),
      unit_type: G("unit_type") || undefined,
      unit_value: parseNum(G("unit_value")),
      variation_groups: variationGroups.length ? variationGroups : undefined,
      collection_handles: collHandles.length ? collHandles : undefined,
      seo_meta_title: G("seo_title") || undefined,
      seo_meta_description: G("seo_description") || undefined,
      seo_keywords: G("seo_keywords") || undefined,
    },
    variants: variants.length ? variants : undefined,
  };

  // Brand / type
  const brand = G("brand");
  const type  = G("type");
  if (brand) payload.metadata.hersteller = brand;
  if (type)  payload.metadata.type = type;

  return payload;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sellerToken = formData.get("sellerToken") || "";
    const backendUrl = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://belucha-medusa-backend.onrender.com").replace(/\/$/, "");

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ws = wb.getWorksheet("Products") || wb.worksheets[0];
    if (!ws) return Response.json({ error: "Sheet 'Products' not found" }, { status: 400 });

    // Read headers from row 2 (row 1 = group labels, row 2 = column names)
    const headerRow = ws.getRow(2);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(str(cell.value));
    });

    // Read data rows (skip rows 1-3: group header, column names, notes)
    const dataRows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum <= 3) return;
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cell.value);
      });
      // Skip fully empty rows
      if (values.every(v => v == null || str(v) === "")) return;
      dataRows.push(values);
    });

    if (dataRows.length === 0) {
      return Response.json({ error: "No data rows found (rows must start from row 4)" }, { status: 400 });
    }

    const { parents, children, idx, get } = groupRows(dataRows, headers);

    if (parents.size === 0) {
      return Response.json({ error: "No parent rows found. Add rows with product_type='parent'." }, { status: 400 });
    }

    // Process each parent
    const results = { created: 0, failed: 0, errors: [] };

    for (const [sku, parentRow] of parents) {
      const childRows = children.get(sku) || [];
      const payload = buildProductPayload(parentRow, childRows, idx, get);

      if (!payload.title) {
        results.failed++;
        results.errors.push({ sku, error: "Missing title_de (or title_en)" });
        continue;
      }

      try {
        const res = await fetch(`${backendUrl}/admin-hub/v1/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sellerToken ? { Authorization: `Bearer ${sellerToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          results.failed++;
          results.errors.push({ sku, error: err?.message || `HTTP ${res.status}` });
        } else {
          results.created++;
        }
      } catch (e) {
        results.failed++;
        results.errors.push({ sku, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      total: parents.size,
      created: results.created,
      failed: results.failed,
      errors: results.errors,
    });
  } catch (e) {
    console.error("Import error:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
