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

function addSheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(String(name).substring(0, 31));
  ws.addRow(headers);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  header.height = 22;
  for (const row of rows) ws.addRow(row);
  for (let i = 2; i <= ws.rowCount; i++) {
    if (i % 2 === 0) ws.getRow(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  }
  ws.columns.forEach((col, idx) => {
    let maxLen = String(headers[idx] || "").length + 2;
    for (const row of rows) {
      const l = String(row[idx] ?? "").length;
      if (l > maxLen) maxLen = l;
    }
    col.width = Math.min(40, Math.max(12, maxLen + 2));
  });
}

/** BonusPunkte.md §3.8 export: 3 sheets, numbers are Tab 2's (seller_payouts) Σ — never independently recomputed. */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.sellerToken || "").trim();
    if (!token) return Response.json({ error: "Missing seller token" }, { status: 401 });

    const backendUrl = getBackendBase();
    const headers = { Authorization: `Bearer ${token}` };

    const accountRes = await fetchJson(`${backendUrl}/admin-hub/v1/seller/account`, { headers });
    const sellerUser = accountRes?.sellerUser || accountRes?.user || {};
    if (!sellerUser?.is_superuser) {
      return Response.json({ error: "Superuser access required" }, { status: 403 });
    }

    const qs = new URLSearchParams();
    if (body.period_start) qs.set("period_start", body.period_start);
    if (body.period_end) qs.set("period_end", body.period_end);
    if (body.seller_id) qs.set("seller_id", body.seller_id);
    const data = await fetchJson(
      `${backendUrl}/admin-hub/v1/billing/finanzamt${qs.toString() ? `?${qs}` : ""}`,
      { headers },
    );

    const t = data?.totals || {};
    const sellers = Array.isArray(data?.sellers) ? data.sellers : [];
    const oss = Array.isArray(data?.oss_by_country) ? data.oss_by_country : [];
    const b2b = data?.b2b_reverse_charge || { order_count: 0, net_cents: 0 };
    const stamp = new Date().toISOString().slice(0, 10);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();

    addSheet(
      wb,
      "Summe",
      ["Kennzahl", "Betrag (EUR)"],
      [
        ["Zeitraum von", body.period_start || "—"],
        ["Zeitraum bis", body.period_end || "—"],
        ["Erstellt am", stamp],
        ["Bruttoumsatz (alle Verkäufer)", eur(t.gross_sale_cents)],
        ["Davon vom Kunden gezahlt", eur(t.customer_paid_cents)],
        ["Davon von Andertal (Bonuspunkte)", eur(t.bonus_funding_cents)],
        ["Provision netto", eur(t.commission_net_cents)],
        ["Provision USt", eur(t.commission_vat_cents)],
        ["Auszahlung an Verkäufer", eur(t.seller_payout_cents)],
        ["Erstattungen", eur(t.refund_cents)],
        ["Anzahl Bestellungen", t.order_count || 0],
        ["Anzahl Verkäufer", t.seller_count || 0],
        ["Anzahl Rechnungen (inkl. 0€-Perioden)", t.invoice_count || 0],
        ["B2B Reverse-Charge — Bestellungen (nicht in OSS_Bestimmungsland enthalten)", b2b.order_count || 0],
        ["B2B Reverse-Charge — Nettoumsatz", eur(b2b.net_cents)],
      ],
    );

    addSheet(
      wb,
      "Je_Seller",
      [
        "Verkäufer", "Verkäufer-ID", "Zeitraum von", "Zeitraum bis", "Status",
        "Bruttoumsatz", "Kunde gezahlt", "Andertal Bonus", "Provision netto",
        "Provision USt", "Auszahlung", "Erstattung", "Bestellungen",
      ],
      sellers.map((s) => [
        s.store_name || s.seller_id, s.seller_id,
        s.period_start ? String(s.period_start).slice(0, 10) : "—",
        s.period_end ? String(s.period_end).slice(0, 10) : "—",
        s.status || "—",
        eur(s.gross_sale_cents), eur(s.customer_paid_cents), eur(s.bonus_funding_cents),
        eur(s.commission_net_cents), eur(s.commission_vat_cents), eur(s.seller_payout_cents),
        eur(s.refund_cents), s.order_count || 0,
      ]),
    );

    // Komisyon USt bu sheette YOK (BonusPunkte.md §3.8: "Komisyon USt bu sheet'te yok") — sadece mal KDV'si.
    // B2B/reverse-charge (intra_b2b) sütunu kasıtlı olarak YOK: sistemde müşteri VAT-ID / B2B kavramı
    // yok (§3.10'un ayrı, henüz yapılmamış bir parçası) — var olmayan bir ayrımı sahte "B2C" değeriyle
    // doldurup muhasebeciyi yanıltmaktansa sütunu hiç eklemedik.
    addSheet(
      wb,
      "OSS_Bestimmungsland",
      ["Zielland", "Bestellungen", "Bruttoumsatz", "Nettoumsatz (Ware)", "USt Ware", "USt-Satz %"],
      oss.map((row) => [
        row.country || "—", row.order_count || 0,
        eur(row.gross_cents), eur(row.net_cents), eur(row.vat_cents), row.rate_percent || 0,
      ]),
    );

    const buf = await wb.xlsx.writeBuffer();
    const fileEnd = body.period_end ? String(body.period_end).slice(0, 10) : stamp;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="andertal-finanzamt-${fileEnd}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
