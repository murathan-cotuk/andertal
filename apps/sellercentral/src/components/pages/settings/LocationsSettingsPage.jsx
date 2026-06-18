"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Text, BlockStack, InlineStack, Button, Box, TextField, Select,
  Spinner, Banner, Checkbox, Badge,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/components/confirm-delete";

const LOCATION_TYPES = [
  { label: "Lager / Fulfillment", value: "warehouse" },
  { label: "Filiale / Store", value: "store" },
  { label: "Büro", value: "office" },
  { label: "Sonstige", value: "other" },
];

const TYPE_LABELS = { warehouse: "Lager", store: "Filiale", office: "Büro", other: "Sonstige" };
const TYPE_COLORS = { warehouse: "#0070f3", store: "#10b981", office: "#f59e0b", other: "#6b7280" };

const EMPTY = {
  name: "", type: "warehouse", address_line1: "", address_line2: "",
  city: "", postal_code: "", country: "Deutschland", phone: "", email: "", is_primary: false,
};

function LocationModal({ location, onSave, onClose }) {
  const [form, setForm] = useState(location ? { ...EMPTY, ...location } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name erforderlich"); return; }
    setSaving(true); setError(null);
    try {
      if (location?.id) {
        await client.request(`/admin-hub/v1/seller/locations/${location.id}`, {
          method: "PATCH", body: JSON.stringify(form),
        });
      } else {
        await client.request("/admin-hub/v1/seller/locations", {
          method: "POST", body: JSON.stringify(form),
        });
      }
      onSave();
    } catch (e) {
      setError(e?.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        width: "min(560px, 95vw)", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{
          padding: "18px 22px 14px", borderBottom: "1px solid #e5e7eb",
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderRadius: "12px 12px 0 0",
        }}>
          <Text variant="headingMd" as="h2" tone="text-inverse">
            {location?.id ? "Standort bearbeiten" : "Standort hinzufügen"}
          </Text>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <BlockStack gap="300">
            {error && <Banner tone="critical"><p>{error}</p></Banner>}
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Name *" value={form.name} onChange={set("name")} placeholder="z. B. Hauptlager" autoComplete="off" />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select label="Typ" options={LOCATION_TYPES} value={form.type} onChange={set("type")} />
              </div>
            </InlineStack>
            <TextField label="Straße" value={form.address_line1} onChange={set("address_line1")} autoComplete="off" />
            <TextField label="Adresszusatz" value={form.address_line2} onChange={set("address_line2")} autoComplete="off" />
            <InlineStack gap="200" wrap={false}>
              <div style={{ minWidth: 100 }}>
                <TextField label="PLZ" value={form.postal_code} onChange={set("postal_code")} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Stadt" value={form.city} onChange={set("city")} autoComplete="off" />
              </div>
            </InlineStack>
            <TextField label="Land" value={form.country} onChange={set("country")} autoComplete="off" />
            <InlineStack gap="200" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField label="Telefon" value={form.phone} onChange={set("phone")} autoComplete="off" type="tel" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="E-Mail" value={form.email} onChange={set("email")} autoComplete="off" type="email" />
              </div>
            </InlineStack>
            <Checkbox label="Als Primärstandort setzen" checked={!!form.is_primary} onChange={set("is_primary")} />
          </BlockStack>
        </div>
        <div style={{ padding: "14px 22px 18px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {location?.id ? "Speichern" : "Hinzufügen"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LocationCard({ loc, onEdit, onDelete, onSetPrimary }) {
  const typeColor = TYPE_COLORS[loc.type] || "#6b7280";
  const typeLabel = TYPE_LABELS[loc.type] || loc.type;
  const addressLines = [loc.address_line1, loc.address_line2, [loc.postal_code, loc.city].filter(Boolean).join(" "), loc.country].filter(Boolean);

  return (
    <div style={{
      border: loc.is_primary ? "2px solid #008060" : "1px solid #e5e7eb",
      borderRadius: 10,
      padding: "16px 18px",
      background: loc.is_primary ? "#f0faf6" : "#fff",
      position: "relative",
    }}>
      <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
        <BlockStack gap="100">
          <InlineStack gap="100" blockAlign="center">
            <Text variant="headingSm" as="h3" fontWeight="bold">{loc.name}</Text>
            <span style={{
              display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: `${typeColor}18`, color: typeColor,
            }}>{typeLabel}</span>
            {loc.is_primary && (
              <span style={{
                display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                background: "#d1fae5", color: "#065f46",
              }}>Primär</span>
            )}
            {!loc.is_active && (
              <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#f3f4f6", color: "#9ca3af" }}>Inaktiv</span>
            )}
          </InlineStack>
          {addressLines.length > 0 && (
            <BlockStack gap="0">
              {addressLines.map((l, i) => (
                <Text key={i} as="p" tone="subdued" variant="bodySm">{l}</Text>
              ))}
            </BlockStack>
          )}
          {(loc.phone || loc.email) && (
            <InlineStack gap="200">
              {loc.phone && <Text as="span" tone="subdued" variant="bodySm">{loc.phone}</Text>}
              {loc.email && <Text as="span" tone="subdued" variant="bodySm">{loc.email}</Text>}
            </InlineStack>
          )}
        </BlockStack>
        <InlineStack gap="100" blockAlign="start">
          {!loc.is_primary && (
            <Button size="slim" onClick={() => onSetPrimary(loc)}>Primär setzen</Button>
          )}
          <Button size="slim" onClick={() => onEdit(loc)}>Bearbeiten</Button>
          <Button size="slim" tone="critical" onClick={() => onDelete(loc)}>Löschen</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

export default function LocationsSettingsPage() {
  const client = getMedusaAdminClient();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // null | "add" | { ...locationObj }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.request("/admin-hub/v1/seller/locations");
      setLocations(res?.locations || []);
    } catch (e) {
      setError(e?.message || "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (loc) => {
    if (!await confirmDelete(`Standort "${loc.name}" löschen?`)) return;
    try {
      await client.request(`/admin-hub/v1/seller/locations/${loc.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      alert("Fehler: " + (e?.message || "Unbekannt"));
    }
  };

  const handleSetPrimary = async (loc) => {
    try {
      await client.request(`/admin-hub/v1/seller/locations/${loc.id}`, {
        method: "PATCH", body: JSON.stringify({ is_primary: true }),
      });
      load();
    } catch (e) {
      alert("Fehler: " + (e?.message || "Unbekannt"));
    }
  };

  return (
    <BlockStack gap="400">
      <Card padding="400">
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">Standorte</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Verwalten Sie Ihre Lager-, Filial- und Bürostandorte.
              </Text>
            </BlockStack>
            <Button variant="primary" onClick={() => setModal("add")}>
              + Standort hinzufügen
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {error && (
        <Banner tone="critical" onDismiss={() => setError(null)}><p>{error}</p></Banner>
      )}

      {loading ? (
        <Card padding="400">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="p" tone="subdued">Laden…</Text>
          </InlineStack>
        </Card>
      ) : locations.length === 0 ? (
        <Card padding="600">
          <BlockStack gap="200" inlineAlign="center">
            <div style={{ fontSize: 40, textAlign: "center" }}>📍</div>
            <Text as="p" tone="subdued" alignment="center">
              Noch keine Standorte hinterlegt.
            </Text>
            <Button variant="primary" onClick={() => setModal("add")}>
              Ersten Standort hinzufügen
            </Button>
          </BlockStack>
        </Card>
      ) : (
        <BlockStack gap="200">
          {locations.map((loc) => (
            <LocationCard
              key={loc.id}
              loc={loc}
              onEdit={(l) => setModal(l)}
              onDelete={handleDelete}
              onSetPrimary={handleSetPrimary}
            />
          ))}
        </BlockStack>
      )}

      {modal && (
        <LocationModal
          location={modal === "add" ? null : modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </BlockStack>
  );
}
