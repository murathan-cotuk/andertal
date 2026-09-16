import ExcelJS from "exceljs";
import { resolveRequestLocale } from "@/lib/import-export-i18n";
import { CATEGORY_SHEET_NAME, parseCategoryExcelWorksheet } from "@/lib/category-excel";

const DEFAULT_BACKEND = "https://api.andertal.com";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

function validateXlsxFile(file, buf) {
  const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
  if (!name.endsWith(".xlsx")) return "Only .xlsx files are allowed.";
  if (buf.length > MAX_UPLOAD_BYTES) return "File too large (max 10 MB).";
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
          body: JSON.stringify({ items: parsed.items }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          return Response.json({ error: data.message || "Superuser access required" }, { status: 403 });
        }
        if (!res.ok) {
          lastErr = data.message || `HTTP ${res.status}`;
          continue;
        }
        return Response.json({
          created: data.created || 0,
          updated: data.updated || 0,
          failed: data.failed || 0,
          errors: [...(parsed.errors || []), ...(data.errors || [])],
        });
      } catch (e) {
        lastErr = e.message || String(e);
      }
    }
    return Response.json({ error: lastErr || "Import failed" }, { status: 500 });
  } catch (e) {
    console.error("category import:", e);
    return Response.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
