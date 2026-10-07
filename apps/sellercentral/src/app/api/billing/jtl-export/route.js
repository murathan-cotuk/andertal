import ExcelJS from "exceljs";

/** Billing → JTL: XLSX export of the quarterly JTL partner report (docs/jtl.md §9). Superuser only. */
const DEFAULT_BACKEND = "https://api.andertal.com";
const getBackendBase = () => (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || DEFAULT_BACKEND).replace(/\/$/, "");

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

const eur = (cents) => Number(cents || 0) / 100;

function sheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(name.substring(0, 31));
  ws.addRow(headers);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col, i) => { col.width = Math.max(12, String(headers[i] || "").length + 4); });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.sellerToken || "").trim();
    if (!token) return Response.json({ error: "Missing seller token" }, { status: 401 });
    const backendUrl = getBackendBase();
    const headers = { Authorization: `Bearer ${token}` };
    const qs = body.period ? `?period=${encodeURIComponent(body.period)}` : "";
    // The backend route itself is superuser-only (403 otherwise).
    const data = await fetchJson(`${backendUrl}/admin-hub/v1/billing/jtl${qs}`, { headers });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    sheet(wb, "Summe", ["Kennzahl", "Wert"], [
      ["Zeitraum", data.period],
      ["Frist Reporting (§ 3.3)", data.deadline],
      ["Bruttoumsatz provisionsrelevant (EUR)", eur(data.totals?.gross_gmv_cents)],
      ["Provision 1 % netto (EUR)", eur(data.totals?.provision_1pct_cents)],
      ["USt (Schätzung, Rechnung JTL maßgeblich) (EUR)", eur(data.totals?.vat_estimate_cents)],
      ["Provisionsrelevante Händler", data.totals?.seller_count || 0],
    ]);
    sheet(wb, "Monate", ["Monat", "Bruttoumsatz (EUR)", "Provision 1 % (EUR)", "Bestellungen"],
      (data.by_month || []).map((m) => [m.month, eur(m.gross_gmv_cents), eur(m.provision_1pct_cents), m.order_count]));
    sheet(wb, "Händler je Monat",
      ["period", "month", "seller_id", "jtl_external_id", "seller_name", "gross_gmv (EUR)", "provision_1pct (EUR)", "currency", "order_count"],
      (data.rows || []).map((r) => [r.period, r.month, r.seller_id, r.jtl_external_id, r.seller_name, eur(r.gross_gmv_cents), eur(r.provision_1pct_cents), r.currency, r.order_count]));

    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="andertal-jtl-reporting-${data.period}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
