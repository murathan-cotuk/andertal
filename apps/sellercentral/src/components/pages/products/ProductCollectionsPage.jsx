"use client";

import React, { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  BlockStack,
  Box,
  Banner,
  Button,
  InlineStack,
  IndexTable,
  EmptyState,
  Modal,
  Select,
} from "@shopify/polaris";
import { EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function slugFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function buildTree(flatList) {
  if (!Array.isArray(flatList)) return [];
  const byId = new Map(flatList.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of flatList) {
    const node = byId.get(c.id);
    if (!c.parent_id) roots.push(node);
    else {
      const parent = byId.get(c.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

function flattenTree(tree, level = 0) {
  if (!Array.isArray(tree)) return [];
  let out = [];
  for (const node of tree) {
    out.push({ ...node, _level: level });
    if (node.children?.length) out = out.concat(flattenTree(node.children, level + 1));
  }
  return out;
}

export default function ProductCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ title: "", handle: "", category_id: "" });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const client = getMedusaAdminClient();

  const loadCategories = async () => {
    try {
      const data = await client.getAdminHubCategories({ all: true });
      const list = data?.categories || [];
      setCategories(Array.isArray(list) ? list : []);
      return Array.isArray(list) ? list : [];
    } catch {
      setCategories([]);
      return [];
    }
  };

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const ids = new Set();
      const list = [];

      try {
        const data = await client.getMedusaCollections({ adminHub: true });
        const allList = data?.collections || [];
        for (const c of allList) {
          if (c?.id && !ids.has(c.id)) {
            ids.add(c.id);
            list.push({
              id: c.id,
              title: c.title ?? c.name,
              handle: c.handle ?? c.slug,
              _standalone: !!c._standalone,
              _fromCategory: !!c._fromCategory,
            });
          }
        }
      } catch (_) {}

      setCollections(list);
    } catch (err) {
      setError(err?.message || "Failed to load collections");
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  useEffect(() => {
    if (modalOpen || editId) loadCategories();
  }, [modalOpen, editId]);

  const openAdd = () => {
    setEditId(null);
    setForm({ title: "", handle: "", category_id: "" });
    setSlugManuallyEdited(false);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (col) => {
    setEditId(col.id);
    setForm({
      title: col.title ?? "",
      handle: col.handle ?? "",
      category_id: "",
    });
    setSlugManuallyEdited(false);
    setError(null);
    setModalOpen(true);
  };

  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      handle: slugManuallyEdited ? prev.handle : slugFromTitle(value),
    }));
  };

  const handleSubmit = async () => {
    const title = (form.title || "").trim();
    const handle = (form.handle || "").trim() || slugFromTitle(title);
    const categoryId = (form.category_id || "").trim() || undefined;
    if (!title) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editId) {
        await client.updateCollection(editId, {
          title,
          handle: handle || slugFromTitle(title),
          ...(categoryId && { category_id: categoryId }),
        });
      } else {
        await client.createCollection({
          title,
          handle: handle || slugFromTitle(title),
          standalone: true,
          ...(categoryId && { category_id: categoryId }),
        });
      }
      setModalOpen(false);
      setEditId(null);
      await fetchCollections();
    } catch (err) {
      setError(err?.message || (editId ? "Failed to update collection" : "Failed to create collection"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!deleteId) return;
    try {
      setDeleting(true);
      setError(null);
      await client.deleteCollection(deleteId);
      setDeleteId(null);
      await fetchCollections();
    } catch (err) {
      setError(err?.message || "Failed to delete collection");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page
      title="Collections"
      subtitle="Product collections (create here or from Content → Categories with Has collection)"
      primaryAction={{ content: "Add collection", onAction: openAdd }}
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
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Collections
              </Text>
              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">
                    Loading…
                  </Text>
                </Box>
              ) : collections.length === 0 ? (
                <EmptyState
                  heading="No collections yet"
                  action={{ content: "Add collection", onAction: openAdd }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Click &quot;Add collection&quot; to create a new collection. It will appear in this list.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "collection", plural: "collections" }}
                  itemCount={collections.length}
                  selectable={false}
                  headings={[{ title: "Title" }, { title: "Handle" }, { title: "ID" }, { title: "" }]}
                >
                  {collections.map((col, index) => (
                    <IndexTable.Row id={col.id} key={col.id} position={index}>
                      <IndexTable.Cell>
                        <Text as="span" fontWeight="medium">
                          {col.title ?? col.name ?? "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" tone="subdued">
                          {col.handle ?? "—"}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {col.id}
                        </Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          {col._standalone && (
                            <Button size="slim" variant="plain" tone="subdued" accessibilityLabel="Edit" icon={EditIcon} onClick={() => openEdit(col)} />
                          )}
                          <Button size="slim" variant="plain" tone="critical" accessibilityLabel="Delete" icon={DeleteIcon} onClick={() => setDeleteId(col.id)} />
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={!!deleteId}
        onClose={() => !deleting && setDeleteId(null)}
        title="Delete collection"
        primaryAction={{
          content: deleting ? "Deleting…" : "Delete",
          destructive: true,
          onAction: handleDeleteCollection,
          loading: deleting,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete &quot;{collections.find((c) => c.id === deleteId)?.title || "this collection"}&quot;?
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => !saving && (setModalOpen(false), setEditId(null))}
        title={editId ? "Edit collection" : "Add collection"}
        primaryAction={{
          content: saving ? (editId ? "Saving…" : "Creating…") : editId ? "Save" : "Create",
          onAction: handleSubmit,
          loading: saving,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Title"
              value={form.title}
              onChange={handleTitleChange}
              placeholder="e.g. Summer Sale"
              autoComplete="off"
            />
            <TextField
              label="Handle (slug)"
              value={form.handle}
              onChange={(value) => {
                setSlugManuallyEdited(true);
                setForm((prev) => ({ ...prev, handle: value }));
              }}
              placeholder="e.g. summer-sale"
              autoComplete="off"
              helpText="URL-friendly; auto-filled from title."
            />
            <Select
              label="Link to category (optional)"
              options={[
                { label: "— None —", value: "" },
                ...flattenTree(buildTree(categories)).map((c) => ({
                  label: (c._level ? "  ".repeat(c._level) + "↳ " : "") + (c.name || c.slug || c.id),
                  value: c.id,
                })),
              ]}
              value={form.category_id}
              onChange={(value) => setForm((prev) => ({ ...prev, category_id: value }))}
              helpText={editId ? "Link this collection to a category." : "Optionally link the new collection to a category."}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
