import { resolveRequestLocale } from "@/lib/import-export-i18n";
import { postCategoryExcelUpsertBatch } from "@/lib/category-excel-upsert-proxy";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_ITEMS = 200;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sellerToken = typeof body.sellerToken === "string" ? body.sellerToken : "";
    const locale =
      typeof body.locale === "string" ? body.locale.slice(0, 2).toLowerCase() : resolveRequestLocale(request);
    const items = Array.isArray(body.items) ? body.items : [];

    if (!sellerToken) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    if (!items.length) {
      return Response.json({ error: "items array is required" }, { status: 400 });
    }
    if (items.length > MAX_ITEMS) {
      return Response.json({ error: `Send at most ${MAX_ITEMS} items per request (got ${items.length})` }, { status: 400 });
    }

    const data = await postCategoryExcelUpsertBatch({ sellerToken, locale, items });
    return Response.json({
      created: data.created || 0,
      updated: data.updated || 0,
      failed: data.failed || 0,
      errors: Array.isArray(data.errors) ? data.errors : [],
    });
  } catch (e) {
    const status = e.status === 403 ? 403 : 500;
    console.error("category upsert batch:", e);
    return Response.json({ error: e.message || "Upsert failed" }, { status });
  }
}
