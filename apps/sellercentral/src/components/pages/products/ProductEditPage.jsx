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
  DropZone,
  SkeletonBodyText,
  SkeletonDisplayText,
  Popover,
  ActionList,
  Modal,
  Thumbnail,
  Checkbox,
} from "@shopify/polaris";
import { ProductIcon, MenuHorizontalIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle } from "@/lib/slugify";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";

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
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaLibraryList, setMediaLibraryList] = useState([]);
  const [mediaPickerSelected, setMediaPickerSelected] = useState(() => new Set());
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionPopoverOpen, setCollectionPopoverOpen] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState("visual");
  const descEditorRef = useRef(null);
  const initialSnapshotRef = useRef(null);
  const [expandedVariantIndex, setExpandedVariantIndex] = useState(null);
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
      const payload = {
        title: opt.title ? (product.title || "").trim() + " (Copy)" : "Untitled",
        handle: (product.handle || "product").replace(/-kopie-\d+$/, "") + "-kopie-" + Date.now(),
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

  // Variant groups: each group has a name (e.g. Color, Size) and options (value, sku, inventory). No auto-append.
  // Support both price/compare_at_price and price_cents/compare_at_price_cents from API/DB.
  const variantGroups = (() => {
    const v = product?.variants;
    if (!Array.isArray(v) || v.length === 0) return [];
    const byTitle = new Map();
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const title = String(item.title ?? item.name ?? "Variant").trim() || "Variant";
      const value = item.value ?? (Array.isArray(item.options) ? item.options.map((o) => (o && o.value) || o).filter(Boolean).join(", ") : "");
      const sku = String(item.sku ?? item.sku_number ?? "").trim();
      const ean = String(item.ean ?? "").trim();
      const inventory = item.inventory != null ? String(item.inventory) : "";
      const price = item.price != null ? String(item.price) : (item.price_cents != null ? String((Number(item.price_cents) / 100).toFixed(2)) : "");
      const compare_at_price = item.compare_at_price != null ? String(item.compare_at_price) : (item.compare_at_price_cents != null ? String((Number(item.compare_at_price_cents) / 100).toFixed(2)) : "");
      const image_url = String(item.image_url ?? item.image ?? "").trim();
      if (!byTitle.has(title)) byTitle.set(title, { name: title, options: [] });
      byTitle.get(title).options.push({ value: String(value), sku, ean, inventory, price, compare_at_price, image_url });
    }
    return Array.from(byTitle.values());
  })();

  const setVariantGroups = (next) => {
    const flat = next.flatMap((g) =>
      (g.options || []).map((o) => {
        const priceNum = o.price !== "" && o.price != null && !Number.isNaN(parseFloat(o.price)) ? parseFloat(o.price) : null;
        const compareNum = o.compare_at_price !== "" && o.compare_at_price != null && !Number.isNaN(parseFloat(o.compare_at_price)) ? parseFloat(o.compare_at_price) : null;
        return {
          title: (g.name || "Variant").trim() || "Variant",
          value: (o.value ?? "").toString().trim(),
          sku: (o.sku ?? "").toString().trim(),
          ean: (o.ean ?? "").toString().trim() || undefined,
          inventory: o.inventory !== "" && o.inventory != null ? parseInt(String(o.inventory), 10) : 0,
          ...(priceNum != null && { price_cents: Math.round(priceNum * 100) }),
          ...(compareNum != null && { compare_at_price_cents: Math.round(compareNum * 100) }),
          image_url: (o.image_url ?? "").toString().trim() || undefined,
        };
      })
    );
    update({ variants: flat });
  };

  const updateVariantGroupName = (groupIndex, name) => {
    const next = variantGroups.map((g, i) => (i === groupIndex ? { ...g, name: name || g.name } : g));
    setVariantGroups(next);
  };
  const updateVariantGroupOption = (groupIndex, optionIndex, field, value) => {
    const next = variantGroups.map((g, i) => {
      if (i !== groupIndex) return g;
      const opts = [...(g.options || [])];
      if (!opts[optionIndex]) return g;
      opts[optionIndex] = { ...opts[optionIndex], [field]: value };
      return { ...g, options: opts };
    });
    setVariantGroups(next);
  };
  const addVariantGroupOption = (groupIndex) => {
    const next = variantGroups.map((g, i) => (i === groupIndex ? { ...g, options: [...(g.options || []), { value: "", sku: "", ean: "", inventory: "", price: "", compare_at_price: "", image_url: "" }] } : g));
    setVariantGroups(next);
  };
  const removeVariantGroupOption = (groupIndex, optionIndex) => {
    const next = variantGroups.map((g, i) => {
      if (i !== groupIndex) return g;
      const opts = (g.options || []).filter((_, j) => j !== optionIndex);
      return { ...g, options: opts };
    });
    setVariantGroups(next);
  };
  const addVariantGroup = () => {
    setVariantGroups([...variantGroups, { name: "", options: [{ value: "", sku: "", ean: "", inventory: "", price: "", compare_at_price: "", image_url: "" }] }]);
  };
  const removeVariantGroup = (groupIndex) => {
    setVariantGroups(variantGroups.filter((_, i) => i !== groupIndex));
  };

  const removeMedia = (index) => {
    const next = mediaUrls.filter((_, i) => i !== index);
    updateMeta("media", next);
  };
  const addMediaByUrl = () => {
    const url = (mediaUrlInput || "").trim();
    if (!url) return;
    const valid = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
    if (!valid) {
      setMessage({ type: "error", text: "Please enter a valid URL (http:// or https://)" });
      return;
    }
    if (mediaUrls.length >= 6) {
      setMessage({ type: "error", text: "Maximum 6 images allowed." });
      return;
    }
    updateMeta("media", [...mediaUrls, url].slice(0, 6));
    setMediaUrlInput("");
  };
  const resolveMediaUrl = (url) => {
    if (!url) return "";
    return url.startsWith("http") || url.startsWith("data:") ? url : `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
  };
  const openMediaPicker = () => {
    setMediaPickerSelected(new Set());
    setMediaPickerOpen(true);
    client.getMedia({ limit: 100 }).then((r) => setMediaLibraryList(r.media || [])).catch(() => setMediaLibraryList([]));
  };
  const toggleMediaPickerSelection = (item) => {
    const url = item?.url ? resolveMediaUrl(item.url) : "";
    if (!url) return;
    setMediaPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };
  const addSelectedMediaToProduct = () => {
    const toAdd = Array.from(mediaPickerSelected).slice(0, Math.max(0, 6 - mediaUrls.length));
    if (toAdd.length) updateMeta("media", [...mediaUrls, ...toAdd].slice(0, 6));
    setMediaPickerOpen(false);
    setMediaPickerSelected(new Set());
  };
  const uploadMediaInPicker = useCallback(
    (files) => {
      setMediaUploading(true);
      const fileList = Array.isArray(files) ? files : [files];
      Promise.all(
        fileList.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
          // Store relative path; resolveMediaUrl is used only for display in admin.
          return client.uploadMedia(fd).then((r) => (r.url ? r.url : null));
        })
      )
        .then((urls) => {
          const newUrls = urls.filter(Boolean);
          if (newUrls.length) {
            setMediaLibraryList((prev) => {
              const added = newUrls.map((u) => ({ id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: u }));
              return [...added, ...prev];
            });
            setMediaPickerSelected((prev) => {
              const next = new Set(prev);
              newUrls.forEach((u) => next.add(u));
              return next;
            });
          }
        })
        .catch((err) => setMessage({ type: "error", text: err?.message || "Upload failed" }))
        .finally(() => setMediaUploading(false));
    },
    [client, baseUrl]
  );

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
                  <div className="product-media-add" role="button" tabIndex={0} title="Select from media library" onClick={openMediaPicker}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5z" /></svg>
                  </div>
                )}
              </div>
              {mediaUrls.length < 6 && (
                <Box paddingBlockStart="300">
                  <InlineStack gap="200" blockAlign="center" wrap>
                    <Text as="span" variant="bodySm" fontWeight="medium">Add by URL:</Text>
                  <Box minWidth="280px" flex="1">
                    <TextField
                      label="Image URL"
                      labelHidden
                      value={mediaUrlInput}
                      onChange={setMediaUrlInput}
                      placeholder="https://example.com/image.jpg"
                      autoComplete="off"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMediaByUrl(); } }}
                    />
                  </Box>
                    <Button size="slim" variant="secondary" onClick={addMediaByUrl} disabled={!mediaUrlInput.trim()}>
                      Add
                    </Button>
                  </InlineStack>
                </Box>
              )}
              {mediaUploading && <Text as="p" variant="bodySm" tone="subdued">Uploading…</Text>}
              <Modal
                open={mediaPickerOpen}
                onClose={() => { setMediaPickerOpen(false); setMediaPickerSelected(new Set()); }}
                title="Select media"
                size="large"
                primaryAction={{ content: "Add", onAction: addSelectedMediaToProduct, disabled: mediaPickerSelected.size === 0 || mediaUrls.length >= 6 }}
              >
                <Modal.Section>
                  <div className="product-media-picker-grid">
                    <DropZone accept="image/*" type="image" onDropAccepted={uploadMediaInPicker} allowMultiple>
                      <div className="product-media-picker-add" role="button" tabIndex={0} title="Upload from computer">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5z" /></svg>
                        <span className="product-media-picker-add-label">Upload</span>
                      </div>
                    </DropZone>
                    {mediaLibraryList.map((item) => {
                      const url = item.url ? resolveMediaUrl(item.url) : "";
                      if (!url) return null;
                      const selected = mediaPickerSelected.has(url);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`product-media-picker-item ${selected ? "selected" : ""}`}
                          onClick={() => toggleMediaPickerSelection(item)}
                        >
                          <div className="product-media-picker-item-img">
                            <Thumbnail source={url} alt={item.alt || item.filename || ""} size="large" />
                          </div>
                          {selected && (
                            <span className="product-media-picker-tick" aria-hidden>
                              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" /></svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {mediaLibraryList.length === 0 && !mediaUploading && <Text as="p" tone="subdued">No media yet. Drop an image on the + square above or upload in Content → Media.</Text>}
                </Modal.Section>
              </Modal>

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
              <Text as="h2" variant="bodyMd" fontWeight="regular">Variants</Text>
              <Text as="p" variant="bodySm" tone="subdued">Variant group (e.g. Color) and rows: Görsel, Değer, SKU, EAN, Stok, Fiyat, UVP.</Text>
              {variantGroups.map((group, gi) => (
                <Box key={gi} padding="300" background="bg-surface-secondary" borderRadius="200" borderWidth="025" borderColor="border">
                  <InlineStack gap="200" wrap blockAlign="center" paddingBlockEnd="200">
                    <Box minWidth="140px">
                      <TextField label="Variant group name" labelHidden value={group.name} onChange={(val) => updateVariantGroupName(gi, val)} placeholder="e.g. Color, Size" autoComplete="off" />
                    </Box>
                    <Button size="slim" variant="plain" tone="critical" onClick={() => removeVariantGroup(gi)} aria-label="Remove group">Remove group</Button>
                    <Button size="slim" variant="plain" onClick={() => addVariantGroupOption(gi)}>+ Row</Button>
                  </InlineStack>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid var(--p-color-border)" }}>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Görsel</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Renk / Değer</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>SKU</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>EAN</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Stok</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Fiyat (€)</th>
                          <th style={{ textAlign: "left", padding: "8px", fontWeight: 600, color: "var(--p-color-text-subdued)" }}>UVP (€)</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {(group.options || []).map((opt, oi) => (
                          <tr key={oi} style={{ borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                            <td style={{ padding: "6px 8px", verticalAlign: "middle" }}>
                              <InlineStack gap="200" blockAlign="center">
                                <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "var(--p-color-bg-fill-secondary)" }}>
                                  {opt.image_url ? <img src={opt.image_url.startsWith("http") || opt.image_url.startsWith("data:") ? opt.image_url : `${baseUrl}${opt.image_url}`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, color: "var(--p-color-text-subdued)", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>—</span>}
                                </div>
                                <Box minWidth="120px"><TextField label="" labelHidden value={opt.image_url ?? ""} onChange={(val) => updateVariantGroupOption(gi, oi, "image_url", val)} placeholder="Görsel URL" autoComplete="off" /></Box>
                              </InlineStack>
                            </td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden value={opt.value} onChange={(val) => updateVariantGroupOption(gi, oi, "value", val)} placeholder="z.B. Rot" autoComplete="off" /></td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden value={opt.sku} onChange={(val) => updateVariantGroupOption(gi, oi, "sku", val)} placeholder="SKU" autoComplete="off" /></td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden value={opt.ean ?? ""} onChange={(val) => updateVariantGroupOption(gi, oi, "ean", val)} placeholder="EAN" autoComplete="off" /></td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden type="number" min={0} value={opt.inventory} onChange={(val) => updateVariantGroupOption(gi, oi, "inventory", val)} placeholder="0" /></td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden type="number" step="0.01" value={opt.price ?? ""} onChange={(val) => updateVariantGroupOption(gi, oi, "price", val)} placeholder="—" /></td>
                            <td style={{ padding: "6px 8px" }}><TextField label="" labelHidden type="number" step="0.01" value={opt.compare_at_price ?? ""} onChange={(val) => updateVariantGroupOption(gi, oi, "compare_at_price", val)} placeholder="—" /></td>
                            <td style={{ padding: "6px 8px" }}><Button size="slim" variant="plain" tone="critical" onClick={() => removeVariantGroupOption(gi, oi)} aria-label="Remove">×</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Box>
              ))}
              <Button variant="secondary" size="slim" onClick={addVariantGroup}>Add variant group</Button>

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
