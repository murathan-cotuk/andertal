"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, InlineStack } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl } from "@/lib/order-pdf-url";
import ShipOrdersModal from "@/components/orders/ShipOrdersModal";

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
  const s = STATUS_COLORS[value] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {value || "—"}
    </span>
  );
}


function fmtCentsWithSymbol(c, symbol = "€") {
  const val = (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  return symbol === "€" ? val + " €" : symbol + " " + val;
}

function ExpandedRow({ order, locale = "de" }) {
  const items = order._items || [];
  const subtotal = items.reduce((s, it) => s + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0);
  const total = order.total_cents || order.subtotal_cents || 0;
  const vat = getVatInfo(order.country);
  const totalNetto = vat.rate > 0 ? Math.round(total / (1 + vat.rate / 100)) : total;
  const totalVat = total - totalNetto;

  const showShipBlock =
    order.tracking_number ||
    order.carrier_name ||
    order.delivery_status === "versendet" ||
    order.delivery_status === "zugestellt";

  return (
    <tr>
      <td colSpan={13} style={{ padding: 0, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ padding: "10px 24px 14px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Button url={getOrderPdfDownloadUrl(order.id, "invoice")} external variant="secondary" size="slim">
              Rechnung (PDF)
            </Button>
            <Button url={getOrderPdfDownloadUrl(order.id, "lieferschein")} external variant="secondary" size="slim">
              Lieferschein (PDF)
            </Button>
          </div>
          {showShipBlock && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 14px",
                background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
                borderRadius: 8,
                border: "1px solid var(--p-color-border, #e3e5e8)",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, color: "#374151", marginBottom: 4 }}>Versand</div>
              <div style={{ color: "#111827" }}>
                {order.carrier_name ? <span>{order.carrier_name}</span> : null}
                {order.carrier_name && order.tracking_number ? <span> · </span> : null}
                {order.tracking_number ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{order.tracking_number}</span>
                ) : null}
                {!order.tracking_number && order.delivery_status === "versendet" && (
                  <span style={{ color: "#6b7280" }}>Keine Trackingnummer hinterlegt</span>
                )}
              </div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Produkt</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Menge</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Einzelpreis (brutto)</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Gesamt (brutto)</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "8px", color: "#9ca3af", textAlign: "center" }}>Keine Artikel</td></tr>
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
                              Netto: {fmtCents(Math.round((it.unit_price_cents || 0) / (1 + vat.rate / 100)))} · +{vat.label} {vat.rate}%: {fmtCents(Math.round((it.unit_price_cents || 0) - (it.unit_price_cents || 0) / (1 + vat.rate / 100)))}
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
                  Netto{vat.rate > 0 ? ` (exkl. ${vat.label})` : ""}
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
                <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Zwischensumme (brutto)</td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{fmtCents(subtotal)}</td>
              </tr>
              {/* 4. Versandkosten */}
              <tr>
                <td colSpan={3} style={{ textAlign: "right", padding: "5px 8px", color: "#6b7280" }}>Versandkosten</td>
                <td style={{ textAlign: "right", padding: "5px 8px" }}>Kostenlos</td>
              </tr>
              {/* 5. Rabatt */}
              <tr>
                <td colSpan={3} style={{ textAlign: "right", padding: "5px 8px", color: "#6b7280" }}>Rabatt</td>
                <td style={{ textAlign: "right", padding: "5px 8px" }}>—</td>
              </tr>
              {/* 6. Gesamtkosten (bolder) */}
              <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                <td colSpan={3} style={{ textAlign: "right", padding: "7px 8px", fontWeight: 800, fontSize: 13 }}>Gesamtkosten</td>
                <td style={{ textAlign: "right", padding: "7px 8px", fontWeight: 800, fontSize: 13 }}>{fmtCents(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  );
}

function CustomerCell({ order, locale, router }) {
  const [navigating, setNavigating] = useState(false);

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
  const label = order.customer_number ? `${order.customer_number} – ${name}` : name;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
        <button
          onClick={handleClick}
          style={{ background: "none", border: "none", padding: 0, cursor: navigating ? "wait" : "pointer", textAlign: "left", fontWeight: 600, fontSize: 13, color: navigating ? "#9ca3af" : "#111827", textDecoration: "underline" }}
        >
          {label}
        </button>
        {order.is_guest && (
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280", fontWeight: 600, flexShrink: 0 }}>
            Gast
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{order.email || ""}</div>
    </div>
  );
}

function ActionMenu({ order, onUpdate, onDelete, onVersenden }) {
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
          {[
            { label: "Details anzeigen", action: () => { router.push(`/${locale}/orders/${order.id}`); setOpen(false); } },
            { label: "Versenden", action: () => { onVersenden?.(); setOpen(false); } },
            { label: "Stornieren", action: () => { onUpdate(order.id, { order_status: "storniert" }); setOpen(false); }, danger: true },
            { label: "Löschen", action: () => { if (confirm("Bestellung löschen?")) { onDelete(order.id); } setOpen(false); }, danger: true },
          ].map((item, i, arr) => (
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

function ManualOrderModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_ORDER_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
    if (!form.email) { setErr("E-Mail ist erforderlich"); return; }
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
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSaving(false);
  };

  const inp = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, color: "#374151", fontWeight: 500, display: "block", marginBottom: 3 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, width: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Manuelle Bestellung</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          {/* Customer */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11 }}>Kundendaten</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>E-Mail *</label><input style={inp} value={form.email} onChange={e => setF("email", e.target.value)} /></div>
              <div><label style={lbl}>Vorname</label><input style={inp} value={form.first_name} onChange={e => setF("first_name", e.target.value)} /></div>
              <div><label style={lbl}>Nachname</label><input style={inp} value={form.last_name} onChange={e => setF("last_name", e.target.value)} /></div>
              <div><label style={lbl}>Telefon</label><input style={inp} value={form.phone} onChange={e => setF("phone", e.target.value)} /></div>
              <div><label style={lbl}>Land</label><input style={inp} value={form.country} onChange={e => setF("country", e.target.value)} placeholder="DE" /></div>
              <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Straße</label><input style={inp} value={form.address_line1} onChange={e => setF("address_line1", e.target.value)} /></div>
              <div><label style={lbl}>PLZ</label><input style={inp} value={form.zip_code} onChange={e => setF("zip_code", e.target.value)} /></div>
              <div><label style={lbl}>Stadt</label><input style={inp} value={form.city} onChange={e => setF("city", e.target.value)} /></div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Artikel</div>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 32px", gap: 8, marginBottom: 8, alignItems: "end" }}>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>Bezeichnung</label><input style={inp} value={it.title} onChange={e => setItem(i, "title", e.target.value)} placeholder="Produktname" /></div>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>Menge</label><input style={inp} type="number" min="1" value={it.quantity} onChange={e => setItem(i, "quantity", e.target.value)} /></div>
                <div><label style={{ ...lbl, visibility: i > 0 ? "hidden" : "visible" }}>Preis (Cent)</label><input style={inp} type="number" value={it.unit_price_cents} onChange={e => setItem(i, "unit_price_cents", e.target.value)} placeholder="1990" /></div>
                <button onClick={() => removeItem(i)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 5, cursor: "pointer", color: "#9ca3af", height: 34 }}>×</button>
              </div>
            ))}
            <Button variant="plain" onClick={addItem}>
              Artikel hinzufügen
            </Button>
          </div>

          {/* Costs */}
          <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Versand (Cent)</label><input style={inp} type="number" value={form.shipping_cents} onChange={e => setF("shipping_cents", e.target.value)} placeholder="0" /></div>
            <div><label style={lbl}>Rabatt (Cent)</label><input style={inp} type="number" value={form.discount_cents} onChange={e => setF("discount_cents", e.target.value)} placeholder="0" /></div>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Bestellstatus</label>
              <select style={inp} value={form.order_status} onChange={e => setF("order_status", e.target.value)}>
                {["offen","in_bearbeitung","abgeschlossen","storniert"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Zahlungsstatus</label>
              <select style={inp} value={form.payment_status} onChange={e => setF("payment_status", e.target.value)}>
                {["offen","bezahlt","teil_erstattet","erstattet"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Lieferstatus</label>
              <select style={inp} value={form.delivery_status} onChange={e => setF("delivery_status", e.target.value)}>
                {["offen","versendet","zugestellt"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Zahlungsmethode</label><input style={inp} value={form.payment_method} onChange={e => setF("payment_method", e.target.value)} placeholder="Überweisung, PayPal…" /></div>
            <div><label style={lbl}>Währung</label>
              <select style={inp} value={form.currency} onChange={e => setF("currency", e.target.value)}>
                {["EUR","CHF","USD","GBP","TRY"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}><label style={lbl}>Notizen</label><textarea style={{ ...inp, height: 60, resize: "vertical" }} value={form.notes} onChange={e => setF("notes", e.target.value)} /></div>

          {/* Summary */}
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", marginBottom: 4 }}>
              <span>Zwischensumme</span><span>{(itemsTotal/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
            </div>
            {Number(form.shipping_cents||0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280", marginBottom: 4 }}>
                <span>Versand</span><span>+{(Number(form.shipping_cents)/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
              </div>
            )}
            {Number(form.discount_cents||0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#059669", marginBottom: 4 }}>
                <span>Rabatt</span><span>−{(Number(form.discount_cents)/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: "1px solid #e5e7eb", paddingTop: 8, marginTop: 4 }}>
              <span>Gesamt</span><span>{(total/100).toLocaleString("de-DE", {minimumFractionDigits:2})} {form.currency}</span>
            </div>
          </div>
        </div>

        {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "#fff" }}>
          <InlineStack gap="200">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving} loading={saving}>
              Bestellung erstellen
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params?.locale || "de";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");
  const [filterPayStatus, setFilterPayStatus] = useState("");
  const [filterDelivery, setFilterDelivery] = useState("");
  const [sort, setSort] = useState("created_at_desc");
  const [expanded, setExpanded] = useState({});
  const [loadingItems, setLoadingItems] = useState({});
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [versendModal, setVersendModal] = useState(null); // null | array of order objects
  const [allReviews, setAllReviews] = useState([]); // all product reviews
  const [reviewPopupOrderId, setReviewPopupOrderId] = useState(null);
  const [returnsMap, setReturnsMap] = useState({}); // order_id → has active return

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

  // col key → sort param base (without _asc/_desc)
  const COL_SORT_KEY = {
    2: "order_number",
    3: "name",
    5: "total",
    6: "status",
    9: "created_at",
    10: "country",
  };

  const handleColSort = (colIdx) => {
    const key = COL_SORT_KEY[colIdx];
    if (!key) return;
    const isCurrentCol = sort.startsWith(key + "_");
    const newDir = isCurrentCol && sort.endsWith("_asc") ? "desc" : "asc";
    setSort(`${key}_${newDir}`);
  };

  const sortIcon = (colIdx) => {
    const key = COL_SORT_KEY[colIdx];
    if (!key) return null;
    if (sort.startsWith(key + "_")) return sort.endsWith("_asc") ? " ↑" : " ↓";
    return " ⇅";
  };

  const COLS = ["☐", "", "Bestellnummer", "Kunde", "Adresse", "Betrag", "Bestellstatus", "Zahlungsstatus", "Lieferstatus", "Datum", "Land", "Bewertung", ""];

  const allSelected = orders.length > 0 && orders.every(o => selected.has(o.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(orders.map(o => o.id)));
  };
  const toggleOne = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedOrders = orders.filter(o => selected.has(o.id));

  return (
    <div style={{ padding: 24, background: "#fff", minHeight: "100%" }}>
      {showNewOrder && (
        <ManualOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => fetchOrders()}
        />
      )}
      {versendModal && (
        <ShipOrdersModal
          orders={versendModal}
          onClose={() => setVersendModal(null)}
          onDone={() => { fetchOrders(); setSelected(new Set()); }}
        />
      )}
      {reviewPopupOrderId && (
        <ReviewPopup
          reviews={allReviews.filter((r) => r.order_id === reviewPopupOrderId)}
          onClose={() => setReviewPopupOrderId(null)}
        />
      )}
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bestellungen</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{orders.length} Bestellungen</span>
          <Button variant="primary" onClick={() => setShowNewOrder(true)}>
            Bestellung hinzufügen
          </Button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "10px 16px",
            background: "var(--p-color-bg-surface-secondary, #f6f6f7)",
            borderRadius: 8,
            marginBottom: 12,
            border: "1px solid var(--p-color-border, #e3e5e8)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>{selected.size} ausgewählt</span>
          <InlineStack gap="200" wrap blockAlign="center">
            <Button variant="primary" onClick={() => setVersendModal(selectedOrders)}>
              Versenden
            </Button>
            <Button
              onClick={() => {
                sessionStorage.setItem("versand_orders", JSON.stringify(selectedOrders));
                router.push(`/${locale}/versand`);
              }}
            >
              Verpackungszentrum
            </Button>
            <Button variant="plain" onClick={() => setSelected(new Set())}>
              Auswahl aufheben
            </Button>
          </InlineStack>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Suche nach Name, Email, #..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "7px 12px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13 }}
        />
        <select value={filterOrderStatus} onChange={e => setFilterOrderStatus(e.target.value)} style={selStyle}>
          <option value="">Alle Status</option>
          <option value="retoure">Retoure (aktiv)</option>
          {ORDER_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPayStatus} onChange={e => setFilterPayStatus(e.target.value)} style={selStyle}>
          <option value="">Alle Zahlungen</option>
          {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterDelivery} onChange={e => setFilterDelivery(e.target.value)} style={selStyle}>
          <option value="">Alle Lieferungen</option>
          {DELIVERY_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {COLS.map((c, i) => {
                const isSortable = !!COL_SORT_KEY[i];
                return (
                  <th
                    key={i}
                    onClick={isSortable ? () => handleColSort(i) : undefined}
                    style={{ padding: "10px 12px", textAlign: i >= 5 && i <= 10 ? "center" : "left", fontWeight: 600, fontSize: 11, color: isSortable ? "#374151" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", cursor: isSortable ? "pointer" : "default", userSelect: "none" }}
                  >
                    {i === 0 ? (
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
                    ) : (
                      <span>
                        {c}
                        {isSortable && (
                          <span style={{ fontSize: 10, marginLeft: 3, opacity: sort.startsWith(COL_SORT_KEY[i] + "_") ? 1 : 0.35 }}>
                            {sortIcon(i)}
                          </span>
                        )}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={13} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={13} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Keine Bestellungen gefunden</td></tr>
            )}
            {orders.filter(o => filterOrderStatus !== "retoure" || returnsMap[o.id]).map((order) => (
              <React.Fragment key={order.id}>
                <tr style={{ borderBottom: "1px solid #f3f4f6", cursor: "default", background: selected.has(order.id) ? "#f6f6f7" : "" }}
                  onMouseEnter={e => { if (!selected.has(order.id)) e.currentTarget.style.background = "#fafafa"; }}
                  onMouseLeave={e => { if (!selected.has(order.id)) e.currentTarget.style.background = ""; }}
                >
                  {/* Checkbox */}
                  <td style={{ padding: "10px 8px 10px 12px", width: 32 }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(order.id)} onChange={() => toggleOne(order.id)} style={{ cursor: "pointer" }} />
                  </td>
                  {/* Expand toggle */}
                  <td style={{ padding: "10px 8px 10px 0", width: 32 }}>
                    <button onClick={() => toggleExpand(order)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 0 }}>
                      {loadingItems[order.id] ? "…" : expanded[order.id] ? "▼" : "▶"}
                    </button>
                  </td>
                  {/* Order number */}
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
                  {/* Customer */}
                  <td style={{ padding: "10px 12px", minWidth: 240, maxWidth: 280 }}>
                    <CustomerCell order={order} locale={locale} router={router} />
                  </td>
                  {/* Address */}
                  <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12, lineHeight: 1.5 }}>
                    {order.address_line1 ? (
                      <>
                        <div>{order.address_line1}</div>
                        <div>{[order.postal_code, order.city].filter(Boolean).join(" ")}</div>
                        {order.country && <div>{order.country}</div>}
                      </>
                    ) : "—"}
                  </td>
                  {/* Amount with VAT breakdown */}
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
                              {fmtCents(netto)} netto<br />
                              +{vat.rate}% {vat.label}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  {/* Order status */}
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {returnsMap[order.id] ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#b91c1c", whiteSpace: "nowrap" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                        Retoure
                      </span>
                    ) : (
                      <StatusBadge value={order.order_status} />
                    )}
                  </td>
                  {/* Payment status */}
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <StatusBadge value={order.payment_status} />
                  </td>
                  {/* Delivery status */}
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <StatusBadge value={order.delivery_status} />
                  </td>
                  {/* Date */}
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {fmtDate(order.created_at)}
                  </td>
                  {/* Country */}
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 500 }}>
                    {order.country || "—"}
                  </td>
                  {/* Review stars */}
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
                          title={`${orderReviews.length} Bewertung${orderReviews.length !== 1 ? "en" : ""}`}
                        >
                          <MiniStars rating={avg} />
                        </button>
                      );
                    })()}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                      {order.delivery_status !== "versendet" && order.delivery_status !== "zugestellt" && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button size="slim" variant="primary" onClick={() => setVersendModal([order])}>
                            Versenden
                          </Button>
                        </div>
                      )}
                      <ActionMenu order={order} onUpdate={handleUpdate} onDelete={handleDelete} onVersenden={() => setVersendModal([order])} />
                    </div>
                  </td>
                </tr>
                {expanded[order.id] && <ExpandedRow order={order} locale={locale} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

function ReviewPopup({ reviews, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Kundenbewertungen</h3>
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
          {reviews.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Keine Bewertungen vorhanden.</p>}
        </div>
      </div>
    </div>
  );
}
