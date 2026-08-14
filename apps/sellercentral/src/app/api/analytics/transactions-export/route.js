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

/**
 * BonusPunkte.md §3.9: "Export Excel (görünen kolonlar) — Billing Finanzamt PDF'inin kopyası değil;
 * işlem listesi." A flat operational ledger of the transactions the page shows, not a period summary.
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

    const data = await fetchJson(`${backendUrl}/admin-hub/v1/transactions?include_pending=true`, { headers });
    const all = Array.isArray(data?.transactions) ? data.transactions : [];

    const from = body.period_start ? new Date(body.period_start).getTime() : null;
    const to = body.period_end ? new Date(body.period_end).getTime() : null;
    const sellerFilter = body.seller_id ? String(body.seller_id) : "";
    const rows = all.filter((tx) => {
      const t = new Date(tx.created_at).getTime();
      if (from != null && Number.isFinite(from) && t < from) return false;
      if (to != null && Number.isFinite(to) && t > to) return false;
      if (sellerFilter && String(tx.seller_id || "") !== sellerFilter) return false;
      return true;
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    const ws = wb.addWorksheet("Transactions");
    const headerRow = [
      "Typ", "Bestellnr.", "Datum", ...(isSuperuser ? ["Verkäufer"] : []),
      "Zielland", "Brutto", "Kunde gezahlt", "Versand", "Andertal Bonus", "Provision USt", "Provision",
      "Auszahlung", "Zahlungsstatus", "Lieferstatus", "Zahlbereit",
    ];
    ws.addRow(headerRow);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headerRow.length } };
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    header.height = 22;

    for (const tx of rows) {
      const isLedger = tx.type === "ledger_adjustment";
      ws.addRow([
        tx.type || "order",
        isLedger ? "—" : (tx.order_number != null ? String(tx.order_number) : "—"),
        tx.created_at ? new Date(tx.created_at).toISOString().slice(0, 10) : "—",
        ...(isSuperuser ? [tx.store_name || tx.seller_id || "—"] : []),
        tx.destination_country || "—",
        eur(tx.total_cents),
        eur(tx.customer_paid_cents),
        eur(tx.shipping_cents),
        eur(tx.bonus_redeemed_cents),
        eur(tx.commission_vat_cents),
        eur(tx.commission_cents),
        eur(tx.payout_cents),
        tx.payment_status || "—",
        tx.delivery_status || "—",
        tx.payout_eligible ? "ja" : "nein",
      ]);
    }
    for (let i = 2; i <= ws.rowCount; i++) {
      if (i % 2 === 0) ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    }
    ws.columns.forEach((col, idx) => {
      col.width = Math.max(12, String(headerRow[idx] || "").length + 4);
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
