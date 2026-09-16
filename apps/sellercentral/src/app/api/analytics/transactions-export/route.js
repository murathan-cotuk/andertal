import ExcelJS from "exceljs";
import { dateLocaleFor } from "@/lib/locale-text";
import {
  getLedgerExportCopy,
  ledgerExportTypeLabel,
  visibleLedgerEntries,
} from "@/lib/transaction-ledger";
import { buildSimpleTablePdfBuffer } from "@/lib/simple-table-pdf";

const DEFAULT_BACKEND = "https://api.andertal.com";

function getBackendBase() {
  return (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

function eur(cents) {
  return Number(cents || 0) / 100;
}

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(dateLocaleFor(locale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (_) {
    return String(value).slice(0, 10);
  }
}

function formatAmount(cents, locale) {
  const n = Number(cents || 0);
  const abs = Math.abs(n).toLocaleString(dateLocaleFor(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function normalizeLocale(raw) {
  const loc = String(raw || "de").slice(0, 2).toLowerCase();
  return ["en", "tr", "fr", "es", "it", "de"].includes(loc) ? loc : "de";
}

async function loadLedger(body) {
  const token = String(body.sellerToken || "").trim();
  if (!token) {
    const err = new Error("Missing seller token");
    err.status = 401;
    throw err;
  }

  const backendUrl = getBackendBase();
  const headers = { Authorization: `Bearer ${token}` };
  const accountRes = await fetchJson(`${backendUrl}/admin-hub/v1/seller/account`, { headers });
  const sellerUser = accountRes?.sellerUser || accountRes?.user || {};
  const isSuperuser = !!sellerUser?.is_superuser;

  const qs = new URLSearchParams();
  if (body.period_start) qs.set("period_start", String(body.period_start).slice(0, 10));
  if (body.period_end) qs.set("period_end", String(body.period_end).slice(0, 10));
  if (body.seller_id) qs.set("seller_id", String(body.seller_id));
  const data = await fetchJson(`${backendUrl}/admin-hub/v1/seller-ledger?${qs}`, { headers });
  const rows = visibleLedgerEntries(data?.entries);
  return { isSuperuser, rows, periodStart: body.period_start, periodEnd: body.period_end };
}

function exportHeaders(copy, isSuperuser) {
  return [
    copy.date,
    copy.type,
    copy.order,
    ...(isSuperuser ? [copy.seller] : []),
    copy.amount,
  ];
}

function exportColFrac(isSuperuser) {
  return isSuperuser
    ? [0.12, 0.42, 0.14, 0.18, 0.14]
    : [0.14, 0.50, 0.18, 0.18];
}

/**
 * One accounting line per row. Locale follows the sellercentral UI language.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const locale = normalizeLocale(body.locale);
    const format = String(body.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    const copy = getLedgerExportCopy(locale);
    const { isSuperuser, rows, periodStart, periodEnd } = await loadLedger(body);
    const stamp = new Date().toISOString().slice(0, 10);
    const periodLabel = [periodStart, periodEnd].filter(Boolean).join(" – ");

    if (format === "pdf") {
      const headers = exportHeaders(copy, isSuperuser);
      const pdfRows = rows.map((e) => [
        formatDate(e.occurred_at, locale),
        ledgerExportTypeLabel(e, locale),
        e.order_number != null ? String(e.order_number) : "—",
        ...(isSuperuser ? [e.store_name || e.seller_id || "—"] : []),
        formatAmount(e.amount_cents, locale),
      ]);
      const buf = buildSimpleTablePdfBuffer({
        title: copy.title,
        subtitle: periodLabel,
        headers,
        rows: pdfRows,
        colFrac: exportColFrac(isSuperuser),
      });
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="andertal-transactions-${locale}-${stamp}.pdf"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    const ws = wb.addWorksheet(copy.sheetName.slice(0, 31));
    const headerRow = exportHeaders(copy, isSuperuser);
    ws.addRow(headerRow);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    header.height = 18;

    const amountCol = headerRow.length;
    for (const e of rows) {
      const amt = eur(e.amount_cents);
      const excelRow = ws.addRow([
        formatDate(e.occurred_at, locale),
        ledgerExportTypeLabel(e, locale),
        e.order_number != null ? String(e.order_number) : "—",
        ...(isSuperuser ? [e.store_name || e.seller_id || "—"] : []),
        amt,
      ]);
      excelRow.font = { size: 10, name: "Calibri" };
      excelRow.height = 16;
      const amountCell = excelRow.getCell(amountCol);
      amountCell.numFmt = "#,##0.00";
      if (amt > 0) amountCell.font = { color: { argb: "FF059669" }, size: 10 };
      else if (amt < 0) amountCell.font = { color: { argb: "FFDC2626" }, size: 10 };
    }
    for (let i = 2; i <= ws.rowCount; i++) {
      if (i % 2 === 0) ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }
    ws.columns.forEach((col, idx) => {
      col.width = Math.max(14, String(headerRow[idx] || "").length + 6);
    });
    if (ws.columns[1]) ws.columns[1].width = 42;
    if (ws.columns[amountCol - 1]) ws.columns[amountCol - 1].width = 14;

    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="andertal-transactions-${locale}-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    const status = e?.status || 500;
    return Response.json({ error: e?.message || "Export failed" }, { status });
  }
}
