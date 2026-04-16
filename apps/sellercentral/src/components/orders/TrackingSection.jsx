"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const STATUS_META = {
  versendet: { label: "Versendet", color: "#1d4ed8", bg: "#eff6ff", icon: "🚚" },
  in_transit: { label: "Unterwegs", color: "#7c3aed", bg: "#f5f3ff", icon: "📦" },
  zugestellt: { label: "Zugestellt", color: "#15803d", bg: "#f0fdf4", icon: "✅" },
  exception: { label: "Ausnahme", color: "#b91c1c", bg: "#fef2f2", icon: "⚠️" },
  retour: { label: "Retour", color: "#c2410c", bg: "#fff7ed", icon: "↩️" },
  manual: { label: "Manuell", color: "#6b7280", bg: "#f9fafb", icon: "📝" },
};

function EventBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.manual;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: m.bg, color: m.color }}>
      {m.icon} {m.label}
    </span>
  );
}

function fmtDateTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TrackingSection({ orderId, order, onOrderStatusChanged }) {
  const [events, setEvents] = useState([]);
  const [trackingUrl, setTrackingUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingEvent, setAddingEvent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [deletingId, setDeletingId] = useState(null);
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
      setError(e?.message || "Fehler beim Laden");
    }
    setLoading(false);
  }, [orderId]);

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
      setError(e?.message || "Fehler beim Speichern");
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
      const msg = data?.inserted > 0
        ? `${data.inserted} neue${data.inserted === 1 ? "s" : ""} Ereignis${data.inserted === 1 ? "" : "se"} von DHL importiert`
        : (data?.message || "Keine neuen Ereignisse");
      setRefreshMsg(msg);
      if (data?.events) setEvents(data.events);
      if (data?.trackingUrl) setTrackingUrl(data.trackingUrl);
      if (onOrderStatusChanged) onOrderStatusChanged();
    } catch (e) {
      setError(e?.message || "Fehler beim Abrufen der Tracking-Daten");
    }
    setRefreshing(false);
  };

  const handleDelete = async (eventId) => {
    if (!confirm("Ereignis löschen?")) return;
    setDeletingId(eventId);
    try {
      const client = getMedusaAdminClient();
      await client.deleteShipmentEvent(eventId);
      setEvents(ev => ev.filter(e => e.id !== eventId));
    } catch (e) {
      setError(e?.message || "Fehler beim Löschen");
    }
    setDeletingId(null);
  };

  const hasTracking = order?.tracking_number?.trim();
  const carrierName = order?.carrier_name?.trim();

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Sendungsverfolgung</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {order?.tracking_number && (
            <button
              onClick={handleRefreshTracking}
              disabled={refreshing}
              style={{ fontSize: 11, fontWeight: 600, color: "#374151", padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#f9fafb", cursor: "pointer", opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? "Wird abgerufen…" : "↻ Aktualisieren"}
            </button>
          )}
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", textDecoration: "none", padding: "5px 12px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#eff6ff", display: "flex", alignItems: "center", gap: 5 }}
            >
              🔗 Paket verfolgen
            </a>
          )}
        </div>
      </div>
      {refreshMsg && (
        <div style={{ marginBottom: 10, padding: "6px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6, fontSize: 12, color: "#15803d" }}>{refreshMsg}</div>
      )}

      {/* Carrier + Tracking info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, padding: "10px 14px", background: "#f9fafb", borderRadius: 8, fontSize: 13 }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>Versanddienstleister</div>
          <div style={{ fontWeight: 600 }}>{carrierName || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>Trackingnummer</div>
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
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>Versanddatum</div>
            <div>{fmtDateTime(order.shipped_at)}</div>
          </div>
        )}
        {order?.delivery_date && (
          <div>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>Lieferdatum</div>
            <div>{fmtDateTime(order.delivery_date)}</div>
          </div>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0" }}>Wird geladen…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
          Noch keine Sendungsereignisse vorhanden.
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 24 }}>
          {/* Timeline line */}
          <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 2, background: "#e5e7eb", borderRadius: 2 }} />
          {events.map((ev, i) => {
            const m = STATUS_META[ev.status] || STATUS_META.manual;
            const isLast = i === events.length - 1;
            return (
              <div key={ev.id} style={{ position: "relative", marginBottom: isLast ? 0 : 16 }}>
                {/* Dot */}
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
                      <EventBadge status={ev.status} />
                      {ev.location && <span style={{ fontSize: 11, color: "#6b7280" }}>📍 {ev.location}</span>}
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDateTime(ev.event_time)}</span>
                      {ev.source === "auto" && <span style={{ fontSize: 10, color: "#9ca3af", fontStyle: "italic" }}>auto</span>}
                    </div>
                    {ev.description && (
                      <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{ev.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    disabled={deletingId === ev.id}
                    style={{ padding: "2px 7px", fontSize: 11, color: "#ef4444", border: "1px solid #fecaca", borderRadius: 5, background: "#fef2f2", cursor: "pointer", flexShrink: 0, opacity: deletingId === ev.id ? 0.5 : 1 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#b91c1c" }}>{error}</div>
      )}

      {/* Add event */}
      {showAddForm ? (
        <div style={{ marginTop: 16, padding: "14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ereignis hinzufügen</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
              >
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Beschreibung (optional)</label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="z.B. Im Zustellfahrzeug geladen"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 3 }}>Standort (optional)</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="z.B. Frankfurt am Main"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={handleAddEvent}
                disabled={saving}
                style={{ padding: "7px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Speichern…" : "Speichern"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setError(""); }}
                style={{ padding: "7px 14px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, cursor: "pointer" }}
              >
                Abbrechen
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
            + Ereignis hinzufügen
          </button>
        </div>
      )}
    </div>
  );
}
