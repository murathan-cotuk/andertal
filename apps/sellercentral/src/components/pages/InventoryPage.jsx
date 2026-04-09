"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  TextField,
  Select,
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

function isOwnInventoryProduct(product, mySellerId) {
  const s = String(product?.seller_id || "").trim();
  if (!s) return true;
  return s === String(mySellerId || "").trim();
}

function sortProductsList(list, locale, sortKey) {
  const arr = [...(list || [])];
  if (sortKey === "title_desc") {
    arr.sort((a, b) => getLocalizedTitle(b, locale).localeCompare(getLocalizedTitle(a, locale), undefined, { sensitivity: "base" }));
  } else if (sortKey === "created_desc") {
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else if (sortKey === "created_asc") {
    arr.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  } else {
    arr.sort((a, b) => getLocalizedTitle(a, locale).localeCompare(getLocalizedTitle(b, locale), undefined, { sensitivity: "base" }));
  }
  return arr;
}

function EditPencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M13.96 3.22a2.4 2.4 0 1 1 3.4 3.4l-9.1 9.11-3.7.3.3-3.7 9.1-9.11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12.33 4.85 3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getVariantLabel(v, locale) {
  if (!v) return "";
  // option_values array: each is { value, labels, ... }
  const opts = Array.isArray(v.option_values) ? v.option_values : [];
  if (opts.length === 0) return v.title || v.name || "";
  return opts.map((o) => {
    const label = (o.labels && (o.labels[locale] || o.labels["de"] || o.labels["en"])) || o.value || "";
    return label;
  }).filter(Boolean).join(" / ");
}

function InlineVariantEditor({ product, locale, medusaClient, setProducts }) {
  const matrixVariants = (product.variants || []).filter((v) => Array.isArray(v.option_values) && v.option_values.length > 0);
  const [drafts, setDrafts] = useState(() =>
    matrixVariants.map((v) => ({
      option_values: v.option_values,
      sku: v.sku || "",
      inventory: v.inventory != null ? String(v.inventory) : "0",
      price: v.price_cents != null ? String((v.price_cents / 100).toFixed(2)) : "",
    }))
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const setField = (idx, field, val) => {
    setDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
    setSavedMsg("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const updatedVariants = product.variants.map((v) => {
        if (!Array.isArray(v.option_values) || v.option_values.length === 0) return v;
        const draft = drafts.find((d) =>
          JSON.stringify(d.option_values) === JSON.stringify(v.option_values)
        );
        if (!draft) return v;
        return {
          ...v,
          sku: draft.sku,
          inventory: parseInt(draft.inventory, 10) || 0,
          price_cents: draft.price !== "" ? Math.round(parseFloat(draft.price) * 100) : v.price_cents,
        };
      });
      const updated = await medusaClient.updateAdminHubProduct(product.id, { variants: updatedVariants });
      if (updated) setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, variants: updatedVariants } : p));
      setSavedMsg("Gespeichert ✓");
    } catch (e) {
      setSavedMsg("Fehler: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (matrixVariants.length === 0) {
    return <div style={{ padding: "8px 12px", fontSize: 13, color: "#6b7280" }}>Keine Variationen</div>;
  }

  return (
    <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px", gap: "6px 12px", padding: "0 4px", marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Variante</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>SKU</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Bestand</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase" }}>Preis (€)</div>
      </div>
      {drafts.map((d, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px", gap: "6px 12px", alignItems: "center", padding: "4px 4px", borderRadius: 6, background: idx % 2 === 0 ? "#f9fafb" : "transparent" }}>
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
            {getVariantLabel(matrixVariants[idx], locale) || `Variante ${idx + 1}`}
          </div>
          <input
            type="text"
            value={d.sku}
            onChange={(e) => setField(idx, "sku", e.target.value)}
            placeholder="SKU"
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none" }}
          />
          <input
            type="number"
            min="0"
            value={d.inventory}
            onChange={(e) => setField(idx, "inventory", e.target.value)}
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none" }}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={d.price}
            onChange={(e) => setField(idx, "price", e.target.value)}
            placeholder="0.00"
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none" }}
          />
        </div>
      ))}
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ fontSize: 13, padding: "5px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
        {savedMsg && <span style={{ fontSize: 12, color: savedMsg.startsWith("Fehler") ? "#dc2626" : "#16a34a" }}>{savedMsg}</span>}
      </div>
    </div>
  );
}

function InventoryProductRow({
  product,
  locale,
  router,
  selectedIds,
  setSelectedIds,
  menuOpenId,
  setMenuOpenId,
  medusaClient,
  openDuplicateModal,
  setProducts,
}) {
  const [variantsOpen, setVariantsOpen] = useState(false);
  const meta = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const media = meta.media;
  const rawThumb =
    product.thumbnail ||
    (Array.isArray(media) && media[0]
      ? typeof media[0] === "string"
        ? media[0]
        : media[0]?.url || null
      : null) ||
    (typeof media === "string" && media ? media : null);
  const thumbUrl = rawThumb ? resolveImageUrl(rawThumb) : null;
  const price =
    product.price != null
      ? Number(product.price)
      : product.variants?.[0]?.prices?.[0]?.amount
        ? Number(product.variants[0].prices[0].amount) / 100
        : 0;
  const inv = product.inventory != null ? Number(product.inventory) : 0;
  const sku = product.sku || "—";
  const hasVariants = Array.isArray(product.variants) && product.variants.filter((v) => Array.isArray(v.option_values) && v.option_values.length > 0).length > 0;
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <input
            type="checkbox"
            checked={selectedIds.includes(product.id)}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedIds((prev) =>
                e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id)
              );
            }}
            style={{ marginRight: "8px" }}
          />
          <Box minWidth="56px" width="56px" minHeight="56px" height="56px" background="bg-fill-secondary" borderRadius="200" overflow="hidden">
            {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
          </Box>
          <BlockStack gap="100">
            <Link href={`/products/${product.id}`} style={{ textDecoration: "none", color: "inherit" }}>
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
              {hasVariants && (
                <button
                  type="button"
                  onClick={() => setVariantsOpen((v) => !v)}
                  style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 3 }}
                >
                  {variantsOpen ? "▲ Variationen" : "▼ Variationen"}
                </button>
              )}
            </InlineStack>
          </BlockStack>
        </InlineStack>
        <InlineStack gap="200" blockAlign="center">
          <Button
            variant="tertiary"
            onClick={() => router.push(`/products/${product.id}`)}
            icon={EditPencilIcon}
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
      {variantsOpen && hasVariants && (
        <InlineVariantEditor
          product={product}
          locale={locale}
          medusaClient={medusaClient}
          setProducts={setProducts}
        />
      )}
    </Box>
  );
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
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerId, setMySellerId] = useState("");
  const [sellerLabelById, setSellerLabelById] = useState({});
  const [sellerSearchFilter, setSellerSearchFilter] = useState("");
  const [inventorySort, setInventorySort] = useState("title_asc");
  const [sellerSectionsOpen, setSellerSectionsOpen] = useState({});
  const medusaClient = getMedusaAdminClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    setMySellerId(localStorage.getItem("sellerId") || "");
  }, []);

  useEffect(() => {
    if (!isSuperuser) return;
    medusaClient
      .getSellers()
      .then((d) => {
        const m = {};
        for (const s of d.sellers || []) {
          if (s.seller_id) m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
        }
        setSellerLabelById(m);
      })
      .catch(() => {});
  }, [isSuperuser, medusaClient]);

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

  const { ownProducts, sellerGroups } = useMemo(() => {
    const own = [];
    const g = new Map();
    for (const p of products) {
      if (isOwnInventoryProduct(p, mySellerId)) own.push(p);
      else {
        const sid = String(p.seller_id || "unknown");
        if (!g.has(sid)) g.set(sid, []);
        g.get(sid).push(p);
      }
    }
    const keys = [...g.keys()].sort((a, b) =>
      (sellerLabelById[a] || a).localeCompare(sellerLabelById[b] || b, undefined, { sensitivity: "base" })
    );
    return { ownProducts: own, sellerGroups: keys.map((k) => ({ sellerId: k, items: g.get(k) })) };
  }, [products, mySellerId, sellerLabelById]);

  const filteredSellerGroups = useMemo(() => {
    const q = sellerSearchFilter.trim().toLowerCase();
    if (!q) return sellerGroups;
    return sellerGroups.filter(({ sellerId }) => {
      const label = (sellerLabelById[sellerId] || sellerId || "").toLowerCase();
      return label.includes(q) || sellerId.toLowerCase().includes(q);
    });
  }, [sellerGroups, sellerSearchFilter, sellerLabelById]);

  const openDuplicateModal = (product) => {
    setMenuOpenId(null);
    setDuplicateSourceId(product.id);
    setDuplicateOptions({ ...DEFAULT_DUPLICATE_OPTIONS });
    setDuplicateModalOpen(true);
  };

  const renderRow = (product) => (
    <InventoryProductRow
      key={product.id}
      product={product}
      locale={locale}
      router={router}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      menuOpenId={menuOpenId}
      setMenuOpenId={setMenuOpenId}
      medusaClient={medusaClient}
      openDuplicateModal={openDuplicateModal}
      setProducts={setProducts}
    />
  );

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
      const origTitle = (p.title || "").trim();
      const payload = {
        title: opt.title ? origTitle : "Untitled",
        handle: (origTitle || p.handle || "produkt").toString().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50) + "-" + Date.now().toString(36),
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
      if (created?.id) router.push(`/products/${created.id}`);
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
          {isSuperuser && (
            <Box paddingBlockEnd="400">
              <InlineStack gap="400" blockAlign="center" wrap>
                <Box minWidth="200px">
                  <Select
                    label="Sortierung"
                    labelHidden
                    options={[
                      { label: "Name A–Z", value: "title_asc" },
                      { label: "Name Z–A", value: "title_desc" },
                      { label: "Neu zuerst", value: "created_desc" },
                      { label: "Älteste zuerst", value: "created_asc" },
                    ]}
                    value={inventorySort}
                    onChange={setInventorySort}
                  />
                </Box>
              </InlineStack>
            </Box>
          )}

          {!isSuperuser && (
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="h2" variant="headingSm">All products</Text>
                  <InlineStack gap="300" blockAlign="center" wrap>
                    <Box minWidth="200px">
                      <Select
                        label="Sortierung"
                        labelHidden
                        options={[
                          { label: "Name A–Z", value: "title_asc" },
                          { label: "Name Z–A", value: "title_desc" },
                          { label: "Neu zuerst", value: "created_desc" },
                          { label: "Älteste zuerst", value: "created_asc" },
                        ]}
                        value={inventorySort}
                        onChange={setInventorySort}
                      />
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {products.length} {products.length === 1 ? "product" : "products"}
                    </Text>
                    {selectedIds.length > 0 && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          const firstId = selectedIds[0];
                          if (firstId) {
                            const prod = products.find((p) => p.id === firstId);
                            router.push(`/products/${prod?.id || firstId}`);
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
                      <Text as="p" tone="subdued">No products yet. Add your first product to get started.</Text>
                      <InlineStack gap="200">
                        <Button variant="primary" url="/products/new">Add product</Button>
                        <Button url="/products/bulk-upload">Bulk upload</Button>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                ) : (
                  <BlockStack gap="200">
                    {sortProductsList(products, locale, inventorySort).map((product) => renderRow(product))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          )}

          {isSuperuser && (
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingSm">Ihr Superuser-Bereich</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Eigene Konto-Produkte und Einträge ohne Verkäufer-Zuordnung ({ownProducts.length})
                      </Text>
                    </BlockStack>
                    {selectedIds.length > 0 && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          const firstId = selectedIds[0];
                          if (firstId) router.push(`/products/${products.find((p) => p.id === firstId)?.id || firstId}`);
                        }}
                      >
                        Bulk edit ({selectedIds.length})
                      </Button>
                    )}
                  </InlineStack>
                  <Divider />
                  {ownProducts.length === 0 ? (
                    <Text as="p" tone="subdued">Keine Produkte in diesem Bereich.</Text>
                  ) : (
                    <BlockStack gap="200">
                      {sortProductsList(ownProducts, locale, inventorySort).map((product) => renderRow(product))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingSm">Verkäufer-Produkte</Text>
                  <TextField
                    label="Verkäufer filter"
                    labelHidden
                    placeholder="Verkäufer suchen (Store-Name)…"
                    value={sellerSearchFilter}
                    onChange={setSellerSearchFilter}
                    autoComplete="off"
                  />
                  <Divider />
                  {filteredSellerGroups.length === 0 ? (
                    <Text as="p" tone="subdued">Keine weiteren Verkäufer-Produkte{sellerSearchFilter.trim() ? " (Filter)" : ""}.</Text>
                  ) : (
                    <BlockStack gap="300">
                      {filteredSellerGroups.map(({ sellerId, items }) => {
                        const label = sellerLabelById[sellerId] || sellerId;
                        const open = sellerSectionsOpen[sellerId] !== false;
                        const sortedItems = sortProductsList(items, locale, inventorySort);
                        return (
                          <Box key={sellerId} padding="300" background="bg-surface-secondary" borderRadius="200">
                            <button
                              type="button"
                              onClick={() => setSellerSectionsOpen((prev) => ({ ...prev, [sellerId]: !open }))}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "4px 0",
                                font: "inherit",
                                textAlign: "left",
                              }}
                            >
                              <Text as="span" variant="bodyMd" fontWeight="semibold">{label}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{open ? "▾" : "▸"} {sortedItems.length} Produkte</Text>
                            </button>
                            {open && (
                              <Box paddingBlockStart="300">
                                <BlockStack gap="200">{sortedItems.map((product) => renderRow(product))}</BlockStack>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          )}
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
                  label={'Titel kopieren'}
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
