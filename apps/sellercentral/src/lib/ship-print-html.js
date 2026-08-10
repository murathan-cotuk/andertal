/** HTML for shipping labels / delivery notes (print window). */

import { getShipStrings } from "./ship-i18n";

/** carrierName may be a fixed string (legacy) or a per-order resolver (order) => string. */
const resolveCarrierName = (carrierName, order) =>
  typeof carrierName === "function" ? (carrierName(order) || "—") : (carrierName || "—");

// Item title bakes the variant as a trailing "(...)" at checkout — split it back out so it can
// render as a smaller, muted note under the title instead of inline in parentheses.
function splitItemTitle(title) {
  const s = String(title || "").trim();
  const m = s.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m || !m[1].trim()) return { main: s, note: "" };
  return { main: m[1].trim(), note: m[2].trim() };
}

export function buildShipLabelsHtml(orders, carrierName, trackings, dateStr, locale = "de") {
  const s = getShipStrings(locale);
  return orders
    .map(
      (o) => `
      <div class="label" style="page-break-inside:avoid;border:2px solid #000;padding:20px;margin-bottom:20px;font-family:Arial,sans-serif;width:90mm;box-sizing:border-box;">
        <div style="font-size:11px;color:#666;margin-bottom:8px">${s.shippingLabelHeader}</div>
        <div style="font-size:18px;font-weight:bold;margin-bottom:12px">${s.order} #${o.order_number || "—"}</div>
        <div style="font-size:13px;margin-bottom:4px"><strong>${[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}</strong></div>
        <div style="font-size:12px">${o.address_line1 || "—"}</div>
        <div style="font-size:12px">${[o.postal_code, o.city].filter(Boolean).join(" ")}</div>
        <div style="font-size:12px">${o.country || "—"}</div>
        <hr style="margin:12px 0">
        <div style="font-size:11px;color:#666">${s.carrier}: <strong>${resolveCarrierName(carrierName, o)}</strong></div>
        <div style="font-size:11px;color:#666">${s.trackingNumber}: <strong>${trackings[o.id] || "—"}</strong></div>
        <div style="font-size:11px;color:#666">${s.date}: ${dateStr}</div>
        <div style="margin-top:12px;border:1px solid #ccc;height:40px;display:flex;align-items:center;justify-content:center;font-size:20px;letter-spacing:4px">${trackings[o.id] || "—"}</div>
      </div>
    `,
    )
    .join("");
}

export function buildShipLieferscheinHtml(orders, carrierName, trackings, dateStr, locale = "de") {
  const s = getShipStrings(locale);
  const lineItems = (o) => o._items || o.items || [];
  return orders
    .map(
      (o) => `
      <div style="page-break-inside:avoid;padding:30px;font-family:Arial,sans-serif;border-bottom:2px dashed #ccc;margin-bottom:20px">
        <h2 style="margin:0 0 16px">${s.deliveryNote} — ${s.order} #${o.order_number || "—"}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <div>
            <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:4px">${s.deliveryAddress}</div>
            <div><strong>${[o.first_name, o.last_name].filter(Boolean).join(" ") || "—"}</strong></div>
            <div>${o.address_line1 || "—"}</div>
            <div>${[o.postal_code, o.city].filter(Boolean).join(" ")}</div>
            <div>${o.country || ""}</div>
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;color:#666;margin-bottom:4px">${s.shippingInfo}</div>
            <div>${s.date}: ${dateStr}</div>
            ${resolveCarrierName(carrierName, o) !== "—" ? `<div>${s.carrier}: ${resolveCarrierName(carrierName, o)}</div>` : ""}
            ${trackings[o.id] ? `<div>${s.trackingNumber}: ${trackings[o.id]}</div>` : ""}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left;border:1px solid #ddd">${s.item}</th>
              <th style="padding:8px;text-align:center;border:1px solid #ddd">${s.quantity}</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems(o)
              .map((it) => {
                const { main: itemMain, note: itemNote } = splitItemTitle(it.title);
                const titleHtml = itemNote
                  ? `${itemMain || "—"}<br/><span style="font-size:11px;color:#9ca3af;">${itemNote}</span>`
                  : (itemMain || "—");
                return `<tr><td style="padding:8px;border:1px solid #ddd">${titleHtml}</td><td style="padding:8px;text-align:center;border:1px solid #ddd">${it.quantity}</td></tr>`;
              })
              .join("") || `<tr><td colspan="2" style="padding:8px;border:1px solid #ddd;color:#666">${s.noItems}</td></tr>`}
          </tbody>
        </table>
      </div>
    `,
    )
    .join("");
}

export function openShipCombinedPrintWindow(orders, carrierName, trackings, dateStr, locale = "de") {
  const s = getShipStrings(locale);
  const labels = buildShipLabelsHtml(orders, carrierName, trackings, dateStr, locale);
  const liefer = buildShipLieferscheinHtml(orders, carrierName, trackings, dateStr, locale);
  const body = `<div style="margin-bottom:24px"><div style="font-size:12px;color:#666;margin-bottom:8px">${s.shippingLabels}</div>${labels}</div><div style="page-break-before:always;padding-top:8px"><div style="font-size:12px;color:#666;margin-bottom:8px">${s.deliveryNote}</div>${liefer}</div>`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html><head><title>${s.shippingDocuments}</title><style>@media print{body{margin:0}} body{margin:20px}</style></head><body>${body}<script>window.onload=()=>window.print()<\/script></body></html>`,
  );
  win.document.close();
}
