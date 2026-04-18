"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Tag,
  Collapsible,
} from "@shopify/polaris";
import { ProductIcon, MenuHorizontalIcon, ViewIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { titleToHandle, sanitizeSeoHandleInput } from "@/lib/slugify";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import MediaPickerModal from "@/components/MediaPickerModal";
import CategoryDrilldownSelect from "@/components/inputs/CategoryDrilldownSelect";
import { routing } from "@/i18n/routing";
import { encodeVariantPathKey } from "@/lib/variant-path-key";

const getDefaultBaseUrl = () => {
  const env = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  return url || (typeof window !== "undefined" ? "http://localhost:9000" : "");
};

const getDefaultShopUrl = () => {
  const env = process.env.NEXT_PUBLIC_SHOP_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  if (url) return url.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") return "http://localhost:3000";
    return window.location.origin;
  }
  return "";
};

/** Digits + one decimal dot — avoids controlled type="number" + toFixed fighting mid-edit. */
function sanitizePriceDraftString(s) {
  const t = String(s ?? "").replace(",", ".");
  let out = "";
  let dot = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

/** Breadcrumb path from flat category list (parent_id links) for compact summaries. */
function categoryBreadcrumbFromFlatList(flatCategories, categoryId) {
  if (!categoryId || !Array.isArray(flatCategories) || flatCategories.length === 0) return "";
  const byId = new Map(flatCategories.map((c) => [String(c.id), c]));
  const parts = [];
  let cur = byId.get(String(categoryId));
  const seen = new Set();
  while (cur && !seen.has(String(cur.id))) {
    seen.add(String(cur.id));
    parts.unshift(String(cur.name || cur.slug || cur.id).trim());
    const pid = cur.parent_id != null ? String(cur.parent_id) : "";
    cur = pid && byId.has(pid) ? byId.get(pid) : null;
  }
  return parts.filter(Boolean).join(" › ");
}

function categoryLineageIdsFromFlatList(flatCategories, categoryId) {
  if (!categoryId || !Array.isArray(flatCategories) || flatCategories.length === 0) return [];
  const byId = new Map(flatCategories.map((c) => [String(c.id), c]));
  const out = [];
  let cur = byId.get(String(categoryId));
  const seen = new Set();
  while (cur && !seen.has(String(cur.id))) {
    seen.add(String(cur.id));
    out.push(String(cur.id));
    const pid = cur.parent_id != null ? String(cur.parent_id) : "";
    cur = pid && byId.has(pid) ? byId.get(pid) : null;
  }
  return out;
}

/** Per-locale variant image; no leaking another locale’s image into DE when `image_urls` is set. */
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

/** Option `value` = canonical key; `labels[locale]` = display string for seller + shop. */
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

const PRODUCT_COUNTRIES = [
  { code: "DE", label: "Deutschland",   flag: "🇩🇪", currency: "EUR", symbol: "€",   vatRate: 19,  taxLabel: "MwSt." },
  { code: "AT", label: "Österreich",    flag: "🇦🇹", currency: "EUR", symbol: "€",   vatRate: 20,  taxLabel: "MwSt." },
  { code: "CH", label: "Schweiz",       flag: "🇨🇭", currency: "CHF", symbol: "CHF", vatRate: 7.7, taxLabel: "MWST" },
  { code: "FR", label: "France",        flag: "🇫🇷", currency: "EUR", symbol: "€",   vatRate: 20,  taxLabel: "TVA" },
  { code: "IT", label: "Italia",        flag: "🇮🇹", currency: "EUR", symbol: "€",   vatRate: 22,  taxLabel: "IVA" },
  { code: "ES", label: "España",        flag: "🇪🇸", currency: "EUR", symbol: "€",   vatRate: 21,  taxLabel: "IVA" },
  { code: "TR", label: "Türkiye",       flag: "🇹🇷", currency: "TRY", symbol: "₺",   vatRate: 20,  taxLabel: "KDV" },
  { code: "US", label: "United States", flag: "🇺🇸", currency: "USD", symbol: "$",   vatRate: 0,   taxLabel: "Tax" },
];
const PRODUCT_COUNTRIES_MAP = Object.fromEntries(PRODUCT_COUNTRIES.map((c) => [c.code, c]));

/** Pricing country from app locale (globe). AT/CH are not separate here. */
const COUNTRY_FOR_UI_LOCALE = { de: "DE", en: "US", tr: "TR", fr: "FR", it: "IT", es: "ES" };

function defaultShopMarketForLocale(loc) {
  const l = String(loc || "de").toLowerCase();
  if (l === "en") return "gb";
  if (l === "tr") return "tr";
  if (l === "fr") return "fr";
  if (l === "it") return "it";
  if (l === "es") return "es";
  return "de";
}

function shopPreviewPrefix(loc) {
  const l = String(loc || "de").toLowerCase();
  return `/${defaultShopMarketForLocale(l)}/${l}/eur`;
}

function shopProductHandleForLocale(product, loc) {
  const tr = product?.metadata?.translations?.[loc];
  const h = (tr?.handle || "").trim();
  if (h) return h;
  return (product?.handle || "").trim();
}

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
  const shopBaseUrl = getDefaultShopUrl();
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
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [relatedProductsList, setRelatedProductsList] = useState([]);
  const [relatedProductSearch, setRelatedProductSearch] = useState("");
  const [relatedProductPopoverOpen, setRelatedProductPopoverOpen] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState("visual");
  const descEditorRef = useRef(null);
  const initialSnapshotRef = useRef(null);
  const afterCleanRef = useRef(false);
  const [expandedVariantIndex, setExpandedVariantIndex] = useState(null);
  const dragGroupIdx = useRef(null);
  const [eanLookupState, setEanLookupState] = useState(null); // null | "loading" | "found" | "not_found"
  // Variant image picker: null = closed, option_values[] = target variant being edited
  const [variantImgPickerTarget, setVariantImgPickerTarget] = useState(null);
  // Swatch image picker: null = closed, {gi, oi} = target group/option
  const [swatchPickerTarget, setSwatchPickerTarget] = useState(null);
  // Draft price strings keyed by `${variantKey}_${field}` — committed on blur
  const [priceInputs, setPriceInputs] = useState({});
  const priceInputsRef = useRef({});
  useEffect(() => {
    priceInputsRef.current = priceInputs;
  }, [priceInputs]);
  // Per-country pricing: draft strings (text) — committed on blur; avoids number input + immediate toFixed
  const [countryPriceDrafts, setCountryPriceDrafts] = useState({});
  const countryPriceDraftsRef = useRef({});
  useEffect(() => {
    countryPriceDraftsRef.current = countryPriceDrafts;
  }, [countryPriceDrafts]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateOptions, setDuplicateOptions] = useState(DEFAULT_DUPLICATE_OPTIONS);
  const [duplicateSaving, setDuplicateSaving] = useState(false);
  const editingCountry = COUNTRY_FOR_UI_LOCALE[locale] || "DE";
  const [shippingGroupsList, setShippingGroupsList] = useState([]);
  const [metaDefs, setMetaDefs] = useState({});
  const [metaDefSearch, setMetaDefSearch] = useState({});
  const [metaDefPopover, setMetaDefPopover] = useState({});
  /** Katalogdaki tüm tanımlar yerine: değeri olan veya kullanıcının eklediği metafield satırları */
  const [extraVisibleMetaDefKeys, setExtraVisibleMetaDefKeys] = useState({});
  const [addMetaDefPopoverOpen, setAddMetaDefPopoverOpen] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  /** Neues Katalog-Metafeld (Titel + Wert); Seller → Freigabe durch Superuser */
  const [newCatalogMetaOpen, setNewCatalogMetaOpen] = useState(false);
  const [newCatalogMetaLabel, setNewCatalogMetaLabel] = useState("");
  const [newCatalogMetaValue, setNewCatalogMetaValue] = useState("");
  const [newCatalogMetaKey, setNewCatalogMetaKey] = useState("");
  const [newCatalogMetaSaving, setNewCatalogMetaSaving] = useState(false);
  const [newCatalogMetaErr, setNewCatalogMetaErr] = useState("");

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (collectionPopoverOpen) document.body.classList.add("belucha-collections-dropdown-open");
    else document.body.classList.remove("belucha-collections-dropdown-open");
    return () => document.body.classList.remove("belucha-collections-dropdown-open");
  }, [collectionPopoverOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  // Sync from server when we switch product (id/handle) or locale. Merge translations[locale] into title/description.
  const initialProductId = initialProduct?.id ?? initialProduct?.handle ?? "";
  useEffect(() => {
    const next = initialProduct ?? (isNew ? getEmptyProduct() : null);
    if (!next) { setProduct((prev) => prev ?? null); return; }
    const tr = next.metadata?.translations;
    const localized = tr?.[locale] ? { ...next, title: tr[locale].title ?? next.title, description: tr[locale].description ?? next.description } : next;
    setProduct((prev) => {
      const prevKey = prev?.id ?? prev?.handle ?? "";
      if (prevKey && initialProductId && prevKey === initialProductId) {
        return { ...prev, title: localized.title, description: localized.description };
      }
      return localized;
    });
    // Snapshot must match what product state is set to (localized), not raw next
    initialSnapshotRef.current = JSON.stringify(normalizeForCompare(localized));
  }, [initialProductId, isNew, locale]);

  // Load categories, collections, brands in parallel so the page feels faster
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.getAdminHubCategories().then((r) => r.categories || []).catch(() => []),
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

  // Load metafield definitions from MetaObjects
  useEffect(() => {
    let cancelled = false;
    client.getMetafieldDefinitions().then((r) => {
      if (!cancelled) setMetaDefs(r?.definitions || {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [client]);

  // Başka ürüne geçince “ek satır” seçimlerini sıfırla
  useEffect(() => {
    setExtraVisibleMetaDefKeys({});
  }, [product?.id, product?.handle]);

  // Load shipping groups for the dropdown
  useEffect(() => {
    let cancelled = false;
    client.request("/admin-hub/v1/shipping-groups").then((r) => {
      if (!cancelled) setShippingGroupsList(r?.groups || []);
    }).catch(() => { if (!cancelled) setShippingGroupsList([]); });
    return () => { cancelled = true; };
  }, [client]);

  // Auto-prune stale related_product_ids if those products were deleted
  useEffect(() => {
    if (!product) return;
    if (!relatedProductsList.length) return; // list not loaded yet — don't prune
    const ids = Array.isArray(product?.metadata?.related_product_ids)
      ? product.metadata.related_product_ids
      : [];
    if (!ids.length) return;
    const valid = new Set(relatedProductsList.map((p) => p?.id).filter(Boolean));
    const next = ids.filter((id) => valid.has(id));
    if (next.length !== ids.length) {
      setProduct((prev) => {
        if (!prev) return prev;
        const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
        if (next.length) m.related_product_ids = next;
        else delete m.related_product_ids;
        return { ...prev, metadata: m };
      });
    }
  }, [product?.id, product?.metadata?.related_product_ids, relatedProductsList]);

  useEffect(() => {
    if (descriptionMode === "visual" && descEditorRef.current) {
      const tr = product?.metadata?.translations || {};
      const locData = tr[locale] || {};
      const desc = locale === "de"
        ? (locData.description ?? product?.description ?? "")
        : (locData.description ?? "");
      descEditorRef.current.innerHTML = desc;
    }
  }, [descriptionMode, locale, product?.description, product?.metadata?.translations]);

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
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;

  const handleDiscard = useCallback(() => {
    afterCleanRef.current = true;
    setTimeout(() => { afterCleanRef.current = false; }, 100);
    setProduct(initialProduct ?? (isNew ? getEmptyProduct() : null));
    if (initialProduct) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(initialProduct));
    else if (isNew) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(getEmptyProduct()));
    unsavedRef.current?.setDirty(false);
  }, [initialProduct, isNew]);

  useEffect(() => {
    if (isDirty && afterCleanRef.current) {
      afterCleanRef.current = false;
      if (product) initialSnapshotRef.current = JSON.stringify(normalizeForCompare(product));
      unsavedRef.current?.setDirty(false);
      return;
    }
    unsavedRef.current?.setDirty(isDirty);
  }, [isDirty]);

  useEffect(() => {
    afterCleanRef.current = true;
    setTimeout(() => { afterCleanRef.current = false; }, 100);
    unsavedRef.current?.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      afterCleanRef.current = false;
      unsavedRef.current?.clearHandlers();
      unsavedRef.current?.setDirty(false);
    };
  }, []);

  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};

  // Per-locale content for the currently editing locale
  const editingTr = (meta.translations || {})[locale] || {};
  const editingTitle = locale === "de" ? (editingTr.title ?? product?.title ?? "") : (editingTr.title ?? "");
  const editingDescription = locale === "de" ? (editingTr.description ?? product?.description ?? "") : (editingTr.description ?? "");
  const editingBullets = Array.isArray(editingTr.bullet_points)
    ? editingTr.bullet_points
    : (locale === "de" && Array.isArray(meta.bullet_points) ? meta.bullet_points : []);

  // EAN lookup: when a new product's EAN is filled in, check if a master product exists and pre-fill form.
  const handleEanBlur = useCallback(async () => {
    if (!isNew) return;
    const ean = getMeta(product, "ean");
    if (!ean || String(ean).trim().length < 8) return;
    setEanLookupState("loading");
    try {
      const match = await client.lookupProductByEan(String(ean).trim());
      if (match) {
        setEanLookupState("found");
        // Pre-fill form with existing master product data (keep seller-owned fields empty)
        setProduct((prev) => {
          if (!prev) return prev;
          const master = match;
          const masterMeta = (master.metadata && typeof master.metadata === "object") ? { ...master.metadata } : {};
          // Keep the new seller's own fields, copy catalog fields from master
          const mergedMeta = {
            ...masterMeta,
            ean: String(ean).trim(),
            sku: prev.metadata?.sku || "",
            // clear seller-specific fields
            seller_id: prev.metadata?.seller_id,
            shop_name: prev.metadata?.shop_name,
            seller_name: prev.metadata?.seller_name,
            brand_id: prev.metadata?.brand_id,
            shipping_group_id: prev.metadata?.shipping_group_id,
            related_product_ids: [],
          };
          return {
            ...prev,
            title: master.title || prev.title,
            description: master.description || prev.description,
            handle: master.handle || prev.handle,
            metadata: mergedMeta,
            variants: Array.isArray(master.variants) && master.variants.length > 0
              ? master.variants.map((v) => ({ ...v, sku: "", ean: "", inventory: 0, price: undefined, price_cents: 0 }))
              : prev.variants,
          };
        });
      } else {
        setEanLookupState("not_found");
        setTimeout(() => setEanLookupState(null), 3000);
      }
    } catch (_) {
      setEanLookupState(null);
    }
  }, [isNew, product, client]);

  // New product: URL handle follows the current locale title automatically (SEO slug).
  useEffect(() => {
    if (!isNew || !product) return;
    const src = (editingTitle || "").trim() || (product.title || "").trim();
    const next = titleToHandle(src);
    if (!next) return;
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      const tr = { ...(m.translations || {}) };
      if (locale === "de") {
        tr.de = { ...(tr.de || {}), handle: next };
        const cur = (prev.handle || "").trim();
        if (cur === next) return prev;
        return { ...prev, handle: next, metadata: { ...m, translations: tr } };
      }
      const locPrev = { ...(tr[locale] || {}) };
      const curH = (locPrev.handle || "").trim();
      if (curH === next) return prev;
      tr[locale] = { ...locPrev, handle: next };
      return { ...prev, metadata: { ...m, translations: tr } };
    });
  }, [isNew, editingTitle, product?.title, locale]);

  // Per-country pricing for the currently editing country
  const currentCountryConf = PRODUCT_COUNTRIES_MAP[editingCountry] || PRODUCT_COUNTRIES_MAP["DE"];
  const countryPriceData = (meta.prices || {})[editingCountry] || {};
  // DE fallback: if no prices set yet, use legacy product.price as brutto
  const cpBruttoCents = countryPriceData.brutto_cents != null
    ? Number(countryPriceData.brutto_cents)
    : (editingCountry === "DE" && product?.price != null ? Math.round(Number(product.price) * 100) : null);
  const cpNettoCents = countryPriceData.netto_cents != null
    ? Number(countryPriceData.netto_cents)
    : (cpBruttoCents != null && currentCountryConf.vatRate > 0
        ? Math.round(cpBruttoCents / (1 + currentCountryConf.vatRate / 100))
        : cpBruttoCents);
  const cpLinked = countryPriceData.linked !== false;
  const cpUvpCents = countryPriceData.uvp_cents != null ? Number(countryPriceData.uvp_cents) : (editingCountry === "DE" && meta.uvp_cents != null ? Number(meta.uvp_cents) : null);
  const cpSaleCents = countryPriceData.sale_cents != null ? Number(countryPriceData.sale_cents) : (editingCountry === "DE" && meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) : null);

  const update = useCallback((updates) => {
    setProduct((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  // ── Per-locale content helpers ──────────────────────────────────
  const updateLocaleField = useCallback((key, value) => {
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      const tr = { ...(m.translations || {}) };
      const locData = { ...(tr[locale] || {}) };
      if (key === "handle" && (value === "" || value == null)) delete locData.handle;
      else locData[key] = value;
      tr[locale] = locData;
      m.translations = tr;
      // Keep product.title / product.description in sync for the primary DE locale
      if (locale === "de") {
        if (key === "title") return { ...prev, title: value, metadata: m };
        if (key === "description") return { ...prev, description: value, metadata: m };
      }
      return { ...prev, metadata: m };
    });
  }, [locale]);

  // ── Per-country price helpers ────────────────────────────────────
  const updateCountryPrice = useCallback((field, cents) => {
    setProduct((prev) => {
      if (!prev) return prev;
      const countryConf = PRODUCT_COUNTRIES_MAP[editingCountry] || PRODUCT_COUNTRIES_MAP["DE"];
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      const prices = { ...(m.prices || {}) };
      const cp = { ...(prices[editingCountry] || {}) };
      cp[field] = cents;
      if (cp.linked !== false && cents != null) {
        if (field === "brutto_cents") cp.netto_cents = Math.round(cents / (1 + countryConf.vatRate / 100));
        else if (field === "netto_cents") cp.brutto_cents = Math.round(cents * (1 + countryConf.vatRate / 100));
      }
      prices[editingCountry] = cp;
      m.prices = prices;
      const extra = {};
      if (editingCountry === "DE") {
        const b = cp.brutto_cents;
        if (b != null) extra.price = b / 100;
      }
      return { ...prev, ...extra, metadata: m };
    });
  }, [editingCountry]);

  const toggleCountryPriceLock = useCallback(() => {
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      const prices = { ...(m.prices || {}) };
      const cp = { ...(prices[editingCountry] || {}) };
      cp.linked = cp.linked === false ? true : false;
      prices[editingCountry] = cp;
      m.prices = prices;
      return { ...prev, metadata: m };
    });
  }, [editingCountry]);

  /** Pass `rawFromDom` from blur `e.currentTarget.value` so the last keystroke is never lost (draft ref can lag one render). */
  const commitCountryPriceDraft = useCallback((draftKey, metadataField, linkedClearKey, rawFromDom) => {
    const fromRef = countryPriceDraftsRef.current[draftKey];
    const raw =
      rawFromDom !== undefined ? sanitizePriceDraftString(String(rawFromDom)) : fromRef;
    if (raw === undefined) return;
    const trimmed = String(raw).trim();
    const n = parseFloat(trimmed.replace(",", "."));
    updateCountryPrice(metadataField, trimmed === "" || Number.isNaN(n) ? null : Math.round(n * 100));
    setCountryPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[draftKey];
      if (linkedClearKey) delete next[linkedClearKey];
      countryPriceDraftsRef.current = next;
      return next;
    });
  }, [updateCountryPrice]);

  const updateMeta = useCallback((key, value) => {
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      if (value === "" || value == null) delete m[key]; else m[key] = value;
      return { ...prev, metadata: m };
    });
  }, []);

  const updateCategoryWithParents = useCallback((categoryId) => {
    const selected = String(categoryId || "").trim();
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      if (!selected) {
        delete m.category_id;
        delete m.admin_category_id;
        delete m.category_ids;
        return { ...prev, metadata: m };
      }
      const lineage = categoryLineageIdsFromFlatList(categories, selected);
      m.category_id = selected;
      m.admin_category_id = selected;
      m.category_ids = lineage.length > 0 ? lineage : [selected];
      return { ...prev, metadata: m };
    });
  }, [categories]);

  const save = async () => {
    if (!product) return;
    // Flush visual editor content for the current editing locale
    const editingDescToSave = descriptionMode === "visual" && descEditorRef.current
      ? descriptionVisualToHtml(descEditorRef.current.innerHTML || "")
      : editingDescription;
    const fallbackStatus = initialProduct?.status ?? "draft";
    const nextStatus = product.status != null && String(product.status).trim() !== ""
      ? String(product.status).trim()
      : fallbackStatus;
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      const metadata = { ...(product.metadata || {}) };
      const selectedCategoryId = String(metadata.category_id || "").trim();
      if (selectedCategoryId) {
        const lineage = categoryLineageIdsFromFlatList(categories, selectedCategoryId);
        metadata.category_id = selectedCategoryId;
        metadata.admin_category_id = selectedCategoryId;
        metadata.category_ids = lineage.length > 0 ? lineage : [selectedCategoryId];
      }
      const storeName = (typeof window !== "undefined" ? (localStorage.getItem("storeName") || "").trim() : "") || "";
      if (storeName) {
        metadata.seller_name = storeName;
        metadata.shop_name = storeName;
      }
      // Auto-fill publish_date when empty: prefer product created_at, else now.
      if (!metadata.publish_date) {
        const createdAt = product?.created_at ? new Date(product.created_at) : null;
        metadata.publish_date =
          createdAt && !isNaN(createdAt.getTime())
            ? createdAt.toISOString()
            : new Date().toISOString();
      }
      // Commit the currently editing locale's content
      const allTranslations = { ...(metadata.translations || {}) };
      allTranslations[locale] = {
        ...(allTranslations[locale] || {}),
        title: editingTitle || product.title || "Untitled",
        description: editingDescToSave,
        bullet_points: editingBullets,
      };
      // Ensure 'de' always has a canonical title for the shop
      if (!allTranslations.de?.title) {
        allTranslations.de = { ...(allTranslations.de || {}), title: product.title || "Untitled", description: product.description || "" };
      }
      const canonicalHandle =
        (product.handle || "").trim() ||
        titleToHandle(allTranslations.de?.title || product.title || "product") ||
        "product";
      allTranslations.de = { ...(allTranslations.de || {}), handle: canonicalHandle };
      metadata.translations = allTranslations;
      // variation_groups already in metadata (kept in sync by applyVariantGroups); re-serialize for safety
      if (variantGroups.length > 0) {
        metadata.variation_groups = variantGroups.map((g) => ({
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
      const variantsToSave = product.variants || [];
      const missingVariantEan = variantsToSave.find((row) => String(row?.ean || "").trim() === "");
      if (missingVariantEan) {
        setMessage({ type: "error", text: "Variant EAN darf nicht leer sein. Boş varyant EAN ile kayıt yapılamaz." });
        return;
      }
      const gpsrMissing = [];
      if (!String(metadata.hersteller || "").trim()) gpsrMissing.push("Hersteller");
      if (!String(metadata.hersteller_information || "").trim()) gpsrMissing.push("Hersteller-Informationen");
      if (!String(metadata.verantwortliche_person_information || "").trim()) gpsrMissing.push("Verantwortliche Person (EU)");
      if (gpsrMissing.length > 0) {
        setMessage({
          type: "error",
          text: `GPSR ist verpflichtend. Bitte folgende Felder ausfüllen: ${gpsrMissing.join(", ")}`,
        });
        return;
      }
      const collectionId = (metadata.collection_ids && metadata.collection_ids[0]) || product.collection_id || null;
      // Canonical title = DE locale (for backward compat with shop)
      const canonicalTitle = metadata.translations?.de?.title || product.title || "Untitled";
      // Canonical price = DE brutto price (for backward compat)
      const dePriceCents = (metadata.prices?.DE?.brutto_cents != null)
        ? Number(metadata.prices.DE.brutto_cents)
        : (product.price != null ? Math.round(Number(product.price) * 100) : 0);
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
      if (isNew) {
        const res = await client.createAdminHubProductRaw(payload);
        const created = res?.product ?? res;
        if (res?.deduplicated) {
          setMessage({ type: "success", text: "Vorhandenes Produkt gefunden — alle Felder wurden automatisch befüllt." });
        } else {
          setMessage({ type: "success", text: "Produkt erstellt." });
        }
        onReload?.();
        if (created?.id) router.push(`/products/${created.id}`);
        return;
      }
      const updatedRaw = await client.updateAdminHubProduct(idOrHandle, payload);

      // Handle suggestion_submitted (superuser review needed for shared catalog changes)
      if (updatedRaw?.suggestion_submitted) {
        setMessage({ type: "success", text: "Dein Änderungsvorschlag wurde eingereicht. Ein Superuser wird ihn prüfen." });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("belucha-notifications-refresh"));
        }
        setSaving(false);
        return;
      }

      // Handle listing_saved (seller-specific fields saved to listing, not master product)
      const resolvedProduct = updatedRaw?.product ?? updatedRaw;
      const savedProductRaw = (resolvedProduct && resolvedProduct.id) ? resolvedProduct : {
        ...product,
        ...payload,
        metadata: payload.metadata ?? product.metadata,
        variants: payload.variants ?? product.variants,
      };
      const savedTr = savedProductRaw?.metadata?.translations?.[locale];
      const savedProduct = savedTr
        ? {
            ...savedProductRaw,
            title: savedTr.title ?? savedProductRaw.title,
            description: savedTr.description ?? savedProductRaw.description,
          }
        : savedProductRaw;

      setProduct(savedProduct);
      initialSnapshotRef.current = JSON.stringify(normalizeForCompare(savedProduct));
      unsavedRef.current?.setDirty(false);
      setMessage({ type: "success", text: updatedRaw?.listing_saved ? "Preis, Bestand und eigene Daten gespeichert." : "Saved" });
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
      const origTitle = (product.title || "").trim();
      const newTitle = opt.title ? origTitle : "Untitled";
      // Handle uses original title slug + timestamp to keep it clean (no "copy")
      const payload = {
        title: newTitle,
        handle: titleToHandle(origTitle || "produkt") + "-" + Date.now().toString(36),
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
      if (created?.id) router.push(`/products/${created.id}`);
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

  const normalizeCatalogMetaKey = (raw, labelFallback) => {
    let k = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!k && labelFallback) {
      k = titleToHandle(String(labelFallback)).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    }
    return k || "";
  };

  const submitNewCatalogMetafield = async () => {
    setNewCatalogMetaErr("");
    const label = newCatalogMetaLabel.trim();
    const value = newCatalogMetaValue.trim();
    if (!label) {
      setNewCatalogMetaErr("Bitte Titel / Anzeigename angeben.");
      return;
    }
    if (!value) {
      setNewCatalogMetaErr("Bitte Inhalt / Wert angeben.");
      return;
    }
    const key = normalizeCatalogMetaKey(newCatalogMetaKey, label);
    if (!key) {
      setNewCatalogMetaErr("Ungültiger Key.");
      return;
    }
    setNewCatalogMetaSaving(true);
    try {
      const others = metafieldsList.filter((m) => m.key !== key);
      updateMeta("metafields", [...others, ...[value].map((v) => ({ key, value: v }))]);
      setExtraVisibleMetaDefKeys((p) => ({ ...p, [key]: true }));
      await client.submitMetafieldCatalogProposal({
        ...(newCatalogMetaKey.trim() ? { key } : {}),
        label,
        values: [value],
      });
      const defs = await client.getMetafieldDefinitions().catch(() => null);
      if (defs?.definitions) setMetaDefs(defs.definitions);
      setNewCatalogMetaOpen(false);
      setNewCatalogMetaLabel("");
      setNewCatalogMetaValue("");
      setNewCatalogMetaKey("");
      setMessage({
        type: "success",
        text: isSuperuser
          ? "Metafeld wurde im Katalog gespeichert."
          : "Vorschlag eingereicht — ein Superuser kann ihn unter Content → Metaobjects freigeben. Bitte Produkt speichern.",
      });
    } catch (e) {
      setNewCatalogMetaErr(e?.message || "Fehler");
    } finally {
      setNewCatalogMetaSaving(false);
    }
  };

  const metaDefKeysWithValues = useMemo(() => {
    const s = new Set();
    for (const m of metafieldsList) {
      if (!m?.key) continue;
      if (m.value != null && String(m.value).trim() !== "") s.add(m.key);
    }
    return s;
  }, [metafieldsList]);

  const visibleMetaDefEntries = useMemo(
    () =>
      Object.entries(metaDefs)
        .filter(([k]) => metaDefKeysWithValues.has(k) || extraVisibleMetaDefKeys[k])
        .sort(([a], [b]) => a.localeCompare(b)),
    [metaDefs, metaDefKeysWithValues, extraVisibleMetaDefKeys],
  );

  const hiddenMetaDefKeys = useMemo(
    () =>
      Object.keys(metaDefs)
        .filter((k) => !metaDefKeysWithValues.has(k) && !extraVisibleMetaDefKeys[k])
        .sort((a, b) => a.localeCompare(b)),
    [metaDefs, metaDefKeysWithValues, extraVisibleMetaDefKeys],
  );

  if (!product && !isNew) {
    return (
      <Page title="Product">
        <Card><BlockStack gap="300"><SkeletonDisplayText size="small" /><SkeletonBodyText lines={3} /></BlockStack></Card>
      </Page>
    );
  }

  const hasLocaleMedia =
    locale !== "de" &&
    Object.prototype.hasOwnProperty.call((meta.translations || {})[locale] || {}, "media");
  const mediaUrls = (() => {
    if (hasLocaleMedia) {
      const m = editingTr.media;
      if (Array.isArray(m)) return m.filter((u) => u != null && String(u).trim() !== "");
      return [];
    }
    const m = meta.media;
    if (Array.isArray(m)) return m.filter((u) => u != null && String(u).trim() !== "");
    if (m != null && String(m).trim() !== "") return [String(m)];
    return [];
  })();
  const collectionIds = Array.isArray(meta.collection_ids) ? meta.collection_ids : (meta.collection_id != null ? [meta.collection_id] : (product?.collection_id != null ? [product.collection_id] : []));
  const relatedProductIds = Array.isArray(meta.related_product_ids) ? meta.related_product_ids : [];

  const categorySummaryPath = categoryBreadcrumbFromFlatList(categories, getMeta(product, "category_id"));
  const brandIdSummary = getMeta(product, "brand_id");
  const brandSummaryLabel = brandIdSummary
    ? (brands || []).find((b) => String(b.id) === String(brandIdSummary))?.name || ""
    : "";
  const shipIdSummary = meta.shipping_group_id;
  const shipSummaryLabel = shipIdSummary
    ? shippingGroupsList.find((g) => String(g.id) === String(shipIdSummary))?.name || ""
    : "";
  const classificationChips = [];
  if (categorySummaryPath) classificationChips.push({ key: "cat", text: categorySummaryPath });
  if (brandSummaryLabel) classificationChips.push({ key: "brand", text: brandSummaryLabel });
  if (shipSummaryLabel) classificationChips.push({ key: "ship", text: `Versand: ${shipSummaryLabel}` });
  if (isSuperuser && collectionIds.length > 0) {
    classificationChips.push({
      key: "coll",
      text: `${collectionIds.length} Kollektion${collectionIds.length !== 1 ? "en" : ""}`,
    });
  }

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
        labels: typeof opt === "object" && opt.labels && typeof opt.labels === "object" ? { ...opt.labels } : {},
      })),
    }));
  })();

  const getGroupDisplayName = (gi) => {
    const g = variantGroups[gi];
    if (!g) return "";
    if (String(locale).toLowerCase() === "de") return g.name || "";
    const trLoc = (meta.translations || {})[locale] || {};
    const arr = trLoc.variation_groups;
    if (Array.isArray(arr) && arr[gi]?.name != null && String(arr[gi].name).trim() !== "") {
      return String(arr[gi].name);
    }
    return g.name || "";
  };

  const getOptionInputValue = (opt) => {
    if (!opt) return "";
    const labels = opt.labels && typeof opt.labels === "object" ? opt.labels : {};
    if (Object.prototype.hasOwnProperty.call(labels, locale)) {
      const s = labels[locale];
      if (s != null) return String(s);
    }
    return String(opt.value || "");
  };

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
        options: (g.options || []).map((o) => {
          const row = {
            value: String(o.value ?? "").trim(),
            ...(o.swatch_image ? { swatch_image: o.swatch_image } : {}),
          };
          if (o.labels && typeof o.labels === "object" && Object.keys(o.labels).length > 0) {
            row.labels = o.labels;
          }
          return row;
        }),
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
      } else if (field === "image_urls") {
        v.image_urls =
          value && typeof value === "object" && Object.keys(value).length > 0 ? value : undefined;
      } else {
        v[field] = value || undefined;
      }
      variants[idx] = v;
      return { ...prev, variants };
    });
  };

  /** Patch a key inside variant.metadata (for media array etc.) */
  const updateMatrixVariantMeta = (optionValues, metaKey, value) => {
    const key = Array.isArray(optionValues) ? optionValues.join("\u0000") : "";
    setProduct((prev) => {
      const variants = [...(prev?.variants || [])];
      const idx = variants.findIndex(
        (v) => Array.isArray(v.option_values) && v.option_values.join("\u0000") === key
      );
      if (idx < 0) return prev;
      const cur = variants[idx];
      const m = { ...(cur.metadata && typeof cur.metadata === "object" ? cur.metadata : {}) };
      if (value == null || (Array.isArray(value) && value.length === 0)) delete m[metaKey];
      else m[metaKey] = value;
      variants[idx] = { ...cur, metadata: m };
      return { ...prev, variants };
    });
  };

  // Group-level helpers — all go through applyVariantGroups
  const vg_addGroup = () =>
    applyVariantGroups([...variantGroups, { name: "", options: [{ value: "", swatch_image: "", labels: {} }] }]);
  const vg_removeGroup = (gi) =>
    applyVariantGroups(variantGroups.filter((_, i) => i !== gi));
  const vg_setGroupName = (gi, name) => {
    if (String(locale).toLowerCase() === "de") {
      applyVariantGroups(variantGroups.map((g, i) => (i === gi ? { ...g, name } : g)));
      return;
    }
    setProduct((prev) => {
      if (!prev) return prev;
      const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
      const tr = { ...(m.translations || {}) };
      const locData = { ...(tr[locale] || {}) };
      const n = variantGroups.length;
      const arr = Array.isArray(locData.variation_groups) ? [...locData.variation_groups] : [];
      while (arr.length < n) arr.push({});
      if (gi >= 0 && gi < n) arr[gi] = { ...arr[gi], name };
      locData.variation_groups = arr;
      tr[locale] = locData;
      m.translations = tr;
      return { ...prev, metadata: m };
    });
  };
  const vg_addOption = (gi) =>
    applyVariantGroups(variantGroups.map((g, i) =>
      i === gi ? { ...g, options: [...(g.options || []), { value: "", swatch_image: "", labels: {} }] } : g
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

  const handleOptionDisplayChange = (gi, oi, text) => {
    const g = variantGroups[gi];
    if (!g?.options?.[oi]) return;
    const opt = g.options[oi];
    const prevCanonical = String(opt.value || "").trim();
    const labels = { ...(opt.labels || {}) };

    if (!prevCanonical) {
      const t = String(text || "").trim();
      if (!t) {
        const nextLabels = { ...labels };
        delete nextLabels[locale];
        applyVariantGroups(
          variantGroups.map((gr, i) =>
            i !== gi
              ? gr
              : {
                  ...gr,
                  options: gr.options.map((o, j) => (j === oi ? { ...o, labels: nextLabels } : o)),
                }
          )
        );
        return;
      }
      const seeded = { ...labels };
      routing.locales.forEach((loc) => {
        if (seeded[loc] == null || String(seeded[loc]).trim() === "") seeded[loc] = t;
      });
      applyVariantGroups(
        variantGroups.map((gr, i) =>
          i !== gi
            ? gr
            : {
                ...gr,
                options: gr.options.map((o, j) => (j === oi ? { ...o, value: t, labels: seeded } : o)),
              }
        )
      );
      return;
    }

    applyVariantGroups(
      variantGroups.map((gr, i) =>
        i !== gi
          ? gr
          : {
              ...gr,
              options: gr.options.map((o, j) =>
                j === oi ? { ...o, labels: { ...(o.labels || {}), [locale]: text } } : o
              ),
            }
      )
    );
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
    if (locale === "de") updateMeta("media", next);
    else updateLocaleField("media", next);
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
        /* ── Variation engine — Groups ── */
        .vg-group { border: 1px solid var(--p-color-border); border-radius: 12px; padding: 0; background: var(--p-color-bg-surface); overflow: hidden; transition: box-shadow 0.15s; }
        .vg-group:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
        .vg-group[draggable]:active { cursor: grabbing; box-shadow: 0 8px 28px rgba(0,0,0,0.13); opacity: 0.92; }
        .vg-group-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--p-color-bg-surface-secondary); border-bottom: 1px solid var(--p-color-border-subdued); }
        .vg-group-body { padding: 14px 16px; }
        .vg-group-num { width: 22px; height: 22px; border-radius: 50%; background: var(--p-color-bg-fill-brand); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .vg-drag-handle { color: var(--p-color-icon-subdued); font-size: 18px; cursor: grab; user-select: none; flex-shrink: 0; padding: 2px 4px; border-radius: 4px; }
        .vg-drag-handle:hover { background: var(--p-color-bg-surface-hover); color: var(--p-color-icon); }
        .vg-option-chip { display: inline-flex; align-items: center; gap: 5px; background: var(--p-color-bg-surface-secondary); border: 1.5px solid var(--p-color-border); border-radius: 30px; padding: 4px 4px 4px 10px; transition: border-color .12s; }
        .vg-option-chip:focus-within { border-color: var(--p-color-border-focus, #005bd3); box-shadow: 0 0 0 2px rgba(0,91,211,.12); }
        .vg-option-chip input { border: none; outline: none; background: transparent; font-size: 13px; color: var(--p-color-text); min-width: 64px; width: 90px; }
        .vg-option-chip input::placeholder { color: var(--p-color-text-subdued); }
        .vg-remove-btn { border: none; background: none; cursor: pointer; color: var(--p-color-icon-subdued); font-size: 15px; line-height: 1; padding: 2px 5px; border-radius: 50%; display: inline-flex; align-items: center; }
        .vg-remove-btn:hover { color: var(--p-color-text-critical); background: var(--p-color-bg-fill-critical-secondary, rgba(222,54,24,0.08)); }
        .vg-swatch { width: 26px; height: 26px; border-radius: 50%; overflow: hidden; flex-shrink: 0; border: 1.5px solid var(--p-color-border); cursor: pointer; padding: 0; background: none; appearance: none; display: block; }
        .vg-swatch:hover { border-color: var(--p-color-border-hover); box-shadow: 0 0 0 3px rgba(0,113,227,0.12); }
        .vg-swatch-empty { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; border: 1.5px dashed var(--p-color-border); display: inline-flex; align-items: center; justify-content: center; color: var(--p-color-icon-subdued); font-size: 11px; cursor: pointer; padding: 0; background: none; appearance: none; }
        .vg-swatch-empty:hover { border-color: var(--p-color-border-info); background: rgba(0,113,227,0.04); }
        /* ── Variation engine — Matrix cards ── */
        .vm-card { border: 1px solid var(--p-color-border); border-radius: 10px; margin-bottom: 8px; background: var(--p-color-bg-surface); overflow: hidden; transition: box-shadow .12s; }
        .vm-card:last-child { margin-bottom: 0; }
        .vm-card-header { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; transition: background .1s; user-select: none; min-height: 52px; }
        .vm-card-header:hover { background: var(--p-color-bg-surface-hover, rgba(0,0,0,.02)); }
        .vm-thumb { width: 38px; height: 38px; border-radius: 6px; object-fit: cover; border: 1px solid var(--p-color-border); display: block; flex-shrink: 0; }
        .vm-thumb-empty { width: 38px; height: 38px; border-radius: 6px; border: 1.5px dashed var(--p-color-border); background: var(--p-color-bg-surface-secondary); display: flex; align-items: center; justify-content: center; color: var(--p-color-icon-subdued); font-size: 16px; flex-shrink: 0; }
        .vm-badge { display: inline-flex; align-items: center; gap: 5px; background: var(--p-color-bg-surface-secondary); border: 1px solid var(--p-color-border); border-radius: 20px; padding: 2px 10px; font-size: 12px; font-weight: 500; color: var(--p-color-text); white-space: nowrap; }
        .vm-stat { font-size: 12px; color: var(--p-color-text-subdued); white-space: nowrap; }
        .vm-stat strong { color: var(--p-color-text); font-weight: 600; }
        .vm-card-body { border-top: 1px solid var(--p-color-border-subdued); padding: 20px 18px; background: var(--p-color-bg-surface-secondary, #fafafa); display: flex; flex-direction: column; gap: 18px; }
        .vm-sub-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--p-color-text-subdued); margin-bottom: 8px; }
        .vm-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .vm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .vm-img-strip { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .vm-img-item { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
        .vm-img-item img { width: 52px; height: 52px; object-fit: cover; border-radius: 6px; border: 1px solid var(--p-color-border); display: block; }
        .vm-img-del { position: absolute; top: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,.55); color: #fff; font-size: 11px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
        .vm-img-del:hover { background: rgba(200,0,0,.8); }
        .vm-img-add { width: 52px; height: 52px; border-radius: 6px; border: 2px dashed var(--p-color-border); background: transparent; cursor: pointer; font-size: 20px; color: var(--p-color-text-subdued); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: border-color .12s, color .12s; }
        .vm-img-add:hover { border-color: var(--p-color-border-hover); color: var(--p-color-text); }
        .vm-expand-toggle { margin-left: auto; font-size: 11px; color: var(--p-color-text-subdued); flex-shrink: 0; transition: transform .2s; }
        .vm-card.is-open .vm-expand-toggle { transform: rotate(180deg); }
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
          <>
            {shopProductHandleForLocale(product, locale) && (
              <a
                href={`${shopBaseUrl}${shopPreviewPrefix(locale)}/produkt/${encodeURIComponent(shopProductHandleForLocale(product, locale))}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Button size="slim" icon={ViewIcon}>
                  View in shop
                </Button>
              </a>
            )}
            <Button size="slim" variant="primary" onClick={save} loading={saving}>
              Save
            </Button>
            <Popover active={moreActionsOpen} onClose={() => setMoreActionsOpen(false)} activator={<Button size="slim" icon={MenuHorizontalIcon} onClick={() => setMoreActionsOpen(true)} accessibilityLabel="More actions" style={{ background: "#1f2937", color: "#fff", border: "none" }}>More actions</Button>} autofocusTarget="first-node">
              <ActionList
                items={[
                  { content: "Duplicate", onAction: () => { setMoreActionsOpen(false); openDuplicateModal(); } },
                  { content: "Delete", destructive: true, onAction: () => { setMoreActionsOpen(false); setDeleteConfirmOpen(true); } },
                ]}
              />
            </Popover>
          </>
        )}
      </div>

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="bodyMd" fontWeight="regular">Title</Text>
              <TextField label="Title" labelHidden value={editingTitle} onChange={(v) => updateLocaleField("title", v)} placeholder="e.g. Cotton T-Shirt" autoComplete="off" />

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">SKU & EAN</Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="240px" flex="1">
                  <TextField label="SKU" labelHidden value={product.sku || ""} onChange={(v) => update({ sku: v })} placeholder="SKU" autoComplete="off" />
                </Box>
                <Box minWidth="240px" flex="1">
                  <TextField
                    label="EAN"
                    labelHidden
                    value={getMeta(product, "ean")}
                    onChange={(v) => { updateMeta("ean", v); setEanLookupState(null); }}
                    onBlur={handleEanBlur}
                    placeholder="EAN / Barcode"
                    autoComplete="off"
                    suffix={
                      eanLookupState === "loading" ? "⏳" :
                      eanLookupState === "found" ? "✓ Produktdaten geladen" :
                      eanLookupState === "not_found" ? "— Neu" : undefined
                    }
                  />
                </Box>
              </InlineStack>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Produkt-Etikett</Text>
              <Select
                label="Badge / Etikett"
                labelHidden
                options={[
                  { label: "Kein Etikett", value: "" },
                  { label: "⭐ Bestseller", value: "bestseller" },
                  { label: "🆕 Neu", value: "new" },
                  { label: "🔥 Sale", value: "sale" },
                ]}
                value={getMeta(product, "badge") || ""}
                onChange={(v) => updateMeta("badge", v || null)}
              />

              <Divider />
              <Box padding="400" background="bg-surface-secondary" borderRadius="300" borderWidth="025" borderColor="border">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="start" gap="400" wrap>
                    <BlockStack gap="150">
                      <Text as="h2" variant="headingSm">Shop-Zuordnung</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Kategorie, Marke, Versandgruppe{isSuperuser ? " und Kollektionen" : ""} — steuern Katalog und Shop-Navigation.
                      </Text>
                      {!classificationOpen && (
                        classificationChips.length > 0 ? (
                          <InlineStack gap="150" wrap blockAlign="center">
                            {classificationChips.map((c) => (
                              <Tag key={c.key}>{c.text}</Tag>
                            ))}
                          </InlineStack>
                        ) : (
                          <Text as="p" variant="bodySm" tone="subdued">Noch nicht zugeordnet — „Bearbeiten“ öffnen.</Text>
                        )
                      )}
                    </BlockStack>
                    <Box style={{ flexShrink: 0 }}>
                      <Button
                        onClick={() => setClassificationOpen((o) => !o)}
                        disclosure={classificationOpen ? "up" : "down"}
                        variant={classificationOpen ? "plain" : "primary"}
                      >
                        {classificationOpen ? "Einklappen" : "Bearbeiten"}
                      </Button>
                    </Box>
                  </InlineStack>

                  <Collapsible
                    open={classificationOpen}
                    id="product-classification-collapsible"
                    transition={{ duration: "220ms", timingFunction: "ease" }}
                  >
                    <BlockStack gap="400">
                      <Divider />
                      <InlineStack gap="500" wrap>
                        <Box minWidth="240px" flex="1">
                          <Text as="p" variant="bodySm" fontWeight="semibold">Kategorie</Text>
                          <Box paddingBlockStart="150">
                            <CategoryDrilldownSelect
                              label="Category"
                              labelHidden
                              categories={categories || []}
                              value={getMeta(product, "category_id")}
                              onChange={updateCategoryWithParents}
                              placeholder="Kategorie wählen"
                            />
                          </Box>
                        </Box>
                        <Box minWidth="240px" flex="1">
                          <Select
                            label="Marke"
                            options={[{ label: "— Keine —", value: "" }, ...(brands || []).map((b) => ({ label: b.name, value: b.id }))]}
                            value={getMeta(product, "brand_id") || ""}
                            onChange={(v) => updateMeta("brand_id", v || undefined)}
                          />
                        </Box>
                        <Box minWidth="240px" flex="1">
                          <Select
                            label="Versandgruppe"
                            options={[
                              { label: "— Keine —", value: "" },
                              ...shippingGroupsList.map((g) => ({ label: g.name, value: g.id })),
                            ]}
                            value={meta.shipping_group_id ?? ""}
                            onChange={(v) => updateMeta("shipping_group_id", v || undefined)}
                          />
                        </Box>
                      </InlineStack>

                      {isSuperuser && (
                        <>
                          <Divider />
                          <BlockStack gap="300">
                            <Text as="p" variant="bodySm" fontWeight="semibold">Kollektionen</Text>
                            <Text as="p" variant="bodySm" tone="subdued">Produkt kann mehreren Kollektionen zugeordnet werden (z. B. Sale, Saison).</Text>
                            <div className={`collection-dropdown-card-wrap ${collectionPopoverOpen ? "collections-open" : ""}`} style={{ position: "relative", zIndex: collectionPopoverOpen ? 10000 : undefined, overflow: "visible", maxWidth: "100%" }}>
                              <div className="collection-dropdown-wrap">
                                <TextField
                                  label="Kollektionen durchsuchen"
                                  labelHidden
                                  value={collectionSearch}
                                  onChange={setCollectionSearch}
                                  onFocus={() => setCollectionPopoverOpen(true)}
                                  placeholder="Kollektion suchen…"
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
                                    const collLabel = c ? (c.title || c.handle || id) : id;
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
                                        {collLabel || "—"}
                                        <button type="button" onClick={() => updateMeta("collection_ids", collectionIds.filter((x) => x !== id))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "inherit" }} aria-label="Remove">×</button>
                                      </span>
                                    );
                                  })}
                                </InlineStack>
                              )}
                            </div>
                          </BlockStack>
                        </>
                      )}
                    </BlockStack>
                  </Collapsible>
                </BlockStack>
              </Box>

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
                      value={editingDescription}
                      onChange={(e) => updateLocaleField("description", e.target.value)}
                      rows={10}
                      spellCheck={false}
                    />
                  ) : (
                    <div
                      ref={descEditorRef}
                      className="product-description-editor"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={() => { if (descEditorRef.current) updateLocaleField("description", descriptionVisualToHtml(descEditorRef.current.innerHTML || "")); }}
                    />
                  )}
                </div>
                <p className="product-description-hint">Shown on the product page. Changes are saved when you blur the field or switch mode.</p>
              </BlockStack>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Media</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Neue Bild-Uploads: JPEG oder PNG, mindestens 1000×1000 px; der Server speichert quadratisches WebP (1000×1000) für den Shop.
              </Text>
              {locale !== "de" && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {hasLocaleMedia
                    ? "Images for this language only. Clear all to fall back to German media."
                    : "Using German images until you add images for this language."}
                </Text>
              )}
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
                uploadPurpose="product"
                onSelect={(urls) => {
                  const toAdd = urls.slice(0, Math.max(0, 6 - mediaUrls.length));
                  if (!toAdd.length) return;
                  const merged = [...mediaUrls, ...toAdd].slice(0, 6);
                  if (locale === "de") updateMeta("media", merged);
                  else updateLocaleField("media", merged);
                }}
              />

              {/* ── Variant image picker (multiple) ── */}
              <MediaPickerModal
                open={variantImgPickerTarget !== null}
                onClose={() => setVariantImgPickerTarget(null)}
                title={
                  variantImgPickerTarget
                    ? `Görseller — ${variantImgPickerTarget.join(" / ")}`
                    : "Varyant görselleri"
                }
                multiple={true}
                uploadPurpose="product"
                onSelect={(urls) => {
                  if (!variantImgPickerTarget || !urls.length) {
                    setVariantImgPickerTarget(null);
                    return;
                  }
                  const row = (product?.variants || []).find(
                    (v) =>
                      Array.isArray(v.option_values) &&
                      v.option_values.join("\u0000") === variantImgPickerTarget.join("\u0000")
                  );
                  const existing = Array.isArray(row?.metadata?.media) ? row.metadata.media : [];
                  const merged = [...existing, ...urls].slice(0, 8);
                  updateMatrixVariantMeta(variantImgPickerTarget, "media", merged);
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

              <Text as="p" variant="bodySm" tone="subdued">
                {currentCountryConf.label} · {currentCountryConf.currency} · {currentCountryConf.taxLabel} {currentCountryConf.vatRate}%
              </Text>

              {/* Netto / Brutto with lock — currency shown beside field (Polaris prefix + controlled value breaks multi-char typing). */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <Box minWidth="130px" flex="1">
                  <div className="product-edit-label">Netto (exkl. {currentCountryConf.taxLabel})</div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                    <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 14, fontWeight: 600, color: "var(--p-color-text-subdued)", minWidth: "1.25em" }} aria-hidden>{currentCountryConf.symbol}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="Netto"
                        labelHidden
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={
                          (() => {
                            const dk = `${editingCountry}_netto_cents`;
                            return Object.prototype.hasOwnProperty.call(countryPriceDrafts, dk)
                              ? countryPriceDrafts[dk]
                              : cpNettoCents != null
                                ? (cpNettoCents / 100).toFixed(2)
                                : "";
                          })()
                        }
                        onChange={(v) => {
                          const dk = `${editingCountry}_netto_cents`;
                          const clean = sanitizePriceDraftString(v);
                          setCountryPriceDrafts((prev) => {
                            const next = { ...prev, [dk]: clean };
                            countryPriceDraftsRef.current = next;
                            return next;
                          });
                        }}
                        onBlur={(e) => {
                          const dk = `${editingCountry}_netto_cents`;
                          const clearBrutto = cpLinked ? `${editingCountry}_brutto_cents` : null;
                          commitCountryPriceDraft(dk, "netto_cents", clearBrutto, e.currentTarget.value);
                        }}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </Box>
                <div style={{ paddingBottom: 8 }}>
                  <button
                    type="button"
                    onClick={toggleCountryPriceLock}
                    title={cpLinked ? "Netto und Brutto entkoppeln" : "Netto und Brutto koppeln"}
                    style={{
                      width: 32, height: 32, borderRadius: 6, border: "1px solid #d1d5db",
                      background: cpLinked ? "#f0fdf4" : "#fafafa", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}
                  >
                    {cpLinked ? "🔒" : "🔓"}
                  </button>
                </div>
                <Box minWidth="130px" flex="1">
                  <div className="product-edit-label">Brutto (inkl. {currentCountryConf.taxLabel} {currentCountryConf.vatRate > 0 ? currentCountryConf.vatRate + "%" : ""})</div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                    <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 14, fontWeight: 600, color: "var(--p-color-text-subdued)", minWidth: "1.25em" }} aria-hidden>{currentCountryConf.symbol}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="Brutto"
                        labelHidden
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={
                          (() => {
                            const dk = `${editingCountry}_brutto_cents`;
                            return Object.prototype.hasOwnProperty.call(countryPriceDrafts, dk)
                              ? countryPriceDrafts[dk]
                              : cpBruttoCents != null
                                ? (cpBruttoCents / 100).toFixed(2)
                                : "";
                          })()
                        }
                        onChange={(v) => {
                          const dk = `${editingCountry}_brutto_cents`;
                          const clean = sanitizePriceDraftString(v);
                          setCountryPriceDrafts((prev) => {
                            const next = { ...prev, [dk]: clean };
                            countryPriceDraftsRef.current = next;
                            return next;
                          });
                        }}
                        onBlur={(e) => {
                          const dk = `${editingCountry}_brutto_cents`;
                          const clearNetto = cpLinked ? `${editingCountry}_netto_cents` : null;
                          commitCountryPriceDraft(dk, "brutto_cents", clearNetto, e.currentTarget.value);
                        }}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </Box>
                <Box minWidth="130px" flex="1">
                  <div className="product-edit-label">UVP</div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                    <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 14, fontWeight: 600, color: "var(--p-color-text-subdued)", minWidth: "1.25em" }} aria-hidden>{currentCountryConf.symbol}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="UVP"
                        labelHidden
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={
                          (() => {
                            const dk = `${editingCountry}_uvp_cents`;
                            return Object.prototype.hasOwnProperty.call(countryPriceDrafts, dk)
                              ? countryPriceDrafts[dk]
                              : cpUvpCents != null
                                ? (cpUvpCents / 100).toFixed(2)
                                : "";
                          })()
                        }
                        onChange={(v) => {
                          const dk = `${editingCountry}_uvp_cents`;
                          const clean = sanitizePriceDraftString(v);
                          setCountryPriceDrafts((prev) => {
                            const next = { ...prev, [dk]: clean };
                            countryPriceDraftsRef.current = next;
                            return next;
                          });
                        }}
                        onBlur={(e) => commitCountryPriceDraft(`${editingCountry}_uvp_cents`, "uvp_cents", null, e.currentTarget.value)}
                        placeholder="—"
                      />
                    </div>
                  </div>
                </Box>
                <Box minWidth="130px" flex="1">
                  <div className="product-edit-label">Sale-Preis</div>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
                    <span style={{ flexShrink: 0, alignSelf: "center", fontSize: 14, fontWeight: 600, color: "var(--p-color-text-subdued)", minWidth: "1.25em" }} aria-hidden>{currentCountryConf.symbol}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="Sale"
                        labelHidden
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={
                          (() => {
                            const dk = `${editingCountry}_sale_cents`;
                            return Object.prototype.hasOwnProperty.call(countryPriceDrafts, dk)
                              ? countryPriceDrafts[dk]
                              : cpSaleCents != null
                                ? (cpSaleCents / 100).toFixed(2)
                                : "";
                          })()
                        }
                        onChange={(v) => {
                          const dk = `${editingCountry}_sale_cents`;
                          const clean = sanitizePriceDraftString(v);
                          setCountryPriceDrafts((prev) => {
                            const next = { ...prev, [dk]: clean };
                            countryPriceDraftsRef.current = next;
                            return next;
                          });
                        }}
                        onBlur={(e) => commitCountryPriceDraft(`${editingCountry}_sale_cents`, "sale_cents", null, e.currentTarget.value)}
                        placeholder="—"
                      />
                    </div>
                  </div>
                </Box>
              </div>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Bullet points (max 5, je max. 120 Zeichen)</Text>
              <Text as="p" variant="bodySm" tone="subdued">Short selling points shown on the product page.</Text>
              {[0, 1, 2, 3, 4].map((i) => {
                const val = editingBullets[i] ?? "";
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
                        const next = [...editingBullets.slice(0, 5)];
                        while (next.length <= i) next.push("");
                        next[i] = trimmed;
                        updateLocaleField("bullet_points", next.filter((x, j) => j < 5));
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
                    Option values use one internal key (set on first entry); switch the globe to translate labels per language — shop shows the label for each locale.
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
                    <div className="vg-group-header">
                      <span className="vg-drag-handle" title="Drag to reorder">⠿</span>
                      <span className="vg-group-num">{gi + 1}</span>
                      <div style={{ flex: 1, maxWidth: 220 }}>
                        <TextField
                          label="Group name"
                          labelHidden
                          value={getGroupDisplayName(gi)}
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
                    <div className="vg-group-body">
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
                            value={getOptionInputValue(opt)}
                            onChange={(e) => handleOptionDisplayChange(gi, oi, e.target.value)}
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
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        Variation Matrix — {matrixRows.length} {matrixRows.length === 1 ? "variant" : "variants"}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">Click a variant to edit details</Text>
                    </div>
                    <div>
                      {matrixRows.map((v, vi) => {
                        const isOpen = expandedVariantIndex === vi;
                        const variantImgs = Array.isArray(v.metadata?.media) ? v.metadata.media : [];
                        const thumbUrl = variantImgs[0] ? resolveMediaUrl(variantImgs[0]) : null;
                        const vkey = Array.isArray(v.option_values) ? v.option_values.join("\u0000") : "";
                        const mkDraftKey = (f) => `${vkey}_${f}`;
                        const priceFields = [
                          { f: "price",            centsKey: "price_cents",            label: "Price (€)",   placeholder: "0.00" },
                          { f: "compare_at_price", centsKey: "compare_at_price_cents", label: "UVP (€)",     placeholder: "—"    },
                          { f: "sale_price",       centsKey: "sale_price_cents",       label: "Sale (€)",    placeholder: "—"    },
                        ];

                        return (
                          <div key={vi} className={`vm-card${isOpen ? " is-open" : ""}`}>
                            {/* Card header — click to expand */}
                            <div
                              className="vm-card-header"
                              onClick={() => setExpandedVariantIndex(isOpen ? null : vi)}
                            >
                              {/* Thumbnail */}
                              {thumbUrl
                                ? <img src={thumbUrl} alt="" className="vm-thumb" />
                                : <div className="vm-thumb-empty">+</div>
                              }

                              {/* Option badges */}
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1 }}>
                                {v.option_values.map((val, oi) => {
                                  const gOpt = variantGroups[oi];
                                  const opt = (gOpt?.options || []).find(
                                    (o) => String(o.value || "").trim().toLowerCase() === String(val || "").trim().toLowerCase()
                                  );
                                  const label = opt ? optionDisplayLabel(opt, locale) : val;
                                  const swatchUrl = opt?.swatch_image;
                                  return (
                                    <span key={oi} className="vm-badge">
                                      {swatchUrl && (
                                        <span style={{ width: 12, height: 12, borderRadius: "50%", display: "inline-block", backgroundImage: `url(${resolveMediaUrl(swatchUrl)})`, backgroundSize: "cover", border: "1px solid var(--p-color-border)", flexShrink: 0 }} />
                                      )}
                                      <span style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginRight: 2 }}>{getGroupDisplayName(oi) || gOpt?.name || `G${oi + 1}`}:</span>
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Quick stats */}
                              <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
                                {v.price_cents != null && (
                                  <span className="vm-stat"><strong>€{(Number(v.price_cents) / 100).toFixed(2)}</strong></span>
                                )}
                                <span className="vm-stat">Stock: <strong>{v.inventory ?? 0}</strong></span>
                              </div>

                              {/* Open link (not new) */}
                              {!isNew && (
                                <Link
                                  href={`/products/${idOrHandle}/variants/${encodeVariantPathKey(v.option_values)}`}
                                  style={{ fontSize: 12, fontWeight: 600, color: "var(--p-color-text-interactive)", flexShrink: 0, whiteSpace: "nowrap" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open →
                                </Link>
                              )}

                              <span className="vm-expand-toggle">▼</span>
                            </div>

                            {/* Card body — expanded */}
                            {isOpen && (
                              <div className="vm-card-body">
                                {/* Images */}
                                <div>
                                  <div className="vm-sub-label">Images</div>
                                  <div className="vm-img-strip">
                                    {variantImgs.map((imgUrl, imgIdx) => (
                                      <div key={imgIdx} className="vm-img-item">
                                        <img src={resolveMediaUrl(imgUrl)} alt="" />
                                        <button
                                          type="button"
                                          className="vm-img-del"
                                          onClick={() => {
                                            const next = variantImgs.filter((_, i) => i !== imgIdx);
                                            updateMatrixVariantMeta(v.option_values, "media", next.length ? next : null);
                                          }}
                                        >×</button>
                                      </div>
                                    ))}
                                    {variantImgs.length < 8 && (
                                      <button
                                        type="button"
                                        className="vm-img-add"
                                        onClick={() => openVariantImgPicker(v.option_values)}
                                      >+</button>
                                    )}
                                  </div>
                                </div>

                                {/* SKU / EAN / Stock */}
                                <div>
                                  <div className="vm-sub-label">Inventory & Identifiers</div>
                                  <div className="vm-grid-3">
                                    <TextField label="SKU" value={v.sku ?? ""} onChange={(val) => updateMatrixVariant(v.option_values, "sku", val)} placeholder="SKU" autoComplete="off" />
                                    <TextField
                                      label="EAN / GTIN"
                                      value={v.ean ?? ""}
                                      onChange={(val) => updateMatrixVariant(v.option_values, "ean", val)}
                                      placeholder="EAN"
                                      autoComplete="off"
                                      error={String(v.ean || "").trim() === "" ? "EAN required" : undefined}
                                    />
                                    <TextField label="Stock" type="number" min={0} value={v.inventory != null ? String(v.inventory) : "0"} onChange={(val) => updateMatrixVariant(v.option_values, "inventory", val)} placeholder="0" />
                                  </div>
                                </div>

                                {/* Prices */}
                                <div>
                                  <div className="vm-sub-label">Pricing</div>
                                  <div className="vm-grid-3">
                                    {priceFields.map(({ f, centsKey, label, placeholder }) => {
                                      const dk = mkDraftKey(f);
                                      const isDraft = Object.prototype.hasOwnProperty.call(priceInputs, dk);
                                      const displayVal = isDraft
                                        ? priceInputs[dk]
                                        : (v[centsKey] != null ? (Number(v[centsKey]) / 100).toFixed(2) : "");
                                      return (
                                        <TextField
                                          key={f}
                                          label={label}
                                          value={displayVal}
                                          placeholder={placeholder}
                                          autoComplete="off"
                                          onChange={(val) => {
                                            const clean = sanitizePriceDraftString(val);
                                            setPriceInputs((prev) => {
                                              const next = { ...prev, [dk]: clean };
                                              priceInputsRef.current = next;
                                              return next;
                                            });
                                          }}
                                          onBlur={(e) => {
                                            const raw = sanitizePriceDraftString(e.currentTarget.value);
                                            updateMatrixVariant(v.option_values, f, raw);
                                            setPriceInputs((prev) => {
                                              const next = { ...prev };
                                              delete next[dk];
                                              priceInputsRef.current = next;
                                              return next;
                                            });
                                          }}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Metafields (catalog)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Nur Metafelder mit gesetzten Werten — oder über „Metafeld hinzufügen“ ausgewählte — werden angezeigt (nicht der gesamte Katalog).
              </Text>
              <InlineStack gap="300" blockAlign="center" wrap>
                <Button size="slim" variant="primary" onClick={() => { setNewCatalogMetaErr(""); setNewCatalogMetaOpen(true); }}>
                  + Neues Metafeld (Katalog)
                </Button>
                {!isSuperuser ? (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Als Verkäufer: neuer Katalog-Eintrag wird vom Superuser unter Content → Metaobjects freigegeben.
                  </Text>
                ) : null}
              </InlineStack>
              {Object.keys(metaDefs).length === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Noch keine Katalog-Definitionen — du kannst mit „Neues Metafeld (Katalog)“ Titel und Wert anlegen (Superuser: sofort aktiv; Verkäufer: Freigabe nötig).
                </Text>
              ) : (
                <BlockStack gap="400">
                  {visibleMetaDefEntries.length === 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">Keine Metafelder für dieses Produkt. Unten kannst du welche hinzufügen.</Text>
                  )}
                  {visibleMetaDefEntries.map(([defKey, def]) => {
                    const selected = metafieldsList.filter(m => m.key === defKey).map(m => m.value).filter(Boolean);
                    const isOpen = !!metaDefPopover[defKey];
                    const search = metaDefSearch[defKey] || "";
                    const availableVals = (def.values || []).filter(v => !selected.includes(v) && v.toLowerCase().includes(search.toLowerCase()));
                    const canAddCustom = search.trim() && !selected.includes(search.trim()) && !(def.values || []).includes(search.trim());
                    const toggleVal = (val) => {
                      const others = metafieldsList.filter(m => m.key !== defKey);
                      const cur = selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val];
                      updateMeta("metafields", [...others, ...cur.map(v => ({ key: defKey, value: v }))]);
                    };
                    return (
                      <Box key={defKey}>
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" fontWeight="semibold">{def.label}</Text>
                          {selected.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {selected.map(val => (
                                <Tag key={val} onRemove={() => {
                                  const others = metafieldsList.filter(m => m.key !== defKey);
                                  updateMeta("metafields", [...others, ...selected.filter(v => v !== val).map(v => ({ key: defKey, value: v }))]);
                                }}>{val}</Tag>
                              ))}
                            </div>
                          )}
                          <Popover
                            active={isOpen}
                            onClose={() => setMetaDefPopover(p => ({ ...p, [defKey]: false }))}
                            activator={
                              <Button size="slim" variant="secondary" onClick={() => setMetaDefPopover(p => ({ ...p, [defKey]: !p[defKey] }))}>
                                + Wert wählen
                              </Button>
                            }
                          >
                            <div style={{ padding: 10, minWidth: 220 }}>
                              <TextField
                                label="Suchen"
                                labelHidden
                                placeholder="Suchen oder eingeben…"
                                value={search}
                                onChange={v => setMetaDefSearch(p => ({ ...p, [defKey]: v }))}
                                autoComplete="off"
                                size="slim"
                              />
                              <div style={{ marginTop: 8, maxHeight: 200, overflowY: "auto" }}>
                                {availableVals.map(val => (
                                  <div
                                    key={val}
                                    style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 4, fontSize: 13 }}
                                    onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                                    onMouseLeave={e => e.currentTarget.style.background = ""}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      toggleVal(val);
                                      setMetaDefSearch(p => ({ ...p, [defKey]: "" }));
                                      setMetaDefPopover(p => ({ ...p, [defKey]: false }));
                                    }}
                                  >{val}</div>
                                ))}
                                {canAddCustom && (
                                  <div
                                    style={{ padding: "6px 10px", cursor: "pointer", borderRadius: 4, fontSize: 13, fontStyle: "italic", color: "var(--p-color-text-subdued)" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                                    onMouseLeave={e => e.currentTarget.style.background = ""}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      toggleVal(search.trim());
                                      setMetaDefSearch(p => ({ ...p, [defKey]: "" }));
                                      setMetaDefPopover(p => ({ ...p, [defKey]: false }));
                                    }}
                                  >"{search.trim()}" hinzufügen</div>
                                )}
                                {availableVals.length === 0 && !canAddCustom && (
                                  <div style={{ padding: "6px 10px", fontSize: 13, color: "var(--p-color-text-subdued)" }}>Keine weiteren Optionen</div>
                                )}
                              </div>
                            </div>
                          </Popover>
                        </BlockStack>
                      </Box>
                    );
                  })}
                  {hiddenMetaDefKeys.length > 0 && (
                    <Popover
                      active={addMetaDefPopoverOpen}
                      onClose={() => setAddMetaDefPopoverOpen(false)}
                      activator={
                        <Button size="slim" variant="secondary" onClick={() => setAddMetaDefPopoverOpen((o) => !o)}>
                          + Metafeld hinzufügen
                        </Button>
                      }
                    >
                      <div style={{ maxHeight: 280, overflowY: "auto", minWidth: 220 }}>
                        <ActionList
                          items={hiddenMetaDefKeys.map((k) => ({
                            content: metaDefs[k]?.label || k,
                            onAction: () => {
                              setExtraVisibleMetaDefKeys((p) => ({ ...p, [k]: true }));
                              setAddMetaDefPopoverOpen(false);
                            },
                          }))}
                        />
                      </div>
                    </Popover>
                  )}
                </BlockStack>
              )}

              <Modal
                open={newCatalogMetaOpen}
                onClose={() => { if (!newCatalogMetaSaving) setNewCatalogMetaOpen(false); }}
                title="Neues Katalog-Metafeld"
                primaryAction={{
                  content: isSuperuser ? "Im Katalog speichern" : "Zur Freigabe einreichen",
                  onAction: submitNewCatalogMetafield,
                  loading: newCatalogMetaSaving,
                }}
                secondaryActions={[{ content: "Abbrechen", onAction: () => { if (!newCatalogMetaSaving) setNewCatalogMetaOpen(false); } }]}
              >
                <Modal.Section>
                  <BlockStack gap="400">
                    {newCatalogMetaErr ? <Banner tone="critical" onDismiss={() => setNewCatalogMetaErr("")}>{newCatalogMetaErr}</Banner> : null}
                    <TextField
                      label="Titel (Anzeigename)"
                      value={newCatalogMetaLabel}
                      onChange={setNewCatalogMetaLabel}
                      placeholder="z.B. Material, Zertifikat, Pflegehinweis"
                      autoComplete="off"
                    />
                    <TextField
                      label="Inhalt (Wert)"
                      value={newCatalogMetaValue}
                      onChange={setNewCatalogMetaValue}
                      placeholder="z.B. Baumwolle, OEKO-TEX, Maschinenwäsche 40°"
                      autoComplete="off"
                    />
                    <TextField
                      label="Key (optional)"
                      value={newCatalogMetaKey}
                      onChange={(v) => setNewCatalogMetaKey(v.toLowerCase())}
                      helpText="Leer lassen: wird aus dem Titel erzeugt (kleinbuchstaben, Unterstriche)."
                      autoComplete="off"
                    />
                  </BlockStack>
                </Modal.Section>
              </Modal>

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">Produktsicherheitsinformationen (GPSR)</Text>
              <TextField label="Hersteller" requiredIndicator value={meta.hersteller ?? ""} onChange={(v) => updateMeta("hersteller", v || undefined)} placeholder="Hersteller" autoComplete="off" />
              <TextField label="Hersteller-Informationen" requiredIndicator value={meta.hersteller_information ?? ""} onChange={(v) => updateMeta("hersteller_information", v || undefined)} placeholder="Hersteller-Informationen" multiline={2} />
              <TextField label="Verantwortliche Person (EU)" requiredIndicator value={meta.verantwortliche_person_information ?? ""} onChange={(v) => updateMeta("verantwortliche_person_information", v || undefined)} placeholder="Verantwortliche Person Information" multiline={2} />

              <Divider />
              <Text as="h2" variant="bodyMd" fontWeight="regular">SEO</Text>
              {isSuperuser ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--p-color-text-subdued)", marginBottom: 4 }}>
                    URL-Handle (Shop){locale !== "de" ? " — this language" : " — canonical (German)"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={
                        locale === "de"
                          ? ((product.handle || "").trim() || titleToHandle(editingTitle || product.title || ""))
                          : ((editingTr.handle || "").trim())
                      }
                      onChange={(e) => {
                        const v = sanitizeSeoHandleInput(e.target.value);
                        if (locale === "de") {
                          setProduct((prev) => {
                            if (!prev) return prev;
                            const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
                            const tr = { ...(m.translations || {}) };
                            tr.de = { ...(tr.de || {}), handle: v };
                            return { ...prev, handle: v, metadata: { ...m, translations: tr } };
                          });
                        } else {
                          updateLocaleField("handle", v);
                        }
                      }}
                      style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--p-color-border)", borderRadius: 6, fontSize: 12, fontFamily: "monospace" }}
                      placeholder="url-handle"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = titleToHandle(editingTitle || product.title || "");
                        if (locale === "de") {
                          setProduct((prev) => {
                            if (!prev) return prev;
                            const m = { ...(prev.metadata && typeof prev.metadata === "object" ? prev.metadata : {}) };
                            const tr = { ...(m.translations || {}) };
                            tr.de = { ...(tr.de || {}), handle: next };
                            return { ...prev, handle: next, metadata: { ...m, translations: tr } };
                          });
                        } else {
                          updateLocaleField("handle", next);
                        }
                      }}
                      title="Titel → Handle synchronisieren"
                      style={{ padding: "6px 10px", background: "var(--p-color-bg-surface-hover)", border: "1px solid var(--p-color-border)", borderRadius: 6, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap" }}
                    >
                      ↻ Sync
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--p-color-text-subdued)", marginTop: 4 }}>
                    Shop-URL: {shopPreviewPrefix(locale)}/produkt/
                    <span style={{ fontFamily: "monospace" }}>
                      {shopProductHandleForLocale(product, locale) || titleToHandle(editingTitle || product.title || "…")}
                    </span>
                    {locale !== "de" && !(editingTr.handle || "").trim() && (product.handle || "").trim() ? (
                      <span> (empty uses DE handle)</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
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
                  <TextField
                    label=""
                    labelHidden
                    type="datetime-local"
                    value={(() => {
                      // Keep the input controlled: datetime-local expects "YYYY-MM-DDTHH:mm"
                      const raw = meta.publish_date;
                      if (!raw) return "";
                      const d = new Date(raw);
                      if (isNaN(d.getTime())) return "";
                      const pad = (n) => String(n).padStart(2, "0");
                      const yyyy = d.getFullYear();
                      const mm = pad(d.getMonth() + 1);
                      const dd = pad(d.getDate());
                      const hh = pad(d.getHours());
                      const min = pad(d.getMinutes());
                      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
                    })()}
                    onChange={(v) => {
                      if (!v) return updateMeta("publish_date", undefined);
                      const d = new Date(v);
                      if (isNaN(d.getTime())) return updateMeta("publish_date", undefined);
                      // Store ISO so shop can do new Date(publish_date) safely
                      updateMeta("publish_date", d.toISOString());
                    }}
                    placeholder="YYYY-MM-DDTHH:mm"
                    helpText="İleri tarih + saat seçilirse shop’ta “Pek yakında” gösterilir."
                  />
                </BlockStack>

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
