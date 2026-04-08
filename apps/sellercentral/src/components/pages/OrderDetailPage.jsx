"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getOrderPdfDownloadUrl } from "@/lib/order-pdf-url";
import ShipOrdersModal from "@/components/orders/ShipOrdersModal";

function fmtCents(c) {
  return (Number(c || 0) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const date = dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} / ${time}`;
}
function formatPaymentMethod(pm) {
  const map = {
    visa: "Visa", mastercard: "Mastercard", amex: "American Express",
    paypal: "PayPal", klarna: "Klarna", sepa_debit: "SEPA-Lastschrift",
    card: "Kreditkarte", apple_pay: "Apple Pay", google_pay: "Google Pay",
    giropay: "Giropay", sofort: "Sofort", ideal: "iDEAL",
  };
  return map[pm] || (pm ? pm.charAt(0).toUpperCase() + pm.slice(1).replace(/_/g, " ") : "—");
}

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

function Badge({ value }) {
  const s = STATUS_COLORS[value] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {value || "—"}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      {title && <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</h3>}
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#111827" }}>{value}</span>
    </div>
  );
}

function StatusSelect({ label, value, options, onChange, saving }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: "#6b7280", minWidth: 120 }}>{label}</span>
      <Badge value={value} />
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, background: "#fff", cursor: "pointer" }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const locale = params?.locale || "de";

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  useEffect(() => { setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true"); }, []);

  const [orderStatus, setOrderStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");

  const loadOrder = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getOrder(id);
      const o = data?.order ?? data;
      setOrder(o || null);
      setOrderStatus(o?.order_status || "offen");
      setPaymentStatus(o?.payment_status || "bezahlt");
      setDeliveryStatus(o?.delivery_status || "offen");
    } catch (e) {
      setError(e?.message || "Bestellung konnte nicht geladen werden");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // Auto-abgeschlossen when (zugestellt or versendet) + bezahlt
  const handleDeliveryChange = (val) => {
    setDeliveryStatus(val);
    if ((val === "zugestellt" || val === "versendet") && paymentStatus === "bezahlt") setOrderStatus("abgeschlossen");
  };
  const handlePaymentChange = (val) => {
    setPaymentStatus(val);
    if (val === "bezahlt" && (deliveryStatus === "zugestellt" || deliveryStatus === "versendet")) setOrderStatus("abgeschlossen");
  };

  const handleSaveStatus = async () => {
    setSaving(true);
    try {
      const client = getMedusaAdminClient();
      const res = await client.updateOrder(id, { order_status: orderStatus, payment_status: paymentStatus, delivery_status: deliveryStatus });
      if (res?.order) {
        setOrder(o => ({ ...o, ...res.order }));
        if (res.order.order_status) setOrderStatus(res.order.order_status);
        if (res.order.payment_status) setPaymentStatus(res.order.payment_status);
        if (res.order.delivery_status) setDeliveryStatus(res.order.delivery_status);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e?.message || "Speichern fehlgeschlagen");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Bestellung wirklich löschen?")) return;
    try {
      const client = getMedusaAdminClient();
      await client.deleteOrder(id);
      router.push(`/${locale}/orders`);
    } catch (e) {
      setError(e?.message || "Löschen fehlgeschlagen");
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: "#9ca3af", textAlign: "center", marginTop: 60 }}>Laden…</div>;
  }

  if (error && !order) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 16, color: "#b91c1c" }}>{error}</div>
        <button onClick={() => router.push(`/${locale}/orders`)} style={btnStyle}>← Zurück zu Bestellungen</button>
      </div>
    );
  }

  const items = order?.items || [];
  const total = order?.total_cents || order?.subtotal_cents || 0;

  // Billing address
  const billingSame = order?.billing_same_as_shipping !== false;
  const hasBillingAddr = !billingSame && order?.billing_address_line1;

  // Customer label
  const customerLabel = order?.customer_number
    ? `${order.customer_number} – ${[order?.first_name, order?.last_name].filter(Boolean).join(" ") || "—"}`
    : `Gast – ${[order?.first_name, order?.last_name].filter(Boolean).join(" ") || "—"}`;

  const goToCustomerProfile = async (e) => {
    e?.preventDefault?.();
    if (!order) return;
    if (order.customer_id) {
      router.push(`/${locale}/customers/${order.customer_id}`);
      return;
    }
    const email = String(order.email || "").trim();
    if (!email) {
      router.push(`/${locale}/customers`);
      return;
    }
    try {
      const client = getMedusaAdminClient();
      const data = await client.getCustomers({ email, limit: 1 });
      const found = data?.customers?.[0];
      if (found?.id) {
        router.push(`/${locale}/customers/${found.id}`);
        return;
      }
    } catch (_) {}
    router.push(`/${locale}/customers`);
  };

  return (
    <div style={{ padding: 24, background: "#fff", minHeight: "100%" }}>
      {shipModalOpen && order && (
        <ShipOrdersModal
          orders={[{ ...order, _items: order.items || [] }]}
          onClose={() => setShipModalOpen(false)}
          onDone={() => loadOrder()}
        />
      )}
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
          <Button onClick={() => router.push(`/${locale}/orders`)}>← Bestellungen</Button>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Bestellung #{order?.order_number || "—"}
          </h1>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{fmtDate(order?.created_at)}</span>
        </div>
        {order?.id && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "flex-end",
              flexShrink: 0,
            }}
          >
            <Button url={getOrderPdfDownloadUrl(order.id, "invoice")} external variant="secondary">
              Rechnung (PDF)
            </Button>
            <Button url={getOrderPdfDownloadUrl(order.id, "lieferschein")} external variant="secondary">
              Lieferschein (PDF)
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, color: "#b91c1c", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div>
          {/* Order items */}
          <Section title="Artikel">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#6b7280", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "4px 0 8px" }}>Produkt</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px" }}>Menge</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px" }}>Einzelpreis</th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px" }}>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: "20px 0", color: "#9ca3af", textAlign: "center" }}>Keine Artikel</td></tr>
                )}
                {items.map((it, i) => {
                  const productUrl = it.product_id
                    ? `/${locale}/products/${it.product_id}`
                    : it.product_handle
                    ? `/${locale}/products?search=${encodeURIComponent(it.product_handle)}`
                    : null;
                  return (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {it.thumbnail && (
                          <img src={it.thumbnail} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }} />
                        )}
                        <div>
                          {productUrl ? (
                            <a href={productUrl} style={{ fontWeight: 500, color: "#111827", textDecoration: "underline", textDecorationColor: "#d1d5db" }}>
                              {it.title || "—"}
                            </a>
                          ) : (
                            <div style={{ fontWeight: 500 }}>{it.title || "—"}</div>
                          )}
                          {it.product_handle && <div style={{ fontSize: 11, color: "#9ca3af" }}>{it.product_handle}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: "#374151" }}>{it.quantity}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", color: "#374151" }}>{fmtCents(it.unit_price_cents)}</td>
                    <td style={{ textAlign: "right", padding: "10px 0", fontWeight: 600 }}>{fmtCents((it.unit_price_cents || 0) * (it.quantity || 1))}</td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", padding: "8px 0 4px", color: "#6b7280", fontSize: 12 }}>Versand</td>
                  <td style={{ textAlign: "right", padding: "8px 0 4px", fontSize: 12 }}>Kostenlos</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", padding: "4px 0", fontWeight: 700, borderTop: "2px solid #e5e7eb", paddingTop: 10 }}>Gesamt</td>
                  <td style={{ textAlign: "right", padding: "4px 0", fontWeight: 700, borderTop: "2px solid #e5e7eb", paddingTop: 10, fontSize: 15 }}>{fmtCents(total)}</td>
                </tr>
              </tfoot>
            </table>
          </Section>

          {/* Status management */}
          <Section title="Status verwalten">
            <StatusSelect label="Bestellstatus" value={orderStatus} options={["offen", "in_bearbeitung", "abgeschlossen", "storniert"]} onChange={setOrderStatus} saving={saving} />
            <StatusSelect label="Zahlungsstatus" value={paymentStatus} options={["offen", "bezahlt", "teil_erstattet", "erstattet"]} onChange={handlePaymentChange} saving={saving} />
            <StatusSelect label="Lieferstatus" value={deliveryStatus} options={["offen", "versendet", "zugestellt"]} onChange={handleDeliveryChange} saving={saving} />
            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
              <Button variant="primary" onClick={handleSaveStatus} disabled={saving} loading={saving}>
                Status speichern
              </Button>
              {saved && <span style={{ fontSize: 12, color: "#15803d" }}>✓ Gespeichert</span>}
            </div>
          </Section>

          <Section title="Versand">
            <InfoRow label="Versanddienst" value={order?.carrier_name?.trim() ? order.carrier_name : "—"} />
            <InfoRow
              label="Trackingnummer"
              value={order?.tracking_number?.trim() ? order.tracking_number : "—"}
            />
            {order?.shipped_at && <InfoRow label="Versanddatum" value={fmtDate(order.shipped_at)} />}
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" onClick={() => setShipModalOpen(true)}>
                Versand bearbeiten / als versendet markieren
              </Button>
            </div>
          </Section>

          {/* Payment info */}
          <Section title="Zahlungsinfo">
            <InfoRow label="Zahlungsmethode" value={formatPaymentMethod(order?.payment_method)} />
          </Section>
        </div>

        {/* Right column */}
        <div>
          {/* Customer */}
          <Section title="Kunde">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              <a
                href={order?.customer_id ? `/${locale}/customers/${order.customer_id}` : `/${locale}/customers`}
                onClick={goToCustomerProfile}
                style={{ color: "#202223", textDecoration: "underline" }}
              >
                {customerLabel}
              </a>
            </div>
            {isSuperuser && order?.email && (
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 2 }}>
                <a href={`mailto:${order.email}`} style={{ color: "#1d4ed8" }}>{order.email}</a>
              </div>
            )}
            {isSuperuser && order?.phone && (
              <div style={{ fontSize: 13, color: "#6b7280" }}>{order.phone}</div>
            )}
          </Section>

          {/* Customer info */}
          <Section title="Kundeninfo">
            <InfoRow label="Kundentyp" value={order?.is_guest !== false ? "Gastkunde" : "Registrierter Kunde"} />
            <InfoRow label="Erste Bestellung" value={order?.is_first_order ? "Ja" : "Nein"} />
            <InfoRow label="Newsletter" value={order?.newsletter_opted_in ? "Ja" : "Nein"} />
          </Section>

          {/* Shipping address */}
          <Section title="Lieferadresse">
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }}>
              {[order?.first_name, order?.last_name].filter(Boolean).join(" ")}<br />
              {order?.address_line1 && <>{order.address_line1}<br /></>}
              {order?.address_line2 && <>{order.address_line2}<br /></>}
              {[order?.postal_code, order?.city].filter(Boolean).join(" ") || ""}<br />
              {order?.country || ""}
            </div>
          </Section>

          {/* Billing address */}
          <Section title="Rechnungsadresse">
            {billingSame ? (
              <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>gleich wie Lieferadresse</div>
            ) : hasBillingAddr ? (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }}>
                {[order?.first_name, order?.last_name].filter(Boolean).join(" ")}<br />
                {order.billing_address_line1}<br />
                {order?.billing_address_line2 && <>{order.billing_address_line2}<br /></>}
                {[order?.billing_postal_code, order?.billing_city].filter(Boolean).join(" ") || ""}<br />
                {order?.billing_country || ""}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>gleich wie Lieferadresse</div>
            )}
          </Section>

          {/* Summary */}
          <Section title="Zusammenfassung">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Bestellnummer</span>
              <span style={{ fontWeight: 600 }}>#{order?.order_number || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Datum</span>
              <span>{fmtDate(order?.created_at)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Bestellstatus</span>
              <Badge value={order?.order_status} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Zahlung</span>
              <Badge value={order?.payment_status} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: "#6b7280" }}>Lieferung</span>
              <Badge value={order?.delivery_status} />
            </div>
          </Section>

          {/* Danger zone */}
          <div style={{ background: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Bestellung löschen</h3>
            <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <button onClick={handleDelete} style={{ padding: "7px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Bestellung löschen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = { marginTop: 16, padding: "8px 16px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, cursor: "pointer", fontSize: 13 };
