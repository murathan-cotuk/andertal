"use client";

import { useEffect, useState, useCallback } from "react";
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

const EMPTY_FORM = { name: "", description: "", product_ids: [] };

function GroupCard({ group, products, onEdit, onDelete }) {
  const count = (group.product_ids || []).length;
  const names = (group.product_ids || [])
    .slice(0, 3)
    .map((id) => products.find((p) => p.id === id)?.title || id)
    .join(", ");
  return (
    <div style={{ borderTop: "1px solid #f1f2f4", padding: "14px 0" }}>
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">{group.name}</Text>
            <Badge>{count} Produkte</Badge>
          </InlineStack>
          {group.description && (
            <Text tone="subdued" as="span" variant="bodySm">{group.description}</Text>
          )}
          {count > 0 && (
            <Text tone="subdued" as="span" variant="bodySm">
              {names}{count > 3 ? ` … +${count - 3} weitere` : ""}
            </Text>
          )}
        </BlockStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => onEdit(group)}>Bearbeiten</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(group.id)}>Löschen</Button>
        </InlineStack>
      </InlineStack>
    </div>
  );
}

function SellerSection({ sellerLabel, groups, products, onEdit, onDelete }) {
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
        <Badge tone="info">{groups.length} Gruppen</Badge>
      </div>
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} products={products} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function ProductGroupsPage() {
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
      setMsg({ tone: "critical", text: e?.message || "Daten konnten nicht geladen werden." });
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
      setMsg({ tone: "warning", text: "Bitte einen Gruppenname eingeben." });
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
      setMsg({ tone: "success", text: editingId ? "Gruppe aktualisiert." : "Gruppe erstellt." });
      closeModal();
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Gruppe wirklich löschen?")) return;
    try {
      await client.deleteProductGroup(id);
      setMsg({ tone: "success", text: "Gruppe gelöscht." });
      await load();
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." });
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
        const label = g.seller_store_name || g.seller_email || g.seller_id || "Unbekannter Seller";
        if (!acc[key]) acc[key] = { label, items: [] };
        acc[key].items.push(g);
        return acc;
      }, {})
    : null;

  return (
    <Page
      title="Produktgruppen"
      primaryAction={!isSuperuser ? { content: "Neue Gruppe", onAction: openCreate } : undefined}
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
            <EmptyState heading="Keine Produktgruppen" image="">
              <p>Erstelle Produktgruppen um Kampagnen gezielt auf mehrere Produkte anzuwenden.</p>
            </EmptyState>
          ) : isSuperuser ? (
            // Superuser: grouped by seller
            <BlockStack gap="0">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Alle Gruppen ({groups.length})</Text>
                <Button size="slim" onClick={load} loading={loading}>Aktualisieren</Button>
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
                  />
                ))}
              </div>
            </BlockStack>
          ) : (
            // Normal seller: own groups only
            <BlockStack gap="0">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Gruppen ({groups.length})</Text>
                <Button size="slim" onClick={load} loading={loading}>Aktualisieren</Button>
              </InlineStack>
              {groups.map((g) => (
                <GroupCard key={g.id} group={g} products={products} onEdit={openEdit} onDelete={remove} />
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Gruppe bearbeiten" : "Neue Produktgruppe"}
        primaryAction={{ content: "Speichern", onAction: save, loading: saving }}
        secondaryActions={[{ content: "Abbrechen", onAction: closeModal }]}
        large
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Gruppenname *"
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
              autoComplete="off"
            />
            <TextField
              label="Beschreibung"
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
                Produkte auswählen ({form.product_ids.length} ausgewählt)
              </Text>
            </InlineStack>
            <TextField
              label=""
              labelHidden
              placeholder="Produkte suchen …"
              value={productSearch}
              onChange={setProductSearch}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setProductSearch("")}
            />
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e4e5e7", borderRadius: 8 }}>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: 16, color: "#6d7175", fontSize: 13 }}>Keine Produkte gefunden.</div>
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
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
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
