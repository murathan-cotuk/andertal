"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthGuard, getToken, useCustomerAuth as useAuth } from "@belucha/lib";
import { Link, useRouter } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import AccountSidebar from "@/components/account/AccountSidebar";
import { getMedusaClient } from "@/lib/medusa-client";

function MessageModal({ order, onClose }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const token = getToken("customer");
    getMedusaClient().request(`/store/messages?order_id=${order.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((d) => { if (!d?.__error) setHistory(d?.messages || []); }).catch(() => {});
  }, [order.id]);

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true); setErr("");
    try {
      const token = getToken("customer");
      await getMedusaClient().request("/store/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, body: body.trim(), subject: `Bestellung #${order.order_number || ""}` }),
      });
      setSent(true);
      setBody("");
      const d = await getMedusaClient().request(`/store/messages?order_id=${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!d?.__error) setHistory(d?.messages || []);
      setTimeout(() => setSent(false), 3000);
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSending(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nachricht — #{order.order_number || "—"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          {history.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Noch keine Nachrichten</div>}
          {history.map((m) => {
            const isSeller = m.sender_type === "seller";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: isSeller ? "flex-start" : "flex-end" }}>
                <div style={{ maxWidth: "75%", background: isSeller ? "#f3f4f6" : "#ff971c", color: isSeller ? "#111827" : "#fff", borderRadius: isSeller ? "12px 12px 12px 2px" : "12px 12px 2px 12px", padding: "8px 12px", fontSize: 13 }}>
                  {m.body}
                  <div style={{ fontSize: 10, marginTop: 3, opacity: 0.6 }}>{new Date(m.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #f3f4f6" }}>
          {sent && <div style={{ color: "#15803d", fontSize: 12, marginBottom: 6 }}>Nachricht gesendet ✓</div>}
          {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} style={{ flex: 1, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, resize: "none" }} placeholder="Deine Nachricht…" />
            <button onClick={handleSend} disabled={sending || !body.trim()} style={{ padding: "0 16px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 0 2px #000" }}>
              {sending ? "…" : "Senden"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL_FALLBACK = {
  offen: "Offen",
  in_bearbeitung: "In Bearbeitung",
  versendet: "Versendet",
  zugestellt: "Zugestellt",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
  bezahlt: "Bezahlt",
  refunded: "Erstattet",
  retoure: "Retoure",
  retoure_anfrage: "Rückgabe wird geprüft",
  pending: "Offen",
  shipped: "Versendet",
  delivered: "Zugestellt",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
};

const STATUS_COLOR = {
  offen: "#92400e",
  in_bearbeitung: "#1e40af",
  versendet: "#6d28d9",
  zugestellt: "#166534",
  abgeschlossen: "#166534",
  storniert: "#991b1b",
  bezahlt: "#166534",
  refunded: "#1d4ed8",
  retoure: "#b91c1c",
  retoure_anfrage: "#b45309",
  pending: "#92400e",
  shipped: "#6d28d9",
  delivered: "#166534",
  completed: "#166534",
  cancelled: "#991b1b",
};

function StatusPill({ status, label }) {
  const key = (status || "").toLowerCase();
  const labelText = label ?? STATUS_LABEL_FALLBACK[key] ?? status ?? "—";
  const color = STATUS_COLOR[key] || "#6b7280";
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11,
      fontWeight: 600,
      color,
      background: color + "18",
      borderRadius: 20,
      padding: "2px 8px",
      letterSpacing: 0.2,
    }}>
      {labelText}
    </span>
  );
}

function getTrackingUrl(carrier, number) {
  if (!number) return null;
  const c = (carrier || "").toLowerCase().trim();
  if (c.includes("dhl")) return `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${number}`;
  if (c.includes("dpd")) return `https://tracking.dpd.de/status/de_DE/parcel/${number}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${number}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
  if (c.includes("hermes") || c.includes("evri")) return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsdetails/#/${number}`;
  if (c.includes("gls")) return `https://gls-group.com/DE/de/paketverfolgung?match=${number}`;
  if (c.includes("post") || c.includes("brief")) return `https://www.deutschepost.de/de/s/sendungsverfolgung.html?barcode=${number}`;
  return null;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtEur(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

async function downloadInvoice(order) {
  const token = getToken("customer");
  const res = await fetch(`/api/store-invoice/${order.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert("Rechnung konnte nicht heruntergeladen werden."); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rechnung-${order.order_number || order.id?.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadReturnRetourenschein(order) {
  const token = getToken("customer");
  const res = await fetch(`/api/store-return-retourenschein/${order.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert("Retourenschein konnte nicht geladen werden."); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Retourenschein-${order.order_number || order.id?.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadReturnEtikett(order) {
  const token = getToken("customer");
  const res = await fetch(`/api/store-return-etikett/${order.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { alert("Rücksende-Etikett konnte nicht geladen werden."); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Ruecksende-Etikett-${order.order_number || order.id?.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Retoure anfragen — #{order.order_number || "—"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: "#374151" }}>Rückgabegrund *</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            <option value="">Bitte wählen…</option>
            <option value="defekt">Artikel defekt / beschädigt</option>
            <option value="falsch">Falscher Artikel erhalten</option>
            <option value="nicht_gefallen">Artikel gefällt nicht</option>
            <option value="zu_gross">Zu groß</option>
            <option value="zu_klein">Zu klein</option>
            <option value="nicht_erwartet">Entspricht nicht der Beschreibung</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: "#374151" }}>Anmerkungen (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, resize: "vertical", boxSizing: "border-box" }} placeholder="Weitere Details…" />
          {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{err}</p>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer", background: "#fff" }}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: "7px 14px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 700, boxShadow: "0 2px 0 2px #000" }}>
            {saving ? "…" : "Retoure anfragen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StarDisplay({ rating }) {
  const full = Math.round(rating);
  return (
    <span style={{ color: "#f59e0b", fontSize: 13, letterSpacing: 1 }}>
      {[1,2,3,4,5].map(i => i <= full ? "★" : "☆").join("")}
    </span>
  );
}

// Strip variant from title: "Product Name (Variant)" → "Product Name"
function shortTitle(raw) {
  const m = (raw || "").match(/^(.*)\s+\(.+\)$/);
  return m ? m[1] : (raw || "");
}

export default function OrdersPage() {
  useAuthGuard({ requiredRole: "customer", redirectTo: "/login" });
  const { logout } = useAuth();
  const router = useRouter();
  const tOrd = useTranslations("pages.orders");
  const statusLabel = (code) => {
    const k = (code || "").toLowerCase();
    try {
      return tOrd(`orderStatus.${k}`);
    } catch {
      return STATUS_LABEL_FALLBACK[k] || code || "—";
    }
  };

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [retourModal, setRetourModal] = useState(null);
  const [messageModal, setMessageModal] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [reviewMap, setReviewMap] = useState({});

  const fetchOrders = async () => {
    try {
      const token = getToken("customer");
      if (!token) { setLoading(false); return; }
      const client = getMedusaClient();
      const [ordersRes, reviewsRes] = await Promise.all([
        client.request("/store/orders/me", { headers: { Authorization: `Bearer ${token}` } }),
        client.request("/store/reviews/my", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (ordersRes?.__error) {
        setError(ordersRes.message || "Fehler");
        setOrders([]);
      } else {
        setOrders(ordersRes?.orders || []);
      }
      if (!reviewsRes?.__error) {
        const map = {};
        for (const r of (reviewsRes?.reviews || [])) {
          if (r.order_id && r.product_id) map[`${r.order_id}:${r.product_id}`] = r;
        }
        setReviewMap(map);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  const getOrderReviewState = (order) => {
    const items = (order.items || []).filter(it => it.product_id);
    if (items.length === 0) return null;
    const reviewed = items.filter(it => reviewMap[`${order.id}:${it.product_id}`]);
    if (reviewed.length === 0) return "none";
    if (reviewed.length < items.length) return "partial";
    return "full";
  };

  const getOrderAvgRating = (order) => {
    const items = (order.items || []).filter(it => it.product_id);
    const ratings = items.map(it => reviewMap[`${order.id}:${it.product_id}`]?.rating).filter(Boolean);
    if (!ratings.length) return 0;
    return ratings.reduce((s, r) => s + Number(r), 0) / ratings.length;
  };

  const SHIPPED_STATUSES = ["versendet", "zugestellt", "abgeschlossen", "shipped", "delivered", "completed", "retoure", "retoure_anfrage"];

  const canReturn = (order) => {
    if (order.order_status === "storniert" || order.order_status === "refunded") return false;
    if (order.returns?.some(r => r.status !== "abgelehnt")) return false;
    const isShipped =
      SHIPPED_STATUSES.includes(order.order_status) ||
      SHIPPED_STATUSES.includes(order.delivery_status);
    if (!isShipped) return false;
    const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : null;
    if (!deliveryDate) return true; // no delivery date recorded → allow, backend validates
    const daysSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 14;
  };

  const returnExpired = (order) => {
    if (order.returns?.some(r => r.status !== "abgelehnt")) return false;
    const isShipped =
      SHIPPED_STATUSES.includes(order.order_status) ||
      SHIPPED_STATUSES.includes(order.delivery_status);
    if (!isShipped) return false;
    const deliveryDate = order.delivery_date ? new Date(order.delivery_date) : null;
    if (!deliveryDate) return false;
    return (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24) > 14;
  };

  /** Refund > aktive Retoure (offen / genehmigt) > sonst DB order_status (retoure_* wird nicht von „Abgeschlossen“ überschrieben) */
  const displayStatus = (order) => {
    if (order.order_status === "refunded") return "refunded";
    const hasRefund = (order.returns || []).some(r => r.refund_status === "erstattet");
    if (hasRefund) return "refunded";
    const activeRet = (order.returns || []).find(
      (r) => r.status !== "abgelehnt" && r.status !== "abgeschlossen",
    );
    if (activeRet) {
      if (activeRet.status === "genehmigt") return "retoure";
      if (activeRet.status === "offen") return "retoure_anfrage";
      return "retoure_anfrage";
    }
    if (order.order_status === "retoure" || order.order_status === "retoure_anfrage") return order.order_status;
    const os = String(order.order_status || "").toLowerCase();
    const ps = String(order.payment_status || "").toLowerCase();
    const paidFlag = ps === "bezahlt" || order.status === "paid";
    if (paidFlag && (os === "offen" || os === "")) return "bezahlt";
    return order.order_status || order.delivery_status || "offen";
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#fafafa" }}>
      <ShopHeader />
      {retourModal && (
        <RetourModal
          order={retourModal}
          onClose={() => setRetourModal(null)}
          onSubmitted={() => { setSuccessMsg("Retouranfrage wurde erfolgreich eingereicht. Wir melden uns bei dir!"); fetchOrders(); }}
        />
      )}
      {messageModal && (
        <MessageModal order={messageModal} onClose={() => setMessageModal(null)} />
      )}
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 20px 64px" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: "0 0 28px" }}>Meine Bestellungen</h1>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "start" }}>
            <AccountSidebar onLogout={() => { logout(); router.push("/"); }} />
            <div>
              {successMsg && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  {successMsg}
                </div>
              )}

              {loading && (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af", fontSize: 14 }}>Laden…</div>
              )}

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
                  Fehler beim Laden der Bestellungen.
                </div>
              )}

              {!loading && !error && orders.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 16 }}>Noch keine Bestellungen vorhanden.</p>
                  <Link href="/" style={{ background: "#ff971c", color: "#fff", padding: "9px 22px", borderRadius: 10, fontWeight: 700, textDecoration: "none", border: "2px solid #000", boxShadow: "0 2px 0 2px #000", fontSize: 13 }}>
                    Zum Shop
                  </Link>
                </div>
              )}

              {orders.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                  {orders.map((order, idx) => {
                    const isExpanded = expanded[order.id];
                    const activeReturn = order.returns?.find(
                      (r) => r.status !== "abgelehnt" && r.status !== "abgeschlossen",
                    );
                    const approvedReturn = order.returns?.find((r) => r.status === "genehmigt");
                    const items = order.items || [];
                    const subtotal = Number(order.subtotal_cents || 0);
                    const shipping = Number(order.shipping_cents || 0);
                    const discount = Number(order.discount_cents || 0);
                    const total = Number(order.total_cents || 0);
                    const reviewState = getOrderReviewState(order);
                    const trackUrl = getTrackingUrl(order.carrier_name, order.tracking_number);

                    return (
                      <div
                        key={order.id}
                        style={{ borderTop: idx > 0 ? "1px solid #f3f4f6" : "none" }}
                      >
                        {/* Main row */}
                        <div style={{ padding: "14px 18px", display: "flex", gap: 16, alignItems: "flex-start" }}>
                          {/* Left meta */}
                          <div style={{ minWidth: 110, flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                              #{order.order_number || order.id?.slice(0, 8)}
                            </div>
                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{fmtDate(order.created_at)}</div>
                            <div style={{ marginTop: 6 }}>
                              <StatusPill status={displayStatus(order)} label={statusLabel(displayStatus(order))} />
                            </div>
                          </div>

                          {/* Items inline */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {items.map((item, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < items.length - 1 ? 6 : 0 }}>
                                {item.thumbnail && (
                                  <img
                                    src={item.thumbnail}
                                    alt=""
                                    style={{ width: 32, height: 32, borderRadius: 5, objectFit: "cover", flexShrink: 0, border: "1px solid #f3f4f6" }}
                                  />
                                )}
                                <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.3 }}>
                                  {item.product_handle ? (
                                    <Link href={`/produkt/${item.product_handle}`} style={{ color: "#374151", textDecoration: "none" }}>
                                      {shortTitle(item.title)}
                                    </Link>
                                  ) : shortTitle(item.title)}
                                  {item.quantity > 1 && (
                                    <span style={{ color: "#9ca3af", marginLeft: 4 }}>×{item.quantity}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                            {order.tracking_number && (
                              <div style={{ marginTop: 7, fontSize: 11, color: "#6b7280" }}>
                                {order.carrier_name && <span style={{ marginRight: 4 }}>{order.carrier_name}:</span>}
                                {trackUrl ? (
                                  <a href={trackUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280", fontFamily: "monospace", textDecoration: "underline" }}>
                                    {order.tracking_number}
                                  </a>
                                ) : (
                                  <span style={{ fontFamily: "monospace" }}>{order.tracking_number}</span>
                                )}
                              </div>
                            )}
                            {order.delivery_date && (
                              <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
                                Zugestellt: {fmtDate(order.delivery_date)}
                              </div>
                            )}
                          </div>

                          {/* Right: total + actions */}
                          <div style={{ flexShrink: 0, textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                              {fmtEur(total)}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginTop: 8 }}>
                              <button
                                onClick={() => setExpanded(e => ({ ...e, [order.id]: !e[order.id] }))}
                                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#d1d5db" }}
                              >
                                {isExpanded ? "Weniger ▲" : "Details ▼"}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadInvoice(order)}
                                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#d1d5db" }}
                              >
                                Rechnung
                              </button>
                              {approvedReturn && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => downloadReturnRetourenschein(order)}
                                    style={{ fontSize: 11, color: "#b45309", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#fcd34d" }}
                                  >
                                    {tOrd("retourenschein")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadReturnEtikett(order)}
                                    style={{ fontSize: 11, color: "#b45309", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#fcd34d" }}
                                  >
                                    {tOrd("ruecksendeEtikett")}
                                  </button>
                                </>
                              )}
                              {canReturn(order) && !activeReturn && (
                                <button
                                  onClick={() => setRetourModal(order)}
                                  style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", textDecorationColor: "#fca5a5" }}
                                >
                                  Retoure
                                </button>
                              )}
                              {returnExpired(order) && !activeReturn && (
                                <span style={{ fontSize: 10, color: "#d1d5db" }}>Frist abgelaufen</span>
                              )}
                              <button
                                onClick={() => setMessageModal(order)}
                                style={{ fontSize: 11, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 3 }}
                                title="Nachricht senden"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="12" height="12"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                                Nachricht
                              </button>
                              {(() => {
                                if (reviewState === null) return null;
                                if (reviewState === "full") {
                                  const avg = getOrderAvgRating(order);
                                  return (
                                    <Link href="/reviews" style={{ fontSize: 11, color: "#16a34a", textDecoration: "none" }}>
                                      <StarDisplay rating={avg} />
                                    </Link>
                                  );
                                }
                                return (
                                  <Link href="/reviews" style={{ fontSize: 11, color: "#ff971c", textDecoration: "underline", textDecorationColor: "#fde68a" }}>
                                    {reviewState === "partial" ? "Weiter bewerten" : "Bewerten"}
                                  </Link>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (() => {
                          const VAT = 0.19;
                          // Brutto subtotal = sum of item brutto prices
                          const zwischensumme = items.reduce((s, it) => s + (Number(it.unit_price_cents || 0) * Number(it.quantity || 1)), 0);
                          const nettoTotal = Math.round(zwischensumme / (1 + VAT));
                          const mwstTotal = zwischensumme - nettoTotal;
                          const thStyle = { textAlign: "right", padding: "5px 8px 8px", fontSize: 11, fontWeight: 600, color: "#9ca3af", whiteSpace: "nowrap" };
                          const tdR = { textAlign: "right", padding: "9px 8px", fontSize: 13, color: "#374151", whiteSpace: "nowrap" };
                          const tdL = { padding: "9px 8px", fontSize: 13 };
                          const footRow = (label, value, opts = {}) => (
                            <tr style={{ borderTop: opts.topBorder ? "2px solid #e5e7eb" : "1px solid #f3f4f6" }}>
                              <td colSpan={3} style={{ ...tdL, color: opts.bold ? "#111827" : "#6b7280", fontWeight: opts.bold ? 700 : 400, fontSize: opts.bold ? 14 : 13 }}>{label}</td>
                              <td style={{ ...tdR, fontWeight: opts.bold ? 700 : 400, fontSize: opts.bold ? 14 : 13, color: opts.green ? "#16a34a" : opts.bold ? "#111827" : "#374151" }}>{value}</td>
                            </tr>
                          );
                          return (
                            <div style={{ borderTop: "1px solid #f3f4f6", background: "#fafafa", padding: "16px 18px 20px" }}>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                                  <thead>
                                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                      <th style={{ ...thStyle, textAlign: "left" }}>Produkt</th>
                                      <th style={thStyle}>Menge</th>
                                      <th style={thStyle}>Einzelpreis (brutto)</th>
                                      <th style={thStyle}>Gesamt (brutto)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((it, i) => {
                                      const bruttoUnit = Number(it.unit_price_cents || 0);
                                      const qty = Number(it.quantity || 1);
                                      const bruttoGesamt = bruttoUnit * qty;
                                      const nettoUnit = Math.round(bruttoUnit / (1 + VAT));
                                      const mwstUnit = bruttoUnit - nettoUnit;
                                      const raw = it.title || "";
                                      const m = raw.match(/^(.*)\s+\((.+)\)$/);
                                      const name = m ? m[1] : raw;
                                      const variant = m ? m[2] : null;
                                      const variantParts = variant ? variant.split(/\s*\/\s*/).filter(Boolean) : [];
                                      return (
                                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                          <td style={{ ...tdL, maxWidth: 320 }}>
                                            {it.product_handle ? (
                                              <Link href={`/produkt/${it.product_handle}`} style={{ fontWeight: 500, color: "#111827", textDecoration: "none" }}>{name}</Link>
                                            ) : (
                                              <span style={{ fontWeight: 500, color: "#111827" }}>{name}</span>
                                            )}
                                            {variantParts.length > 0 && (
                                              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
                                                {variantParts.join(" · ")}
                                              </div>
                                            )}
                                            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                                              Netto: {fmtEur(nettoUnit)} · +MwSt. 19%: {fmtEur(mwstUnit)}
                                            </div>
                                          </td>
                                          <td style={{ ...tdR }}>{qty}</td>
                                          <td style={{ ...tdR }}>{fmtEur(bruttoUnit)}</td>
                                          <td style={{ ...tdR, fontWeight: 600 }}>{fmtEur(bruttoGesamt)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    {footRow("Netto (exkl. MwSt.)", fmtEur(nettoTotal))}
                                    {footRow("MwSt. (19%)", fmtEur(mwstTotal))}
                                    {footRow("Zwischensumme (brutto)", fmtEur(zwischensumme))}
                                    {footRow("Versandkosten", shipping > 0 ? fmtEur(shipping) : "Kostenlos")}
                                    {footRow("Rabatt", discount > 0 ? `−${fmtEur(discount)}` : "—", { green: discount > 0 })}
                                    {footRow("Gesamt", fmtEur(total), { bold: true, topBorder: true })}
                                  </tfoot>
                                </table>
                              </div>
                              {activeReturn && (
                                <div style={{ marginTop: 12, fontSize: 12, borderRadius: 6, padding: "8px 12px", background: activeReturn.refund_status === "erstattet" ? "#eff6ff" : activeReturn.status === "genehmigt" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${activeReturn.refund_status === "erstattet" ? "#bfdbfe" : activeReturn.status === "genehmigt" ? "#bbf7d0" : "#fde68a"}`, color: activeReturn.refund_status === "erstattet" ? "#1d4ed8" : activeReturn.status === "genehmigt" ? "#15803d" : "#92400e" }}>
                                  {activeReturn.refund_status === "erstattet" ? (
                                    <span>💶 Erstattung bearbeitet – R-{activeReturn.return_number || "—"}</span>
                                  ) : activeReturn.status === "genehmigt" ? (
                                    <div>
                                      <div>✓ Retoure genehmigt – R-{activeReturn.return_number || "—"}</div>
                                      {activeReturn.label_sent_at && (
                                        <div style={{ marginTop: 4 }}>Retoureschein wurde per E-Mail gesendet am {fmtDate(activeReturn.label_sent_at)}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span>Retoure #{activeReturn.return_number || "—"} · {activeReturn.status}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
