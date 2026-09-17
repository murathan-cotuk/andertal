import ExcelJS from "exceljs";
import { resolveRequestLocale } from "@/lib/import-export-i18n";
import { CATEGORY_SHEET_NAME, parseCategoryExcelWorksheet } from "@/lib/category-excel";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BACKEND = "https://api.andertal.com";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const UPSERT_BATCH_SIZE = 250;
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

function orderItemsParentsFirst(items) {
  const list = Array.isArray(items) ? items : [];
  const bySlug = new Map();
  const byId = new Map();
  const keyed = list.map((raw, i) => {
    const slug = String(raw.slug || "").trim().toLowerCase();
    const id = String(raw.id || "").trim().toLowerCase();
    const it = { ...raw, _slug: slug, _id: id, _key: id || slug || `row-${raw.row || i + 1}` };
    if (slug) bySlug.set(slug, it);
    if (UUID_RE.test(id)) byId.set(id, it);
    return it;
  });
  const visiting = new Set();
  const seen = new Set();
  const out = [];
  const visit = (it) => {
    const key = it._key;
    if (seen.has(key) || visiting.has(key)) return;
    visiting.add(key);
    const pref = String(it.parent_id || "").trim();
    if (pref) {
      const parent = UUID_RE.test(pref) ? byId.get(pref.toLowerCase()) : bySlug.get(pref.toLowerCase());
      if (parent && parent !== it) visit(parent);
    }
    visiting.delete(key);
    seen.add(key);
    const { _slug, _id, _key, ...rest } = it;
    out.push(rest);
  };
  keyed.forEach(visit);
  return out;
}

async function postUpsertBatch(urls, { sellerToken, locale, items }) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sellerToken}`,
          "Content-Type": "application/json",
          "x-shop-locale": locale,
        },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        const err = new Error(data.message || "Superuser access required");
        err.status = 403;
        throw err;
      }
      if (!res.ok) {
        lastErr = data.message || data.error || `HTTP ${res.status}`;
        continue;
      }
      return data;
    } catch (e) {
      if (e.status === 403) throw e;
      lastErr = e.message || String(e);
    }
  }
  throw new Error(lastErr || "Backend upsert failed");
}

function validateXlsxFile(file, buf) {
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  if (!name.endsWith(".xlsx")) return "Only .xlsx files are allowed.";
  if (buf.length > MAX_UPLOAD_BYTES) return "File too large (max 100 MB).";
  if (buf.length < 4 || !buf.slice(0, 4).equals(XLSX_MAGIC)) return "File does not appear to be a valid .xlsx file.";
  return null;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sellerToken = String(formData.get("sellerToken") || "");
    const localeRaw = formData.get("locale");
    const locale = localeRaw ? String(localeRaw).slice(0, 2).toLowerCase() : resolveRequestLocale(request);

    if (!file || typeof file === "string") {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    if (!sellerToken) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const fileError = validateXlsxFile(file, buf);
    if (fileError) return Response.json({ error: fileError }, { status: 400 });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(CATEGORY_SHEET_NAME) || wb.worksheets.find((s) => s.name !== "Index") || wb.worksheets[0];
    if (!ws) return Response.json({ error: "No Categories sheet found" }, { status: 400 });

    const parsed = parseCategoryExcelWorksheet(ws);
    if (parsed.errors.length && parsed.items.length === 0) {
      return Response.json({ error: parsed.errors[0]?.error || "Could not parse Excel", errors: parsed.errors }, { status: 400 });
    }
    if (parsed.items.length === 0) {
      return Response.json({ error: "No data rows found (fill from row 4)" }, { status: 400 });
    }

    const backendUrl = getBackendBase();
    const urls = [
      `${backendUrl}/admin-hub/v1/categories/excel-upsert`,
      `${backendUrl}/admin-hub/categories/excel-upsert`,
    ];
    const ordered = orderItemsParentsFirst(parsed.items);
    const totals = { created: 0, updated: 0, failed: 0, errors: [...(parsed.errors || [])] };
    for (let i = 0; i < ordered.length; i += UPSERT_BATCH_SIZE) {
      const batch = ordered.slice(i, i + UPSERT_BATCH_SIZE);
      try {
        const data = await postUpsertBatch(urls, { sellerToken, locale, items: batch });
        totals.created += data.created || 0;
        totals.updated += data.updated || 0;
        totals.failed += data.failed || 0;
        if (Array.isArray(data.errors) && data.errors.length) totals.errors.push(...data.errors);
      } catch (e) {
        if (e.status === 403) {
          return Response.json({ error: e.message || "Superuser access required" }, { status: 403 });
        }
        const from = i + 1;
        const to = Math.min(i + batch.length, ordered.length);
        return Response.json(
          {
            ...totals,
            error: `Stopped after ${totals.created} created / ${totals.updated} updated, at items ${from}–${to} of ${ordered.length}: ${e.message || "backend error"}`,
            errors: totals.errors,
          },
          { status: 500 },
        );
      }
    }
    return Response.json(totals);
  } catch (e) {
    console.error("category import:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
