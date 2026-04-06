import ExcelJS from "exceljs";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const COUNTRIES = ["DE", "AT", "CH", "FR", "IT", "ES", "TR", "US"];
const DEFAULT_BACKEND = "https://belucha-medusa-backend.onrender.com";

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

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

/** Non-empty Excel cell — empty cells must not overwrite existing DB values on update */
function keyPresent(row, key, idx) {
  const i = idx[key];
  if (i === undefined) return false;
  const v = row[i];
  if (v == null) return false;
  if (typeof v === "number" && Number.isNaN(v)) return false;
  return str(v) !== "";
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

async function loadImportLookups(backendUrl, sellerToken) {
  const authHeaders = sellerToken ? { Authorization: `Bearer ${sellerToken}` } : {};

  let catsFlat = [];
  try {
    const data = await fetchJson(`${backendUrl}/admin-hub/v1/categories?tree=true&active=true`);
    const tree = data.tree || data.categories || [];
    catsFlat = flattenCategoryTree(Array.isArray(tree) ? tree : []);
  } catch {
    catsFlat = [];
  }

  const slugToId = new Map();
  for (const c of catsFlat) {
    slugToId.set(String(c.slug).toLowerCase(), c.id);
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

  const brandByLowerName = new Map();
  for (const b of brands) {
    const k = String(b.name || "").trim().toLowerCase();
    if (k) brandByLowerName.set(k, b);
  }

  let shipGroups = [];
  try {
    if (sellerToken) {
      const data = await fetchJson(`${backendUrl}/admin-hub/v1/shipping-groups`, { headers: authHeaders });
      shipGroups = Array.isArray(data.groups) ? data.groups : [];
    }
  } catch {
    shipGroups = [];
  }

  const shipByLowerName = new Map();
  for (const g of shipGroups) {
    const k = String(g.name || "").trim().toLowerCase();
    if (k) shipByLowerName.set(k, g);
  }

  return { slugToId, brandByLowerName, shipByLowerName };
}

/** Dense row values aligned to header columns */
function normalizeDataRows(ws, headerCount) {
  const dataRows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 3) return;
    const values = new Array(headerCount).fill(null);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= headerCount) values[colNumber - 1] = cell.value;
    });
    if (values.every((v) => v == null || str(v) === "")) return;
    dataRows.push(values);
  });
  return dataRows;
}

function groupRows(rows, headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const key = str(h);
    if (key) idx[key] = i;
  });
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

/** Consecutive option1_name… option2_name…; optional empty stops */
function countParentOptionNames(parentRow, get, maxScan = 40) {
  let n = 0;
  for (let i = 1; i <= maxScan; i++) {
    const name = get(parentRow, `option${i}_name`);
    if (name && String(name).trim()) n = i;
    else break;
  }
  return n;
}

function buildVariationGroups(parentRow, childRows, get, optCount) {
  const groups = [];
  for (let n = 1; n <= optCount; n++) {
    const name = str(get(parentRow, `option${n}_name`));
    if (!name) continue;
    const valMap = {};
    for (const cRow of childRows || []) {
      const cv = (k) => get(cRow, k);
      const val = str(cv(`option${n}_value`));
      if (!val) continue;
      if (!valMap[val]) valMap[val] = {};
      if (n === 1) {
        const sw = str(cv("swatch_image_url"));
        if (sw) valMap[val].swatch_image = sw;
      }
    }
    if (Object.keys(valMap).length) {
      groups.push({
        name,
        options: Object.entries(valMap).map(([value, meta]) => ({
          value,
          ...(meta.swatch_image ? { swatch_image: meta.swatch_image } : {}),
        })),
      });
    }
  }
  return groups;
}

function collectMetafields(parentRow, headers, idx) {
  const byN = new Map();
  for (const h of headers) {
    const key = str(h);
    const m = key.match(/^metafield_(\d+)_(key|value)$/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!byN.has(n)) byN.set(n, {});
    const col = idx[key];
    if (col === undefined) continue;
    const raw = parentRow[col];
    const val = raw == null ? "" : String(raw).trim();
    byN.get(n)[m[2]] = val;
  }
  const out = [];
  const nums = [...byN.keys()].sort((a, b) => a - b);
  for (const n of nums) {
    const p = byN.get(n);
    const k = (p.key || "").trim();
    const v = (p.value || "").trim();
    if (k) out.push({ key: k, value: v });
  }
  return out.length ? out : undefined;
}

function computeParentPresent(parentRow, idx) {
  const kp = (k) => keyPresent(parentRow, k, idx);
  const translations = {};
  for (const lang of LANGS) {
    translations[lang] = {
      title: kp(`title_${lang}`),
      description: kp(`description_${lang}`),
      bullet1: kp(`bullet1_${lang}`),
      bullet2: kp(`bullet2_${lang}`),
      bullet3: kp(`bullet3_${lang}`),
    };
  }
  const prices = {};
  for (const c of COUNTRIES) {
    prices[c] = kp(`price_brutto_${c}`) || kp(`price_uvp_${c}`) || kp(`price_sale_${c}`);
  }
  const imageSlot = {};
  for (let n = 1; n <= 5; n++) imageSlot[n] = kp(`image_url_${n}`);
  let hasOptionNames = false;
  for (let n = 1; n <= 40; n++) {
    if (kp(`option${n}_name`)) {
      hasOptionNames = true;
      break;
    }
  }
  let metafieldTouched = false;
  for (const h of Object.keys(idx)) {
    if (/^metafield_\d+_(key|value)$/i.test(h) && keyPresent(parentRow, h, idx)) {
      metafieldTouched = true;
      break;
    }
  }
  return {
    anyTitle: LANGS.some((l) => translations[l].title),
    anyDesc: LANGS.some((l) => translations[l].description),
    translations,
    prices,
    imageSlot,
    status: kp("status"),
    brand: kp("brand"),
    category_slug: kp("category_slug"),
    shipping_group: kp("shipping_group"),
    type: kp("type"),
    ean: kp("ean"),
    weight_grams: kp("weight_grams"),
    dim_length: kp("dim_length_cm"),
    dim_width: kp("dim_width_cm"),
    dim_height: kp("dim_height_cm"),
    unit_type: kp("unit_type"),
    unit_value: kp("unit_value"),
    seo_title: kp("seo_title"),
    seo_description: kp("seo_description"),
    seo_keywords: kp("seo_keywords"),
    hasOptionNames,
    metafieldTouched,
  };
}

function computeChildPresent(childRow, idx) {
  const kp = (k) => keyPresent(childRow, k, idx);
  const opts = {};
  for (let n = 1; n <= 40; n++) opts[n] = kp(`option${n}_value`);
  return {
    ean: kp("ean"),
    inventory: kp("inventory"),
    image1: kp("image_url_1"),
    opts,
  };
}

function normalizeVariants(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => ({ ...x }));
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map((x) => ({ ...x })) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cloneDeep(x) {
  if (x == null) return x;
  try {
    return JSON.parse(JSON.stringify(x));
  } catch {
    return x;
  }
}

function mergeVariantArrays(existingVariants, incomingVariants, childRows, idx, get, parentRow) {
  const optCount = countParentOptionNames(parentRow, (key) => get(parentRow, key));
  const bySku = new Map();
  for (const v of existingVariants || []) {
    const k = str(v?.sku);
    if (k) bySku.set(k, { ...v });
  }
  for (let i = 0; i < (incomingVariants || []).length; i++) {
    const inv = incomingVariants[i];
    const row = childRows[i];
    if (!inv || !row) continue;
    const sk = str(inv.sku);
    if (!sk) continue;
    const pres = computeChildPresent(row, idx);
    const cur = bySku.get(sk);
    if (!cur || !cur.sku) {
      bySku.set(sk, { ...inv });
      continue;
    }
    const out = { ...cur };
    if (pres.ean) out.ean = inv.ean;
    if (pres.inventory) out.inventory = inv.inventory ?? 0;
    if (pres.image1) out.image_urls = inv.image_urls ?? out.image_urls;
    const touchedOpts = Object.entries(pres.opts).filter(([, on]) => on).map(([n]) => parseInt(n, 10));
    if (touchedOpts.length) {
      const nextOv = [...(Array.isArray(out.option_values) ? out.option_values : [])];
      for (const n of touchedOpts) {
        const val = str(get(row, `option${n}_value`));
        if (val) {
          while (nextOv.length < n) nextOv.push(undefined);
          nextOv[n - 1] = val;
        }
      }
      while (nextOv.length && nextOv[nextOv.length - 1] == null) nextOv.pop();
      out.option_values = nextOv.length ? nextOv : out.option_values;
    }
    bySku.set(sk, out);
  }
  return [...bySku.values()];
}

/** Merge Excel row into existing product: only columns filled in the sheet overwrite DB fields */
function mergeImportIntoExisting(existing, payload, parentPresent, parentRow, childRows, idx, get) {
  const G = (key) => get(parentRow, key);
  const out = {
    title: existing.title || "",
    description: existing.description ?? null,
    status: existing.status || "draft",
    sku: existing.sku,
    metadata: cloneDeep(existing.metadata) || {},
    variants: normalizeVariants(existing.variants),
  };

  if (parentPresent.anyTitle) {
    const te = str(payload.title);
    if (te) out.title = te;
  }
  if (parentPresent.anyDesc) {
    const d = payload.description;
    if (d != null && str(d) !== "") out.description = String(d);
  }
  if (parentPresent.status) {
    const s = G("status");
    if (s) out.status = s;
  }

  const m = out.metadata;
  const pm = payload.metadata || {};

  m.translations = m.translations && typeof m.translations === "object" ? cloneDeep(m.translations) : {};
  for (const lang of LANGS) {
    const tp = parentPresent.translations[lang];
    if (!tp || !Object.values(tp).some(Boolean)) continue;
    const prev = { ...(m.translations[lang] || {}) };
    if (tp.title) {
      const t = G(`title_${lang}`);
      if (t) prev.title = t;
    }
    if (tp.description) {
      const d = G(`description_${lang}`);
      if (d) prev.description = d;
    }
    if (tp.bullet1 || tp.bullet2 || tp.bullet3) {
      const next = Array.isArray(prev.bullet_points) ? [...prev.bullet_points] : [];
      if (tp.bullet1) next[0] = G(`bullet1_${lang}`);
      if (tp.bullet2) next[1] = G(`bullet2_${lang}`);
      if (tp.bullet3) next[2] = G(`bullet3_${lang}`);
      while (next.length && str(next[next.length - 1]) === "") next.pop();
      prev.bullet_points = next.length ? next : undefined;
    }
    m.translations[lang] = prev;
  }

  m.prices = m.prices && typeof m.prices === "object" ? { ...m.prices } : {};
  for (const c of COUNTRIES) {
    if (!parentPresent.prices[c]) continue;
    m.prices[c] = { ...(m.prices[c] || {}), ...(pm.prices?.[c] || {}) };
  }
  if (!Object.keys(m.prices).length) delete m.prices;

  const anyImgSlot = Object.values(parentPresent.imageSlot).some(Boolean);
  if (anyImgSlot) {
    const base = Array.isArray(m.media)
      ? m.media.map((x) => (typeof x === "string" ? str(x) : str(x?.url))).filter((x) => x)
      : [];
    let maxI = base.length;
    for (let n = 1; n <= 5; n++) {
      if (parentPresent.imageSlot[n] && str(G(`image_url_${n}`))) maxI = Math.max(maxI, n);
    }
    const next = [];
    for (let i = 1; i <= maxI; i++) {
      if (parentPresent.imageSlot[i]) {
        const url = G(`image_url_${i}`);
        if (str(url)) next.push(str(url));
        else if (i <= base.length && base[i - 1]) next.push(base[i - 1]);
      } else if (i <= base.length && base[i - 1]) {
        next.push(base[i - 1]);
      }
    }
    if (next.length) m.media = next;
  }

  if (parentPresent.hasOptionNames && pm.variation_groups?.length) m.variation_groups = pm.variation_groups;

  if (parentPresent.seo_title && pm.seo_meta_title) m.seo_meta_title = pm.seo_meta_title;
  if (parentPresent.seo_description && pm.seo_meta_description) m.seo_meta_description = pm.seo_meta_description;
  if (parentPresent.seo_keywords && pm.seo_keywords) m.seo_keywords = pm.seo_keywords;

  if (parentPresent.ean && pm.ean) m.ean = pm.ean;
  if (parentPresent.weight_grams && pm.weight_grams != null) m.weight_grams = pm.weight_grams;
  if (parentPresent.dim_length && pm.dimensions_length != null) m.dimensions_length = pm.dimensions_length;
  if (parentPresent.dim_width && pm.dimensions_width != null) m.dimensions_width = pm.dimensions_width;
  if (parentPresent.dim_height && pm.dimensions_height != null) m.dimensions_height = pm.dimensions_height;
  if (parentPresent.unit_type && pm.unit_type) m.unit_type = pm.unit_type;
  if (parentPresent.unit_value && pm.unit_value != null) m.unit_value = pm.unit_value;

  if (parentPresent.brand && pm.brand_id) m.brand_id = pm.brand_id;
  if (parentPresent.category_slug) {
    if (pm.category_id) m.category_id = pm.category_id;
    if (pm.category_slug) m.category_slug = pm.category_slug;
  }
  if (parentPresent.shipping_group && pm.shipping_group_id) m.shipping_group_id = pm.shipping_group_id;
  if (parentPresent.type && pm.type) m.type = pm.type;

  if (parentPresent.metafieldTouched && Array.isArray(pm.metafields)) {
    const arr = Array.isArray(m.metafields) ? [...m.metafields] : [];
    for (const pair of pm.metafields) {
      if (!pair?.key || !str(pair.value)) continue;
      const j = arr.findIndex((x) => x && x.key === pair.key);
      if (j >= 0) arr[j] = { ...arr[j], ...pair };
      else arr.push({ ...pair });
    }
    m.metafields = arr;
  }

  const hasChildRows = childRows && childRows.length > 0;
  if (hasChildRows && Array.isArray(payload.variants) && payload.variants.length) {
    out.variants = mergeVariantArrays(out.variants, payload.variants, childRows, idx, get, parentRow);
  }

  return out;
}

function buildProductPayload(parentRow, childRows, headers, idx, get, lookups) {
  const G = (key) => get(parentRow, key);
  const { slugToId, brandByLowerName, shipByLowerName } = lookups;

  const translations = {};
  for (const lang of LANGS) {
    const title = G(`title_${lang}`);
    const desc = G(`description_${lang}`);
    const b1 = G(`bullet1_${lang}`);
    const b2 = G(`bullet2_${lang}`);
    const b3 = G(`bullet3_${lang}`);
    if (!title && !desc && !b1 && !b2 && !b3) continue;
    translations[lang] = {};
    if (title) translations[lang].title = title;
    if (desc) translations[lang].description = desc;
    const bullets = [];
    if (b1) bullets.push(b1);
    if (b2) bullets.push(b2);
    if (b3) bullets.push(b3);
    if (bullets.length) translations[lang].bullet_points = bullets;
  }

  const prices = {};
  for (const country of COUNTRIES) {
    const brutto = parseCents(G(`price_brutto_${country}`));
    const uvp = parseCents(G(`price_uvp_${country}`));
    const sale = parseCents(G(`price_sale_${country}`));
    if (brutto == null && uvp == null && sale == null) continue;
    prices[country] = {};
    if (brutto != null) prices[country].brutto_cents = brutto;
    if (uvp != null) prices[country].uvp_cents = uvp;
    if (sale != null) prices[country].sale_cents = sale;
  }

  const media = [1, 2, 3, 4, 5].map((n) => G(`image_url_${n}`)).filter(Boolean);

  const optCount = countParentOptionNames(parentRow, get);
  const variationGroups = buildVariationGroups(parentRow, childRows, get, optCount);

  const variants = [];
  for (const cRow of childRows || []) {
    const cGet = (key) => get(cRow, key);
    const option_values = [];
    for (let n = 1; n <= optCount; n++) {
      const v = str(cGet(`option${n}_value`));
      if (v) option_values.push(v);
    }
    variants.push({
      sku: cGet("sku") || undefined,
      ean: cGet("ean") || undefined,
      inventory: parseNum(cGet("inventory")) ?? 0,
      option_values: option_values.length ? option_values : undefined,
      image_urls: cGet("image_url_1") ? { de: cGet("image_url_1") } : undefined,
    });
  }

  const metafields = collectMetafields(parentRow, headers, idx);

  const meta = {
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
    seo_meta_title: G("seo_title") || undefined,
    seo_meta_description: G("seo_description") || undefined,
    seo_keywords: G("seo_keywords") || undefined,
    ...(metafields ? { metafields } : {}),
  };

  const payload = {
    title: G("title_de") || G("title_en"),
    description: G("description_de") || G("description_en") || undefined,
    status: G("status") || "draft",
    sku: G("sku") || undefined,
    metadata: meta,
    variants: variants.length ? variants : undefined,
  };

  const brandName = G("brand");
  if (brandName) {
    const b = brandByLowerName.get(brandName.toLowerCase());
    if (!b) {
      return { error: `Unbekannte Marke (nicht im System): "${brandName}"` };
    }
    payload.metadata.brand_id = b.id;
  }

  const catSlug = G("category_slug");
  if (catSlug) {
    const id = slugToId.get(catSlug.toLowerCase());
    if (!id) {
      return { error: `Unbekannte Kategorie (slug): "${catSlug}"` };
    }
    payload.metadata.category_id = id;
    payload.metadata.category_slug = catSlug;
  }

  const shipN = G("shipping_group");
  if (shipN) {
    const g = shipByLowerName.get(shipN.toLowerCase());
    if (!g) {
      return { error: `Unbekannte Versandgruppe: "${shipN}"` };
    }
    payload.metadata.shipping_group_id = g.id;
  }

  const type = G("type");
  if (type) payload.metadata.type = type;

  return { payload };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sellerToken = formData.get("sellerToken") || "";
    const backendUrl = getBackendBase();

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const ws = wb.getWorksheet("Products") || wb.worksheets[0];
    if (!ws) return Response.json({ error: "Sheet 'Products' not found" }, { status: 400 });

    const headerRow = ws.getRow(2);
    const headers = [];
    let maxCol = 0;
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      maxCol = Math.max(maxCol, colNumber);
    });
    for (let c = 1; c <= maxCol; c++) {
      const cell = headerRow.getCell(c);
      headers.push(str(cell.value));
    }

    const dataRows = normalizeDataRows(ws, headers.length);

    if (dataRows.length === 0) {
      return Response.json({ error: "No data rows found (rows must start from row 4)" }, { status: 400 });
    }

    const { parents, children, idx, get } = groupRows(dataRows, headers);

    if (parents.size === 0) {
      return Response.json({ error: "No parent rows found. Add rows with product_type='parent'." }, { status: 400 });
    }

    const lookups = await loadImportLookups(backendUrl, sellerToken);

    const results = { created: 0, updated: 0, failed: 0, errors: [] };
    const authHeaders = sellerToken ? { Authorization: `Bearer ${sellerToken}` } : {};

    for (const [sku, parentRow] of parents) {
      const childRows = children.get(sku) || [];
      const built = buildProductPayload(parentRow, childRows, headers, idx, get, lookups);
      if (built.error) {
        results.failed++;
        results.errors.push({ sku, error: built.error });
        continue;
      }
      const { payload } = built;
      const parentPresent = computeParentPresent(parentRow, idx);

      let existingProduct = null;
      try {
        const listUrl = `${backendUrl}/admin-hub/products?sku=${encodeURIComponent(sku)}&limit=10`;
        const lr = await fetch(listUrl, { headers: { "Content-Type": "application/json", ...authHeaders, cache: "no-store" } });
        if (lr.ok) {
          const lj = await lr.json();
          const rows = lj.products || [];
          existingProduct = rows.find((p) => str(p.sku).toLowerCase() === str(sku).toLowerCase()) || null;
        }
      } catch (_) {}

      if (existingProduct?.id) {
        try {
          const body = mergeImportIntoExisting(existingProduct, payload, parentPresent, parentRow, childRows, idx, get);
          const res = await fetch(`${backendUrl}/admin-hub/products/${existingProduct.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            results.failed++;
            results.errors.push({ sku, error: err?.message || `HTTP ${res.status}` });
          } else {
            results.updated++;
          }
        } catch (e) {
          results.failed++;
          results.errors.push({ sku, error: e.message });
        }
        continue;
      }

      if (!payload.title) {
        results.failed++;
        results.errors.push({ sku, error: "Missing title_de (or title_en)" });
        continue;
      }

      try {
        const res = await fetch(`${backendUrl}/admin-hub/products`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
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
      updated: results.updated,
      failed: results.failed,
      errors: results.errors,
    });
  } catch (e) {
    console.error("Import error:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
