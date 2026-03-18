"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
  Divider,
  Modal,
  Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { formatDecimal } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";

const DEFAULT_DUPLICATE_OPTIONS = {
  title: true,
  description: true,
  price: true,
  inventory: false,
  categories: true,
  media: true,
  variants: true,
};

function stripSkuEanFromVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map((v) => {
    const { sku, ean, ...rest } = typeof v === "object" && v ? v : {};
    const out = { ...rest };
    out.sku = "";
    out.ean = undefined;
    if (Array.isArray(out.options)) {
      out.options = out.options.map((o) => {
        const opt = typeof o === "object" && o ? { ...o } : {};
        opt.sku = "";
        opt.ean = undefined;
        return opt;
      });
    }
    return out;
  });
}

function getLocalizedTitle(product, locale) {
  const tr = product.metadata?.translations;
  if (tr && tr[locale]?.title) return tr[locale].title;
  return product.title || "Untitled";
}

export default function InventoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateSourceId, setDuplicateSourceId] = useState(null);
  const [duplicateFullProduct, setDuplicateFullProduct] = useState(null);
  const [duplicateOptions, setDuplicateOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [duplicateSaving, setDuplicateSaving] = useState(false);
  const medusaClient = getMedusaAdminClient();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await medusaClient.getAdminHubProducts();
        setProducts(data.products || []);
      } catch (err) {
        setError(err?.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!duplicateModalOpen || !duplicateSourceId) {
      setDuplicateFullProduct(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await medusaClient.getAdminHubProduct(duplicateSourceId);
        if (!cancelled) setDuplicateFullProduct(p || null);
      } catch (e) {
        if (!cancelled) setDuplicateFullProduct(null);
      }
    })();
    return () => { cancelled = true; };
  }, [duplicateModalOpen, duplicateSourceId]);

  const openDuplicateModal = (product) => {
    setMenuOpenId(null);
    setDuplicateSourceId(product.id);
    setDuplicateOptions({ ...DEFAULT_DUPLICATE_OPTIONS });
    setDuplicateModalOpen(true);
  };

  const closeDuplicateModal = () => {
    setDuplicateModalOpen(false);
    setDuplicateSourceId(null);
    setDuplicateFullProduct(null);
  };

  const runDuplicate = async () => {
    const p = duplicateFullProduct;
    if (!p) return;
    setDuplicateSaving(true);
    try {
      const opt = duplicateOptions;
      const meta = (p.metadata && typeof p.metadata === "object") ? { ...p.metadata } : {};
      delete meta.ean;
      if (!opt.media) meta.media = undefined;
      if (!opt.categories) {
        meta.collection_ids = undefined;
        meta.collection_id = undefined;
      }
      const variants = opt.variants ? stripSkuEanFromVariants(p.variants) : [];
      const payload = {
        title: opt.title ? (p.title || "").trim() + " (Copy)" : "Untitled",
        handle: (p.title || p.handle || "product").toString().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50) + "-" + Date.now().toString(36),
        sku: "",
        description: opt.description ? (p.description || "") : "",
        status: "draft",
        price: opt.price && (p.price != null) ? Number(p.price) : 0,
        inventory: opt.inventory && (p.inventory != null) ? Number(p.inventory) : 0,
        metadata: meta,
        variants,
        ...(opt.categories && (p.collection_id != null) ? { collection_id: p.collection_id } : {}),
      };
      if (opt.categories && meta.collection_ids && Array.isArray(meta.collection_ids)) {
        payload.metadata = { ...payload.metadata, collection_ids: meta.collection_ids };
      }
      const created = await medusaClient.createAdminHubProduct(payload);
      closeDuplicateModal();
      if (created?.id) router.push(`/products/${created.handle || created.id}`);
    } catch (err) {
      setError(err?.message || "Duplicate failed");
    } finally {
      setDuplicateSaving(false);
    }
  };

  if (loading) {
    return (
      <Page title="Inventory">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <SkeletonDisplayText size="small" />
                <SkeletonBodyText lines={3} />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="Inventory"
      primaryAction={{
        content: "Add product",
        onAction: () => router.push("/products/new"),
      }}
      secondaryActions={[
        { content: "Bulk upload", url: "/products/bulk-upload" },
      ]}
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
                  All products
                </Text>
                <InlineStack gap="300" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {products.length} {products.length === 1 ? "product" : "products"}
                  </Text>
                  {selectedIds.length > 0 && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        // Şimdilik basitçe ilk seçili ürünü edit sayfasında açalım
                        const firstId = selectedIds[0];
                        if (firstId) {
                          const prod = products.find((p) => p.id === firstId);
                          router.push(`/products/${prod?.handle || firstId}`);
                        }
                      }}
                    >
                      Bulk edit ({selectedIds.length})
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
              <Divider />

              {products.length === 0 ? (
                <Box paddingBlock="400">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      No products yet. Add your first product to get started.
                    </Text>
                    <InlineStack gap="200">
                      <Button variant="primary" url="/products/new">
                        Add product
                      </Button>
                      <Button url="/products/bulk-upload">Bulk upload</Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              ) : (
                <BlockStack gap="200">
                  {products.map((product) => {
                    const meta = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
                    const media = meta.media;
                    const rawThumb = product.thumbnail ||
                      (Array.isArray(media) && media[0]
                        ? (typeof media[0] === "string" ? media[0] : (media[0]?.url || null))
                        : null) ||
                      (typeof media === "string" && media ? media : null);
                    const thumbUrl = rawThumb ? resolveImageUrl(rawThumb) : null;
                    const price = product.price != null ? Number(product.price) : (product.variants?.[0]?.prices?.[0]?.amount ? Number(product.variants[0].prices[0].amount) / 100 : 0);
                    const inv = product.inventory != null ? Number(product.inventory) : 0;
                    const sku = product.sku || "—";
                    return (
                      <Box
                        key={product.id}
                        padding="300"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack align="space-between" blockAlign="center" gap="400">
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(product.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                setSelectedIds((prev) =>
                                  e.target.checked
                                    ? [...prev, product.id]
                                    : prev.filter((id) => id !== product.id)
                                );
                              }}
                              style={{ marginRight: "8px" }}
                            />
                            <Box
                              minWidth="56px"
                              width="56px"
                              minHeight="56px"
                              height="56px"
                              background="bg-fill-secondary"
                              borderRadius="200"
                              overflow="hidden"
                            >
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt=""
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              ) : null}
                            </Box>
                            <BlockStack gap="100">
                              <Link
                                href={`/products/${product.handle || product.id}`}
                                style={{ textDecoration: "none", color: "inherit" }}
                              >
                                <Text as="p" variant="bodyMd" fontWeight="medium">
                                  {getLocalizedTitle(product, locale)}
                                </Text>
                              </Link>
                              <InlineStack gap="200" wrap>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  SKU: {sku}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  · Qty: {inv}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  · €{formatDecimal(price)}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  · {product.status || "draft"}
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Button
                              variant="tertiary"
                              onClick={() => router.push(`/products/${product.handle || product.id}`)}
                              icon={() => <span style={{ fontSize: "16px" }}>✏</span>}
                              accessibilityLabel="Edit product"
                            />
                            <Box position="relative">
                              <Button
                                variant="tertiary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenId((prev) => (prev === product.id ? null : product.id));
                                }}
                              >
                                ⋯
                              </Button>
                              {menuOpenId === product.id && (
                                <Box
                                  position="absolute"
                                  right="0"
                                  padding="200"
                                  background="bg-surface"
                                  borderRadius="200"
                                  shadow="300"
                                  style={{ zIndex: 10, minWidth: "140px" }}
                                >
                                  <BlockStack gap="100">
                                    <Button
                                      fullWidth
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDuplicateModal(product);
                                      }}
                                    >
                                      Duplicate
                                    </Button>
                                    <Button
                                      fullWidth
                                      tone="critical"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await medusaClient.deleteAdminHubProduct(product.id);
                                          setProducts((prev) => prev.filter((p) => p.id !== product.id));
                                          setSelectedIds((prev) => prev.filter((id) => id !== product.id));
                                        } catch (err) {
                                          console.error("Failed to delete product", err);
                                        } finally {
                                          setMenuOpenId(null);
                                        }
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </BlockStack>
                                </Box>
                              )}
                            </Box>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={duplicateModalOpen}
        onClose={closeDuplicateModal}
        title="Duplicate product"
        primaryAction={{
          content: "Create duplicate",
          onAction: runDuplicate,
          loading: duplicateSaving,
        }}
        secondaryActions={[{ content: "Cancel", onAction: closeDuplicateModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Choose what to copy into the new product. <strong>SKU and EAN are never copied</strong> and must be set for the new product.
            </Text>
            {!duplicateFullProduct ? (
              <InlineStack gap="200" blockAlign="center">
                <SkeletonBodyText lines={1} />
                <Text as="span" tone="subdued">Loading product…</Text>
              </InlineStack>
            ) : (
              <BlockStack gap="300">
                <Checkbox
                  label="Title (with “(Copy)” suffix)"
                  checked={duplicateOptions.title}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, title: v }))}
                />
                <Checkbox
                  label="Description"
                  checked={duplicateOptions.description}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, description: v }))}
                />
                <Checkbox
                  label="Price"
                  checked={duplicateOptions.price}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, price: v }))}
                />
                <Checkbox
                  label="Inventory quantity"
                  checked={duplicateOptions.inventory}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, inventory: v }))}
                />
                <Checkbox
                  label="Categories / collection"
                  checked={duplicateOptions.categories}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, categories: v }))}
                />
                <Checkbox
                  label="Images / media"
                  checked={duplicateOptions.media}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, media: v }))}
                />
                <Checkbox
                  label="Variants (option names and values; SKU/EAN never copied)"
                  checked={duplicateOptions.variants}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, variants: v }))}
                />
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
