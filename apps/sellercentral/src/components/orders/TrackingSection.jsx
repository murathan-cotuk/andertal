"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import { useLt } from "@/lib/use-locale-text";
import { dateLocaleFor } from "@/lib/locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { localizeShipmentEventDescription } from "@/lib/shipment-event-i18n";

function getStatusMeta(lt) {
  return {
    versendet: { label: lt("Shipped", "Gönderildi", "Expédié", "Enviado", "Spedito", "Versendet"), color: "#1d4ed8", bg: "#eff6ff", icon: "🚚" },
    in_transit: { label: lt("In transit", "Yolda", "En transit", "En tránsito", "In transito", "Unterwegs"), color: "#7c3aed", bg: "#f5f3ff", icon: "📦" },
    zugestellt: { label: lt("Delivered", "Teslim edildi", "Livré", "Entregado", "Consegnato", "Zugestellt"), color: "#15803d", bg: "#f0fdf4", icon: "✅" },
    exception: { label: lt("Exception", "İstisna", "Exception", "Excepción", "Eccezione", "Ausnahme"), color: "#b91c1c", bg: "#fef2f2", icon: "⚠️" },
    retour: { label: lt("Return", "İade", "Retour", "Devolución", "Reso", "Retour"), color: "#c2410c", bg: "#fff7ed", icon: "↩️" },
    manual: { label: lt("Manual", "Manuel", "Manuel", "Manual", "Manuale", "Manuell"), color: "#6b7280", bg: "#f9fafb", icon: "📝" },
  };
}

function EventBadge({ status, statusMeta }) {
  const m = statusMeta[status] || statusMeta.manual;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: m.bg, color: m.color }}>
      {m.icon} {m.label}
    </span>
  );
}

export default function TrackingSection({ orderId, order, onOrderStatusChanged }) {
  const locale = useLocale();
  const lt = useLt();
  const statusMeta = useMemo(() => getStatusMeta(lt), [lt]);

  const fmtDateTime = useCallback(
    (d) => {
      if (!d) return "—";
      return new Date(d).toLocaleString(dateLocaleFor(locale), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [locale],
  );

  const [events, setEvents] = useState([]);
  const [trackingUrl, setTrackingUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ status: "in_transit", description: "", location: "" });
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const client = getMedusaAdminClient();
      const data = await client.getShipmentEvents(orderId);
      setEvents(data?.events || []);
      setTrackingUrl(data?.trackingUrl || null);
    } catch (e) {
      setError(e?.message || lt("Error loading", "Yükleme hatası", "Erreur de chargement", "Error al cargar", "Errore di caricamento", "Fehler beim Laden"));
    }
    setLoading(false);
  }, [orderId, lt]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleAddEvent = async () => {
    if (!form.status) return;
    setSaving(true);
    setError("");
    try {
      const client = getMedusaAdminClient();
      await client.addShipmentEvent(orderId, {
        status: form.status,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
      });
      setForm({ status: "in_transit", description: "", location: "" });
      setShowAddForm(false);
      await loadEvents();
      if (onOrderStatusChanged) onOrderStatusChanged();
    } catch (e) {
      setError(e?.message || lt("Error saving", "Kaydetme hatası", "Erreur d'enregistrement", "Error al guardar", "Errore di salvataggio", "Fehler beim Speichern"));
    }
    setSaving(false);
  };

  const handleRefreshTracking = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    setError("");
    try {
      const client = getMedusaAdminClient();
      const data = await client.refreshTracking(orderId);
      setRefreshMsg("");
      if (data?.inserted > 0) {
        setError("");
        const n = data.inserted;
        setRefreshMsg(
          lt(
            `${n} new event${n !== 1 ? "s" : ""} imported from shipping API`,
            `${n} yeni olay gönderi API'sinden içe aktarıldı`,
            `${n} nouvel${n !== 1 ? "s" : ""} événement${n !== 1 ? "s" : ""} importé${n !== 1 ? "s" : ""} depuis l'API d'expédition`,
            `${n} nuevo${n !== 1 ? "s" : ""} evento${n !== 1 ? "s" : ""} importado${n !== 1 ? "s" : ""} desde la API de envío`,
            `${n} nuov${n !== 1 ? "i" : "o"} evento importato dalla API di spedizione`,
            `${n} neue${n === 1 ? "s" : ""} Ereignis${n === 1 ? "" : "se"} von der Versand-API importiert`,
          ),
        );
      } else if (data?.message) {
        setError(data.message);
      }
      if (data?.events) setEvents(data.events);
      if (data?.trackingUrl) setTrackingUrl(data.trackingUrl);
      if (onOrderStatusChanged) onOrderStatusChanged();
    } catch (e) {
      setError(e?.message || lt("Error fetching tracking data", "Takip verileri alınamadı", "Erreur lors de la récupération du suivi", "Error al obtener datos de seguimiento", "Errore nel recupero del tracciamento", "Fehler beim Abrufen der Tracking-Daten"));
    }
    setRefreshing(false);
  };

  const eventDescription = useCallback(
    (ev) => localizeShipmentEventDescription(locale, ev),
    [locale],
  );

  const hasTracking = order?.tracking_number?.trim();
  const carrierName = order?.carrier_name?.trim();

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>
          {lt("Shipment tracking", "Gönderi takibi", "Suivi d'expédition", "Seguimiento de envío", "Tracciamento spedizione", "Sendungsverfolgung")}
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {order?.tracking_number && (
            <button
              onClick={handleRefreshTracking}
              disabled={refreshing}
              style={{ fontSize: 11, fontWeight: 600, color: "#374151", padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", cursor: "pointer", opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing
                ? lt("Fetching…", "Alınıyor…", "Récupération…", "Obteniendo…", "Recupero…", "Wird abgerufen…")
                : lt("↻ Refresh", "↻ Yenile", "↻ Actualiser", "↻ Actualizar", "↻ Aggiorna", "↻ Aktualisieren")}
            </button>
          )}
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", textDecoration: "none", padding: "5px 12px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", display: "flex", alignItems: "center", gap: 5 }}
            >
              🔗 {lt("Track package", "Paketi takip et", "Suivre le colis", "Rastrear paquete", "Traccia pacco", "Paket verfolgen")}
            </a>
          )}
        </div>
      </div>
      {refreshMsg && (
        <div style={{ marginBottom: 10, padding: "6px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, fontSize: 12, color: "#15803d" }}>{refreshMsg}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, padding: "10px 14px", background: "#f9fafb", borderRadius: 8, fontSize: 13 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>
            {lt("Carrier", "Kargo firması", "Transporteur", "Transportista", "Corriere", "Versanddienstleister")}
          </div>
          <div style={{ fontWeight: 600 }}>{carrierName || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>
            {lt("Tracking number", "Takip numarası", "Numéro de suivi", "Número de seguimiento", "Numero di tracciamento", "Trackingnummer")}
          </div>
          <div style={{ fontWeight: 600, fontFamily: "monospace" }}>
            {hasTracking ? (
              trackingUrl
                ? <a href={trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>{order.tracking_number}</a>
                : order.tracking_number
            ) : "—"}
          </div>
        </div>
        {order?.shipped_at && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>
              {lt("Ship date", "Gönderim tarihi", "Date d'expédition", "Fecha de envío", "Data spedizione", "Versanddatum")}
            </div>
            <div>{fmtDateTime(order.shipped_at)}</div>
          </div>
        )}
        {order?.delivery_date && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>
              {lt("Delivery date", "Teslimat tarihi", "Date de livraison", "Fecha de entrega", "Data di consegna", "Lieferdatum")}
            </div>
            <div>{fmtDateTime(order.delivery_date)}</div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
          {lt("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Wird geladen…")}
        </div>
      ) : events.length === 0 ? (
        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
          {lt("No shipment events yet.", "Henüz gönderi olayı yok.", "Aucun événement d'expédition pour le moment.", "Aún no hay eventos de envío.", "Nessun evento di spedizione ancora.", "Noch keine Sendungsereignisse vorhanden.")}
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 24 }}>
          <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 2, background: "#e5e7eb", borderRadius: 2 }} />
          {events.map((ev, i) => {
            const m = statusMeta[ev.status] || statusMeta.manual;
            const isLast = i === events.length - 1;
            const localizedDesc = eventDescription(ev);
            return (
              <div key={ev.id} style={{ position: "relative", marginBottom: isLast ? 0 : 16 }}>
                <div style={{
                  position: "absolute", left: -24, top: 3,
                  width: 16, height: 16, borderRadius: "50%",
                  background: m.color, border: "2px solid #fff",
                  boxShadow: "0 0 0 2px " + m.color + "44",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8,
                }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                      <EventBadge status={ev.status} statusMeta={statusMeta} />
                      {ev.location && <span style={{ fontSize: 11, color: "#6b7280" }}>📍 {ev.location}</span>}
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDateTime(ev.event_time)}</span>
                      {ev.source === "auto" && <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>auto</span>}
                      {ev.source === "api" && <span style={{ fontSize: 10, color: "#0369a1", fontWeight: 600 }}>DHL API</span>}
                    </div>
                    {localizedDesc && (
                      <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{localizedDesc}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#b91c1c" }}>{error}</div>
      )}

      {showAddForm ? (
        <div style={{ marginTop: 16, padding: "14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            {lt("Add event", "Olay ekle", "Ajouter un événement", "Añadir evento", "Aggiungi evento", "Ereignis hinzufügen")}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>
                {lt("Status", "Durum", "Statut", "Estado", "Stato", "Status")}
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
              >
                {Object.entries(statusMeta).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>
                {lt("Description (optional)", "Açıklama (isteğe bağlı)", "Description (facultatif)", "Descripción (opcional)", "Descrizione (opzionale)", "Beschreibung (optional)")}
              </label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={lt("e.g. Loaded onto delivery vehicle", "örn. Teslimat aracına yüklendi", "ex. Chargé sur le véhicule de livraison", "p. ej. Cargado en vehículo de reparto", "es. Caricato sul veicolo di consegna", "z.B. Im Zustellfahrzeug geladen")}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>
                {lt("Location (optional)", "Konum (isteğe bağlı)", "Lieu (facultatif)", "Ubicación (opcional)", "Posizione (opzionale)", "Standort (optional)")}
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder={lt("e.g. Frankfurt am Main", "örn. Frankfurt am Main", "ex. Francfort-sur-le-Main", "p. ej. Fráncfort del Meno", "es. Francoforte sul Meno", "z.B. Frankfurt am Main")}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={handleAddEvent}
                disabled={saving}
                style={{ padding: "7px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving
                  ? lt("Saving…", "Kaydediliyor…", "Enregistrement…", "Guardando…", "Salvataggio…", "Speichern…")
                  : lt("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern")}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setError(""); }}
                style={{ padding: "7px 14px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
              >
                {lt("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => setShowAddForm(true)}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", cursor: "pointer" }}
          >
            + {lt("Add event", "Olay ekle", "Ajouter un événement", "Añadir evento", "Aggiungi evento", "Ereignis hinzufügen")}
          </button>
        </div>
      )}
    </div>
  );
}
