import ExcelJS from "exceljs";
import { resolveRequestLocale } from "@/lib/import-export-i18n";
import { CATEGORY_SHEET_NAME, orderCategoryExcelItems, parseCategoryExcelWorksheet } from "@/lib/category-excel";
import { postCategoryExcelUpsertBatch } from "@/lib/category-excel-upsert-proxy";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const UPSERT_BATCH_SIZE = 80;
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

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
    const offset = Math.max(0, parseInt(String(formData.get("offset") || "0"), 10) || 0);
    const limitRaw = parseInt(String(formData.get("limit") || String(UPSERT_BATCH_SIZE)), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, UPSERT_BATCH_SIZE) : UPSERT_BATCH_SIZE;

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

    const ordered = orderCategoryExcelItems(parsed.items);
    const slice = ordered.slice(offset, offset + limit);
    if (!slice.length) {
      return Response.json({
        created: 0,
        updated: 0,
        failed: 0,
        errors: parsed.errors || [],
        total: ordered.length,
        offset,
        nextOffset: offset,
        done: true,
      });
    }

    try {
      const data = await postCategoryExcelUpsertBatch({ sellerToken, locale, items: slice });
      const nextOffset = offset + slice.length;
      return Response.json({
        created: data.created || 0,
        updated: data.updated || 0,
        failed: data.failed || 0,
        errors: [...(parsed.errors || []), ...(Array.isArray(data.errors) ? data.errors : [])],
        total: ordered.length,
        offset,
        nextOffset,
        done: nextOffset >= ordered.length,
      });
    } catch (e) {
      if (e.status === 403) {
        return Response.json({ error: e.message || "Superuser access required" }, { status: 403 });
      }
      return Response.json(
        {
          created: 0,
          updated: 0,
          failed: slice.length,
          error: `Stopped at items ${offset + 1}–${offset + slice.length} of ${ordered.length}: ${e.message || "backend error"}`,
          errors: parsed.errors || [],
          total: ordered.length,
          offset,
          nextOffset: offset,
          done: false,
        },
        { status: 500 },
      );
    }
  } catch (e) {
    console.error("category import:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
