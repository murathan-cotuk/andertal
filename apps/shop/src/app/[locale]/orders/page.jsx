"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthGuard, getToken, useCustomerAuth as useAuth } from "@belucha/lib";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/account/AccountSidebar";
import { getMedusaClient } from "@/lib/medusa-client";
import { formatPriceCents } from "@/lib/format";

const STATUS_MAP = {
  offen: { label: "Offen", cls: "bg-yellow-100 text-yellow-800" },
  in_bearbeitung: { label: "In Bearbeitung", cls: "bg-blue-100 text-blue-800" },
  versendet: { label: "Versendet", cls: "bg-purple-100 text-purple-800" },
  zugestellt: { label: "Zugestellt", cls: "bg-green-100 text-green-800" },
  abgeschlossen: { label: "Abgeschlossen", cls: "bg-green-100 text-green-800" },
  storniert: { label: "Storniert", cls: "bg-red-100 text-red-800" },
  bezahlt: { label: "Bezahlt", cls: "bg-green-100 text-green-800" },
  pending: { label: "Offen", cls: "bg-yellow-100 text-yellow-800" },
  shipped: { label: "Versendet", cls: "bg-purple-100 text-purple-800" },
  delivered: { label: "Zugestellt", cls: "bg-green-100 text-green-800" },
  completed: { label: "Abgeschlossen", cls: "bg-green-100 text-green-800" },
  cancelled: { label: "Storniert", cls: "bg-red-100 text-red-800" },
};

function Badge({ status }) {
  const s = STATUS_MAP[status?.toLowerCase()] || { label: status || "—", cls: "bg-gray-100 text-gray-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function printInvoice(order) {
  const win = window.open("", "_blank", "width=900,height=700");
  const date = fmtDate(order.created_at);
  const items = (order.items || []).map(it => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${it.title || "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${((Number(it.unit_price_cents||0)*Number(it.quantity||1))/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</td>
    </tr>`).join("");
  win.document.write(`<!DOCTYPE html><html><head><title>Rechnung #${order.order_number||order.id?.slice(0,8)}</title>
  <style>body{font-family:Arial,sans-serif;margin:40px;color:#1f2937}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse}th{background:#f9fafb;padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:12px;text-transform:uppercase}@media print{.noprint{display:none}}</style></head>
  <body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
      <div><h1 style="font-size:28px;font-weight:700">RECHNUNG</h1><div style="color:#6b7280;margin-top:4px">Rechnungsnummer: #${order.order_number||"—"}</div><div style="color:#6b7280">Datum: ${date}</div></div>
      <div style="text-align:right"><div style="font-size:20px;font-weight:700">Belucha</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:40px">
      <div><div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px">Lieferadresse</div>
        <div><strong>${[order.first_name,order.last_name].filter(Boolean).join(" ")||"—"}</strong></div>
        <div>${order.address_line1||"—"}</div><div>${[order.postal_code,order.city].filter(Boolean).join(" ")}</div><div>${order.country||""}</div>
      </div>
      <div><div style="font-size:11px;text-transform:uppercase;color:#6b7280;margin-bottom:8px">Rechnungsadresse</div>
        ${order.billing_same_as_shipping===false && order.billing_address_line1 ? `<div>${order.billing_address_line1}</div><div>${[order.billing_postal_code,order.billing_city].filter(Boolean).join(" ")}</div><div>${order.billing_country||""}</div>` : `<div>${order.address_line1||"—"}</div><div>${[order.postal_code,order.city].filter(Boolean).join(" ")}</div><div>${order.country||""}</div>`}
      </div>
    </div>
    <table>
      <thead><tr><th>Artikel</th><th style="text-align:center">Menge</th><th style="text-align:right">Betrag</th></tr></thead>
      <tbody>${items}</tbody>
      <tfoot>
        ${Number(order.shipping_cents||0)>0?`<tr><td colspan="2" style="padding:8px 12px;text-align:right;color:#6b7280">Versand</td><td style="padding:8px 12px;text-align:right">${(Number(order.shipping_cents)/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</td></tr>`:""}
        ${Number(order.discount_cents||0)>0?`<tr><td colspan="2" style="padding:8px 12px;text-align:right;color:#059669">Rabatt</td><td style="padding:8px 12px;text-align:right;color:#059669">−${(Number(order.discount_cents)/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</td></tr>`:""}
        <tr><td colspan="2" style="padding:12px;text-align:right;font-weight:700;border-top:2px solid #e5e7eb">Gesamt</td><td style="padding:12px;text-align:right;font-weight:700;border-top:2px solid #e5e7eb">${(Number(order.total_cents||0)/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</td></tr>
      </tfoot>
    </table>
    ${order.tracking_number?`<div style="margin-top:32px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px"><div style="font-weight:600;color:#065f46;margin-bottom:4px">📦 Sendungsverfolgung</div><div style="color:#047857">${order.carrier_name||"Carrier"}: <strong>${order.tracking_number}</strong></div></div>`:""}
    <script>window.onload=()=>window.print()</script>
  </body></html>`);
  win.document.close();
}

function RetourModal({ order, onClose, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!reason) { setErr("Bitte wähle einen Grund."); return; }
    setSaving(true); setErr("");
    try {
      const token = getToken("customer");
      const client = getMedusaClient();
      await client.request(`/store/orders/${order.id}/return-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      });
      onSubmitted();
      onClose();
    } catch (e) {
      setErr(e?.message || "Fehler beim Absenden");
    }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Retoure anfragen — #{order.order_number || "—"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>
        <div style={{ padding: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>Rückgabegrund *</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
            <option value="">Bitte wählen…</option>
            <option value="defekt">Artikel defekt / beschädigt</option>
            <option value="falsch">Falscher Artikel erhalten</option>
            <option value="nicht_gefallen">Artikel gefällt nicht</option>
            <option value="zu_gross">Zu groß</option>
            <option value="zu_klein">Zu klein</option>
            <option value="nicht_erwartet">Entspricht nicht der Beschreibung</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
          <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>Anmerkungen (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} placeholder="Weitere Details…" />
          {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</p>}
        </div>
        <div style={{ padding: "12px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: "8px 16px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 0 2px #000" }}>
            {saving ? "…" : "Retoure anfragen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [retourModal, setRetourModal] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");

  const fetchOrders = async () => {
    try {
      const token = getToken("customer");
      if (!token) { setLoading(false); return; }
      const client = getMedusaClient();
      const res = await client.request("/store/orders/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res?.__error) {
        setError(res.message || "Fehler");
        setOrders([]);
      } else {
        setOrders(res?.orders || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const canReturn = (order) => {
    if (order.order_status === "storniert") return false;
    if (order.returns?.some(r => r.status !== "abgelehnt")) return false;
    const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : null;
    if (!deliveryDate) return order.delivery_status === "zugestellt" || order.delivery_status === "delivered";
    const daysSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 14;
  };

  const returnExpired = (order) => {
    const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : null;
    if (!deliveryDate) return false;
    return (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24) > 14;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopHeader />
      {retourModal && (
        <RetourModal
          order={retourModal}
          onClose={() => setRetourModal(null)}
          onSubmitted={() => { setSuccessMsg("Retouranfrage wurde erfolgreich eingereicht. Wir melden uns bei dir!"); fetchOrders(); }}
        />
      )}
      <main className="flex-grow bg-[#fafafa]">
        <div className="max-w-[1100px] mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Meine Bestellungen</h1>
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
            <AccountSidebar onLogout={() => { logout(); router.push("/"); }} />
            <div className="min-w-0">
          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 text-sm">
              ✓ {successMsg}
            </div>
          )}

          {loading && (
            <div className="text-center py-16 text-gray-400">
              <p className="mt-3">Laden…</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              Fehler beim Laden der Bestellungen.
            </div>
          )}

          {!loading && !error && orders.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-500 text-lg">Noch keine Bestellungen vorhanden.</p>
              <Link href="/" style={{ marginTop: 16, display: "inline-block", background: "#ff971c", color: "#fff", padding: "10px 24px", borderRadius: 10, fontWeight: 700, textDecoration: "none", border: "2px solid #000", boxShadow: "0 2px 0 2px #000" }}>
                Zum Shop
              </Link>
            </div>
          )}

          {orders.length > 0 && (
            <div className="space-y-4">
              {orders.map((order) => {
                const total = order.total_cents != null ? (Number(order.total_cents)/100).toLocaleString("de-DE",{minimumFractionDigits:2})+" €" : "—";
                const isExpanded = expanded[order.id];
                const activeReturn = order.returns?.find(r => r.status !== "abgelehnt");

                return (
                  <div key={order.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                    {/* Order header */}
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-900 text-lg">#{order.order_number || order.id?.slice(0,8)}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{fmtDate(order.created_at)}</p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge status={order.order_status || order.delivery_status || "offen"} />
                            <Badge status={order.payment_status} />
                            {order.delivery_status && order.delivery_status !== order.order_status && (
                              <Badge status={order.delivery_status} />
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900 text-xl">{total}</p>
                          {order.delivery_date && (
                            <p className="text-xs text-gray-500 mt-1">Zugestellt: {fmtDate(order.delivery_date)}</p>
                          )}
                        </div>
                      </div>

                      {/* Tracking info */}
                      {order.tracking_number && (
                        <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <p className="text-sm font-semibold text-blue-900">📦 Sendungsverfolgung</p>
                          <p className="text-sm text-blue-700 mt-0.5">
                            {order.carrier_name || "Carrier"}: <span className="font-mono font-bold">{order.tracking_number}</span>
                          </p>
                        </div>
                      )}

                      {/* Active return notice */}
                      {activeReturn && (
                        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-sm font-semibold text-yellow-800">🔄 Retoure #{activeReturn.return_number || "—"}</p>
                          <p className="text-sm text-yellow-700">Status: {activeReturn.status}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-4 flex gap-3 flex-wrap">
                        <button
                          onClick={() => setExpanded(e => ({ ...e, [order.id]: !e[order.id] }))}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {isExpanded ? "Weniger anzeigen ▲" : "Details anzeigen ▼"}
                        </button>
                        <button
                          onClick={() => printInvoice(order)}
                          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
                        >
                          🖨 Rechnung drucken
                        </button>
                        {canReturn(order) && !activeReturn && (
                          <button
                            onClick={() => setRetourModal(order)}
                            className="text-sm text-red-600 hover:underline"
                          >
                            ↩ Retoure anfragen
                          </button>
                        )}
                        {returnExpired(order) && !activeReturn && (
                          <span className="text-xs text-gray-400">Rückgabefrist abgelaufen (14 Tage)</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-5">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">Bestellpositionen</h4>
                        <div className="space-y-2">
                          {(order.items || []).map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-3">
                                {item.thumbnail && <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />}
                                <span>{item.title} × {item.quantity}</span>
                              </div>
                              <span className="font-medium">
                                {((Number(item.unit_price_cents||0)*Number(item.quantity||1))/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €
                              </span>
                            </div>
                          ))}
                        </div>
                        {(order.tracking_number || order.carrier_name) && (
                          <div className="mt-3 p-3 bg-gray-100 rounded-lg text-sm">
                            <p className="font-semibold text-gray-800">Sendungsverfolgung</p>
                            <p className="text-gray-700 mt-1">
                              {[order.carrier_name, order.tracking_number].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                        )}
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                          {Number(order.shipping_cents||0)>0 && (
                            <div className="flex justify-between text-gray-600"><span>Versand</span><span>+{(Number(order.shipping_cents)/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
                          )}
                          {Number(order.discount_cents||0)>0 && (
                            <div className="flex justify-between text-green-600"><span>Rabatt</span><span>−{(Number(order.discount_cents)/100).toLocaleString("de-DE",{minimumFractionDigits:2})} €</span></div>
                          )}
                          <div className="flex justify-between font-bold"><span>Gesamt</span><span>{total}</span></div>
                        </div>

                        {/* Addresses */}
                        <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-500">
                          <div>
                            <p className="font-semibold text-gray-700 mb-1">Lieferadresse</p>
                            <p>{[order.first_name,order.last_name].filter(Boolean).join(" ")}</p>
                            <p>{order.address_line1}</p>
                            <p>{[order.postal_code,order.city].filter(Boolean).join(" ")}</p>
                            <p>{order.country}</p>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-700 mb-1">Zahlungsmethode</p>
                            <p>{order.payment_method || "—"}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
