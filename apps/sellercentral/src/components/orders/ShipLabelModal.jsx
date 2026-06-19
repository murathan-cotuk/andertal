"use client";

import React, { useState, useRef, useCallback } from "react";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { readSellerIsSuperuser, resolveSellerFacingError, sellerTechnicalMessage } from "@/lib/seller-system-errors";
import { lt, dateLocaleFor } from "@/lib/locale-text";

function getPresets(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return [
    { id: "xs",  label: "XS",  desc: t("Letter packet", "Mektup paketi", "Petit paquet", "Paquete carta", "Pacco lettera", "Briefpaket"),  weight_kg: 0.5,  length_cm: 25, width_cm: 18, height_cm: 5,  note: t("up to 500g · goods shipment", "500g'a kadar · mal gönderisi", "jusqu'à 500g · envoi de marchandises", "hasta 500g · envío de mercancías", "fino a 500g · spedizione merci", "bis 500g · Warensendung") },
    { id: "s",   label: "S",   desc: t("Small parcel S", "Küçük paket S", "Petit colis S", "Paquete pequeño S", "Pacco piccolo S", "Päckchen S"),  weight_kg: 1,    length_cm: 35, width_cm: 25, height_cm: 10, note: t("up to 1 kg · DHL / DPD / GLS", "1 kg'a kadar · DHL / DPD / GLS", "jusqu'à 1 kg · DHL / DPD / GLS", "hasta 1 kg · DHL / DPD / GLS", "fino a 1 kg · DHL / DPD / GLS", "bis 1 kg · DHL / DPD / GLS") },
    { id: "m",   label: "M",   desc: t("Small parcel M", "Küçük paket M", "Petit colis M", "Paquete pequeño M", "Pacco piccolo M", "Päckchen M"),  weight_kg: 2,    length_cm: 60, width_cm: 30, height_cm: 15, note: t("up to 2 kg · DHL / DPD / GLS", "2 kg'a kadar · DHL / DPD / GLS", "jusqu'à 2 kg · DHL / DPD / GLS", "hasta 2 kg · DHL / DPD / GLS", "fino a 2 kg · DHL / DPD / GLS", "bis 2 kg · DHL / DPD / GLS") },
    { id: "l",   label: "L",   desc: t("Parcel S", "Paket S", "Colis S", "Paquete S", "Pacco S", "Paket S"),     weight_kg: 5,    length_cm: 60, width_cm: 30, height_cm: 20, note: t("up to 5 kg · all carriers", "5 kg'a kadar · tüm kargo", "jusqu'à 5 kg · tous transporteurs", "hasta 5 kg · todos transportistas", "fino a 5 kg · tutti i corrieri", "bis 5 kg · alle Carrier") },
    { id: "xl",  label: "XL",  desc: t("Parcel M", "Paket M", "Colis M", "Paquete M", "Pacco M", "Paket M"),     weight_kg: 10,   length_cm: 60, width_cm: 40, height_cm: 40, note: t("up to 10 kg · all carriers", "10 kg'a kadar · tüm kargo", "jusqu'à 10 kg · tous transporteurs", "hasta 10 kg · todos transportistas", "fino a 10 kg · tutti i corrieri", "bis 10 kg · alle Carrier") },
    { id: "xxl", label: "XXL", desc: t("Parcel L", "Paket L", "Colis L", "Paquete L", "Pacco L", "Paket L"),     weight_kg: 20,   length_cm: 80, width_cm: 60, height_cm: 40, note: t("up to 20 kg · DHL / DPD", "20 kg'a kadar · DHL / DPD", "jusqu'à 20 kg · DHL / DPD", "hasta 20 kg · DHL / DPD", "fino a 20 kg · DHL / DPD", "bis 20 kg · DHL / DPD") },
    { id: "3xl", label: "3XL", desc: t("Parcel XL", "Paket XL", "Colis XL", "Paquete XL", "Pacco XL", "Paket XL"),    weight_kg: 31.5, length_cm: 120,width_cm: 60, height_cm: 60, note: t("up to 31.5 kg · freight", "31,5 kg'a kadar · nakliye", "jusqu'à 31,5 kg · fret", "hasta 31,5 kg · transporte", "fino a 31,5 kg · spedizione", "bis 31,5 kg · Spedition") },
  ];
}

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

function RateCard({ rate, selected, onClick, locale }) {
  const badge = carrierBadge(rate.carrier);
  const hasWeight = rate.min_weight != null || rate.max_weight != null;
  const numLoc = dateLocaleFor(locale);
  const upTo = lt(locale, "up to", "en fazla", "jusqu'à", "hasta", "fino a", "bis");
  const inclVat = lt(locale, "incl. VAT", "KDV dahil", "TVA incl.", "IVA incl.", "IVA incl.", "inkl. MwSt.");
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
      <div style={{ width: 44, height: 44, borderRadius: 8, background: badge.color, color: badge.text, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0, letterSpacing: "-0.5px" }}>
        {badge.label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rate.name}</div>
        {(hasWeight || rate.delivery_days) && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
            {hasWeight && <span>{rate.max_weight != null ? `${upTo} ${(rate.max_weight / 1000).toLocaleString(numLoc, { maximumFractionDigits: 1 })} kg` : ""}</span>}
            {rate.delivery_days && <span style={{ marginLeft: hasWeight ? 8 : 0 }}>· {rate.delivery_days}</span>}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: selected ? "#2563eb" : "#111827" }}>
          {rate.price_eur.toLocaleString(numLoc, { minimumFractionDigits: 2 })} €
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>{inclVat}</div>
      </div>
    </button>
  );
}

export default function ShipLabelModal({ order, onClose, locale: localeProp = "de" }) {
  const localeFromHook = useLocale();
  const locale = localeFromHook || localeProp || "de";
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const numLoc = dateLocaleFor(locale);
  const PRESETS = getPresets(locale);

  const isSuperuser = readSellerIsSuperuser();
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [dims, setDims] = useState({ weight_kg: "1", length_cm: "35", width_cm: "25", height_cm: "10" });
  const [dimsChanged, setDimsChanged] = useState(false);
  const [rates, setRates] = useState(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [selectedRate, setSelectedRate] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  const setDim = (k, v) => {
    setDims(d => ({ ...d, [k]: v }));
    setDimsChanged(true);
    setSelectedRate(null);
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
          ? lt(
              locale,
              "No shipping options found. Check Sendcloud configuration or weight/dimensions.",
              "Kargo seçeneği bulunamadı. Sendcloud yapılandırmasını veya ağırlık/ölçüleri kontrol edin.",
              "Aucune option d'expédition. Vérifiez Sendcloud ou poids/dimensions.",
              "No se encontraron opciones de envío. Revise Sendcloud o peso/dimensiones.",
              "Nessuna opzione di spedizione. Controllare Sendcloud o peso/dimensioni.",
              "Keine Versandoptionen gefunden. Sendcloud-Konfiguration oder Gewicht/Maße prüfen."
            )
          : sellerTechnicalMessage(locale));
      } else {
        setRates(data.rates);
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
        setError(isSuperuser
          ? lt(locale, "No checkout link received.", "Ödeme bağlantısı alınamadı.", "Aucun lien de paiement reçu.", "No se recibió enlace de pago.", "Nessun link di checkout ricevuto.", "Kein Checkout-Link erhalten.")
          : sellerTechnicalMessage(locale));
        setCheckingOut(false);
      }
    } catch (e) {
      setError(resolveSellerFacingError(e, locale, isSuperuser));
      setCheckingOut(false);
    }
  };

  const hasLabel = !!(order.sendcloud_label_url || order.tracking_number);
  const platformFee = t("5% platform fee", "%5 platform ücreti", "5 % frais plateforme", "5 % comisión plataforma", "5% commissione piattaforma", "5% Plattformgebühr");
  const destCountry = order.country || "DE";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, boxShadow: "0 24px 80px rgba(0,0,0,0.25)", margin: "auto" }}>

        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{t("Buy shipping label", "Kargo etiketi satın al", "Acheter une étiquette", "Comprar etiqueta de envío", "Acquista etichetta spedizione", "Versandetikett kaufen")}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung")} <strong>#{order.order_number || "—"}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>

        <div style={{ padding: "20px 24px" }}>

          <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{t("Delivery address", "Teslimat adresi", "Adresse de livraison", "Dirección de entrega", "Indirizzo di consegna", "Lieferadresse")}</div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{[order.first_name, order.last_name].filter(Boolean).join(" ") || "—"}</div>
            {order.address_line1 && <div style={{ color: "#374151" }}>{order.address_line1}</div>}
            {order.address_line2 && <div style={{ color: "#374151" }}>{order.address_line2}</div>}
            <div style={{ color: "#374151" }}>{[order.postal_code, order.city].filter(Boolean).join(" ")}</div>
            <div style={{ color: "#374151", fontWeight: 600 }}>{destCountry}</div>
          </div>

          {hasLabel && (
            <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#854d0e" }}>
              ⚠ {t(
                "This order already has a label",
                "Bu siparişin zaten bir etiketi var",
                "Cette commande a déjà une étiquette",
                "Este pedido ya tiene una etiqueta",
                "Questo ordine ha già un'etichetta",
                "Diese Bestellung hat bereits ein Etikett"
              )}{order.tracking_number ? ` (${order.tracking_number})` : ""}. {t(
                "You can buy another, e.g. for a replacement shipment.",
                "Başka bir tane satın alabilirsiniz, örn. yedek gönderi için.",
                "Vous pouvez en acheter une autre, p.ex. pour un renvoi.",
                "Puede comprar otra, p. ej. para un envío de reemplazo.",
                "Puoi acquistarne un'altra, ad es. per una spedizione sostitutiva.",
                "Du kannst ein weiteres kaufen, z. B. für Ersatzlieferung."
              )}
              {order.sendcloud_label_url && (
                <a href={order.sendcloud_label_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, fontWeight: 600, color: "#92400e" }}>{t("Previous label ↗", "Önceki etiket ↗", "Étiquette précédente ↗", "Etiqueta anterior ↗", "Etichetta precedente ↗", "Vorheriges Etikett ↗")}</a>
              )}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{t("Package size — quick select", "Paket boyutu — hızlı seçim", "Taille colis — sélection rapide", "Tamaño paquete — selección rápida", "Dimensione pacco — selezione rapida", "Paketgröße — Schnellauswahl")}</div>
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

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{t("Adjust dimensions", "Ölçüleri ayarla", "Ajuster dimensions", "Ajustar dimensiones", "Regola dimensioni", "Maße anpassen")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <DimInput label={t("Weight", "Ağırlık", "Poids", "Peso", "Peso", "Gewicht")} value={dims.weight_kg} onChange={v => setDim("weight_kg", v)} suffix="kg" />
              <DimInput label={t("Length", "Uzunluk", "Longueur", "Largo", "Lunghezza", "Länge")} value={dims.length_cm} onChange={v => setDim("length_cm", v)} suffix="cm" />
              <DimInput label={t("Width", "Genişlik", "Largeur", "Ancho", "Larghezza", "Breite")} value={dims.width_cm} onChange={v => setDim("width_cm", v)} suffix="cm" />
              <DimInput label={t("Height", "Yükseklik", "Hauteur", "Alto", "Altezza", "Höhe")} value={dims.height_cm} onChange={v => setDim("height_cm", v)} suffix="cm" />
            </div>
          </div>

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
                <><span style={{ width: 16, height: 16, border: "2px solid #9ca3af", borderTopColor: "#374151", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> {t("Loading shipping options…", "Kargo seçenekleri yükleniyor…", "Chargement des options…", "Cargando opciones de envío…", "Caricamento opzioni spedizione…", "Lade Versandoptionen…")}</>
              ) : (
                <>{dimsChanged ? t("⟳ Update prices", "⟳ Fiyatları güncelle", "⟳ Mettre à jour les prix", "⟳ Actualizar precios", "⟳ Aggiorna prezzi", "⟳ Preise aktualisieren") : t("Fetch shipping options", "Kargo seçeneklerini getir", "Obtenir options d'expédition", "Obtener opciones de envío", "Recupera opzioni spedizione", "Versandoptionen abrufen")}</>
              )}
            </button>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
              {error}
            </div>
          )}

          {rates && rates.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {rates.length} {t("shipping options — sorted by price", "kargo seçeneği — fiyata göre sıralı", "options d'expédition — triées par prix", "opciones de envío — ordenadas por precio", "opzioni spedizione — ordinate per prezzo", "Versandoptionen — sortiert nach Preis")}
                </div>
                {selectedRate && <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>✓ {t("Selected", "Seçildi", "Sélectionné", "Seleccionado", "Selezionato", "Ausgewählt")}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rates.map(rate => (
                  <RateCard
                    key={rate.service_id}
                    rate={rate}
                    selected={selectedRate?.service_id === rate.service_id}
                    onClick={() => setSelectedRate(r => r?.service_id === rate.service_id ? null : rate)}
                    locale={locale}
                  />
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                {t("Prices incl.", "Fiyatlar dahil", "Prix incl.", "Precios incl.", "Prezzi incl.", "Preise inkl.")} {dims.weight_kg} kg, {dims.length_cm}×{dims.width_cm}×{dims.height_cm} cm · {t("destination", "varış ülkesi", "pays de destination", "país destino", "paese destinazione", "Zielland")} {destCountry} · {t("incl.", "dahil", "incl.", "incl.", "incl.", "inkl.")} {platformFee}
              </div>
            </div>
          )}

          {selectedRate && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "16px 18px", marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: "#1e40af", fontWeight: 600, marginBottom: 8 }}>{t("Summary", "Özet", "Résumé", "Resumen", "Riepilogo", "Zusammenfassung")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#374151" }}>{selectedRate.name}</span>
                <span style={{ fontWeight: 600 }}>{selectedRate.price_eur.toLocaleString(numLoc, { minimumFractionDigits: 2 })} €</span>
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {dims.weight_kg} kg · {dims.length_cm}×{dims.width_cm}×{dims.height_cm} cm → {destCountry}
              </div>
              <div style={{ marginTop: 10, borderTop: "1px solid #bfdbfe", paddingTop: 10, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                <span>{t("Total (incl. VAT)", "Toplam (KDV dahil)", "Total (TVA incl.)", "Total (IVA incl.)", "Totale (IVA incl.)", "Gesamt (inkl. MwSt.)")}</span>
                <span style={{ color: "#1d4ed8" }}>{selectedRate.price_eur.toLocaleString(numLoc, { minimumFractionDigits: 2 })} €</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                {t(
                  "Payment via Stripe · Label is generated immediately after payment and provided as PDF.",
                  "Stripe ile ödeme · Etiket ödeme sonrası hemen oluşturulur ve PDF olarak sunulur.",
                  "Paiement via Stripe · L'étiquette est générée immédiatement après paiement en PDF.",
                  "Pago vía Stripe · La etiqueta se genera inmediatamente tras el pago en PDF.",
                  "Pagamento via Stripe · L'etichetta viene generata subito dopo il pagamento in PDF.",
                  "Zahlung via Stripe · Etikett wird sofort nach Zahlung generiert und als PDF bereitgestellt."
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 500 }}>
            {t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen")}
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
              <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> {t("Redirecting…", "Yönlendiriliyor…", "Redirection…", "Redirigiendo…", "Reindirizzamento…", "Weiterleitung…")}</>
            ) : selectedRate ? (
              `${t("Buy now —", "Şimdi satın al —", "Acheter —", "Comprar —", "Acquista —", "Jetzt kaufen —")} ${selectedRate.price_eur.toLocaleString(numLoc, { minimumFractionDigits: 2 })} €`
            ) : (
              t("Please select a shipping option", "Lütfen bir kargo seçeneği seçin", "Veuillez choisir une option d'expédition", "Seleccione una opción de envío", "Seleziona un'opzione di spedizione", "Bitte Versandoption wählen")
            )}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
