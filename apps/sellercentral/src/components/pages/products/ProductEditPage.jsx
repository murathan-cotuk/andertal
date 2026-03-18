"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, Link } from "@/i18n/navigation";
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
  SkeletonBodyText,
  SkeletonDisplayText,
  Popover,
  ActionList,
  Modal,
  Checkbox,
} from "@shopify/polaris";
import { ProductIcon, MenuHorizontalIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  return url || (typeof window !== "undefined" ? "http://localhost:9000" : "");
};

const STATUS_OPTIONS = [
  { label: "Active", value: "published" },
  { label: "Draft", value: "draft" },
  { label: "Inactive", value: "archived" },
];

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

const UNIT_TYPE_OPTIONS = [
  { label: "— None —", value: "" },
  { label: "kg", value: "kg" },
  { label: "g", value: "g" },
  { label: "L", value: "L" },
  { label: "ml", value: "ml" },
  { label: "Piece", value: "stück" },
];

function getEmptyProduct() {
  return {
    title: "",
    handle: "",
    sku: "",
    description: "",
    status: "draft",
    price: 0,
    inventory: 0,
    metadata: {},
    variants: [],
  };
}

function getMeta(product, key, fallback = "") {
  const m = product?.metadata;
  if (!m || typeof m !== "object") return fallback;
  return m[key] != null && m[key] !== "" ? String(m[key]) : fallback;
}

function setMeta(product, key, value) {
  const m = { ...(product?.metadata && typeof product.metadata === "object" ? product.metadata : {}) };
  if (value === "" || value == null) delete m[key]; else m[key] = value;
  return { ...product, metadata: m };
}

function descriptionVisualToHtml(html) {
  const s = (html || "").trim();
  if (!s) return "";
  if (/<(p|div|h[1-6]|ul|ol|li)\b/i.test(s)) return s;
  return "<p>" + s + "</p>";
}

export default function ProductEditPage({ product: initialProduct, idOrHandle, isNew, onReload }) {
  const router = useRouter();
  const locale = useLocale();
  const client = getMedusaAdminClient();
  const baseUrl = (client.baseURL || getDefaultBaseUrl()).replace(/\/$/, "");
  const [product, setProduct] = useState(() => {
    const p = initialProduct ?? (isNew ? getEmptyProduct() : null);
    if (!p || !p.metadata?.translations) return p;
    const tr = p.metadata.translations[locale];
    return tr ? { ...p, title: tr.title ?? p.title, description: tr.description ?? p.description } : p;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [collections, setCollections] = useState([]);
  const [brands, setBrands] = useState([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionPopoverOpen, setCollectionPopoverOpen] = useState(false);
  const [relatedProductsList, setRelatedProductsList] = useState([]);
  const [relatedProductSearch, setRelatedProductSearch] = useState("");
  const [relatedProductPopoverOpen, setRelatedProductPopoverOpen] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState("visual");
  const descEditorRef = useRef(null);
  const initialSnapshotRef = useRef(null);
  const [expandedVariantIndex, setExpandedVariantIndex] = useState(null);
  const dragGroupIdx = useRef(null);
  // Variant image picker: null = closed, option_values[] = target variant being edited
  const [variantImgPickerTarget, setVariantImgPickerTarget] = useState(null);
  // Swatch image picker: null = closed, {gi, oi} = target group/option
  const [swatchPickerTarget, setSwatchPickerTarget] = useState(null);
  // Draft price strings keyed by `${variantKey}_${field}` — committed on blur
  const [priceInputs, setPriceInputs] = useState({});
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateOptions, setDuplicateOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [duplicateSaving, setDuplicateSaving] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (collectionPopoverOpen) document.body.classList.add("belucha-collections-dropdown-open");
    else document.body.classList.remove("belucha-collections-dropdown-open");
    return () => document.body.classList.remove("belucha-collections-dropdown-open");
  }, [collectionPopoverOpen]);

  // Sync from server when we switch product (id/handle) or locale. Merge translations[locale] into title/description.
  const initialProductId = initialProduct?.id ?? initialProduct?.handle ?? "";
  useEffect(() => {
    const next = initialProduct ?? (isNew ? getEmptyProduct() : null);
    setProduct((prev) => {
      if (!next) return prev ?? null;
      const prevKey = prev?.id ?? prev?.handle ?? "";
      const tr = next.metadata?.translations;
      const localized = tr?.[locale] ? { ...next, title: tr[locale].title ?? next.title, description: tr[locale].description ?? next.description } : next;
      if (prevKey && initialProductId && prevKey === initialProductId) {
        return { ...prev, title: localized.title, description: localized.description };
      }
      return localized;
    });
    if (next) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(next));
  }, [initialProductId, isNew, locale]);

  // Load categories, collections, brands in parallel so the page feels faster
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.getAdminHubCategories({ all: true }).then((r) => r.categories || []).catch(() => []),
      client.getMedusaCollections({ adminHub: true }).then((r) => r.collections || []).catch(() => []),
      client.getBrands().then((r) => r.brands || []).catch(() => []),
    ]).then(([categoriesList, collectionsList, brandsList]) => {
      if (!cancelled) {
        setCategories(categoriesList);
        setCollections(collectionsList);
        setBrands(brandsList);
      }
    });
    return () => { cancelled = true; };
  }, [client]);

  // Load products list once on mount (needed to resolve titles for existing related_product_ids tags)
  useEffect(() => {
    let cancelled = false;
    client.getAdminHubProducts({ limit: 200 }).then((r) => {
      if (!cancelled && r?.products) setRelatedProductsList(r.products);
    }).catch(() => { if (!cancelled) setRelatedProductsList([]); });
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    if (descriptionMode === "visual" && descEditorRef.current) descEditorRef.current.innerHTML = product?.description || "";
  }, [descriptionMode]);

  function normalizeForCompare(p) {
    if (!p) return null;
    return {
      title: p.title ?? "",
      handle: p.handle ?? "",
      sku: p.sku ?? "",
      description: p.description ?? "",
      status: p.status ?? "draft",
      price: p.price ?? 0,
      inventory: p.inventory ?? 0,
      metadata: p.metadata && typeof p.metadata === "object" ? p.metadata : {},
      variants: Array.isArray(p.variants) ? p.variants : [],
    };
  }
  const isDirty = product && initialSnapshotRef.current != null && JSON.stringify(normalizeForCompare(product)) !== initialSnapshotRef.current;
  const unsaved = useUnsavedChanges();

  const handleDiscard = useCallback(() => {
    setProduct(initialProduct ?? (isNew ? getEmptyProduct() : null));
    if (initialProduct) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(initialProduct));
    else if (isNew) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(getEmptyProduct()));
    unsaved?.setDirty(false);
  }, [initialProduct, isNew, unsaved]);

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
  }, [isDirty, unsaved]);

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

  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const uvp = meta.uvp_cents != null ? Number(meta.uvp_cents) / 100 : null;
  const rabattpreis = meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) / 100 : null;
  const price = product?.price != null ? Number(product.price) : 0;
  const displayPrice = rabattpreis != null && rabattpreis > 0 ? rabattpreis : price;
  const hasDiscount = rabattpreis != null && rabattpreis > 0 && price > 0;

  const update = useCallback((updates) => {
    setProduct((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const updateMeta = useCallback((key, value) => {
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      if (value === "" || value == null) delete m[key]; else m[key] = value;
      return { ...prev, metadata: m };
    });
  }, []);

  const save = async () => {
    if (!product) return;
    const descriptionToSave = descriptionMode === "visual" && descEditorRef.current
      ? (descEditorRef.current.innerHTML || "")
      : (product.description || "");
    const handle = (product.handle || "").trim() || titleToHandle(product.title || "product");
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      const metadata = { ...(product.metadata || {}) };
      const storeName = (typeof window !== "undefined" ? (localStorage.getItem("storeName") || "").trim() : "") || "";
      if (storeName) {
        metadata.seller_name = storeName;
        metadata.shop_name = storeName;
      }
      metadata.translations = { ...(metadata.translations || {}), [locale]: { title: product.title || "Untitled", description: descriptionToSave } };
      // variation_groups already in metadata (kept in sync by applyVariantGroups); re-serialize for safety
      if (variantGroups.length > 0) {
        metadata.variation_groups = variantGroups.map((g) => ({
          name: (g.name || "Option").trim() || "Option",
          options: (g.options || []).map((o) => ({
            value: String(o.value ?? "").trim(),
            ...(o.swatch_image ? { swatch_image: String(o.swatch_image).trim() } : {}),
          })),
        }));
      }
      const collectionId = (metadata.collection_ids && metadata.collection_ids[0]) || product.collection_id || null;
      const payload = {
        title: product.title || "Untitled",
        handle,
        sku: product.sku || "",
        description: descriptionToSave,
        status: product.status || "draft",
        price: product.price ?? 0,
        inventory: product.inventory ?? 0,
        metadata,
        variants: product.variants || [],
        ...(collectionId !== undefined && { collection_id: collectionId }),
      };
      if (isNew) {
        const created = await client.createAdminHubProduct(payload);
        setMessage({ type: "success", text: "Product created" });
        onReload?.();
        router.push(`/products/${created?.handle || created?.id || idOrHandle}`);
        return;
      }
      await client.updateAdminHubProduct(idOrHandle, payload);
      setMessage({ type: "success", text: "Saved" });
      initialSnapshotRef.current = JSON.stringify(normalizeForCompare({ ...product, ...payload }));
      onReload?.();
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(save);
  const discardRef = useRef(handleDiscard);
  saveRef.current = save;
  discardRef.current = handleDiscard;

  const openDuplicateModal = () => {
    setDuplicateOptions({ ...DEFAULT_DUPLICATE_OPTIONS });
    setDuplicateModalOpen(true);
  };

  const runDuplicate = async () => {
    if (!product) return;
    setDuplicateSaving(true);
    try {
      const opt = duplicateOptions;
      const meta = (product.metadata && typeof product.metadata === "object") ? { ...product.metadata } : {};
      delete meta.ean;
      if (!opt.media) meta.media = undefined;
      if (!opt.categories) {
        meta.collection_ids = undefined;
        meta.collection_id = undefined;
      }
      const variants = opt.variants ? stripSkuEanFromVariants(product.variants) : [];
      const newTitle = opt.title ? (product.title || "").trim() + " (Copy)" : "Untitled";
      const payload = {
        title: newTitle,
        handle: titleToHandle(newTitle) + "-" + Date.now().toString(36),
        sku: "",
        description: opt.description ? (product.description || "") : "",
        status: "draft",
        price: opt.price && (product.price != null) ? Number(product.price) : 0,
        inventory: opt.inventory && (product.inventory != null) ? Number(product.inventory) : 0,
        metadata: meta,
        variants,
        ...(opt.categories && (product.collection_id != null) ? { collection_id: product.collection_id } : {}),
      };
      if (opt.categories && meta.collection_ids && Array.isArray(meta.collection_ids)) {
        payload.metadata = { ...payload.metadata, collection_ids: meta.collection_ids };
      }
      const created = await client.createAdminHubProduct(payload);
      setDuplicateModalOpen(false);
      if (created?.id) router.push(`/products/${created.handle || created.id}`);
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Duplicate failed" });
    } finally {
      setDuplicateSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!product?.id) return;
    try {
      setSaving(true);
      await client.deleteAdminHubProduct(product.id);
      router.push("/products/inventory");
    } catch (err) {
      setMessage({ type: "error", text: err?.message || "Delete failed" });
    } finally {
      setSaving(false);
    }
  };

  const metafieldsList = Array.isArray(meta.metafields) ? meta.metafields : (meta.metafields && typeof meta.metafields === "object" ? Object.entries(meta.metafields).map(([k, v]) => ({ key: k, value: v })) : []);

  if (!product && !isNew) {
    return (
      <Page title="Product">
        <Card><BlockStack gap="300"><SkeletonDisplayText size="small" /><SkeletonBodyText lines={3} /></BlockStack></Card>
      </Page>
    );
  }

  const mediaUrls = (() => {
    const m = meta.media;
    if (Array.isArray(m)) return m.filter((u) => u != null && String(u).trim() !== "");
    if (m != null && String(m).trim() !== "") return [String(m)];
    return [];
  })();
  const collectionIds = Array.isArray(meta.collection_ids) ? meta.collection_ids : (meta.collection_id != null ? [meta.collection_id] : (product?.collection_id != null ? [product.collection_id] : []));
  const relatedProductIds = Array.isArray(meta.related_product_ids) ? meta.related_product_ids : [];

  // ─── Variation Engine ────────────────────────────────────────────────────────

  /** Cartesian product of arrays: [["Red","Black"],["S","M"]] → [["Red","S"],["Red","M"],...] */
  const cartesian = (arrs) => {
    if (!arrs.length) return [[]];
    const [first, ...rest] = arrs;
    const tail = cartesian(rest);
    return (first || []).flatMap((v) => tail.map((r) => [v, ...r]));
  };

  /** Single source of truth: always read from metadata.variation_groups */
  const variantGroups = (() => {
    const mg = meta.variation_groups;
    if (!Array.isArray(mg) || mg.length === 0) return [];
    return mg.map((g) => ({
      name: g.name || "",
      options: (g.options || []).map((opt) => ({
        value: typeof opt === "object" ? String(opt.value ?? "") : String(opt ?? ""),
        swatch_image: typeof opt === "object" ? String(opt.swatch_image ?? opt.swatch_image_url ?? "") : "",
      })),
    }));
  })();

  /**
   * Apply new groups config: regenerates variant matrix while preserving existing
   * variant data (sku, ean, stock, prices, image) for unchanged combinations.
   * Atomically writes both metadata.variation_groups and variants.
   */
  const applyVariantGroups = (nextGroups) => {
    const valueArrs = nextGroups.map((g) =>
      (g.options || []).map((o) => String(o.value ?? "").trim()).filter(Boolean)
    );
    const allFilled = valueArrs.length > 0 && valueArrs.every((a) => a.length > 0);
    const combos = allFilled ? cartesian(valueArrs) : [];

    setProduct((prev) => {
      const existing = prev?.variants || [];
      const flat = combos.map((optionValues) => {
        const key = optionValues.join("\u0000");
        const ex = existing.find(
          (v) => Array.isArray(v.option_values) && v.option_values.join("\u0000") === key
        );
        if (ex) return { ...ex, option_values: optionValues };
        return {
          option_values: optionValues,
          title: optionValues.join(" / "),
          value: optionValues.join(" / "),
          sku: "",
          ean: undefined,
          inventory: 0,
          price_cents: undefined,
          compare_at_price_cents: undefined,
          sale_price_cents: undefined,
          image_url: undefined,
        };
      });
      const metaGroups = nextGroups.map((g) => ({
        name: g.name || "Option",
        options: (g.options || []).map((o) => ({
          value: String(o.value ?? "").trim(),
          ...(o.swatch_image ? { swatch_image: o.swatch_image } : {}),
        })),
      }));
      return {
        ...prev,
        variants: flat,
        metadata: {
          ...(prev?.metadata && typeof prev.metadata === "object" ? prev.metadata : {}),
          variation_groups: metaGroups,
        },
      };
    });
  };

  /** Update a single field on one variant in the matrix */
  const updateMatrixVariant = (optionValues, field, value) => {
    const key = Array.isArray(optionValues) ? optionValues.join("\u0000") : "";
    setProduct((prev) => {
      const variants = [...(prev?.variants || [])];
      const idx = variants.findIndex(
        (v) => Array.isArray(v.option_values) && v.option_values.join("\u0000") === key
      );
      if (idx < 0) return prev;
      const v = { ...variants[idx] };
      if (field === "price") {
        const n = parseFloat(value);
        v.price_cents = !isNaN(n) && value !== "" ? Math.round(n * 100) : undefined;
      } else if (field === "compare_at_price") {
        const n = parseFloat(value);
        v.compare_at_price_cents = !isNaN(n) && value !== "" ? Math.round(n * 100) : undefined;
      } else if (field === "sale_price") {
        const n = parseFloat(value);
        v.sale_price_cents = !isNaN(n) && value !== "" ? Math.round(n * 100) : undefined;
      } else if (field === "inventory") {
        v.inventory = value !== "" ? parseInt(String(value), 10) || 0 : 0;
      } else {
        v[field] = value || undefined;
      }
      variants[idx] = v;
      return { ...prev, variants };
    });
  };

  // Group-level helpers — all go through applyVariantGroups
  const vg_addGroup = () =>
    applyVariantGroups([...variantGroups, { name: "", options: [{ value: "", swatch_image: "" }] }]);
  const vg_removeGroup = (gi) =>
    applyVariantGroups(variantGroups.filter((_, i) => i !== gi));
  const vg_setGroupName = (gi, name) =>
    applyVariantGroups(variantGroups.map((g, i) => (i === gi ? { ...g, name } : g)));
  const vg_addOption = (gi) =>
    applyVariantGroups(variantGroups.map((g, i) =>
      i === gi ? { ...g, options: [...(g.options || []), { value: "", swatch_image: "" }] } : g
    ));
  const vg_removeOption = (gi, oi) =>
    applyVariantGroups(variantGroups.map((g, i) =>
      i === gi ? { ...g, options: (g.options || []).filter((_, j) => j !== oi) } : g
    ));
  const vg_setOption = (gi, oi, field, value) =>
    applyVariantGroups(variantGroups.map((g, i) => {
      if (i !== gi) return g;
      const opts = [...(g.options || [])];
      if (!opts[oi]) return g;
      opts[oi] = { ...opts[oi], [field]: value };
      return { ...g, options: opts };
    }));
  const vg_moveGroup = (from, to) => {
    if (from === to) return;
    const next = [...variantGroups];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyVariantGroups(next);
  };

  // ─── Variant image picker ────────────────────────────────────────────────────
  const openVariantImgPicker = (optionValues) => {
    setVariantImgPickerTarget(optionValues);
  };

  const openSwatchPicker = (gi, oi) => {
    setSwatchPickerTarget({ gi, oi });
  };

  const removeMedia = (index) => {
    const next = mediaUrls.filter((_, i) => i !== index);
    updateMeta("media", next);
  };
  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return url.startsWith("http") || url.startsWith("data:") ? url : `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  return (
    <Page title="">
      <style>{`
        .product-edit-header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .product-edit-header .product-edit-title-link { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--p-color-text); font-size: 0.875rem; }
        .product-edit-header .product-edit-title-link:hover { color: var(--p-color-text); }
        .product-edit-header .product-edit-name { margin: 0; font-size: 0.875rem; font-weight: 700; }
        .product-edit-label { font-size: 0.8125rem; font-weight: 400; color: var(--p-color-text-subdued); margin-bottom: 4px; }
        .product-price-strike { text-decoration: line-through; color: var(--p-color-text-subdued); }
        .product-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; max-width: 400px; }
        .product-media-item { aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: var(--p-color-bg-fill-secondary); position: relative; }
        .product-media-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .product-media-remove { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border: none; border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff; font-size: 14px; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 0; }
        .product-media-item:hover .product-media-remove { opacity: 1; }
        .product-media-remove:hover { background: rgba(0,0,0,0.75); }
        .product-media-add { aspect-ratio: 1; border-radius: 8px; border: 2px dashed var(--p-color-border); background: var(--p-color-bg-fill-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--p-color-icon); transition: border-color 0.2s, background 0.2s; }
        .product-media-add:hover { border-color: var(--p-color-border-hover); background: var(--p-color-bg-fill-secondary-hover, rgba(0,0,0,0.03)); }
        .product-media-add svg { width: 24px; height: 24px; }
        @media (max-width: 480px) { .product-media-grid { grid-template-columns: repeat(3, 1fr); max-width: none; } }
        .product-media-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; max-height: 480px; overflow-y: auto; padding: 4px 0; }
        .product-media-picker-add { aspect-ratio: 1; border-radius: 12px; border: 2px dashed var(--p-color-border); background: var(--p-color-bg-fill-secondary); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--p-color-icon); transition: border-color 0.2s, background 0.2s; min-height: 140px; }
        .product-media-picker-add:hover { border-color: var(--p-color-border-hover); background: var(--p-color-bg-fill-secondary-hover, rgba(0,0,0,0.03)); }
        .product-media-picker-add svg { width: 32px; height: 32px; }
        .product-media-picker-add-label { font-size: 12px; font-weight: 500; color: var(--p-color-text-subdued); }
        .product-media-picker-item { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--p-color-bg-surface-secondary); border: 2px solid transparent; cursor: pointer; padding: 0; transition: border-color 0.2s, box-shadow 0.2s; min-height: 140px; }
        .product-media-picker-item:hover { border-color: var(--p-color-border-hover); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .product-media-picker-item.selected { border-color: var(--p-color-border-info); box-shadow: 0 0 0 2px var(--p-color-bg-fill-info); }
        .product-media-picker-item-img { width: 100%; height: 100%; display: block; }
        .product-media-picker-item-img .Polaris-Thumbnail { width: 100%; height: 100%; }
        .product-media-picker-item-img .Polaris-Thumbnail__Image { width: 100%; height: 100%; object-fit: cover; }
        .product-media-picker-tick { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: var(--p-color-bg-fill-brand); color: #fff; display: inline-flex; align-items: center; justify-content: center; pointer-events: none; }
        .product-media-picker-tick svg { width: 16px; height: 16px; }
        .collection-dropdown-wrap { position: relative; }
        .collection-dropdown-panel { position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; background: var(--p-color-bg-surface); border: 1px solid var(--p-color-border); border-radius: 8px; box-shadow: var(--p-shadow-400); max-height: 280px; overflow-y: auto; z-index: 10002; opacity: 0; transform: translateY(-8px); transition: opacity 0.2s ease, transform 0.2s ease; pointer-events: none; }
        .collection-dropdown-panel.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
        .collection-dropdown-card-wrap { position: relative; overflow: visible !important; }
        .collection-dropdown-card-wrap.collections-open { z-index: 10000; }
        .collection-dropdown-card-wrap .Polaris-Card { overflow: visible !important; }
        .collection-dropdown-card-wrap .Polaris-LegacyCard { overflow: visible !important; }
        .collection-dropdown-card-wrap .Polaris-BlockStack { overflow: visible !important; }
        .collection-dropdown-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font-size: 14px; color: var(--p-color-text); }
        .collection-dropdown-item:hover { background: var(--p-color-bg-surface-hover); }
        .product-description-box { border: 1px solid var(--p-color-border); border-radius: 12px; overflow: hidden; background: var(--p-color-bg-surface); }
        .product-description-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: var(--p-color-bg-surface-secondary); border-bottom: 1px solid var(--p-color-border); }
        .product-description-toolbar-left { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
        .product-description-toolbar .product-desc-btn { width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; }
        .product-description-toolbar .product-desc-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
        .product-description-toolbar .product-desc-btn svg { width: 16px; height: 16px; }
        .product-description-toolbar .product-desc-divider { width: 1px; height: 20px; background: var(--p-color-border); margin: 0 4px; flex-shrink: 0; }
        .product-description-toolbar .product-desc-html-btn { width: 32px; height: 32px; padding: 0; border: none; border-radius: 6px; cursor: pointer; background: transparent; color: var(--p-color-text-subdued); transition: background 0.15s, color 0.15s; display: inline-flex; align-items: center; justify-content: center; }
        .product-description-toolbar .product-desc-html-btn:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-text); }
        .product-description-toolbar .product-desc-html-btn.active { background: var(--p-color-bg-surface-selected); color: var(--p-color-text); }
        .product-description-toolbar .product-desc-html-btn svg { width: 16px; height: 16px; }
        .product-description-editor { min-height: 200px; padding: 16px; outline: none; font-size: 14px; line-height: 1.6; color: var(--p-color-text); }
        .product-description-editor h1 { font-size: 1.75rem; font-weight: 700; margin: 0.75em 0 0.35em; line-height: 1.3; }
        .product-description-editor h2 { font-size: 1.5rem; font-weight: 700; margin: 0.75em 0 0.35em; line-height: 1.3; }
        .product-description-editor h3 { font-size: 1.25rem; font-weight: 600; margin: 0.6em 0 0.3em; line-height: 1.35; }
        .product-description-editor h4, .product-description-editor h5, .product-description-editor h6 { font-size: 1.1rem; font-weight: 600; margin: 0.5em 0 0.25em; line-height: 1.4; }
        .product-description-editor h1:first-child, .product-description-editor h2:first-child, .product-description-editor h3:first-child { margin-top: 0; }
        .product-description-editor p { margin: 0 0 0.6em; }
        .product-description-editor p:last-child { margin-bottom: 0; }
        .product-description-editor ul, .product-description-editor ol { margin: 0.4em 0 0.8em 1.5em; padding-left: 1.5em; }
        .product-description-editor ul { list-style-type: disc; }
        .product-description-editor ol { list-style-type: decimal; }
        .product-description-editor li { margin-bottom: 0.25em; }
        .product-description-editor strong { font-weight: 600; }
        .product-description-editor blockquote { margin: 0.75em 0; padding-left: 1em; border-left: 4px solid var(--p-color-border); color: var(--p-color-text-subdued); }
        .product-description-html { min-height: 200px; width: 100%; padding: 16px; font-family: ui-monospace, "SF Mono", Monaco, monospace; font-size: 13px; line-height: 1.5; color: var(--p-color-text); background: var(--p-color-bg-surface-secondary); border: none; border-radius: 0; resize: vertical; box-sizing: border-box; }
        .product-description-html:focus { outline: none; }
        .product-description-html::placeholder { color: var(--p-color-text-subdued); }
        .product-description-hint { margin-top: 8px; font-size: 12px; color: var(--p-color-text-subdued); }
        /* Variation engine */
        .vg-group { border: 1px solid var(--p-color-border); border-radius: 10px; padding: 16px; background: var(--p-color-bg-surface-secondary); transition: box-shadow 0.15s; }
        .vg-group:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .vg-group[draggable]:active { cursor: grabbing; box-shadow: 0 6px 24px rgba(0,0,0,0.12); opacity: 0.9; }
        .vg-drag-handle { color: var(--p-color-icon-subdued); font-size: 18px; cursor: grab; user-select: none; flex-shrink: 0; padding: 2px 6px; border-radius: 4px; }
        .vg-drag-handle:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-icon); }
        .vg-option-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--p-color-bg-surface); border: 1px solid var(--p-color-border); border-radius: 8px; padding: 4px 6px 4px 8px; }
        .vg-option-chip input { border: none; outline: none; background: transparent; font-size: 13px; color: var(--p-color-text); min-width: 60px; width: 80px; }
        .vg-option-chip input::placeholder { color: var(--p-color-text-subdued); }
        .vg-remove-btn { border: none; background: none; cursor: pointer; color: var(--p-color-icon-subdued); font-size: 16px; line-height: 1; padding: 0 2px; border-radius: 3px; display: inline-flex; align-items: center; }
        .vg-remove-btn:hover { color: var(--p-color-text-critical); background: var(--p-color-bg-fill-critical-secondary, rgba(222,54,24,0.06)); }
        .vg-swatch { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 1.5px solid var(--p-color-border); cursor: pointer; padding: 0; background: none; appearance: none; display: block; }
        .vg-swatch:hover { border-color: var(--p-color-border-hover); box-shadow: 0 0 0 3px rgba(0,113,227,0.12); }
        .vg-swatch-empty { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; border: 1.5px dashed var(--p-color-border); display: inline-flex; align-items: center; justify-content: center; color: var(--p-color-icon-subdued); font-size: 14px; cursor: pointer; padding: 0; background: none; appearance: none; }
        .vg-swatch-empty:hover { border-color: var(--p-color-border-info); color: var(--p-color-text-info); background: rgba(0,113,227,0.04); }
        .vg-matrix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .vg-matrix-table th { padding: 8px 10px; text-align: left; font-weight: 600; color: var(--p-color-text-subdued); white-space: nowrap; background: var(--p-color-bg-surface-secondary); border-bottom: 2px solid var(--p-color-border); }
        .vg-matrix-table td { padding: 6px 10px; vertical-align: middle; border-bottom: 1px solid var(--p-color-border-subdued); }
        .vg-matrix-table tr:last-child td { border-bottom: none; }
        .vg-matrix-table tr:hover td { background: var(--p-color-bg-surface-hover, rgba(0,0,0,0.015)); }
        .vg-img-thumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: 6px; overflow: hidden; border: 1px solid var(--p-color-border); background: var(--p-color-bg-fill-secondary); display: flex; align-items: center; justify-content: center; }
        .vg-img-thumb.is-override { border-color: var(--p-color-border-info); box-shadow: 0 0 0 2px var(--p-color-bg-fill-info, rgba(0,113,227,0.1)); }
        .vg-img-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .vg-clear-override { font-size: 10px; color: var(--p-color-text-subdued); background: none; border: none; cursor: pointer; padding: 0; margin-top: 2px; display: block; }
        .vg-clear-override:hover { color: var(--p-color-text-critical); text-decoration: underline; }
        .checkbox-container { cursor: pointer; flex-shrink: 0; }
        .checkbox-container input { display: none; }
        .checkbox-container svg { overflow: visible; display: block; }
        .checkbox-path { fill: none; stroke: var(--p-color-border); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; transition: stroke-dasharray 0.35s ease, stroke-dashoffset 0.35s ease, stroke 0.2s; stroke-dasharray: 241 9999999; stroke-dashoffset: 0; }
        .checkbox-container input:checked ~ svg .checkbox-path { stroke: var(--p-color-bg-fill-brand); stroke-dasharray: 70.5 9999999; stroke-dashoffset: -262.27; }
      `}</style>

      {message.text && (
        <Box paddingBlockEnd="200">
          <Banner tone={message.type === "success" ? "success" : "critical"} onDismiss={() => setMessage({ type: "", text: "" })}>{message.text}</Banner>
        </Box>
      )}

      <div className="product-edit-header">
        <Link href="/products/inventory" className="product-edit-title-link" style={{ marginRight: 4 }}>
          <span style={{ display: "flex", alignItems: "center", width: 20, height: 20 }}><ProductIcon /></span>
          <span className="product-edit-name">{isNew ? "New product" : (product?.title || "Product")}</span>
        </Link>
        <span style={{ flex: 1 }} />
        {!isNew && (
          <Popover active={moreActionsOpen} onClose={() => setMoreActionsOpen(false)} activator={<Button size="slim" icon={MenuHorizontalIcon} onClick={() => setMoreActionsOpen(true)} accessibilityLabel="More actions" style={{ background: "#1f2937", color: "#fff", border: "none" }}>More actions</Button>} autofocusTarget="first-node">
            <ActionList
              items={[
                { content: "Duplicate", onAction: () => { setMoreActionsOpen(false); openDuplicateModal(); } },
                { content: "Delete", destructive: true, onAction: () => { setMoreActionsOpen(false); setDeleteConfirmOpen(true); } },
              ]}
            />
          </Popover>
        )}
      </div>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="bodyMd" fontWeight="regular">Title</Text>
              <TextField label="Title" labelHidden value={product.title || ""} onChange={(v) => update({ title: v })} placeholder="e.g. Cotton T-Shirt" autoComplete="off" />

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">SKU & EAN</Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="240px" flex="1">
                  <TextField label="SKU" labelHidden value={product.sku || ""} onChange={(v) => update({ sku: v })} placeholder="SKU" autoComplete="off" />
                </Box>
                <Box minWidth="240px" flex="1">
                  <TextField label="EAN" labelHidden value={getMeta(product, "ean")} onChange={(v) => updateMeta("ean", v)} placeholder="EAN / Barcode" autoComplete="off" />
                </Box>
              </InlineStack>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Category & Brand</Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="280px" flex="1">
                  <Select
                    label="Category"
                    labelHidden
                    options={[{ label: "— None —", value: "" }, ...(categories || []).map((c) => ({ label: c.name, value: c.id }))]}
                    value={getMeta(product, "category_id")}
                    onChange={(v) => updateMeta("category_id", v)}
                  />
                </Box>
                <Box minWidth="280px" flex="1">
                  <Select
                    label="Brand"
                    labelHidden
                    options={[{ label: "— None —", value: "" }, ...(brands || []).map((b) => ({ label: b.name, value: b.id }))]}
                    value={getMeta(product, "brand_id") || ""}
                    onChange={(v) => updateMeta("brand_id", v || undefined)}
                  />
                </Box>
              </InlineStack>

              <Divider />
              <BlockStack gap="200">
                <Text as="h2" variant="bodyMd" fontWeight="regular">Description</Text>
                <div className="product-description-box">
                  <div className="product-description-toolbar">
                    <div className="product-description-toolbar-left">
                      {descriptionMode === "visual" && (
                        <>
                          <button type="button" className="product-desc-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }} title="Bold" aria-label="Bold">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fillRule="evenodd" d="M5 1a1.5 1.5 0 0 0-1.5 1.5v10.461c0 .85.689 1.539 1.538 1.539h4.462a3.999 3.999 0 0 0 2.316-7.262 3.999 3.999 0 0 0-3.316-6.238zm3.5 5.5a1.5 1.5 0 0 0 0-3h-2.5v3zm-2.5 2.5v3h3.5a1.5 1.5 0 0 0 0-3z" /></svg>
                          </button>
                          <button type="button" className="product-desc-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }} title="Italic" aria-label="Italic">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M5.5 2.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-2.344l-2.273 10h2.117a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1 0-1.5h2.345l2.272-10h-2.117a.75.75 0 0 1-.75-.75" /></svg>
                          </button>
                          <button type="button" className="product-desc-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand("underline"); }} title="Underline" aria-label="Underline">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M5.25 1.75a.75.75 0 0 0-1.5 0v6a4.25 4.25 0 0 0 8.5 0v-6a.75.75 0 0 0-1.5 0v6a2.75 2.75 0 1 1-5.5 0z" /><path d="M2.75 13.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5z" /></svg>
                          </button>
                          <span className="product-desc-divider" aria-hidden />
                          <button type="button" className="product-desc-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertUnorderedList"); }} title="Bulleted list" aria-label="Bulleted list">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2" /><path d="M2 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2" /><path d="M3 13a1 1 0 1 1-2 0 1 1 0 0 1 2 0" /><path d="M5.25 2.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z" /><path d="M4.5 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1-.75-.75" /><path d="M5.25 12.25a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 0-1.5z" /></svg>
                          </button>
                          <button type="button" className="product-desc-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand("insertOrderedList"); }} title="Numbered list" aria-label="Numbered list">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M5.75 2.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z" /><path d="M5.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5z" /><path d="M5 13a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 5 13" /><path d="M2.25 5.75a1.5 1.5 0 0 0-1.5 1.5.5.5 0 0 0 1 0 .5.5 0 0 1 1 0v.05a.5.5 0 0 1-.168.375l-1.423 1.264c-.515.459-.191 1.311.499 1.311h1.592a.5.5 0 0 0 0-1h-.935l.932-.828c.32-.285.503-.693.503-1.121v-.051a1.5 1.5 0 0 0-1.5-1.5" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`product-desc-html-btn ${descriptionMode === "html" ? "active" : ""}`}
                      onClick={() => {
                        if (descriptionMode === "visual" && descEditorRef.current) {
                          const html = descriptionVisualToHtml(descEditorRef.current.innerHTML || "");
                          update({ description: html });
                        } else if (descriptionMode !== "visual" && descEditorRef.current) {
                          descEditorRef.current.innerHTML = product.description || "";
                        }
                        setDescriptionMode(descriptionMode === "html" ? "visual" : "html");
                      }}
                      title={descriptionMode === "html" ? "Show visual" : "Show HTML"}
                      aria-label={descriptionMode === "html" ? "Show visual" : "Show HTML"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M10.221 2.956a.75.75 0 0 0-1.442-.412l-3 10.5a.75.75 0 0 0 1.442.412z" /><path d="M5.03 4.22a.75.75 0 0 1 0 1.06l-2.72 2.72 2.72 2.72a.749.749 0 1 1-1.06 1.06l-3.25-3.25a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0" /><path d="M10.97 11.78a.75.75 0 0 1 0-1.06l2.72-2.72-2.72-2.72a.749.749 0 1 1 1.06-1.06l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0" /></svg>
                    </button>
                  </div>
                  {descriptionMode === "html" ? (
                    <textarea
                      className="product-description-html"
                      value={product.description || ""}
                      onChange={(e) => update({ description: e.target.value })}
                      rows={10}
                      spellCheck={false}
                    />
                  ) : (
                    <div
                      ref={descEditorRef}
                      className="product-description-editor"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={() => { if (descEditorRef.current) update({ description: descriptionVisualToHtml(descEditorRef.current.innerHTML || "") }); }}
                    />
                  )}
                </div>
                <p className="product-description-hint">Shown on the product page. Changes are saved when you blur the field or switch mode.</p>
              </BlockStack>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Media</Text>
              <div className="product-media-grid">
                {mediaUrls.map((url, i) => (
                  <div key={i} className="product-media-item">
                    <img src={url.startsWith("http") || url.startsWith("data:") ? url : `${baseUrl}${url}`} alt="" />
                    <button type="button" className="product-media-remove" onClick={() => removeMedia(i)} aria-label="Remove image">×</button>
                  </div>
                ))}
                {mediaUrls.length < 6 && (
                  <div className="product-media-add" role="button" tabIndex={0} title="Görsel ekle" onClick={() => setMediaPickerOpen(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5z" /></svg>
                  </div>
                )}
              </div>
              {/* ── Product media picker ── */}
              <MediaPickerModal
                open={mediaPickerOpen}
                onClose={() => setMediaPickerOpen(false)}
                title="Görsel seç"
                multiple
                onSelect={(urls) => {
                  const toAdd = urls.slice(0, Math.max(0, 6 - mediaUrls.length));
                  if (toAdd.length) updateMeta("media", [...mediaUrls, ...toAdd].slice(0, 6));
                }}
              />

              {/* ── Variant image picker ── */}
              <MediaPickerModal
                open={variantImgPickerTarget !== null}
                onClose={() => setVariantImgPickerTarget(null)}
                title={variantImgPickerTarget ? `Görsel — ${variantImgPickerTarget.join(" / ")}` : "Varyant görseli"}
                multiple={false}
                onSelect={(urls) => {
                  if (variantImgPickerTarget && urls[0]) {
                    updateMatrixVariant(variantImgPickerTarget, "image_url", urls[0]);
                  }
                  setVariantImgPickerTarget(null);
                }}
              />

              {/* ── Swatch image picker ── */}
              <MediaPickerModal
                open={swatchPickerTarget !== null}
                onClose={() => setSwatchPickerTarget(null)}
                title={swatchPickerTarget
                  ? `Swatch — "${variantGroups[swatchPickerTarget.gi]?.options?.[swatchPickerTarget.oi]?.value || "option"}"`
                  : "Swatch görseli"}
                multiple={false}
                onSelect={(urls) => {
                  if (swatchPickerTarget && urls[0]) {
                    vg_setOption(swatchPickerTarget.gi, swatchPickerTarget.oi, "swatch_image", urls[0]);
                  }
                  setSwatchPickerTarget(null);
                }}
              />

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Pricing</Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="120px">
                  <div className="product-edit-label">UVP (MSRP)</div>
                  <TextField type="number" value={uvp != null ? String(uvp) : ""} onChange={(v) => updateMeta("uvp_cents", v === "" ? undefined : Math.round(parseFloat(v) * 100))} placeholder="Optional — leer lassen möglich" prefix="€" />
                </Box>
                <Box minWidth="120px">
                  <div className="product-edit-label">Gross price (€, inkl. 19 % MwSt.)</div>
                  <TextField
                    type="number"
                    step="0.01"
                    value={product.price != null ? String(product.price) : ""}
                    onChange={(v) => {
                      const num = v === "" ? 0 : parseFloat(v);
                      if (!Number.isNaN(num)) update({ price: num });
                    }}
                    placeholder="0.00"
                    prefix="€"
                  />
                </Box>
                <Box minWidth="120px">
                  <div className="product-edit-label">Sale price</div>
                  <TextField type="number" value={rabattpreis != null ? String(rabattpreis) : ""} onChange={(v) => updateMeta("rabattpreis_cents", v === "" ? "" : Math.round(parseFloat(v) * 100))} placeholder="—" prefix="€" />
                </Box>
              </InlineStack>
              {hasDiscount && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Display: <span className="product-price-strike">€{(price != null ? Number(price).toFixed(2).replace(".", ",") : "0,00")}</span> → €{(displayPrice != null ? Number(displayPrice).toFixed(2).replace(".", ",") : "0,00")}
                </Text>
              )}

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Bullet points (max 5, je max. 120 Zeichen)</Text>
              <Text as="p" variant="bodySm" tone="subdued">Short selling points shown on the product page.</Text>
              {[0, 1, 2, 3, 4].map((i) => {
                const arr = Array.isArray(meta.bullet_points) ? meta.bullet_points : [];
                const val = arr[i] ?? "";
                const len = String(val).length;
                const overLimit = len > 120;
                return (
                  <Box key={i}>
                    <TextField
                      label={`Bullet ${i + 1}`}
                      labelHidden
                      value={val}
                      maxLength={120}
                      onChange={(v) => {
                        const trimmed = String(v).slice(0, 120);
                        const next = [...(Array.isArray(meta.bullet_points) ? meta.bullet_points : []).slice(0, 5)];
                        while (next.length <= i) next.push("");
                        next[i] = trimmed;
                        updateMeta("bullet_points", next.filter((x, j) => j < 5));
                      }}
                      placeholder={i === 0 ? "e.g. Premium quality" : ""}
                      autoComplete="off"
                    />
                    <Text as="p" variant="bodySm" tone="subdued" style={{ marginTop: 4, color: overLimit ? "var(--p-color-text-critical)" : undefined }}>
                      {len} / 120
                    </Text>
                  </Box>
                );
              })}

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Inventory</Text>
              <Box minWidth="120px">
                <TextField label="Quantity" labelHidden type="number" value={product.inventory != null ? String(product.inventory) : "0"} onChange={(v) => update({ inventory: parseInt(v, 10) || 0 })} min={0} />
              </Box>
              <Text as="p" variant="bodySm" tone="subdued">Warehouse split can be set later in metadata.</Text>

              <Divider />

              {/* ════════════════════════════════════════════════════════
                  VARIATION ENGINE  (Amazon / eBay style)
                  1. Define groups + options  →  2. Matrix auto-generates
                  ════════════════════════════════════════════════════════ */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <Text as="h2" variant="bodyMd" fontWeight="semibold">Variations</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Add groups (e.g. Color, Size). Variant combinations are auto-generated.
                  </Text>
                </div>
                <Button variant="primary" size="slim" onClick={vg_addGroup}>+ Add Group</Button>
              </div>

              {/* ── Step 1: Group definitions ── */}
              {variantGroups.length === 0 && (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--p-color-text-subdued)", fontSize: 13 }}>
                  No variant groups yet. Click <strong>+ Add Group</strong> to start.
                </div>
              )}

              <BlockStack gap="300">
                {variantGroups.map((group, gi) => (
                  <div
                    key={gi}
                    className="vg-group"
                    draggable
                    onDragStart={() => { dragGroupIdx.current = gi; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      const from = dragGroupIdx.current;
                      dragGroupIdx.current = null;
                      if (from !== null && from !== gi) vg_moveGroup(from, gi);
                    }}
                  >
                    {/* Group header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span className="vg-drag-handle" title="Drag to reorder">⠿</span>
                      <div style={{ flex: 1, maxWidth: 200 }}>
                        <TextField
                          label="Group name"
                          labelHidden
                          value={group.name}
                          onChange={(v) => vg_setGroupName(gi, v)}
                          placeholder="e.g. Color, Size, Material"
                          autoComplete="off"
                        />
                      </div>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {(group.options || []).filter((o) => o.value.trim()).length} option(s)
                      </Text>
                      <Button size="slim" variant="plain" tone="critical" onClick={() => vg_removeGroup(gi)}>
                        Remove
                      </Button>
                    </div>

                    {/* Options row */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {(group.options || []).map((opt, oi) => (
                        <div key={oi} className="vg-option-chip">
                          {/* Swatch button — click to open picker */}
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <button
                              type="button"
                              className={opt.swatch_image ? "vg-swatch" : "vg-swatch-empty"}
                              title={opt.swatch_image ? "Swatch görselini değiştir" : "Swatch görseli ekle (shopta renk/desen simgesi)"}
                              onClick={() => openSwatchPicker(gi, oi)}
                            >
                              {opt.swatch_image
                                ? <img src={resolveMediaUrl(opt.swatch_image)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <span style={{ fontSize: 10, lineHeight: 1, color: "#6b7280" }}>SW</span>}
                            </button>
                            {opt.swatch_image && (
                              <button
                                type="button"
                                style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: "#de3618", border: "none", color: "#fff", fontSize: 9, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                                onClick={(e) => { e.stopPropagation(); vg_setOption(gi, oi, "swatch_image", ""); }}
                                title="Remove swatch"
                              >×</button>
                            )}
                          </div>
                          {/* Value input */}
                          <input
                            type="text"
                            value={opt.value}
                            onChange={(e) => vg_setOption(gi, oi, "value", e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                vg_addOption(gi);
                              }
                            }}
                            placeholder="Value"
                          />
                          <button type="button" className="vg-remove-btn" onClick={() => vg_removeOption(gi, oi)} title="Remove option">×</button>
                        </div>
                      ))}
                      <Button size="slim" variant="plain" onClick={() => vg_addOption(gi)}>+ Add option</Button>
                    </div>
                  </div>
                ))}
              </BlockStack>

              {/* ── Step 2: Variation Matrix ── */}
              {variantGroups.length > 0 && (() => {
                const matrixRows = (product?.variants || []).filter((v) => Array.isArray(v.option_values));
                if (matrixRows.length === 0) return (
                  <div style={{ padding: "12px 16px", background: "var(--p-color-bg-surface-warning, #fffbeb)", borderRadius: 8, fontSize: 13, color: "var(--p-color-text-subdued)" }}>
                    Add at least one option to each group to generate combinations.
                  </div>
                );
                return (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Variation Matrix — {matrixRows.length} {matrixRows.length === 1 ? "variant" : "variants"}
                      </Text>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="vg-matrix-table">
                        <thead>
                          <tr>
                            {variantGroups.map((g, gi) => (
                              <th key={gi}>{g.name || `Group ${gi + 1}`}</th>
                            ))}
                            <th>Image</th>
                            <th>SKU</th>
                            <th>EAN</th>
                            <th>Stock</th>
                            <th>Price (€)</th>
                            <th>UVP (€)</th>
                            <th>Sale (€)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrixRows.map((v, vi) => {
                            // 2-level image: group swatch (level 1) → variant override (level 2)
                            const groupSwatchUrl = (() => {
                              const firstGroupOpts = variantGroups[0]?.options || [];
                              const firstVal = v.option_values[0] ?? "";
                              const matched = firstGroupOpts.find((o) => o.value === firstVal);
                              return matched?.swatch_image ? resolveMediaUrl(matched.swatch_image) : null;
                            })();
                            const overrideUrl = v.image_url ? resolveMediaUrl(v.image_url) : null;
                            const effectiveImg = overrideUrl || groupSwatchUrl;
                            const isOverride = !!overrideUrl;

                            return (
                              <tr key={vi}>
                                {/* Option values — read-only cells */}
                                {v.option_values.map((val, oi) => {
                                  const swatchUrl = variantGroups[oi]?.options?.find((o) => o.value === val)?.swatch_image;
                                  return (
                                    <td key={oi} style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                                      {swatchUrl ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                          <span style={{ width: 14, height: 14, borderRadius: "50%", display: "inline-block", backgroundImage: `url(${resolveMediaUrl(swatchUrl)})`, backgroundSize: "cover", flexShrink: 0, border: "1px solid var(--p-color-border)" }} />
                                          {val}
                                        </span>
                                      ) : val}
                                    </td>
                                  );
                                })}

                                {/* Image */}
                                <td>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                    <button
                                      type="button"
                                      className={`vg-img-thumb${isOverride ? " is-override" : ""}`}
                                      style={{ cursor: "pointer", padding: 0, border: isOverride ? "2px solid var(--p-color-border-info)" : "1px solid var(--p-color-border)" }}
                                      onClick={() => openVariantImgPicker(v.option_values)}
                                      title="Click to choose image"
                                    >
                                      {effectiveImg
                                        ? <img src={effectiveImg} alt="" />
                                        : <span style={{ fontSize: 9, color: "var(--p-color-text-subdued)" }}>+</span>}
                                    </button>
                                    <div style={{ flex: 1, minWidth: 80 }}>
                                      <TextField
                                        label="" labelHidden
                                        value={v.image_url ?? ""}
                                        onChange={(val) => updateMatrixVariant(v.option_values, "image_url", val)}
                                        placeholder={groupSwatchUrl ? "Override…" : "Image URL"}
                                        autoComplete="off"
                                      />
                                      {isOverride && (
                                        <button type="button" className="vg-clear-override" onClick={() => updateMatrixVariant(v.option_values, "image_url", "")}>
                                          Clear override
                                        </button>
                                      )}
                                      {!isOverride && groupSwatchUrl && (
                                        <span style={{ fontSize: 10, color: "var(--p-color-text-subdued)", display: "block", marginTop: 2 }}>Using group swatch</span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                {/* SKU */}
                                <td><TextField label="" labelHidden value={v.sku ?? ""} onChange={(val) => updateMatrixVariant(v.option_values, "sku", val)} placeholder="SKU" autoComplete="off" /></td>
                                {/* EAN */}
                                <td><TextField label="" labelHidden value={v.ean ?? ""} onChange={(val) => updateMatrixVariant(v.option_values, "ean", val)} placeholder="EAN" autoComplete="off" /></td>
                                {/* Stock */}
                                <td><TextField label="" labelHidden type="number" min={0} value={v.inventory != null ? String(v.inventory) : "0"} onChange={(val) => updateMatrixVariant(v.option_values, "inventory", val)} placeholder="0" /></td>
                                {/* Price */}
                                {(() => {
                                  const vkey = Array.isArray(v.option_values) ? v.option_values.join("\u0000") : "";
                                  const mkDraftKey = (f) => `${vkey}_${f}`;
                                  const priceFields = [
                                    { f: "price",            centsKey: "price_cents",            placeholder: "0.00" },
                                    { f: "compare_at_price", centsKey: "compare_at_price_cents",  placeholder: "—"    },
                                    { f: "sale_price",       centsKey: "sale_price_cents",        placeholder: "—"    },
                                  ];
                                  return priceFields.map(({ f, centsKey, placeholder }) => {
                                    const dk = mkDraftKey(f);
                                    const isDraft = dk in priceInputs;
                                    const displayVal = isDraft
                                      ? priceInputs[dk]
                                      : (v[centsKey] != null ? (Number(v[centsKey]) / 100).toFixed(2) : "");
                                    return (
                                      <td key={f}>
                                        <TextField
                                          label=""
                                          labelHidden
                                          value={displayVal}
                                          placeholder={placeholder}
                                          autoComplete="off"
                                          onChange={(val) => {
                                            // Only allow digits, dot, comma
                                            const clean = val.replace(",", ".");
                                            setPriceInputs((prev) => ({ ...prev, [dk]: clean }));
                                          }}
                                          onBlur={() => {
                                            const raw = priceInputs[dk];
                                            if (raw !== undefined) {
                                              updateMatrixVariant(v.option_values, f, raw);
                                              setPriceInputs((prev) => {
                                                const next = { ...prev };
                                                delete next[dk];
                                                return next;
                                              });
                                            }
                                          }}
                                        />
                                      </td>
                                    );
                                  });
                                })()}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Metafields (catalog)</Text>
              <Text as="p" variant="bodySm" tone="subdued">e.g. Material: 100% Cotton. Key = metafield name from catalog.</Text>
              {metafieldsList.length > 0 ? (
                metafieldsList.map((item, i) => (
                  <InlineStack key={i} gap="200" wrap>
                    <TextField label="Key" labelHidden value={item.key || ""} onChange={(v) => { const arr = [...metafieldsList]; arr[i] = { ...arr[i], key: v }; updateMeta("metafields", arr); }} placeholder="e.g. Material" />
                    <TextField label="Value" labelHidden value={item.value || ""} onChange={(v) => { const arr = [...metafieldsList]; arr[i] = { ...arr[i], value: v }; updateMeta("metafields", arr); }} placeholder="e.g. 100% Cotton" />
                  </InlineStack>
                ))
              ) : null}
              <Button variant="secondary" size="slim" onClick={() => updateMeta("metafields", [...metafieldsList, { key: "", value: "" }])}>+ Metafield</Button>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Produktsicherheitsinformationen (GPSR, optional)</Text>
              <TextField label="Hersteller" value={meta.hersteller ?? ""} onChange={(v) => updateMeta("hersteller", v || undefined)} placeholder="Hersteller" autoComplete="off" />
              <TextField label="Hersteller-Informationen" value={meta.hersteller_information ?? ""} onChange={(v) => updateMeta("hersteller_information", v || undefined)} placeholder="Hersteller-Informationen" multiline={2} />
              <TextField label="Verantwortliche Person (EU)" value={meta.verantwortliche_person_information ?? ""} onChange={(v) => updateMeta("verantwortliche_person_information", v || undefined)} placeholder="Verantwortliche Person Information" multiline={2} />

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">SEO</Text>
              <TextField label="Meta title" value={meta.seo_meta_title ?? ""} onChange={(v) => updateMeta("seo_meta_title", v)} placeholder="Meta title" autoComplete="off" />
              <TextField label="Meta description" value={meta.seo_meta_description ?? ""} onChange={(v) => updateMeta("seo_meta_description", v)} placeholder="Meta description" multiline={2} />
              <TextField label="Keywords" value={meta.seo_keywords ?? ""} onChange={(v) => updateMeta("seo_keywords", v)} placeholder="keyword1, keyword2" autoComplete="off" />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="300">
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="bodyMd" fontWeight="regular">Status</Text>
                  <Select label="Status" labelHidden options={STATUS_OPTIONS} value={product.status || "draft"} onChange={(v) => update({ status: v })} />
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h2" variant="bodyMd" fontWeight="regular">Yayın tarihi (opsiyonel)</Text>
                  <TextField label="" labelHidden type="date" value={meta.publish_date ?? ""} onChange={(v) => updateMeta("publish_date", v || undefined)} placeholder="YYYY-MM-DD" helpText="İleri tarih seçilirse shop’ta “Pek yakında” gösterilir." />
                </BlockStack>

                <Divider />

                <div className={`collection-dropdown-card-wrap ${collectionPopoverOpen ? "collections-open" : ""}`} style={{ position: "relative", zIndex: collectionPopoverOpen ? 10000 : undefined, overflow: "visible" }}>
                  <BlockStack gap="200">
                    <Text as="h2" variant="bodyMd" fontWeight="regular">Collections</Text>
                    <div className="collection-dropdown-wrap">
                      <TextField
                        label=""
                        labelHidden
                        value={collectionSearch}
                        onChange={setCollectionSearch}
                        onFocus={() => setCollectionPopoverOpen(true)}
                        placeholder="Search collections…"
                        autoComplete="off"
                      />
                      <div className={`collection-dropdown-panel ${collectionPopoverOpen ? "open" : ""}`}>
                        {(collections || [])
                          .filter((c) => !collectionSearch.trim() || (c.title || c.handle || "").toLowerCase().includes(collectionSearch.toLowerCase()))
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="collection-dropdown-item"
                              onClick={() => {
                                const next = collectionIds.includes(c.id) ? collectionIds.filter((id) => id !== c.id) : [...collectionIds, c.id];
                                updateMeta("collection_ids", next);
                              }}
                            >
                              <span className="checkbox-container" style={{ pointerEvents: "none" }}>
                                <input type="checkbox" checked={collectionIds.includes(c.id)} readOnly tabIndex={-1} />
                                <svg viewBox="0 0 64 64" height="1.25em" width="1.25em">
                                  <path d="M 0 16 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 16 L 32 48 L 64 16 V 8 A 8 8 90 0 0 56 0 H 8 A 8 8 90 0 0 0 8 V 56 A 8 8 90 0 0 8 64 H 56 A 8 8 90 0 0 64 56 V 16" pathLength="575.0541381835938" className="checkbox-path" />
                                </svg>
                              </span>
                              <span>{c.title || c.handle || c.id}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                    {collectionPopoverOpen && <div style={{ position: "fixed", inset: 0, zIndex: 10001 }} onClick={() => setCollectionPopoverOpen(false)} aria-hidden />}
                    {collectionIds.length > 0 && (
                      <InlineStack gap="100" wrap>
                        {collectionIds.map((id) => {
                          const c = (collections || []).find((x) => x.id === id);
                          const label = c ? (c.title || c.handle || id) : id;
                          return (
                            <span
                              key={id}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 8px",
                                background: "var(--p-color-bg-fill-secondary)",
                                borderRadius: 6,
                                fontSize: 12,
                                color: "var(--p-color-text-subdued)",
                              }}
                            >
                              {label || "—"}
                              <button type="button" onClick={() => updateMeta("collection_ids", collectionIds.filter((x) => x !== id))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }} aria-label="Remove">×</button>
                            </span>
                          );
                        })}
                      </InlineStack>
                    )}
                  </BlockStack>
                </div>

                <Divider />

                <div style={{ position: "relative", zIndex: relatedProductPopoverOpen ? 10000 : undefined, overflow: "visible" }}>
                  <BlockStack gap="200">
                    <Text as="h2" variant="bodyMd" fontWeight="regular">Related products (Kunden kauften auch)</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Ürün sayfasında &quot;Kunden, die diesen Artikel gekauft haben, kauften auch&quot; bölümünde gösterilecek ürünler.</Text>
                    <TextField
                      label=""
                      labelHidden
                      value={relatedProductSearch}
                      onChange={setRelatedProductSearch}
                      onFocus={() => setRelatedProductPopoverOpen(true)}
                      placeholder="Ürün ara…"
                      autoComplete="off"
                    />
                    <div style={{ position: "relative" }}>
                      {relatedProductPopoverOpen && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            maxHeight: 280,
                            overflowY: "auto",
                            background: "var(--p-color-bg-surface)",
                            border: "1px solid var(--p-color-border)",
                            borderRadius: 8,
                            marginTop: 4,
                            zIndex: 10002,
                            boxShadow: "var(--p-shadow-400)",
                          }}
                        >
                          {(relatedProductsList || [])
                            .filter((p) => p.id !== product?.id && (!relatedProductSearch.trim() || (p.title || p.handle || "").toLowerCase().includes(relatedProductSearch.toLowerCase())))
                            .slice(0, 50)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", border: "none", background: relatedProductIds.includes(p.id) ? "var(--p-color-bg-fill-secondary)" : "transparent", cursor: "pointer", fontSize: 13 }}
                                onClick={() => {
                                  const next = relatedProductIds.includes(p.id) ? relatedProductIds.filter((id) => id !== p.id) : [...relatedProductIds, p.id];
                                  updateMeta("related_product_ids", next.length ? next : null);
                                }}
                              >
                                <span style={{ marginRight: 8 }}>{relatedProductIds.includes(p.id) ? "✓" : ""}</span>
                                {p.title || p.handle || p.id}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    {relatedProductPopoverOpen && <div style={{ position: "fixed", inset: 0, zIndex: 10001 }} onClick={() => setRelatedProductPopoverOpen(false)} aria-hidden />}
                    {relatedProductIds.length > 0 && (
                      <InlineStack gap="100" wrap>
                        {relatedProductIds.map((id) => {
                          const p = (relatedProductsList || []).find((x) => x.id === id);
                          const label = p ? (p.title || p.handle || id) : id;
                          return (
                            <span
                              key={id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "var(--p-color-bg-fill-secondary)", borderRadius: 6, fontSize: 12, color: "var(--p-color-text-subdued)" }}
                            >
                              {String(label).slice(0, 40)}{String(label).length > 40 ? "…" : ""}
                              <button type="button" onClick={() => updateMeta("related_product_ids", relatedProductIds.filter((x) => x !== id).length ? relatedProductIds.filter((x) => x !== id) : null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }} aria-label="Remove">×</button>
                            </span>
                          );
                        })}
                      </InlineStack>
                    )}
                  </BlockStack>
                </div>

                <Divider />

                <BlockStack gap="200">
                  <Text as="h2" variant="bodyMd" fontWeight="regular">Sales</Text>
                  <Text as="p" variant="bodyMd">{meta.sales_count != null ? meta.sales_count : 0} sales</Text>
                </BlockStack>

                <Divider />

                <BlockStack gap="200">
                  <Text as="h2" variant="bodyMd" fontWeight="regular">Type</Text>
                  <TextField label="Product type" labelHidden value={meta.type ?? ""} onChange={(v) => updateMeta("type", v)} placeholder="e.g. T-Shirt" autoComplete="off" />
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="bodyMd" fontWeight="regular">Weight & dimensions</Text>
                <TextField label="Weight (g)" labelHidden type="number" value={meta.weight_grams != null ? String(meta.weight_grams) : ""} onChange={(v) => updateMeta("weight_grams", v === "" ? "" : parseInt(v, 10))} placeholder="grams" />
                <InlineStack gap="200">
                  <TextField label="L (cm)" labelHidden type="number" value={meta.dimensions_length != null ? String(meta.dimensions_length) : ""} onChange={(v) => updateMeta("dimensions_length", v)} placeholder="L" />
                  <TextField label="W (cm)" labelHidden type="number" value={meta.dimensions_width != null ? String(meta.dimensions_width) : ""} onChange={(v) => updateMeta("dimensions_width", v)} placeholder="W" />
                  <TextField label="H (cm)" labelHidden type="number" value={meta.dimensions_height != null ? String(meta.dimensions_height) : ""} onChange={(v) => updateMeta("dimensions_height", v)} placeholder="H" />
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="bodyMd" fontWeight="regular">Content per unit</Text>
                <Text as="p" variant="bodySm" tone="subdued">Shown on product e.g. &quot;Content: 200 g (€5.00* / 1 kg)&quot;. Enter the amount, unit, and reference quantity for the price per unit.</Text>
                <TextField label="Amount" labelHidden type="number" value={meta.unit_value != null ? String(meta.unit_value) : ""} onChange={(v) => updateMeta("unit_value", v)} placeholder="e.g. 200" helpText="Numeric amount (e.g. 200 for 200 g)" />
                <Select label="Unit" options={UNIT_TYPE_OPTIONS} value={meta.unit_type ?? ""} onChange={(v) => updateMeta("unit_type", v)} />
                <TextField label="Reference quantity" labelHidden type="number" value={meta.unit_reference != null ? String(meta.unit_reference) : "1"} onChange={(v) => updateMeta("unit_reference", v)} placeholder="1" helpText="Reference for price per unit (e.g. 1 = per 1 kg when unit is kg)" />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      {deleteConfirmOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeleteConfirmOpen(false)}>
          <div style={{ background: "var(--p-color-bg-surface)", padding: 24, borderRadius: 12, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <Text as="p" variant="bodyMd">Delete "{product.title}"?</Text>
            <InlineStack gap="200" blockAlign="end">
              <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
              <Button variant="primary" tone="critical" onClick={() => { setDeleteConfirmOpen(false); deleteProduct(); }}>Delete</Button>
            </InlineStack>
          </div>
        </div>
      )}

      <Modal
        open={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        title="Duplicate product"
        primaryAction={{
          content: "Create duplicate",
          onAction: runDuplicate,
          loading: duplicateSaving,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDuplicateModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              Choose what to copy into the new product. <strong>SKU and EAN are never copied</strong> and must be set for the new product.
            </Text>
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
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
