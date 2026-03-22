/** HTML für Versandaufkleber / Lieferschein (Druckfenster). */

export function buildShipLabelsHtml(orders, carrierName, trackings, dateStr) {
  return orders
    .map(
      (o) => `
      <div class="label" style="page-break-inside:avoid;border:2px solid #000;padding:20px;margin-bottom:20px;font-family:Arial,sans-serif;width:90mm;box-sizing:border-box;">
        <div style="font-size:11px;color:#666;margin-bottom:8px">VERSANDAUFKLEBER / LIEFERSCHEIN</div>
        <div style="font-size:18px;font-weight:bold;margin-bottom:12px">Bestellung #${o.order_number || "—"}</div>
        <div style="font-size:13px;margin-bottom:4px"><strong>${[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}</strong></div>
        <div style="font-size:12px">${o.address_line1 || "—"}</div>
        <div style="font-size:12px">${[o.postal_code, o.city].filter(Boolean).join(" ")}</div>
        <div style="font-size:12px">${o.country || "—"}</div>
        <hr style="margin:12px 0">
        <div style="font-size:11px;color:#666">Versanddienstleister: <strong>${carrierName}</strong></div>
        <div style="font-size:11px;color:#666">Trackingnummer: <strong>${trackings[o.id] || "—"}</strong></div>
        <div style="font-size:11px;color:#666">Datum: ${dateStr}</div>
        <div style="margin-top:12px;border:1px solid #ccc;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;letter-spacing:4px">${trackings[o.id] || "—"}</div>
      </div>
    `,
    )
    .join("");
}

export function buildShipLieferscheinHtml(orders, carrierName, trackings, dateStr) {
  const lineItems = (o) => o._items || o.items || [];
  return orders
    .map(
      (o) => `
      <div style="page-break-inside:avoid;padding:30px;font-family:Arial,sans-serif;border-bottom:2px dashed #ccc;margin-bottom:20px">
        <h2 style="margin:0 0 16px">Lieferschein — Bestellung #${o.order_number || "—"}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <div>
            <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:4px">Lieferadresse</div>
            <div><strong>${[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}</strong></div>
            <div>${o.address_line1 || "—"}</div>
            <div>${[o.postal_code, o.city].filter(Boolean).join(" ")}</div>
            <div>${o.country || ""}</div>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:4px">Versandinformation</div>
            <div>Datum: ${dateStr}</div>
            <div>Carrier: ${carrierName}</div>
            <div>Tracking: ${trackings[o.id] || "—"}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left;border:1px solid #ddd">Artikel</th>
              <th style="padding:8px;text-align:center;border:1px solid #ddd">Menge</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems(o)
              .map(
                (it) =>
                  `<tr><td style="padding:8px;border:1px solid #ddd">${it.title || "—"}</td><td style="padding:8px;text-align:center;border:1px solid #ddd">${it.quantity}</td></tr>`,
              )
              .join("") || `<tr><td colspan="2" style="padding:8px;border:1px solid #ddd;color:#666">Keine Artikel</td></tr>`}
          </tbody>
        </table>
      </div>
    `,
    )
    .join("");
}

export function openShipCombinedPrintWindow(orders, carrierName, trackings, dateStr) {
  const labels = buildShipLabelsHtml(orders, carrierName, trackings, dateStr);
  const liefer = buildShipLieferscheinHtml(orders, carrierName, trackings, dateStr);
  const body = `<div style="margin-bottom:24px"><div style="font-size:12px;color:#666;margin-bottom:8px">Versandaufkleber</div>${labels}</div><div style="page-break-before:always;padding-top:8px"><div style="font-size:12px;color:#666;margin-bottom:8px">Lieferschein</div>${liefer}</div>`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html><head><title>Versanddokumente</title><style>@media print{body{margin:0}} body{margin:20px}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`,
  );
  win.document.close();
}
