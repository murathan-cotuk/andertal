"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Badge,
  Modal,
  EmptyState,
  Spinner,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const EMPTY_FORM = {
  name: "",
  description: "",
  api_key: "",
  api_secret: "",
  webhook_url: "",
  config_json: "",
};

function IntegrationCard({ integration, onEdit, onToggle, onDelete }) {
  const initials = (integration.name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${integration.is_active ? "#d1fae5" : "#e5e7eb"}`,
        borderRadius: 10,
        padding: "16px 18px",
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: integration.is_active ? "#ecfdf5" : "#f3f4f6",
          border: `1px solid ${integration.is_active ? "#a7f3d0" : "#e5e7eb"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: integration.logo_url?.length <= 2 ? 22 : 13,
          fontWeight: 700,
          color: integration.is_active ? "#065f46" : "#6b7280",
          flexShrink: 0,
        }}
      >
        {integration.logo_url || initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="050">
            <Text as="span" fontWeight="semibold" variant="bodyMd">
              {integration.name}
            </Text>
            {integration.description && (
              <Text as="p" tone="subdued" variant="bodySm">
                {integration.description}
              </Text>
            )}
          </BlockStack>
          <Badge tone={integration.is_active ? "success" : "new"}>
            {integration.is_active ? "Aktiv" : "Inaktiv"}
          </Badge>
        </InlineStack>

        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "#f9fafb",
            borderRadius: 6,
            fontSize: 12,
            color: "#6b7280",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "4px 12px",
          }}
        >
          {integration.api_key && (
            <>
              <span style={{ fontWeight: 600, color: "#374151" }}>API Key</span>
              <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {integration.api_key.slice(0, 4)}{"•".repeat(Math.min(16, Math.max(4, integration.api_key.length - 4)))}
              </span>
            </>
          )}
          {integration.webhook_url && (
            <>
              <span style={{ fontWeight: 600, color: "#374151" }}>Webhook</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {integration.webhook_url}
              </span>
            </>
          )}
          {integration.slug && integration.slug !== integration.name?.toLowerCase().replace(/\s+/g, "-") && (
            <>
              <span style={{ fontWeight: 600, color: "#374151" }}>Slug</span>
              <span style={{ fontFamily: "monospace" }}>{integration.slug}</span>
            </>
          )}
        </div>

        <InlineStack gap="200" blockAlign="center" style={{ marginTop: 10 }}>
          <Button size="slim" onClick={() => onEdit(integration)}>
            Bearbeiten
          </Button>
          <Button size="slim" onClick={() => onToggle(integration)}>
            {integration.is_active ? "Deaktivieren" : "Aktivieren"}
          </Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(integration)}>
            Löschen
          </Button>
        </InlineStack>
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [jsonErr, setJsonErr] = useState("");

  const client = getMedusaAdminClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getIntegrations();
      setIntegrations(data.integrations || []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Integrationen konnten nicht geladen werden." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setJsonErr("");
    setModalOpen(true);
  };

  const openEdit = (integration) => {
    setEditingId(integration.id);
    setForm({
      name: integration.name || "",
      description: integration.description || "",
      api_key: "",
      api_secret: "",
      webhook_url: integration.webhook_url || "",
      config_json: integration.config ? JSON.stringify(integration.config, null, 2) : "",
    });
    setJsonErr("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setJsonErr("");
  };

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: "Bitte einen Namen eingeben." });
      return;
    }

    let parsedConfig = undefined;
    if (form.config_json.trim()) {
      try {
        parsedConfig = JSON.parse(form.config_json);
        setJsonErr("");
      } catch {
        setJsonErr("Ungültiges JSON-Format.");
        return;
      }
    }

    setSaving(true);
    setMsg(null);
    try {
      const slug = form.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (editingId) {
        await client.updateIntegration(editingId, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          ...(form.api_key ? { api_key: form.api_key } : {}),
          ...(form.api_secret ? { api_secret: form.api_secret } : {}),
          webhook_url: form.webhook_url.trim() || undefined,
          ...(parsedConfig !== undefined ? { config: parsedConfig } : {}),
          is_active: true,
        });
      } else {
        await client.saveIntegration({
          name: form.name.trim(),
          slug,
          description: form.description.trim() || undefined,
          category: "custom",
          api_key: form.api_key || undefined,
          api_secret: form.api_secret || undefined,
          webhook_url: form.webhook_url.trim() || undefined,
          config: parsedConfig,
          is_active: true,
        });
      }
      setMsg({ tone: "success", text: editingId ? "Integration aktualisiert." : "Integration hinzugefügt." });
      closeModal();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (integration) => {
    try {
      await client.updateIntegration(integration.id, { is_active: !integration.is_active });
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integration.id ? { ...i, is_active: !i.is_active } : i))
      );
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Status konnte nicht geändert werden." });
    }
  };

  const remove = async (integration) => {
    if (!confirm(`"${integration.name}" wirklich löschen?`)) return;
    try {
      await client.deleteIntegration(integration.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
      setMsg({ tone: "success", text: "Integration gelöscht." });
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." });
    }
  };

  const active = integrations.filter((i) => i.is_active);
  const inactive = integrations.filter((i) => !i.is_active);

  return (
    <Page
      title="Apps & Integrationen"
      primaryAction={{ content: "Integration anlegen", onAction: openCreate }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {loading ? (
          <Card>
            <div style={{ padding: 40, textAlign: "center" }}>
              <Spinner size="small" />
            </div>
          </Card>
        ) : integrations.length === 0 ? (
          <Card>
            <EmptyState heading="Noch keine Integrationen" image="">
              <p>
                Klicke auf „Integration anlegen" um externe Dienste, APIs oder Tools
                mit deinem Shop zu verbinden.
              </p>
              <Button variant="primary" onClick={openCreate}>
                Integration anlegen
              </Button>
            </EmptyState>
          </Card>
        ) : (
          <>
            {active.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Aktiv ({active.length})
                    </Text>
                    <Button size="slim" onClick={load} loading={loading}>
                      Aktualisieren
                    </Button>
                  </InlineStack>
                  <div style={{ display: "grid", gap: 10 }}>
                    {active.map((i) => (
                      <IntegrationCard
                        key={i.id}
                        integration={i}
                        onEdit={openEdit}
                        onToggle={toggleActive}
                        onDelete={remove}
                      />
                    ))}
                  </div>
                </BlockStack>
              </Card>
            )}

            {inactive.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Inaktiv ({inactive.length})
                  </Text>
                  <div style={{ display: "grid", gap: 10 }}>
                    {inactive.map((i) => (
                      <IntegrationCard
                        key={i.id}
                        integration={i}
                        onEdit={openEdit}
                        onToggle={toggleActive}
                        onDelete={remove}
                      />
                    ))}
                  </div>
                </BlockStack>
              </Card>
            )}
          </>
        )}
      </BlockStack>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Integration bearbeiten" : "Integration anlegen"}
        primaryAction={{ content: "Speichern", onAction: save, loading: saving }}
        secondaryActions={[{ content: "Abbrechen", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Name *"
              value={form.name}
              onChange={(v) => setField("name", v)}
              autoComplete="off"
              placeholder="z. B. Billbee, Shopify, Eigene API…"
              helpText="Anhand des Namens wird die Integration in der Liste angezeigt."
            />
            <TextField
              label="Beschreibung"
              value={form.description}
              onChange={(v) => setField("description", v)}
              autoComplete="off"
              placeholder="Wofür wird diese Integration verwendet?"
              multiline={2}
            />
          </BlockStack>
        </Modal.Section>

        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">
              Zugangsdaten
            </Text>
            {editingId && (
              <Banner tone="info">
                Felder leer lassen um bestehende Zugangsdaten zu behalten.
              </Banner>
            )}
            <TextField
              label="API Key / Token"
              value={form.api_key}
              onChange={(v) => setField("api_key", v)}
              type="password"
              autoComplete="off"
              placeholder={editingId ? "Zum Ändern neu eingeben…" : "API Key eingeben…"}
            />
            <TextField
              label="API Secret / Passwort"
              value={form.api_secret}
              onChange={(v) => setField("api_secret", v)}
              type="password"
              autoComplete="off"
              placeholder={editingId ? "Zum Ändern neu eingeben…" : "API Secret eingeben…"}
            />
            <TextField
              label="Webhook-URL"
              value={form.webhook_url}
              onChange={(v) => setField("webhook_url", v)}
              autoComplete="off"
              placeholder="https://…"
            />
          </BlockStack>
        </Modal.Section>

        <Modal.Section>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Weitere Konfiguration (JSON, optional)
            </Text>
            <Text as="p" tone="subdued" variant="bodySm">
              Beliebige Zusatzfelder als JSON-Objekt. Beispiel: {"{"}"host": "https://api.example.com", "timeout": 5000{"}"}
            </Text>
            <TextField
              label=""
              labelHidden
              value={form.config_json}
              onChange={(v) => { setField("config_json", v); setJsonErr(""); }}
              multiline={4}
              autoComplete="off"
              placeholder={`{\n  "key": "value"\n}`}
              error={jsonErr || undefined}
              monospaced
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
