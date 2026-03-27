"use client";

import React, { useState, useEffect, useRef } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/* ───────── helpers ───────── */
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMoney(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/* ───────── constants ───────── */
const STATUS_COLORS = {
  offen:         { bg: "#fff7ed", color: "#c2410c", dot: "#f97316" },
  genehmigt:     { bg: "#f0fdf4", color: "#15803d", dot: "#22c55e" },
  abgelehnt:     { bg: "#fef2f2", color: "#b91c1c", dot: "#ef4444" },
  abgeschlossen: { bg: "#f3f4f6", color: "#374151", dot: "#9ca3af" },
};
const REFUND_STATUS_COLORS = {
  erstattet: { bg: "#eff6ff", color: "#1d4ed8" },
  ausstehend: { bg: "#fefce8", color: "#a16207" },
};

/* ───────── Badge ───────── */
function Badge({ value, map }) {
  const s = (map || STATUS_COLORS)[value] || { bg: "#f3f4f6", color: "#6b7280", dot: "#9ca3af" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
      {s.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />}
      {value || "—"}
    </span>
  );
}

/* ───────── Return label HTML builder ───────── */
function buildReturnLabelHtml(ret) {
  const customerName = [ret.first_name, ret.last_name].filter(Boolean).join(" ") || ret.email || "Kunde";
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Retoureschein #${ret.return_number || ret.id?.slice(0, 8)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .section label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; display: block; margin-bottom: 3px; }
  .section p { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
  .box { border: 2px dashed #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
  .box .big { font-size: 32px; font-weight: 800; letter-spacing: 4px; color: #111; }
  .box small { font-size: 11px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f9fafb; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing:.04em; color: #6b7280; }
  td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
</style>
</head><body>
<h1>Retoureschein</h1>
<div class="subtitle">Bitte legen Sie diesen Schein dem Paket bei.</div>
<div class="grid">
  <div class="section">
    <label>Retoure-Nr.</label><p>R-${ret.return_number || "—"}</p>
    <label>Datum</label><p>${fmtDate(ret.created_at)}</p>
    <label>Status</label><p>${ret.status}</p>
  </div>
  <div class="section">
    <label>Kunde</label><p>${customerName}</p>
    <label>E-Mail</label><p>${ret.email || "—"}</p>
    <label>Bestellung</label><p>${ret.order_number ? "#" + ret.order_number : "—"}</p>
  </div>
</div>
<div class="box">
  <div class="big">R-${ret.return_number || ret.id?.slice(0, 8)}</div>
  <small>Retoure-Nummer – bitte gut sichtbar auf das Paket kleben</small>
</div>
<h3 style="margin-bottom:8px;font-size:14px;">Rückgabegrund</h3>
<p style="font-size:13px;color:#374151;margin-bottom:20px;">${ret.reason || "Kein Grund angegeben"}${ret.notes ? "<br><span style='color:#6b7280;font-size:12px;'>" + ret.notes + "</span>" : ""}</p>
${ret.items && ret.items.length ? `
<h3 style="margin-bottom:8px;font-size:14px;">Artikel</h3>
<table>
  <thead><tr><th>Artikel</th><th>Menge</th></tr></thead>
  <tbody>${ret.items.map(i => `<tr><td>${i.title || i.name || "—"}</td><td>${i.quantity || 1}</td></tr>`).join("")}</tbody>
</table>` : ""}
<div class="footer">
  <strong>Rücksendung an:</strong> Ihr Firmenname · Straße · PLZ Stadt · Deutschland<br>
  Retoure-Nr. R-${ret.return_number || "—"} · Erstellt am ${fmtDate(ret.created_at)}
</div>
</body></html>`;
}

function downloadRetourenschein(ret) {
  const html = buildReturnLabelHtml(ret);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Retoureschein-R${ret.return_number || ret.id?.slice(0, 8)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ───────── RefundModal ───────── */
function RefundModal({ ret, onClose, onRefunded }) {
  const orderTotal = ret.total_cents || 0;
  const [mode, setMode] = useState("full"); // "full" | "partial"
  const [amount, setAmount] = useState((orderTotal / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || isNaN(cents) || cents <= 0) { setError("Ungültiger Betrag"); return; }
    if (cents > orderTotal && orderTotal > 0) { setError(`Betrag darf Bestellsumme (${fmtMoney(orderTotal)}) nicht überschreiten`); return; }
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.refundReturn(ret.id, { refund_amount_cents: cents, refund_note: note });
      onRefunded(res?.return ?? { ...ret, refund_amount_cents: cents, refund_note: note, refund_status: "erstattet" });
      onClose();
    } catch (err) {
      setError(err?.message || "Fehler");
    }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,.2)", padding: 28 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Rückerstattung</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
          Retoure R-{ret.return_number} · Bestellung #{ret.order_number} · Gesamtbetrag: <strong>{fmtMoney(orderTotal)}</strong>
        </p>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {["full", "partial"].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                if (m === "full") setAmount((orderTotal / 100).toFixed(2));
              }}
              style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: mode === m ? 700 : 400,
                background: mode === m ? "#111827" : "#f9fafb",
                color: mode === m ? "#fff" : "#374151",
                border: mode === m ? "none" : "1px solid #e5e7eb",
              }}
            >
              {m === "full" ? "Vollständige Erstattung" : "Teilerstattung"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Betrag (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              readOnly={mode === "full"}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 14, fontWeight: 700, boxSizing: "border-box", background: mode === "full" ? "#f9fafb" : "#fff" }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Interne Notiz (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="z.B. Artikel beschädigt zurückgekommen…"
              style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, height: 68, resize: "vertical", boxSizing: "border-box" }}
            />
          </div>

          {/* Payment method notice */}
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1e40af" }}>
            <strong>Zahlungsmethode:</strong> {ret.payment_method || "Unbekannt"}<br />
            <span style={{ color: "#3b82f6" }}>Erstattungen werden über das Stripe-Dashboard oder manuell über den Zahlungsanbieter durchgeführt. Dieser Eintrag dient der internen Dokumentation.</span>
          </div>

          {error && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 16px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 13 }}>Abbrechen</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 20px", background: saving ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 7, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
              {saving ? "Verarbeite…" : `${fmtMoney(Math.round(parseFloat(amount || 0) * 100))} erstatten`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────── DetailPanel (slide-out) ───────── */
function DetailPanel({ ret, onClose, onUpdate }) {
  const [showRefund, setShowRefund] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [sendingLabel, setSendingLabel] = useState(false);
  const [labelMsg, setLabelMsg] = useState("");

  const handleStatus = async (status) => {
    setUpdating(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.updateReturn(ret.id, { status });
      onUpdate(res?.return ?? { ...ret, status });
    } catch {}
    setUpdating(false);
  };

  const customerName = [ret.first_name, ret.last_name].filter(Boolean).join(" ") || ret.email || "Unbekannt";

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 900 }} onClick={onClose} />
      {/* Panel */}
      <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 520, background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,.12)", zIndex: 901, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Retoure</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#111", marginTop: 2 }}>R-{ret.return_number || ret.id?.slice(0, 8)}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 20, color: "#6b7280" }}>✕</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <Badge value={ret.status} />
            {ret.refund_status && <Badge value={ret.refund_status} map={REFUND_STATUS_COLORS} />}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Quick actions */}
          {ret.status === "offen" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => handleStatus("genehmigt")}
                disabled={updating}
                style={{ flex: 1, padding: "10px 0", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >
                ✓ Genehmigen
              </button>
              <button
                onClick={() => handleStatus("abgelehnt")}
                disabled={updating}
                style={{ flex: 1, padding: "10px 0", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >
                ✕ Ablehnen
              </button>
            </div>
          )}
          {ret.status === "genehmigt" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => downloadRetourenschein(ret)}
                  style={{ flex: 1, padding: "10px 0", background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  ⬇ Label herunterladen
                </button>
                <button
                  disabled={sendingLabel || !!ret.label_sent_at}
                  onClick={async () => {
                    setSendingLabel(true); setLabelMsg("");
                    try {
                      const client = getMedusaAdminClient();
                      const res = await client.sendReturnLabel(ret.id);
                      onUpdate({ ...ret, label_sent_at: res?.label_sent_at || new Date().toISOString() });
                      setLabelMsg(res?.emailSent ? "✓ E-Mail gesendet" : "✓ Markiert (kein SMTP konfiguriert)");
                    } catch { setLabelMsg("Fehler beim Senden"); }
                    setSendingLabel(false);
                  }}
                  style={{ flex: 1, padding: "10px 0", background: ret.label_sent_at ? "#f0fdf4" : "#2563eb", color: ret.label_sent_at ? "#15803d" : "#fff", border: ret.label_sent_at ? "1px solid #bbf7d0" : "none", borderRadius: 8, cursor: (sendingLabel || !!ret.label_sent_at) ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  {sendingLabel ? "Senden…" : ret.label_sent_at ? "✓ Label gesendet" : "✉ Label per E-Mail"}
                </button>
              </div>
              {labelMsg && <div style={{ fontSize: 12, color: "#15803d", marginBottom: 8 }}>{labelMsg}</div>}
              {ret.label_sent_at && (
                <div style={{ fontSize: 11, color: "#6b7280" }}>Label gesendet am {fmtDate(ret.label_sent_at)}</div>
              )}
              {!ret.refund_status && (
                <button
                  onClick={() => setShowRefund(true)}
                  style={{ width: "100%", marginTop: 8, padding: "10px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
                >
                  💶 Erstatten
                </button>
              )}
            </div>
          )}
          {ret.status === "abgeschlossen" && !ret.refund_status && (
            <div style={{ marginBottom: 20 }}>
              <button
                onClick={() => setShowRefund(true)}
                style={{ width: "100%", padding: "10px 0", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >
                💶 Rückerstattung erfassen
              </button>
            </div>
          )}

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {[
              ["Kunde", customerName],
              ["E-Mail", ret.email || "—"],
              ["Bestellung", ret.order_number ? `#${ret.order_number}` : "—"],
              ["Bestellsumme", fmtMoney(ret.total_cents)],
              ["Erstellt", fmtDate(ret.created_at)],
              ["Genehmigt", fmtDate(ret.approved_at)],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Reason / Notes */}
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Rückgabegrund</div>
            <div style={{ fontSize: 14, color: "#111" }}>{ret.reason || "—"}</div>
            {ret.notes && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{ret.notes}</div>}
          </div>

          {/* Items */}
          {ret.items && (Array.isArray(ret.items) ? ret.items : []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Artikel</div>
              {(Array.isArray(ret.items) ? ret.items : []).map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                  <span>{item.title || item.name || "Artikel"}</span>
                  <span style={{ color: "#6b7280" }}>× {item.quantity || 1}</span>
                </div>
              ))}
            </div>
          )}

          {/* Refund info */}
          {ret.refund_status && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Erstattung</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#1d4ed8" }}>{fmtMoney(ret.refund_amount_cents)}</span>
                <Badge value={ret.refund_status} map={REFUND_STATUS_COLORS} />
              </div>
              {ret.refund_note && <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 4 }}>{ret.refund_note}</div>}
            </div>
          )}

          {/* Status change */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Status ändern</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["offen", "genehmigt", "abgelehnt", "abgeschlossen"].map(s => (
                <button
                  key={s}
                  onClick={() => handleStatus(s)}
                  disabled={updating || ret.status === s}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: ret.status === s ? "default" : "pointer",
                    fontWeight: ret.status === s ? 700 : 400,
                    background: ret.status === s ? (STATUS_COLORS[s]?.bg || "#f3f4f6") : "#f9fafb",
                    color: ret.status === s ? (STATUS_COLORS[s]?.color || "#374151") : "#6b7280",
                    border: ret.status === s ? `1px solid ${STATUS_COLORS[s]?.dot || "#e5e7eb"}` : "1px solid #e5e7eb",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showRefund && (
        <RefundModal
          ret={ret}
          onClose={() => setShowRefund(false)}
          onRefunded={(updated) => { onUpdate(updated); setShowRefund(false); }}
        />
      )}
    </>
  );
}

/* ───────── NewReturnModal ───────── */
function NewReturnModal({ onClose, onCreated }) {
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orderId.trim()) { setError("Bestell-ID erforderlich"); return; }
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.createReturn({ order_id: orderId.trim(), reason, notes });
      onCreated(res?.return ?? res);
      onClose();
    } catch (err) {
      setError(err?.message || "Fehler");
    }
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,.2)", padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700 }}>Neue Rückgabe</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Bestell-ID (UUID)</label>
            <input value={orderId} onChange={e => setOrderId(e.target.value)} style={inputStyle} placeholder="uuid der Bestellung" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Grund</label>
            <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} placeholder="z.B. Falsches Produkt, Defekt…" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notizen</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, height: 72, resize: "vertical" }} placeholder="Optionale Anmerkungen…" />
          </div>
          {error && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Abbrechen</button>
            <button type="submit" disabled={saving} style={saving ? btnDisabled : btnPrimary}>
              {saving ? "Speichern…" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ───────── Main page ───────── */
export default function OrdersReturnsPage() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null); // selected return for detail panel
  const [filterStatus, setFilterStatus] = useState("alle");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const client = getMedusaAdminClient();
        const data = await client.getReturns();
        setReturns(data.returns || []);
      } catch { setReturns([]); }
      setLoading(false);
    })();
  }, []);

  const handleUpdate = (updated) => {
    setReturns(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    if (selected?.id === updated.id) setSelected(prev => ({ ...prev, ...updated }));
  };

  const filtered = filterStatus === "alle" ? returns : returns.filter(r => r.status === filterStatus);

  const counts = returns.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const totalRefunded = returns.filter(r => r.refund_status === "erstattet").reduce((s, r) => s + (r.refund_amount_cents || 0), 0);

  const COLS = ["Retoure-Nr.", "Bestellung", "Kunde", "Grund", "Status", "Erstattung", "Datum", "Aktionen"];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Rückgaben & Erstattungen</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Rückgabeanfragen verwalten, genehmigen und erstatten</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ padding: "8px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          + Neue Rückgabe
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Gesamt", value: returns.length, color: "#111" },
          { label: "Offen", value: counts.offen || 0, color: "#c2410c" },
          { label: "Genehmigt", value: counts.genehmigt || 0, color: "#15803d" },
          { label: "Erstattet", value: fmtMoney(totalRefunded), color: "#1d4ed8" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["alle", "offen", "genehmigt", "abgelehnt", "abgeschlossen"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: filterStatus === s ? 700 : 400,
              background: filterStatus === s ? "#111827" : "#f9fafb",
              color: filterStatus === s ? "#fff" : "#6b7280",
              border: filterStatus === s ? "none" : "1px solid #e5e7eb",
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} {s !== "alle" && counts[s] ? `(${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
              {COLS.map((c, i) => (
                <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Laden…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>↩️</div>
                  <div>Keine Rückgabeanfragen</div>
                </td>
              </tr>
            )}
            {filtered.map((ret) => {
              const customerName = [ret.first_name, ret.last_name].filter(Boolean).join(" ") || "—";
              return (
                <tr
                  key={ret.id}
                  onClick={() => setSelected(ret)}
                  style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#111" }}>
                    R-{ret.return_number || ret.id?.slice(0, 8)}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "#2563eb" }}>
                    {ret.order_number ? `#${ret.order_number}` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 500 }}>{customerName}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{ret.email || ""}</div>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", maxWidth: 180 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ret.reason || "—"}</div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge value={ret.status} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {ret.refund_status
                      ? <><Badge value={ret.refund_status} map={REFUND_STATUS_COLORS} /><div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{fmtMoney(ret.refund_amount_cents)}</div></>
                      : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtDate(ret.created_at)}</td>
                  <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {ret.status === "offen" && (
                        <>
                          <button
                            onClick={async () => {
                              const client = getMedusaAdminClient();
                              const res = await client.updateReturn(ret.id, { status: "genehmigt" });
                              handleUpdate(res?.return ?? { ...ret, status: "genehmigt" });
                            }}
                            style={{ padding: "3px 10px", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                          >
                            ✓
                          </button>
                          <button
                            onClick={async () => {
                              const client = getMedusaAdminClient();
                              const res = await client.updateReturn(ret.id, { status: "abgelehnt" });
                              handleUpdate(res?.return ?? { ...ret, status: "abgelehnt" });
                            }}
                            style={{ padding: "3px 10px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {ret.status === "genehmigt" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadRetourenschein(ret); }}
                            title="Label herunterladen"
                            style={{ padding: "3px 10px", background: "#f9fafb", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontSize: 11 }}
                          >
                            ⬇
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (ret.label_sent_at) return;
                              try {
                                const client = getMedusaAdminClient();
                                await client.sendReturnLabel(ret.id);
                                handleUpdate({ ...ret, label_sent_at: new Date().toISOString() });
                              } catch {}
                            }}
                            title={ret.label_sent_at ? "Label bereits gesendet" : "Label per E-Mail senden"}
                            style={{ padding: "3px 10px", background: ret.label_sent_at ? "#f0fdf4" : "#eff6ff", color: ret.label_sent_at ? "#15803d" : "#2563eb", border: `1px solid ${ret.label_sent_at ? "#bbf7d0" : "#bfdbfe"}`, borderRadius: 6, cursor: ret.label_sent_at ? "default" : "pointer", fontSize: 11 }}
                          >
                            ✉
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailPanel
          ret={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
        />
      )}

      {showNew && (
        <NewReturnModal
          onClose={() => setShowNew(false)}
          onCreated={(r) => setReturns(prev => [r, ...prev])}
        />
      )}
    </div>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 };
const inputStyle = { width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" };
const btnPrimary = { padding: "8px 20px", background: "#111827", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnSecondary = { padding: "8px 16px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 13 };
const btnDisabled = { padding: "8px 20px", background: "#9ca3af", color: "#fff", border: "none", borderRadius: 7, cursor: "not-allowed", fontSize: 13, fontWeight: 600 };
