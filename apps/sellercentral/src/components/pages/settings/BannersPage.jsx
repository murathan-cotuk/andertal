"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Badge,
  TextField,
  Modal,
  Checkbox,
  DataTable,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  button_text: "",
  is_active: true,
  position: 0,
};

export default function BannersPage() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const d = await getMedusaAdminClient().getBanners();
      setBanners(d?.banners || []);
    } catch (e) {
      setErr(e?.message || "Laden fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr("");
    setModalOpen(true);
  };

  const openEdit = (banner) => {
    setEditing(banner);
    setForm({
      title: banner.title || "",
      subtitle: banner.subtitle || "",
      image_url: banner.image_url || "",
      link_url: banner.link_url || "",
      button_text: banner.button_text || "",
      is_active: banner.is_active !== false,
      position: banner.position ?? 0,
    });
    setFormErr("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setFormErr("Titel ist erforderlich."); return; }
    setSaving(true);
    setFormErr("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        image_url: form.image_url.trim() || null,
        link_url: form.link_url.trim() || null,
        button_text: form.button_text.trim() || null,
        position: Number(form.position) || 0,
      };
      if (editing) {
        await getMedusaAdminClient().updateBanner(editing.id, payload);
      } else {
        await getMedusaAdminClient().createBanner(payload);
      }
      setOk(editing ? "Banner aktualisiert." : "Banner erstellt.");
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(e?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getMedusaAdminClient().deleteBanner(deleteTarget.id);
      setOk(`Banner „${deleteTarget.title}" gelöscht.`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setErr(e?.message || "Löschen fehlgeschlagen.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (banner) => {
    try {
      await getMedusaAdminClient().updateBanner(banner.id, { ...banner, is_active: !banner.is_active });
      await load();
    } catch (e) {
      setErr(e?.message || "Fehler beim Aktualisieren.");
    }
  };

  const rows = banners.map((b) => [
    <InlineStack gap="200" blockAlign="center" key={b.id}>
      {b.image_url ? (
        <img src={b.image_url} alt={b.title} style={{ width: 48, height: 30, objectFit: "cover", borderRadius: 4, border: "1px solid #e5e7eb" }} />
      ) : (
        <div style={{ width: 48, height: 30, background: "#f3f4f6", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Text variant="bodySm" tone="subdued">–</Text>
        </div>
      )}
      <BlockStack gap="0">
        <Text variant="bodyMd" fontWeight="semibold">{b.title}</Text>
        {b.subtitle && <Text variant="bodySm" tone="subdued">{b.subtitle}</Text>}
      </BlockStack>
    </InlineStack>,
    b.link_url ? (
      <Text variant="bodySm" tone="subdued" key="link">
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{b.link_url.slice(0, 40)}{b.link_url.length > 40 ? "…" : ""}</span>
      </Text>
    ) : <Text variant="bodySm" tone="subdued" key="nolink">–</Text>,
    <Text variant="bodySm" key="pos">{b.position}</Text>,
    <Badge key="active" tone={b.is_active ? "success" : "attention"}>
      {b.is_active ? "Aktiv" : "Inaktiv"}
    </Badge>,
    <InlineStack gap="200" key="actions">
      <Button size="slim" onClick={() => toggleActive(b)}>
        {b.is_active ? "Deaktivieren" : "Aktivieren"}
      </Button>
      <Button size="slim" onClick={() => openEdit(b)}>Bearbeiten</Button>
      <Button size="slim" tone="critical" onClick={() => setDeleteTarget(b)}>Löschen</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Banner-Verwaltung"
      primaryAction={{ content: "Banner erstellen", onAction: openCreate }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Erstellen und verwalten Sie Werbebanner für den Shop-Header und die Startseite.
            </Text>

            {err && (
              <Banner tone="critical" onDismiss={() => setErr("")}>
                <Text as="p">{err}</Text>
              </Banner>
            )}
            {ok && (
              <Banner tone="success" onDismiss={() => setOk("")}>
                <Text as="p">{ok}</Text>
              </Banner>
            )}

            <Card padding="0">
              {loading ? (
                <Box padding="400">
                  <Text tone="subdued">Laden…</Text>
                </Box>
              ) : banners.length === 0 ? (
                <EmptyState
                  heading="Noch keine Banner"
                  action={{ content: "Banner erstellen", onAction: openCreate }}
                  image=""
                >
                  <Text as="p">Erstellen Sie Ihren ersten Werbebanner für den Shop.</Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={["Banner", "Link", "Position", "Status", "Aktionen"]}
                  rows={rows}
                />
              )}
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Banner bearbeiten" : "Neuer Banner"}
        primaryAction={{ content: saving ? "Speichern…" : "Speichern", onAction: handleSave, loading: saving }}
        secondaryActions={[{ content: "Abbrechen", onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {formErr && (
              <Banner tone="critical" onDismiss={() => setFormErr("")}>
                <Text as="p">{formErr}</Text>
              </Banner>
            )}
            <TextField
              label="Titel *"
              value={form.title}
              onChange={(v) => setForm((f) => ({ ...f, title: v }))}
              autoComplete="off"
              placeholder="z. B. Sommerkollektion 2025"
            />
            <TextField
              label="Untertitel"
              value={form.subtitle}
              onChange={(v) => setForm((f) => ({ ...f, subtitle: v }))}
              autoComplete="off"
              placeholder="Kurze Beschreibung oder Claim"
            />
            <TextField
              label="Bild-URL"
              value={form.image_url}
              onChange={(v) => setForm((f) => ({ ...f, image_url: v }))}
              autoComplete="off"
              placeholder="https://…/banner.jpg"
              helpText="Direktlink zu einem Bild (1200×400 px empfohlen)"
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Vorschau"
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <TextField
              label="Link-URL"
              value={form.link_url}
              onChange={(v) => setForm((f) => ({ ...f, link_url: v }))}
              autoComplete="off"
              placeholder="/de/bestsellers"
            />
            <TextField
              label="Button-Text"
              value={form.button_text}
              onChange={(v) => setForm((f) => ({ ...f, button_text: v }))}
              autoComplete="off"
              placeholder="z. B. Jetzt entdecken"
            />
            <TextField
              label="Position (Anzeigereihenfolge)"
              type="number"
              value={String(form.position)}
              onChange={(v) => setForm((f) => ({ ...f, position: parseInt(v) || 0 }))}
              autoComplete="off"
              helpText="Kleinere Zahlen erscheinen zuerst"
            />
            <Checkbox
              label="Banner aktiv"
              checked={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              helpText="Inaktive Banner werden im Shop nicht angezeigt"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Banner löschen?"
        primaryAction={{ content: "Löschen", onAction: handleDelete, loading: deleting, destructive: true }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            Möchten Sie den Banner <strong>„{deleteTarget?.title}"</strong> wirklich dauerhaft löschen?
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
