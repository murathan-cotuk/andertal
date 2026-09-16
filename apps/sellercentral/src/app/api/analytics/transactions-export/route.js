import ExcelJS from "exceljs";

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

const TYPE_DE = {
  order_received: "Warenwert",
  shipping_customer: "Versand (Kunde)",
  commission: "Provision (netto)",
  commission_vat: "Provision USt",
  shipping_label: "Versandetikett",
  commission_vat_refund: "Provision USt erstattet",
  return_shipping: "Rücksendeetikett",
  refund: "Erstattung",
  commission_refund: "Provision erstattet",
  advertising: "Werbung",
  manual_adjustment: "Anpassung",
  payout: "Auszahlung",
};

/**
 * One Excel row per accounting line (Amazon-style statement), not a fat order row.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.sellerToken || "").trim();
    if (!token) return Response.json({ error: "Missing seller token" }, { status: 401 });

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
    const rows = Array.isArray(data?.entries) ? data.entries : [];

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    const ws = wb.addWorksheet("Kontobewegungen");
    const headerRow = [
      "Datum", "Typ", "Beschreibung", "Bestellnr.",
      ...(isSuperuser ? ["Verkäufer"] : []),
      "Betrag EUR", "Saldo wirksam",
    ];
    ws.addRow(headerRow);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    header.height = 22;

    for (const e of rows) {
      const amt = eur(e.amount_cents);
      const excelRow = ws.addRow([
        e.occurred_at ? new Date(e.occurred_at).toISOString().slice(0, 10) : "—",
        TYPE_DE[e.type] || e.type || "—",
        e.description_key || TYPE_DE[e.type] || "—",
        e.order_number != null ? String(e.order_number) : "—",
        ...(isSuperuser ? [e.store_name || e.seller_id || "—"] : []),
        amt,
        e.affects_balance === false ? "nein" : "ja",
      ]);
      const amountCell = excelRow.getCell(isSuperuser ? 6 : 5);
      amountCell.numFmt = '#,##0.00';
      if (amt > 0) amountCell.font = { color: { argb: "FF059669" } };
      else if (amt < 0) amountCell.font = { color: { argb: "FFDC2626" } };
    }
    for (let i = 2; i <= ws.rowCount; i++) {
      if (i % 2 === 0) ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }
    ws.columns.forEach((col, idx) => {
      col.width = Math.max(14, String(headerRow[idx] || "").length + 4);
    });

    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="andertal-transactions-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
