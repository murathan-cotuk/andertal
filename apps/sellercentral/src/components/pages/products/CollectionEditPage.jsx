"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  Select,
  DropZone,
  Button,
  Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  return url || (typeof window !== "undefined" ? "http://localhost:9000" : "");
};

function descriptionVisualToHtml(html) {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(p|div|h[1-6]|ul|ol|li)\b/i.test(s)) return s;
  return "<p>" + s + "</p>";
}

const META_TITLE_MAX = 60;
const META_DESC_MAX = 160;

function slugFromTitle(title) {
  return titleToHandle(title || "");
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

export default function CollectionEditPage({ collection: initialCollection, isNew, onReload }) {
  const router = useRouter();
  const client = getMedusaAdminClient();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");
  const [collection, setCollection] = useState(initialCollection ?? null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [richtextMode, setRichtextMode] = useState("visual");
  const richtextEditorRef = useRef(null);

  const [form, setForm] = useState({
    title: "",
    handle: "",
    category_id: "",
    display_title: "",
    meta_title: "",
    meta_description: "",
    keywords: "",
    richtext: "",
    image_url: "",
    banner_image_url: "",
    recommended_product_ids: [],
  });
  const [collectionProducts, setCollectionProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [addingProductId, setAddingProductId] = useState(null);
  const [removingProductId, setRemovingProductId] = useState(null);
  const [addProductSelectValue, setAddProductSelectValue] = useState("");
  const initialFormRef = useRef(null);
  const unsaved = useUnsavedChanges();

  useEffect(() => {
    if (initialCollection) {
      setCollection(initialCollection);
      const nextForm = {
        title: initialCollection.title ?? "",
        handle: initialCollection.handle ?? "",
        category_id: "",
        display_title: initialCollection.display_title ?? initialCollection.title ?? "",
        meta_title: initialCollection.meta_title ?? "",
        meta_description: initialCollection.meta_description ?? "",
        keywords: initialCollection.keywords ?? "",
        richtext: initialCollection.richtext ?? initialCollection.description_html ?? "",
        image_url: initialCollection.image_url ?? "",
        banner_image_url: initialCollection.banner_image_url ?? "",
        recommended_product_ids: Array.isArray(initialCollection.recommended_product_ids) ? initialCollection.recommended_product_ids : [],
      };
      setForm((prev) => ({ ...prev, ...nextForm }));
      initialFormRef.current = nextForm;
    } else if (isNew) {
      const empty = { title: "", handle: "", category_id: "", display_title: "", meta_title: "", meta_description: "", keywords: "", richtext: "", image_url: "", banner_image_url: "", recommended_product_ids: [] };
      initialFormRef.current = empty;
    }
  }, [initialCollection, isNew]);

  const isDirty = initialFormRef.current != null && JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const handleDiscard = useCallback(() => {
    if (initialFormRef.current) setForm({ ...initialFormRef.current });
    setCollection(initialCollection ?? null);
    setError(null);
    unsaved?.setDirty(false);
  }, [initialCollection, unsaved]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
  }, [isDirty, unsaved]);

  useEffect(() => {
    if (richtextMode === "visual" && richtextEditorRef.current) richtextEditorRef.current.innerHTML = form.richtext || "";
  }, [richtextMode, form.richtext]);

  const handleMainImageDrop = useCallback(
    (files) => {
      setMediaUploading(true);
      const file = Array.isArray(files) ? files[0] : files;
      if (!file) return setMediaUploading(false);
      const fd = new FormData();
      fd.append("file", file);
      client
        .uploadMedia(fd)
        .then((r) => {
          // Store relative path so the URL works across different backend deployments.
          const url = r?.url || null;
          if (url) setForm((prev) => ({ ...prev, image_url: url }));
        })
        .catch(() => setError("Upload failed"))
        .finally(() => setMediaUploading(false));
    },
    [client, baseUrl]
  );
  const handleBannerImageDrop = useCallback(
    (files) => {
      setMediaUploading(true);
      const file = Array.isArray(files) ? files[0] : files;
      if (!file) return setMediaUploading(false);
      const fd = new FormData();
      fd.append("file", file);
      client
        .uploadMedia(fd)
        .then((r) => {
          const url = r?.url || null;
          if (url) setForm((prev) => ({ ...prev, banner_image_url: url }));
        })
        .catch(() => setError("Upload failed"))
        .finally(() => setMediaUploading(false));
    },
    [client, baseUrl]
  );

  useEffect(() => {
    client.getAdminHubCategories({ all: true }).then((r) => setCategories(r.categories || [])).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!collection?.id) {
      setCollectionProducts([]);
      return;
    }
    client.getAdminHubProducts({ collection_id: collection.id }).then((r) => {
      const list = (r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
      setCollectionProducts(list);
    }).catch(() => setCollectionProducts([]));
  }, [collection?.id, client]);

  useEffect(() => {
    if (!collection?.id) return;
    client.getAdminHubProducts({ limit: 200 }).then((r) => {
      const list = (r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
      setAllProducts(list);
    }).catch(() => setAllProducts([]));
  }, [collection?.id, client]);

  const addProductToCollection = async (productId) => {
    if (!collection?.id || !productId) return;
    setAddingProductId(productId);
    try {
      await client.updateAdminHubProduct(productId, { collection_id: collection.id });
      const r = await client.getAdminHubProducts({ collection_id: collection.id });
      setCollectionProducts((r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft"));
      const all = await client.getAdminHubProducts({ limit: 200 });
      setAllProducts((all.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft"));
      setAddProductSelectValue("");
    } catch (e) {
      setError(e?.message || "Failed to add product to collection");
    } finally {
      setAddingProductId(null);
    }
  };

  const removeProductFromCollection = async (productId) => {
    if (!productId) return;
    setRemovingProductId(productId);
    try {
      await client.updateAdminHubProduct(productId, { collection_id: null });
      const r = await client.getAdminHubProducts({ collection_id: collection?.id });
      setCollectionProducts((r.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft"));
      const all = await client.getAdminHubProducts({ limit: 200 });
      setAllProducts((all.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft"));
    } catch (e) {
      setError(e?.message || "Failed to remove product from collection");
    } finally {
      setRemovingProductId(null);
    }
  };

  const inCollectionIds = new Set((collectionProducts || []).map((p) => p.id));
  const productsNotInCollection = (allProducts || []).filter((p) => !inCollectionIds.has(p.id));

  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      handle: slugManuallyEdited ? prev.handle : slugFromTitle(value),
      display_title: prev.display_title === (prev.title || "") ? value : prev.display_title,
    }));
  };

  const handleSave = async () => {
    const title = (form.title || "").trim();
    const handle = (form.handle || "").trim() || slugFromTitle(title);
    if (!title) {
      setError("Title is required.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (isNew) {
        const created = await client.createCollection({
          title,
          handle: handle || slugFromTitle(title),
          standalone: true,
          ...(form.category_id && { category_id: form.category_id }),
        });
        if (created?.id) {
          await client.updateCollection(created.id, {
            title,
            handle: handle || slugFromTitle(title),
            display_title: form.display_title,
            meta_title: form.meta_title,
            meta_description: form.meta_description,
            keywords: form.keywords,
            richtext: form.richtext,
            image_url: form.image_url,
            banner_image_url: form.banner_image_url,
            recommended_product_ids: form.recommended_product_ids || [],
          });
          router.replace(`/products/collections/${created.id}`);
        } else {
          await (onReload?.() ?? Promise.resolve());
        }
      } else if (collection?.id) {
        await client.updateCollection(collection.id, {
          title,
          handle: handle || slugFromTitle(title),
          ...(form.category_id !== undefined && { category_id: form.category_id || undefined }),
          display_title: form.display_title,
          meta_title: form.meta_title,
          meta_description: form.meta_description,
          keywords: form.keywords,
          richtext: form.richtext,
          image_url: form.image_url,
          banner_image_url: form.banner_image_url,
          recommended_product_ids: form.recommended_product_ids,
        });
        const updated = await client.getCollection(collection.id);
        if (updated) {
          setCollection(updated);
          const nextForm = {
            title: form.title,
            handle: form.handle,
            category_id: form.category_id,
            display_title: updated.display_title ?? form.display_title,
            meta_title: updated.meta_title ?? form.meta_title,
            meta_description: updated.meta_description ?? form.meta_description,
            keywords: updated.keywords ?? form.keywords,
            richtext: updated.richtext ?? updated.description_html ?? form.richtext,
            image_url: updated.image_url ?? form.image_url,
            banner_image_url: updated.banner_image_url ?? form.banner_image_url,
            recommended_product_ids: Array.isArray(updated.recommended_product_ids) ? updated.recommended_product_ids : form.recommended_product_ids,
          };
          setForm((prev) => ({ ...prev, ...nextForm }));
          initialFormRef.current = nextForm;
        }
        onReload?.();
        unsaved?.setDirty(false);
      }
    } catch (err) {
      setError(err?.message || (isNew ? "Failed to create collection" : "Failed to update collection"));
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(handleSave);
  const discardRef = useRef(handleDiscard);
  saveRef.current = handleSave;
  discardRef.current = handleDiscard;
  useEffect(() => {
    if (!unsaved) return;
    unsaved.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      unsaved.clearHandlers();
      unsaved.setDirty(false);
    };
  }, [unsaved]);

  const categoryOptions = [
    { label: "— None —", value: "" },
    ...flattenTree(buildTree(categories)).map((c) => ({
      label: (c._level ? "  ".repeat(c._level) + "↳ " : "") + (c.name || c.slug || c.id),
      value: c.id,
    })),
  ];

  return (
    <Page
      title={isNew ? "New collection" : (collection?.title || "Edit collection")}
      backAction={{ content: "Collections", onAction: () => router.push("/products/collections") }}
      primaryAction={{
        content: saving ? "Saving…" : mediaUploading ? "Uploading…" : "Save",
        onAction: handleSave,
        loading: saving,
        disabled: mediaUploading,
      }}
    >
      <style>{`
        .collection-richtext-editor { color: var(--p-color-text); }
        .collection-richtext-editor h1 { font-size: 1.75rem; font-weight: 700; margin: 0.75em 0 0.35em; line-height: 1.3; }
        .collection-richtext-editor h2 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.35em; line-height: 1.3; }
        .collection-richtext-editor h3 { font-size: 1.25rem; font-weight: 600; margin: 0.6em 0 0.3em; line-height: 1.35; }
        .collection-richtext-editor h4, .collection-richtext-editor h5, .collection-richtext-editor h6 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; line-height: 1.4; }
        .collection-richtext-editor h1:first-child, .collection-richtext-editor h2:first-child, .collection-richtext-editor h3:first-child { margin-top: 0; }
        .collection-richtext-editor p { margin: 0 0 0.6em; }
        .collection-richtext-editor p:last-child { margin-bottom: 0; }
        .collection-richtext-editor ul, .collection-richtext-editor ol { margin: 0.4em 0 0.8em 1.5em; padding-left: 1.5em; }
        .collection-richtext-editor ul { list-style-type: disc; }
        .collection-richtext-editor ol { list-style-type: decimal; }
        .collection-richtext-editor li { margin-bottom: 0.25em; }
        .collection-richtext-editor strong { font-weight: 600; }
        .collection-richtext-editor blockquote { margin: 0.75em 0; padding-left: 1em; border-left: 4px solid var(--p-color-border); color: var(--p-color-text-subdued); }
      `}</style>
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
                Basic
              </Text>
              <TextField
                label="Collection name"
                value={form.title}
                onChange={handleTitleChange}
                placeholder="e.g. Summer Sale"
                autoComplete="off"
                helpText="Used in menus and admin."
              />
              <TextField
                label="Handle (URL slug)"
                value={form.handle}
                onChange={(value) => {
                  setSlugManuallyEdited(true);
                  setForm((prev) => ({ ...prev, handle: value }));
                }}
                placeholder="e.g. summer-sale"
                autoComplete="off"
                helpText="URL: /collections/[handle]"
              />
              <Select
                label="Link to category (optional)"
                options={categoryOptions}
                value={form.category_id}
                onChange={(value) => setForm((prev) => ({ ...prev, category_id: value }))}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
        {!isNew && collection?.id && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingSm">Products in this collection</Text>
                <p style={{ margin: 0, fontSize: 14, color: "var(--p-color-text-subdued)" }}>
                  Products assigned to this collection (image, SKU, name, price, quantity).
                </p>
                {collectionProducts.length === 0 ? (
                  <Text as="p" tone="subdued">No products in this collection. Add products below or assign from the product edit page.</Text>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--p-color-border)", textAlign: "left" }}>
                          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Image</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600 }}>SKU</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Name</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Price</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600 }}>Qty</th>
                          <th style={{ padding: "8px 12px", fontWeight: 600, width: 100 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectionProducts.map((p) => {
                          const media = (p.metadata && p.metadata.media) ? (Array.isArray(p.metadata.media) ? p.metadata.media[0] : p.metadata.media) : null;
                          const imgUrl = typeof media === "string" ? media : (media && media.url) ? media.url : null;
                          const price = p.price != null ? p.price : (p.price_cents != null ? p.price_cents / 100 : 0);
                          const qty = p.inventory != null ? p.inventory : 0;
                          return (
                            <tr key={p.id} style={{ borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                              <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                                {imgUrl ? (
                                  <img src={imgUrl.startsWith("http") || imgUrl.startsWith("data:") ? imgUrl : `${baseUrl}${imgUrl}`} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                                ) : (
                                  <div style={{ width: 48, height: 48, background: "var(--p-color-bg-fill-secondary)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--p-color-text-subdued)", fontSize: 12 }}>—</div>
                                )}
                              </td>
                              <td style={{ padding: "8px 12px" }}>{p.sku || "—"}</td>
                              <td style={{ padding: "8px 12px" }}>
                                <Link href={`/products/${p.id}`} style={{ fontWeight: 500, color: "inherit" }}>{p.title || p.handle || p.id}</Link>
                              </td>
                              <td style={{ padding: "8px 12px" }}>{typeof price === "number" ? (price % 1 === 0 ? price : price.toFixed(2)) : price} €</td>
                              <td style={{ padding: "8px 12px" }}>{qty}</td>
                              <td style={{ padding: "8px 12px" }}>
                                <Button size="slim" tone="critical" variant="plain" onClick={() => removeProductFromCollection(p.id)} loading={removingProductId === p.id}>Remove</Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <Select
                    label="Add product"
                    labelHidden
                    options={[
                      { label: "— Select product to add —", value: "" },
                      ...productsNotInCollection.map((p) => ({ label: p.title || p.handle || p.sku || p.id, value: p.id })),
                    ]}
                    value={addProductSelectValue}
                    onChange={(value) => {
                      setAddProductSelectValue(value);
                      if (value) addProductToCollection(value);
                    }}
                  />
                </div>
                <Divider />
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Önerilen ürünler (shop sayfasında gösterilir)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Koleksiyon sayfasında &quot;Önerilen ürünler&quot; olarak gösterilecek ürünleri seçin.</Text>
                  <Select
                    label=""
                    labelHidden
                    options={[
                      { label: "— Ürün ekle —", value: "" },
                      ...(allProducts || []).filter((p) => !(form.recommended_product_ids || []).includes(p.id)).map((p) => ({ label: p.title || p.handle || p.sku || p.id, value: p.id })),
                    ]}
                    value=""
                    onChange={(value) => {
                      if (value) setForm((prev) => ({ ...prev, recommended_product_ids: [...(prev.recommended_product_ids || []), value] }));
                    }}
                  />
                  {(form.recommended_product_ids || []).length > 0 && (
                    <InlineStack gap="100" wrap>
                      {(form.recommended_product_ids || []).map((id) => {
                        const p = (allProducts || []).find((x) => x.id === id);
                        const label = p ? (p.title || p.handle || id) : id;
                        return (
                          <span
                            key={id}
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "var(--p-color-bg-fill-secondary)", borderRadius: 6, fontSize: 12, color: "var(--p-color-text-subdued)" }}
                          >
                            {String(label).slice(0, 35)}{String(label).length > 35 ? "…" : ""}
                            <button type="button" onClick={() => setForm((prev) => ({ ...prev, recommended_product_ids: (prev.recommended_product_ids || []).filter((x) => x !== id) }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }} aria-label="Kaldır">×</button>
                          </span>
                        );
                      })}
                    </InlineStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">Shop page</Text>
              <TextField
                label="Display title (h1 on collection page)"
                value={form.display_title}
                onChange={(value) => setForm((prev) => ({ ...prev, display_title: value }))}
                placeholder="Same as collection name if empty"
                autoComplete="off"
              />
              <Text as="p" variant="bodySm" fontWeight="medium">Main image (menus, dropdown)</Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                {form.image_url ? (
                  <div style={{ width: 100, aspectRatio: 1, borderRadius: 8, overflow: "hidden", background: "var(--p-color-bg-fill-secondary)", position: "relative" }}>
                    <img src={form.image_url.startsWith("http") || form.image_url.startsWith("data:") ? form.image_url : `${baseUrl}${form.image_url}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button type="button" onClick={() => setForm((prev) => ({ ...prev, image_url: "" }))} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, border: "none", borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", cursor: "pointer", fontSize: 14 }} aria-label="Remove">×</button>
                  </div>
                ) : null}
                {!form.image_url && (
                  <DropZone accept="image/*" type="image" onDropAccepted={handleMainImageDrop} allowMultiple={false}>
                    <div style={{ width: 100, aspectRatio: 1, borderRadius: 8, border: "2px dashed var(--p-color-border)", background: "var(--p-color-bg-fill-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <span style={{ fontSize: 24, color: "var(--p-color-icon)" }}>+</span>
                    </div>
                  </DropZone>
                )}
              </div>
              <Text as="p" variant="bodySm" fontWeight="medium">Banner image (1920×300 px, full-width)</Text>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                {form.banner_image_url ? (
                  <div style={{ maxWidth: 320, height: 50, borderRadius: 8, overflow: "hidden", background: "var(--p-color-bg-fill-secondary)", position: "relative" }}>
                    <img src={form.banner_image_url.startsWith("http") || form.banner_image_url.startsWith("data:") ? form.banner_image_url : `${baseUrl}${form.banner_image_url}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button type="button" onClick={() => setForm((prev) => ({ ...prev, banner_image_url: "" }))} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, border: "none", borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", cursor: "pointer", fontSize: 14 }} aria-label="Remove">×</button>
                  </div>
                ) : null}
                {!form.banner_image_url && (
                  <DropZone accept="image/*" type="image" onDropAccepted={handleBannerImageDrop} allowMultiple={false}>
                    <div style={{ width: 200, height: 50, borderRadius: 8, border: "2px dashed var(--p-color-border)", background: "var(--p-color-bg-fill-secondary)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <span style={{ fontSize: 18, color: "var(--p-color-icon)" }}>+ Banner</span>
                    </div>
                  </DropZone>
                )}
              </div>
              {mediaUploading && <Text as="p" variant="bodySm" tone="subdued">Uploading…</Text>}
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="medium">Richtext (below products on collection page)</Text>
                <div className="collection-description-box" style={{ border: "1px solid var(--p-color-border)", borderRadius: 12, overflow: "hidden", background: "var(--p-color-bg-surface)" }}>
                  <div className="collection-description-toolbar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--p-color-bg-surface-secondary)", borderBottom: "1px solid var(--p-color-border)" }}>
                    {richtextMode === "visual" && (
                      <>
                        <button type="button" className="collection-desc-btn" style={{ width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent", color: "var(--p-color-text-subdued)" }} onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }} title="Bold">B</button>
                        <button type="button" className="collection-desc-btn" style={{ width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent", color: "var(--p-color-text-subdued)" }} onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }} title="Italic">I</button>
                        <button type="button" className="collection-desc-btn" style={{ width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: "transparent", color: "var(--p-color-text-subdued)" }} onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList"); }} title="List">•</button>
                      </>
                    )}
                    <button type="button" style={{ marginLeft: 8, width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer", background: richtextMode === "html" ? "var(--p-color-bg-surface-selected)" : "transparent", color: "var(--p-color-text-subdued)" }} onClick={() => { if (richtextMode === "visual" && richtextEditorRef.current) setForm((prev) => ({ ...prev, richtext: descriptionVisualToHtml(richtextEditorRef.current.innerHTML || "") })); else if (richtextMode !== "visual" && richtextEditorRef.current) richtextEditorRef.current.innerHTML = form.richtext || ""; setRichtextMode(richtextMode === "html" ? "visual" : "html"); }} title="HTML">{"</>"}</button>
                  </div>
                  {richtextMode === "html" ? (
                    <textarea style={{ minHeight: 160, width: "100%", padding: 16, fontFamily: "ui-monospace, monospace", fontSize: 13, border: "none", resize: "vertical", boxSizing: "border-box" }} value={form.richtext || ""} onChange={(e) => setForm((prev) => ({ ...prev, richtext: e.target.value }))} placeholder="<h2>Heading</h2><p>…</p>" />
                  ) : (
                    <div ref={richtextEditorRef} className="collection-richtext-editor" contentEditable suppressContentEditableWarning style={{ minHeight: 160, padding: 16, outline: "none", fontSize: 14, lineHeight: 1.6 }} onBlur={() => { if (richtextEditorRef.current) setForm((prev) => ({ ...prev, richtext: descriptionVisualToHtml(richtextEditorRef.current.innerHTML || "") })); }} />
                  )}
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">SEO</Text>
              <Box position="relative">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text as="span" variant="bodySm" tone="subdued">Meta title</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{(form.meta_title || "").length} / {META_TITLE_MAX}</Text>
                </div>
                <TextField label="" labelHidden value={form.meta_title} onChange={(v) => setForm((prev) => ({ ...prev, meta_title: v.slice(0, META_TITLE_MAX) }))} placeholder="Meta title" autoComplete="off" />
              </Box>
              <Box position="relative">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <Text as="span" variant="bodySm" tone="subdued">Meta description</Text>
                  <Text as="span" variant="bodySm" tone="subdued">{(form.meta_description || "").length} / {META_DESC_MAX}</Text>
                </div>
                <TextField label="" labelHidden value={form.meta_description} onChange={(v) => setForm((prev) => ({ ...prev, meta_description: v.slice(0, META_DESC_MAX) }))} placeholder="Meta description" multiline={2} autoComplete="off" />
              </Box>
              <TextField label="Keywords" value={form.keywords} onChange={(value) => setForm((prev) => ({ ...prev, keywords: value }))} placeholder="comma-separated" autoComplete="off" />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
