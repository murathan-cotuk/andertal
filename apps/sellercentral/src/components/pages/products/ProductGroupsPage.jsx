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
  Button,
  Banner,
  Badge,
  Modal,
  Divider,
  Spinner,
  EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getUI } from "@/lib/ui-strings";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import { confirmDelete } from "@/lib/confirm-delete";

const EMPTY_FORM = { name: "", description: "", product_ids: [] };

function GroupCard({ group, products, onEdit, onDelete, ui, locale }) {
  const count = (group.product_ids || []).length;
  const names = (group.product_ids || [])
    .slice(0, 3)
    .map((id) => products.find((p) => p.id === id)?.title || id)
    .join(", ");
  const moreLabel = locale === "en" ? "more" : locale === "tr" ? "daha fazla" : locale === "fr" ? "de plus" : locale === "es" ? "más" : locale === "it" ? "altri" : "weitere";
  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{group.name}</Text>
            <Badge>{count} {ui.products}</Badge>
          </InlineStack>
          {group.description && (
            <Text tone="subdued" as="span" variant="bodySm">{group.description}</Text>
          )}
          {count > 0 && (
            <Text tone="subdued" as="span" variant="bodySm">
              {names}{count > 3 ? ` … +${count - 3} ${moreLabel}` : ""}
            </Text>
          )}
        </BlockStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(group)}>{ui.edit}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(group.id)}>{ui.delete}</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

function SellerSection({ sellerLabel, groups, products, onEdit, onDelete, ui, locale }) {
  const groupsLabel = locale === "en" ? "Groups" : locale === "tr" ? "Gruplar" : locale === "fr" ? "Groupes" : locale === "es" ? "Grupos" : locale === "it" ? "Gruppi" : "Gruppen";
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        background: "#f6f6f7",
        borderRadius: 8,
        padding: "8px 14px",
        marginBottom: 4,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <Text as="span" variant="headingSm" fontWeight="semibold">{sellerLabel}</Text>
        <Badge tone="info">{groups.length} {groupsLabel}</Badge>
      </div>
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} products={products} onEdit={onEdit} onDelete={onDelete} ui={ui} locale={locale} />
      ))}
    </div>
  );
}

export default function ProductGroupsPage() {
  const locale = useLocale();
  const ui = getUI(locale);
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(false);

  const client = getMedusaAdminClient();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, pRes] = await Promise.all([
        client.getProductGroups(),
        client.getAdminHubProducts({ limit: 500 }),
      ]);
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

  const openEdit = (group) => {
    setEditingId(group.id);
    setForm({
      name: group.name || "",
      description: group.description || "",
      product_ids: Array.isArray(group.product_ids) ? [...group.product_ids] : [],
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

  const save = async () => {
    if (!form.name.trim()) {
      setMsg({ tone: "warning", text: locale === "en" ? "Please enter a group name." : locale === "tr" ? "Lütfen bir grup adı girin." : locale === "fr" ? "Veuillez entrer un nom de groupe." : locale === "es" ? "Por favor ingrese un nombre de grupo." : locale === "it" ? "Inserisci un nome per il gruppo." : "Bitte einen Gruppenname eingeben." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      if (editingId) {
        await client.updateProductGroup(editingId, form);
      } else {
        await client.createProductGroup(form);
      }
      const updatedLabel = locale === "en" ? "Group updated." : locale === "tr" ? "Grup güncellendi." : locale === "fr" ? "Groupe mis à jour." : locale === "es" ? "Grupo actualizado." : locale === "it" ? "Gruppo aggiornato." : "Gruppe aktualisiert.";
      const createdLabel = locale === "en" ? "Group created." : locale === "tr" ? "Grup oluşturuldu." : locale === "fr" ? "Groupe créé." : locale === "es" ? "Grupo creado." : locale === "it" ? "Gruppo creato." : "Gruppe erstellt.";
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
    const confirmMsg = locale === "en" ? "Really delete group?" : locale === "tr" ? "Grubu gerçekten silinsin mi?" : locale === "fr" ? "Supprimer le groupe ?" : locale === "es" ? "¿Eliminar el grupo?" : locale === "it" ? "Eliminare il gruppo?" : "Gruppe wirklich löschen?";
    if (!(await confirmDelete(confirmMsg))) return;
    try {
      await client.deleteProductGroup(id);
      setMsg({ tone: "success", text: locale === "en" ? "Group deleted." : locale === "tr" ? "Grup silindi." : locale === "fr" ? "Groupe supprimé." : locale === "es" ? "Grupo eliminado." : locale === "it" ? "Gruppo eliminato." : "Gruppe gelöscht." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || (locale === "en" ? "Error deleting." : locale === "tr" ? "Silme hatası." : locale === "fr" ? "Erreur lors de la suppression." : locale === "es" ? "Error al eliminar." : locale === "it" ? "Errore durante l'eliminazione." : "Fehler beim Löschen.") });
    }
  };

  const toggleProduct = (id) => {
    setForm((prev) => {
      const ids = new Set(prev.product_ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, product_ids: Array.from(ids) };
    });
  };

  const filteredProducts = products.filter((p) =>
    !productSearch ||
    (p.title || "").toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.ean || "").includes(productSearch)
  );

  // For superuser: group by seller
  const groupsBySeller = isSuperuser
    ? groups.reduce((acc, g) => {
        const key = g.seller_id || "unknown";
        const label = g.seller_store_name || g.seller_email || g.seller_id || (locale === "en" ? "Unknown seller" : locale === "tr" ? "Bilinmeyen satıcı" : locale === "fr" ? "Vendeur inconnu" : locale === "es" ? "Vendedor desconocido" : locale === "it" ? "Venditore sconosciuto" : "Unbekannter Seller");
        if (!acc[key]) acc[key] = { label, items: [] };
        acc[key].items.push(g);
        return acc;
      }, {})
    : null;

  const productGroupsTitle = locale === "en" ? "Product groups" : locale === "tr" ? "Ürün grupları" : locale === "fr" ? "Groupes de produits" : locale === "es" ? "Grupos de productos" : locale === "it" ? "Gruppi di prodotti" : "Produktgruppen";
  const newGroupLabel = locale === "en" ? "New group" : locale === "tr" ? "Yeni grup" : locale === "fr" ? "Nouveau groupe" : locale === "es" ? "Nuevo grupo" : locale === "it" ? "Nuovo gruppo" : "Neue Gruppe";

  return (
    <Page
      title={productGroupsTitle}
      primaryAction={!isSuperuser ? { content: newGroupLabel, onAction: openCreate } : undefined}
    >
      <BlockStack gap="400">
        {msg && (
          <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>
            {msg.text}
          </Banner>
        )}

        <Card>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center" }}><Spinner size="small" /></div>
          ) : groups.length === 0 ? (
            <EmptyState heading={locale === "en" ? "No product groups" : locale === "tr" ? "Ürün grubu yok" : locale === "fr" ? "Aucun groupe de produits" : locale === "es" ? "Sin grupos de productos" : locale === "it" ? "Nessun gruppo di prodotti" : "Keine Produktgruppen"} image="">
              <p>{locale === "en" ? "Create product groups to apply campaigns to multiple products at once." : locale === "tr" ? "Birden fazla ürüne kampanya uygulamak için ürün grupları oluşturun." : locale === "fr" ? "Créez des groupes de produits pour appliquer des campagnes à plusieurs produits." : locale === "es" ? "Crea grupos de productos para aplicar campañas a varios productos." : locale === "it" ? "Crea gruppi di prodotti per applicare campagne a più prodotti." : "Erstelle Produktgruppen um Kampagnen gezielt auf mehrere Produkte anzuwenden."}</p>
            </EmptyState>
          ) : isSuperuser ? (
            // Superuser: grouped by seller
            <BlockStack gap="0">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">{locale === "en" ? "All groups" : locale === "tr" ? "Tüm gruplar" : locale === "fr" ? "Tous les groupes" : locale === "es" ? "Todos los grupos" : locale === "it" ? "Tutti i gruppi" : "Alle Gruppen"} ({groups.length})</Text>
                <Button size="slim" onClick={load} loading={loading}>{ui.refresh}</Button>
              </InlineStack>
              <div style={{ marginTop: 16 }}>
                {Object.entries(groupsBySeller).map(([sellerId, { label, items }]) => (
                  <SellerSection
                    key={sellerId}
                    sellerLabel={label}
                    groups={items}
                    products={products}
                    onEdit={openEdit}
                    onDelete={remove}
                    ui={ui}
                    locale={locale}
                  />
                ))}
              </div>
            </BlockStack>
          ) : (
            // Normal seller: own groups only
            <BlockStack gap="0">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">{locale === "en" ? "Groups" : locale === "tr" ? "Gruplar" : locale === "fr" ? "Groupes" : locale === "es" ? "Grupos" : locale === "it" ? "Gruppi" : "Gruppen"} ({groups.length})</Text>
                <Button size="slim" onClick={load} loading={loading}>{ui.refresh}</Button>
              </InlineStack>
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} products={products} onEdit={openEdit} onDelete={remove} ui={ui} locale={locale} />
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? (locale === "en" ? "Edit group" : locale === "tr" ? "Grubu düzenle" : locale === "fr" ? "Modifier le groupe" : locale === "es" ? "Editar grupo" : locale === "it" ? "Modifica gruppo" : "Gruppe bearbeiten") : (locale === "en" ? "New product group" : locale === "tr" ? "Yeni ürün grubu" : locale === "fr" ? "Nouveau groupe de produits" : locale === "es" ? "Nuevo grupo de productos" : locale === "it" ? "Nuovo gruppo di prodotti" : "Neue Produktgruppe")}
        primaryAction={{ content: ui.save, onAction: save, loading: saving }}
        secondaryActions={[{ content: ui.cancel, onAction: closeModal }]}
        large
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label={locale === "en" ? "Group name *" : locale === "tr" ? "Grup adı *" : locale === "fr" ? "Nom du groupe *" : locale === "es" ? "Nombre del grupo *" : locale === "it" ? "Nome del gruppo *" : "Gruppenname *"}
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
              autoComplete="off"
            />
            <TextField
              label={ui.colDescription}
              value={form.description}
              onChange={(v) => setForm((p) => ({ ...p, description: v }))}
              multiline={2}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                {locale === "en" ? "Select products" : locale === "tr" ? "Ürün seç" : locale === "fr" ? "Sélectionner des produits" : locale === "es" ? "Seleccionar productos" : locale === "it" ? "Seleziona prodotti" : "Produkte auswählen"} ({form.product_ids.length} {locale === "en" ? "selected" : locale === "tr" ? "seçildi" : locale === "fr" ? "sélectionné(s)" : locale === "es" ? "seleccionado(s)" : locale === "it" ? "selezionato/i" : "ausgewählt"})
              </Text>
            </InlineStack>
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
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e4e5e7", borderRadius: 8 }}>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: 16, color: "#6d7175", fontSize: 13 }}>{ui.noResults}.</div>
              ) : (
                filteredProducts.map((p) => {
                  const checked = form.product_ids.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px", cursor: "pointer",
                        background: checked ? "#f0f9ff" : "transparent",
                        borderBottom: "1px solid #f4f5f7",
                      }}
                    >
                      <CustomCheckbox
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                        size={18}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: "#202223", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.title || p.handle || p.id}
                        </div>
                        {p.ean && (
                          <div style={{ fontSize: 11, color: "#6d7175" }}>EAN: {p.ean}</div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
