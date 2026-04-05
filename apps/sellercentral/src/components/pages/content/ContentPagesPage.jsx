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
import MediaPickerModal from "@/components/MediaPickerModal";
import RichTextEditor from "@/components/RichTextEditor";

const BACKEND_URL = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function resolveFeaturedImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
  return `${BACKEND_URL}/uploads/${u}`;
}

function slugFromTitle(title) {
  if (!title || typeof title !== "string") return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * @param {{ blogOnly?: boolean }} props — blogOnly: nur Blog; sonst nur normale Seiten (gleiche Tabelle admin_hub_pages, getrennt über page_type)
 */
export default function ContentPagesPage({ blogOnly = false }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState(null);
  const [blogImagePickerOpen, setBlogImagePickerOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    body: "",
    status: "draft",
    page_type: "page",
    featured_image: "",
    excerpt: "",
    meta_title: "",
    meta_description: "",
    meta_keywords: "",
  });
  const client = getMedusaAdminClient();

  const fetchPages = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { limit: 100 };
      // Aynı tablo (admin_hub_pages); ayrı ekranlar: Blog nur blog, Pages nur normale Seiten
      if (blogOnly) params.page_type = "blog";
      else params.page_type = "page";
      const data = await client.getPages(params);
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
  }, [blogOnly]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: "",
      slug: "",
      body: "",
      status: "draft",
      page_type: blogOnly ? "blog" : "page",
      featured_image: "",
      excerpt: "",
      meta_title: "",
      meta_description: "",
      meta_keywords: "",
    });
    setModalOpen(true);
  };

  const openEdit = async (page) => {
    setEditingId(page.id);
    setForm({
      title: page.title || "",
      slug: page.slug || "",
      body: page.body || "",
      status: page.status || "draft",
      page_type: blogOnly ? "blog" : "page",
      featured_image: page.featured_image || "",
      excerpt: page.excerpt || "",
      meta_title: page.meta_title || "",
      meta_description: page.meta_description || "",
      meta_keywords: page.meta_keywords || "",
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

  const payloadFromForm = () => {
    const title = (form.title || "").trim();
    const slug = (form.slug || "").trim() || slugFromTitle(title);
    return {
      title,
      slug,
      body: form.body,
      status: form.status,
      page_type: blogOnly ? "blog" : "page",
      featured_image: (form.featured_image || "").trim() || null,
      excerpt: form.excerpt || "",
      meta_title: (form.meta_title || "").trim() || null,
      meta_description: form.meta_description || "",
      meta_keywords: (form.meta_keywords || "").trim() || null,
    };
  };

  const handleSubmit = async () => {
    const p = payloadFromForm();
    if (!p.title) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (editingId) {
        await client.updatePage(editingId, p);
      } else {
        await client.createPage(p);
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

  const rows = pages.map((p) => {
    const base = [
      p.title || "—",
      `/${p.slug || ""}`,
      p.status || "draft",
      p.updated_at ? new Date(p.updated_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
      <InlineStack key={p.id} gap="200">
        <Button size="slim" onClick={() => openEdit(p)}>Edit</Button>
        <Button size="slim" tone="critical" onClick={() => handleDeleteRequest(p)}>Delete</Button>
      </InlineStack>,
    ];
    return base;
  });

  const pageTitle = blogOnly ? "Blog-Beiträge" : "Pages";
  const primaryLabel = blogOnly ? "Blog-Beitrag hinzufügen" : "Add page";

  return (
    <Page
      title={pageTitle}
      primaryAction={{
        content: primaryLabel,
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
                  {blogOnly ? "Alle Blog-Beiträge" : "All pages"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {pages.length} {pages.length === 1 ? "Eintrag" : "Einträge"}
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
                      {blogOnly
                        ? "Noch keine Blog-Beiträge. Erstelle einen Eintrag mit Teaser, Bild und SEO — er erscheint dann im Blog-Karussell der Landing Page."
                        : "No pages yet. Add a page to show on your store (e.g. About, Contact)."}
                    </Text>
                    <Button variant="primary" onClick={openCreate}>
                      {primaryLabel}
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
          if (!saving) {
            setBlogImagePickerOpen(false);
            setModalOpen(false);
          }
        }}
        title={editingId ? (blogOnly ? "Blog-Beitrag bearbeiten" : "Edit page") : (blogOnly ? "Blog-Beitrag" : "Add page")}
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
              placeholder={blogOnly ? "Beitragstitel" : "e.g. About Us"}
            />
            <TextField
              label="Slug"
              value={form.slug}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
              autoComplete="off"
              placeholder="e.g. about-us"
              helpText="URL: /pages/[slug]"
            />
            {blogOnly && (
              <>
                <TextField
                  label="Teaser / Kurztext (Karussell)"
                  value={form.excerpt}
                  onChange={(value) => setForm((prev) => ({ ...prev, excerpt: value }))}
                  multiline={3}
                  autoComplete="off"
                  helpText="Kurzer Text auf der Karte; wenn leer, wird aus dem Inhalt gekürzt."
                />
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd" fontWeight="medium">Beitragsbild</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Wie bei Landing-Page-Bildern: aus der Mediathek wählen, per Drag-and-Drop hochladen oder im Medien-Dialog eine https-URL eintragen.
                  </Text>
                  <InlineStack gap="300" blockAlign="center" wrap={false}>
                    {resolveFeaturedImageUrl(form.featured_image) ? (
                      <img
                        src={resolveFeaturedImageUrl(form.featured_image)}
                        alt=""
                        style={{
                          width: 80,
                          height: 80,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid var(--p-color-border)",
                          display: "block",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          background: "var(--p-color-bg-surface-secondary)",
                          borderRadius: 8,
                          border: "1px dashed var(--p-color-border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Text as="span" variant="bodySm" tone="subdued">Kein Bild</Text>
                      </div>
                    )}
                    <BlockStack gap="100">
                      <Button size="slim" onClick={() => setBlogImagePickerOpen(true)}>
                        {form.featured_image ? "Bild ändern" : "Aus Mediathek / Upload"}
                      </Button>
                      {form.featured_image ? (
                        <Button size="slim" tone="critical" onClick={() => setForm((prev) => ({ ...prev, featured_image: "" }))}>
                          Entfernen
                        </Button>
                      ) : null}
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </>
            )}
            {blogOnly ? (
              <RichTextEditor
                label="Beitragstext"
                value={form.body}
                onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
                minHeight="260px"
                placeholder="Text eingeben…"
                helpText="Visuell bearbeiten oder über „HTML“-Ansicht direkt HTML einfügen. Im Shop wird der Inhalt formatiert angezeigt."
              />
            ) : (
              <TextField
                label="Body (HTML)"
                value={form.body}
                onChange={(value) => setForm((prev) => ({ ...prev, body: value }))}
                multiline={6}
                autoComplete="off"
                placeholder="Page content (plain text or HTML)"
              />
            )}
            {blogOnly && (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">SEO</Text>
                <TextField
                  label="Meta-Titel"
                  value={form.meta_title}
                  onChange={(value) => setForm((prev) => ({ ...prev, meta_title: value }))}
                  autoComplete="off"
                />
                <TextField
                  label="Meta-Beschreibung"
                  value={form.meta_description}
                  onChange={(value) => setForm((prev) => ({ ...prev, meta_description: value }))}
                  multiline={3}
                  autoComplete="off"
                />
                <TextField
                  label="Meta-Keywords (kommagetrennt)"
                  value={form.meta_keywords}
                  onChange={(value) => setForm((prev) => ({ ...prev, meta_keywords: value }))}
                  autoComplete="off"
                />
              </BlockStack>
            )}
            <Select
              label="Status"
              options={statusOptions}
              value={form.status}
              onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {blogOnly ? (
        <MediaPickerModal
          open={blogImagePickerOpen}
          onClose={() => setBlogImagePickerOpen(false)}
          title="Beitragsbild"
          multiple={false}
          onSelect={(urls) => {
            if (urls[0]) setForm((prev) => ({ ...prev, featured_image: urls[0] }));
            setBlogImagePickerOpen(false);
          }}
        />
      ) : null}

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
