"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import GlobalPageLoader from "@/components/ui/GlobalPageLoader";
import TruckLoader from "@/components/ui/TruckLoader";
import { getToken } from "@andertal/lib";
import { getMedusaClient } from "@/lib/medusa-client";
import { resolveImageUrl } from "@/lib/image-url";
import { formatPriceCents, getLocalizedCartLineTitle } from "@/lib/format";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { createOrderSupportCase, primaryCaseIdFromCreate } from "@/lib/create-order-support-case";
import { destinationCountryFromOrder, formatVatPercent, getGoodsVatRatePercent, splitInclusiveVat } from "@/lib/goods-vat";

const ORANGE = "#ff971c";
const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

/* ── helpers ── */
const INTL_LOCALE = { de: "de-DE", en: "en-GB", tr: "tr-TR", fr: "fr-FR", es: "es-ES", it: "it-IT" };
function fmtDate(d, locale = "de") {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(INTL_LOCALE[locale] || "de-DE", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtTime(d, locale = "de") {
  if (!d) return "";
  return new Date(d).toLocaleTimeString(INTL_LOCALE[locale] || "de-DE", { hour: "2-digit", minute: "2-digit" });
}
function fmtEur(cents, locale = "de") {
  return (Number(cents || 0) / 100).toLocaleString(INTL_LOCALE[locale] || "de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function statusLabel(t, status) {
  const k = String(status || "").toLowerCase();
  if (!k) return "-";
  try { return t(`status.${k}`); } catch (_) { return status; }
}
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

function StatusPill({ status, large, t }) {
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
      {statusLabel(t, k) || status || "-"}
    </span>
  );
}

function StatusTimeline({ status, t }) {
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
                {statusLabel(t, step)}
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
  const t = useTranslations("order");
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const [selected, setSelected] = useState(() => {
    const init = {};
    for (const it of orderItems) {
      if (orderItems.length === 1) init[String(it.id)] = Number(it.quantity || 1);
    }
    return init;
  });
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggleItem = (id, maxQty) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = maxQty;
      return next;
    });
  };

  const submit = async () => {
    if (!reason) { setErr(t("reasonRequired")); return; }
    const items = Object.entries(selected).map(([order_item_id, quantity]) => ({ order_item_id, quantity: Number(quantity) || 1 }));
    if (!items.length) { setErr(t("selectReturnItems")); return; }
    setBusy(true); setErr("");
    try {
      const token = getToken("customer");
      await getMedusaClient().request(`/store/orders/${order.id}/return-request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes, items }),
      });
      onDone?.();
      onClose();
    } catch (e) { setErr(e?.message || t("submitError")); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "86vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t("requestReturn")}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "18px 22px", overflowY: "auto" }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8, color: "#374151" }}>{t("selectReturnItems")}</label>
          <div style={{ marginBottom: 14, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            {orderItems.map((it) => {
              const id = String(it.id);
              const maxQty = Number(it.quantity || 1);
              const checked = selected[id] != null;
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleItem(id, maxQty)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{it.title || "—"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>× {maxQty}</div>
                  </div>
                  {checked && maxQty > 1 && (
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={selected[id]}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(maxQty, Math.round(Number(e.target.value) || 1)));
                        setSelected((prev) => ({ ...prev, [id]: v }));
                      }}
                      style={{ width: 56, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12 }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>{t("returnReasonLabel")}</label>
          <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
            <option value="">{t("choosePlaceholder")}</option>
            <option value="defekt">{t("reasonDefect")}</option>
            <option value="falsch">{t("reasonWrongItem")}</option>
            <option value="nicht_gefallen">{t("reasonDislike")}</option>
            <option value="zu_gross">{t("reasonTooBig")}</option>
            <option value="zu_klein">{t("reasonTooSmall")}</option>
            <option value="nicht_erwartet">{t("reasonNotAsDescribed")}</option>
            <option value="sonstiges">{t("reasonOther")}</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>{t("notesLabel")}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
            placeholder={t("notesPlaceholder")}
          />
          {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</p>}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "#fff" }}>{t("cancelButton")}</button>
          <button onClick={submit} disabled={busy} style={{ padding: "8px 18px", background: "#b91c1c", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: busy ? "not-allowed" : "pointer", fontWeight: 700 }}>
            {busy ? "…" : t("requestReturn")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnTrackingForm({ order, activeReturn, onSaved }) {
  const t = useTranslations("order");
  const [tracking, setTracking] = useState(() => String(activeReturn?.customer_tracking_number || ""));
  const [carrier, setCarrier] = useState(() => String(activeReturn?.customer_carrier_name || ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!tracking.trim()) { setErr(t("trackingRequired")); return; }
    setBusy(true); setErr("");
    try {
      const token = getToken("customer");
      await getMedusaClient().request(`/store/orders/${order.id}/return-tracking`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tracking_number: tracking.trim(), carrier_name: carrier.trim() || undefined }),
      });
      onSaved?.();
    } catch (e) { setErr(e?.message || t("submitError")); }
    setBusy(false);
  };

  if (!activeReturn || activeReturn.return_method !== "customer_ships") return null;

  if (activeReturn.customer_tracking_number) {
    return (
      <Card>
        <CardTitle>{t("returnTrackingHeading")}</CardTitle>
        <div style={{ fontSize: 13, color: "#374151" }}>
          {t("returnTrackingSaved")}: <strong>{activeReturn.customer_tracking_number}</strong>
          {activeReturn.customer_carrier_name ? ` (${activeReturn.customer_carrier_name})` : ""}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>{t("returnTrackingHeading")}</CardTitle>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 12px" }}>{t("returnTrackingHint")}</p>
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>{t("trackingNumberLabel")}</label>
      <input value={tracking} onChange={(e) => setTracking(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
        placeholder={t("trackingNumberPlaceholder")}
      />
      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "#374151" }}>{t("carrierOptionalLabel")}</label>
      <input value={carrier} onChange={(e) => setCarrier(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
        placeholder="DHL / Hermes / DPD…"
      />
      {err && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 0 }}>{err}</p>}
      <button type="button" onClick={submit} disabled={busy}
        style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
        {busy ? "…" : t("submitTracking")}
      </button>
    </Card>
  );
}

/* ── Message modal → creates a support case, then opens /nachrichten ── */
function MessageModal({ order, onClose }) {
  const t = useTranslations("order");
  const locale = useLocale();
  const router = useRouter();
  const items = Array.isArray(order?.items) ? order.items : [];
  const [selectedItemId, setSelectedItemId] = useState(items.length === 1 ? String(items[0].id || "") : "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const selectedItem = items.find((it) => String(it.id || "") === selectedItemId) || null;

  const send = async () => {
    if (!body.trim() || !selectedItemId) return;
    setSending(true);
    setErr("");
    try {
      const result = await createOrderSupportCase({
        orderId: order.id,
        itemIds: [selectedItemId],
        title: t("orderTitle", { number: order.order_number || "" }),
        description: body.trim(),
        locale,
        category: "seller",
        subcategory: "message",
      });
      if (result?.__error) throw new Error(result.message || t("genericError"));
      const caseId = primaryCaseIdFromCreate(result);
      onClose();
      router.push(caseId ? `/nachrichten?case=${encodeURIComponent(caseId)}` : "/nachrichten");
    } catch (e) {
      setErr(e?.message || t("genericError"));
      setSending(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t("messageModalTitle", { number: order.order_number || "-" })}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>

        {!selectedItemId ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>{t("messageProductPickPrompt")}</div>
            {items.map((it, i) => (
              <button
                key={it.id || i}
                onClick={() => setSelectedItemId(String(it.id || ""))}
                disabled={!it.id}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                  border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 8, background: "#fff",
                  cursor: it.id ? "pointer" : "not-allowed", opacity: it.id ? 1 : 0.5, textAlign: "left",
                }}
              >
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f3f4f6" }}>
                  {it.thumbnail ? (
                    <img src={resolveImageUrl(it.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                  ) : <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {getLocalizedCartLineTitle(it, locale)}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>× {it.quantity}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
              <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 5, overflow: "hidden", background: "#f3f4f6" }}>
                {selectedItem?.thumbnail ? (
                  <img src={resolveImageUrl(selectedItem.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedItem ? getLocalizedCartLineTitle(selectedItem, locale) : ""}
              </div>
              {items.length > 1 && (
                <button onClick={() => setSelectedItemId("")} style={{ background: "none", border: "none", color: ORANGE, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {t("messageChangeProduct")}
                </button>
              )}
            </div>
            <div style={{ padding: "14px 20px", color: "#6b7280", fontSize: 13 }}>
              {t.has?.("messageCreatesCaseHint")
                ? t("messageCreatesCaseHint")
                : "Ihre Nachricht wird als Support-Fall angelegt und unter Nachrichten fortgesetzt."}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6" }}>
              {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 6 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                  style={{ flex: 1, padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, resize: "none" }}
                  placeholder={t("messagePlaceholder")}
                />
                <button onClick={send} disabled={sending || !body.trim()}
                  style={{ padding: "0 18px", background: ORANGE, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: sending || !body.trim() ? "not-allowed" : "pointer", opacity: sending || !body.trim() ? 0.6 : 1 }}>
                  {sending ? "…" : t("sendButton")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Post-checkout confirmation (S3.16) ── */
function OrderConfirmationView({ order }) {
  const t = useTranslations("order");
  const locale = useLocale();
  const router = useRouter();
  const items = Array.isArray(order?.items) ? order.items : [];
  const settlement = order?.settlement_breakdown || null;

  useEffect(() => {
    const id = setTimeout(() => router.push("/orders"), 4000);
    return () => clearTimeout(id);
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
      <ShopHeader />
      <main style={{ flex: 1, maxWidth: 680, margin: "0 auto", width: "100%", padding: "40px 16px 60px", textAlign: "center" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", background: "#d1fae5",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>
          {t("confirmationTitle")}
        </h1>
        <p style={{ fontSize: "1rem", color: "#6b7280", margin: "0 0 32px", lineHeight: 1.5 }}>
          {t("confirmationSubtitle")}
        </p>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, textAlign: "left", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9375rem", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontWeight: 500, color: "#374151" }}>{t("orderNumber")}</span>
            <span style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>
              #{order.order_number || order.id?.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9375rem", padding: "8px 0", borderBottom: order.email ? "1px solid #f3f4f6" : "none" }}>
            <span style={{ fontWeight: 500, color: "#374151" }}>{t("orderDate")}</span>
            <span>{fmtDate(order.created_at)}</span>
          </div>
          {order.email && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9375rem", padding: "8px 0" }}>
              <span style={{ fontWeight: 500, color: "#374151" }}>E-Mail</span>
              <span>{order.email}</span>
            </div>
          )}
        </div>

        {settlement && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, textAlign: "left", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: "#111827", marginBottom: 12, fontSize: "0.9375rem" }}>
              {t("settlementHeading")}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9375rem", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontWeight: 500, color: "#374151" }}>{t("paymentFlow")}</span>
              <span>
                {settlement.checkout_payment_kind === "platform_loyalty"
                  ? t("paymentFlowPlatform")
                  : t("paymentFlowStripe")}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9375rem", padding: "8px 0" }}>
              <span style={{ fontWeight: 500, color: "#374151" }}>{t("paidTotal")}</span>
              <span>{formatPriceCents(settlement.customer_paid_cents || 0)} €</span>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, textAlign: "left", marginBottom: 24 }}>
            <div style={{ fontWeight: 600, color: "#111827", marginBottom: 12, fontSize: "0.9375rem" }}>
              {t("items")}
            </div>
            {items.map((item, i) => (
              <div key={item.id || i} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                borderBottom: i < items.length - 1 ? "1px solid #f3f4f6" : "none",
              }}>
                <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#f3f4f6" }}>
                  {item.thumbnail ? (
                    <img src={resolveImageUrl(item.thumbnail)} alt={item.title || ""} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", background: "#e5e7eb" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 500, color: "#111827" }}>
                    {getLocalizedCartLineTitle(item, locale)}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#6b7280" }}>× {item.quantity}</div>
                </div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                  {formatPriceCents((item.unit_price_cents || 0) * (item.quantity || 1))} €
                </div>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", fontSize: "1.0625rem",
              fontWeight: 700, color: "#111827", marginTop: 16, paddingTop: 16, borderTop: "1px solid #e5e7eb",
            }}>
              <span>{t("total")}</span>
              <span>{formatPriceCents(order.total_cents || 0)} €</span>
            </div>
          </div>
        )}

        <Link
          href="/orders"
          style={{
            display: "inline-block", padding: "14px 32px", background: ORANGE, color: "#fff",
            fontWeight: 700, fontSize: "1rem", borderRadius: 8, textDecoration: "none",
          }}
        >
          {t("viewOrders")}
        </Link>
        <div style={{ marginTop: 12 }}>
          <Link href="/" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#6b7280", textDecoration: "none" }}>
            {t("continueShopping")}
          </Link>
        </div>
      </main>
      <Footer />
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
  const t = useTranslations("order");
  const locale = useLocale();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retourModal, setRetourModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return;
    const previewKey = `andertal_order_preview_${orderId}`;
    let shownFromPreview = false;
    try {
      const raw = sessionStorage.getItem(previewKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.id === orderId) {
          setOrder(cached);
          setError(null);
          setLoading(false);
          shownFromPreview = true;
          try { sessionStorage.removeItem(previewKey); } catch (_) {}
        }
      }
    } catch (_) {}

    const apply = (row) => {
      if (!row) return false;
      setOrder(row);
      setError(null);
      setLoading(false);
      return true;
    };

    const attempts = shownFromPreview ? 1 : 6;
    for (let i = 0; i < attempts; i++) {
      try {
        const token = getToken("customer");
        if (token) {
          const res = await getMedusaClient().request("/store/orders/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const found = (res?.orders || []).find((o) => o.id === orderId);
          if (found) {
            apply(found);
            return;
          }
        }
        // Forward the token here too (not just the /orders/me lookup above) — a logged-in customer
        // pasting another customer's order id into the URL must still be rejected by the ownership
        // check in storeOrdersGET, not silently fall through to the unauthenticated guest path.
        const res = await fetch(`/api/store-orders/${orderId}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data?.order) {
          apply(data.order);
          return;
        }
        if (shownFromPreview) return;
      } catch (e) {
        if (i === attempts - 1 && !shownFromPreview) {
          setError(e?.message || t("loadError"));
          setLoading(false);
          return;
        }
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
      }
    }
    if (!shownFromPreview) {
      setError(t("notFound"));
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  if (loading) {
    // Fresh from checkout (?confirmed=1): keep showing the same truck-loader the user just
    // saw during payment processing instead of switching to a generic spinner mid-flow.
    if (isConfirmed) return <TruckLoader />;
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f9fafb" }}>
        <ShopHeader />
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GlobalPageLoader />
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
          <p style={{ color: "#ef4444", textAlign: "center" }}>{error || t("notFound")}</p>
          <div style={{ textAlign: "center", marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => { setError(null); setLoading(true); loadOrder(); }}
              style={{ background: "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
            >
              {t("retryButton")}
            </button>
            <Link href="/orders" style={{ color: ORANGE, fontWeight: 600, textDecoration: "none" }}>&larr; {t("backToOrders")}</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isConfirmed) {
    return <OrderConfirmationView order={order} />;
  }

  const items = order.items || [];
  const returns = order.returns || [];
  const status = displayStatus(order);
  const total = Number(order.total_cents || 0);
  const subtotal = Number(order.subtotal_cents || 0) || items.reduce((s, it) => s + Number(it.unit_price_cents || 0) * Number(it.quantity || 1), 0);
  const shipping = Number(order.shipping_cents || 0);
  const discount = Number(order.discount_cents || 0);
  const vatRate = getGoodsVatRatePercent(destinationCountryFromOrder(order));
  const { vatCents: vatAmount, netCents: netTotal } = splitInclusiveVat(Math.max(0, subtotal + shipping), vatRate);

  const trackingUrl = getTrackingUrl(order.carrier_name, order.tracking_number);
  const activeReturn = returns.find(r => r.status !== "abgelehnt" && r.status !== "abgeschlossen");
  const approvedReturn = returns.find(r => r.status === "genehmigt");
  // The DHL return label is now auto-generated the moment the return request is created
  // (Sendcloud, see return-label.js) — it no longer waits on manual seller approval, so show
  // it as soon as it exists rather than gating on status === "genehmigt".
  const returnWithLabel = returns.find(r => r.label_url) || null;

  const blockedStatuses = ["storniert", "cancelled", "refunded", "retoure", "retoure_anfrage"];
  // Mirrors the backend's 14-day window (store-checkout.js storeReturnRequestPOST) so the
  // button itself disappears once the deadline has passed, instead of only failing after
  // the customer fills in and submits the return modal.
  const returnWindowExpired = order.delivery_date
    ? (Date.now() - new Date(order.delivery_date).getTime()) / (1000 * 60 * 60 * 24) > 14
    : false;
  const canReturn = !activeReturn && !blockedStatuses.includes(status) && !returnWindowExpired;
  const canCancel = !!order.cancellation_allowed && !cancelBusy;

  const handleCancel = async () => {
    if (!window.confirm(t("cancelConfirm", { number: order.order_number || order.id?.slice(0, 8) }))) return;
    setCancelBusy(true);
    try {
      const token = getToken("customer");
      await getMedusaClient().cancelStoreOrder(token, order.id);
      setActionMsg({ type: "success", text: t("cancelSuccess") });
      await loadOrder();
    } catch (e) {
      setActionMsg({ type: "error", text: e?.message || t("cancelFailed") });
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

      {retourModal && <ReturnModal order={order} onClose={() => setRetourModal(false)} onDone={() => { setActionMsg({ type: "success", text: t("returnSubmitted") }); loadOrder(); }} />}
      {messageModal && <MessageModal order={order} onClose={() => setMessageModal(false)} />}

      <main style={{ flex: 1, maxWidth: 760, margin: "0 auto", width: "100%", padding: "28px 16px 60px" }}>

        {/* Back */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => router.push("/orders")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6b7280", padding: 0 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            {t("allOrders")}
          </button>
        </div>

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
                {t("orderTitle", { number: order.order_number || order.id?.slice(0, 8).toUpperCase() })}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                {t("dateTimeJoin", { date: fmtDate(order.created_at, locale), time: fmtTime(order.created_at, locale) })}
                {order.email && <span> · {order.email}</span>}
              </div>
            </div>
            <StatusPill status={status} large t={t} />
          </div>

          <StatusTimeline status={status} t={t} />

          {/* Tracking */}
          {order.tracking_number && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 1 }}>
                  {t("trackingLabel")}{order.carrier_name ? ` · ${order.carrier_name}` : ""}
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
                  {t("trackButton")} →
                </a>
              )}
            </div>
          )}

          {/* Active return notice */}
          {activeReturn && (
            <div style={{ marginTop: 12, borderRadius: 8, padding: "10px 14px", background: activeReturn.status === "genehmigt" ? "#f0fdf4" : "#fffbeb", border: `1px solid ${activeReturn.status === "genehmigt" ? "#bbf7d0" : "#fde68a"}`, fontSize: 13, color: activeReturn.status === "genehmigt" ? "#15803d" : "#92400e" }}>
              {activeReturn.status === "genehmigt"
                ? `${t("returnApproved", { number: activeReturn.return_number || "-" })}${activeReturn.label_sent_at ? ` · ${t("labelSentOn", { date: fmtDate(activeReturn.label_sent_at, locale) })}` : ""}`
                : t("returnPending", { number: activeReturn.return_number || "-" })}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card>
          <CardTitle>{t("itemsHeading", { count: items.length })}</CardTitle>
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
                    {(() => {
                      const url = storefrontProductHandle(
                        { id: item.product_id, handle: item.product_handle, metadata: item.product_metadata },
                        locale,
                      );
                      return url
                        ? <Link href={`/${url}`} style={{ fontSize: 14, fontWeight: 600, color: "#111827", textDecoration: "none" }}>{name}</Link>
                        : <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{name}</div>;
                    })()}
                    {variant && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{variant.split(/\s*\/\s*/).join(" · ")}</div>}
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {qty > 1 ? `${qty} × ${fmtEur(unitPrice, locale)}` : fmtEur(unitPrice, locale)}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", flexShrink: 0 }}>
                    {fmtEur(unitPrice * qty, locale)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Price breakdown */}
          <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 16, paddingTop: 14 }}>
            {[
              { label: t("subtotal"), value: fmtEur(subtotal, locale), muted: true },
              shipping !== 0 && { label: t("shippingLabel"), value: shipping > 0 ? fmtEur(shipping, locale) : t("freeShipping"), muted: true },
              discount > 0 && { label: t("discountLabel"), value: `−${fmtEur(discount, locale)}`, muted: true, green: true },
              { label: t("netLabel"), value: fmtEur(netTotal, locale), muted: true },
              { label: t("vatLabel", { rate: formatVatPercent(vatRate) }), value: fmtEur(vatAmount, locale), muted: true },
            ].filter(Boolean).map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: row.green ? "#16a34a" : "#6b7280", marginBottom: 5 }}>
                <span>{row.label}</span><span>{row.value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#111827", borderTop: "2px solid #e5e7eb", marginTop: 8, paddingTop: 10 }}>
              <span>{t("total")}</span><span>{fmtEur(total, locale)}</span>
            </div>
          </div>
        </Card>

        {/* Delivery & Payment */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {addrLines.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <CardTitle>{t("shippingAddressHeading")}</CardTitle>
              {addrLines.map((l, i) => (
                <div key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{l}</div>
              ))}
              {order.delivery_date && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>{t("deliveredOn", { date: fmtDate(order.delivery_date, locale) })}</div>
              )}
            </Card>
          )}
          <Card style={{ marginBottom: 0 }}>
            <CardTitle>{t("orderInfoHeading")}</CardTitle>
            {order.payment_method && (
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>{t("paymentMethodLabel")}</span>
                {order.payment_method}
              </div>
            )}
            {order.payment_status && (
              <div style={{ fontSize: 13, color: "#374151", marginBottom: 6 }}>
                <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>{t("paymentStatus")}</span>
                {order.payment_status}
              </div>
            )}
            <div style={{ fontSize: 13, color: "#374151" }}>
              <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 2 }}>{t("orderedOn")}</span>
              {fmtDate(order.created_at, locale)}
            </div>
          </Card>
        </div>

        {activeReturn?.return_method === "customer_ships" && (
          <div style={{ marginBottom: 16 }}>
            <ReturnTrackingForm order={order} activeReturn={activeReturn} onSaved={loadOrder} />
          </div>
        )}

        {/* Actions */}
        <Card>
          <CardTitle>{t("actionsHeading")}</CardTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <ActionBtn bg="#f0f9ff" color="#0369a1" onClick={() => openPdf(`/api/store-invoice/${order.id}`)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {t("downloadInvoice")}
            </ActionBtn>
            <ActionBtn bg="#fff7ed" color="#c2410c" onClick={() => setMessageModal(true)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              {t("sendMessageAction")}
            </ActionBtn>
            {canReturn && (
              <ActionBtn bg="#fef2f2" color="#b91c1c" onClick={() => setRetourModal(true)}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                {t("requestReturn")}
              </ActionBtn>
            )}
            {approvedReturn && (
              <ActionBtn bg="#fffbeb" color="#92400e" onClick={() => openPdf(`/api/store-return-retourenschein/${order.id}`)}>
                {t("returnSlip")}
              </ActionBtn>
            )}
            {returnWithLabel && (
              <ActionBtn bg="#fffbeb" color="#92400e" onClick={() => window.open(returnWithLabel.label_url, "_blank", "noopener,noreferrer")}>
                {t("returnLabelAction")}
              </ActionBtn>
            )}
            {canCancel && (
              <ActionBtn color="#991b1b" bg="#fef2f2" onClick={handleCancel} loading={cancelBusy}>
                {t("cancelOrderAction")}
              </ActionBtn>
            )}
            <Link href="/orders" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9, padding: "8px 16px", textDecoration: "none" }}>
              &larr; {t("allOrders")}
            </Link>
          </div>
        </Card>

      </main>
      <Footer />
    </div>
  );
}
