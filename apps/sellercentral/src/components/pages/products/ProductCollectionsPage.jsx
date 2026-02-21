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
  IndexTable,
  EmptyState,
  Modal,
  Button,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function slugFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export default function ProductCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", handle: "" });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const client = getMedusaAdminClient();

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getMedusaCollections();
      const list = data?.collections || [];
      setCollections(Array.isArray(list) ? list : []);
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

  const openAdd = () => {
    setForm({ title: "", handle: "" });
    setSlugManuallyEdited(false);
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
    if (!title) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await client.createCollection({ title, handle: handle || undefined });
      setModalOpen(false);
      await fetchCollections();
    } catch (err) {
      const msg = err?.message || "Failed to create collection";
      const useCategories = msg.includes("Collection service not available") || msg.includes("COLLECTION_SERVICE");
      setError(useCategories
        ? "Collections cannot be created from here when the product service is unavailable. Create them from Content → Categories by enabling \"Has collection\"."
        : msg);
    } finally {
      setSaving(false);
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
                  <p>Create a collection here or from Content → Categories by enabling &quot;Has collection&quot;.</p>
                </EmptyState>
              ) : (
                <IndexTable
                  resourceName={{ singular: "collection", plural: "collections" }}
                  itemCount={collections.length}
                  selectable={false}
                  headings={[{ title: "Title" }, { title: "Handle" }, { title: "ID" }]}
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
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Add collection"
        primaryAction={{
          content: saving ? "Creating…" : "Create",
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
              label="Handle"
              value={form.handle}
              onChange={(value) => {
                setSlugManuallyEdited(true);
                setForm((prev) => ({ ...prev, handle: value }));
              }}
              placeholder="e.g. summer-sale"
              autoComplete="off"
              helpText="URL-friendly; auto-filled from title if empty."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
