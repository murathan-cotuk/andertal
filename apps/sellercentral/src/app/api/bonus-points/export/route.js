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
    col.width = Math.min(42, Math.max(12, maxLen + 2));
  });
}

function nameOf(row) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ") || row?.email || "—";
}

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

    const qs = new URLSearchParams({ export: "1" });
    if (body.from) qs.set("from", body.from);
    if (body.to) qs.set("to", body.to);
    if (body.payment_method) qs.set("payment_method", body.payment_method);
    if (body.search) qs.set("search", body.search);
    if (body.customer_id) qs.set("customer_id", body.customer_id);
    if (body.order_id) qs.set("order_id", body.order_id);
    if (body.ids) qs.set("ids", Array.isArray(body.ids) ? body.ids.join(",") : String(body.ids));
    if (body.only_with_balance) qs.set("only_with_balance", "1");

    const scope = String(body.scope || "all");
    const data = await fetchJson(`${backendUrl}/admin-hub/v1/bonus-points/report?${qs}`, { headers });
    const ov = data?.overview || {};
    const liab = ov.liability || {};
    const period = ov.period || {};
    const stamp = new Date().toISOString().slice(0, 10);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Andertal Sellercentral";
    wb.created = new Date();
    wb.description = "Bonuspunkte / Andertal-Finanzierung — Nachweis für Buchhaltung";

    addSheet(
      wb,
      "Uebersicht",
      ["Kennzahl", "Wert"],
      [
        ["Zeitraum von", body.from || "—"],
        ["Zeitraum bis", body.to || "—"],
        ["Zahlungsart", body.payment_method || "all"],
        ["Erstellt am", stamp],
        ["Kurs", "50 Bonuspunkte = 1,00 EUR"],
        ["Verdienen", "1 Punkt je 1,00 EUR tatsächlich gezahlt (aufgerundet)"],
        ["Offene Kundenpunkte (aktuell)", liab.outstanding_points || 0],
        ["Offene Verbindlichkeit EUR", eur(liab.outstanding_eur_cents)],
        ["Kunden mit Guthaben", liab.customers_with_balance || 0],
        ["Kunden gesamt", liab.customers_total || 0],
        ["Bestellungen im Zeitraum", period.orders_total || 0],
        ["Bestellungen mit Bonus-Einlösung", period.orders_with_bonus || 0],
        ["0-EUR-Zahlungen (nur Bonus)", period.orders_zero_pay || 0],
        ["Andertal-Finanzierung EUR (Zeitraum)", eur(period.andertal_funding_cents)],
        ["Eingelöste Punkte (Zeitraum)", period.points_redeemed || 0],
        ["Verdiente Punkte (Zeitraum)", period.points_earned || 0],
        ["Manuelle Buchungen Punkte", period.manual_points || 0],
        ["Registrierungsbonus Punkte", period.signup_points || 0],
        [
          "Hinweis Finanzamt",
          "Die Bonus-Einlösung wird von Andertal aus eigenen Mitteln getragen, nicht vom Verkäufer. Bestellwert = Kunde gezahlt + Andertal-Finanzierung. Kein zusätzlicher Umsatz.",
        ],
      ],
    );

    if (scope === "all" || scope === "redemptions" || scope === "order") {
      const orders = data?.redemptions?.rows || [];
      addSheet(
        wb,
        "Andertal-Finanzierung",
        [
          "Bestellnr.",
          "Datum",
          "Kunde",
          "E-Mail",
          "Kd-Nr.",
          "Zahlungsart",
          "Checkout-Art",
          "Land",
          "Verkäufer",
          "Listenpreis EUR",
          "Versand EUR",
          "Gutschein EUR",
          "Bestellwert EUR",
          "Kunde gezahlt EUR",
          "Andertal aus eigener Kasse EUR",
          "Eingelöste Punkte",
          "Provision EUR",
          "Auszahlung Verkäufer EUR",
          "Stripe Payment Intent",
          "Zahlstatus",
          "Bestellstatus",
        ],
        orders.map((o) => [
          o.order_number || "",
          o.created_at ? String(o.created_at).slice(0, 10) : "",
          nameOf(o),
          o.email || "",
          o.customer_number || "",
          o.payment_method_label || o.payment_method || "",
          o.checkout_payment_kind || "",
          o.country || "",
          o.store_name || "",
          eur(o.subtotal_cents),
          eur(o.shipping_cents),
          eur(o.coupon_discount_cents),
          eur(o.order_value_cents),
          eur(o.customer_paid_cents),
          eur(o.bonus_funding_cents),
          o.bonus_points_redeemed || 0,
          eur(o.commission_cents),
          eur(o.seller_net_cents),
          o.payment_intent_id || "",
          o.payment_status || "",
          o.order_status || "",
        ]),
      );
    }

    if (scope === "all" || scope === "balances") {
      const customers = data?.balances?.rows || [];
      addSheet(
        wb,
        "Kunden-Salden",
        ["Kd-Nr.", "Name", "E-Mail", "Land", "Punkte", "EUR", "Verdient", "Eingelöst", "Storno/Retoure", "Manuell", "Letzte Bewegung", "Kunde seit"],
        customers.map((c) => [
          c.customer_number || "",
          nameOf(c),
          c.email || "",
          c.country || "",
          c.bonus_points || 0,
          eur(c.balance_eur_cents),
          c.earned_points || 0,
          c.redeemed_points || 0,
          c.reversed_points || 0,
          c.manual_points || 0,
          c.last_ledger_at ? String(c.last_ledger_at).slice(0, 10) : "",
          c.created_at ? String(c.created_at).slice(0, 10) : "",
        ]),
      );
    }

    if (scope === "all" || scope === "ledger" || scope === "earnings" || scope === "reversals" || scope === "manual") {
      const pick =
        scope === "earnings" ? data?.earnings?.rows
        : scope === "reversals" ? data?.reversals?.rows
        : scope === "manual" ? data?.manual?.rows
        : data?.ledger?.rows;
      addSheet(
        wb,
        scope === "earnings" ? "Verdient" : scope === "reversals" ? "Storno-Retoure" : scope === "manual" ? "Manuell" : "Ledger",
        ["Datum", "Kd-Nr.", "Kunde", "E-Mail", "Quelle", "Punkte", "EUR", "Bestellnr.", "Beschreibung"],
        (pick || []).map((e) => [
          e.occurred_at ? String(e.occurred_at).slice(0, 19).replace("T", " ") : "",
          e.customer_number || "",
          nameOf(e),
          e.email || "",
          e.source_label || e.source || "",
          e.points_delta || 0,
          eur(e.eur_cents),
          e.order_number || "",
          e.description || "",
        ]),
      );
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `andertal-bonuspunkte-${scope}-${stamp}.xlsx`;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || "Export failed" }, { status: 500 });
  }
}
