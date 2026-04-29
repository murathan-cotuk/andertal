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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function maskKey(val) {
  const s = String(val || "");
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.min(20, s.length - 8))}${s.slice(-4)}`;
}

function IntegrationCard({ integration, onEdit, onToggle, onDelete, onRotateSecret }) {
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
              <span style={{ fontWeight: 600, color: "#374151" }}>Zugangs-ID</span>
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {maskKey(integration.api_key)}
              </span>
            </>
          )}
          <span style={{ fontWeight: 600, color: "#374151" }}>Sicherheitsschlüssel</span>
          <span style={{ color: "#9ca3af" }}>
            Gespeichert — bei Bedarf neu erzeugen (Bearbeiten)
          </span>
        </div>

        <InlineStack gap="200" blockAlign="center" style={{ marginTop: 10 }}>
          <Button size="slim" onClick={() => onEdit(integration)}>
            Bearbeiten
          </Button>
          <Button size="slim" onClick={() => onToggle(integration)}>
            {integration.is_active ? "Deaktivieren" : "Aktivieren"}
          </Button>
          <Button size="slim" onClick={() => onRotateSecret(integration)}>
            Neuer Sicherheitsschlüssel
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
  const [formName, setFormName] = useState("");
  const [createdCreds, setCreatedCreds] = useState(null);

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

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setCreatedCreds(null);
    setModalOpen(true);
  };

  const openEdit = (integration) => {
    setEditingId(integration.id);
    setFormName(integration.name || "");
    setCreatedCreds(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormName("");
    setCreatedCreds(null);
  };

  const save = async () => {
    if (!formName.trim()) {
      setMsg({ tone: "warning", text: "Bitte einen Namen eingeben." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (editingId) {
        await client.updateIntegration(editingId, {
          name: formName.trim(),
          is_active: true,
        });
        setMsg({ tone: "success", text: "Integration aktualisiert." });
        closeModal();
        await load();
      } else {
        const data = await client.saveIntegration({
          name: formName.trim(),
          category: "custom",
          is_active: true,
        });
        const integ = data?.integration;
        if (integ?.api_key && integ?.api_secret) {
          setCreatedCreds({
            name: integ.name,
            zugang: integ.api_key,
            secret: integ.api_secret,
          });
        }
        setMsg({ tone: "success", text: "Zugangsdaten wurden erzeugt." });
        await load();
      }
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
  };

  const rotateSecret = async (integration) => {
    if (!confirm("Neuen Sicherheitsschlüssel erzeugen? Der alte Wert verliert sofort die Gültigkeit.")) return;
    try {
      const data = await client.updateIntegration(integration.id, { regenerate_secret: true });
      const sec = data?.integration?.api_secret;
      if (sec) {
        setCreatedCreds({
          name: integration.name,
          zugang: data.integration?.api_key || integration.api_key,
          secret: sec,
        });
        setModalOpen(true);
        setEditingId(null);
        setFormName("");
      }
      setMsg({ tone: "success", text: "Neuer Sicherheitsschlüssel gespeichert. Bitte kopieren." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Konnte nicht erneuern." });
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
    if (!confirm(`„${integration.name}“ wirklich löschen?`)) return;
    try {
      await client.deleteIntegration(integration.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
      setMsg({ tone: "success", text: "Integration gelöscht." });
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." });
    }
  };

  const copy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
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

        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodySm" tone="subdued">
              Lege eine Integration mit <strong>freiem Namen</strong> an. Andertal erzeugt automatisch eine{" "}
              <strong>Zugangs-ID</strong> und einen <strong>Sicherheitsschlüssel</strong> — keine vorgefertigte App-Liste.
            </Text>
          </BlockStack>
        </Card>

        {loading ? (
          <Card>
            <div style={{ padding: 40, textAlign: "center", color: "#6d7175", fontSize: 13 }}>
              Laden…
            </div>
          </Card>
        ) : integrations.length === 0 ? (
          <Card>
            <EmptyState heading="Noch keine Integrationen">
              <p>
                Eine Integration anlegen: nur den Namen eingeben — Zugangs-ID und Sicherheitsschlüssel werden für dich
                generiert.
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
                        onRotateSecret={rotateSecret}
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
                        onRotateSecret={rotateSecret}
                      />
                    ))}
                  </div>
                </BlockStack>
              </Card>
            )}
          </>
        )}
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={
          createdCreds
            ? "Zugangsdaten"
            : editingId
              ? "Integration bearbeiten"
              : "Integration anlegen"
        }
        primaryAction={
          createdCreds
            ? { content: "Schließen", onAction: closeModal }
            : { content: "Speichern", onAction: save, loading: saving }
        }
        secondaryActions={
          createdCreds ? [] : [{ content: "Abbrechen", onAction: closeModal }]
        }
      >
        <Modal.Section>
          {createdCreds ? (
            <BlockStack gap="400">
              <Banner tone="warning">
                Einmalig anzeigen: notiere den Sicherheitsschlüssel sicher. Bei Verlust kannst du einen neuen erzeugen
                (Liste → Neuer Sicherheitsschlüssel).
              </Banner>
              <Text as="p" variant="bodyMd">
                <strong>{createdCreds.name}</strong>
              </Text>
              <TextField
                label="Zugangs-ID"
                value={createdCreds.zugang}
                readOnly
                autoComplete="off"
                multiline={2}
              />
              <Button onClick={() => copy(createdCreds.zugang)}>Zugangs-ID kopieren</Button>
              <TextField
                label="Sicherheitsschlüssel"
                value={createdCreds.secret}
                readOnly
                autoComplete="off"
                multiline={3}
              />
              <Button onClick={() => copy(createdCreds.secret)}>Sicherheitsschlüssel kopieren</Button>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <TextField
                label="Name"
                value={formName}
                onChange={setFormName}
                autoComplete="off"
                placeholder="z. B. Warenwirtschaft XY, Eigenes Tool…"
                helpText="Andertal erzeugt Zugangs-ID und Sicherheitsschlüssel automatisch nach dem Speichern."
              />
              {editingId && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Der Name kann geändert werden. Zugangs-ID bleibt gleich; einen neuen Sicherheitsschlüssel erzeugst du in
                  der Liste über „Neuer Sicherheitsschlüssel“.
                </Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
