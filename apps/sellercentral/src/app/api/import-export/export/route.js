import ExcelJS from "exceljs";

const DEFAULT_BACKEND = "https://belucha-medusa-backend.onrender.com";

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

function flattenObject(obj, prefix = "", out = {}) {
  if (obj == null) return out;
  if (Array.isArray(obj)) {
    out[prefix] = obj.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    return out;
  }
  if (typeof obj !== "object") {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v == null) out[key] = "";
    else if (typeof v === "object" && !Array.isArray(v)) flattenObject(v, key, out);
    else if (Array.isArray(v)) out[key] = v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" | ");
    else out[key] = v;
  }
  return out;
}

function normalizeSellerKey(flat) {
  return (
    str(flat.seller_id) ||
    str(flat.seller) ||
    str(flat["metadata.seller_id"]) ||
    str(flat["metadata.seller"]) ||
    "platform_admin"
  );
}

function normalizeDateKey(flat) {
  return str(flat.created_at) || str(flat.date) || str(flat.updated_at) || "";
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
      const s = str(row.status).toLowerCase();
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
            const tt = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1;
            if (!Number.isNaN(tt) && t > tt) return false;
          }
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

async function fetchDataset(backendUrl, token, key) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const map = {
    products: { url: `${backendUrl}/admin-hub/products?limit=5000`, root: "products" },
    orders: { url: `${backendUrl}/admin-hub/v1/orders?limit=5000`, root: "orders" },
    customers: { url: `${backendUrl}/admin-hub/v1/customers?limit=5000`, root: "customers" },
    transactions: { url: `${backendUrl}/admin-hub/v1/transactions?limit=5000`, root: "transactions" },
    ranking: { url: `${backendUrl}/admin-hub/v1/ranking/products?limit=5000`, root: "products" },
  };
  const conf = map[key];
  if (!conf) return [];
  const data = await fetchJson(conf.url, { headers });
  const arr = Array.isArray(data?.[conf.root]) ? data[conf.root] : [];
  return arr.map((row) => ({ __dataset: key, ...flattenObject(row) }));
}

function collectColumns(rows) {
  const set = new Set();
  for (const row of rows) for (const k of Object.keys(row)) set.add(k);
  const base = ["__dataset", "id", "title", "sku", "status", "seller_id", "created_at", "updated_at"];
  const all = [...set];
  all.sort((a, b) => a.localeCompare(b));
  return [...base.filter((x) => set.has(x)), ...all.filter((x) => !base.includes(x))];
}

function pickColumns(rows, columns) {
  const cols = Array.isArray(columns) && columns.length ? columns : collectColumns(rows);
  return { cols, rows: rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]))) };
}

function toCsv(columns, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.join(",")];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c])).join(","));
  return lines.join("\n");
}

function toTxt(columns, rows) {
  const blocks = [];
  rows.forEach((row, i) => {
    blocks.push(`# ${i + 1}`);
    columns.forEach((c) => blocks.push(`${c}: ${row[c] ?? ""}`));
    blocks.push("");
  });
  return blocks.join("\n");
}

async function toXlsx(columns, rows, groupBySeller = false) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Belucha Sellercentral";
  const addSheet = (name, sheetRows) => {
    const ws = wb.addWorksheet(name.substring(0, 31));
    ws.addRow(columns);
    ws.getRow(1).font = { bold: true };
    for (const row of sheetRows) ws.addRow(columns.map((c) => row[c] ?? ""));
    ws.columns.forEach((col) => {
      col.width = Math.min(45, Math.max(14, String(col.header || "").length + 2));
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
    addSheet("export", rows);
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
    for (const ds of datasets) {
      const part = await fetchDataset(backendUrl, token, ds);
      rows.push(...part);
    }
    rows = applyFilters(rows, filters, { forcedSellerId });
    const availableColumns = collectColumns(rows);
    const selectedColumns = Array.isArray(body.columns) && body.columns.length ? body.columns : availableColumns;
    const picked = pickColumns(rows, selectedColumns);

    if (body.preview) {
      return Response.json({
        ok: true,
        is_superuser: isSuperuser,
        seller_id: ownSellerId || null,
        total: rows.length,
        columns: availableColumns,
      });
    }

    const format = str(body.format || "xlsx").toLowerCase();
    const fileBase = `belucha-export-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      const text = toCsv(picked.cols, picked.rows);
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
        },
      });
    }
    if (format === "txt") {
      const text = toTxt(picked.cols, picked.rows);
      return new Response(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileBase}.txt"`,
        },
      });
    }
    const buf = await toXlsx(picked.cols, picked.rows, isSuperuser && includeAllSellers && !!body.group_by_seller);
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

