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
  Divider,
  Checkbox,
  Modal,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function slugFromName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function ContentCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    has_collection: false,
    active: true,
    is_visible: true,
  });
  const client = getMedusaAdminClient();

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getAdminHubCategories();
      setCategories(data.categories || []);
    } catch (err) {
      setError(err?.message || "Failed to load categories");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleNameChange = (value) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: prev.slug || slugFromName(value),
    }));
  };

  const handleSubmit = async () => {
    const name = (form.name || "").trim();
    const slug = (form.slug || slugFromName(name)).trim();
    if (!name || !slug) {
      setError("Name and slug are required.");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await client.createAdminHubCategory({
        name,
        slug,
        description: (form.description || "").trim() || undefined,
        has_collection: !!form.has_collection,
        active: !!form.active,
        is_visible: !!form.is_visible,
      });
      setModalOpen(false);
      setForm({ name: "", slug: "", description: "", has_collection: false, active: true, is_visible: true });
      await fetchCategories();
    } catch (err) {
      setError(err?.message || "Failed to create category");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Page
      title="Categories"
      primaryAction={{
        content: "Add category",
        onAction: () => setModalOpen(true),
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
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  All categories
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {categories.length} {categories.length === 1 ? "category" : "categories"}
                </Text>
              </InlineStack>
              <Divider />

              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">
                    Loading…
                  </Text>
                </Box>
              ) : categories.length === 0 ? (
                <Box paddingBlock="400">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      No categories yet. Add one to use in products and collections.
                    </Text>
                    <Button variant="primary" onClick={() => setModalOpen(true)}>
                      Add category
                    </Button>
                  </BlockStack>
                </Box>
              ) : (
                <BlockStack gap="200">
                  {categories.map((cat) => (
                    <Box
                      key={cat.id}
                      padding="300"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center" gap="400">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="medium">
                            {cat.name}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            /{cat.slug || "-"}
                            {cat.has_collection ? " · Collection" : ""}
                          </Text>
                        </BlockStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {cat.active ? "Active" : "Inactive"}
                        </Text>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!creating) setModalOpen(false);
        }}
        title="Add category"
        primaryAction={{
          content: creating ? "Creating…" : "Create",
          onAction: handleSubmit,
          loading: creating,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Name"
              value={form.name}
              onChange={handleNameChange}
              autoComplete="off"
              placeholder="e.g. Electronics"
            />
            <TextField
              label="Slug"
              value={form.slug}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
              autoComplete="off"
              placeholder="e.g. electronics"
              helpText="URL-friendly; auto-filled from name if empty."
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
              multiline={2}
              autoComplete="off"
            />
            <Checkbox
              label="Has collection (show as collection page)"
              checked={form.has_collection}
              onChange={(value) => setForm((prev) => ({ ...prev, has_collection: value }))}
            />
            <Checkbox
              label="Active"
              checked={form.active}
              onChange={(value) => setForm((prev) => ({ ...prev, active: value }))}
            />
            <Checkbox
              label="Visible in store"
              checked={form.is_visible}
              onChange={(value) => setForm((prev) => ({ ...prev, is_visible: value }))}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
