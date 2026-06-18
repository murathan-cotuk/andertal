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
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  image_url: "",
  video_url: "",
  link_url: "",
  button_text: "",
  is_active: true,
  position: 0,
};

export default function BannersPage() {
  const locale = useLocale();
  const ui = getUI(locale);
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
      setErr(e?.message || (locale === "en" ? "Loading failed." : locale === "tr" ? "Yükleme başarısız." : "Laden fehlgeschlagen."));
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
      video_url: banner.video_url || "",
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
    if (!form.title.trim()) { setFormErr(locale === "en" ? "Title is required." : locale === "tr" ? "Başlık gerekli." : "Titel ist erforderlich."); return; }
    setSaving(true);
    setFormErr("");
    try {
      const payload = {
        ...form,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        image_url: form.image_url.trim() || null,
        video_url: form.video_url.trim() || null,
        link_url: form.link_url.trim() || null,
        button_text: form.button_text.trim() || null,
        position: Number(form.position) || 0,
      };
      if (editing) {
        await getMedusaAdminClient().updateBanner(editing.id, payload);
      } else {
        await getMedusaAdminClient().createBanner(payload);
      }
      setOk(editing
        ? (locale === "en" ? "Banner updated." : locale === "tr" ? "Banner güncellendi." : "Banner aktualisiert.")
        : (locale === "en" ? "Banner created." : locale === "tr" ? "Banner oluşturuldu." : "Banner erstellt."));
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(e?.message || (locale === "en" ? "Saving failed." : locale === "tr" ? "Kaydetme başarısız." : "Speichern fehlgeschlagen."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getMedusaAdminClient().deleteBanner(deleteTarget.id);
      setOk(locale === "en" ? `Banner "${deleteTarget.title}" deleted.` : locale === "tr" ? `"${deleteTarget.title}" banner silindi.` : `Banner „${deleteTarget.title}" gelöscht.`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setErr(e?.message || (locale === "en" ? "Deletion failed." : locale === "tr" ? "Silme başarısız." : "Löschen fehlgeschlagen."));
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
      setErr(e?.message || (locale === "en" ? "Error updating." : locale === "tr" ? "Güncelleme hatası." : "Fehler beim Aktualisieren."));
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
      {b.is_active ? ui.active : ui.inactive}
    </Badge>,
    <InlineStack gap="200" key="actions">
      <Button size="slim" onClick={() => toggleActive(b)}>
        {b.is_active ? (locale === "en" ? "Deactivate" : locale === "tr" ? "Deaktive et" : "Deaktivieren") : (locale === "en" ? "Activate" : locale === "tr" ? "Aktive et" : "Aktivieren")}
      </Button>
      <Button size="slim" onClick={() => openEdit(b)}>{ui.edit}</Button>
      <Button size="slim" tone="critical" onClick={() => setDeleteTarget(b)}>{ui.delete}</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title={locale === "en" ? "Banner Management" : locale === "tr" ? "Banner Yönetimi" : "Banner-Verwaltung"}
      primaryAction={{ content: locale === "en" ? "Create banner" : locale === "tr" ? "Banner oluştur" : "Banner erstellen", onAction: openCreate }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {locale === "en" ? "Create and manage advertising banners for the shop header and homepage." : locale === "tr" ? "Mağaza başlığı ve anasayfa için reklam bannerları oluşturun ve yönetin." : "Erstellen und verwalten Sie Werbebanner für den Shop-Header und die Startseite."}
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
                  <Text tone="subdued">{ui.loading}</Text>
                </Box>
              ) : banners.length === 0 ? (
                <EmptyState
                  heading={locale === "en" ? "No banners yet" : locale === "tr" ? "Henüz banner yok" : "Noch keine Banner"}
                  action={{ content: locale === "en" ? "Create banner" : locale === "tr" ? "Banner oluştur" : "Banner erstellen", onAction: openCreate }}
                  image=""
                >
                  <Text as="p">{locale === "en" ? "Create your first advertising banner for the shop." : locale === "tr" ? "Mağaza için ilk reklam bannerınızı oluşturun." : "Erstellen Sie Ihren ersten Werbebanner für den Shop."}</Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={[
                    locale === "en" ? "Banner" : "Banner",
                    "Link",
                    locale === "en" ? "Position" : locale === "tr" ? "Konum" : "Position",
                    ui.status,
                    locale === "en" ? "Actions" : locale === "tr" ? "İşlemler" : "Aktionen",
                  ]}
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
        title={editing
          ? (locale === "en" ? "Edit banner" : locale === "tr" ? "Bannerı düzenle" : "Banner bearbeiten")
          : (locale === "en" ? "New banner" : locale === "tr" ? "Yeni banner" : "Neuer Banner")}
        primaryAction={{ content: ui.save, onAction: handleSave, loading: saving }}
        secondaryActions={[{ content: ui.cancel, onAction: closeModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {formErr && (
              <Banner tone="critical" onDismiss={() => setFormErr("")}>
                <Text as="p">{formErr}</Text>
              </Banner>
            )}
            <TextField
              label={locale === "en" ? "Title *" : locale === "tr" ? "Başlık *" : "Titel *"}
              value={form.title}
              onChange={(v) => setForm((f) => ({ ...f, title: v }))}
              autoComplete="off"
              placeholder={locale === "en" ? "e.g. Summer Collection 2025" : locale === "tr" ? "örn. Yaz Koleksiyonu 2025" : "z. B. Sommerkollektion 2025"}
            />
            <TextField
              label={locale === "en" ? "Subtitle" : locale === "tr" ? "Alt başlık" : "Untertitel"}
              value={form.subtitle}
              onChange={(v) => setForm((f) => ({ ...f, subtitle: v }))}
              autoComplete="off"
              placeholder={locale === "en" ? "Short description or tagline" : locale === "tr" ? "Kısa açıklama veya slogan" : "Kurze Beschreibung oder Claim"}
            />
            <TextField
              label={locale === "en" ? "Image URL" : locale === "tr" ? "Görsel URL" : "Bild-URL"}
              value={form.image_url}
              onChange={(v) => setForm((f) => ({ ...f, image_url: v }))}
              autoComplete="off"
              placeholder="https://…/banner.jpg"
              helpText={locale === "en" ? "Direct link to an image (1200×400 px recommended)" : locale === "tr" ? "Bir görsele doğrudan bağlantı (1200×400 px önerilir)" : "Direktlink zu einem Bild (1200×400 px empfohlen)"}
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt={locale === "en" ? "Preview" : locale === "tr" ? "Önizleme" : "Vorschau"}
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <TextField
              label={locale === "en" ? "Video URL (optional)" : locale === "tr" ? "Video URL (isteğe bağlı)" : "Video-URL (optional)"}
              value={form.video_url}
              onChange={(v) => setForm((f) => ({ ...f, video_url: v }))}
              autoComplete="off"
              placeholder="https://…/banner.mp4"
              helpText={locale === "en" ? "MP4/WebM video — replaces the image when set" : locale === "tr" ? "MP4/WebM video — ayarlandığında görselin yerini alır" : "MP4/WebM Video — ersetzt das Bild, wenn gesetzt"}
            />
            {form.video_url && (
              <video
                src={form.video_url}
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                muted
                playsInline
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <TextField
              label={locale === "en" ? "Link URL" : locale === "tr" ? "Bağlantı URL" : "Link-URL"}
              value={form.link_url}
              onChange={(v) => setForm((f) => ({ ...f, link_url: v }))}
              autoComplete="off"
              placeholder="/de/bestsellers"
            />
            <TextField
              label={locale === "en" ? "Button text" : locale === "tr" ? "Düğme metni" : "Button-Text"}
              value={form.button_text}
              onChange={(v) => setForm((f) => ({ ...f, button_text: v }))}
              autoComplete="off"
              placeholder={locale === "en" ? "e.g. Discover now" : locale === "tr" ? "örn. Şimdi keşfet" : "z. B. Jetzt entdecken"}
            />
            <TextField
              label={locale === "en" ? "Position (display order)" : locale === "tr" ? "Konum (görüntüleme sırası)" : "Position (Anzeigereihenfolge)"}
              type="number"
              value={String(form.position)}
              onChange={(v) => setForm((f) => ({ ...f, position: parseInt(v) || 0 }))}
              autoComplete="off"
              helpText={locale === "en" ? "Smaller numbers appear first" : locale === "tr" ? "Küçük sayılar önce görünür" : "Kleinere Zahlen erscheinen zuerst"}
            />
            <Checkbox
              label={locale === "en" ? "Banner active" : locale === "tr" ? "Banner aktif" : "Banner aktiv"}
              checked={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              helpText={locale === "en" ? "Inactive banners are not shown in the shop" : locale === "tr" ? "Pasif bannerlar mağazada gösterilmez" : "Inaktive Banner werden im Shop nicht angezeigt"}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={locale === "en" ? "Delete banner?" : locale === "tr" ? "Banner silinsin mi?" : "Banner löschen?"}
        primaryAction={{ content: ui.delete, onAction: handleDelete, loading: deleting, destructive: true }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {locale === "en"
              ? <>Do you really want to permanently delete the banner <strong>"{deleteTarget?.title}"</strong>?</>
              : locale === "tr"
              ? <><strong>"{deleteTarget?.title}"</strong> bannerını kalıcı olarak silmek istiyor musunuz?</>
              : <>Möchten Sie den Banner <strong>„{deleteTarget?.title}"</strong> wirklich dauerhaft löschen?</>
            }
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
