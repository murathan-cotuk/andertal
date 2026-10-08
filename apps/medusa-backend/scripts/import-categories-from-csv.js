/**
 * Import categories from docs/AmazonCategories.csv (or a JSON file) into admin_hub_categories.
 * Does not require the backend to be running; connects to DB directly.
 *
 * Usage:
 *   node apps/medusa-backend/scripts/import-categories-from-csv.js
 *   node apps/medusa-backend/scripts/import-categories-from-csv.js path/to/categories.json
 *
 * CSV format: semicolon-separated, first row header. Each row: Main;Sub1;Sub2;...
 * JSON format: { "items": [ { "key": "x", "label": "X", "parentKey": "", "sortOrder": 0 } ] }
 *
 * Env: DATABASE_URL (default: postgres://postgres:postgres@localhost:5432/medusa)
 */
require("dotenv").config();
try {
  require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
} catch (_) {}

const { Client } = require("pg");
const path = require("path");
const fs = require("fs");

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/medusa";

const { slugFromCategoryName } = require("../src/category-excel-upsert-helpers");

function slugify(text) {
  // Leaf niche from segment/label — never the full path key.
  return slugFromCategoryName(text) || "category";
}

function parseCsvToItems(csvPath) {
  const content = fs.readFileSync(csvPath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const seen = new Set();
  const items = [];
  let sortOrder = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const segments = row.split(";").map((s) => s.trim()).filter(Boolean);
    let pathKey = "";
    for (const seg of segments) {
      const prevKey = pathKey;
      pathKey = pathKey ? pathKey + ";" + seg : seg;
      if (seen.has(pathKey)) continue;
      seen.add(pathKey);
      items.push({
        key: pathKey,
        label: seg,
        parentKey: prevKey,
        sortOrder: sortOrder++,
      });
    }
  }
  return items;
}

function loadJsonToItems(jsonPath) {
  const content = fs.readFileSync(jsonPath, "utf8");
  const data = JSON.parse(content);
  const arr = data.items || data.categories || [];
  return arr.map((item, i) => ({
    key: item.key || String(i),
    label: item.label || item.name || "",
    parentKey: item.parentKey ?? item.parent_key ?? "",
    sortOrder: item.sortOrder ?? item.sort_order ?? i,
  }));
}

async function main() {
  const inputPath = process.argv[2];
  const csvPath = path.join(__dirname, "..", "..", "..", "docs", "AmazonCategories.csv");
  const pathToUse = inputPath || csvPath;

  let items;
  if (!pathToUse || !fs.existsSync(pathToUse)) {
    console.error("File not found:", pathToUse);
    console.error("Usage: node import-categories-from-csv.js [path/to/file.csv or file.json]");
    process.exit(1);
  }

  const ext = path.extname(pathToUse).toLowerCase();
  if (ext === ".json") {
    items = loadJsonToItems(pathToUse);
  } else {
    items = parseCsvToItems(pathToUse);
  }

  if (items.length === 0) {
    console.log("No items to import.");
    process.exit(0);
  }

  console.log("Connecting to database...");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const idByKey = new Map();
  const slugCount = new Map();

  function uniqueSlug(baseSlug) {
    const n = slugCount.get(baseSlug) ?? 0;
    slugCount.set(baseSlug, n + 1);
    // First keeps base; collisions use -2, -3, ... (never path suffix)
    return n === 0 ? baseSlug : `${baseSlug}-${n + 1}`;
  }

  let inserted = 0;
  for (const item of items) {
    const baseSlug = slugify(item.label || item.key);
    const slug = uniqueSlug(baseSlug);
    const parentId = item.parentKey ? idByKey.get(item.parentKey) : null;

    const res = await client.query(
      `INSERT INTO admin_hub_categories (name, slug, parent_id, sort_order, active, is_visible, has_collection)
       VALUES ($1, $2, $3, $4, true, true, false)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order, updated_at = now()
       RETURNING id`,
      [item.label, slug, parentId, item.sortOrder]
    );
    const id = res.rows[0]?.id;
    if (id) {
      idByKey.set(item.key, id);
      inserted++;
    }
  }

  await client.end();
  console.log(`Done. Processed ${items.length} items, ${inserted} rows in admin_hub_categories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
