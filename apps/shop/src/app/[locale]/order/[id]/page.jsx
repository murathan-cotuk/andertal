"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import NewtonsCradle from "@/components/NewtonsCradle";
import { getToken } from "@andertal/lib";
import { getMedusaClient } from "@/lib/medusa-client";
import { resolveImageUrl } from "@/lib/image-url";

const ORANGE = "#ff971c";
const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/* ── helpers ── */
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtEur(cents) {
  return (Number(cents || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

const STATUS_LABEL = {
  offen: "Offen", in_bearbeitung: "In Bearbeitung", versendet: "Versendet",
  zugestellt: "Zugestellt", abgeschlossen: "Abgeschlossen", storniert: "Storniert",
  bezahlt: "Bezahlt", refunded: "Erstattet", retoure: "Retoure",
  retoure_anfrage: "Rückgabe läuft", pending: "Offen", shipped: "Versendet",
  delivered: "Zugestellt", completed: "Abgeschlossen", cancelled: "Storniert",
  processing: "In Bearbeitung",
};
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

const STEP_ORDER = ["bezahlt", "in_bearbeitung", "versendet", "zugestellt"];
const STEP_LABELS = { bezahlt: "Bezahlt", in_bearbeitung: "In Bearbeitung", versendet: "Versendet", zugestellt: "Zugestellt" };

function displayStatus(order) {
  if (order.order_status === "refunded") return "refunded";
  if ((order.returns || []).some(r => r.refund_status === "erstattet")) return "refunded";
  const activeRet = (order.returns || []).find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  if (activeRet) return activeRet.status === "genehmigt" ? "retoure" : "retoure_anfrage";
  const ds = String(order.delivery_status || "").toLowerCase();
  if (ds === "zugestellt") return "zugestellt";
  if (ds === "versendet") return "versendet";
  const os = String(order.order_status || "").toLowerCase();
  const ps = String(order.payment_status || "").toLowerCase();
  if ((ps === "bezahlt" || order.status === "paid") && (os === "offen" || os === "")) return "bezahlt";
  return order.order_status || order.delivery_status || "offen";
}

function StatusPill({ status, large }) {
  const k = (status || "").toLowerCase();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: large ? 13 : 11, fontWeight: 700,
      color: STATUS_COLOR[k] || "#6b7280",
      background: STATUS_BG[k] || "#f3f4f6",
      borderRadius: 20, padding: large ? "5px 14px" : "3px 10px",
      letterSpacing: 0.2,
    }}>
      {STATUS_LABEL[k] || status || "—"}
    </span>
  );
}

function StatusTimeline({ status }) {
  const idx = STEP_ORDER.indexOf(status);
  if (idx < 0 || ["storniert", "cancelled", "refunded"].includes(status)) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 4 }}>
      {STEP_ORDER.map((step, i) => {
        const done = i <= idx;
        const active = i === idx;
        return (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: i < STEP_ORDER.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: active ? 20 : 14, height: active ? 20 : 14,
                borderRadius: "50%",
                background: done ? ORANGE : "#e5e7eb",
                border: active ? `3px solid ${ORANGE}33` : "none",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {done && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: done ? ORANGE : "#9ca3af", whiteSpace: "nowrap" }}>
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done && i < idx ? ORANGE : "#e5e7eb", margin: "0 4px", marginBottom: 20, transition: "background 0.2s" }} />
            )}
          </div>
        );
      })}
    </div>
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
  if (c.includes("post")) return `https://www.deutschepost.de/de/s/sendungsverfolgung.html?barcode=${number}`;
  return null;
}

async function openPdf(apiPath) {
  const token = getToken("customer");
  let popup = null;
  try { popup = window.open("about:blank", "_blank"); } catch (_) {}
  try {
    const res = await fetch(apiPath, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) { if (popup && !popup.closed) popup.close(); throw new Error(`HTTP ${res.status}`); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (popup && !popup.closed) { popup.location.href = url; }
    else { window.location.assign(url); }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 120000);
  } catch (e) {
    if (popup && !popup.closed) popup.close();
    alert(e?.message || "PDF konnte nicht geladen werden.");
  }
}

/* ── Card wrapper ── */
function Card({ children, style }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14,
      padding: "20px 22px", marginBottom: 16,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</div>;
}

/* ── Action button ── */
function ActionBtn({ children, onClick, color = "#374151", bg = "#f9fafb", disabled, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, fontWeight: 600, color: disabled ? "#9ca3af" : color,
        background: disabled ? "#f3f4f6" : bg,
        border: `1px solid ${disabled ? "#e5e7eb" : color + "33"}`,
        borderRadius: 9, padding: "8px 16px",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 0.1s",
        whiteSpace: "nowrap",
      }}
    >
      {loading ? "…" : children}
    </button>
  );
}

/* ── Return request modal ── */
function ReturnModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!reason) { setErr("Bitte wähle einen Grund."); return; }
    setBusy(true); setErr("");
    try {
      const token = getToken("customer");
      await getMedusaClient().request(`/store/orders/${order.id}/return-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes }),
      });
      onDone?.();
      onClose();
    } catch (e) { setErr(e?.message || "Fehler beim Absenden"); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Retoure anfragen</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>Rückgabegrund *</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
            <option value="">Bitte wählen…</option>
            <option value="defekt">Artikel defekt / beschädigt</option>
            <option value="falsch">Falscher Artikel erhalten</option>
            <option value="nicht_gefallen">Artikel gefällt nicht</option>
            <option value="zu_gross">Zu groß</option>
            <option value="zu_klein">Zu klein</option>
            <option value="nicht_erwartet">Entspricht nicht der Beschreibung</option>
            <option value="sonstiges">Sonstiges</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>Anmerkungen (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
            placeholder="Weitere Details…"
          />
          {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</p>}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "#fff" }}>Abbrechen</button>
          <button onClick={submit} disabled={busy} style={{ padding: "8px 18px", background: "#b91c1c", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            {busy ? "…" : "Retoure anfragen"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Message modal ── */
function MessageModal({ order, onClose }) {
  const [body, setBody] = useState("");
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const token = getToken("customer");
    getMedusaClient().request(`/store/messages?order_id=${order.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(d => { if (!d?.__error) setHistory(d?.messages || []); }).catch(() => {});
  }, [order.id]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true); setErr("");
    try {
      const token = getToken("customer");
      await getMedusaClient().request("/store/messages", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: order.id, body: body.trim(), subject: `Bestellung #${order.order_number || ""}` }),
      });
      setSent(true); setBody("");
      const d = await getMedusaClient().request(`/store/messages?order_id=${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!d?.__error) setHistory(d?.messages || []);
      setTimeout(() => setSent(false), 3000);
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSending(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Nachricht — #{order.order_number || "—"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          {history.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Noch keine Nachrichten zu dieser Bestellung</div>}
          {history.map(m => {
            const isSeller = m.sender_type === "seller";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: isSeller ? "flex-start" : "flex-end" }}>
                <div style={{ maxWidth: "75%", background: isSeller ? "#f3f4f6" : ORANGE, color: isSeller ? "#111827" : "#fff", borderRadius: isSeller ? "12px 12px 12px 2px" : "12px 12px 2px 12px", padding: "9px 13px", fontSize: 13 }}>
                  {m.body}
                  <div style={{ fontSize: 10, marginTop: 3, opacity: 0.6 }}>{new Date(m.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6" }}>
          {sent && <div style={{ color: "#15803d", fontSize: 12, marginBottom: 6 }}>Nachricht gesendet ✓</div>}
          {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              style={{ flex: 1, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, resize: "none" }}
              placeholder="Deine Nachricht…"
            />
            <button onClick={send} disabled={sending || !body.trim()}
              style={{ padding: "0 18px", background: ORANGE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: sending || !body.trim() ? "not-allowed" : "pointer", opacity: sending || !body.trim() ? 0.6 : 1 }}>
              {sending ? "…" : "Senden"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function OrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = params?.id || "";
  const isConfirmed = searchParams?.get("confirmed") === "1";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retourModal, setRetourModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const token = getToken("customer");
      if (token) {
        const res = await getMedusaClient().request("/store/orders/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const found = (res?.orders || []).find(o => o.id === orderId);
        if (found) { setOrder(found); setLoading(false); return; }
      }
      const res = await fetch(`/api/store-orders/${orderId}`);
      const data = await res.json();
      if (data?.order) setOrder(data.order);
      else setError("Bestellung nicht gefunden.");
    } catch (e) {
      setError(e?.message || "Fehler beim Laden");
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
        <ShopHeader />
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NewtonsCradle />
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
        <ShopHeader />
        <main style={{ flex: 1, maxWidth: 640, margin: "0 auto", padding: "48px 20px", width: "100%" }}>
          <p style={{ color: "#ef4444", textAlign: "center" }}>{error || "Bestellung nicht gefunden."}</p>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <Link href="/orders" style={{ color: ORANGE, fontWeight: 600, textDecoration: "none" }}>← Zurück zu Bestellungen</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const items = order.items || [];
  const returns = order.returns || [];
  const status = displayStatus(order);
  const total = Number(order.total_cents || 0);
  const subtotal = Number(order.subtotal_cents || 0) || items.reduce((s, it) => s + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0);
  const shipping = Number(order.shipping_cents || 0);
  const discount = Number(order.discount_cents || 0);
  const vatAmount = Math.round(total * 19 / 119);
  const netTotal = total - vatAmount;

  const trackingUrl = getTrackingUrl(order.carrier_name, order.tracking_number);
  const activeReturn = returns.find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  const approvedReturn = returns.find(r => r.status === "genehmigt");

  const blockedStatuses = ["storniert", "cancelled", "refunded", "retoure", "retoure_anfrage"];
  const canReturn = !activeReturn && !blockedStatuses.includes(status);
  const canCancel = !!order.cancellation_allowed && !cancelBusy;

  const handleCancel = async () => {
    if (!window.confirm(`Bestellung #${order.order_number || order.id?.slice(0, 8)} wirklich stornieren?`)) return;
    setCancelBusy(true);
    try {
      const token = getToken("customer");
      await getMedusaClient().cancelStoreOrder(token, order.id);
      setActionMsg({ type: "success", text: "Bestellung wurde storniert." });
      await loadOrder();
    } catch (e) {
      setActionMsg({ type: "error", text: e?.message || "Stornierung fehlgeschlagen." });
    }
    setCancelBusy(false);
  };

  const addr = [order.first_name, order.last_name].filter(Boolean).join(" ");
  const addrLines = [
    addr,
    order.address_line1,
    order.address_line2,
    [order.postal_code, order.city].filter(Boolean).join(" "),
    order.country,
  ].filter(Boolean);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
      <ShopHeader />

      {retourModal && <ReturnModal order={order} onClose={() => setRetourModal(false)} onDone={() => { setActionMsg({ type: "success", text: "Retouranfrage wurde eingereicht. Wir melden uns bald!" }); loadOrder(); }} />}
      {messageModal && <MessageModal order={order} onClose={() => setMessageModal(false)} />}

      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "28px 16px 60px" }}>

        {/* Back */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => router.push("/orders")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6b7280", padding: 0 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Alle Bestellungen
          </button>
        </div>

        {/* Confirmation banner */}
        {isConfirmed && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>Vielen Dank für Ihre Bestellung!</div>
              <div style={{ fontSize: 13, color: "#15803d", marginTop: 2 }}>Wir haben Ihre Bestellung erhalten und bearbeiten sie in Kürze. Eine Bestätigung wird an {order.email} gesendet.</div>
            </div>
          </div>
        )}

        {/* Action message */}
        {actionMsg && (
          <div style={{ background: actionMsg.type === "success" ? "#f0fdf4" : "#fef2f2", border: `1px solid ${actionMsg.type === "success" ? "#bbf7d0" : "#fecaca"}`, color: actionMsg.type === "success" ? "#15803d" : "#dc2626", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            {actionMsg.text}
          </div>
        )}

        {/* Header card */}
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111827", letterSpacing: -0.5, lineHeight: 1.1 }}>
                Bestellung #{order.order_number || order.id?.slice(0, 8).toUpperCase()}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {fmtDate(order.created_at)} · {fmtTime(order.created_at)} Uhr
                {order.email && <span> · {order.email}</span>}
              </div>
            </div>
            <StatusPill status={status} large />
          </div>

          <StatusTimeline status={status} />

          {/* Tracking */}
          {order.tracking_number && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 1 }}>
                  Sendungsverfolgung{order.carrier_name ? ` · ${order.carrier_name}` : ""}
                </div>
                {trackingUrl ? (
                  <a href={trackingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: "#2563eb", fontFamily: "monospace", textDecoration: "underline" }}>
                    {order.tracking_number}
                  </a>
                ) : (
                  <span style={{ fontSize: 13, fontFamily: "monospace", color: "#374151" }}>{order.tracking_number}</span>
                )}
              </div>
              {trackingUrl && (
                <a href={trackingUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textDecoration: "none", background: "#eff6ff", borderRadius: 6, padding: "5px 10px", flexShrink: 0 }}>
                  Verfolgen →
                </a>
              )}
            </div>
          )}

          {/* Active return notice */}
          {activeReturn && (
            <div style={{ marginTop: 12, borderRadius: 8, padding: "10px 14px", background: activeReturn.status === "genehmigt" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${activeReturn.status === "genehmigt" ? "#bbf7d0" : "#fde68a"}`, fontSize: 13, color: activeReturn.status === "genehmigt" ? "#15803d" : "#92400e" }}>
              {activeReturn.status === "genehmigt"
                ? `✓ Retoure genehmigt (R-${activeReturn.return_number || "—"})${activeReturn.label_sent_at ? ` · Etikett per E-Mail gesendet am ${fmtDate(activeReturn.label_sent_at)}` : ""}`
                : `Retoure #${activeReturn.return_number || "—"} · Wird geprüft`}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card>
          <CardTitle>Artikel ({items.length})</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {items.map((item, i) => {
              const raw = item.title || "";
              const m = raw.match(/^(.*)\s+\((.+)\)$/);
              const name = m ? m[1] : raw;
              const variant = m ? m[2] : null;
              const unitPrice = Number(item.unit_price_cents || 0);
              const qty = Number(item.quantity || 1);
              return (
                <div key={item.id || i} style={{ display: "flex", gap: 14, alignItems: "center", paddingBottom: i < items.length - 1 ? 14 : 0, marginBottom: i < items.length - 1 ? 14 : 0, borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ width: 60, height: 60, borderRadius: 10, overflow: "hidden", border: "1px solid #f3f4f6", flexShrink: 0, background: "#f9fafb" }}>
                    {item.thumbnail
                      ? <img src={resolveImageUrl(item.thumbnail)} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {item.product_handle
                      ? <Link href={`/produkt/${item.product_handle}`} style={{ fontSize: 14, fontWeight: 600, color: "#111827", textDecoration: "none" }}>{name}</Link>
                      : <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{name}</div>
                    }
                    {variant && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{variant.split(/\s*\/\s*/).join(" · ")}</div>}
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {qty > 1 ? `${qty} × ${fmtEur(unitPrice)}` : fmtEur(unitPrice)}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", flexShrink: 0 }}>
                    {fmtEur(unitPrice * qty)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Price breakdown */}
          <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 16, paddingTop: 14 }}>
            {[
              { label: "Zwischensumme", value: fmtEur(subtotal), muted: true },
              shipping !== 0 && { label: "Versand", value: shipping > 0 ? fmtEur(shipping) : "Kostenlos", muted: true },
              discount > 0 && { label: "Rabatt", value: `−${fmtEur(discount)}`, muted: true, green: true },
              { label: "Netto", value: fmtEur(netTotal), muted: true },
              { label: "MwSt. (19%)", value: fmtEur(vatAmount), muted: true },
            ].filter(Boolean).map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: row.green ? "#16a34a" : "#6b7280", marginBottom: 5 }}>
                <span>{row.label}</span><span>{row.value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#111827", borderTop: "2px solid #e5e7eb", marginTop: 8, paddingTop: 10 }}>
              <span>Gesamt</span><span>{fmtEur(total)}</span>
            </div>
          </div>
        </Card>

        {/* Delivery & Payment */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {addrLines.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <CardTitle>Lieferadresse</CardTitle>
              {addrLines.map((l, i) => (
                <div key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{l}</div>
              ))}
              {order.delivery_date && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Zugestellt: {fmtDate(order.delivery_date)}</div>
              )}
            </Card>
          )}
          <Card style={{ marginBottom: 0 }}>
            <CardTitle>Bestellinfo</CardTitle>
            {order.payment_method && (
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>Zahlung</span>
                {order.payment_method}
              </div>
            )}
            {order.payment_status && (
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>Zahlungsstatus</span>
                {order.payment_status}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#374151" }}>
              <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>Bestellt am</span>
              {fmtDate(order.created_at)}
            </div>
          </Card>
        </div>

        {/* Actions */}
        <Card>
          <CardTitle>Aktionen</CardTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <ActionBtn bg="#f0f9ff" color="#0369a1" onClick={() => openPdf(`/api/store-invoice/${order.id}`)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Rechnung herunterladen
            </ActionBtn>
            <ActionBtn bg="#fff7ed" color="#c2410c" onClick={() => setMessageModal(true)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              Nachricht senden
            </ActionBtn>
            {canReturn && (
              <ActionBtn bg="#fef2f2" color="#b91c1c" onClick={() => setRetourModal(true)}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                Retoure anfragen
              </ActionBtn>
            )}
            {approvedReturn && (
              <ActionBtn bg="#fffbeb" color="#92400e" onClick={() => openPdf(`/api/store-return-retourenschein/${order.id}`)}>
                Retourenschein
              </ActionBtn>
            )}
            {approvedReturn && (
              <ActionBtn bg="#fffbeb" color="#92400e" onClick={() => openPdf(`/api/store-return-etikett/${order.id}`)}>
                Rücksende-Etikett
              </ActionBtn>
            )}
            {canCancel && (
              <ActionBtn color="#991b1b" bg="#fef2f2" onClick={handleCancel} loading={cancelBusy}>
                Bestellung stornieren
              </ActionBtn>
            )}
            <Link href="/orders" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9, padding: "8px 16px", textDecoration: "none" }}>
              ← Alle Bestellungen
            </Link>
          </div>
        </Card>

      </main>
      <Footer />
    </div>
  );
}
