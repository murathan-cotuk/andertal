"use client";

import { useState, useEffect } from "react";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useAuthGuard, getToken } from "@andertal/lib";
import { Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountPageLayout, { ACCOUNT_PAGE_MAIN_INNER } from "@/components/account/AccountPageLayout";
import { getMedusaClient } from "@/lib/medusa-client";

const ORANGE = "#ff971c";

const STATUS_BG = {
  offen: "#fef3c7", in_bearbeitung: "#dbeafe", versendet: "#ede9fe",
  zugestellt: "#d1fae5", abgeschlossen: "#d1fae5", storniert: "#fee2e2",
  bezahlt: "#d1fae5", refunded: "#dbeafe", retoure: "#fee2e2",
  retoure_anfrage: "#fef3c7", pending: "#fef3c7", shipped: "#ede9fe",
  delivered: "#d1fae5", completed: "#d1fae5", cancelled: "#fee2e2",
  processing: "#dbeafe",
};
const STATUS_COLOR = {
  offen: "#92400e", in_bearbeitung: "#1e40af", versendet: "#6d28d9",
  zugestellt: "#166534", abgeschlossen: "#166534", storniert: "#991b1b",
  bezahlt: "#166534", refunded: "#1d4ed8", retoure: "#b91c1c",
  retoure_anfrage: "#b45309", pending: "#92400e", shipped: "#6d28d9",
  delivered: "#166534", completed: "#166534", cancelled: "#991b1b",
  processing: "#1e40af",
};
const STATUS_LABEL = {
  offen: "Offen", in_bearbeitung: "In Bearbeitung", versendet: "Versendet",
  zugestellt: "Zugestellt", abgeschlossen: "Abgeschlossen", storniert: "Storniert",
  bezahlt: "Bezahlt", refunded: "Erstattet", retoure: "Retoure",
  retoure_anfrage: "Rückgabe wird geprüft", pending: "Offen", shipped: "Versendet",
  delivered: "Zugestellt", completed: "Abgeschlossen", cancelled: "Storniert",
  processing: "In Bearbeitung",
};

const RETURN_STATUS_STYLE = {
  offen:       { bg: "#fef3c7", color: "#92400e", label: "Offen" },
  genehmigt:   { bg: "#d1fae5", color: "#166534", label: "Genehmigt" },
  abgelehnt:   { bg: "#fee2e2", color: "#991b1b", label: "Abgelehnt" },
  abgeschlossen: { bg: "#f3f4f6", color: "#374151", label: "Abgeschlossen" },
};

const TRACKING_URL_MAP = {
  dhl: "https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?lang=de&idc={n}",
  dpd: "https://tracking.dpd.de/status/de_DE/parcel/{n}",
  gls: "https://gls-group.com/track/{n}",
  ups: "https://www.ups.com/track?tracknum={n}&loc=de_DE",
  fedex: "https://www.fedex.com/fedextrack/?trknbr={n}",
  hermes: "https://www.myhermes.de/empfangen/sendungsverfolgung/#/search?trackNumber={n}",
  "go! express": "https://www.general-overnight.com/sendungsverfolgung/?tracking={n}",
  "go express": "https://www.general-overnight.com/sendungsverfolgung/?tracking={n}",
};

function buildTrackingUrl(carrier, num) {
  if (!num) return null;
  const tpl = TRACKING_URL_MAP[(carrier || "").toLowerCase().trim()];
  return tpl ? tpl.replace("{n}", encodeURIComponent(String(num).trim())) : null;
}

function displayStatus(order) {
  if (order.order_status === "refunded") return "refunded";
  if ((order.returns || []).some(r => r.refund_status === "erstattet")) return "refunded";
  const activeRet = (order.returns || []).find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  if (activeRet) return activeRet.status === "genehmigt" ? "retoure" : "retoure_anfrage";
  if (order.order_status === "retoure" || order.order_status === "retoure_anfrage") return order.order_status;
  const ds = String(order.delivery_status || "").toLowerCase();
  if (ds === "zugestellt") return "zugestellt";
  if (ds === "versendet") return "versendet";
  const os = String(order.order_status || "").toLowerCase();
  const ps = String(order.payment_status || "").toLowerCase();
  if ((ps === "bezahlt" || order.status === "paid") && (os === "offen" || os === "")) return "bezahlt";
  return order.order_status || order.delivery_status || "offen";
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtEur(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function StatusPill({ status }) {
  const k = (status || "").toLowerCase();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 700,
      color: STATUS_COLOR[k] || "#6b7280",
      background: STATUS_BG[k] || "#f3f4f6",
      borderRadius: 20, padding: "2px 9px",
      letterSpacing: 0.2, whiteSpace: "nowrap",
    }}>
      {STATUS_LABEL[k] || status || "—"}
    </span>
  );
}

const RETOURE_REASONS = [
  "Falsches Produkt erhalten",
  "Defektes / beschädigtes Produkt",
  "Falsche Größe / Farbe",
  "Nicht wie beschrieben",
  "Produkt gefällt mir nicht",
  "Doppelte Bestellung",
  "Sonstiges",
];

function aBtn(color, bg) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 12, fontWeight: 600, color, background: bg,
    border: `1px solid ${color}33`, borderRadius: 7,
    padding: "6px 11px", cursor: "pointer", whiteSpace: "nowrap",
  };
}

async function downloadBlob(endpoint, filename, token) {
  const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function OrderCard({ order, expanded, onToggle, onRefresh }) {
  const items = order.items || [];
  const returns = order.returns || [];
  const status = displayStatus(order);
  const total = Number(order.total_cents || 0);
  const subtotal = Number(order.subtotal_cents || 0);
  const shipping = Number(order.shipping_cents || 0);
  const discount = Number(order.discount_cents || 0);
  const vatAmount = Math.round(total * 19 / 119);
  const orderNum = order.order_number || order.id?.slice(0, 8).toUpperCase();
  const trackingUrl = buildTrackingUrl(order.carrier_name, order.tracking_number);

  const activeReturn = returns.find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  const hasApprovedReturn = returns.some(r => r.status === "genehmigt");
  const hasLabelSent = returns.some(r => r.label_sent_at);
  const blockedForReturn = ["storniert", "refunded", "cancelled", "retoure", "retoure_anfrage"];
  const canRequestReturn = !activeReturn && !blockedForReturn.includes(status);

  const [showRetoure, setShowRetoure] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [retoureReason, setRetoureReason] = useState(RETOURE_REASONS[0]);
  const [retoureNotes, setRetoureNotes] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [busy, setBusy] = useState(null);
  const [actionErr, setActionErr] = useState(null);
  const [actionOk, setActionOk] = useState(null);

  async function withBusy(key, fn) {
    setBusy(key); setActionErr(null); setActionOk(null);
    try { await fn(); } catch (e) { setActionErr(e.message || "Fehler"); } finally { setBusy(null); }
  }

  const token = () => getToken("customer");

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>

      {/* ── Header row (table columns, always visible) ── */}
      <div
        onClick={onToggle}
        style={{
          padding: "9px 14px",
          display: "grid",
          gridTemplateColumns: "minmax(145px, 180px) 1fr auto 30px",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          userSelect: "none",
          borderBottom: expanded ? "1px solid #f3f4f6" : "none",
        }}
      >
        {/* Col 1: #ORDER · date (same line) */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>
            #{orderNum}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
            · {fmtDate(order.created_at)}
          </span>
        </div>

        {/* Col 2: product names (ellipsis) */}
        <div style={{
          fontSize: 12, color: "#374151", fontWeight: 500,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
        }}>
          {items.map(it => it.title?.replace(/\s+\(.+\)$/, "") || "—").join(", ")}
        </div>

        {/* Col 3: status pill + price (same row) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <StatusPill status={status} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: -0.3 }}>
            {fmtEur(total)}
          </span>
        </div>

        {/* Col 4: chevron */}
        <div style={{
          width: 28, height: 28, borderRadius: "50%", border: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, color: "#6b7280",
          transition: "transform 0.2s, background 0.15s",
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          background: expanded ? "#f3f4f6" : "#fff",
        }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div>

          {/* Items table */}
          {items.length > 0 && (
            <div style={{ padding: "12px 14px 4px" }}>
              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 44px 90px 84px",
                gap: 8, paddingBottom: 6, borderBottom: "1px solid #e5e7eb",
              }}>
                {["Produkt", "Menge", "Einzelpreis", "Gesamt"].map((h, i) => (
                  <span key={h} style={{
                    fontSize: 10, fontWeight: 700, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: 0.5,
                    textAlign: i > 0 ? "right" : "left",
                  }}>{h}</span>
                ))}
              </div>
              {/* Rows */}
              {items.map((item, i) => {
                const name = item.title?.replace(/\s+\(.+\)$/, "") || "—";
                const variant = item.title?.match(/\((.+)\)$/)?.[1] || null;
                const lineTotal = (item.unit_price_cents || 0) * (item.quantity || 1);
                return (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr 44px 90px 84px",
                    gap: 8, alignItems: "center",
                    padding: "8px 0",
                    borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {item.thumbnail && (
                        <div style={{
                          width: 36, height: 36, borderRadius: 6, overflow: "hidden",
                          border: "1px solid #f3f4f6", flexShrink: 0, background: "#f9fafb",
                        }}>
                          <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                        {variant && <div style={{ fontSize: 11, color: "#9ca3af" }}>{variant}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#374151", textAlign: "right" }}>×{item.quantity || 1}</div>
                    <div style={{ fontSize: 13, color: "#374151", textAlign: "right" }}>{fmtEur(item.unit_price_cents || 0)}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "right" }}>{fmtEur(lineTotal)}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Price summary */}
          <div style={{ margin: "8px 14px 12px", background: "#f9fafb", borderRadius: 8, padding: "10px 12px", border: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", padding: "3px 0" }}>
              <span>Zwischensumme</span>
              <span style={{ fontWeight: 500 }}>{fmtEur(subtotal || (total - shipping + discount))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", padding: "3px 0" }}>
              <span>Versand</span>
              <span style={{ fontWeight: 500 }}>{shipping === 0 ? "Kostenlos" : fmtEur(shipping)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#dc2626", padding: "3px 0" }}>
                <span>Rabatt</span>
                <span style={{ fontWeight: 500 }}>−{fmtEur(discount)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#111827", padding: "8px 0 3px", borderTop: "1px solid #e5e7eb", marginTop: 6 }}>
              <span>Gesamt</span>
              <span>{fmtEur(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", padding: "1px 0" }}>
              <span>davon 19% MwSt.</span>
              <span>{fmtEur(vatAmount)}</span>
            </div>
          </div>

          {/* Tracking */}
          {order.tracking_number && (
            <div style={{
              margin: "0 14px 12px",
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              background: "#f0f9ff", border: "1px solid #bae6fd",
              borderRadius: 8, padding: "8px 12px",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
              <span style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                {order.carrier_name && (
                  <strong style={{ color: "#0369a1" }}>{order.carrier_name} · </strong>
                )}
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ color: "#0284c7", fontFamily: "monospace", textDecoration: "underline", cursor: "pointer" }}
                  >
                    {order.tracking_number}
                  </a>
                ) : (
                  <span style={{ fontFamily: "monospace", color: "#374151" }}>{order.tracking_number}</span>
                )}
              </span>
              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 11, fontWeight: 700, color: "#0284c7", whiteSpace: "nowrap", textDecoration: "none" }}
                >
                  Sendung verfolgen →
                </a>
              )}
            </div>
          )}

          {/* Return requests */}
          {returns.length > 0 && (
            <div style={{ margin: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {returns.map((r, i) => {
                const rs = (r.status || "offen").toLowerCase();
                const style = RETURN_STATUS_STYLE[rs] || { bg: "#f3f4f6", color: "#374151", label: r.status };
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                    background: style.bg, borderRadius: 8, padding: "7px 12px",
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={style.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 700, color: style.color }}>
                      Retoure{r.return_number ? ` #${r.return_number}` : ""}
                    </span>
                    <span style={{ fontSize: 11, color: style.color }}>· {style.label}</span>
                    {r.reason && <span style={{ fontSize: 11, color: style.color, opacity: 0.75 }}>· {r.reason}</span>}
                    {r.created_at && (
                      <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>{fmtDate(r.created_at)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Feedback messages */}
          {actionErr && (
            <div style={{ margin: "0 14px 8px", background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
              {actionErr}
            </div>
          )}
          {actionOk && (
            <div style={{ margin: "0 14px 8px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
              {actionOk}
            </div>
          )}

          {/* Action buttons */}
          <div style={{
            padding: "10px 14px 12px",
            borderTop: "1px solid #f3f4f6",
            display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center",
          }}>
            {/* Rechnung */}
            <button
              onClick={e => { e.stopPropagation(); withBusy("invoice", () => downloadBlob(`/api/store-invoice/${order.id}`, `Rechnung-${orderNum}.pdf`, token())); }}
              disabled={busy === "invoice"}
              style={aBtn("#374151", "#f9fafb")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {busy === "invoice" ? "…" : "Rechnung"}
            </button>

            {/* Retourenschein (if return approved) */}
            {hasApprovedReturn && (
              <button
                onClick={e => { e.stopPropagation(); withBusy("retourenschein", () => downloadBlob(`/api/store-return-retourenschein/${order.id}`, `Retourenschein-${orderNum}.pdf`, token())); }}
                disabled={busy === "retourenschein"}
                style={aBtn("#6d28d9", "#ede9fe")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                {busy === "retourenschein" ? "…" : "Retourenschein"}
              </button>
            )}

            {/* Rücksende-Etikett (if label was sent) */}
            {hasLabelSent && (
              <button
                onClick={e => { e.stopPropagation(); withBusy("etikett", () => downloadBlob(`/api/store-return-etikett/${order.id}`, `Ruecksende-Etikett-${orderNum}.pdf`, token())); }}
                disabled={busy === "etikett"}
                style={aBtn("#0369a1", "#e0f2fe")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                {busy === "etikett" ? "…" : "Rücksende-Etikett"}
              </button>
            )}

            {/* Retoure anfragen */}
            {canRequestReturn && (
              <button
                onClick={e => { e.stopPropagation(); setShowRetoure(v => !v); setShowMessage(false); }}
                style={aBtn(ORANGE, "#fff7ed")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.96"/>
                </svg>
                Retoure anfragen
              </button>
            )}

            {/* Nachricht */}
            <button
              onClick={e => { e.stopPropagation(); setShowMessage(v => !v); setShowRetoure(false); }}
              style={aBtn("#374151", "#f9fafb")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Nachricht
            </button>

            {/* Vollständige Details */}
            <Link
              href={`/order/${order.id}`}
              onClick={e => e.stopPropagation()}
              style={{ ...aBtn(ORANGE, "#fff7ed"), textDecoration: "none", marginLeft: "auto" }}
            >
              Details
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </Link>

            {/* Stornieren */}
            {order.cancellation_allowed && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  if (!confirm("Bestellung wirklich stornieren?")) return;
                  withBusy("cancel", async () => {
                    const res = await getMedusaClient().request(`/store/orders/${order.id}/cancel`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token()}` },
                      body: JSON.stringify({}),
                    });
                    if (res?.__error) throw new Error(res.message || "Stornierung fehlgeschlagen");
                    setActionOk("Bestellung erfolgreich storniert.");
                    onRefresh?.();
                  });
                }}
                disabled={busy === "cancel"}
                style={aBtn("#dc2626", "#fef2f2")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {busy === "cancel" ? "…" : "Stornieren"}
              </button>
            )}
          </div>

          {/* Retoure form (inline) */}
          {showRetoure && (
            <div style={{ margin: "0 14px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Rückgabe anfragen</div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Grund</label>
                <select
                  value={retoureReason}
                  onChange={e => setRetoureReason(e.target.value)}
                  style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", background: "#fff" }}
                >
                  {RETOURE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Anmerkungen (optional)</label>
                <textarea
                  value={retoureNotes}
                  onChange={e => setRetoureNotes(e.target.value)}
                  rows={3}
                  placeholder="Beschreiben Sie den Grund genauer…"
                  style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    withBusy("retoure", async () => {
                      const res = await getMedusaClient().request(`/store/orders/${order.id}/return-request`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token()}` },
                        body: JSON.stringify({ reason: retoureReason, notes: retoureNotes }),
                      });
                      if (res?.__error) throw new Error(res.message || "Fehler");
                      setActionOk("Retouranfrage erfolgreich eingereicht.");
                      setShowRetoure(false);
                      onRefresh?.();
                    });
                  }}
                  disabled={busy === "retoure"}
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: ORANGE, border: "none", borderRadius: 7, padding: "8px 16px", cursor: "pointer" }}
                >
                  {busy === "retoure" ? "Wird gesendet…" : "Anfrage senden"}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setShowRetoure(false); }}
                  style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "8px" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Message form (inline) */}
          {showMessage && (
            <div style={{ margin: "0 14px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Nachricht senden</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Nachricht</label>
                <textarea
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  rows={4}
                  placeholder={`Ihre Frage oder Anmerkung zu Bestellung #${orderNum}…`}
                  style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, color: "#111827", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (!messageBody.trim()) return;
                    withBusy("message", async () => {
                      const res = await getMedusaClient().request("/store/messages", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token()}` },
                        body: JSON.stringify({
                          order_id: order.id,
                          body: messageBody,
                          subject: `Anfrage zu Bestellung #${orderNum}`,
                        }),
                      });
                      if (res?.__error) throw new Error(res.message || "Fehler");
                      setActionOk("Nachricht gesendet.");
                      setShowMessage(false);
                      setMessageBody("");
                    });
                  }}
                  disabled={busy === "message" || !messageBody.trim()}
                  style={{
                    fontSize: 13, fontWeight: 700, color: "#fff", background: "#374151",
                    border: "none", borderRadius: 7, padding: "8px 16px", cursor: "pointer",
                    opacity: (!messageBody.trim() || busy === "message") ? 0.6 : 1,
                  }}
                >
                  {busy === "message" ? "Wird gesendet…" : "Absenden"}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setShowMessage(false); }}
                  style={{ fontSize: 13, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "8px" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  function fetchOrders() {
    const tok = getToken("customer");
    if (!tok) { setLoading(false); return; }
    getMedusaClient().request("/store/orders/me", {
      headers: { Authorization: `Bearer ${tok}` },
    })
      .then(res => {
        if (res?.__error) setError(res.message || "Fehler");
        else setOrders(res?.orders || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, []);

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      <main style={{ flex: 1 }}>
        <div style={ACCOUNT_PAGE_MAIN_INNER}>
          <AccountPageLayout title="Meine Bestellungen">
            <div>
              {loading && <NewtonsCradle />}

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "12px 16px", borderRadius: 10, fontSize: 13 }}>
                  Fehler beim Laden der Bestellungen.
                </div>
              )}

              {!loading && !error && orders.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🛍️</div>
                  <p style={{ color: "#9ca3af", fontSize: 15, marginBottom: 20, fontWeight: 500 }}>Noch keine Bestellungen vorhanden.</p>
                  <Link href="/" style={{
                    background: ORANGE, color: "#fff", padding: "10px 24px", borderRadius: 10,
                    fontWeight: 700, textDecoration: "none", border: "2px solid #000",
                    boxShadow: "0 2px 0 2px #000", fontSize: 13,
                  }}>
                    Zum Shop
                  </Link>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={!!expanded[order.id]}
                      onToggle={() => toggleExpand(order.id)}
                      onRefresh={fetchOrders}
                    />
                  ))}
                </div>
              )}
            </div>
          </AccountPageLayout>
        </div>
      </main>
      <Footer />
    </div>
  );
}
