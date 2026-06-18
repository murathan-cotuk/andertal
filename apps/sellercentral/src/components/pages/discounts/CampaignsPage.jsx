"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Banner,
  Badge,
  Modal,
  Divider,
  Spinner,
  EmptyState,
  Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getUI } from "@/lib/ui-strings";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import { confirmDelete } from "@/lib/confirm-delete";

const fmtDate = (v) => (v ? new Date(v).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—");

const statusTone = { active: "success", draft: "info", paused: "warning", ended: "critical" };

const EMPTY_FORM = {
  name: "",
  description: "",
  status: "draft",
  start_at: "",
  end_at: "",
  discount_type: "percentage",
  discount_value: "",
  target_type: "products",
  product_ids: [],
  group_ids: [],
  settings: {
    show_badge: true,
    badge_text: "",
    min_order_value: "",
    max_uses: "",
    stackable: false,
  },
  variant_ids: [],
};

function normalizeJsonIdArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const x = JSON.parse(raw);
      return Array.isArray(x) ? x.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}


function CampaignCard({ campaign, groups, products, onEdit, onDelete, ui, locale }) {
  const variantSel = normalizeJsonIdArray(campaign.variant_ids);
  const allProductsLabel = locale === "en" ? "All products" : locale === "tr" ? "Tüm ürünler" : locale === "fr" ? "Tous les produits" : locale === "es" ? "Todos los productos" : locale === "it" ? "Tutti i prodotti" : "Alle Produkte";
  const groupsLabel = locale === "en" ? "Group(s)" : locale === "tr" ? "Grup" : locale === "fr" ? "Groupe(s)" : locale === "es" ? "Grupo(s)" : locale === "it" ? "Gruppo/i" : "Gruppe(n)";
  const productsLabel = locale === "en" ? "Product(s)" : locale === "tr" ? "Ürün" : locale === "fr" ? "Produit(s)" : locale === "es" ? "Producto(s)" : locale === "it" ? "Prodotto/i" : "Produkt(e)";
  const variantsLabel = locale === "en" ? "Variant(s)" : locale === "tr" ? "Varyant" : locale === "fr" ? "Variante(s)" : locale === "es" ? "Variante(s)" : locale === "it" ? "Variante/i" : "Variante(n)";
  const targetDesc = campaign.target_type === "all"
    ? allProductsLabel
    : campaign.target_type === "groups"
      ? `${(campaign.group_ids || []).length} ${groupsLabel}`
      : `${(campaign.product_ids || []).length} ${productsLabel}${variantSel.length ? ` · ${variantSel.length} ${variantsLabel}` : ""}`;

  const discountLabel = campaign.discount_type === "percentage"
    ? `${campaign.discount_value}%`
    : `${Number(campaign.discount_value || 0).toFixed(2)} €`;

  const statusLabelMap = {
    active: locale === "en" ? "Active" : locale === "tr" ? "Aktif" : locale === "fr" ? "Actif" : locale === "es" ? "Activo" : locale === "it" ? "Attivo" : "Aktiv",
    draft: locale === "en" ? "Draft" : locale === "tr" ? "Taslak" : locale === "fr" ? "Brouillon" : locale === "es" ? "Borrador" : locale === "it" ? "Bozza" : "Entwurf",
    paused: locale === "en" ? "Paused" : locale === "tr" ? "Duraklatıldı" : locale === "fr" ? "En pause" : locale === "es" ? "En pausa" : locale === "it" ? "In pausa" : "Pausiert",
    ended: locale === "en" ? "Ended" : locale === "tr" ? "Sona erdi" : locale === "fr" ? "Terminé" : locale === "es" ? "Finalizado" : locale === "it" ? "Terminato" : "Beendet",
  };
  const discountWord = locale === "en" ? "Discount" : locale === "tr" ? "İndirim" : locale === "fr" ? "Remise" : locale === "es" ? "Descuento" : locale === "it" ? "Sconto" : "Rabatt";

  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="start">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{campaign.name}</Text>
            <Badge tone={statusTone[campaign.status] || "info"}>
              {statusLabelMap[campaign.status] || campaign.status}
            </Badge>
            <Badge tone="warning">{discountLabel} {discountWord}</Badge>
          </InlineStack>
          {campaign.description && (
            <Text tone="subdued" as="span" variant="bodySm">{campaign.description}</Text>
          )}
          <Text tone="subdued" as="span" variant="bodySm">
            {fmtDate(campaign.start_at)} — {fmtDate(campaign.end_at)} · {targetDesc}
          </Text>
        </BlockStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(campaign)}>{ui.edit}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(campaign.id)}>{ui.delete}</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

function toInputDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export default function CampaignsPage() {
  const locale = useLocale();
  const ui = getUI(locale);

  const STATUS_OPTIONS = [
    { label: locale === "en" ? "Draft" : locale === "tr" ? "Taslak" : locale === "fr" ? "Brouillon" : locale === "es" ? "Borrador" : locale === "it" ? "Bozza" : "Entwurf", value: "draft" },
    { label: locale === "en" ? "Active" : locale === "tr" ? "Aktif" : locale === "fr" ? "Actif" : locale === "es" ? "Activo" : locale === "it" ? "Attivo" : "Aktiv", value: "active" },
    { label: locale === "en" ? "Paused" : locale === "tr" ? "Duraklatıldı" : locale === "fr" ? "En pause" : locale === "es" ? "En pausa" : locale === "it" ? "In pausa" : "Pausiert", value: "paused" },
    { label: locale === "en" ? "Ended" : locale === "tr" ? "Sona erdi" : locale === "fr" ? "Terminé" : locale === "es" ? "Finalizado" : locale === "it" ? "Terminato" : "Beendet", value: "ended" },
  ];

  const DISCOUNT_TYPE_OPTIONS = [
    { label: locale === "en" ? "Percent (%)" : locale === "tr" ? "Yüzde (%)" : locale === "fr" ? "Pourcentage (%)" : locale === "es" ? "Porcentaje (%)" : locale === "it" ? "Percentuale (%)" : "Prozent (%)", value: "percentage" },
    { label: locale === "en" ? "Fixed amount (€)" : locale === "tr" ? "Sabit tutar (€)" : locale === "fr" ? "Montant fixe (€)" : locale === "es" ? "Importe fijo (€)" : locale === "it" ? "Importo fisso (€)" : "Fixer Betrag (€)", value: "fixed" },
  ];

  const TARGET_TYPE_OPTIONS = [
    { label: locale === "en" ? "Specific products" : locale === "tr" ? "Belirli ürünler" : locale === "fr" ? "Produits spécifiques" : locale === "es" ? "Productos específicos" : locale === "it" ? "Prodotti specifici" : "Bestimmte Produkte", value: "products" },
    { label: locale === "en" ? "Product groups" : locale === "tr" ? "Ürün grupları" : locale === "fr" ? "Groupes de produits" : locale === "es" ? "Grupos de productos" : locale === "it" ? "Gruppi di prodotti" : "Produktgruppen", value: "groups" },
    { label: locale === "en" ? "All own products" : locale === "tr" ? "Tüm kendi ürünlerim" : locale === "fr" ? "Tous mes produits" : locale === "es" ? "Todos mis productos" : locale === "it" ? "Tutti i miei prodotti" : "Alle eigenen Produkte", value: "all" },
  ];

  const [campaigns, setCampaigns] = useState([]);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");

  const client = getMedusaAdminClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, gRes, pRes] = await Promise.all([
        client.getCampaigns(),
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
      setCampaigns(Array.isArray(cRes?.campaigns) ? cRes.campaigns : []);
      setGroups(Array.isArray(gRes?.groups) ? gRes.groups : []);
      setProducts(Array.isArray(pRes?.products) ? pRes.products : []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Failed to load data." : locale === "tr" ? "Veriler yüklenemedi." : locale === "fr" ? "Impossible de charger les données." : locale === "es" ? "Error al cargar los datos." : locale === "it" ? "Impossibile caricare i dati." : "Daten konnten nicht geladen werden.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setProductSearch("");
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      status: c.status || "draft",
      start_at: toInputDate(c.start_at),
      end_at: toInputDate(c.end_at),
      discount_type: c.discount_type || "percentage",
      discount_value: String(c.discount_value || ""),
      target_type: c.target_type || "products",
      product_ids: Array.isArray(c.product_ids) ? [...c.product_ids] : [],
      group_ids: Array.isArray(c.group_ids) ? [...c.group_ids] : [],
      variant_ids: normalizeJsonIdArray(c.variant_ids),
      settings: {
        show_badge: c.settings?.show_badge !== false,
        badge_text: c.settings?.badge_text || "",
        min_order_value: c.settings?.min_order_value != null ? String(c.settings.min_order_value) : "",
        max_uses: c.settings?.max_uses != null ? String(c.settings.max_uses) : "",
        stackable: !!c.settings?.stackable,
      },
    });
    setProductSearch("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setProductSearch("");
  };

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const setSetting = (key, value) => setForm((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: locale === "en" ? "Please enter a campaign name." : locale === "tr" ? "Lütfen bir kampanya adı girin." : locale === "fr" ? "Veuillez entrer un nom de campagne." : locale === "es" ? "Por favor ingrese un nombre de campaña." : locale === "it" ? "Inserisci un nome per la campagna." : "Bitte einen Kampagnennamen eingeben." });
      return;
    }
    if (!form.discount_value || isNaN(Number(form.discount_value)) || Number(form.discount_value) <= 0) {
      setMsg({ tone: "warning", text: locale === "en" ? "Please enter a valid discount value." : locale === "tr" ? "Lütfen geçerli bir indirim değeri girin." : locale === "fr" ? "Veuillez entrer une valeur de remise valide." : locale === "es" ? "Por favor ingrese un valor de descuento válido." : locale === "it" ? "Inserisci un valore di sconto valido." : "Bitte einen gültigen Rabattwert eingeben." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        ...form,
        discount_value: Number(form.discount_value),
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        settings: {
          ...form.settings,
          min_order_value: form.settings.min_order_value !== "" ? Number(form.settings.min_order_value) : null,
          max_uses: form.settings.max_uses !== "" ? Number(form.settings.max_uses) : null,
        },
      };
      if (editingId) {
        await client.updateCampaign(editingId, payload);
      } else {
        await client.createCampaign(payload);
      }
      const updatedLabel = locale === "en" ? "Campaign updated." : locale === "tr" ? "Kampanya güncellendi." : locale === "fr" ? "Campagne mise à jour." : locale === "es" ? "Campaña actualizada." : locale === "it" ? "Campagna aggiornata." : "Kampagne aktualisiert.";
      const createdLabel = locale === "en" ? "Campaign created." : locale === "tr" ? "Kampanya oluşturuldu." : locale === "fr" ? "Campagne créée." : locale === "es" ? "Campaña creada." : locale === "it" ? "Campagna creata." : "Kampagne erstellt.";
      setMsg({ tone: "success", text: editingId ? updatedLabel : createdLabel });
      closeModal();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error saving." : locale === "tr" ? "Kaydetme hatası." : locale === "fr" ? "Erreur lors de l'enregistrement." : locale === "es" ? "Error al guardar." : locale === "it" ? "Errore durante il salvataggio." : "Fehler beim Speichern.") });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const confirmMsg = locale === "en" ? "Really delete campaign?" : locale === "tr" ? "Kampanya gerçekten silinsin mi?" : locale === "fr" ? "Supprimer la campagne ?" : locale === "es" ? "¿Eliminar la campaña?" : locale === "it" ? "Eliminare la campagna?" : "Kampagne wirklich löschen?";
    if (!(await confirmDelete(confirmMsg))) return;
    try {
      await client.deleteCampaign(id);
      setMsg({ tone: "success", text: locale === "en" ? "Campaign deleted." : locale === "tr" ? "Kampanya silindi." : locale === "fr" ? "Campagne supprimée." : locale === "es" ? "Campaña eliminada." : locale === "it" ? "Campagna eliminata." : "Kampagne gelöscht." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error deleting." : locale === "tr" ? "Silme hatası." : locale === "fr" ? "Erreur lors de la suppression." : locale === "es" ? "Error al eliminar." : locale === "it" ? "Errore durante l'eliminazione." : "Fehler beim Löschen.") });
    }
  };

  const toggleProduct = (product) => {
    const pid = product.id;
    const variantIdSet = new Set(
      (product.variants || []).map((v) => String(v?.id || "").trim()).filter(Boolean),
    );
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      const vids = new Set(prev.variant_ids);
      if (ids.has(pid)) {
        ids.delete(pid);
        for (const vid of [...vids]) {
          if (variantIdSet.has(vid)) vids.delete(vid);
        }
      } else {
        ids.add(pid);
      }
      return { ...prev, product_ids: Array.from(ids), variant_ids: Array.from(vids) };
    });
  };

  const toggleVariant = (product, variantId) => {
    const vid = String(variantId || "").trim();
    if (!vid) return;
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      const vids = new Set(prev.variant_ids);
      if (vids.has(vid)) {
        vids.delete(vid);
      } else {
        ids.add(product.id);
        vids.add(vid);
      }
      return { ...prev, product_ids: Array.from(ids), variant_ids: Array.from(vids) };
    });
  };

  const variantRowLabel = (v) => {
    const t = (v?.title || "").trim();
    if (t) return t;
    const sku = (v?.sku || "").trim();
    if (sku) return sku;
    const id = String(v?.id || "");
    const variantWord = locale === "en" ? "Variant" : locale === "tr" ? "Varyant" : locale === "fr" ? "Variante" : locale === "es" ? "Variante" : locale === "it" ? "Variante" : "Variante";
    return id ? `${variantWord} ${id.slice(0, 8)}…` : variantWord;
  };

  const toggleGroup = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.group_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, group_ids: Array.from(ids) };
    });
  };

  const filteredProducts = products.filter((p) =>
    !productSearch ||
    (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.ean || "").includes(productSearch)
  );

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const otherCampaigns = campaigns.filter((c) => c.status !== "active");

  return (
    <Page
      title={locale === "en" ? "Campaigns" : locale === "tr" ? "Kampanyalar" : locale === "fr" ? "Campagnes" : locale === "es" ? "Campañas" : locale === "it" ? "Campagne" : "Kampagnen"}
      primaryAction={{ content: locale === "en" ? "New campaign" : locale === "tr" ? "Yeni kampanya" : locale === "fr" ? "Nouvelle campagne" : locale === "es" ? "Nueva campaña" : locale === "it" ? "Nuova campagna" : "Neue Kampagne", onAction: openCreate }}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        {loading ? (
          <Card><div style={{ padding: 32, textAlign: "center" }}><Spinner size="small" /></div></Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <EmptyState heading={locale === "en" ? "No campaigns" : locale === "tr" ? "Kampanya yok" : locale === "fr" ? "Aucune campagne" : locale === "es" ? "Sin campañas" : locale === "it" ? "Nessuna campagna" : "Keine Kampagnen"} image="">
              <p>{locale === "en" ? "Create campaigns to display discounts on your products in the shop." : locale === "tr" ? "Mağazanızdaki ürünlerde indirim göstermek için kampanya oluşturun." : locale === "fr" ? "Créez des campagnes pour afficher des remises sur vos produits." : locale === "es" ? "Crea campañas para mostrar descuentos en tus productos." : locale === "it" ? "Crea campagne per mostrare sconti sui tuoi prodotti." : "Erstelle Kampagnen um Rabatte auf deine Produkte im Shop anzuzeigen."}</p>
            </EmptyState>
          </Card>
        ) : (
          <>
            {activeCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">{locale === "en" ? "Active campaigns" : locale === "tr" ? "Aktif kampanyalar" : locale === "fr" ? "Campagnes actives" : locale === "es" ? "Campañas activas" : locale === "it" ? "Campagne attive" : "Aktive Kampagnen"} ({activeCampaigns.length})</Text>
                    <Button size="slim" onClick={load} loading={loading}>{ui.refresh}</Button>
                  </InlineStack>
                  {activeCampaigns.map((c) => (
                    <CampaignCard key={c.id} campaign={c} groups={groups} products={products} onEdit={openEdit} onDelete={remove} ui={ui} locale={locale} />
                  ))}
                </BlockStack>
              </Card>
            )}
            {otherCampaigns.length > 0 && (
              <Card>
                <BlockStack gap="0">
                  <Text as="h2" variant="headingMd">{locale === "en" ? "Other campaigns" : locale === "tr" ? "Diğer kampanyalar" : locale === "fr" ? "Autres campagnes" : locale === "es" ? "Otras campañas" : locale === "it" ? "Altre campagne" : "Weitere Kampagnen"} ({otherCampaigns.length})</Text>
                  {otherCampaigns.map((c) => (
                    <CampaignCard key={c.id} campaign={c} groups={groups} products={products} onEdit={openEdit} onDelete={remove} ui={ui} locale={locale} />
                  ))}
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
        title={editingId ? (locale === "en" ? "Edit campaign" : locale === "tr" ? "Kampanyayı düzenle" : locale === "fr" ? "Modifier la campagne" : locale === "es" ? "Editar campaña" : locale === "it" ? "Modifica campagna" : "Kampagne bearbeiten") : (locale === "en" ? "Create new campaign" : locale === "tr" ? "Yeni kampanya oluştur" : locale === "fr" ? "Créer une nouvelle campagne" : locale === "es" ? "Crear nueva campaña" : locale === "it" ? "Crea nuova campagna" : "Neue Kampagne erstellen")}
        primaryAction={{ content: ui.save, onAction: save, loading: saving }}
        secondaryActions={[{ content: ui.cancel, onAction: closeModal }]}
        large
      >
        {/* Basic Info */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">{locale === "en" ? "Basic settings" : locale === "tr" ? "Temel ayarlar" : locale === "fr" ? "Paramètres de base" : locale === "es" ? "Configuración básica" : locale === "it" ? "Impostazioni di base" : "Grundeinstellungen"}</Text>
            <TextField
              label={locale === "en" ? "Campaign name *" : locale === "tr" ? "Kampanya adı *" : locale === "fr" ? "Nom de la campagne *" : locale === "es" ? "Nombre de campaña *" : locale === "it" ? "Nome campagna *" : "Kampagnenname *"}
              value={form.name}
              onChange={(v) => setField("name", v)}
              autoComplete="off"
            />
            <TextField
              label={locale === "en" ? "Description (internal)" : locale === "tr" ? "Açıklama (dahili)" : locale === "fr" ? "Description (interne)" : locale === "es" ? "Descripción (interna)" : locale === "it" ? "Descrizione (interna)" : "Beschreibung (intern)"}
              value={form.description}
              onChange={(v) => setField("description", v)}
              multiline={2}
              autoComplete="off"
            />
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={form.status}
                  onChange={(v) => setField("status", v)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label={locale === "en" ? "Discount type" : locale === "tr" ? "İndirim türü" : locale === "fr" ? "Type de remise" : locale === "es" ? "Tipo de descuento" : locale === "it" ? "Tipo di sconto" : "Rabatttyp"}
                  options={DISCOUNT_TYPE_OPTIONS}
                  value={form.discount_type}
                  onChange={(v) => setField("discount_type", v)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={form.discount_type === "percentage" ? (locale === "en" ? "Discount (%)" : locale === "tr" ? "İndirim (%)" : locale === "fr" ? "Remise (%)" : locale === "es" ? "Descuento (%)" : locale === "it" ? "Sconto (%)" : "Rabatt (%)") : (locale === "en" ? "Discount (€)" : locale === "tr" ? "İndirim (€)" : locale === "fr" ? "Remise (€)" : locale === "es" ? "Descuento (€)" : locale === "it" ? "Sconto (€)" : "Rabatt (€)")}
                  type="number"
                  min="0"
                  max={form.discount_type === "percentage" ? "100" : undefined}
                  value={form.discount_value}
                  onChange={(v) => setField("discount_value", v)}
                  autoComplete="off"
                />
              </div>
            </InlineStack>
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={locale === "en" ? "Start date & time" : locale === "tr" ? "Başlangıç tarihi ve saati" : locale === "fr" ? "Date et heure de début" : locale === "es" ? "Fecha y hora de inicio" : locale === "it" ? "Data e ora di inizio" : "Startdatum & -uhrzeit"}
                  type="datetime-local"
                  value={form.start_at}
                  onChange={(v) => setField("start_at", v)}
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={locale === "en" ? "End date & time" : locale === "tr" ? "Bitiş tarihi ve saati" : locale === "fr" ? "Date et heure de fin" : locale === "es" ? "Fecha y hora de fin" : locale === "it" ? "Data e ora di fine" : "Enddatum & -uhrzeit"}
                  type="datetime-local"
                  value={form.end_at}
                  onChange={(v) => setField("end_at", v)}
                  autoComplete="off"
                />
              </div>
            </InlineStack>
          </BlockStack>
        </Modal.Section>

        {/* Target */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">{locale === "en" ? "Target products" : locale === "tr" ? "Hedef ürünler" : locale === "fr" ? "Produits cibles" : locale === "es" ? "Productos objetivo" : locale === "it" ? "Prodotti target" : "Zielprodukte"}</Text>
            <Select
              label={locale === "en" ? "Target type" : locale === "tr" ? "Hedef türü" : locale === "fr" ? "Type de cible" : locale === "es" ? "Tipo de objetivo" : locale === "it" ? "Tipo di target" : "Zieltyp"}
              options={TARGET_TYPE_OPTIONS}
              value={form.target_type}
              onChange={(v) => setField("target_type", v)}
            />

            {form.target_type === "products" && (
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" tone="subdued">
                  {form.product_ids.length} {locale === "en" ? "product(s) selected" : locale === "tr" ? "ürün seçildi" : locale === "fr" ? "produit(s) sélectionné(s)" : locale === "es" ? "producto(s) seleccionado(s)" : locale === "it" ? "prodotto/i selezionato/i" : "Produkt(e) ausgewählt"}
                  {form.variant_ids.length > 0 ? ` · ${form.variant_ids.length} ${locale === "en" ? "variant(s) restricted" : locale === "tr" ? "varyant kısıtlandı" : locale === "fr" ? "variante(s) restreinte(s)" : locale === "es" ? "variante(s) restringida(s)" : locale === "it" ? "variante/i ristretta/e" : "Variante(n) eingeschränkt"}` : ""}
                </Text>
                <TextField
                  label=""
                  labelHidden
                  placeholder={locale === "en" ? "Search products…" : locale === "tr" ? "Ürün ara…" : locale === "fr" ? "Rechercher des produits…" : locale === "es" ? "Buscar productos…" : locale === "it" ? "Cerca prodotti…" : "Produkte suchen …"}
                  value={productSearch}
                  onChange={setProductSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setProductSearch("")}
                />
                <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e4e5e7", borderRadius: 8 }}>
                  {filteredProducts.map((p) => {
                    const checked = form.product_ids.includes(p.id);
                    const variants = Array.isArray(p.variants) ? p.variants.filter((v) => v?.id) : [];
                    return (
                      <div key={p.id} style={{ borderBottom: "1px solid #f4f5f7" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent" }}>
                          <CustomCheckbox checked={checked} onChange={() => toggleProduct(p)} size={18} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: "#202223", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || p.id}</div>
                            {p.ean && <div style={{ fontSize: 11, color: "#6d7175" }}>EAN: {p.ean}</div>}
                          </div>
                        </label>
                        {checked && variants.length > 0 ? (
                          <div style={{ padding: "4px 12px 10px 44px", background: checked ? "#f7fcff" : "transparent" }}>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {locale === "en" ? "Variants — no partial selection = discount applies to all variants." : locale === "tr" ? "Varyantlar — seçim yapılmazsa indirim tüm varyantlara uygulanır." : locale === "fr" ? "Variantes — sans sélection partielle, la remise s'applique à toutes." : locale === "es" ? "Variantes — sin selección parcial = descuento aplica a todas." : locale === "it" ? "Varianti — nessuna selezione parziale = sconto su tutte le varianti." : "Varianten — keine Teilauswahl = Rabatt gilt für alle Varianten."}
                            </Text>
                            {variants.map((v) => {
                              const vid = String(v.id);
                              const vChecked = form.variant_ids.includes(vid);
                              return (
                                <label key={vid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 2px", cursor: "pointer" }}>
                                  <CustomCheckbox checked={vChecked} onChange={() => toggleVariant(p, vid)} size={16} />
                                  <span style={{ fontSize: 12, color: "#202223" }}>{variantRowLabel(v)}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </BlockStack>
            )}

            {form.target_type === "groups" && (
              <BlockStack gap="200">
                <Text as="span" variant="bodySm" tone="subdued">{form.group_ids.length} {locale === "en" ? "group(s) selected" : locale === "tr" ? "grup seçildi" : locale === "fr" ? "groupe(s) sélectionné(s)" : locale === "es" ? "grupo(s) seleccionado(s)" : locale === "it" ? "gruppo/i selezionato/i" : "Gruppe(n) ausgewählt"}</Text>
                {groups.length === 0 ? (
                  <Banner tone="info">{locale === "en" ? "No product groups yet. Create groups first under Products → Product groups." : locale === "tr" ? "Henüz ürün grubu yok. Önce Ürünler → Ürün grupları altında gruplar oluşturun." : locale === "fr" ? "Aucun groupe de produits. Créez d'abord des groupes sous Produits → Groupes." : locale === "es" ? "Sin grupos de productos. Crea grupos primero en Productos → Grupos de productos." : locale === "it" ? "Nessun gruppo prodotti. Crea prima i gruppi in Prodotti → Gruppi di prodotti." : "Noch keine Produktgruppen erstellt. Erstelle zuerst Gruppen unter Produkte → Produktgruppen."}</Banner>
                ) : (
                  <div style={{ border: "1px solid #e4e5e7", borderRadius: 8 }}>
                    {groups.map((g) => {
                      const checked = form.group_ids.includes(g.id);
                      return (
                        <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent", borderBottom: "1px solid #f4f5f7" }}>
                          <CustomCheckbox checked={checked} onChange={() => toggleGroup(g.id)} size={18} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: "#202223" }}>{g.name}</div>
                            <div style={{ fontSize: 11, color: "#6d7175" }}>{(g.product_ids || []).length} {ui.products}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </BlockStack>
            )}

            {form.target_type === "all" && (
              <Banner tone="info">{locale === "en" ? "The discount will be applied to all your active products in the shop." : locale === "tr" ? "İndirim mağazadaki tüm aktif ürünlerinize uygulanacaktır." : locale === "fr" ? "La remise sera appliquée à tous vos produits actifs dans la boutique." : locale === "es" ? "El descuento se aplicará a todos tus productos activos en la tienda." : locale === "it" ? "Lo sconto verrà applicato a tutti i tuoi prodotti attivi nel negozio." : "Der Rabatt wird auf alle deine aktiven Produkte im Shop angewendet."}</Banner>
            )}
          </BlockStack>
        </Modal.Section>

        {/* Advanced Settings */}
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="h3" variant="headingSm">{locale === "en" ? "Advanced settings" : locale === "tr" ? "Gelişmiş ayarlar" : locale === "fr" ? "Paramètres avancés" : locale === "es" ? "Configuración avanzada" : locale === "it" ? "Impostazioni avanzate" : "Weitere Einstellungen"}</Text>
            <InlineStack gap="300" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={locale === "en" ? "Min. order value (€, optional)" : locale === "tr" ? "Min. sipariş tutarı (€, isteğe bağlı)" : locale === "fr" ? "Valeur min. commande (€, optionnel)" : locale === "es" ? "Valor mín. pedido (€, opcional)" : locale === "it" ? "Valore min. ordine (€, opzionale)" : "Mindestbestellwert (€, optional)"}
                  type="number"
                  min="0"
                  value={form.settings.min_order_value}
                  onChange={(v) => setSetting("min_order_value", v)}
                  autoComplete="off"
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  label={locale === "en" ? "Max. uses (optional)" : locale === "tr" ? "Maks. kullanım (isteğe bağlı)" : locale === "fr" ? "Utilisations max. (optionnel)" : locale === "es" ? "Usos máx. (opcional)" : locale === "it" ? "Utilizzi max. (opzionale)" : "Max. Nutzungen (optional)"}
                  type="number"
                  min="0"
                  value={form.settings.max_uses}
                  onChange={(v) => setSetting("max_uses", v)}
                  autoComplete="off"
                  helpText={locale === "en" ? "How many times the campaign can be used in total." : locale === "tr" ? "Kampanyanın toplamda kaç kez kullanılabileceği." : locale === "fr" ? "Combien de fois la campagne peut être utilisée au total." : locale === "es" ? "Cuántas veces puede usarse la campaña en total." : locale === "it" ? "Quante volte può essere utilizzata la campagna in totale." : "Wie oft die Kampagne insgesamt genutzt werden darf."}
                />
              </div>
            </InlineStack>
            <Checkbox
              label={locale === "en" ? "Show discount badge in shop" : locale === "tr" ? "Mağazada indirim rozeti göster" : locale === "fr" ? "Afficher le badge de remise dans la boutique" : locale === "es" ? "Mostrar badge de descuento en la tienda" : locale === "it" ? "Mostra badge sconto nel negozio" : "Rabattbadge im Shop anzeigen"}
              checked={form.settings.show_badge}
              onChange={(v) => setSetting("show_badge", v)}
            />
            {form.settings.show_badge && (
              <TextField
                label={locale === "en" ? 'Badge text (e.g. "Sale", "−20%")' : locale === "tr" ? 'Rozet metni (örn. "İndirim", "−20%")' : locale === "fr" ? 'Texte du badge (ex. "Promo", "−20%")' : locale === "es" ? 'Texto del badge (ej. "Oferta", "−20%")' : locale === "it" ? 'Testo badge (es. "Offerta", "−20%")' : 'Badge-Text (z.B. "Aktion", "−20%")'}
                value={form.settings.badge_text}
                onChange={(v) => setSetting("badge_text", v)}
                autoComplete="off"
                placeholder={form.discount_type === "percentage" ? `−${form.discount_value || "?"}%` : (locale === "en" ? "Sale" : locale === "tr" ? "İndirim" : locale === "fr" ? "Promo" : locale === "es" ? "Oferta" : locale === "it" ? "Offerta" : "Aktion")}
              />
            )}
            <Checkbox
              label={locale === "en" ? "Combinable with other promotions" : locale === "tr" ? "Diğer kampanyalarla birleştirilebilir" : locale === "fr" ? "Combinable avec d'autres promotions" : locale === "es" ? "Combinable con otras promociones" : locale === "it" ? "Combinabile con altre promozioni" : "Mit anderen Aktionen kombinierbar"}
              checked={form.settings.stackable}
              onChange={(v) => setSetting("stackable", v)}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
