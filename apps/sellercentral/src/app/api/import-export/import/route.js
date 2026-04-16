import ExcelJS from "exceljs";

const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const COUNTRIES = ["DE", "FR", "IT", "ES", "TR"];
const DEFAULT_BACKEND = "https://belucha-medusa-backend.onrender.com";

function computeUnitReference(unitTypeRaw) {
  const unitType = String(unitTypeRaw || "").trim().toLowerCase();
  // For "grundpreis" UI we want a normalized base:
  // - grams: show per 1000 g
  // - milliliters: show per 1000 ml
  // - kilograms / liters / pieces: show per 1 unit
  if (unitType === "g" || unitType === "ml") return 1000;
  if (unitType === "kg" || unitType === "l" || unitType === "stück" || unitType === "piece") return 1;
  return 1;
}

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
  const n = Number(String(val).replace(",", "."));
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
    if (!key) return;
    idx[key] = i;
    if (key === "manufacturer") idx.hersteller = i;
    if (key === "manufacturer_information") idx.hersteller_information = i;
    if (key === "responsible_person_information") idx.verantwortliche_person_information = i;
    // Excel template input uses `per_unit`; internally we store it as `unit_reference`.
    if (key === "per_unit") idx.unit_reference = i;
    const m = key.match(/^variation(\d+)_(name|value)$/i);
    if (m) {
      // Backward/forward compatibility: template may expose variationN_* labels,
      // importer internally uses optionN_* keys.
      idx[`option${m[1]}_${m[2]}`] = i;
    }
  });
  const get = (row, key) => str(row[idx[key]] ?? "");

  const parents = new Map();
  const children = new Map();
  const errors = [];

  for (const row of rows) {
    const type = get(row, "product_type").toLowerCase();
    const sku = get(row, "sku");
    if (!sku || sku.startsWith("#")) continue;

    if (type === "parent") {
      if (parents.has(sku)) {
        errors.push({ sku, error: `Duplicate parent SKU in Excel: "${sku}"` });
        continue;
      }
      parents.set(sku, row);
    } else if (type === "child") {
      const pSku = get(row, "parent_sku");
      if (!pSku) continue;
      if (!children.has(pSku)) children.set(pSku, []);
      children.get(pSku).push(row);
    }
  }
  for (const [pSku, childRows] of children.entries()) {
    if (!parents.has(pSku)) {
      for (const cRow of childRows) {
        const cSku = get(cRow, "sku");
        errors.push({
          sku: cSku || pSku,
          error: `Child row references unknown parent_sku "${pSku}"`,
        });
      }
    }
  }
  return { parents, children, idx, get, errors };
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
  const sharedTitle = kp("title");
  const sharedDescription = kp("description");
  const sharedBullets = [kp("bullet1"), kp("bullet2"), kp("bullet3"), kp("bullet4"), kp("bullet5")];
  const translations = {};
  for (const lang of LANGS) {
    translations[lang] = {
      title: kp(`title_${lang}`) || sharedTitle,
      description: kp(`description_${lang}`) || sharedDescription,
      bullet1: kp(`bullet1_${lang}`) || sharedBullets[0],
      bullet2: kp(`bullet2_${lang}`) || sharedBullets[1],
      bullet3: kp(`bullet3_${lang}`) || sharedBullets[2],
      bullet4: kp(`bullet4_${lang}`) || sharedBullets[3],
      bullet5: kp(`bullet5_${lang}`) || sharedBullets[4],
      seo_title: kp(`seo_title_${lang}`),
      seo_description: kp(`seo_description_${lang}`),
      seo_keywords: kp(`seo_keywords_${lang}`),
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
    hersteller: kp("hersteller"),
    hersteller_information: kp("hersteller_information"),
    verantwortliche_person_information: kp("verantwortliche_person_information"),
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
  const sharedTitle = kp("title");
  const sharedDescription = kp("description");
  const sharedBullets = [kp("bullet1"), kp("bullet2"), kp("bullet3"), kp("bullet4"), kp("bullet5")];
  const opts = {};
  for (let n = 1; n <= 40; n++) opts[n] = kp(`option${n}_value`);
  const translations = {};
  for (const lang of LANGS) {
    translations[lang] = {
      title: kp(`title_${lang}`) || sharedTitle,
      description: kp(`description_${lang}`) || sharedDescription,
      bullet1: kp(`bullet1_${lang}`) || sharedBullets[0],
      bullet2: kp(`bullet2_${lang}`) || sharedBullets[1],
      bullet3: kp(`bullet3_${lang}`) || sharedBullets[2],
      bullet4: kp(`bullet4_${lang}`) || sharedBullets[3],
      bullet5: kp(`bullet5_${lang}`) || sharedBullets[4],
    };
  }
  const seo = {};
  for (const lang of LANGS) {
    seo[lang] = {
      title: kp(`seo_title_${lang}`),
      description: kp(`seo_description_${lang}`),
      keywords: kp(`seo_keywords_${lang}`),
    };
  }
  let variantMetafieldTouched = false;
  for (const h of Object.keys(idx)) {
    if (/^variant_metafield_\d+_(key|value)$/i.test(h) && keyPresent(childRow, h, idx)) {
      variantMetafieldTouched = true;
      break;
    }
  }
  return {
    ean: kp("ean"),
    inventory: kp("inventory"),
    imageSlot: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, kp(`image_url_${n}`)])),
    translations,
    brand: kp("brand"),
    category_slug: kp("category_slug"),
    shipping_group: kp("shipping_group"),
    type: kp("type"),
    weight_grams: kp("weight_grams"),
    dim_length: kp("dim_length_cm"),
    dim_width: kp("dim_width_cm"),
    dim_height: kp("dim_height_cm"),
    unit_type: kp("unit_type"),
    unit_value: kp("unit_value"),
    unit_reference: kp("unit_reference"),
    prices: Object.fromEntries(COUNTRIES.map((c) => [c, kp(`price_brutto_${c}`) || kp(`price_uvp_${c}`) || kp(`price_sale_${c}`)])),
    seo,
    variantMetafieldTouched,
    opts,
  };
}

function collectVariantMetafields(row, headers, idx) {
  const byN = new Map();
  for (const h of headers) {
    const key = str(h);
    const m = key.match(/^variant_metafield_(\d+)_(key|value)$/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!byN.has(n)) byN.set(n, {});
    const col = idx[key];
    if (col === undefined) continue;
    const raw = row[col];
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

function collectImageSlotsFromRow(row, idx) {
  const out = {};
  for (let n = 1; n <= 5; n++) {
    const col = idx[`image_url_${n}`];
    if (col === undefined) continue;
    const v = str(row[col]);
    if (v) out[n] = v;
  }
  return out;
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
    if (Object.values(pres.imageSlot || {}).some(Boolean)) {
      if (inv.image_url) out.image_url = inv.image_url;
      if (inv.image_urls) out.image_urls = inv.image_urls;
      const invMedia = Array.isArray(inv.metadata?.media) ? inv.metadata.media : [];
      if (invMedia.length) {
        const md = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
        md.media = invMedia;
        out.metadata = md;
      }
    }
    const commonTouched =
      pres.brand || pres.category_slug || pres.shipping_group || pres.type ||
      pres.weight_grams || pres.dim_length || pres.dim_width || pres.dim_height ||
      pres.unit_type || pres.unit_value || pres.unit_reference || Object.values(pres.prices || {}).some(Boolean);
    if (commonTouched) {
      const md = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
      const invMd = inv.metadata && typeof inv.metadata === "object" ? inv.metadata : {};
      if (pres.brand && invMd.brand_id) md.brand_id = invMd.brand_id;
      if (pres.category_slug && invMd.category_id) md.category_id = invMd.category_id;
      if (pres.category_slug && invMd.category_slug) md.category_slug = invMd.category_slug;
      if (pres.shipping_group && invMd.shipping_group_id) md.shipping_group_id = invMd.shipping_group_id;
      if (pres.type && invMd.type) md.type = invMd.type;
      if (pres.weight_grams && invMd.weight_grams != null) md.weight_grams = invMd.weight_grams;
      if (pres.dim_length && invMd.dimensions_length != null) md.dimensions_length = invMd.dimensions_length;
      if (pres.dim_width && invMd.dimensions_width != null) md.dimensions_width = invMd.dimensions_width;
      if (pres.dim_height && invMd.dimensions_height != null) md.dimensions_height = invMd.dimensions_height;
      if (pres.unit_type && invMd.unit_type) md.unit_type = invMd.unit_type;
      if (pres.unit_value && invMd.unit_value != null) md.unit_value = invMd.unit_value;
      if (pres.unit_reference && invMd.unit_reference != null) md.unit_reference = invMd.unit_reference;
      if (invMd.prices && typeof invMd.prices === "object") {
        md.prices = md.prices && typeof md.prices === "object" ? { ...md.prices } : {};
        for (const c of COUNTRIES) {
          if (!pres.prices?.[c]) continue;
          md.prices[c] = { ...(md.prices[c] || {}), ...(invMd.prices[c] || {}) };
        }
      }
      out.metadata = md;
    }
    const seoTouched = LANGS.some((lang) => Object.values(pres.seo?.[lang] || {}).some(Boolean));
    if (seoTouched) {
      const md = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
      const tr = md.translations && typeof md.translations === "object" ? { ...md.translations } : {};
      const invTr = inv.metadata?.translations && typeof inv.metadata.translations === "object" ? inv.metadata.translations : {};
      for (const lang of LANGS) {
        const s = pres.seo[lang] || {};
        if (!Object.values(s).some(Boolean)) continue;
        const prev = { ...(tr[lang] || {}) };
        const src = invTr[lang] || {};
        if (s.title) prev.seo_title = src.seo_title;
        if (s.description) prev.seo_description = src.seo_description;
        if (s.keywords) prev.seo_keywords = src.seo_keywords;
        tr[lang] = prev;
      }
      md.translations = tr;
      // Bridge German SEO to top-level variant metadata (VariantEditPage reads vm.seo_meta_title etc.)
      if (tr.de?.seo_title) md.seo_meta_title = tr.de.seo_title;
      if (tr.de?.seo_description) md.seo_meta_description = tr.de.seo_description;
      if (tr.de?.seo_keywords) md.seo_keywords = tr.de.seo_keywords;
      out.metadata = md;
    }
    const trTouched = LANGS.some((lang) => Object.values(pres.translations?.[lang] || {}).some(Boolean));
    if (trTouched) {
      const md = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
      const tr = md.translations && typeof md.translations === "object" ? { ...md.translations } : {};
      const invTr = inv.metadata?.translations && typeof inv.metadata.translations === "object" ? inv.metadata.translations : {};
      for (const lang of LANGS) {
        const s = pres.translations?.[lang] || {};
        if (!Object.values(s).some(Boolean)) continue;
        const prev = { ...(tr[lang] || {}) };
        const src = invTr[lang] || {};
        if (s.title) prev.title = src.title;
        if (s.description) prev.description = src.description;
        if (s.bullet1 || s.bullet2 || s.bullet3 || s.bullet4 || s.bullet5) {
          const next = Array.isArray(prev.bullet_points) ? [...prev.bullet_points] : [];
          if (s.bullet1) next[0] = src.bullet_points?.[0] || "";
          if (s.bullet2) next[1] = src.bullet_points?.[1] || "";
          if (s.bullet3) next[2] = src.bullet_points?.[2] || "";
          if (s.bullet4) next[3] = src.bullet_points?.[3] || "";
          if (s.bullet5) next[4] = src.bullet_points?.[4] || "";
          while (next.length && str(next[next.length - 1]) === "") next.pop();
          if (next.length) prev.bullet_points = next;
        }
        tr[lang] = prev;
      }
      md.translations = tr;
      // Bridge German translation fields to top-level variant metadata (VariantEditPage reads
      // v.metadata.description and v.metadata.bullet_points for the DE locale)
      if (tr.de?.description != null && tr.de.description !== "") md.description = tr.de.description;
      if (Array.isArray(tr.de?.bullet_points) && tr.de.bullet_points.length) md.bullet_points = tr.de.bullet_points;
      out.metadata = md;
      if (tr.de?.title) out.title = tr.de.title;
      if (tr.de?.description) out.description = tr.de.description;
    }
    if (pres.variantMetafieldTouched) {
      const md = out.metadata && typeof out.metadata === "object" ? { ...out.metadata } : {};
      const incomingMf = Array.isArray(inv.metadata?.metafields) ? inv.metadata.metafields : [];
      if (incomingMf.length) {
        const arr = Array.isArray(md.metafields) ? [...md.metafields] : [];
        for (const pair of incomingMf) {
          if (!pair?.key || !str(pair.value)) continue;
          const j = arr.findIndex((x) => x && x.key === pair.key);
          if (j >= 0) arr[j] = { ...arr[j], ...pair };
          else arr.push({ ...pair });
        }
        md.metafields = arr;
      }
      out.metadata = md;
    }
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
    // If any price column is touched in Excel, update whatever price fields exist
    // in the incoming variant. This allows UVP-only updates where `price_cents`
    // is null but `compare_at_price_cents` is present.
    if (Object.values(pres.prices || {}).some(Boolean)) {
      if (inv.price_cents != null) out.price_cents = inv.price_cents;
      if (inv.compare_at_price_cents != null) out.compare_at_price_cents = inv.compare_at_price_cents;
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
      const t = G(`title_${lang}`) || G("title");
      if (t) prev.title = t;
    }
    if (tp.description) {
      const d = G(`description_${lang}`) || G("description");
      if (d) prev.description = d;
    }
    if (tp.bullet1 || tp.bullet2 || tp.bullet3 || tp.bullet4 || tp.bullet5) {
      const next = Array.isArray(prev.bullet_points) ? [...prev.bullet_points] : [];
      if (tp.bullet1) next[0] = G(`bullet1_${lang}`) || G("bullet1");
      if (tp.bullet2) next[1] = G(`bullet2_${lang}`) || G("bullet2");
      if (tp.bullet3) next[2] = G(`bullet3_${lang}`) || G("bullet3");
      if (tp.bullet4) next[3] = G(`bullet4_${lang}`) || G("bullet4");
      if (tp.bullet5) next[4] = G(`bullet5_${lang}`) || G("bullet5");
      while (next.length && str(next[next.length - 1]) === "") next.pop();
      prev.bullet_points = next.length ? next : undefined;
    }
    if (tp.seo_title) {
      const v = G(`seo_title_${lang}`);
      if (v) prev.seo_title = v;
    }
    if (tp.seo_description) {
      const v = G(`seo_description_${lang}`);
      if (v) prev.seo_description = v;
    }
    if (tp.seo_keywords) {
      const v = G(`seo_keywords_${lang}`);
      if (v) prev.seo_keywords = v;
    }
    m.translations[lang] = prev;
  }

  // Bridge DE SEO translations into top-level meta fields.
  // ProductEditPage reads `metadata.seo_meta_*`, not `metadata.translations[de].seo_*`.
  const deTr = m.translations?.de;
  if (deTr?.seo_title) m.seo_meta_title = deTr.seo_title;
  if (deTr?.seo_description) m.seo_meta_description = deTr.seo_description;
  if (deTr?.seo_keywords) m.seo_keywords = deTr.seo_keywords;

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
  if (parentPresent.unit_type && pm.unit_reference != null) m.unit_reference = pm.unit_reference;

  if (parentPresent.brand && pm.brand_id) m.brand_id = pm.brand_id;
  if (parentPresent.category_slug) {
    if (pm.category_id) m.category_id = pm.category_id;
    if (pm.category_slug) m.category_slug = pm.category_slug;
  }
  if (parentPresent.shipping_group && pm.shipping_group_id) m.shipping_group_id = pm.shipping_group_id;
  if (parentPresent.hersteller && pm.hersteller) m.hersteller = pm.hersteller;
  if (parentPresent.hersteller_information && pm.hersteller_information) m.hersteller_information = pm.hersteller_information;
  if (parentPresent.verantwortliche_person_information && pm.verantwortliche_person_information) {
    m.verantwortliche_person_information = pm.verantwortliche_person_information;
  }
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
  const sharedTitle = G("title");
  const sharedDesc = G("description");
  const sharedBullets = [G("bullet1"), G("bullet2"), G("bullet3"), G("bullet4"), G("bullet5")];
  for (const lang of LANGS) {
    const title = G(`title_${lang}`) || sharedTitle;
    const desc = G(`description_${lang}`) || sharedDesc;
    const b1 = G(`bullet1_${lang}`) || sharedBullets[0];
    const b2 = G(`bullet2_${lang}`) || sharedBullets[1];
    const b3 = G(`bullet3_${lang}`) || sharedBullets[2];
    const b4 = G(`bullet4_${lang}`) || sharedBullets[3];
    const b5 = G(`bullet5_${lang}`) || sharedBullets[4];
    const seoTitleLang = G(`seo_title_${lang}`);
    const seoDescLang = G(`seo_description_${lang}`);
    const seoKeywordsLang = G(`seo_keywords_${lang}`);
    if (!title && !desc && !b1 && !b2 && !b3 && !b4 && !b5 && !seoTitleLang && !seoDescLang && !seoKeywordsLang) continue;
    translations[lang] = {};
    if (title) translations[lang].title = title;
    if (desc) translations[lang].description = desc;
    const bullets = [];
    if (b1) bullets.push(b1);
    if (b2) bullets.push(b2);
    if (b3) bullets.push(b3);
    if (b4) bullets.push(b4);
    if (b5) bullets.push(b5);
    if (bullets.length) translations[lang].bullet_points = bullets;
    if (seoTitleLang) translations[lang].seo_title = seoTitleLang;
    if (seoDescLang) translations[lang].seo_description = seoDescLang;
    if (seoKeywordsLang) translations[lang].seo_keywords = seoKeywordsLang;
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
    const variantTranslations = {};
    for (const lang of LANGS) {
      const vTitle = cGet(`title_${lang}`) || cGet("title");
      const vDescription = cGet(`description_${lang}`) || cGet("description");
      const vb1 = cGet(`bullet1_${lang}`) || cGet("bullet1");
      const vb2 = cGet(`bullet2_${lang}`) || cGet("bullet2");
      const vb3 = cGet(`bullet3_${lang}`) || cGet("bullet3");
      const vb4 = cGet(`bullet4_${lang}`) || cGet("bullet4");
      const vb5 = cGet(`bullet5_${lang}`) || cGet("bullet5");
      const seoTitle = cGet(`seo_title_${lang}`);
      const seoDescription = cGet(`seo_description_${lang}`);
      const seoKeywords = cGet(`seo_keywords_${lang}`);
      if (!vTitle && !vDescription && !vb1 && !vb2 && !vb3 && !vb4 && !vb5 && !seoTitle && !seoDescription && !seoKeywords) continue;
      variantTranslations[lang] = {};
      if (vTitle) variantTranslations[lang].title = vTitle;
      if (vDescription) variantTranslations[lang].description = vDescription;
      const vBullets = [vb1, vb2, vb3, vb4, vb5].filter(Boolean);
      if (vBullets.length) variantTranslations[lang].bullet_points = vBullets;
      if (seoTitle) variantTranslations[lang].seo_title = seoTitle;
      if (seoDescription) variantTranslations[lang].seo_description = seoDescription;
      if (seoKeywords) variantTranslations[lang].seo_keywords = seoKeywords;
    }
    const variantMetafields = collectVariantMetafields(cRow, headers, idx);
    const variantMeta = {};
    if (Object.keys(variantTranslations).length) variantMeta.translations = variantTranslations;
    if (variantMetafields?.length) variantMeta.metafields = variantMetafields;
    // Bridge German translations to top-level variant metadata fields (VariantEditPage reads
    // v.metadata.description / bullet_points / seo_meta_title etc. for the DE locale)
    const deTrans = variantTranslations["de"];
    if (deTrans) {
      if (deTrans.description) variantMeta.description = deTrans.description;
      if (Array.isArray(deTrans.bullet_points) && deTrans.bullet_points.length) variantMeta.bullet_points = deTrans.bullet_points;
      if (deTrans.seo_title) variantMeta.seo_meta_title = deTrans.seo_title;
      if (deTrans.seo_description) variantMeta.seo_meta_description = deTrans.seo_description;
      if (deTrans.seo_keywords) variantMeta.seo_keywords = deTrans.seo_keywords;
    }
    const cImageSlots = collectImageSlotsFromRow(cRow, idx);
    const cImage = cImageSlots[1] || "";
    const cBrand = str(cGet("brand"));
    const cBrandRef = cBrand ? brandByLowerName.get(cBrand.toLowerCase()) : null;
    if (cBrand && !cBrandRef) {
      return { error: `Unbekannte Marke (child row): "${cBrand}"` };
    }
    const cCatSlug = str(cGet("category_slug"));
    const cCatId = cCatSlug ? slugToId.get(cCatSlug.toLowerCase()) : null;
    if (cCatSlug && !cCatId) {
      return { error: `Unbekannte Kategorie (child row): "${cCatSlug}"` };
    }
    const cShip = str(cGet("shipping_group"));
    const cShipRef = cShip ? shipByLowerName.get(cShip.toLowerCase()) : null;
    if (cShip && !cShipRef) {
      return { error: `Unbekannte Versandgruppe (child row): "${cShip}"` };
    }
    const cPrices = {};
    for (const country of COUNTRIES) {
      const brutto = parseCents(cGet(`price_brutto_${country}`));
      const uvp = parseCents(cGet(`price_uvp_${country}`));
      const sale = parseCents(cGet(`price_sale_${country}`));
      if (brutto == null && uvp == null && sale == null) continue;
      cPrices[country] = {};
      if (brutto != null) cPrices[country].brutto_cents = brutto;
      if (uvp != null) cPrices[country].uvp_cents = uvp;
      if (sale != null) cPrices[country].sale_cents = sale;
    }
    if (cBrandRef?.id) variantMeta.brand_id = cBrandRef.id;
    if (cCatId) variantMeta.category_id = cCatId;
    if (cCatSlug) variantMeta.category_slug = cCatSlug;
    if (cShipRef?.id) variantMeta.shipping_group_id = cShipRef.id;
    if (str(cGet("type"))) variantMeta.type = str(cGet("type"));
    if (parseNum(cGet("weight_grams")) != null) variantMeta.weight_grams = parseNum(cGet("weight_grams"));
    if (parseNum(cGet("dim_length_cm")) != null) variantMeta.dimensions_length = parseNum(cGet("dim_length_cm"));
    if (parseNum(cGet("dim_width_cm")) != null) variantMeta.dimensions_width = parseNum(cGet("dim_width_cm"));
    if (parseNum(cGet("dim_height_cm")) != null) variantMeta.dimensions_height = parseNum(cGet("dim_height_cm"));
    if (str(cGet("unit_type"))) variantMeta.unit_type = str(cGet("unit_type"));
    if (parseNum(cGet("unit_value")) != null) variantMeta.unit_value = parseNum(cGet("unit_value"));
    // In case the Excel child row doesn't include unit fields, inherit them from the parent row.
    if (!variantMeta.unit_type && str(G("unit_type"))) variantMeta.unit_type = str(G("unit_type"));
    if (variantMeta.unit_value == null && parseNum(G("unit_value")) != null) variantMeta.unit_value = parseNum(G("unit_value"));
    const childPerUnit = parseNum(cGet("per_unit") || cGet("unit_reference"));
    const parentPerUnit = parseNum(G("per_unit") || G("unit_reference"));
    if (variantMeta.unit_reference == null && childPerUnit != null) variantMeta.unit_reference = childPerUnit;
    if (variantMeta.unit_reference == null && parentPerUnit != null) variantMeta.unit_reference = parentPerUnit;
    if (variantMeta.unit_type && variantMeta.unit_reference == null) variantMeta.unit_reference = computeUnitReference(variantMeta.unit_type);
    if (Object.keys(cPrices).length) variantMeta.prices = cPrices;
    const cGallery = Object.values(cImageSlots).filter(Boolean);
    if (cGallery.length) variantMeta.media = cGallery;
    const deBrutto = parseCents(cGet("price_brutto_DE"));
    const deUvp = parseCents(cGet("price_uvp_DE"));
    variants.push({
      sku: cGet("sku") || undefined,
      ean: cGet("ean") || undefined,
      inventory: parseNum(cGet("inventory")) ?? 0,
      title: cGet("title_de") || cGet("title") || (option_values.length ? option_values.join(" / ") : undefined),
      description: cGet("description_de") || cGet("description") || undefined,
      option_values: option_values.length ? option_values : undefined,
      image_url: cImage || undefined,
      image_urls: cImage ? Object.fromEntries(LANGS.map((l) => [l, cImage])) : undefined,
      ...(deBrutto != null ? { price_cents: deBrutto, price: Number((deBrutto / 100).toFixed(2)) } : {}),
      ...(deUvp != null ? { compare_at_price_cents: deUvp } : {}),
      metadata: Object.keys(variantMeta).length ? variantMeta : undefined,
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
    unit_reference: (() => {
      const per = parseNum(G("per_unit") || G("unit_reference"));
      if (per != null) return per;
      const ut = G("unit_type");
      if (!ut) return undefined;
      return computeUnitReference(ut);
    })(),
    variation_groups: variationGroups.length ? variationGroups : undefined,
    // ProductEditPage reads top-level `metadata.seo_meta_*`.
    // Template/import uses `seo_title_{lang}` / `seo_description_{lang}` / `seo_keywords_{lang}` instead,
    // so we bridge DE values to the top-level fields.
    seo_meta_title: (translations.de?.seo_title || G("seo_title") || undefined),
    seo_meta_description: (translations.de?.seo_description || G("seo_description") || undefined),
    seo_keywords: (translations.de?.seo_keywords || G("seo_keywords") || undefined),
    hersteller: G("hersteller") || undefined,
    hersteller_information: G("hersteller_information") || undefined,
    verantwortliche_person_information: G("verantwortliche_person_information") || undefined,
    ...(metafields ? { metafields } : {}),
  };

  const firstTitle = G("title") || LANGS.map((lang) => G(`title_${lang}`)).find(Boolean);
  const firstDesc = G("description") || LANGS.map((lang) => G(`description_${lang}`)).find(Boolean);
  const payload = {
    title: firstTitle || undefined,
    description: firstDesc || undefined,
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

    const { parents, children, idx, get, errors: groupErrors } = groupRows(dataRows, headers);

    if (parents.size === 0) {
      return Response.json({ error: "No parent rows found. Add rows with product_type='parent'." }, { status: 400 });
    }
    if (groupErrors.length) {
      return Response.json({ error: "Excel validation failed", errors: groupErrors }, { status: 400 });
    }

    const lookups = await loadImportLookups(backendUrl, sellerToken);

    const results = { created: 0, updated: 0, failed: 0, errors: [] };
    const authHeaders = sellerToken ? { Authorization: `Bearer ${sellerToken}` } : {};
    const collectedImageUrls = new Set(); // all image URLs from this import batch

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
      // Collect image URLs from parent and child rows for media registration
      for (let n = 1; n <= 5; n++) {
        const u = get(parentRow, `image_url_${n}`);
        if (u && u.startsWith("http")) collectedImageUrls.add(u);
      }
      for (const cRow of children.get(sku) || []) {
        for (let n = 1; n <= 5; n++) {
          const u = get(cRow, `image_url_${n}`);
          if (u && u.startsWith("http")) collectedImageUrls.add(u);
        }
        const sw = get(cRow, "swatch_image_url");
        if (sw && sw.startsWith("http")) collectedImageUrls.add(sw);
      }

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
            // If full PUT failed due to GPSR validation but we have variant data, try variant-only PATCH
            // This allows updating variant translations for products that lack GPSR fields
            const isGpsrError = err?.message && String(err.message).toLowerCase().includes("gpsr");
            if (isGpsrError && Array.isArray(body.variants) && body.variants.length > 0) {
              try {
                const vRes = await fetch(`${backendUrl}/admin-hub/products/${existingProduct.id}/variants`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", ...authHeaders },
                  body: JSON.stringify({ variants: body.variants }),
                });
                if (vRes.ok) {
                  results.updated++;
                  results.errors.push({ sku, error: `Warnung: Varianten aktualisiert, aber GPSR-Felder fehlen noch: ${err.message}` });
                  continue;
                }
              } catch (_) {}
            }
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
        results.errors.push({ sku, error: "Missing title (or title_de/title_en)" });
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

    // Register collected image URLs in the seller's media library
    let mediaResult = null;
    if (collectedImageUrls.size > 0 && sellerToken) {
      try {
        const mr = await fetch(`${backendUrl}/admin-hub/v1/media/import-urls`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ urls: [...collectedImageUrls] }),
        });
        if (mr.ok) mediaResult = await mr.json();
      } catch (_) {}
    }

    return Response.json({
      ok: true,
      total: parents.size,
      created: results.created,
      updated: results.updated,
      failed: results.failed,
      errors: results.errors,
      media: mediaResult ? { registered: mediaResult.registered, skipped: mediaResult.skipped, folder: mediaResult.folder } : null,
    });
  } catch (e) {
    console.error("Import error:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
