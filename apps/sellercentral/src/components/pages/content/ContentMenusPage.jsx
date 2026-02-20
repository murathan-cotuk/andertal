"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  TextField,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Modal,
  Select,
  IndexTable,
  Badge,
  EmptyState,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const LINK_TYPES = [
  { label: "Collection", value: "collection" },
  { label: "Product", value: "product" },
  { label: "Page", value: "page" },
  { label: "Blog", value: "blog" },
  { label: "Blog post", value: "blog_post" },
  { label: "Policy", value: "policy" },
  { label: "URL", value: "url" },
];

function slugFromName(name) {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function ContentMenusPage() {
  const [menus, setMenus] = useState([]);
  const [selectedMenuId, setSelectedMenuId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [menuForm, setMenuForm] = useState({ name: "", slug: "" });
  const [menuSlugManuallyEdited, setMenuSlugManuallyEdited] = useState(false);
  const [itemForm, setItemForm] = useState({
    label: "",
    link_type: "url",
    link_value: "",
    parent_id: "",
    collection_id: "",
    product_id: "",
  });
  const [saving, setSaving] = useState(false);
  const client = getMedusaAdminClient();

  const fetchMenus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getMenus();
      setMenus(data.menus || []);
      if (!selectedMenuId && (data.menus || []).length > 0) setSelectedMenuId(data.menus[0].id);
    } catch (err) {
      setError(err?.message || "Failed to load menus");
      setMenus([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    if (!selectedMenuId) {
      setItems([]);
      return;
    }
    try {
      const data = await client.getMenuItems(selectedMenuId);
      setItems(data.items || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    fetchMenus();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [selectedMenuId]);

  useEffect(() => {
    client.getMedusaCollections().then((r) => setCollections(r.collections || [])).catch(() => setCollections([]));
    client.getProducts().then((r) => setProducts(r.products || [])).catch(() => setProducts([]));
  }, []);

  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  const openAddMenu = () => {
    setEditingMenuId(null);
    setMenuSlugManuallyEdited(false);
    setMenuForm({ name: "", slug: "" });
    setMenuModalOpen(true);
  };

  const openEditMenu = (menu) => {
    setEditingMenuId(menu.id);
    setMenuSlugManuallyEdited(false);
    setMenuForm({
      name: menu.name || "",
      slug: menu.slug || slugFromName(menu.name || ""),
    });
    setMenuModalOpen(true);
  };

  const handleMenuNameChange = (value) => {
    setMenuForm((prev) => ({
      ...prev,
      name: value,
      slug: menuSlugManuallyEdited ? prev.slug : slugFromName(value),
    }));
  };

  const handleSaveMenu = async () => {
    const name = (menuForm.name || "").trim();
    const slug = (menuForm.slug || slugFromName(name)).trim();
    if (!name || !slug) {
      setError("Name and slug required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editingMenuId) {
        await client.updateMenu(editingMenuId, { name, slug, location: slug });
      } else {
        await client.createMenu({ name, slug, location: slug });
      }
      setMenuModalOpen(false);
      setEditingMenuId(null);
      await fetchMenus();
    } catch (err) {
      setError(err?.message || (editingMenuId ? "Failed to update menu" : "Failed to create menu"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenu = async (menu) => {
    if (!confirm(`Delete menu "${menu.name}"? This will remove all its items.`)) return;
    try {
      setError(null);
      await client.deleteMenu(menu.id);
      if (selectedMenuId === menu.id) setSelectedMenuId(menus.find((m) => m.id !== menu.id)?.id || null);
      await fetchMenus();
    } catch (err) {
      setError(err?.message || "Failed to delete menu");
    }
  };

  const openAddItem = () => {
    setEditingItemId(null);
    setItemForm({
      label: "",
      link_type: "url",
      link_value: "",
      parent_id: "",
      collection_id: "",
      product_id: "",
    });
    setItemModalOpen(true);
  };

  const openEditItem = (item) => {
    setEditingItemId(item.id);
    let collection_id = "";
    let product_id = "";
    if (item.link_type === "collection" && item.link_value) {
      try {
        const v = JSON.parse(item.link_value);
        if (v && v.id) collection_id = v.id;
      } catch (_) {}
    }
    if (item.link_type === "product" && item.link_value) {
      try {
        const v = JSON.parse(item.link_value);
        if (v && v.id) product_id = v.id;
      } catch (_) {}
    }
    setItemForm({
      label: item.label || "",
      link_type: item.link_type || "url",
      link_value: item.link_type === "url" || item.link_type === "page" || item.link_type === "policy" || item.link_type === "blog" || item.link_type === "blog_post" ? (item.link_value || "") : "",
      parent_id: item.parent_id || "",
      collection_id,
      product_id,
    });
    setItemModalOpen(true);
  };

  const handleDeleteItem = async (item) => {
    if (!confirm(`Remove "${item.label}" from menu?`)) return;
    if (!selectedMenuId) return;
    try {
      setError(null);
      await client.deleteMenuItem(selectedMenuId, item.id);
      await fetchItems();
    } catch (err) {
      setError(err?.message || "Failed to remove item");
    }
  };

  const getLinkDisplay = (item) => {
    if (!item.link_type || item.link_type === "url") return item.link_value || "—";
    try {
      const v = typeof item.link_value === "string" ? JSON.parse(item.link_value) : item.link_value;
      if (v && v.title) return v.title;
      if (v && v.handle) return v.handle;
      return item.link_value || "—";
    } catch {
      return item.link_value || "—";
    }
  };

  const handleSaveItem = async () => {
    const label = (itemForm.label || "").trim();
    if (!label) {
      setError("Label required");
      return;
    }
    if (!selectedMenuId) return;
    let link_value = itemForm.link_value;
    if (itemForm.link_type === "collection" && itemForm.collection_id) {
      const c = collections.find((x) => x.id === itemForm.collection_id);
      link_value = JSON.stringify({ id: c?.id, title: c?.title, handle: c?.handle });
    } else if (itemForm.link_type === "product" && itemForm.product_id) {
      const p = products.find((x) => x.id === itemForm.product_id);
      link_value = JSON.stringify({ id: p?.id, title: p?.title, handle: p?.handle });
    } else if (itemForm.link_type !== "url") {
      link_value = itemForm.link_value || "";
    }
    try {
      setSaving(true);
      setError(null);
      if (editingItemId) {
        await client.updateMenuItem(selectedMenuId, editingItemId, {
          label: itemForm.label,
          link_type: itemForm.link_type || "url",
          link_value: link_value || null,
          parent_id: itemForm.parent_id || null,
        });
      } else {
        await client.createMenuItem(selectedMenuId, {
          label: itemForm.label,
          link_type: itemForm.link_type || "url",
          link_value: link_value || null,
          parent_id: itemForm.parent_id || null,
        });
      }
      setItemModalOpen(false);
      setEditingItemId(null);
      await fetchItems();
    } catch (err) {
      setError(err?.message || (editingItemId ? "Failed to update item" : "Failed to add item"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Menus"
      primaryAction={{
        content: "Add menu",
        onAction: openAddMenu,
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">Loading…</Text>
                </Box>
              ) : menus.length === 0 ? (
                <EmptyState
                  heading="Create your first menu"
                  action={{ content: "Add menu", onAction: openAddMenu }}
                >
                  <p>Add a menu (e.g. Main menu), then add items with labels and links.</p>
                </EmptyState>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px", minHeight: "320px" }}>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Menus</Text>
                    {menus.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: selectedMenuId === m.id ? "var(--p-color-bg-surface-selected, #e3f1df)" : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          <button
                            type="button"
                            onClick={() => setSelectedMenuId(m.id)}
                            style={{
                              flex: 1,
                              textAlign: "left",
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                              fontSize: "14px",
                              fontWeight: selectedMenuId === m.id ? 600 : 400,
                            }}
                          >
                            {m.name}
                          </button>
                          <Button size="slim" variant="plain" onClick={() => openEditMenu(m)} accessibilityLabel="Edit menu">
                            Edit
                          </Button>
                          <Button size="slim" variant="plain" tone="critical" onClick={() => handleDeleteMenu(m)} accessibilityLabel="Delete menu">
                            Delete
                          </Button>
                        </InlineStack>
                      </div>
                    ))}
                  </BlockStack>
                  <Box>
                    {selectedMenu && (
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center" gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingSm">{selectedMenu.name}</Text>
                            <Badge tone="info">{selectedMenu.slug || selectedMenu.location}</Badge>
                          </InlineStack>
                          <Button size="slim" onClick={openAddItem}>Add item</Button>
                        </InlineStack>
                        {items.length === 0 ? (
                          <Box paddingBlock="300" paddingInline="200" background="bg-surface-secondary" borderRadius="200">
                            <Text as="p" variant="bodySm" tone="subdued">No items. Click &quot;Add item&quot; to add links to this menu.</Text>
                            <Box paddingBlockStart="200">
                              <Button size="slim" onClick={openAddItem}>Add item</Button>
                            </Box>
                          </Box>
                        ) : (
                          <IndexTable
                            resourceName={{ singular: "item", plural: "items" }}
                            itemCount={items.length}
                            selectable={false}
                            headings={[{ title: "Label" }, { title: "Link" }, { title: "Type" }, { title: "" }]}
                          >
                            {items.map((item, index) => (
                              <IndexTable.Row id={item.id} key={item.id} position={index}>
                                <IndexTable.Cell>{item.label}</IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Text as="span" tone="subdued">{getLinkDisplay(item)}</Text>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <Badge tone="info">{item.link_type || "url"}</Badge>
                                </IndexTable.Cell>
                                <IndexTable.Cell>
                                  <InlineStack gap="100">
                                    <Button size="slim" variant="plain" onClick={() => openEditItem(item)}>Edit</Button>
                                    <Button size="slim" variant="plain" tone="critical" onClick={() => handleDeleteItem(item)}>Delete</Button>
                                  </InlineStack>
                                </IndexTable.Cell>
                              </IndexTable.Row>
                            ))}
                          </IndexTable>
                        )}
                      </BlockStack>
                    )}
                  </Box>
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={menuModalOpen}
        onClose={() => !saving && setMenuModalOpen(false)}
        title={editingMenuId ? "Edit menu" : "Add menu"}
        primaryAction={{
          content: saving ? (editingMenuId ? "Saving…" : "Creating…") : (editingMenuId ? "Save" : "Create"),
          onAction: handleSaveMenu,
          loading: saving,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Menu name"
              value={menuForm.name}
              onChange={handleMenuNameChange}
              placeholder="e.g. Main menu"
              autoComplete="off"
            />
            <TextField
              label="Slug"
              value={menuForm.slug}
              onChange={(value) => {
                setMenuSlugManuallyEdited(true);
                setMenuForm((prev) => ({ ...prev, slug: value }));
              }}
              placeholder="e.g. main-menu"
              autoComplete="off"
              helpText="Used in the store to show this menu (e.g. enter main-menu in navbar slot to display this menu). Auto-filled from name."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={itemModalOpen}
        onClose={() => !saving && setItemModalOpen(false)}
        title={editingItemId ? "Edit menu item" : "Add menu item"}
        primaryAction={{
          content: saving ? (editingItemId ? "Saving…" : "Adding…") : (editingItemId ? "Save" : "Add"),
          onAction: handleSaveItem,
          loading: saving,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Label (text shown in menu)"
              value={itemForm.label}
              onChange={(value) => setItemForm((prev) => ({ ...prev, label: value }))}
              placeholder="e.g. Neuigkeiten"
              autoComplete="off"
            />
            <Select
              label="Link type"
              options={LINK_TYPES}
              value={itemForm.link_type}
              onChange={(value) => setItemForm((prev) => ({ ...prev, link_type: value }))}
            />
            {itemForm.link_type === "collection" && (
              <Select
                label="Collection"
                options={[
                  { label: "— Select collection —", value: "" },
                  ...collections.map((c) => ({ label: c.title || c.handle || c.id, value: c.id })),
                ]}
                value={itemForm.collection_id || ""}
                onChange={(value) => setItemForm((prev) => ({ ...prev, collection_id: value }))}
              />
            )}
            {itemForm.link_type === "product" && (
              <Select
                label="Product"
                options={[
                  { label: "— Select product —", value: "" },
                  ...(products || []).map((p) => ({ label: p.title || p.handle || p.id, value: p.id })),
                ]}
                value={itemForm.product_id || ""}
                onChange={(value) => setItemForm((prev) => ({ ...prev, product_id: value }))}
              />
            )}
            {(itemForm.link_type === "url" || itemForm.link_type === "page" || itemForm.link_type === "policy" || itemForm.link_type === "blog" || itemForm.link_type === "blog_post") && (
              <TextField
                label={itemForm.link_type === "url" ? "URL" : "Path or URL"}
                value={itemForm.link_value}
                onChange={(value) => setItemForm((prev) => ({ ...prev, link_value: value }))}
                placeholder={itemForm.link_type === "url" ? "https://…" : "/page or /policy/…"}
                autoComplete="off"
              />
            )}
            {items.length > 0 && (
              <Select
                label="Parent item (submenu)"
                options={[
                  { label: "— None (top level) —", value: "" },
                  ...items.filter((i) => i.id !== editingItemId).map((i) => ({ label: i.label, value: i.id })),
                ]}
                value={itemForm.parent_id}
                onChange={(value) => setItemForm((prev) => ({ ...prev, parent_id: value }))}
              />
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
