"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Page, Layout, Card, Text, TextField, BlockStack, InlineStack,
  Box, Banner, Button, Divider, Checkbox, Badge, Thumbnail,
  InlineGrid, Select,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  return (typeof env === "string" ? env : "").trim() || (typeof window !== "undefined" ? "http://localhost:9000" : "");
};

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = getDefaultBaseUrl().replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function slugFromName(name) {
  return titleToHandle(name || "");
}

// Products link to categories via product.category_id OR via linked collection
function getProductCollectionIds(product) {
  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  if (Array.isArray(meta.collection_ids)) return meta.collection_ids.filter(Boolean).map(String);
  if (meta.collection_id != null) return [String(meta.collection_id)];
  if (product?.collection_id != null) return [String(product.collection_id)];
  return [];
}

function isProductInCollection(product, collectionId) {
  if (!collectionId) return false;
  return getProductCollectionIds(product).includes(String(collectionId));
}

function isProductInCategory(product, categoryId, linkedCollectionId) {
  if (!categoryId) return false;
  // Direct category_id match
  if (product?.category_id && String(product.category_id) === String(categoryId)) return true;
  // Via linked collection
  if (linkedCollectionId && isProductInCollection(product, linkedCollectionId)) return true;
  return false;
}

export default function CategoryEditPage({ category: initialCategory, onReload }) {
  const router = useRouter();
  const client = getMedusaAdminClient();
  const [category, setCategory] = useState(initialCategory ?? null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [allCategories, setAllCategories] = useState([]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [mainImgPickerOpen, setMainImgPickerOpen] = useState(false);
  const [bannerImgPickerOpen, setBannerImgPickerOpen] = useState(false);

  const meta = (initialCategory?.metadata && typeof initialCategory.metadata === "object") ? initialCategory.metadata : {};
  const linkedCollectionId = meta.collection_id || null;

  const [form, setForm] = useState({
    name: initialCategory?.name ?? "",
    slug: initialCategory?.slug ?? "",
    description: initialCategory?.description ?? "",
    parent_id: initialCategory?.parent_id ?? "",
    active: initialCategory?.active !== false,
    is_visible: initialCategory?.is_visible !== false,
    meta_title: meta.meta_title ?? "",
    meta_description: meta.meta_description ?? "",
    keywords: meta.keywords ?? "",
    image_url: meta.image_url ?? initialCategory?.image_url ?? "",
    banner_image_url: meta.banner_image_url ?? initialCategory?.banner_image_url ?? "",
  });

  const initialFormRef = useRef(JSON.parse(JSON.stringify({
    name: initialCategory?.name ?? "",
    slug: initialCategory?.slug ?? "",
    description: initialCategory?.description ?? "",
    parent_id: initialCategory?.parent_id ?? "",
    active: initialCategory?.active !== false,
    is_visible: initialCategory?.is_visible !== false,
    meta_title: meta.meta_title ?? "",
    meta_description: meta.meta_description ?? "",
    keywords: meta.keywords ?? "",
    image_url: meta.image_url ?? initialCategory?.image_url ?? "",
    banner_image_url: meta.banner_image_url ?? initialCategory?.banner_image_url ?? "",
  })));

  const [categoryProducts, setCategoryProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [addingProductId, setAddingProductId] = useState(null);
  const [removingProductId, setRemovingProductId] = useState(null);
  const [addProductSearch, setAddProductSearch] = useState("");
  const unsaved = useUnsavedChanges();

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
  }, [isDirty, unsaved]);

  // Load categories for parent selector
  useEffect(() => {
    client.getAdminHubCategories({ all: true })
      .then((r) => setAllCategories((r.categories || []).filter((c) => c.id !== initialCategory?.id)))
      .catch(() => setAllCategories([]));
  }, []);

  // Load products
  useEffect(() => {
    if (!initialCategory?.id) return;
    client.getAdminHubProducts({ limit: 500 }).then((r) => {
      const list = (r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
      setAllProducts(list);
      setCategoryProducts(list.filter((p) => isProductInCategory(p, initialCategory.id, linkedCollectionId)));
    }).catch(() => { setAllProducts([]); setCategoryProducts([]); });
  }, [initialCategory?.id, linkedCollectionId]);

  const refreshProducts = useCallback(async () => {
    const r = await client.getAdminHubProducts({ limit: 500 });
    const list = (r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
    setAllProducts(list);
    setCategoryProducts(list.filter((p) => isProductInCategory(p, initialCategory.id, linkedCollectionId)));
  }, [initialCategory?.id, linkedCollectionId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await client.updateAdminHubCategory(initialCategory.id, {
        name: form.name,
        slug: form.slug,
        description: form.description,
        parent_id: form.parent_id || null,
        active: form.active,
        is_visible: form.is_visible,
        metadata: {
          ...(initialCategory.metadata || {}),
          meta_title: form.meta_title || null,
          meta_description: form.meta_description || null,
          keywords: form.keywords || null,
          image_url: form.image_url || null,
          banner_image_url: form.banner_image_url || null,
        },
      });
      initialFormRef.current = JSON.parse(JSON.stringify(form));
      unsaved?.setDirty(false);
      if (onReload) await onReload();
    } catch (e) {
      setError(e?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const addProductToCategory = async (productId) => {
    if (!productId) return;
    setAddingProductId(productId);
    try {
      const existing = await client.getAdminHubProduct(productId);
      if (linkedCollectionId) {
        // Add to linked collection
        const existingIds = getProductCollectionIds(existing);
        const nextIds = Array.from(new Set([...existingIds, String(linkedCollectionId)]));
        await client.updateAdminHubProduct(productId, {
          metadata: { ...(existing?.metadata || {}), collection_ids: nextIds },
          collection_id: nextIds[0] || null,
        });
      } else {
        // Direct category link
        await client.updateAdminHubProduct(productId, {
          category_id: String(initialCategory.id),
        });
      }
      setAddProductSearch("");
      await refreshProducts();
    } catch (e) {
      setError(e?.message || "Failed to add product");
    } finally {
      setAddingProductId(null);
    }
  };

  const removeProductFromCategory = async (productId) => {
    if (!productId) return;
    setRemovingProductId(productId);
    try {
      const existing = await client.getAdminHubProduct(productId);
      if (linkedCollectionId) {
        const existingIds = getProductCollectionIds(existing);
        const nextIds = existingIds.filter((id) => String(id) !== String(linkedCollectionId));
        await client.updateAdminHubProduct(productId, {
          metadata: { ...(existing?.metadata || {}), collection_ids: nextIds },
          collection_id: nextIds[0] || null,
        });
      } else {
        await client.updateAdminHubProduct(productId, { category_id: null });
      }
      await refreshProducts();
    } catch (e) {
      setError(e?.message || "Failed to remove product");
    } finally {
      setRemovingProductId(null);
    }
  };

  const inCategoryIds = new Set((categoryProducts || []).map((p) => p.id));
  const filteredAddProducts = (allProducts || [])
    .filter((p) => !inCategoryIds.has(p.id))
    .filter((p) => !addProductSearch || (p.title || "").toLowerCase().includes(addProductSearch.toLowerCase()));

  const parentOptions = [
    { label: "— No parent (root) —", value: "" },
    ...allCategories.map((c) => ({ label: c.name, value: String(c.id) })),
  ];

  return (
    <Page
      backAction={{ content: "Categories", url: "/content/categories" }}
      title={form.name || initialCategory?.name || "Category"}
      subtitle={`/${form.slug || initialCategory?.slug || ""}`}
      primaryAction={{ content: "Save", onAction: handleSave, loading: saving, disabled: saving || !isDirty }}
      secondaryActions={[{ content: "Discard", onAction: () => { setForm({ ...initialFormRef.current }); unsaved?.setDirty(false); }, disabled: !isDirty }]}
    >
      {error && (
        <Box paddingBlockEnd="400">
          <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
        </Box>
      )}

      <Layout>
        {/* Left column — main fields */}
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Category details</Text>
                <TextField
                  label="Name"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v, slug: slugManuallyEdited ? p.slug : slugFromName(v) }))}
                  autoComplete="off"
                />
                <TextField
                  label="Slug"
                  value={form.slug}
                  onChange={(v) => { setSlugManuallyEdited(true); setForm((p) => ({ ...p, slug: v })); }}
                  autoComplete="off"
                  prefix="/"
                  helpText="Used in the shop URL"
                />
                <TextField
                  label="Description"
                  value={form.description}
                  onChange={(v) => setForm((p) => ({ ...p, description: v }))}
                  multiline={3}
                  autoComplete="off"
                />
                <Select
                  label="Parent category"
                  options={parentOptions}
                  value={form.parent_id || ""}
                  onChange={(v) => setForm((p) => ({ ...p, parent_id: v }))}
                />
              </BlockStack>
            </Card>

            {/* SEO */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">SEO</Text>
                <TextField label="Meta title" value={form.meta_title} onChange={(v) => setForm((p) => ({ ...p, meta_title: v }))} autoComplete="off" helpText={`${form.meta_title.length}/60`} />
                <TextField label="Meta description" value={form.meta_description} onChange={(v) => setForm((p) => ({ ...p, meta_description: v }))} multiline={2} autoComplete="off" helpText={`${form.meta_description.length}/160`} />
                <TextField label="Keywords" value={form.keywords} onChange={(v) => setForm((p) => ({ ...p, keywords: v }))} autoComplete="off" helpText="Comma separated" />
              </BlockStack>
            </Card>

            {/* Products */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Products <Text as="span" tone="subdued" variant="bodySm">({categoryProducts.length})</Text>
                  </Text>
                </InlineStack>

                {/* Add product search */}
                <TextField
                  label=""
                  labelHidden
                  placeholder="Search products to add…"
                  value={addProductSearch}
                  onChange={setAddProductSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setAddProductSearch("")}
                />
                {addProductSearch && filteredAddProducts.length > 0 && (
                  <div style={{ border: "1px solid #e1e3e5", borderRadius: 8, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
                    {filteredAddProducts.slice(0, 10).map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #f1f1f1" }}>
                        {p.thumbnail ? (
                          <Thumbnail source={resolveImageUrl(p.thumbnail)} alt={p.title} size="small" />
                        ) : (
                          <div style={{ width: 40, height: 40, background: "#f4f6f8", borderRadius: 4, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text as="p" variant="bodyMd" fontWeight="medium" truncate>{p.title}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.handle}</Text>
                        </div>
                        <Button
                          size="slim"
                          onClick={() => addProductToCategory(p.id)}
                          loading={addingProductId === p.id}
                          disabled={!!addingProductId}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Divider />

                {categoryProducts.length === 0 ? (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" tone="subdued" alignment="center">No products in this category</Text>
                  </Box>
                ) : (
                  <BlockStack gap="200">
                    {categoryProducts.map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f1f1" }}>
                        {p.thumbnail ? (
                          <Thumbnail source={resolveImageUrl(p.thumbnail)} alt={p.title} size="small" />
                        ) : (
                          <div style={{ width: 40, height: 40, background: "#f4f6f8", borderRadius: 4, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text as="p" variant="bodyMd" fontWeight="medium" truncate>{p.title}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.handle}</Text>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          {p.status && (
                            <Badge tone={p.status === "published" ? "success" : "attention"}>
                              {p.status}
                            </Badge>
                          )}
                          <Button
                            size="slim"
                            variant="plain"
                            tone="critical"
                            onClick={() => removeProductFromCategory(p.id)}
                            loading={removingProductId === p.id}
                            disabled={!!removingProductId}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right column — status + images */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Status</Text>
                <Checkbox
                  label="Active"
                  checked={form.active}
                  onChange={(v) => setForm((p) => ({ ...p, active: v }))}
                />
                <Checkbox
                  label="Visible in shop"
                  checked={form.is_visible}
                  onChange={(v) => setForm((p) => ({ ...p, is_visible: v }))}
                />
                {initialCategory?.has_collection && (
                  <Badge tone="success">Linked collection</Badge>
                )}
              </BlockStack>
            </Card>

            {/* Main image */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Category image</Text>
                {form.image_url ? (
                  <div style={{ position: "relative" }}>
                    <img
                      src={resolveImageUrl(form.image_url)}
                      alt="Category"
                      style={{ width: "100%", borderRadius: 8, objectFit: "cover", maxHeight: 180 }}
                    />
                    <Button
                      size="slim"
                      variant="plain"
                      tone="critical"
                      onClick={() => setForm((p) => ({ ...p, image_url: "" }))}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                <Button onClick={() => setMainImgPickerOpen(true)}>
                  {form.image_url ? "Change image" : "Add image"}
                </Button>
              </BlockStack>
            </Card>

            {/* Banner image */}
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Banner image</Text>
                {form.banner_image_url ? (
                  <div>
                    <img
                      src={resolveImageUrl(form.banner_image_url)}
                      alt="Banner"
                      style={{ width: "100%", borderRadius: 8, objectFit: "cover", maxHeight: 120 }}
                    />
                    <Button
                      size="slim"
                      variant="plain"
                      tone="critical"
                      onClick={() => setForm((p) => ({ ...p, banner_image_url: "" }))}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                <Button onClick={() => setBannerImgPickerOpen(true)}>
                  {form.banner_image_url ? "Change banner" : "Add banner"}
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <MediaPickerModal
        open={mainImgPickerOpen}
        onClose={() => setMainImgPickerOpen(false)}
        onSelect={(url) => { setForm((p) => ({ ...p, image_url: url })); setMainImgPickerOpen(false); }}
      />
      <MediaPickerModal
        open={bannerImgPickerOpen}
        onClose={() => setBannerImgPickerOpen(false)}
        onSelect={(url) => { setForm((p) => ({ ...p, banner_image_url: url })); setBannerImgPickerOpen(false); }}
      />
    </Page>
  );
}
