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
  DataTable,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function slugFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function ContentPagesPage() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState(null);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    body: "",
    status: "draft",
  });
  const client = getMedusaAdminClient();

  const fetchPages = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await client.getPages({ limit: 100 });
      setPages(data.pages || []);
    } catch (err) {
      setError(err?.message || "Failed to load pages");
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: "", slug: "", body: "", status: "draft" });
    setModalOpen(true);
  };

  const openEdit = async (page) => {
    setEditingId(page.id);
    setForm({
      title: page.title || "",
      slug: page.slug || "",
      body: page.body || "",
      status: page.status || "draft",
    });
    setModalOpen(true);
  };

  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: editingId ? prev.slug : (prev.slug || slugFromTitle(value)),
    }));
  };

  const handleSubmit = async () => {
    const title = (form.title || "").trim();
    const slug = (form.slug || "").trim() || slugFromTitle(title);
    if (!title) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await client.updatePage(editingId, {
          title,
          slug,
          body: form.body,
          status: form.status,
        });
      } else {
        await client.createPage({
          title,
          slug,
          body: form.body,
          status: form.status,
        });
      }
      setModalOpen(false);
      await fetchPages();
    } catch (err) {
      setError(err?.message || "Failed to save page");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (page) => {
    setPageToDelete(page);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!pageToDelete) return;
    try {
      setError(null);
      await client.deletePage(pageToDelete.id);
      setDeleteModalOpen(false);
      setPageToDelete(null);
      await fetchPages();
    } catch (err) {
      setError(err?.message || "Failed to delete page");
    }
  };

  const statusOptions = [
    { label: "Draft", value: "draft" },
    { label: "Published", value: "published" },
  ];

  const rows = pages.map((p) => [
    p.title || "—",
    `/${p.slug || ""}`,
    p.status || "draft",
    p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—",
    <InlineStack key={p.id} gap="200">
      <Button size="slim" onClick={() => openEdit(p)}>Edit</Button>
      <Button size="slim" tone="critical" onClick={() => handleDeleteRequest(p)}>Delete</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Pages"
      primaryAction={{
        content: "Add page",
        onAction: openCreate,
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
                  All pages
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {pages.length} {pages.length === 1 ? "page" : "pages"}
                </Text>
              </InlineStack>

              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">Loading…</Text>
                </Box>
              ) : pages.length === 0 ? (
                <Box paddingBlock="400">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      No pages yet. Add a page to show on your store (e.g. About, Contact).
                    </Text>
                    <Button variant="primary" onClick={openCreate}>
                      Add page
                    </Button>
                  </BlockStack>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Title", "Slug", "Status", "Updated", "Actions"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editingId ? "Edit page" : "Add page"}
        primaryAction={{
          content: saving ? "Saving…" : "Save",
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
              autoComplete="off"
              placeholder="e.g. About Us"
            />
            <TextField
              label="Slug"
              value={form.slug}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
              autoComplete="off"
              placeholder="e.g. about-us"
              helpText="URL path: /pages/[slug]"
            />
            <TextField
              label="Body"
              value={form.body}
              onChange={(value) => setForm((prev) => ({ ...prev, body: value }))}
              multiline={6}
              autoComplete="off"
              placeholder="Page content (plain text or HTML)"
            />
            <Select
              label="Status"
              options={statusOptions}
              value={form.status}
              onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setPageToDelete(null);
        }}
        title="Delete page?"
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: handleDeleteConfirm,
        }}
      >
        <Modal.Section>
          <Text as="p">
            {pageToDelete ? `Delete "${pageToDelete.title || pageToDelete.slug}"? This cannot be undone.` : ""}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
