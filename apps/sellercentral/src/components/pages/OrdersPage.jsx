"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("de-DE") + " / " + dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

const ORDER_STATUS_OPTIONS = ["offen", "in_bearbeitung", "abgeschlossen", "storniert"];
const PAYMENT_STATUS_OPTIONS = ["offen", "bezahlt", "teil_erstattet", "erstattet"];
const DELIVERY_STATUS_OPTIONS = ["offen", "versendet", "zugestellt"];

const STATUS_COLORS = {
  offen: { bg: "#fff7ed", color: "#c2410c" },
  in_bearbeitung: { bg: "#eff6ff", color: "#1d4ed8" },
  abgeschlossen: { bg: "#f0fdf4", color: "#15803d" },
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

const PM_LABELS = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", paypal: "PayPal", klarna: "Klarna", sepa_debit: "SEPA", card: "Kreditkarte", apple_pay: "Apple Pay", google_pay: "Google Pay" };
function fmtPM(pm) { return PM_LABELS[pm] || (pm ? pm.charAt(0).toUpperCase() + pm.slice(1).replace(/_/g, " ") : "—"); }

function InfoPill({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{value}</span>
    </div>
  );
}

function ExpandedRow({ order }) {
  const items = order._items || [];
  const total = order.total_cents || order.subtotal_cents || 0;
  const customerLabel = order._customer_number
    ? `#${order._customer_number} – ${[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}`
    : `Gastkunde – ${[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}`;

  return (
    <tr>
      <td colSpan={11} style={{ padding: 0, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        {/* Info bar */}
        <div style={{ display: "flex", gap: 32, padding: "12px 24px", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap", alignItems: "flex-start" }}>
          <InfoPill label="Kunde" value={customerLabel} />
          <InfoPill label="Kundentyp" value={order._is_guest !== false ? "Gastkunde" : "Registriert"} />
          {order._payment_method && <InfoPill label="Zahlung" value={fmtPM(order._payment_method)} />}
          <InfoPill label="Lieferadresse" value={[order.address_line1, order.postal_code, order.city, order.country].filter(Boolean).join(", ") || "—"} />
          <InfoPill label="Erste Bestellung" value={order._is_first_order ? "Ja" : "Nein"} />
          <InfoPill label="Gesamt" value={fmtCents(total)} />
        </div>

        {/* Items table */}
        <div style={{ padding: "10px 24px 14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Produkt</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Menge</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Einzelpreis</th>
                <th style={{ textAlign: "right", padding: "4px 8px" }}>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "8px", color: "#9ca3af", textAlign: "center" }}>Keine Artikel</td></tr>
              )}
              {items.map((it, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />}
                      <span>{it.title || "—"}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{it.quantity}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmtCents(it.unit_price_cents)}</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>{fmtCents((it.unit_price_cents || 0) * (it.quantity || 1))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                <td colSpan={3} style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>Gesamt</td>
                <td style={{ textAlign: "right", padding: "6px 8px", fontWeight: 700 }}>{fmtCents(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </td>
    </tr>
  );
}

function ActionMenu({ order, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 16, color: "#6b7280" }}>⋯</button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,.1)", zIndex: 100, minWidth: 160, overflow: "hidden" }}>
          {[
            { label: "Details anzeigen", action: () => router.push(`/orders/${order.id}`) },
            { label: "Als versendet markieren", action: () => { onUpdate(order.id, { delivery_status: "versendet" }); setOpen(false); } },
            { label: "Als zugestellt markieren", action: () => { onUpdate(order.id, { delivery_status: "zugestellt" }); setOpen(false); } },
            { label: "Abschließen", action: () => { onUpdate(order.id, { order_status: "abgeschlossen" }); setOpen(false); } },
            { label: "Stornieren", action: () => { onUpdate(order.id, { order_status: "storniert" }); setOpen(false); }, danger: true },
            { label: "Löschen", action: () => { if (confirm("Sipariş silinsin mi?")) { onDelete(order.id); } setOpen(false); }, danger: true },
          ].map((item, i) => (
            <button key={i} onClick={item.action} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 16px", background: "none", border: "none", fontSize: 13, cursor: "pointer", color: item.danger ? "#b91c1c" : "#111827", borderBottom: i < 5 ? "1px solid #f3f4f6" : "none" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");
  const [filterPayStatus, setFilterPayStatus] = useState("");
  const [filterDelivery, setFilterDelivery] = useState("");
  const [sort, setSort] = useState("created_at_desc");
  const [expanded, setExpanded] = useState({});
  const [loadingItems, setLoadingItems] = useState({});

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const params = { sort };
      if (search) params.search = search;
      if (filterOrderStatus) params.order_status = filterOrderStatus;
      if (filterPayStatus) params.payment_status = filterPayStatus;
      if (filterDelivery) params.delivery_status = filterDelivery;
      const data = await client.getOrders(params);
      setOrders(data.orders || []);
    } catch { setOrders([]); }
    setLoading(false);
  }, [search, filterOrderStatus, filterPayStatus, filterDelivery, sort]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

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

  const COLS = ["", "Bestellnummer", "Kunde", "Adresse", "Betrag", "Bestellstatus", "Zahlungsstatus", "Lieferstatus", "Datum", "Land", ""];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bestellungen</h1>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{orders.length} Bestellungen</span>
      </div>

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
        <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
          <option value="created_at_desc">Neueste zuerst</option>
          <option value="created_at_asc">Älteste zuerst</option>
          <option value="order_number_desc">Bestellnr. ↓</option>
          <option value="total_desc">Betrag ↓</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {COLS.map((c, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: i >= 4 && i <= 9 ? "center" : "left", fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Keine Bestellungen gefunden</td></tr>
            )}
            {orders.map((order) => (
              <React.Fragment key={order.id}>
                <tr style={{ borderBottom: "1px solid #f3f4f6", cursor: "default" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  {/* Expand toggle */}
                  <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                    <button onClick={() => toggleExpand(order)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 0 }}>
                      {loadingItems[order.id] ? "…" : expanded[order.id] ? "▼" : "▶"}
                    </button>
                  </td>
                  {/* Order number */}
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                    <button onClick={() => router.push(`/orders/${order.id}`)} style={{ background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 13 }}>
                      #{order.order_number || "—"}
                    </button>
                  </td>
                  {/* Customer */}
                  <td style={{ padding: "10px 12px", maxWidth: 160 }}>
                    <div style={{ fontWeight: 500 }}>{[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{order.email || ""}</div>
                  </td>
                  {/* Address */}
                  <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                    {[order.address_line1, order.city].filter(Boolean).join(", ") || "—"}
                  </td>
                  {/* Amount */}
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600 }}>
                    {fmtCents(order.total_cents)}
                  </td>
                  {/* Order status */}
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <StatusBadge value={order.order_status} />
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
                  {/* Actions */}
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <ActionMenu order={order} onUpdate={handleUpdate} onDelete={handleDelete} />
                  </td>
                </tr>
                {expanded[order.id] && <ExpandedRow order={order} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const selStyle = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, background: "#fff", cursor: "pointer" };
