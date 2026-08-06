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
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle, sanitizeSeoHandleInput, normalizeSeoHandle } from "@/lib/slugify";
import MediaPickerModal from "@/components/MediaPickerModal";
import RichTextEditor from "@/components/RichTextEditor";
import { getContentPagesCopy } from "@/lib/content-pages-i18n";
import { dateLocaleFor } from "@/lib/locale-text";
import { getLandingEditorCopy } from "@/lib/landing-page-editor-i18n";
import { showToast } from "@/lib/toast";

/** Read a translatable field: DE lives on the plain column, other languages under the matching *_i18n jsonb column. */
function giPageField(obj, field, i18nField, lang) {
  if (!lang || lang === "de") return obj?.[field] ?? "";
  return obj?.[i18nField]?.[lang]?.[field] ?? "";
}
/** Merge a translated field into an *_i18n object for the given language, leaving other languages untouched. */
function setPageI18nField(i18nObj, field, lang, value) {
  return { ...(i18nObj || {}), [lang]: { ...(i18nObj?.[lang] || {}), [field]: value } };
}

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
    .replace(/ü/g, "ue").replace(/ö/g, "oe").replace(/ä/g, "ae").replace(/ß/g, "ss")
    .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôõ]/g, "o").replace(/[ùúû]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Backward-compatible alias used in older handlers.
const pageSlugFromTitle = slugFromTitle;

/**
 * @param {{ blogOnly?: boolean }} props — blogOnly: nur Blog; sonst nur normale Seiten (gleiche Tabelle admin_hub_pages, getrennt über page_type)
 */
export default function ContentPagesPage({ blogOnly = false }) {
  const locale = useLocale();
  const c = getContentPagesCopy(locale);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pageToDelete, setPageToDelete] = useState(null);
  const [blogImagePickerOpen, setBlogImagePickerOpen] = useState(false);
  /** User edited slug manually — stop syncing from title (new page only). */
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
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
    title_i18n: {},
    body_i18n: {},
    excerpt_i18n: {},
    meta_title_i18n: {},
    meta_description_i18n: {},
  });
  const [editLang, setEditLang] = useState("de");
  const [sort, setSort] = useState("newest");
  const langOptions = getLandingEditorCopy(locale).shopContentLangOptions();
  const client = getMedusaAdminClient();

  const fetchPages = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { limit: 100, sort };
      // Aynı tablo (admin_hub_pages); ayrı ekranlar: Blog nur blog, Pages nur normale Seiten
      if (blogOnly) params.page_type = "blog";
      else params.page_type = "page";
      const data = await client.getPages(params);
      setPages(data.pages || []);
    } catch (err) {
      setError(err?.message || c.loadError);
      setPages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, [blogOnly, sort]);

  const openCreate = () => {
    setEditingId(null);
    setSlugManuallyEdited(false);
    setEditLang("de");
    setForm({
      title: "",
      slug: "",
      body: "",
      status: "published",
      page_type: blogOnly ? "blog" : "page",
      featured_image: "",
      excerpt: "",
      meta_title: "",
      meta_description: "",
      meta_keywords: "",
      title_i18n: {},
      body_i18n: {},
      excerpt_i18n: {},
      meta_title_i18n: {},
      meta_description_i18n: {},
    });
    setModalOpen(true);
  };

  const openEdit = async (page) => {
    setEditingId(page.id);
    setSlugManuallyEdited(true);
    setEditLang("de");
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
      title_i18n: page.title_i18n || {},
      body_i18n: page.body_i18n || {},
      excerpt_i18n: page.excerpt_i18n || {},
      meta_title_i18n: page.meta_title_i18n || {},
      meta_description_i18n: page.meta_description_i18n || {},
    });
    setModalOpen(true);
  };

  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug:
        editingId || slugManuallyEdited
          ? prev.slug
          : pageSlugFromTitle(value),
    }));
  };

  const payloadFromForm = () => {
    const title = (form.title || "").trim();
    const slug = normalizeSeoHandle(form.slug || "").trim() || pageSlugFromTitle(title);
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
      title_i18n: form.title_i18n || {},
      body_i18n: form.body_i18n || {},
      excerpt_i18n: form.excerpt_i18n || {},
      meta_title_i18n: form.meta_title_i18n || {},
      meta_description_i18n: form.meta_description_i18n || {},
    };
  };

  const handleSubmit = async () => {
    const p = payloadFromForm();
    if (!p.title) {
      setError(c.titleRequired);
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
      showToast(c.saved);
    } catch (err) {
      setError(err?.message || c.saveError);
      showToast(err?.message || c.saveError, { error: true });
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
      setError(err?.message || c.deleteError);
      showToast(err?.message || c.deleteError, { error: true });
    }
  };

  const statusOptions = [
    { label: c.statusDraft, value: "draft" },
    { label: c.statusPublished, value: "published" },
  ];

  const rows = pages.map((p) => {
    const base = [
      p.title || "—",
      `/${p.slug || ""}`,
      p.status || "draft",
      p.updated_at ? new Date(p.updated_at).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
      <InlineStack key={p.id} gap="200">
        <Button size="slim" onClick={() => openEdit(p)}>{c.edit}</Button>
        <Button size="slim" tone="critical" onClick={() => handleDeleteRequest(p)}>{c.delete}</Button>
      </InlineStack>,
    ];
    return base;
  });

  const pageTitle = blogOnly ? c.blogTitle : c.pagesTitle;
  const primaryLabel = blogOnly ? c.addBlogPost : c.addPage;

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
          <div style={{ maxWidth: 260 }}>
            <Select
              label={c.sortLabel}
              options={[
                { label: c.sortNewest, value: "newest" },
                { label: c.sortAlpha, value: "alpha" },
              ]}
              value={sort}
              onChange={setSort}
            />
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  {blogOnly ? c.allBlogPosts : c.allPages}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {pages.length} {pages.length === 1 ? c.entry : c.entries}
                </Text>
              </InlineStack>

              {loading ? (
                <Box paddingBlock="400">
                  <Text as="p" tone="subdued">{c.loading}</Text>
                </Box>
              ) : pages.length === 0 ? (
                <Box paddingBlock="400">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      {blogOnly ? c.emptyBlog : c.emptyPages}
                    </Text>
                    <Button variant="primary" onClick={openCreate}>
                      {primaryLabel}
                    </Button>
                  </BlockStack>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={[c.colTitle, c.colSlug, c.colStatus, c.colUpdated, c.colActions]}
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
        title={editingId ? (blogOnly ? c.editBlogPost : c.editPage) : (blogOnly ? c.newBlogPost : c.addPage)}
        primaryAction={{
          content: saving ? c.saving : c.save,
          onAction: handleSubmit,
          loading: saving,
        }}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Select
              label="Language"
              options={langOptions}
              value={editLang}
              onChange={setEditLang}
            />
            <TextField
              label={c.fieldTitle}
              value={giPageField(form, "title", "title_i18n", editLang)}
              onChange={(value) => {
                if (editLang === "de") { handleTitleChange(value); return; }
                setForm((prev) => ({ ...prev, title_i18n: setPageI18nField(prev.title_i18n, "title", editLang, value) }));
              }}
              autoComplete="off"
              placeholder={blogOnly ? c.titlePhBlog : c.titlePhPage}
            />
            {editLang === "de" && (
              <TextField
                label={c.colSlug}
                value={form.slug}
                onChange={(value) => {
                  if (!editingId && !value.trim()) {
                    setSlugManuallyEdited(false);
                    setForm((prev) => ({
                      ...prev,
                      slug: pageSlugFromTitle(prev.title),
                    }));
                    return;
                  }
                  setSlugManuallyEdited(true);
                  setForm((prev) => ({
                    ...prev,
                    slug: sanitizeSeoHandleInput(value.toLowerCase()),
                  }));
                }}
                autoComplete="off"
                placeholder={c.slugPh}
                helpText={c.slugHelp}
              />
            )}
            {blogOnly && (
              <>
                <TextField
                  label={c.teaserLabel}
                  value={giPageField(form, "excerpt", "excerpt_i18n", editLang)}
                  onChange={(value) => {
                    if (editLang === "de") { setForm((prev) => ({ ...prev, excerpt: value })); return; }
                    setForm((prev) => ({ ...prev, excerpt_i18n: setPageI18nField(prev.excerpt_i18n, "excerpt", editLang, value) }));
                  }}
                  multiline={3}
                  autoComplete="off"
                  helpText={c.teaserHelp}
                />
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd" fontWeight="medium">{c.featuredImage}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {c.featuredImageHelpLong}
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
                        <Text as="span" variant="bodySm" tone="subdued">{c.noImage}</Text>
                      </div>
                    )}
                    <BlockStack gap="100">
                      <Button size="slim" onClick={() => setBlogImagePickerOpen(true)}>
                        {form.featured_image ? c.changeImage : c.pickImage}
                      </Button>
                      {form.featured_image ? (
                        <Button size="slim" tone="critical" onClick={() => setForm((prev) => ({ ...prev, featured_image: "" }))}>
                          {c.removeImage}
                        </Button>
                      ) : null}
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </>
            )}
            <RichTextEditor
              label={blogOnly ? c.bodyBlog : c.bodyPage}
              value={giPageField(form, "body", "body_i18n", editLang)}
              onChange={(html) => {
                if (editLang === "de") { setForm((prev) => ({ ...prev, body: html })); return; }
                setForm((prev) => ({ ...prev, body_i18n: setPageI18nField(prev.body_i18n, "body", editLang, html) }));
              }}
              minHeight="260px"
              placeholder={c.bodyPh}
              helpText={c.bodyHelp}
            />
            {blogOnly && (
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">{c.seoHeading}</Text>
                <TextField
                  label={c.metaTitle}
                  value={giPageField(form, "meta_title", "meta_title_i18n", editLang)}
                  onChange={(value) => {
                    if (editLang === "de") { setForm((prev) => ({ ...prev, meta_title: value })); return; }
                    setForm((prev) => ({ ...prev, meta_title_i18n: setPageI18nField(prev.meta_title_i18n, "meta_title", editLang, value) }));
                  }}
                  autoComplete="off"
                />
                <TextField
                  label={c.metaDescription}
                  value={giPageField(form, "meta_description", "meta_description_i18n", editLang)}
                  onChange={(value) => {
                    if (editLang === "de") { setForm((prev) => ({ ...prev, meta_description: value })); return; }
                    setForm((prev) => ({ ...prev, meta_description_i18n: setPageI18nField(prev.meta_description_i18n, "meta_description", editLang, value) }));
                  }}
                  multiline={3}
                  autoComplete="off"
                />
                <TextField
                  label={c.metaKeywords}
                  value={form.meta_keywords}
                  onChange={(value) => setForm((prev) => ({ ...prev, meta_keywords: value }))}
                  autoComplete="off"
                />
              </BlockStack>
            )}
            <Select
              label={c.fieldStatus}
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
          title={c.pickImageModalTitle}
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
        title={c.deletePageTitle}
        primaryAction={{
          content: c.delete,
          destructive: true,
          onAction: handleDeleteConfirm,
        }}
      >
        <Modal.Section>
          <Text as="p">
            {pageToDelete ? c.deleteConfirm(pageToDelete.title || pageToDelete.slug) : ""}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
