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
import { useLocale } from "next-intl";
import { useLt } from "@/lib/locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import FlowEmailBodyEditor, { htmlToPlainText } from "@/components/content/FlowEmailBodyEditor";
import {
  MESSAGE_TEMPLATE_PLACEHOLDER_OPTIONS,
} from "@/lib/message-template-placeholders";

export default function MessageTemplatesPage() {
  const locale = useLocale();
  const lt = useLt();
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await client.getMessageTemplates();
      setTemplates(data?.templates || []);
    } catch (e) {
      setError(e?.message || lt("Templates could not be loaded", "Şablonlar yüklenemedi", "Impossible de charger les modèles", "No se pudieron cargar las plantillas", "Impossibile caricare i modelli", "Vorlagen konnten nicht geladen werden"));
      setTemplates([]);
    }
    setLoading(false);
  }, [client, lt]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormBody("");
    setPlaceholderPick("");
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setFormName(t.name || "");
    setFormBody(t.body || "");
    setPlaceholderPick("");
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
      setError(lt("Name and body are required", "Ad ve metin gereklidir", "Le nom et le texte sont requis", "El nombre y el texto son obligatorios", "Nome e testo sono obbligatori", "Name und Text sind erforderlich"));
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
      setError(e?.message || lt("Save failed", "Kaydetme başarısız", "Échec de l'enregistrement", "Error al guardar", "Salvataggio non riuscito", "Speichern fehlgeschlagen"));
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
      setError(e?.message || lt("Delete failed", "Silme başarısız", "Échec de la suppression", "Error al eliminar", "Eliminazione non riuscita", "Löschen fehlgeschlagen"));
    }
    setBusyDeleteId(null);
  };

  const previewPlain = (html) => {
    const s = htmlToPlainText(html || "");
    return s.length > 160 ? `${s.slice(0, 157)}…` : s || "—";
  };

  return (
    <Page
      title={lt("Message templates", "Mesaj şablonları", "Modèles de message", "Plantillas de mensaje", "Modelli di messaggio", "Nachrichtenvorlagen")}
      subtitle={lt(
        "Text, HTML and placeholders like {customer_name} for replies and emails.",
        "Yanıtlar ve e-postalar için {customer_name} gibi metin, HTML ve yer tutucular.",
        "Texte, HTML et variables comme {customer_name} pour les réponses et e-mails.",
        "Texto, HTML y variables como {customer_name} para respuestas y correos.",
        "Testo, HTML e segnaposto come {customer_name} per risposte ed e-mail.",
        "Text-, HTML- und Platzhalter wie {customer_name} für Antworten und E-Mails.",
      )}
      primaryAction={{ content: lt("Add template", "Şablon ekle", "Ajouter un modèle", "Añadir plantilla", "Aggiungi modello", "Vorlage hinzufügen"), onAction: openCreate }}
      secondaryActions={[{ content: lt("Go to inbox", "Gelen kutusuna git", "Aller à la boîte de réception", "Ir a la bandeja de entrada", "Vai alla posta in arrivo", "Zum Posteingang"), url: `/${locale}/inbox` }]}
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
                {lt(
                  "No templates yet. Use “Add template” to create the first one.",
                  "Henüz şablon yok. İlk şablonu oluşturmak için “Şablon ekle”yi kullanın.",
                  "Aucun modèle. Utilisez « Ajouter un modèle » pour en créer un.",
                  "Sin plantillas. Use « Añadir plantilla » para crear la primera.",
                  "Nessun modello. Usa « Aggiungi modello » per crearne uno.",
                  "Noch keine Vorlagen. „Vorlage hinzufügen“ legt die erste an.",
                )}
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
                        accessibilityLabel={lt("Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten")}
                        onClick={() => openEdit(t)}
                      />
                      <Button
                        icon={DeleteIcon}
                        variant="plain"
                        tone="critical"
                        accessibilityLabel={lt("Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen")}
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
        title={editingId ? lt("Edit template", "Şablonu düzenle", "Modifier le modèle", "Editar plantilla", "Modifica modello", "Vorlage bearbeiten") : lt("New template", "Yeni şablon", "Nouveau modèle", "Nueva plantilla", "Nuovo modello", "Neue Vorlage")}
        primaryAction={{
          content: editingId ? lt("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern") : lt("Create", "Oluştur", "Créer", "Crear", "Crea", "Anlegen"),
          onAction: handleSave,
          loading: saving,
        }}
        secondaryActions={[{ content: lt("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"), onAction: closeModal, disabled: saving }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label={lt("Name", "Ad", "Nom", "Nombre", "Nome", "Name")}
              value={formName}
              onChange={setFormName}
              autoComplete="off"
              placeholder={lt("e.g. Shipping confirmation", "örn. Kargo onayı", "p. ex. Confirmation d'expédition", "p. ej. Confirmación de envío", "es. Conferma spedizione", "z. B. Versandbestätigung")}
            />
            <BlockStack gap="200">
              <Select
                label={lt("Insert placeholder", "Yer tutucu ekle", "Insérer une variable", "Insertar variable", "Inserisci segnaposto", "Platzhalter einfügen")}
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
              label={lt("Content", "İçerik", "Contenu", "Contenido", "Contenuto", "Inhalt")}
              value={formBody}
              onChange={setFormBody}
              minHeight="220px"
              placeholder={lt("Message or HTML…", "Mesaj veya HTML…", "Message ou HTML…", "Mensaje o HTML…", "Messaggio o HTML…", "Nachricht oder HTML…")}
              modes={{
                visual: lt("Visual", "Görsel", "Visuel", "Visual", "Visuale", "Visuell"),
                html: "HTML",
                text: lt("Text", "Metin", "Texte", "Texto", "Testo", "Text"),
              }}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={confirmDeleteId != null}
        onClose={() => !busyDeleteId && setConfirmDeleteId(null)}
        title={lt("Delete template?", "Şablon silinsin mi?", "Supprimer le modèle ?", "¿Eliminar plantilla?", "Eliminare il modello?", "Vorlage löschen?")}
        primaryAction={{
          content: lt("Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen"),
          tone: "critical",
          loading: busyDeleteId === confirmDeleteId,
          onAction: () => confirmDeleteId && handleDelete(confirmDeleteId),
        }}
        secondaryActions={[
          {
            content: lt("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
            onAction: () => setConfirmDeleteId(null),
            disabled: !!busyDeleteId,
          },
        ]}
      >
        <Modal.Section>
          <Text as="p" variant="bodySm">
            {lt(
              "This template will be permanently removed.",
              "Bu şablon kalıcı olarak silinecek.",
              "Ce modèle sera définitivement supprimé.",
              "Esta plantilla se eliminará permanentemente.",
              "Questo modello verrà rimosso definitivamente.",
              "Diese Vorlage wird unwiderruflich entfernt.",
            )}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
