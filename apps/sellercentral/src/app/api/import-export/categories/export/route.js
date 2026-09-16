import ExcelJS from "exceljs";
import { categoryExcelFilename } from "@/lib/download-names";
import { resolveRequestLocale } from "@/lib/import-export-i18n";
import { categoryToExcelRow, flattenCategoryIndex, paintCategoryWorkbook } from "@/lib/category-excel";

const DEFAULT_BACKEND = "https://api.andertal.com";

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

async function loadCategories(backendUrl, sellerToken) {
  const headers = sellerToken ? { Authorization: `Bearer ${sellerToken}` } : {};
  const urls = [
    `${backendUrl}/admin-hub/v1/categories`,
    `${backendUrl}/admin-hub/categories`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data.categories) ? data.categories : [];
      if (list.length || res.ok) return list;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locale = typeof body.locale === "string" ? body.locale.slice(0, 2).toLowerCase() : resolveRequestLocale(request);
    const sellerToken = typeof body.sellerToken === "string" ? body.sellerToken : "";
    const backendUrl = getBackendBase();
    const cats = await loadCategories(backendUrl, sellerToken);
    const indexRows = flattenCategoryIndex(cats);
    const rows = indexRows
      .map((idx) => cats.find((c) => String(c.id) === String(idx.id)))
      .filter(Boolean)
      .map(categoryToExcelRow);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    paintCategoryWorkbook(wb, { locale, rows, indexRows });

    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${categoryExcelFilename("export", locale)}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("category export:", e);
    return Response.json({ error: e.message || "Export failed" }, { status: 500 });
  }
}
