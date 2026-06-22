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
import { lt } from "@/lib/locale-text";
import { userError } from "@/lib/api-error-messages";

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
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
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
      setErr(userError(e, locale, t("Loading failed.", "Yükleme başarısız.", "Échec du chargement.", "Error de carga.", "Caricamento non riuscito.", "Laden fehlgeschlagen.")));
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
    if (!form.title.trim()) { setFormErr(t("Title is required.", "Başlık gerekli.", "Le titre est requis.", "El título es obligatorio.", "Il titolo è obbligatorio.", "Titel ist erforderlich.")); return; }
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
        ? t("Banner updated.", "Banner güncellendi.", "Bannière mise à jour.", "Banner actualizado.", "Banner aggiornato.", "Banner aktualisiert.")
        : t("Banner created.", "Banner oluşturuldu.", "Bannière créée.", "Banner creado.", "Banner creato.", "Banner erstellt."));
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormErr(userError(e, locale, t("Saving failed.", "Kaydetme başarısız.", "Échec de l'enregistrement.", "Error al guardar.", "Salvataggio non riuscito.", "Speichern fehlgeschlagen.")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await getMedusaAdminClient().deleteBanner(deleteTarget.id);
      setOk(
        t(
          `Banner "${deleteTarget.title}" deleted.`,
          `"${deleteTarget.title}" banner silindi.`,
          `Bannière "${deleteTarget.title}" supprimée.`,
          `Banner "${deleteTarget.title}" eliminado.`,
          `Banner "${deleteTarget.title}" eliminato.`,
          `Banner „${deleteTarget.title}" gelöscht.`,
        ),
      );
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setErr(userError(e, locale, t("Deletion failed.", "Silme başarısız.", "Échec de la suppression.", "Error al eliminar.", "Eliminazione non riuscita.", "Löschen fehlgeschlagen.")));
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
      setErr(userError(e, locale, t("Error updating.", "Güncelleme hatası.", "Erreur de mise à jour.", "Error al actualizar.", "Errore di aggiornamento.", "Fehler beim Aktualisieren.")));
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
        {b.is_active ? t("Deactivate", "Devre dışı bırak", "Désactiver", "Desactivar", "Disattiva", "Deaktivieren") : t("Activate", "Etkinleştir", "Activer", "Activar", "Attiva", "Aktivieren")}
      </Button>
      <Button size="slim" onClick={() => openEdit(b)}>{ui.edit}</Button>
      <Button size="slim" tone="critical" onClick={() => setDeleteTarget(b)}>{ui.delete}</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title={t("Banner Management", "Banner Yönetimi", "Gestion des bannières", "Gestión de banners", "Gestione banner", "Banner-Verwaltung")}
      primaryAction={{ content: t("Create banner", "Banner oluştur", "Créer une bannière", "Crear banner", "Crea banner", "Banner erstellen"), onAction: openCreate }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {t("Create and manage advertising banners for the shop header and homepage.", "Mağaza başlığı ve anasayfa için reklam bannerları oluşturun ve yönetin.", "Créez et gérez les bannières publicitaires pour l'en-tête et la page d'accueil.", "Cree y gestione banners publicitarios para el encabezado y la portada.", "Crea e gestisci banner pubblicitari per header e homepage.", "Erstellen und verwalten Sie Werbebanner für den Shop-Header und die Startseite.")}
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
                  heading={t("No banners yet", "Henüz banner yok", "Aucune bannière pour le moment", "Aún no hay banners", "Nessun banner per ora", "Noch keine Banner")}
                  action={{ content: t("Create banner", "Banner oluştur", "Créer une bannière", "Crear banner", "Crea banner", "Banner erstellen"), onAction: openCreate }}
                  image=""
                >
                  <Text as="p">{t("Create your first advertising banner for the shop.", "Mağaza için ilk reklam bannerınızı oluşturun.", "Créez votre première bannière publicitaire pour la boutique.", "Cree su primer banner publicitario para la tienda.", "Crea il tuo primo banner pubblicitario per il negozio.", "Erstellen Sie Ihren ersten Werbebanner für den Shop.")}</Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "text", "text"]}
                  headings={[
                    t("Banner", "Banner", "Bannière", "Banner", "Banner", "Banner"),
                    "Link",
                    t("Position", "Konum", "Position", "Posición", "Posizione", "Position"),
                    ui.status,
                    t("Actions", "İşlemler", "Actions", "Acciones", "Azioni", "Aktionen"),
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
          ? t("Edit banner", "Bannerı düzenle", "Modifier la bannière", "Editar banner", "Modifica banner", "Banner bearbeiten")
          : t("New banner", "Yeni banner", "Nouvelle bannière", "Nuevo banner", "Nuovo banner", "Neuer Banner")}
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
              label={t("Title *", "Başlık *", "Titre *", "Título *", "Titolo *", "Titel *")}
              value={form.title}
              onChange={(v) => setForm((f) => ({ ...f, title: v }))}
              autoComplete="off"
              placeholder={t("e.g. Summer Collection 2025", "örn. Yaz Koleksiyonu 2025", "ex. Collection Été 2025", "p. ej. Colección Verano 2025", "es. Collezione Estate 2025", "z. B. Sommerkollektion 2025")}
            />
            <TextField
              label={t("Subtitle", "Alt başlık", "Sous-titre", "Subtítulo", "Sottotitolo", "Untertitel")}
              value={form.subtitle}
              onChange={(v) => setForm((f) => ({ ...f, subtitle: v }))}
              autoComplete="off"
              placeholder={t("Short description or tagline", "Kısa açıklama veya slogan", "Courte description ou slogan", "Descripción corta o eslogan", "Descrizione breve o slogan", "Kurze Beschreibung oder Claim")}
            />
            <TextField
              label={t("Image URL", "Görsel URL", "URL de l'image", "URL de imagen", "URL immagine", "Bild-URL")}
              value={form.image_url}
              onChange={(v) => setForm((f) => ({ ...f, image_url: v }))}
              autoComplete="off"
              placeholder="https://…/banner.jpg"
              helpText={t("Direct link to an image (1200×400 px recommended)", "Bir görsele doğrudan bağlantı (1200×400 px önerilir)", "Lien direct vers une image (1200×400 px recommandé)", "Enlace directo a una imagen (1200×400 px recomendado)", "Link diretto a un'immagine (1200×400 px consigliato)", "Direktlink zu einem Bild (1200×400 px empfohlen)")}
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt={t("Preview", "Önizleme", "Aperçu", "Vista previa", "Anteprima", "Vorschau")}
                style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <TextField
              label={t("Video URL (optional)", "Video URL (isteğe bağlı)", "URL vidéo (optionnel)", "URL de video (opcional)", "URL video (opzionale)", "Video-URL (optional)")}
              value={form.video_url}
              onChange={(v) => setForm((f) => ({ ...f, video_url: v }))}
              autoComplete="off"
              placeholder="https://…/banner.mp4"
              helpText={t("MP4/WebM video — replaces the image when set", "MP4/WebM video — ayarlandığında görselin yerini alır", "Vidéo MP4/WebM — remplace l'image si définie", "Video MP4/WebM — reemplaza la imagen cuando se define", "Video MP4/WebM — sostituisce l'immagine quando impostato", "MP4/WebM Video — ersetzt das Bild, wenn gesetzt")}
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
              label={t("Link URL", "Bağlantı URL", "URL du lien", "URL del enlace", "URL link", "Link-URL")}
              value={form.link_url}
              onChange={(v) => setForm((f) => ({ ...f, link_url: v }))}
              autoComplete="off"
              placeholder="/de/bestsellers"
            />
            <TextField
              label={t("Button text", "Düğme metni", "Texte du bouton", "Texto del botón", "Testo pulsante", "Button-Text")}
              value={form.button_text}
              onChange={(v) => setForm((f) => ({ ...f, button_text: v }))}
              autoComplete="off"
              placeholder={t("e.g. Discover now", "örn. Şimdi keşfet", "ex. Découvrir maintenant", "p. ej. Descubrir ahora", "es. Scopri ora", "z. B. Jetzt entdecken")}
            />
            <TextField
              label={t("Position (display order)", "Konum (görüntüleme sırası)", "Position (ordre d'affichage)", "Posición (orden de visualización)", "Posizione (ordine di visualizzazione)", "Position (Anzeigereihenfolge)")}
              type="number"
              value={String(form.position)}
              onChange={(v) => setForm((f) => ({ ...f, position: parseInt(v) || 0 }))}
              autoComplete="off"
              helpText={t("Smaller numbers appear first", "Küçük sayılar önce görünür", "Les nombres plus petits apparaissent en premier", "Los números más pequeños aparecen primero", "I numeri più piccoli appaiono prima", "Kleinere Zahlen erscheinen zuerst")}
            />
            <Checkbox
              label={t("Banner active", "Banner aktif", "Bannière active", "Banner activo", "Banner attivo", "Banner aktiv")}
              checked={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              helpText={t("Inactive banners are not shown in the shop", "Pasif bannerlar mağazada gösterilmez", "Les bannières inactives ne sont pas affichées en boutique", "Los banners inactivos no se muestran en la tienda", "I banner inattivi non vengono mostrati nel negozio", "Inaktive Banner werden im Shop nicht angezeigt")}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("Delete banner?", "Banner silinsin mi?", "Supprimer la bannière ?", "¿Eliminar banner?", "Eliminare il banner?", "Banner löschen?")}
        primaryAction={{ content: ui.delete, onAction: handleDelete, loading: deleting, destructive: true }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setDeleteTarget(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            {t(
              <>Do you really want to permanently delete the banner <strong>"{deleteTarget?.title}"</strong>?</>,
              <><strong>"{deleteTarget?.title}"</strong> bannerını kalıcı olarak silmek istiyor musunuz?</>,
              <>Voulez-vous vraiment supprimer définitivement la bannière <strong>"{deleteTarget?.title}"</strong> ?</>,
              <>¿Desea eliminar permanentemente el banner <strong>"{deleteTarget?.title}"</strong>?</>,
              <>Vuoi eliminare definitivamente il banner <strong>"{deleteTarget?.title}"</strong>?</>,
              <>Möchten Sie den Banner <strong>„{deleteTarget?.title}"</strong> wirklich dauerhaft löschen?</>,
            )}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
