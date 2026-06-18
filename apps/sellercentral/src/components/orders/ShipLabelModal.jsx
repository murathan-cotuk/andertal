"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Banner, Spinner } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { readSellerIsSuperuser, resolveSellerFacingError, sellerTechnicalMessage } from "@/lib/seller-system-errors";

/* ── Standard carrier-compatible package sizes ───────────────── */
const PRESETS = [
  { id: "xs",  label: "XS",  desc: "Briefpaket",  weight_kg: 0.5,  length_cm: 25, width_cm: 18, height_cm: 5,  note: "bis 500g · Warensendung" },
  { id: "s",   label: "S",   desc: "Päckchen S",  weight_kg: 1,    length_cm: 35, width_cm: 25, height_cm: 10, note: "bis 1 kg · DHL / DPD / GLS" },
  { id: "m",   label: "M",   desc: "Päckchen M",  weight_kg: 2,    length_cm: 60, width_cm: 30, height_cm: 15, note: "bis 2 kg · DHL / DPD / GLS" },
  { id: "l",   label: "L",   desc: "Paket S",     weight_kg: 5,    length_cm: 60, width_cm: 30, height_cm: 20, note: "bis 5 kg · alle Carrier" },
  { id: "xl",  label: "XL",  desc: "Paket M",     weight_kg: 10,   length_cm: 60, width_cm: 40, height_cm: 40, note: "bis 10 kg · alle Carrier" },
  { id: "xxl", label: "XXL", desc: "Paket L",     weight_kg: 20,   length_cm: 80, width_cm: 60, height_cm: 40, note: "bis 20 kg · DHL / DPD" },
  { id: "3xl", label: "3XL", desc: "Paket XL",    weight_kg: 31.5, length_cm: 120,width_cm: 60, height_cm: 60, note: "bis 31,5 kg · Spedition" },
];

const CARRIER_LOGOS = {
  dhl:     { color: "#FFCC00", text: "#000", label: "DHL" },
  dpd:     { color: "#DC0032", text: "#fff", label: "DPD" },
  gls:     { color: "#009DE0", text: "#fff", label: "GLS" },
  ups:     { color: "#351C15", text: "#FFB500", label: "UPS" },
  fedex:   { color: "#4D148C", text: "#FF6200", label: "FedEx" },
  hermes:  { color: "#009FDA", text: "#fff", label: "Hermes" },
  bpost:   { color: "#E30613", text: "#fff", label: "bpost" },
  postnl:  { color: "#FF6200", text: "#fff", label: "PostNL" },
  colissimo: { color: "#FFCC00", text: "#000", label: "Colissimo" },
};

function carrierBadge(code) {
  const key = (code || "").toLowerCase();
  const found = Object.entries(CARRIER_LOGOS).find(([k]) => key.includes(k));
  if (!found) return { color: "#6b7280", text: "#fff", label: code || "?" };
  return found[1];
}

const inp = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };
const lbl = { fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" };

function DimInput({ label, value, onChange, suffix }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          style={{ ...inp, flex: 1, MozAppearance: "textfield" }}
          type="number" min="0.01" step="any"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", minWidth: 24 }}>{suffix}</span>
      </div>
    </div>
  );
}

function RateCard({ rate, selected, onClick }) {
  const badge = carrierBadge(rate.carrier);
  const hasWeight = rate.min_weight != null || rate.max_weight != null;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        width: "100%", padding: "14px 16px", borderRadius: 10, cursor: "pointer",
        textAlign: "left", background: selected ? "#eff6ff" : "#fff",
        border: selected ? "2px solid #2563eb" : "1px solid #e5e7eb",
        boxShadow: selected ? "0 0 0 3px rgba(37,99,235,0.1)" : "none",
        transition: "all 0.15s",
      }}
    >
      {/* Carrier badge */}
      <div style={{ width: 44, height: 44, borderRadius: 8, background: badge.color, color: badge.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0, letterSpacing: "-0.5px" }}>
        {badge.label}
      </div>
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rate.name}</div>
        {(hasWeight || rate.delivery_days) && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            {hasWeight && <span>{rate.max_weight != null ? `bis ${(rate.max_weight / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg` : ""}</span>}
            {rate.delivery_days && <span style={{ marginLeft: hasWeight ? 8 : 0 }}>· {rate.delivery_days}</span>}
          </div>
        )}
      </div>
      {/* Price */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: selected ? "#2563eb" : "#111827" }}>
          {rate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>inkl. MwSt.</div>
      </div>
    </button>
  );
}

export default function ShipLabelModal({ order, onClose, locale = "de" }) {
  const isSuperuser = readSellerIsSuperuser();
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [dims, setDims] = useState({ weight_kg: "1", length_cm: "35", width_cm: "25", height_cm: "10" });
  const [dimsChanged, setDimsChanged] = useState(false);
  const [rates, setRates] = useState(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("dims"); // "dims" | "rates" | "confirm"
  const debounceRef = useRef(null);

  const setDim = (k, v) => {
    setDims(d => ({ ...d, [k]: v }));
    setDimsChanged(true);
    setSelectedRate(null);
    // Debounce auto-fetch
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (rates) fetchRates({ ...dims, [k]: v });
    }, 800);
  };

  const applyPreset = (p) => {
    setSelectedPreset(p.id);
    const newDims = { weight_kg: String(p.weight_kg), length_cm: String(p.length_cm), width_cm: String(p.width_cm), height_cm: String(p.height_cm) };
    setDims(newDims);
    setSelectedRate(null);
    setDimsChanged(false);
    fetchRates(newDims);
  };

  const fetchRates = useCallback(async (d = dims) => {
    setLoadingRates(true);
    setError("");
    setRates(null);
    setSelectedRate(null);
    try {
      const data = await getMedusaAdminClient().getLabelRates(order.id, {
        weight_kg: Number(d.weight_kg) || 1,
        length_cm: Number(d.length_cm) || 35,
        width_cm: Number(d.width_cm) || 25,
        height_cm: Number(d.height_cm) || 10,
        locale,
      });
      if (!data?.rates?.length) {
        setError(isSuperuser
          ? "Keine Versandoptionen gefunden. Sendcloud-Konfiguration oder Gewicht/Maße prüfen."
          : sellerTechnicalMessage(locale));
      } else {
        setRates(data.rates);
        setStep("rates");
      }
    } catch (e) {
      setError(resolveSellerFacingError(e, locale, isSuperuser));
    }
    setLoadingRates(false);
    setDimsChanged(false);
  }, [order.id, dims, locale, isSuperuser]);

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
        setError(isSuperuser ? "Kein Checkout-Link erhalten." : sellerTechnicalMessage(locale));
        setCheckingOut(false);
      }
    } catch (e) {
      setError(resolveSellerFacingError(e, locale, isSuperuser));
      setCheckingOut(false);
    }
  };

  // Existing label
  const hasLabel = !!(order.sendcloud_label_url || order.tracking_number);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, boxShadow: "0 24px 80px rgba(0,0,0,0.25)", margin: "auto" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>Versandetikett kaufen</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Bestellung <strong>#{order.order_number || "—"}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        <div style={{ padding: "20px 24px" }}>

          {/* Delivery address */}
          <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Lieferadresse</div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}</div>
            {order.address_line1 && <div style={{ color: "#374151" }}>{order.address_line1}</div>}
            {order.address_line2 && <div style={{ color: "#374151" }}>{order.address_line2}</div>}
            <div style={{ color: "#374151" }}>{[order.postal_code, order.city].filter(Boolean).join(" ")}</div>
            <div style={{ color: "#374151", fontWeight: 600 }}>{order.country || "DE"}</div>
          </div>

          {/* Existing label notice */}
          {hasLabel && (
            <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#854d0e" }}>
              ⚠ Diese Bestellung hat bereits ein Etikett{order.tracking_number ? ` (${order.tracking_number})` : ""}. Du kannst ein weiteres kaufen, z. B. für Ersatzlieferung.
              {order.sendcloud_label_url && (
                <a href={order.sendcloud_label_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontWeight: 600, color: "#92400e" }}>Vorheriges Etikett ↗</a>
              )}
            </div>
          )}

          {/* Paketgröße — Schnellauswahl */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Paketgröße — Schnellauswahl</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  title={`${p.desc}\n${p.length_cm}×${p.width_cm}×${p.height_cm} cm, max ${p.weight_kg} kg\n${p.note}`}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    fontWeight: selectedPreset === p.id ? 700 : 500,
                    background: selectedPreset === p.id ? "#2563eb" : "#f3f4f6",
                    color: selectedPreset === p.id ? "#fff" : "#374151",
                    border: selectedPreset === p.id ? "2px solid #2563eb" : "2px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {p.label} <span style={{ opacity: 0.7 }}>{p.desc}</span>
                </button>
              ))}
            </div>
            {selectedPreset && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                {PRESETS.find(p => p.id === selectedPreset)?.note} · {dims.length_cm}×{dims.width_cm}×{dims.height_cm} cm · {dims.weight_kg} kg
              </div>
            )}
          </div>

          {/* Manuelle Maße */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Maße anpassen</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <DimInput label="Gewicht" value={dims.weight_kg} onChange={v => setDim("weight_kg", v)} suffix="kg" />
              <DimInput label="Länge" value={dims.length_cm} onChange={v => setDim("length_cm", v)} suffix="cm" />
              <DimInput label="Breite" value={dims.width_cm} onChange={v => setDim("width_cm", v)} suffix="cm" />
              <DimInput label="Höhe" value={dims.height_cm} onChange={v => setDim("height_cm", v)} suffix="cm" />
            </div>
          </div>

          {/* Fetch rates button */}
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => fetchRates()}
              disabled={loadingRates}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 8, cursor: loadingRates ? "default" : "pointer",
                background: dimsChanged ? "#2563eb" : "#f3f4f6",
                color: dimsChanged ? "#fff" : "#374151",
                border: "none", fontWeight: 600, fontSize: 13,
                transition: "all 0.2s",
              }}
            >
              {loadingRates ? (
                <><span style={{ width: 16, height: 16, border: "2px solid #9ca3af", borderTopColor: "#374151", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Lade Versandoptionen…</>
              ) : (
                <>{dimsChanged ? "⟳ Preise aktualisieren" : "Versandoptionen abrufen"}</>
              )}
            </button>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {/* Rate list */}
          {rates && rates.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {rates.length} Versandoptionen — sortiert nach Preis
                </div>
                {selectedRate && <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>✓ Ausgewählt</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rates.map(rate => (
                  <RateCard
                    key={rate.service_id}
                    rate={rate}
                    selected={selectedRate?.service_id === rate.service_id}
                    onClick={() => setSelectedRate(r => r?.service_id === rate.service_id ? null : rate)}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                Preise inkl. {dims.weight_kg} kg, {dims.length_cm}×{dims.width_cm}×{dims.height_cm} cm · Zielland {order.country || "DE"} · inkl. {
                  // derive markup from rate if available
                  "5% Plattformgebühr"
                }
              </div>
            </div>
          )}

          {/* Checkout summary */}
          {selectedRate && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "16px 18px", marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: "#1e40af", fontWeight: 600, marginBottom: 8 }}>Zusammenfassung</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#374151" }}>{selectedRate.name}</span>
                <span style={{ fontWeight: 600 }}>{selectedRate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {dims.weight_kg} kg · {dims.length_cm}×{dims.width_cm}×{dims.height_cm} cm → {order.country || "DE"}
              </div>
              <div style={{ marginTop: 10, borderTop: "1px solid #bfdbfe", paddingTop: 10, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                <span>Gesamt (inkl. MwSt.)</span>
                <span style={{ color: "#1d4ed8" }}>{selectedRate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                Zahlung via Stripe · Etikett wird sofort nach Zahlung generiert und als PDF bereitgestellt.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 500 }}>
            Abbrechen
          </button>
          <button
            onClick={handleCheckout}
            disabled={!selectedRate || checkingOut}
            style={{
              padding: "10px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: !selectedRate ? "#e5e7eb" : "#2563eb",
              color: !selectedRate ? "#9ca3af" : "#fff",
              border: "none", cursor: !selectedRate ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            {checkingOut ? (
              <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Weiterleitung…</>
            ) : selectedRate ? (
              `Jetzt kaufen — ${selectedRate.price_eur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
            ) : (
              "Bitte Versandoption wählen"
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
