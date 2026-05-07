"use client";

import React, { useState } from "react";
import { Button, BlockStack, InlineStack, Text, Banner } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const inp = {
  padding: "8px 10px", border: "1px solid var(--p-color-border)",
  borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box",
};
const lbl = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 };

function DimField({ label, value, onChange, suffix }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input style={{ ...inp, flex: 1 }} type="number" min="0.01" step="0.1" value={value} onChange={e => onChange(e.target.value)} />
        {suffix && <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export default function ShipLabelModal({ order, onClose, locale = "de" }) {
  const [dims, setDims] = useState({ weight_kg: "1", length_cm: "30", width_cm: "20", height_cm: "15" });
  const [rates, setRates] = useState(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");

  const setDim = (k, v) => setDims(d => ({ ...d, [k]: v }));

  const handleGetRates = async () => {
    setLoadingRates(true);
    setError("");
    setRates(null);
    setSelectedRate(null);
    try {
      const data = await getMedusaAdminClient().getLabelRates(order.id, {
        weight_kg: Number(dims.weight_kg),
        length_cm: Number(dims.length_cm),
        width_cm: Number(dims.width_cm),
        height_cm: Number(dims.height_cm),
      });
      if (!data?.rates?.length) {
        setError("Keine Versandoptionen für diese Maße und dieses Zielland gefunden.");
      } else {
        setRates(data.rates);
      }
    } catch (e) {
      setError(e?.message || "Preise konnten nicht geladen werden.");
    }
    setLoadingRates(false);
  };

  const handleCheckout = async () => {
    if (!selectedRate) return;
    setCheckingOut(true);
    setError("");
    try {
      const data = await getMedusaAdminClient().createLabelCheckout(order.id, {
        service_id: selectedRate.service_id,
        service_name: selectedRate.name,
        carrier: selectedRate.carrier,
        price_eur: selectedRate.price_eur,
        weight_kg: Number(dims.weight_kg),
        length_cm: Number(dims.length_cm),
        width_cm: Number(dims.width_cm),
        height_cm: Number(dims.height_cm),
        locale,
      });
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError("Kein Checkout-Link erhalten.");
        setCheckingOut(false);
      }
    } catch (e) {
      setError(e?.message || "Checkout konnte nicht erstellt werden.");
      setCheckingOut(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--p-color-bg-surface)", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--p-shadow-600)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--p-color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "var(--p-color-bg-surface)", zIndex: 1 }}>
          <Text as="h2" variant="headingMd">Versandetikett kaufen</Text>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          <BlockStack gap="400">
            <div style={{ background: "#f9fafb", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#374151" }}>
              Bestellung <strong>#{order.order_number || "—"}</strong> → {[order.first_name, order.last_name].filter(Boolean).join(" ") || order.email || "Kunde"} · {order.country || "DE"}
            </div>

            <div>
              <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">Paketmaße</Text>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                <DimField label="Gewicht" value={dims.weight_kg} onChange={v => setDim("weight_kg", v)} suffix="kg" />
                <DimField label="Länge" value={dims.length_cm} onChange={v => setDim("length_cm", v)} suffix="cm" />
                <DimField label="Breite" value={dims.width_cm} onChange={v => setDim("width_cm", v)} suffix="cm" />
                <DimField label="Höhe" value={dims.height_cm} onChange={v => setDim("height_cm", v)} suffix="cm" />
              </div>
              <div style={{ marginTop: 12 }}>
                <Button onClick={handleGetRates} loading={loadingRates}>
                  Versandoptionen abrufen
                </Button>
              </div>
            </div>

            {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}

            {rates && (
              <div>
                <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">Verfügbare Optionen</Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {rates.map(rate => (
                    <button
                      key={rate.service_id}
                      onClick={() => setSelectedRate(r => r?.service_id === rate.service_id ? null : rate)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 16px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                        border: selectedRate?.service_id === rate.service_id ? "2px solid #2563eb" : "1px solid #e5e7eb",
                        background: selectedRate?.service_id === rate.service_id ? "#eff6ff" : "#fff",
                        transition: "all 0.15s",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{rate.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{rate.carrier}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", flexShrink: 0, marginLeft: 12 }}>
                        {rate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedRate && (
              <div style={{ background: "#f0fdf4", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#15803d" }}>
                Ausgewählt: <strong>{selectedRate.name}</strong> · {selectedRate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € (inkl. Servicegebühr)
              </div>
            )}
          </BlockStack>
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--p-color-border)", display: "flex", justifyContent: "flex-end", position: "sticky", bottom: 0, background: "var(--p-color-bg-surface)" }}>
          <InlineStack gap="200">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={handleCheckout} disabled={!selectedRate || checkingOut} loading={checkingOut}>
              Jetzt kaufen & Etikett erstellen
            </Button>
          </InlineStack>
        </div>
      </div>
    </div>
  );
}
