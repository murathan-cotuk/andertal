"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Page,
  Card,
  Button,
  Modal,
  TextField,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Banner,
  Spinner,
  Select,
} from "@shopify/polaris";
import { EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import FlowEmailBodyEditor, { htmlToPlainText } from "@/components/content/FlowEmailBodyEditor";
import {
  MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS,
} from "@/lib/message-template-placeholders";

export default function MessageTemplatesPage() {
  const client = getMedusaAdminClient();
  const editorRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState(null);
  const [placeholderPick, setPlaceholderPick] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await client.getMessageTemplates();
      setTemplates(data?.templates || []);
    } catch (e) {
      setError(e?.message || "Vorlagen konnten nicht geladen werden");
      setTemplates([]);
    }
    setLoading(false);
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormBody("");
    setPlaceholderPick("");
    setEditorKey((k) => k + 1);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setFormName(t.name || "");
    setFormBody(t.body || "");
    setPlaceholderPick("");
    setEditorKey((k) => k + 1);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setPlaceholderPick("");
  };

  const handleSave = async () => {
    const bodyHtml = editorRef.current?.flushEmailBody?.() ?? formBody;
    const name = formName.trim();
    const body = String(bodyHtml || "").trim();
    if (!name || !body) {
      setError("Name und Text sind erforderlich");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingId) {
        await client.updateMessageTemplate(editingId, { name, body });
      } else {
        await client.createMessageTemplate({ name, body });
      }
      await load();
      closeModal();
    } catch (e) {
      setError(e?.message || "Speichern fehlgeschlagen");
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setBusyDeleteId(id);
    setError("");
    try {
      await client.deleteMessageTemplate(id);
      setConfirmDeleteId(null);
      await load();
    } catch (e) {
      setError(e?.message || "Löschen fehlgeschlagen");
    }
    setBusyDeleteId(null);
  };

  const previewPlain = (html) => {
    const s = htmlToPlainText(html || "");
    return s.length > 160 ? `${s.slice(0, 157)}…` : s || "—";
  };

  return (
    <Page
      title="Nachrichtenvorlagen"
      subtitle="Text-, HTML- und Platzhalter wie {customer_name} für Antworten und E-Mails."
      primaryAction={{ content: "Vorlage hinzufügen", onAction: openCreate }}
      secondaryActions={[{ content: "Zum Posteingang", url: "/inbox" }]}
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" onDismiss={() => setError("")}>
            {error}
          </Banner>
        )}

        <Card padding="0">
          {loading ? (
            <Box padding="600">
              <InlineStack align="center" blockAlign="center">
                <Spinner size="small" />
              </InlineStack>
            </Box>
          ) : templates.length === 0 ? (
            <Box padding="600">
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Noch keine Vorlagen. „Vorlage hinzufügen“ legt die erste an.
              </Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {templates.map((t) => (
                <Box
                  key={t.id}
                  padding="400"
                  borderBlockEndWidth="025"
                  borderColor="border"
                >
                  <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {t.name}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {previewPlain(t.body)}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="100" blockAlign="center">
                      <Button
                        icon={EditIcon}
                        variant="plain"
                        tone="subdued"
                        accessibilityLabel="Bearbeiten"
                        onClick={() => openEdit(t)}
                      />
                      <Button
                        icon={DeleteIcon}
                        variant="plain"
                        tone="critical"
                        accessibilityLabel="Löschen"
                        loading={busyDeleteId === t.id}
                        onClick={() => setConfirmDeleteId(t.id)}
                      />
                    </InlineStack>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Vorlage bearbeiten" : "Neue Vorlage"}
        primaryAction={{
          content: editingId ? "Speichern" : "Anlegen",
          onAction: handleSave,
          loading: saving,
        }}
        secondaryActions={[{ content: "Abbrechen", onAction: closeModal, disabled: saving }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Name"
              value={formName}
              onChange={setFormName}
              autoComplete="off"
              placeholder="z. B. Versandbestätigung"
            />
            <BlockStack gap="200">
              <Select
                label="Platzhalter einfügen"
                options={MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS}
                value={placeholderPick}
                onChange={(v) => {
                  setPlaceholderPick("");
                  if (!v) return;
                  setFormBody((prev) => `${prev || ""}${prev && !/\s$/.test(prev) ? " " : ""}${v}`);
                }}
              />
            </BlockStack>
            <FlowEmailBodyEditor
              ref={editorRef}
              key={editingId != null ? `e-${editingId}` : "new"}
              label="Inhalt"
              value={formBody}
              onChange={setFormBody}
              minHeight="220px"
              placeholder="Nachricht oder HTML…"
              modes={{ visual: "Visuell", html: "HTML", text: "Text" }}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={confirmDeleteId != null}
        onClose={() => !busyDeleteId && setConfirmDeleteId(null)}
        title="Vorlage löschen?"
        primaryAction={{
          content: "Löschen",
          tone: "critical",
          loading: busyDeleteId === confirmDeleteId,
          onAction: () => confirmDeleteId && handleDelete(confirmDeleteId),
        }}
        secondaryActions={[
          {
            content: "Abbrechen",
            onAction: () => setConfirmDeleteId(null),
            disabled: !!busyDeleteId,
          },
        ]}
      >
        <Modal.Section>
          <Text as="p" variant="bodySm">
            Diese Vorlage wird unwiderruflich entfernt.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
