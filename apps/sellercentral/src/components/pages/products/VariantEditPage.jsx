"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
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
  Select,
} from "@shopify/polaris";
import { ProductIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";
import { decodeVariantPathKey, findVariantIndexByOptionKey } from "@/lib/variant-path-key";

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  return url || (typeof window !== "undefined" ? "http://localhost:9000" : "");
};

function sanitizePriceDraftString(s) {
  const t = String(s ?? "").replace(",", ".");
  let out = "";
  let dot = false;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

function descriptionVisualToHtml(html) {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(p|div|h[1-6]|ul|ol|li)\b/i.test(s)) return s;
  return `<p>${s}</p>`;
}

function variantImageUrlForLocale(row, loc) {
  const l = String(loc || "de").toLowerCase();
  const map = row?.image_urls && typeof row.image_urls === "object" ? row.image_urls : {};
  if (map[l]) return map[l];
  const keys = Object.keys(map).filter((k) => map[k] != null && String(map[k]).trim() !== "");
  if (keys.length === 0) return row?.image_url || "";
  if (map.de) return map.de;
  if (l === "de") return row?.image_url || "";
  return row?.image_url || "";
}

function optionDisplayLabel(opt, loc) {
  const l = String(loc || "de").toLowerCase();
  if (opt && typeof opt === "object") {
    const labels = opt.labels && typeof opt.labels === "object" ? opt.labels : {};
    if (Object.prototype.hasOwnProperty.call(labels, l)) {
      const s = labels[l];
      if (s != null && String(s).trim() !== "") return String(s).trim();
    }
    return String(opt.value ?? "").trim();
  }
  return String(opt ?? "").trim();
}

const STATUS_OPTIONS = [
  { label: "Active", value: "published" },
  { label: "Draft", value: "draft" },
  { label: "Inactive", value: "archived" },
];

function normalizeForCompareProduct(p) {
  if (!p) return p;
  const { updated_at, created_at, ...rest } = p;
  return rest;
}

/**
 * @param {{ product: object, idOrHandle: string, variantKeySegment: string, onReload: () => void }} props
 */
export default function VariantEditPage({ product: initialProduct, idOrHandle, variantKeySegment, onReload }) {
  const router = useRouter();
  const locale = useLocale();
  const client = getMedusaAdminClient();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");
  const unsaved = useUnsavedChanges();

  const optionKeyParts = useMemo(() => decodeVariantPathKey(variantKeySegment), [variantKeySegment]);

  const [product, setProduct] = useState(initialProduct);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState("visual");
  const descEditorRef = useRef(null);
  const [priceInputs, setPriceInputs] = useState({});
  const priceInputsRef = useRef({});

  const initialSnapshotRef = useRef("");

  useEffect(() => {
    setProduct(initialProduct);
    initialSnapshotRef.current = JSON.stringify(normalizeForCompareProduct(initialProduct));
  }, [initialProduct]);

  const variantIndex = useMemo(() => {
    if (!optionKeyParts || !Array.isArray(product?.variants)) return -1;
    return findVariantIndexByOptionKey(product.variants, optionKeyParts);
  }, [product?.variants, optionKeyParts]);

  const v = variantIndex >= 0 ? product.variants[variantIndex] : null;
  const vm = v?.metadata && typeof v.metadata === "object" ? v.metadata : {};
  const vTr = (vm.translations || {})[locale] || {};

  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const variantGroups = Array.isArray(meta.variation_groups) ? meta.variation_groups : [];

  const isDirty =
    product && initialSnapshotRef.current != null && JSON.stringify(normalizeForCompareProduct(product)) !== initialSnapshotRef.current;

  useEffect(() => {
    unsaved?.setDirty(!!isDirty);
  }, [isDirty, unsaved]);

  useEffect(() => {
    unsaved?.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      unsaved?.clearHandlers?.();
      unsaved?.setDirty(false);
    };
  }, [unsaved]);

  const discard = useCallback(() => {
    setProduct(initialProduct);
    initialSnapshotRef.current = JSON.stringify(normalizeForCompareProduct(initialProduct));
    unsaved?.setDirty(false);
  }, [initialProduct, unsaved]);

  const patchVariant = useCallback(
    (updater) => {
      if (!optionKeyParts || variantIndex < 0) return;
      setProduct((prev) => {
        const variants = [...(prev?.variants || [])];
        const cur = variants[variantIndex];
        if (!cur) return prev;
        const next = typeof updater === "function" ? updater(cur) : { ...cur, ...updater };
        variants[variantIndex] = next;
        return { ...prev, variants };
      });
    },
    [optionKeyParts, variantIndex]
  );

  const editingTitle =
    locale === "de"
      ? (v?.title ?? "")
      : (vTr.title ?? "");

  const canonicalDesc = vm.description ?? "";
  const editingDescription =
    locale === "de" ? canonicalDesc : (vTr.description ?? "");

  useEffect(() => {
    if (!v || descriptionMode !== "visual" || !descEditorRef.current) return;
    const html = editingDescription || "";
    if (descEditorRef.current.innerHTML !== html) descEditorRef.current.innerHTML = html;
  }, [v, descriptionMode, locale, editingDescription]);

  const hasLocaleVariantMedia =
    locale !== "de" && Object.prototype.hasOwnProperty.call(vTr, "media");
  const variantMediaUrls = (() => {
    if (hasLocaleVariantMedia) {
      const m = vTr.media;
      if (Array.isArray(m)) return m.filter((u) => u != null && String(u).trim() !== "");
      return [];
    }
    const m = vm.media;
    if (Array.isArray(m)) return m.filter((u) => u != null && String(u).trim() !== "");
    return [];
  })();

  const variantSummary = useMemo(() => {
    if (!v?.option_values || !variantGroups.length) return v?.title || "Variant";
    return v.option_values
      .map((val, gi) => {
        const g = variantGroups[gi];
        const opt = (g?.options || []).find(
          (o) => String(o.value || "").trim().toLowerCase() === String(val || "").trim().toLowerCase()
        );
        return opt ? optionDisplayLabel(opt, locale) : val;
      })
      .join(" · ");
  }, [v, variantGroups, locale]);

  const save = useCallback(async () => {
    if (!product || variantIndex < 0) return;
    const fallbackStatus = initialProduct?.status ?? "draft";
    const nextStatus =
      product.status != null && String(product.status).trim() !== ""
        ? String(product.status).trim()
        : fallbackStatus;
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      const metadata = { ...(product.metadata || {}) };
      const storeName = (typeof window !== "undefined" ? (localStorage.getItem("storeName") || "").trim() : "") || "";
      if (storeName) {
        metadata.seller_name = storeName;
        metadata.shop_name = storeName;
      }
      const allTranslations = { ...(metadata.translations || {}) };
      if (!allTranslations.de?.title) {
        allTranslations.de = {
          ...(allTranslations.de || {}),
          title: product.title || "Untitled",
          description: product.description || "",
        };
      }
      const canonicalHandle =
        (product.handle || "").trim() ||
        (allTranslations.de?.handle || "").trim() ||
        "product";
      allTranslations.de = { ...(allTranslations.de || {}), handle: canonicalHandle };
      metadata.translations = allTranslations;

      const vg = Array.isArray(metadata.variation_groups) ? metadata.variation_groups : [];
      if (vg.length > 0) {
        metadata.variation_groups = vg.map((g) => ({
          name: (g.name || "Option").trim() || "Option",
          options: (g.options || []).map((o) => {
            const row = {
              value: String(o.value ?? "").trim(),
              ...(o.swatch_image ? { swatch_image: String(o.swatch_image).trim() } : {}),
            };
            if (o.labels && typeof o.labels === "object" && Object.keys(o.labels).length > 0) {
              row.labels = o.labels;
            }
            return row;
          }),
        }));
      }

      const metaEan = metadata.ean != null ? String(metadata.ean).trim() : "";
      const variantsToSave = metaEan
        ? (product.variants || []).map((row) => ({ ...(row || {}), ean: metaEan }))
        : product.variants || [];
      const collectionId = (metadata.collection_ids && metadata.collection_ids[0]) || product.collection_id || null;
      const canonicalTitle = metadata.translations?.de?.title || product.title || "Untitled";
      const dePriceCents =
        metadata.prices?.DE?.brutto_cents != null
          ? Number(metadata.prices.DE.brutto_cents)
          : product.price != null
            ? Math.round(Number(product.price) * 100)
            : 0;
      const canonicalDescription = metadata.translations?.de?.description || product.description || "";
      const payload = {
        title: canonicalTitle,
        handle: canonicalHandle,
        sku: product.sku || "",
        description: canonicalDescription,
        status: nextStatus,
        price: dePriceCents / 100,
        inventory: product.inventory ?? 0,
        metadata,
        variants: variantsToSave,
        ...(collectionId !== undefined && { collection_id: collectionId }),
      };
      const updated = await client.updateAdminHubProduct(idOrHandle, payload);
      const saved = updated || { ...product, ...payload };
      setProduct(saved);
      initialSnapshotRef.current = JSON.stringify(normalizeForCompareProduct(saved));
      unsaved?.setDirty(false);
      setMessage({ type: "success", text: "Saved" });
      onReload?.();
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  }, [product, variantIndex, idOrHandle, client, initialProduct?.status, onReload, unsaved]);

  const saveRef = useRef(save);
  const discardRef = useRef(discard);
  saveRef.current = save;
  discardRef.current = discard;

  const updateLocaleVariantField = (key, value) => {
    patchVariant((cur) => {
      const m = { ...(cur.metadata && typeof cur.metadata === "object" ? cur.metadata : {}) };
      const tr = { ...(m.translations || {}) };
      const locData = { ...(tr[locale] || {}) };
      locData[key] = value;
      tr[locale] = locData;
      m.translations = tr;
      return { ...cur, metadata: m };
    });
  };

  const updateVariantMeta = (key, value) => {
    patchVariant((cur) => {
      const m = { ...(cur.metadata && typeof cur.metadata === "object" ? cur.metadata : {}) };
      if (value === "" || value == null) delete m[key];
      else m[key] = value;
      return { ...cur, metadata: m };
    });
  };

  const removeVariantMedia = (index) => {
    const next = variantMediaUrls.filter((_, i) => i !== index);
    if (locale === "de") updateVariantMeta("media", next.length ? next : undefined);
    else updateLocaleVariantField("media", next);
  };

  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return url.startsWith("http") || url.startsWith("data:") ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const metafieldsList = Array.isArray(vm.metafields)
    ? vm.metafields
    : vm.metafields && typeof vm.metafields === "object"
      ? Object.entries(vm.metafields).map(([k, val]) => ({ key: k, value: val }))
      : [];

  const bullets =
    locale === "de"
      ? Array.isArray(vm.bullet_points)
        ? vm.bullet_points
        : []
      : Array.isArray(vTr.bullet_points)
        ? vTr.bullet_points
        : [];

  if (optionKeyParts == null) {
    return (
      <Page title="Variant">
        <Banner tone="critical">Invalid variant link.</Banner>
        <Box paddingBlockStart="400">
          <Button onClick={() => router.push(`/products/${idOrHandle}`)}>Back to product</Button>
        </Box>
      </Page>
    );
  }

  if (!v) {
    return (
      <Page title="Variant">
        <Banner tone="critical">This variant no longer exists on the product.</Banner>
        <Box paddingBlockStart="400">
          <Button onClick={() => router.push(`/products/${idOrHandle}`)}>Back to product</Button>
        </Box>
      </Page>
    );
  }

  return (
    <Page title="">
      <style>{`
        .product-edit-header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .product-edit-header .product-edit-title-link { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--p-color-text); font-size: 0.875rem; }
        .product-edit-header .product-edit-name { margin: 0; font-size: 0.875rem; font-weight: 700; }
        .product-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; max-width: 400px; }
        .product-media-item { aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: var(--p-color-bg-fill-secondary); position: relative; }
        .product-media-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .product-media-remove { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border: none; border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff; font-size: 14px; line-height: 1; cursor: pointer; }
        .product-media-add { aspect-ratio: 1; border-radius: 8px; border: 2px dashed var(--p-color-border); display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .product-description-box { border: 1px solid var(--p-color-border); border-radius: 12px; overflow: hidden; background: var(--p-color-bg-surface); }
        .product-description-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: var(--p-color-bg-surface-secondary); border-bottom: 1px solid var(--p-color-border); }
        .product-description-toolbar .product-desc-btn { width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; }
        .product-description-toolbar .product-desc-html-btn { width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; }
        .product-description-toolbar .product-desc-html-btn.active { background: var(--p-color-bg-surface-selected); }
        .product-description-editor { min-height: 160px; padding: 16px; outline: none; font-size: 14px; line-height: 1.6; }
        .product-description-html { min-height: 160px; width: 100%; padding: 16px; font-family: ui-monospace, monospace; font-size: 13px; border: none; resize: vertical; box-sizing: border-box; }
      `}</style>

      {message.text && (
        <Box paddingBlockEnd="200">
          <Banner tone={message.type === "success" ? "success" : "critical"} onDismiss={() => setMessage({ type: "", text: "" })}>
            {message.text}
          </Banner>
        </Box>
      )}

      <div className="product-edit-header">
        <Link href={`/products/${idOrHandle}`} className="product-edit-title-link">
          <span style={{ display: "flex", width: 20, height: 20 }}><ProductIcon /></span>
          <span className="product-edit-name">{product?.title || "Product"}</span>
        </Link>
        <Text as="span" variant="bodySm" tone="subdued">
          → Variant: {variantSummary}
        </Text>
        <span style={{ flex: 1 }} />
        <Button size="slim" variant="primary" onClick={() => save()} loading={saving}>
          Save
        </Button>
      </div>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Variant options
              </Text>
              <InlineStack gap="200" wrap>
                {(v.option_values || []).map((val, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "6px 10px",
                      background: "var(--p-color-bg-fill-secondary)",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {variantGroups[i]?.name || `Group ${i + 1}`}: {val}
                  </span>
                ))}
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Internal keys above; customer-facing labels follow your product variation translations. Edit groups on the main product page.
              </Text>

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Title ({locale.toUpperCase()})
              </Text>
              <TextField
                label="Title"
                labelHidden
                value={editingTitle}
                onChange={(t) => {
                  if (locale === "de") patchVariant({ title: t });
                  else updateLocaleVariantField("title", t);
                }}
                autoComplete="off"
              />

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                SKU & EAN
              </Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="240px" flex="1">
                  <TextField
                    label="SKU"
                    labelHidden
                    value={v.sku ?? ""}
                    onChange={(t) => patchVariant({ sku: t })}
                    autoComplete="off"
                  />
                </Box>
                <Box minWidth="240px" flex="1">
                  <TextField
                    label="EAN"
                    labelHidden
                    value={v.ean ?? ""}
                    onChange={(t) => patchVariant({ ean: t || undefined })}
                    autoComplete="off"
                  />
                </Box>
              </InlineStack>

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Description
              </Text>
              <div className="product-description-box">
                <div className="product-description-toolbar">
                  <div />
                  <button
                    type="button"
                    className={`product-desc-html-btn ${descriptionMode === "html" ? "active" : ""}`}
                    onClick={() => {
                      if (descriptionMode === "visual" && descEditorRef.current) {
                        const html = descriptionVisualToHtml(descEditorRef.current.innerHTML || "");
                        if (locale === "de") updateVariantMeta("description", html);
                        else updateLocaleVariantField("description", html);
                      } else if (descriptionMode !== "visual" && descEditorRef.current) {
                        descEditorRef.current.innerHTML = editingDescription || "";
                      }
                      setDescriptionMode(descriptionMode === "html" ? "visual" : "html");
                    }}
                  >
                    HTML
                  </button>
                </div>
                {descriptionMode === "html" ? (
                  <textarea
                    className="product-description-html"
                    value={editingDescription}
                    onChange={(e) => {
                      if (locale === "de") updateVariantMeta("description", e.target.value);
                      else updateLocaleVariantField("description", e.target.value);
                    }}
                    rows={8}
                    spellCheck={false}
                  />
                ) : (
                  <div
                    ref={descEditorRef}
                    className="product-description-editor"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={() => {
                      if (!descEditorRef.current) return;
                      const html = descriptionVisualToHtml(descEditorRef.current.innerHTML || "");
                      if (locale === "de") updateVariantMeta("description", html);
                      else updateLocaleVariantField("description", html);
                    }}
                  />
                )}
              </div>

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Media (variant gallery)
              </Text>
              {locale !== "de" && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {hasLocaleVariantMedia
                    ? "Images for this language only; clear all to fall back to default variant media."
                    : "Using default variant media until you add images for this language."}
                </Text>
              )}
              <div className="product-media-grid">
                {variantMediaUrls.map((url, i) => (
                  <div key={i} className="product-media-item">
                    <img src={resolveMediaUrl(url)} alt="" />
                    <button type="button" className="product-media-remove" onClick={() => removeVariantMedia(i)}>
                      ×
                    </button>
                  </div>
                ))}
                {variantMediaUrls.length < 8 && (
                  <div className="product-media-add" role="button" tabIndex={0} onClick={() => setMediaPickerOpen(true)}>
                    +
                  </div>
                )}
              </div>
              <MediaPickerModal
                open={mediaPickerOpen}
                onClose={() => setMediaPickerOpen(false)}
                title="Select images"
                multiple
                onSelect={(urls) => {
                  const toAdd = urls.slice(0, Math.max(0, 8 - variantMediaUrls.length));
                  if (!toAdd.length) return;
                  const merged = [...variantMediaUrls, ...toAdd].slice(0, 8);
                  if (locale === "de") updateVariantMeta("media", merged);
                  else updateLocaleVariantField("media", merged);
                }}
              />
              <MediaPickerModal
                open={coverPickerOpen}
                onClose={() => setCoverPickerOpen(false)}
                title="Select cover image"
                multiple={false}
                onSelect={(urls) => {
                  const u = urls[0];
                  if (!u) return;
                  if (locale === "de") patchVariant({ image_url: u });
                  else {
                    const iu = { ...(v.image_urls || {}) };
                    iu[locale] = u;
                    patchVariant({ image_urls: iu });
                  }
                }}
              />

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Cover image (picker / locale)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Same as matrix: German uses image_url; other locales use image_urls.{`{locale}`}.
              </Text>
              <InlineStack gap="300" wrap>
                <Button size="slim" onClick={() => setCoverPickerOpen(true)}>
                  Open media picker for cover
                </Button>
              </InlineStack>
              <div style={{ marginTop: 8 }}>
                {(() => {
                  const raw = variantImageUrlForLocale(v, locale);
                  return raw ? <img src={resolveMediaUrl(raw)} alt="" style={{ maxWidth: 120, borderRadius: 8 }} /> : <Text tone="subdued">No cover</Text>;
                })()}
              </div>

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Stock
              </Text>
              <TextField
                label="Inventory"
                labelHidden
                type="number"
                min={0}
                value={v.inventory != null ? String(v.inventory) : "0"}
                onChange={(t) => patchVariant({ inventory: t === "" ? 0 : parseInt(String(t), 10) || 0 })}
              />

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Prices (€)
              </Text>
              {[
                { field: "price", centsKey: "price_cents", label: "Price" },
                { field: "compare_at_price", centsKey: "compare_at_price_cents", label: "UVP" },
                { field: "sale_price", centsKey: "sale_price_cents", label: "Sale" },
              ].map(({ field: f, centsKey: ck, label: priceLabel }) => {
                const dk = `${f}_draft`;
                const isDraft = Object.prototype.hasOwnProperty.call(priceInputs, dk);
                const displayVal = isDraft
                  ? priceInputs[dk]
                  : v[ck] != null
                    ? (Number(v[ck]) / 100).toFixed(2)
                    : "";
                return (
                  <TextField
                    key={f}
                    label={priceLabel}
                    value={displayVal}
                    onChange={(val) => {
                      const clean = sanitizePriceDraftString(val);
                      setPriceInputs((prev) => ({ ...prev, [dk]: clean }));
                    }}
                    onBlur={() => {
                      const clean = sanitizePriceDraftString(priceInputs[dk] ?? displayVal);
                      const n = parseFloat(clean);
                      patchVariant({
                        [ck]: !isNaN(n) && clean !== "" ? Math.round(n * 100) : undefined,
                      });
                      setPriceInputs((prev) => {
                        const next = { ...prev };
                        delete next[dk];
                        return next;
                      });
                    }}
                    autoComplete="off"
                  />
                );
              })}

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Bullet points (max 5, je max. 120 Zeichen)
              </Text>
              {bullets.map((b, i) => {
                const len = String(b ?? "").length;
                const overLimit = len > 120;
                return (
                  <Box key={i}>
                    <TextField
                      label={`Bullet ${i + 1}`}
                      labelHidden
                      value={b}
                      maxLength={120}
                      onChange={(t) => {
                        const trimmed = String(t).slice(0, 120);
                        const next = [...bullets];
                        next[i] = trimmed;
                        if (locale === "de") updateVariantMeta("bullet_points", next.filter((x) => x != null && String(x).trim() !== ""));
                        else updateLocaleVariantField("bullet_points", next.filter((x) => x != null && String(x).trim() !== ""));
                      }}
                    />
                    <Text as="p" variant="bodySm" tone="subdued" style={{ marginTop: 4, color: overLimit ? "var(--p-color-text-critical)" : undefined }}>
                      {len} / 120
                    </Text>
                  </Box>
                );
              })}
              {bullets.length < 5 && (
                <Button
                  size="slim"
                  variant="secondary"
                  onClick={() => {
                    const next = [...bullets, ""];
                    if (locale === "de") updateVariantMeta("bullet_points", next);
                    else updateLocaleVariantField("bullet_points", next);
                  }}
                >
                  + Bullet
                </Button>
              )}

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Metafields
              </Text>
              {metafieldsList.map((item, i) => (
                <InlineStack key={i} gap="200" wrap>
                  <TextField
                    label="Key"
                    labelHidden
                    value={item.key || ""}
                    onChange={(keyVal) => {
                      const arr = [...metafieldsList];
                      arr[i] = { ...arr[i], key: keyVal };
                      patchVariant((cur) => ({
                        ...cur,
                        metadata: { ...(cur.metadata || {}), metafields: arr },
                      }));
                    }}
                  />
                  <TextField
                    label="Value"
                    labelHidden
                    value={String(item.value ?? "")}
                    onChange={(val) => {
                      const arr = [...metafieldsList];
                      arr[i] = { ...arr[i], value: val };
                      patchVariant((cur) => ({
                        ...cur,
                        metadata: { ...(cur.metadata || {}), metafields: arr },
                      }));
                    }}
                  />
                </InlineStack>
              ))}
              <Button
                size="slim"
                variant="secondary"
                onClick={() =>
                  patchVariant((cur) => ({
                    ...cur,
                    metadata: {
                      ...(cur.metadata || {}),
                      metafields: [...metafieldsList, { key: "", value: "" }],
                    },
                  }))
                }
              >
                + Metafield
              </Button>

              <Divider />

              <Text as="h2" variant="bodyMd" fontWeight="regular">
                SEO (variant)
              </Text>
              <TextField
                label="Meta title"
                value={vm.seo_meta_title ?? ""}
                onChange={(t) => updateVariantMeta("seo_meta_title", t || undefined)}
              />
              <TextField
                label="Meta description"
                value={vm.seo_meta_description ?? ""}
                onChange={(t) => updateVariantMeta("seo_meta_description", t || undefined)}
                multiline={2}
              />
              <TextField
                label="Keywords"
                value={vm.seo_keywords ?? ""}
                onChange={(t) => updateVariantMeta("seo_keywords", t || undefined)}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="bodyMd" fontWeight="regular">
                Product status
              </Text>
              <Select
                label="Status"
                labelHidden
                options={STATUS_OPTIONS}
                value={product.status || "draft"}
                disabled
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Change status on the main product page.
              </Text>
              <Divider />
              <Button onClick={() => router.push(`/products/${idOrHandle}`)}>Back to product</Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
