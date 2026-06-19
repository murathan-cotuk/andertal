"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { statusLabel } from "@/lib/status-labels";
import styled from "styled-components";
import { Card } from "@andertal/ui";
import { Button, InlineStack } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl } from "@/lib/order-pdf-url";
import ShipOrdersModal from "@/components/orders/ShipOrdersModal";
import ShipLabelModal from "@/components/orders/ShipLabelModal";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import { confirmDelete } from "@/lib/confirm-delete";
import { getUI } from "@/lib/ui-strings";
import { lt } from "@/lib/locale-text";
import { resolveSellerFacingError, readSellerIsSuperuser } from "@/lib/seller-system-errors";

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const date = dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date} / ${time}`;
}

const ORDER_STATUS_OPTIONS = ["offen", "in_bearbeitung", "abgeschlossen", "retoure_anfrage", "retoure", "refunded", "storniert"];
const PAYMENT_STATUS_OPTIONS = ["offen", "bezahlt", "teil_erstattet", "erstattet"];
const DELIVERY_STATUS_OPTIONS = ["offen", "versendet", "zugestellt"];

const COUNTRY_VAT = {
  DE: { rate: 19, label: "MwSt." }, AT: { rate: 20, label: "MwSt." },
  CH: { rate: 7.7, label: "MWST" }, FR: { rate: 20, label: "TVA" },
  IT: { rate: 22, label: "IVA" }, ES: { rate: 21, label: "IVA" },
  TR: { rate: 20, label: "KDV" }, GB: { rate: 20, label: "VAT" }, US: { rate: 0, label: "Tax" },
};
function getVatInfo(country) {
  if (!country) return { rate: 19, label: "MwSt." };
  const c = String(country).toUpperCase().trim().slice(0, 2);
  return COUNTRY_VAT[c] || { rate: 19, label: "MwSt." };
}

function isOwnSellerOrder(order, mySellerId) {
  const s = String(order?.seller_id ?? "default").trim();
  if (!s || s === "default") return true;
  return s === String(mySellerId || "").trim();
}

const STATUS_COLORS = {
  offen: { bg: "#fff7ed", color: "#c2410c" },
  in_bearbeitung: { bg: "#eff6ff", color: "#1d4ed8" },
  abgeschlossen: { bg: "#f0fdf4", color: "#15803d" },
  retoure: { bg: "#fef2f2", color: "#b91c1c" },
  retoure_anfrage: { bg: "#fffbeb", color: "#b45309" },
  refunded: { bg: "#eff6ff", color: "#1d4ed8" },
  storniert: { bg: "#fef2f2", color: "#b91c1c" },
  bezahlt: { bg: "#f0fdf4", color: "#15803d" },
  teil_erstattet: { bg: "#fffbeb", color: "#b45309" },
  erstattet: { bg: "#fef2f2", color: "#b91c1c" },
  versendet: { bg: "#eff6ff", color: "#1d4ed8" },
  zugestellt: { bg: "#f0fdf4", color: "#15803d" },
};

function StatusBadge({ value }) {
  const locale = useLocale();
  const s = STATUS_COLORS[value] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {value ? statusLabel(locale, value) : "—"}
    </span>
  );
}

/* ── Layout (Produkte-Seite: Container + Card + Raster) ───────── */
const PageContainer = styled.div`
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 8px 0 24px;
  min-height: 100%;
  background: transparent;
`;

const PageHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

const PageTitle = styled.h1`
  font-size: 26px;
  font-weight: 650;
  margin: 0;
  color: #111827;
`;

const HeaderMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
`;

const Section = styled(Card)`
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
`;

const SectionHeading = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 12px;
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: end;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FilterField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FieldLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #4b5563;
`;

const FilterInput = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  color: #1f2937;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }
  &::placeholder {
    color: #9ca3af;
  }
`;

const FilterSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  color: #1f2937;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
  }
`;

const TableCard = styled(Card)`
  padding: 0;
  margin-bottom: 16px;
  overflow: clip;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
`;

const BulkBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #f8fafc;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
`;

const SuperuserSectionLabel = styled.td`
  padding: 12px 20px !important;
  background: #eff6ff !important;
  border-bottom: 1px solid #bfdbfe !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  color: #1e40af !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const SellerOrdersSectionLabel = styled.td`
  padding: 12px 20px !important;
  background: #f3f4f6 !important;
  border-bottom: 1px solid #e5e7eb !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  color: #374151 !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const SellerGroupHeader = styled.td`
  padding: 0 !important;
  background: #f9fafb !important;
  border-bottom: 1px solid #e5e7eb !important;
`;


function fmtCentsWithSymbol(c, symbol = "€") {
  const val = (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  return symbol === "€" ? val + " €" : symbol + " " + val;
}

/** Öffentliche Sendungsverfolgung (Carrier-Heuristik, gleiche Logik wie Backend-Defaults) */
function buildCarrierTrackingUrl(carrierName, trackingNumber) {
  const raw = String(trackingNumber || "").trim();
  if (!raw) return null;
  const tn = encodeURIComponent(raw);
  const c = String(carrierName || "").toLowerCase().trim();
  if (c.includes("dhl")) return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?lang=de&idc=${tn}`;
  if (c.includes("dpd")) return `https://tracking.dpd.de/status/de_DE/parcel/${tn}`;
  if (c.includes("gls")) return `https://gls-group.com/track/${tn}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${tn}&loc=de_DE`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${tn}`;
  if (c.includes("hermes")) return `https://www.myhermes.de/empfangen/sendungsverfolgung/#/search?trackNumber=${tn}`;
  if (c.includes("go") && c.includes("express")) return `https://www.general-overnight.com/sendungsverfolgung/?tracking=${tn}`;
  return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?lang=de&idc=${tn}`;
}

function ExpandedRow({ order, locale = "de", onSaveFields, colCount = 13, ui }) {
  ui = ui || getUI(locale);
  const items = order._items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0);
  const total = subtotal || order.subtotal_cents || order.total_cents || 0;
  const vat = getVatInfo(order.country);
  const totalNetto = vat.rate > 0 ? Math.round(total / (1 + vat.rate / 100)) : total;
  const totalVat = total - totalNetto;

  const [trackDraft, setTrackDraft] = useState(order.tracking_number || "");
  const [savingTrack, setSavingTrack] = useState(false);
  useEffect(() => {
    setTrackDraft(order.tracking_number || "");
  }, [order.id, order.tracking_number]);

  const trackingUrl = buildCarrierTrackingUrl(order.carrier_name, order.tracking_number);

  return (
    <tr>
      <td colSpan={colCount} style={{ padding: 0, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ padding: "16px 24px 20px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Button url={getOrderPdfDownloadUrl(order.id, "invoice", locale)} external variant="secondary" size="slim">
              {ui.invoice}
            </Button>
            <Button url={getOrderPdfDownloadUrl(order.id, "lieferschein", locale)} external variant="secondary" size="slim">
              {ui.deliveryNote}
            </Button>
            <Button url={`/inbox?order_id=${order.id}`} variant="secondary" size="slim">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="14" height="14"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                {ui.message}
              </span>
            </Button>
          </div>
          <div
            style={{
              marginBottom: 16,
              padding: "16px 18px",
              background: "#fff",
              borderRadius: 8,
              border: "2px solid #e5e7eb",
              fontSize: 13,
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontWeight: 700, color: "#374151", marginBottom: 8, fontSize: 14 }}>{ui.shippingTracking}</div>
            {order.carrier_name ? (
              <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>{ui.carrier}: <strong style={{ color: "#111827" }}>{order.carrier_name}</strong></div>
            ) : (
              <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>{ui.noCarrier}</div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={trackDraft}
                onChange={(e) => setTrackDraft(e.target.value)}
                placeholder={ui.enterTrackingNumber}
                autoComplete="off"
                style={{
                  flex: "1 1 200px",
                  minWidth: 160,
                  maxWidth: 360,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "2px solid #e5e7eb",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                }}
              />
              <Button
                size="medium"
                variant="secondary"
                disabled={savingTrack || !onSaveFields}
                loading={savingTrack}
                onClick={async () => {
                  if (!onSaveFields) return;
                  setSavingTrack(true);
                  try {
                    await onSaveFields(order.id, { tracking_number: trackDraft.trim() || null });
                  } catch {
                    /* handleUpdate schluckt Fehler */
                  }
                  setSavingTrack(false);
                }}
              >
                {ui.save}
              </Button>
            </div>
            {order.tracking_number ? (
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <span style={{ color: "#6b7280", marginRight: 6 }}>{ui.savedTracking}</span>
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, color: "#111827", textDecoration: "underline", textDecorationColor: "#9ca3af" }}
                  >
                    {order.tracking_number}
                  </a>
                ) : (
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{order.tracking_number}</span>
                )}
                {trackingUrl ? (
                  <span style={{ color: "#9ca3af", marginLeft: 8 }}>{ui.clickTracking}</span>
                ) : null}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>{ui.noTrackingYet}</div>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 8, overflow: "hidden", border: "2px solid #e5e7eb" }}>
            <thead>
              <tr style={{ color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>{ui.product}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{ui.qty}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{ui.unitPrice}</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>{ui.total}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "8px", color: "#9ca3af", textAlign: "center" }}>{ui.noItems}</td></tr>
              )}
              {items.map((it, i) => {
                const itemBrutto = (it.unit_price_cents || 0) * (it.quantity || 1);
                const itemNetto = vat.rate > 0 ? Math.round(itemBrutto / (1 + vat.rate / 100)) : itemBrutto;
                return (
                  <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "6px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />}
                        <div>
                          {it.product_id ? (
                            <a href={`/${locale}/products/${it.product_id}`} style={{ color: "#111827", textDecoration: "underline", textDecorationColor: "#d1d5db" }}>{it.title || "—"}</a>
                          ) : (
                            <div>{it.title || "—"}</div>
                          )}
                          {vat.rate > 0 && (
                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                              {ui.net}: {fmtCents(Math.round((it.unit_price_cents || 0) / (1 + vat.rate / 100)))} · +{vat.label} {vat.rate}%: {fmtCents(Math.round((it.unit_price_cents || 0) - (it.unit_price_cents || 0) / (1 + vat.rate / 100)))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px" }}>{it.quantity}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtCents(it.unit_price_cents)}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{fmtCents(itemBrutto)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* 1. Netto */}
              <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                <td colSpan={3} style={{ textAlign: "right", padding: "5px 8px", color: "#6b7280" }}>
                  {ui.net}{vat.rate > 0 ? ` (excl. ${vat.label})` : ""}
                </td>
                <td style={{ textAlign: "right", padding: "5px 8px" }}>{fmtCents(totalNetto)}</td>
              </tr>
              {/* 2. Vergi */}
              {vat.rate > 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", padding: "5px 8px", color: "#6b7280" }}>
                    {vat.label} ({vat.rate}%)
                  </td>
                  <td style={{ textAlign: "right", padding: "5px 8px" }}>{fmtCents(totalVat)}</td>
                </tr>
              )}
              {/* 3. Brutto Zwischensumme (bold) */}
              <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{ui.subtotal}</td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{fmtCents(subtotal)}</td>
              </tr>
              {/* 4. Versandkosten */}
              <tr>
                <td colSpan={3} style={{ textAlign: "right", padding: "5px 8px", color: "#6b7280" }}>{ui.shipping}</td>
                <td style={{ textAlign: "right", padding: "5px 8px" }}>{ui.shippingFree}</td>
              </tr>
              {/* 5. Gesamtkosten (bolder) */}
              <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                <td colSpan={3} style={{ textAlign: "right", padding: "7px 8px", fontWeight: 800, fontSize: 13 }}>{ui.grandTotal}</td>
                <td style={{ textAlign: "right", padding: "7px 8px", fontWeight: 800, fontSize: 13 }}>{fmtCents(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  );
}

function CustomerCell({ order, locale, router, isSuperuser }) {
  const [navigating, setNavigating] = useState(false);
  const _ui = getUI(locale || "de");

  const handleClick = async (e) => {
    e.stopPropagation();
    if (navigating) return;
    if (order.customer_id) {
      router.push(`/${locale}/customers/${order.customer_id}`);
      return;
    }
    if (!order.email) return;
    setNavigating(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getCustomers({ search: order.email, limit: 1 });
      const found = data?.customers?.[0];
      if (found?.id) router.push(`/${locale}/customers/${found.id}`);
    } catch { }
    setNavigating(false);
  };

  const name = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const label = isSuperuser && order.customer_number ? `${order.customer_number} – ${name}` : name;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
        <button
          onClick={handleClick}
          style={{ background: "none", border: "none", padding: 0, cursor: navigating ? "wait" : "pointer", textAlign: "left", fontWeight: 600, fontSize: 13, color: navigating ? "#9ca3af" : "#111827", textDecoration: "underline" }}
        >
          {label}
        </button>
        {isSuperuser && order.is_guest && (
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>
            {_ui.guestBadge}
          </span>
        )}
      </div>
      {isSuperuser && <div style={{ fontSize: 11, color: "#9ca3af" }}>{order.email || ""}</div>}
    </div>
  );
}

function ActionMenu({ order, onUpdate, onDelete, onVersenden, isSuperuser }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, bottom: "auto", right: 0, openUp: false });
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "de";
  const ref = React.useRef(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < 220;
      setPos({
        top: openUp ? "auto" : rect.bottom + 4,
        bottom: openUp ? (window.innerHeight - rect.top + 4) : "auto",
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }} onMouseDown={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={handleToggle} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 16, color: "#6b7280" }}>⋯</button>
      {open && (
        <div ref={menuRef} style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,.1)", zIndex: 9999, minWidth: 170, overflow: "hidden" }}>
          {(() => {
            const _ui = getUI(locale);
            return [
              { label: _ui.viewDetails, action: () => { router.push(`/${locale}/orders/${order.id}`); setOpen(false); } },
              { label: _ui.ship, action: () => { onVersenden?.(); setOpen(false); } },
              { label: _ui.cancelOrder, action: () => { onUpdate(order.id, { order_status: "storniert" }); setOpen(false); }, danger: true },
              ...(isSuperuser ? [{ label: _ui.deleteOrder, action: async () => { if (await confirmDelete(_ui.deleteOrder + "?")) { onDelete(order.id); } setOpen(false); }, danger: true }] : []),
            ];
          })().map((item, i, arr) => (
            <button key={i} onClick={item.action} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", fontSize: 13, cursor: "pointer", color: item.danger ? "#b91c1c" : "#111827", borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              {item.icon ? <span style={{ marginRight: 6 }}>{item.icon}</span> : null}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_ORDER_FORM = {
  email: "", first_name: "", last_name: "", phone: "", country: "DE",
  address_line1: "", zip_code: "", city: "",
  order_status: "offen", payment_status: "offen", delivery_status: "offen",
  payment_method: "", currency: "EUR", notes: "",
  shipping_cents: "", discount_cents: "",
  items: [{ title: "", quantity: 1, unit_price_cents: "" }],
};

function ManualOrderModal({ onClose, onCreated, locale = "de" }) {
  const [form, setForm] = useState(EMPTY_ORDER_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ui = getUI(locale);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => setForm(f => {
    const items = [...f.items];
    items[i] = { ...items[i], [k]: v };
    return { ...f, items };
  });
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { title: "", quantity: 1, unit_price_cents: "" }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  const itemsTotal = form.items.reduce((s, it) => s + (Number(it.unit_price_cents||0) * Number(it.quantity||1)), 0);
  const total = itemsTotal + Number(form.shipping_cents||0) - Number(form.discount_cents||0);

  const handleSave = async () => {
    if (!form.email) { setErr(ui.email + " required"); return; }
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const payload = {
        ...form,
        items: form.items.filter(it => it.title),
        shipping_cents: Number(form.shipping_cents||0),
        discount_cents: Number(form.discount_cents||0),
      };
      await client.createOrder(payload);
      onCreated();
      onClose();
    } catch (e) { setErr(e?.message || ui.error); }
    setSaving(false);
  };

  const inp = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 3 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ui.manualOrder}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          {/* Customer */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ui.customerData}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>{ui.email} *</label><input style={inp} value={form.email} onChange={e => setF("email", e.target.value)} /></div>
              <div><label style={lbl}>{ui.firstName}</label><input style={inp} value={form.first_name} onChange={e => setF("first_name", e.target.value)} /></div>
              <div><label style={lbl}>{ui.lastName}</label><input style={inp} value={form.last_name} onChange={e => setF("last_name", e.target.value)} /></div>
              <div><label style={lbl}>{ui.phone}</label><input style={inp} value={form.phone} onChange={e => setF("phone", e.target.value)} /></div>
              <div><label style={lbl}>{ui.country}</label><input style={inp} value={form.country} onChange={e => setF("country", e.target.value)} placeholder="DE" /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>{ui.street}</label><input style={inp} value={form.address_line1} onChange={e => setF("address_line1", e.target.value)} /></div>
              <div><label style={lbl}>{ui.postalCode}</label><input style={inp} value={form.zip_code} onChange={e => setF("zip_code", e.target.value)} /></div>
              <div><label style={lbl}>{ui.city}</label><input style={inp} value={form.city} onChange={e => setF("city", e.target.value)} /></div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ui.items}</div>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>{ui.itemName}</label><input style={inp} value={it.title} onChange={e => setItem(i, "title", e.target.value)} /></div>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>{ui.itemQty}</label><input style={inp} type="number" min="1" value={it.quantity} onChange={e => setItem(i, "quantity", e.target.value)} /></div>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>{ui.itemPrice}</label><input style={inp} type="number" value={it.unit_price_cents} onChange={e => setItem(i, "unit_price_cents", e.target.value)} placeholder="1990" /></div>
                <button onClick={() => removeItem(i)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 5, cursor: "pointer", color: "#9ca3af", height: 34 }}>×</button>
              </div>
            ))}
            <Button variant="plain" onClick={addItem}>
              {ui.addItem}
            </Button>
          </div>

          {/* Costs */}
          <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>{ui.shippingCents}</label><input style={inp} type="number" value={form.shipping_cents} onChange={e => setF("shipping_cents", e.target.value)} placeholder="0" /></div>
            <div><label style={lbl}>{ui.discountCents}</label><input style={inp} type="number" value={form.discount_cents} onChange={e => setF("discount_cents", e.target.value)} placeholder="0" /></div>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>{ui.orderStatusLabel}</label>
              <select style={inp} value={form.order_status} onChange={e => setF("order_status", e.target.value)}>
                {["offen","in_bearbeitung","abgeschlossen","storniert"].map(s => <option key={s} value={s}>{statusLabel(locale, s)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{ui.paymentStatusLabel}</label>
              <select style={inp} value={form.payment_status} onChange={e => setF("payment_status", e.target.value)}>
                {["offen","bezahlt","teil_erstattet","erstattet"].map(s => <option key={s} value={s}>{statusLabel(locale, s)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{ui.deliveryStatusLabel}</label>
              <select style={inp} value={form.delivery_status} onChange={e => setF("delivery_status", e.target.value)}>
                {["offen","versendet","zugestellt"].map(s => <option key={s} value={s}>{statusLabel(locale, s)}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>{ui.paymentMethod}</label><input style={inp} value={form.payment_method} onChange={e => setF("payment_method", e.target.value)} /></div>
            <div><label style={lbl}>{ui.currency}</label>
              <select style={inp} value={form.currency} onChange={e => setF("currency", e.target.value)}>
                {["EUR","CHF","USD","GBP","TRY"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}><label style={lbl}>{ui.notes}</label><textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.notes} onChange={e => setF("notes", e.target.value)} /></div>

          {/* Summary */}
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", marginBottom: 4 }}>
              <span>{ui.summarySubtotal}</span><span>{(itemsTotal/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
            </div>
            {Number(form.shipping_cents||0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", marginBottom: 4 }}>
                <span>{ui.summaryShipping}</span><span>+{(Number(form.shipping_cents)/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
              </div>
            )}
            {Number(form.discount_cents||0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", marginBottom: 4 }}>
                <span>{ui.summaryDiscount}</span><span>−{(Number(form.discount_cents)/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
              <span>{ui.summaryTotal}</span><span>{(total/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
            </div>
          </div>
        </div>

        {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
          <InlineStack gap="200">
            <Button onClick={onClose}>{ui.cancel}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving} loading={saving}>
              {ui.createOrder}
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}

// COL_DEFS_BASE holds static keys; labels are resolved per-render from ui-strings
const COL_DEFS_BASE = [
  { key: "sel",             labelKey: "",                hideable: false, sortKey: null,           defaultWidth: 32,  align: "left"   },
  { key: "exp",             labelKey: "",                hideable: false, sortKey: null,           defaultWidth: 32,  align: "left"   },
  { key: "order_number",    labelKey: "colOrderNumber",  hideable: true,  sortKey: "order_number", defaultWidth: 120, align: "left"   },
  { key: "customer",        labelKey: "colCustomer",     hideable: true,  sortKey: "name",         defaultWidth: 240, align: "left"   },
  { key: "address",         labelKey: "colAddress",      hideable: true,  sortKey: null,           defaultWidth: 180, align: "left"   },
  { key: "amount",          labelKey: "colAmount",       hideable: true,  sortKey: "total",        defaultWidth: 120, align: "right"  },
  { key: "order_status",    labelKey: "colOrderStatus",  hideable: true,  sortKey: "status",       defaultWidth: 140, align: "center" },
  { key: "payment_status",  labelKey: "colPaymentStatus",hideable: true,  sortKey: null,           defaultWidth: 140, align: "center" },
  { key: "delivery_status", labelKey: "colDeliveryStatus",hideable: true, sortKey: null,           defaultWidth: 130, align: "center" },
  { key: "date",            labelKey: "colDate",         hideable: true,  sortKey: "created_at",   defaultWidth: 145, align: "left"   },
  { key: "country",         labelKey: "colCountry",      hideable: true,  sortKey: "country",      defaultWidth: 70,  align: "center" },
  { key: "review",          labelKey: "colReview",       hideable: true,  sortKey: null,           defaultWidth: 100, align: "center" },
  { key: "actions",         labelKey: "",                hideable: false, sortKey: null,           defaultWidth: 210, align: "right"  },
];
// Kept for backward compat in column-width tracking
const COL_DEFS = COL_DEFS_BASE;

export default function OrdersPage() {
  const router = useRouter();
  const params = useParams();
  const localeFromIntl = useLocale();
  const locale = localeFromIntl || params?.locale || "de";
  const ui = getUI(locale);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);
  const [filterPayStatus, setFilterPayStatus] = useState("");
  const [filterDelivery, setFilterDelivery] = useState("");
  const [sort, setSort] = useState("created_at_desc");
  const [expanded, setExpanded] = useState({});
  const [loadingItems, setLoadingItems] = useState({});
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [versendModal, setVersendModal] = useState(null); // null | array of order objects
  const [labelModal, setLabelModal] = useState(null); // null | order object
  const [labelFulfillResult, setLabelFulfillResult] = useState(null); // { label_url, tracking_number }
  const [allReviews, setAllReviews] = useState([]); // all product reviews
  const [reviewPopupOrderId, setReviewPopupOrderId] = useState(null);
  const [returnsMap, setReturnsMap] = useState({}); // order_id → has active return
  const [mySellerId, setMySellerId] = useState("");
  const [sellerLabelById, setSellerLabelById] = useState({});
  const [sellerSearchFilter, setSellerSearchFilter] = useState("");
  const [sellerSectionOpen, setSellerSectionOpen] = useState({});
  const [sellerGroupSort, setSellerGroupSort] = useState("created_at_desc");
  const [colWidths, setColWidths] = useState(() => COL_DEFS.map(c => c.defaultWidth));
  const [hiddenCols, setHiddenCols] = useState(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef(null);
  const resizingRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isSuperuser) return;
    setMySellerId(localStorage.getItem("sellerId") || "");
  }, [isSuperuser]);

  useEffect(() => {
    if (!isSuperuser) return;
    getMedusaAdminClient()
      .getSellers()
      .then((d) => {
        const m = {};
        for (const s of d.sellers || []) {
          if (s.seller_id) m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
        }
        setSellerLabelById(m);
      })
      .catch(() => {});
  }, [isSuperuser]);

  const fetchReviews = useCallback(async () => {
    try {
      const client = getMedusaAdminClient();
      const data = await client.request("/admin-hub/reviews");
      setAllReviews(data?.reviews || []);
    } catch { setAllReviews([]); }
  }, []);

  const fetchReturns = useCallback(async () => {
    try {
      const client = getMedusaAdminClient();
      const data = await client.getReturns();
      const map = {};
      for (const r of (data?.returns || [])) {
        if (r.order_id && r.status !== "abgelehnt" && r.status !== "abgeschlossen") {
          map[r.order_id] = true;
        }
      }
      setReturnsMap(map);
    } catch { setReturnsMap({}); }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const params = { sort };
      if (search) params.search = search;
      if (filterOrderStatus && filterOrderStatus !== "retoure") params.order_status = filterOrderStatus;
      if (filterPayStatus) params.payment_status = filterPayStatus;
      if (filterDelivery) params.delivery_status = filterDelivery;
      const data = await client.getOrders(params);
      setOrders(data.orders || []);
    } catch { setOrders([]); }
    setLoading(false);
  }, [search, filterOrderStatus, filterPayStatus, filterDelivery, sort]);

  useEffect(() => { fetchOrders(); fetchReviews(); fetchReturns(); }, [fetchOrders, fetchReviews, fetchReturns]);

  // Handle return from Stripe Checkout for label purchase
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const sessionId = sp.get("label_session_id");
    if (!sessionId) return;
    // Remove param from URL immediately
    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);
    getMedusaAdminClient().fulfillLabel(sessionId)
      .then(data => {
        setLabelFulfillResult(data);
        fetchOrders();
      })
      .catch(e => {
        setLabelFulfillResult({ error: resolveSellerFacingError(e, locale, readSellerIsSuperuser()) });
      });
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const { colIdx, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      setColWidths(prev => { const n = [...prev]; n[colIdx] = Math.max(40, startWidth + delta); return n; });
    };
    const onUp = () => { resizingRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColMenu]);

  const toggleColVisibility = (key) => setHiddenCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleExpand = async (order) => {
    const id = order.id;
    if (expanded[id]) { setExpanded(e => ({ ...e, [id]: false })); return; }
    if (order._expanded) { setExpanded(e => ({ ...e, [id]: true })); return; }
    setLoadingItems(l => ({ ...l, [id]: true }));
    try {
      const client = getMedusaAdminClient();
      const data = await client.getOrder(id);
      const detail = data.order || {};
      setOrders(prev => prev.map(o => o.id === id ? {
        ...o,
        _items: detail.items || [],
        _customer_number: detail.customer_number || null,
        _is_guest: detail.is_guest !== false,
        _payment_method: detail.payment_method || null,
        _is_first_order: detail.is_first_order === true,
        _expanded: true,
        tracking_number: detail.tracking_number ?? o.tracking_number,
        carrier_name: detail.carrier_name ?? o.carrier_name,
        shipped_at: detail.shipped_at ?? o.shipped_at,
        delivery_status: detail.delivery_status ?? o.delivery_status,
      } : o));
    } catch { }
    setLoadingItems(l => ({ ...l, [id]: false }));
    setExpanded(e => ({ ...e, [id]: true }));
  };

  const handleUpdate = async (id, data) => {
    try {
      const client = getMedusaAdminClient();
      const res = await client.updateOrder(id, data);
      if (res?.order) setOrders(prev => prev.map(o => o.id === id ? { ...o, ...res.order } : o));
    } catch { }
  };


  const handleDelete = async (id) => {
    try {
      const client = getMedusaAdminClient();
      await client.deleteOrder(id);
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch { }
  };

  const handleColSort = (sortKey) => {
    if (!sortKey) return;
    const isCurrentCol = sort.startsWith(sortKey + "_");
    const newDir = isCurrentCol && sort.endsWith("_asc") ? "desc" : "asc";
    setSort(`${sortKey}_${newDir}`);
  };

  const sortIcon = (sortKey) => {
    if (!sortKey) return null;
    if (sort.startsWith(sortKey + "_")) return sort.endsWith("_asc") ? " ↑" : " ↓";
    return " ⇅";
  };

  const visibleCols = COL_DEFS.filter(c => !c.hideable || !hiddenCols.has(c.key));
  const visibleColCount = visibleCols.length;

  const visibleOrders = useMemo(
    () => orders.filter((o) => filterOrderStatus !== "retoure" || returnsMap[o.id]),
    [orders, filterOrderStatus, returnsMap]
  );

  const { ownOrdersList, sellerOrderGroups } = useMemo(() => {
    const own = [];
    const g = new Map();
    for (const o of visibleOrders) {
      if (isOwnSellerOrder(o, mySellerId)) own.push(o);
      else {
        const sid = String(o.seller_id || "unknown");
        if (!g.has(sid)) g.set(sid, []);
        g.get(sid).push(o);
      }
    }
    const keys = [...g.keys()].sort((a, b) =>
      (sellerLabelById[a] || a).localeCompare(sellerLabelById[b] || b, undefined, { sensitivity: "base" })
    );
    return { ownOrdersList: own, sellerOrderGroups: keys.map((k) => ({ sellerId: k, items: g.get(k) })) };
  }, [visibleOrders, mySellerId, sellerLabelById]);

  const filteredSellerOrderGroups = useMemo(() => {
    const q = sellerSearchFilter.trim().toLowerCase();
    if (!q) return sellerOrderGroups;
    return sellerOrderGroups.filter(({ sellerId }) => {
      const label = (sellerLabelById[sellerId] || sellerId || "").toLowerCase();
      return label.includes(q) || sellerId.toLowerCase().includes(q);
    });
  }, [sellerOrderGroups, sellerSearchFilter, sellerLabelById]);

  const sortOrdersClient = (list) => {
    const arr = [...(list || [])];
    if (sellerGroupSort === "created_at_asc") arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sellerGroupSort === "total_desc") arr.sort((a, b) => (b.total_cents || 0) - (a.total_cents || 0));
    else if (sellerGroupSort === "total_asc") arr.sort((a, b) => (a.total_cents || 0) - (b.total_cents || 0));
    else arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
  };

  const allSelected = orders.length > 0 && orders.every(o => selected.has(o.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(orders.map(o => o.id)));
  };
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedOrders = orders.filter(o => selected.has(o.id));

  const hc = hiddenCols;
  const renderOrderRows = (list) =>
    sortOrdersClient(list).map((order) => (
      <React.Fragment key={order.id}>
        <tr style={{ borderBottom: "1px solid #e5e7eb", cursor: "default", background: selected.has(order.id) ? "#eff6ff" : "#fff", transition: "background 0.15s ease" }}
          onMouseEnter={e => { if (!selected.has(order.id)) e.currentTarget.style.background = "#f9fafb"; }}
          onMouseLeave={e => { if (!selected.has(order.id)) e.currentTarget.style.background = "#fff"; }}
        >
          <td style={{ padding: "10px 6px 10px 12px", width: 32 }} onClick={e => e.stopPropagation()}>
            <CustomCheckbox checked={selected.has(order.id)} onChange={() => toggleOne(order.id)} size={18} />
          </td>
          <td style={{ padding: "10px 8px 10px 8px", width: 32 }}>
            <button onClick={() => toggleExpand(order)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 0 }}>
              {loadingItems[order.id] ? "…" : expanded[order.id] ? "▼" : "▶"}
            </button>
          </td>
          {!hc.has("order_number") && (
            <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/${locale}/orders/${order.id}`); }}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#111827", textDecoration: "underline" }}
                >
                  #{order.order_number || "—"}
                </button>
              </div>
            </td>
          )}
          {!hc.has("customer") && (
            <td style={{ padding: "10px 10px", minWidth: 180 }}>
              <CustomerCell order={order} locale={locale} router={router} isSuperuser={isSuperuser} />
            </td>
          )}
          {!hc.has("address") && (
            <td style={{ padding: "10px 10px", color: "#6b7280", fontSize: 12, lineHeight: 1.45 }}>
              {order.address_line1 ? (
                <>
                  <div>{order.address_line1}</div>
                  <div>{[order.postal_code, order.city].filter(Boolean).join(" ")}</div>
                  {order.country && <div>{order.country}</div>}
                </>
              ) : "—"}
            </td>
          )}
          {!hc.has("amount") && (
            <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
              {(() => {
                const vat = getVatInfo(order.country);
                const brutto = order.total_cents || 0;
                const netto = vat.rate > 0 ? Math.round(brutto / (1 + vat.rate / 100)) : brutto;
                return (
                  <>
                    <div>{fmtCents(brutto)}</div>
                    {vat.rate > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 400, color: "#9ca3af", lineHeight: 1.3 }}>
                        {fmtCents(netto)} {ui.net}<br />
                        +{vat.rate}% {vat.label}
                      </div>
                    )}
                  </>
                );
              })()}
            </td>
          )}
          {!hc.has("order_status") && (
            <td style={{ padding: "10px 12px", textAlign: "center" }}>
              {returnsMap[order.id] ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#fef2f2", color: "#b91c1c", whiteSpace: "nowrap" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                  {ui.retoure}
                </span>
              ) : (
                <StatusBadge value={order.order_status} />
              )}
            </td>
          )}
          {!hc.has("payment_status") && (
            <td style={{ padding: "10px 12px", textAlign: "center" }}>
              <StatusBadge value={order.payment_status} />
            </td>
          )}
          {!hc.has("delivery_status") && (
            <td style={{ padding: "10px 12px", textAlign: "center" }}>
              <StatusBadge value={order.delivery_status} />
            </td>
          )}
          {!hc.has("date") && (
            <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
              {fmtDate(order.created_at)}
            </td>
          )}
          {!hc.has("country") && (
            <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500 }}>
              {order.country || "—"}
            </td>
          )}
          {!hc.has("review") && (
            <td style={{ padding: "10px 12px", textAlign: "center" }}>
              {(() => {
                const orderReviews = allReviews.filter((r) => r.order_id === order.id);
                if (orderReviews.length === 0) return <span style={{ color: "#d1d5db", fontSize: 14 }}>★★★★★</span>;
                const avg = orderReviews.reduce((s, r) => s + Number(r.rating || 0), 0) / orderReviews.length;
                return (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setReviewPopupOrderId(order.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    title={lt(
                      locale,
                      `${orderReviews.length} review${orderReviews.length !== 1 ? "s" : ""}`,
                      `${orderReviews.length} yorum`,
                      `${orderReviews.length} avis`,
                      `${orderReviews.length} reseña${orderReviews.length !== 1 ? "s" : ""}`,
                      `${orderReviews.length} recensione${orderReviews.length !== 1 ? "i" : ""}`,
                      `${orderReviews.length} Bewertung${orderReviews.length !== 1 ? "en" : ""}`
                    )}
                  >
                    <MiniStars rating={avg} />
                  </button>
                );
              })()}
            </td>
          )}
          <td style={{ padding: "10px 8px", textAlign: "right" }}>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
              {order.delivery_status !== "versendet" && order.delivery_status !== "zugestellt" && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Button size="slim" variant="primary" onClick={() => setVersendModal([order])}>
                    {ui.ship}
                  </Button>
                </div>
              )}
              {order.delivery_status !== "zugestellt" && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Button size="slim" onClick={() => setLabelModal(order)}>
                    {ui.buyLabel}
                  </Button>
                </div>
              )}
              <ActionMenu order={order} onUpdate={handleUpdate} onDelete={handleDelete} onVersenden={() => setVersendModal([order])} isSuperuser={isSuperuser} />
            </div>
          </td>
        </tr>
        {expanded[order.id] && <ExpandedRow order={order} locale={locale} onSaveFields={handleUpdate} colCount={visibleColCount} ui={ui} />}
      </React.Fragment>
    ));

  return (
    <PageContainer>
      {showNewOrder && (
        <ManualOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => fetchOrders()}
          locale={locale}
        />
      )}
      {versendModal && (
        <ShipOrdersModal
          orders={versendModal}
          onClose={() => setVersendModal(null)}
          onDone={() => { fetchOrders(); setSelected(new Set()); }}
        />
      )}
      {labelModal && (
        <ShipLabelModal
          order={labelModal}
          locale={locale}
          onClose={() => setLabelModal(null)}
        />
      )}
      {labelFulfillResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            {labelFulfillResult.error ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#b91c1c", marginBottom: 12 }}>{ui.labelError}</div>
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 20 }}>{labelFulfillResult.error}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#15803d", marginBottom: 8 }}>{ui.labelSuccess}</div>
                {labelFulfillResult.tracking_number && (
                  <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                    {ui.trackingNumber}: <strong style={{ fontFamily: "monospace" }}>{labelFulfillResult.tracking_number}</strong>
                  </div>
                )}
                {labelFulfillResult.label_url && (
                  <div style={{ marginBottom: 20 }}>
                    <a href={labelFulfillResult.label_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-block", padding: "10px 20px", background: "#2563eb", color: "#fff", borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                      {ui.labelPrint}
                    </a>
                  </div>
                )}
              </>
            )}
            <Button onClick={() => setLabelFulfillResult(null)}>{ui.close}</Button>
          </div>
        </div>
      )}
      {reviewPopupOrderId && (
        <ReviewPopup
          reviews={allReviews.filter((r) => r.order_id === reviewPopupOrderId)}
          onClose={() => setReviewPopupOrderId(null)}
          locale={locale}
        />
      )}
      <PageHeader>
        <PageTitle>{ui.orders}</PageTitle>
        <HeaderMeta>
          <span style={{ fontSize: 14, color: "#6b7280" }}>{orders.length} {ui.orders}</span>
          <div ref={colMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowColMenu(v => !v)}
              style={{ padding: "8px 13px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151", lineHeight: 1 }}
            >
              {ui.colColumns} {hiddenCols.size > 0 ? `(${COL_DEFS.filter(c => c.hideable).length - hiddenCols.size}/${COL_DEFS.filter(c => c.hideable).length})` : ""}
            </button>
            {showColMenu && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 9999, minWidth: 190, padding: "6px 0" }}>
                {COL_DEFS.filter(c => c.hideable).map(col => (
                  <label
                    key={col.key}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#111827", userSelect: "none" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <input type="checkbox" checked={!hiddenCols.has(col.key)} onChange={() => toggleColVisibility(col.key)} style={{ accentColor: "#2563eb", width: 15, height: 15, cursor: "pointer" }} />
                    {col.labelKey ? (ui[col.labelKey] || col.labelKey) : col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button variant="primary" onClick={() => setShowNewOrder(true)}>
            {ui.addOrder}
          </Button>
        </HeaderMeta>
      </PageHeader>

      {selected.size > 0 && (
        <BulkBar>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1e3a8a" }}>{selected.size} {ui.selected}</span>
          <InlineStack gap="200" wrap blockAlign="center">
            <Button variant="primary" onClick={() => setVersendModal(selectedOrders)}>
              {ui.bulkShip}
            </Button>
            <Button
              onClick={() => {
                sessionStorage.setItem("versand_orders", JSON.stringify(selectedOrders));
                router.push(`/${locale}/versand`);
              }}
            >
              {ui.bulkPackaging}
            </Button>
            <Button variant="plain" onClick={() => setSelected(new Set())}>
              {ui.clearSelection}
            </Button>
          </InlineStack>
        </BulkBar>
      )}

      <Section>
        <SectionHeading>{ui.filterAndSort}</SectionHeading>
        <FilterGrid>
          <FilterField>
            <FieldLabel>{ui.search}</FieldLabel>
            <FilterInput
              placeholder={ui.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterField>
          <FilterField>
            <FieldLabel>{ui.orderStatus}</FieldLabel>
            <FilterSelect value={filterOrderStatus} onChange={(e) => setFilterOrderStatus(e.target.value)}>
              <option value="">{ui.allStatuses}</option>
              <option value="retoure">{ui.activeReturn}</option>
              {ORDER_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          <FilterField>
            <FieldLabel>{ui.paymentStatus}</FieldLabel>
            <FilterSelect value={filterPayStatus} onChange={(e) => setFilterPayStatus(e.target.value)}>
              <option value="">{ui.allPayments}</option>
              {PAYMENT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
          <FilterField>
            <FieldLabel>{ui.deliveryStatus}</FieldLabel>
            <FilterSelect value={filterDelivery} onChange={(e) => setFilterDelivery(e.target.value)}>
              <option value="">{ui.allDeliveries}</option>
              {DELIVERY_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </FilterSelect>
          </FilterField>
        </FilterGrid>

        {isSuperuser && (
          <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)", gap: 16, alignItems: "end" }}>
            <FilterField>
              <FieldLabel>{ui.sellerGroups}</FieldLabel>
              <FilterSelect value={sellerGroupSort} onChange={(e) => setSellerGroupSort(e.target.value)}>
                <option value="created_at_desc">{ui.sortNewestFirst}</option>
                <option value="created_at_asc">{ui.sortOldestFirst}</option>
                <option value="total_desc">{ui.amountDesc}</option>
                <option value="total_asc">{ui.amountAsc}</option>
              </FilterSelect>
            </FilterField>
            <FilterField>
              <FieldLabel>{ui.searchSeller}</FieldLabel>
              <FilterInput
                placeholder={lt(locale, "Name / ID…", "Ad / ID…", "Nom / ID…", "Nombre / ID…", "Nome / ID…", "Name / ID…")}
                value={sellerSearchFilter}
                onChange={(e) => setSellerSearchFilter(e.target.value)}
              />
            </FilterField>
          </div>
        )}
      </Section>

      <TableCard>
        <div style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "100%", minWidth: visibleCols.reduce((s, c) => s + colWidths[COL_DEFS.indexOf(c)], 0), borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
          <colgroup>
            {visibleCols.map(col => (
              <col key={col.key} style={{ width: colWidths[COL_DEFS.indexOf(col)] }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {visibleCols.map((col) => {
                const colIdx = COL_DEFS.indexOf(col);
                const isSortable = !!col.sortKey;
                return (
                  <th
                    key={col.key}
                    onClick={isSortable ? () => handleColSort(col.sortKey) : undefined}
                    style={{
                      padding: "10px 10px",
                      textAlign: col.align,
                      fontWeight: 600,
                      fontSize: 11,
                      color: isSortable ? "#374151" : "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      whiteSpace: "nowrap",
                      cursor: isSortable ? "pointer" : "default",
                      userSelect: "none",
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      background: "#f9fafb",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                  >
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                      {col.key === "sel" ? (
                        <CustomCheckbox checked={allSelected} onChange={toggleAll} size={18} />
                      ) : (
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {col.labelKey ? (ui[col.labelKey] || col.label || col.labelKey) : col.label}
                          {isSortable && (
                            <span style={{ fontSize: 10, marginLeft: 3, opacity: sort.startsWith(col.sortKey + "_") ? 1 : 0.35 }}>
                              {sortIcon(col.sortKey)}
                            </span>
                          )}
                        </span>
                      )}
                      {col.hideable && (
                        <div
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); resizingRef.current = { colIdx, startX: e.clientX, startWidth: colWidths[colIdx] }; }}
                          style={{ position: "absolute", right: -5, top: -10, bottom: -10, width: 8, cursor: "col-resize", zIndex: 1, borderRadius: 2 }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(148,163,184,0.55)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={visibleColCount} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>{ui.loading}</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={visibleColCount} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>{ui.noOrders}</td></tr>
            )}
            {!loading && orders.length > 0 && !isSuperuser && renderOrderRows(visibleOrders)}
            {!loading && orders.length > 0 && isSuperuser && (
              <>
                <tr>
                  <SuperuserSectionLabel colSpan={visibleColCount}>
                    {ui.superuserSection} ({ownOrdersList.length})
                  </SuperuserSectionLabel>
                </tr>
                {ownOrdersList.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} style={{ padding: "16px 24px", color: "#9ca3af", fontSize: 13 }}>
                      {ui.noOrdersInSection}
                    </td>
                  </tr>
                ) : (
                  renderOrderRows(ownOrdersList)
                )}
                <tr>
                  <SellerOrdersSectionLabel colSpan={visibleColCount}>
                    {ui.sellerOrders}
                  </SellerOrdersSectionLabel>
                </tr>
                {filteredSellerOrderGroups.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} style={{ padding: "16px 24px", color: "#9ca3af", fontSize: 13 }}>
                      {ui.noSellerOrders}{sellerSearchFilter.trim() ? lt(locale, " (filter)", " (filtre)", " (filtre)", " (filtro)", " (filtro)", " (Filter)") : ""}.
                    </td>
                  </tr>
                ) : (
                  filteredSellerOrderGroups.flatMap(({ sellerId, items }) => {
                    const label = sellerLabelById[sellerId] || sellerId;
                    const open = sellerSectionOpen[sellerId] !== false;
                    const headerRow = (
                      <tr key={`h-${sellerId}`}>
                        <SellerGroupHeader colSpan={visibleColCount}>
                          <button
                            type="button"
                            onClick={() => setSellerSectionOpen((prev) => ({ ...prev, [sellerId]: !open }))}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 20px",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              font: "inherit",
                              textAlign: "left",
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{label}</span>
                            <span style={{ fontSize: 13, color: "#6b7280" }}>
                              {open ? "▾" : "▸"} {items.length} {ui.orders}
                            </span>
                          </button>
                        </SellerGroupHeader>
                      </tr>
                    );
                    return open ? [headerRow, ...renderOrderRows(items)] : [headerRow];
                  })
                )}
              </>
            )}
          </tbody>
        </table>
        </div>
      </TableCard>
    </PageContainer>
  );
}

const selStyle = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, background: "#fff", cursor: "pointer" };

function MiniStars({ rating }) {
  const r = Math.round(Number(rating) || 0);
  return (
    <span style={{ fontSize: 14, letterSpacing: 1, lineHeight: 1 }}>
      {[1,2,3,4,5].map((n) => (
        <span key={n} style={{ color: r >= n ? "#f59e0b" : "#d1d5db" }}>★</span>
      ))}
    </span>
  );
}

function ReviewPopup({ reviews, onClose, locale }) {
  const _ui = getUI(locale || "de");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{_ui.reviewsTitle}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {reviews.map((rv) => (
            <div key={rv.id} style={{ padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#111827", display: "block" }}>
                    {rv.product_title || rv.product_id}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{rv.customer_name || "—"}</span>
                </div>
                <MiniStars rating={rv.rating} />
              </div>
              {rv.comment && <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{rv.comment}</p>}
            </div>
          ))}
          {reviews.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>{_ui.noReviews}</p>}
        </div>
      </div>
    </div>
  );
}
