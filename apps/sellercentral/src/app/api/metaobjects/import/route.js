import ExcelJS from "exceljs";
import {
  applyImportGroups,
  groupImportRows,
  parseMetaobjectWorkbook,
} from "@/lib/metaobjects-xlsx";

const DEFAULT_BACKEND = "https://api.andertal.com";

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

async function backendJson(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${getBackendBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const token = String(form.get("sellerToken") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "Please upload an .xlsx file." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const rows = parseMetaobjectWorkbook(wb);
    const groups = groupImportRows(rows);
    if (!groups.length) {
      return Response.json({ error: "No titles or values found in the file." }, { status: 400 });
    }

    const existing = await backendJson("/admin-hub/metafield-definitions", { token });
    const current = existing?.definitions || {};
    const { definitions, summary } = applyImportGroups(current, groups);

    const persistKeys = Object.keys(definitions).filter((key) => {
      const before = current[key];
      const after = definitions[key];
      if (!before) return true;
      return JSON.stringify(before) !== JSON.stringify(after);
    });

    const errors = [];
    let persisted = 0;
    for (const key of persistKeys) {
      const def = definitions[key];
      try {
        await backendJson(`/admin-hub/metafield-definitions/${encodeURIComponent(key)}`, {
          token,
          method: "PUT",
          body: {
            label: def.label,
            values: def.values || [],
            label_i18n: def.label_i18n || null,
            values_i18n: def.values_i18n || null,
          },
        });
        persisted += 1;
      } catch (err) {
        errors.push({ key, error: err.message || "save failed" });
      }
    }

    return Response.json({
      ok: errors.length === 0,
      created: summary.created,
      updated: summary.updated,
      valuesAdded: summary.valuesAdded,
      remapped: summary.remapped || [],
      skipped: summary.skipped || [],
      persisted,
      errors,
    });
  } catch (e) {
    const status = e.status || 500;
    return Response.json({ error: e.message || "Import failed" }, { status });
  }
}
