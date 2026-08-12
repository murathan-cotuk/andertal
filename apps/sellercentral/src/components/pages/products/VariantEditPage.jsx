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
import CategoryDrilldownSelect from "@/components/inputs/CategoryDrilldownSelect";
import ComplianceFieldsSection from "@/components/products/ComplianceFieldsSection";
import InfoIconTooltip from "@/components/InfoIconTooltip";
import { decodeVariantPathKey, findVariantIndexByOptionKey } from "@/lib/variant-path-key";
import {
  ProductSectionHeading,
  ProductSectionRule,
  PRODUCT_SECTION_STYLES,
} from "@/components/products/ProductSection";
import { lt } from "@/lib/locale-text";
import { EU_ORIGIN_STATUS } from "@andertal/shop-theme";

/** Same shape as ProductEditPage's getMeta/updateMeta, but reads/writes the VARIANT's own
 * metadata — each variant is its own product for category/brand/shipping/compliance/EU-origin,
 * the parent product is just the collection that groups the variants together. */
function getMeta(obj, key, fallback = "") {
  const m = obj?.metadata;
  if (!m || typeof m !== "object") return fallback;
  return m[key] != null && m[key] !== "" ? String(m[key]) : fallback;
}

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

const STATUS_OPTIONS = (locale) => [
  { label: lt(locale, "Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv"), value: "published" },
  { label: lt(locale, "Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf"), value: "draft" },
  { label: lt(locale, "Inactive", "Pasif", "Inactif", "Inactivo", "Inattivo", "Inaktiv"), value: "archived" },
];

const UNIT_TYPE_OPTIONS = (locale) => [
  { label: lt(locale, "— None —", "— Yok —", "— Aucun —", "— Ninguno —", "— Nessuno —", "— Keine —"), value: "" },
  { label: "kg", value: "kg" },
  { label: "g", value: "g" },
  { label: "L", value: "L" },
  { label: "ml", value: "ml" },
  { label: lt(locale, "Piece", "Adet", "Pièce", "Pieza", "Pezzo", "Stück"), value: "stück" },
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
  const t = useCallback((en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de), [locale]);

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
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [shippingGroupsList, setShippingGroupsList] = useState([]);
  const [euOriginVerifying, setEuOriginVerifying] = useState(false);
  const [euOriginNotice, setEuOriginNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      client.getAdminHubCategories().then((r) => r.categories || []).catch(() => []),
      client.getBrands().then((r) => r.brands || []).catch(() => []),
      client.request("/admin-hub/v1/shipping-groups").then((r) => r?.groups || []).catch(() => []),
    ]).then(([categoriesList, brandsList, shippingList]) => {
      if (!cancelled) {
        setCategories(categoriesList);
        setBrands(brandsList);
        setShippingGroupsList(shippingList);
      }
    });
    return () => { cancelled = true; };
  }, [client]);

  const [baselineSnapshot, setBaselineSnapshot] = useState(() =>
    initialProduct ? JSON.stringify(normalizeForCompareProduct(initialProduct)) : null,
  );

  useEffect(() => {
    setProduct(initialProduct);
    setBaselineSnapshot(initialProduct ? JSON.stringify(normalizeForCompareProduct(initialProduct)) : null);
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
    !!product &&
    baselineSnapshot != null &&
    JSON.stringify(normalizeForCompareProduct(product)) !== baselineSnapshot;

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
    setBaselineSnapshot(initialProduct ? JSON.stringify(normalizeForCompareProduct(initialProduct)) : null);
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

  // For DE: prefer v.metadata.description, fall back to translations.de.description (set by Excel import)
  const canonicalDesc = vm.description ?? vTr.description ?? "";
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
    if (!v?.option_values || !variantGroups.length) return v?.title || t("Variant", "Varyant", "Variante", "Variante", "Variante", "Variante");
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
    if (!product || variantIndex < 0) return false;
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

      const variantsToSave = product.variants || [];
      const missingVariantEanIndex = variantsToSave.findIndex((row) => String(row?.ean || "").trim() === "");
      if (missingVariantEanIndex >= 0) {
        setMessage({
          type: "warning",
          text:
            locale === "tr"
              ? "Kaydetmek için tüm varyantlarda EAN girilmelidir."
              : locale === "de"
                ? "Bitte EAN für alle Varianten eintragen, um zu speichern."
                : "Enter EAN for all variants before saving.",
        });
        return false;
      }
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
      setBaselineSnapshot(JSON.stringify(normalizeForCompareProduct(saved)));
      unsaved?.setDirty(false);
      setMessage({ type: "success", text: t("Saved", "Kaydedildi", "Enregistré", "Guardado", "Salvato", "Gespeichert") });
      onReload?.();
      return true;
    } catch (err) {
      setMessage({ type: "error", text: err?.message || t("Save failed", "Kaydetme başarısız", "Échec de l'enregistrement", "Error al guardar", "Salvataggio non riuscito", "Speichern fehlgeschlagen") });
      return false;
    } finally {
      setSaving(false);
    }
  }, [product, variantIndex, idOrHandle, client, initialProduct?.status, onReload, unsaved, locale]);

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

  const updateVariantCategoryWithParents = useCallback((categoryId) => {
    const selected = String(categoryId || "").trim();
    patchVariant((cur) => {
      const m = { ...(cur.metadata && typeof cur.metadata === "object" ? cur.metadata : {}) };
      if (!selected) {
        delete m.category_id;
        delete m.admin_category_id;
        delete m.category_ids;
        delete m.category_slug;
        return { ...cur, metadata: m };
      }
      const byId = new Map((categories || []).map((c) => [String(c.id), c]));
      const catNode = byId.get(selected);
      const lineage = categoryLineageIdsFromFlatList(categories, selected);
      m.category_id = selected;
      m.admin_category_id = selected;
      m.category_ids = lineage.length > 0 ? lineage : [selected];
      if (catNode?.slug) m.category_slug = String(catNode.slug).replace(/^\//, "");
      return { ...cur, metadata: m };
    });
  }, [categories, patchVariant]);

  const handleVerifyEuOriginVariant = useCallback(async (manual) => {
    if (!product?.id || !v?.option_values) return;
    setEuOriginVerifying(true);
    setEuOriginNotice("");
    try {
      const res = await client.verifyEuOrigin(product.id, {
        manual: Boolean(manual),
        provider: vm.eu_origin_provider || "stub",
        variantOptionValues: v.option_values,
      });
      if (res?.product) setProduct(res.product);
      const st = res?.eu_origin?.eu_origin_status || res?.status;
      if (st === EU_ORIGIN_STATUS.VERIFIED) {
        setEuOriginNotice(t(
          "EU origin verified — badge appears in shop after saving.",
          "AB kökeni doğrulandı — kayıt sonrası mağazada rozet görünür.",
          "Origine UE vérifiée — le badge apparaît dans la boutique après enregistrement.",
          "Origen UE verificado — el badge aparece en la tienda tras guardar.",
          "Origine UE verificata — il badge appare nel negozio dopo il salvataggio.",
          "EU-Herkunft verifiziert — Badge erscheint im Shop nach Speichern.",
        ));
      } else {
        setEuOriginNotice(res?.message || t(
          "Verification pending (queue / superuser).",
          "Doğrulama beklemede (kuyruk / süper kullanıcı).",
          "Vérification en attente (file d'attente / superuser).",
          "Verificación pendiente (cola / superusuario).",
          "Verifica in sospeso (coda / superuser).",
          "Prüfung ausstehend (Warteschlange / Superuser).",
        ));
      }
    } catch (e) {
      setEuOriginNotice(e?.message || t("Verification failed.", "Doğrulama başarısız.", "Échec de la vérification.", "Error en la verificación.", "Verifica fallita.", "Verifizierung fehlgeschlagen"));
    } finally {
      setEuOriginVerifying(false);
    }
  }, [product?.id, v?.option_values, vm.eu_origin_provider, client, t]);

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

  // For DE: prefer v.metadata.bullet_points, fall back to translations.de.bullet_points (set by Excel import)
  const bullets =
    locale === "de"
      ? Array.isArray(vm.bullet_points) ? vm.bullet_points
        : Array.isArray(vTr.bullet_points) ? vTr.bullet_points : []
      : Array.isArray(vTr.bullet_points) ? vTr.bullet_points : [];

  if (optionKeyParts == null) {
    return (
      <Page title={t("Variant", "Varyant", "Variante", "Variante", "Variante", "Variante")}>
        <Banner tone="critical">{t("Invalid variant link.", "Geçersiz varyant bağlantısı.", "Lien de variante invalide.", "Enlace de variante inválido.", "Link variante non valido.", "Ungültiger Variantenlink.")}</Banner>
        <Box paddingBlockStart="400">
          <Button onClick={() => router.push(`/products/${idOrHandle}`)}>{t("Back to product", "Ürüne dön", "Retour au produit", "Volver al producto", "Torna al prodotto", "Zurück zum Produkt")}</Button>
        </Box>
      </Page>
    );
  }

  if (!v) {
    return (
      <Page title={t("Variant", "Varyant", "Variante", "Variante", "Variante", "Variante")}>
        <Banner tone="critical">{t("This variant no longer exists on the product.", "Bu varyant artık üründe bulunmuyor.", "Cette variante n'existe plus sur le produit.", "Esta variante ya no existe en el producto.", "Questa variante non esiste più nel prodotto.", "Diese Variante existiert nicht mehr im Produkt.")}</Banner>
        <Box paddingBlockStart="400">
          <Button onClick={() => router.push(`/products/${idOrHandle}`)}>{t("Back to product", "Ürüne dön", "Retour au produit", "Volver al producto", "Torna al prodotto", "Zurück zum Produkt")}</Button>
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
        ${PRODUCT_SECTION_STYLES}
      `}</style>

      {message.text && (
        <Box paddingBlockEnd="200">
          <Banner
            tone={message.type === "success" ? "success" : message.type === "warning" ? "warning" : "critical"}
            onDismiss={() => setMessage({ type: "", text: "" })}
          >
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
            <div className="product-edit-sections">
            <BlockStack gap="500">
              <ProductSectionHeading>Variant options</ProductSectionHeading>
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

              <ProductSectionRule />

              <ProductSectionHeading>Title ({locale.toUpperCase()})</ProductSectionHeading>
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

              <InlineStack gap="300" wrap>
                <Box minWidth="240px" flex="1">
                  <TextField
                    label="SKU"
                    value={v.sku ?? ""}
                    onChange={(t) => patchVariant({ sku: t })}
                    autoComplete="off"
                  />
                </Box>
                <Box minWidth="240px" flex="1">
                  <TextField
                    label="EAN"
                    value={v.ean ?? ""}
                    onChange={(t) => patchVariant({ ean: t || undefined })}
                    autoComplete="off"
                    error={String(v.ean || "").trim() === "" ? "EAN required" : undefined}
                  />
                </Box>
              </InlineStack>

              <ProductSectionRule />

              <ProductSectionHeading>
                {locale === "en" ? "Shop assignment (this variant)" : locale === "tr" ? "Mağaza ataması (bu varyant)" : locale === "fr" ? "Attribution boutique (cette variante)" : locale === "es" ? "Asignación de tienda (esta variante)" : locale === "it" ? "Assegnazione negozio (questa variante)" : "Shop-Zuordnung (diese Variante)"}
              </ProductSectionHeading>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "en" ? "Each variant is its own product — category, brand and shipping group are set per variant, not shared with siblings." : locale === "tr" ? "Her varyant kendi ürünüdür — kategori, marka ve kargo grubu varyant başına ayarlanır, kardeş varyantlarla paylaşılmaz." : locale === "fr" ? "Chaque variante est son propre produit — catégorie, marque et groupe d'expédition sont définis par variante, non partagés." : locale === "es" ? "Cada variante es su propio producto — categoría, marca y grupo de envío se definen por variante, no compartidos." : locale === "it" ? "Ogni variante è un proprio prodotto — categoria, marca e gruppo di spedizione sono impostati per variante, non condivisi." : "Jede Variante ist ihr eigenes Produkt — Kategorie, Marke und Versandgruppe werden pro Variante gesetzt, nicht mit Geschwistern geteilt."}
              </Text>
              <InlineStack gap="300" wrap>
                <Box minWidth="240px" flex="1">
                  <Text as="p" variant="bodySm" fontWeight="semibold">{locale === "en" ? "Category" : locale === "tr" ? "Kategori" : locale === "fr" ? "Catégorie" : locale === "es" ? "Categoría" : locale === "it" ? "Categoria" : "Kategorie"}</Text>
                  <Box paddingBlockStart="150">
                    <CategoryDrilldownSelect
                      label={locale === "en" ? "Category" : locale === "tr" ? "Kategori" : locale === "fr" ? "Catégorie" : locale === "es" ? "Categoría" : locale === "it" ? "Categoria" : "Kategorie"}
                      labelHidden
                      categories={categories || []}
                      value={getMeta(v, "category_id")}
                      onChange={updateVariantCategoryWithParents}
                      placeholder={locale === "en" ? "Select category" : locale === "tr" ? "Kategori seç" : locale === "fr" ? "Choisir une catégorie" : locale === "es" ? "Seleccionar categoría" : locale === "it" ? "Seleziona categoria" : "Kategorie wählen"}
                    />
                  </Box>
                </Box>
                <Box minWidth="240px" flex="1">
                  <Select
                    label={locale === "en" ? "Brand" : locale === "tr" ? "Marka" : locale === "fr" ? "Marque" : locale === "es" ? "Marca" : locale === "it" ? "Marca" : "Marke"}
                    options={[
                      { label: locale === "en" ? "— None —" : locale === "tr" ? "— Yok —" : locale === "fr" ? "— Aucune —" : locale === "es" ? "— Ninguna —" : locale === "it" ? "— Nessuna —" : "— Keine —", value: "" },
                      ...(brands || [])
                        .filter((b) => (b.status || "active") === "active" || b.id === getMeta(v, "brand_id"))
                        .map((b) => {
                          const pending = (b.status || "active") !== "active";
                          const pendingSuffix = pending
                            ? ` (${locale === "en" ? "pending authorization" : locale === "tr" ? "onay bekliyor" : locale === "fr" ? "autorisation en attente" : locale === "es" ? "autorización pendiente" : locale === "it" ? "autorizzazione in attesa" : "Autorisierung ausstehend"})`
                            : "";
                          return { label: `${b.name}${pendingSuffix}`, value: b.id, disabled: pending };
                        }),
                    ]}
                    value={getMeta(v, "brand_id") || ""}
                    onChange={(val) => updateVariantMeta("brand_id", val || undefined)}
                  />
                </Box>
                <Box minWidth="240px" flex="1">
                  <Select
                    label={locale === "en" ? "Shipping group" : locale === "tr" ? "Kargo grubu" : locale === "fr" ? "Groupe d'expédition" : locale === "es" ? "Grupo de envío" : locale === "it" ? "Gruppo di spedizione" : "Versandgruppe"}
                    options={[
                      { label: locale === "en" ? "— None —" : locale === "tr" ? "— Yok —" : locale === "fr" ? "— Aucun —" : locale === "es" ? "— Ninguno —" : locale === "it" ? "— Nessuno —" : "— Keine —", value: "" },
                      ...shippingGroupsList.map((g) => ({ label: g.name, value: g.id })),
                    ]}
                    value={vm.shipping_group_id ?? ""}
                    onChange={(val) => updateVariantMeta("shipping_group_id", val || undefined)}
                  />
                </Box>
              </InlineStack>

              <ProductSectionRule />

              <ProductSectionHeading>
                {locale === "en" ? "Compliance / manufacturer (this variant)" : locale === "tr" ? "Uyumluluk / üretici (bu varyant)" : locale === "fr" ? "Conformité / fabricant (cette variante)" : locale === "es" ? "Cumplimiento / fabricante (esta variante)" : locale === "it" ? "Conformità / produttore (questa variante)" : "Compliance / Hersteller (diese Variante)"}
              </ProductSectionHeading>
              <Text as="p" variant="bodySm" tone="subdued">
                {locale === "en"
                  ? "EU product safety (GPSR). Tap “i” for what to enter in each field."
                  : locale === "tr"
                    ? "AB ürün güvenliği (GPSR). Her alana ne yazılacağını “i” ile görün."
                    : locale === "fr"
                      ? "Sécurité produit UE (GPSR). Appuyez sur « i » pour savoir quoi saisir."
                      : locale === "es"
                        ? "Seguridad de producto UE (GPSR). Pulsa « i » para ver qué indicar."
                        : locale === "it"
                          ? "Sicurezza prodotto UE (GPSR). Tocca « i » per sapere cosa inserire."
                          : "EU-Produktsicherheit (GPSR). Tippen Sie auf „i“, um zu sehen, was einzutragen ist."}
              </Text>
              <TextField
                label={
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <span>{locale === "en" ? "Manufacturer" : locale === "tr" ? "Üretici" : locale === "fr" ? "Fabricant" : locale === "es" ? "Fabricante" : locale === "it" ? "Fabbricante" : "Hersteller"}</span>
                    <InfoIconTooltip
                      text={
                        locale === "en" ? "Name of the company or person that manufactured the product."
                          : locale === "tr" ? "Ürünü üreten şirket veya kişinin adı."
                            : locale === "fr" ? "Nom du fabricant."
                              : locale === "es" ? "Nombre del fabricante."
                                : locale === "it" ? "Nome del fabbricante."
                                  : "Name des Herstellers."
                      }
                    />
                  </InlineStack>
                }
                value={getMeta(v, "hersteller")}
                onChange={(val) => updateVariantMeta("hersteller", val || undefined)}
                placeholder={locale === "en" ? "e.g. Acme GmbH" : "z. B. Acme GmbH"}
                autoComplete="off"
              />
              <TextField
                label={
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <span>{locale === "en" ? "Manufacturer details" : locale === "tr" ? "Üretici bilgileri" : locale === "fr" ? "Coordonnées du fabricant" : locale === "es" ? "Datos del fabricante" : locale === "it" ? "Dati del fabbricante" : "Herstellerinformationen"}</span>
                    <InfoIconTooltip
                      text={
                        locale === "en" ? "Postal address and contact of the manufacturer."
                          : locale === "tr" ? "Üreticinin posta adresi ve iletişimi."
                            : locale === "fr" ? "Adresse et contact du fabricant."
                              : locale === "es" ? "Dirección y contacto del fabricante."
                                : locale === "it" ? "Indirizzo e contatto del fabbricante."
                                  : "Adresse und Kontakt des Herstellers."
                      }
                    />
                  </InlineStack>
                }
                value={getMeta(v, "hersteller_information")}
                onChange={(val) => updateVariantMeta("hersteller_information", val || undefined)}
                placeholder={locale === "en" ? "Street, city, country, email/phone" : "Straße, Ort, Land, E-Mail/Telefon"}
                multiline={2}
                autoComplete="off"
              />
              <TextField
                label={
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <span>{locale === "en" ? "Responsible person (EU)" : locale === "tr" ? "Sorumlu kişi (AB)" : locale === "fr" ? "Personne responsable (UE)" : locale === "es" ? "Persona responsable (UE)" : locale === "it" ? "Persona responsabile (UE)" : "Verantwortliche Person (EU)"}</span>
                    <InfoIconTooltip
                      text={
                        locale === "en" ? "EU-based safety contact. If the manufacturer is in the EU, this can be the same party."
                          : locale === "tr" ? "AB’de yerleşik güvenlik iletişimi. Üretici AB’deyse aynı taraf olabilir."
                            : locale === "fr" ? "Contact sécurité basé dans l'UE. Si le fabricant est dans l'UE, ce peut être la même entité."
                              : locale === "es" ? "Contacto de seguridad en la UE. Si el fabricante está en la UE, puede ser la misma parte."
                                : locale === "it" ? "Contatto di sicurezza nell'UE. Se il fabbricante è nell'UE, può essere la stessa parte."
                                  : "In der EU ansässige Sicherheitskontaktstelle. Sitzt der Hersteller in der EU, kann dies dieselbe Stelle sein."
                      }
                    />
                  </InlineStack>
                }
                value={getMeta(v, "verantwortliche_person_information")}
                onChange={(val) => updateVariantMeta("verantwortliche_person_information", val || undefined)}
                placeholder={locale === "en" ? "Name, EU address, email/phone" : "Name, EU-Adresse, E-Mail/Telefon"}
                multiline={2}
                autoComplete="off"
              />
              <ComplianceFieldsSection
                client={client}
                categoryId={getMeta(v, "category_id")}
                marketplace="DE"
                locale={locale}
                product={v}
                getMeta={getMeta}
                updateMeta={updateVariantMeta}
              />

              <ProductSectionRule />
              <ProductSectionHeading>
                {locale === "en" ? "Made in Europe (this variant, optional)" : locale === "tr" ? "Made in Europe (bu varyant, isteğe bağlı)" : locale === "fr" ? "Made in Europe (cette variante, optionnel)" : locale === "es" ? "Made in Europe (esta variante, opcional)" : locale === "it" ? "Made in Europe (questa variante, opzionale)" : "Made in Europe (diese Variante, optional)"}
              </ProductSectionHeading>
              {euOriginNotice ? (
                <Banner tone="info" onDismiss={() => setEuOriginNotice("")}>{euOriginNotice}</Banner>
              ) : null}
              <TextField
                label={locale === "en" ? "Country of origin (EU)" : locale === "tr" ? "Menşe ülke (AB)" : locale === "fr" ? "Pays d'origine (UE)" : locale === "es" ? "País de origen (UE)" : locale === "it" ? "Paese di origine (UE)" : "Herkunftsland (EU)"}
                value={vm.eu_origin_country ?? ""}
                onChange={(val) => updateVariantMeta("eu_origin_country", val || undefined)}
                placeholder={locale === "en" ? "e.g. DE, FR, IT" : locale === "tr" ? "örn. DE, FR, IT" : "z. B. DE, FR, IT"}
                autoComplete="off"
              />
              <TextField
                label="Registry-ID"
                value={vm.eu_origin_registry_id ?? ""}
                onChange={(val) => updateVariantMeta("eu_origin_registry_id", val || undefined)}
                placeholder={locale === "en" ? "EU registry / certificate number" : locale === "tr" ? "AB kayıt / sertifika numarası" : locale === "fr" ? "Registre UE / numéro de certificat" : locale === "es" ? "Registro UE / número de certificado" : locale === "it" ? "Registro UE / numero di certificato" : "EU-Registry / Zertifikatsnummer"}
                autoComplete="off"
              />
              <TextField
                label="Nachweisdokument (URL)"
                value={vm.eu_origin_document_url ?? ""}
                onChange={(val) => updateVariantMeta("eu_origin_document_url", val || undefined)}
                placeholder="https://…"
                autoComplete="off"
              />
              <Select
                label={locale === "en" ? "Registry provider" : locale === "tr" ? "Registry sağlayıcısı" : locale === "fr" ? "Fournisseur de registre" : locale === "es" ? "Proveedor de registro" : locale === "it" ? "Provider registro" : "Registry-Provider"}
                options={[
                  { label: locale === "en" ? "Stub (manual check)" : locale === "tr" ? "Stub (manuel kontrol)" : locale === "fr" ? "Stub (vérification manuelle)" : locale === "es" ? "Stub (verificación manual)" : locale === "it" ? "Stub (verifica manuale)" : "Stub (manuelle Prüfung)", value: "stub" },
                ]}
                value={vm.eu_origin_provider || "stub"}
                onChange={(val) => updateVariantMeta("eu_origin_provider", val || "stub")}
              />
              <TextField
                label="Status"
                value={vm.eu_origin_status || "—"}
                readOnly
                autoComplete="off"
                helpText={
                  vm.eu_origin_verified_at
                    ? `${locale === "en" ? "Verified at:" : locale === "tr" ? "Doğrulandı:" : locale === "fr" ? "Vérifié le :" : locale === "es" ? "Verificado el:" : locale === "it" ? "Verificato il:" : "Verifiziert am:"} ${vm.eu_origin_verified_at}`
                    : (locale === "en" ? "Only backend/superuser sets \"verified\"." : locale === "tr" ? "Yalnızca backend/süper kullanıcı \"doğrulandı\" olarak ayarlar." : locale === "fr" ? "Seul le backend/superuser définit \"vérifié\"." : locale === "es" ? "Solo backend/superusuario establece \"verificado\"." : locale === "it" ? "Solo backend/superuser imposta \"verificato\"." : 'Nur Backend/Superuser setzt „verified".')
                }
              />
              <InlineStack gap="200">
                <Button
                  onClick={() => handleVerifyEuOriginVariant(false)}
                  loading={euOriginVerifying}
                  disabled={!product?.id || euOriginVerifying}
                >
                  {locale === "en" ? "Check registry (stub)" : locale === "tr" ? "Registry kontrol et (stub)" : locale === "fr" ? "Vérifier le registre (stub)" : locale === "es" ? "Verificar registro (stub)" : locale === "it" ? "Controlla registro (stub)" : "Registry prüfen (Stub)"}
                </Button>
                {isSuperuser ? (
                  <Button
                    variant="primary"
                    onClick={() => handleVerifyEuOriginVariant(true)}
                    loading={euOriginVerifying}
                    disabled={!product?.id || euOriginVerifying}
                  >
                    {locale === "en" ? "Verify manually" : locale === "tr" ? "Manuel doğrula" : locale === "fr" ? "Vérifier manuellement" : locale === "es" ? "Verificar manualmente" : locale === "it" ? "Verifica manualmente" : "Manuell verifizieren"}
                  </Button>
                ) : null}
              </InlineStack>

              <ProductSectionRule />

              <ProductSectionHeading>Description</ProductSectionHeading>
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

              <ProductSectionRule />

              <ProductSectionHeading>Media (variant gallery)</ProductSectionHeading>
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
                uploadPurpose="product"
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
                uploadPurpose="product"
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

              <ProductSectionRule />

              <ProductSectionHeading>Cover image (picker / locale)</ProductSectionHeading>
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

              <ProductSectionRule />

              <ProductSectionHeading>Stock</ProductSectionHeading>
              <TextField
                label="Inventory"
                labelHidden
                type="number"
                min={0}
                value={v.inventory != null ? String(v.inventory) : "0"}
                onChange={(t) => patchVariant({ inventory: t === "" ? 0 : parseInt(String(t), 10) || 0 })}
              />

              <ProductSectionRule />

              <ProductSectionHeading>Prices (€)</ProductSectionHeading>
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

              <ProductSectionRule />

              <ProductSectionHeading>Bullet points (max 5, je max. 120 Zeichen)</ProductSectionHeading>
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

              <ProductSectionRule />

              <ProductSectionHeading>Content per unit</ProductSectionHeading>

              <TextField
                label="Amount"
                labelHidden
                type="number"
                value={vm.unit_value != null ? String(vm.unit_value) : ""}
                onChange={(v) => updateVariantMeta("unit_value", v)}
                placeholder="e.g. 200"
                helpText="Numeric amount (e.g. 200 for 200 g)"
              />

              <Select
                label="Unit"
                options={UNIT_TYPE_OPTIONS(locale)}
                value={vm.unit_type ?? ""}
                onChange={(v) => updateVariantMeta("unit_type", v)}
              />

              <TextField
                label="Reference quantity"
                labelHidden
                type="number"
                value={vm.unit_reference != null ? String(vm.unit_reference) : "1"}
                onChange={(v) => updateVariantMeta("unit_reference", v)}
                placeholder="1"
                helpText="Reference for price per unit (e.g. 1 = per 1 kg when unit is kg)"
              />

              <ProductSectionRule />

              <BlockStack gap="400">
                <BlockStack gap="150">
                  <ProductSectionHeading>Metafelder (Variante)</ProductSectionHeading>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Optionale Key/Value-Paare nur für diese Variante (z. B. shop-spezifische Attribute).
                  </Text>
                </BlockStack>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="300">
                    {metafieldsList.map((item, i) => (
                      <Box
                        key={i}
                        padding="400"
                        background="bg-surface"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border"
                      >
                        <InlineStack gap="400" wrap blockAlign="start">
                          <Box minWidth="160px" flex="1">
                            <TextField
                              label="Key"
                              value={item.key || ""}
                              onChange={(keyVal) => {
                                const arr = [...metafieldsList];
                                arr[i] = { ...arr[i], key: keyVal };
                                patchVariant((cur) => ({
                                  ...cur,
                                  metadata: { ...(cur.metadata || {}), metafields: arr },
                                }));
                              }}
                              autoComplete="off"
                            />
                          </Box>
                          <Box minWidth="200px" flex="2">
                            <TextField
                              label="Value"
                              value={String(item.value ?? "")}
                              onChange={(val) => {
                                const arr = [...metafieldsList];
                                arr[i] = { ...arr[i], value: val };
                                patchVariant((cur) => ({
                                  ...cur,
                                  metadata: { ...(cur.metadata || {}), metafields: arr },
                                }));
                              }}
                              autoComplete="off"
                            />
                          </Box>
                        </InlineStack>
                      </Box>
                    ))}
                    <InlineStack>
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
                        + Metafeld hinzufügen
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </BlockStack>

              <ProductSectionRule />

              <ProductSectionHeading>SEO (variant)</ProductSectionHeading>
              <TextField
                label="Meta title"
                value={vm.seo_meta_title ?? vTr.seo_title ?? ""}
                onChange={(t) => updateVariantMeta("seo_meta_title", t || undefined)}
              />
              <TextField
                label="Meta description"
                value={vm.seo_meta_description ?? vTr.seo_description ?? ""}
                onChange={(t) => updateVariantMeta("seo_meta_description", t || undefined)}
                multiline={2}
              />
              <TextField
                label="Keywords"
                value={vm.seo_keywords ?? vTr.seo_keywords ?? ""}
                onChange={(t) => updateVariantMeta("seo_keywords", t || undefined)}
              />
            </BlockStack>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <div className="product-edit-sidebar">
          <Card>
            <BlockStack gap="300">
              <ProductSectionHeading>Product status</ProductSectionHeading>
              <Select
                label="Status"
                labelHidden
                options={STATUS_OPTIONS(locale)}
                value={product.status || "draft"}
                disabled
              />
              <Text as="p" variant="bodySm" tone="subdued">
                Change status on the main product page.
              </Text>
              <Divider />
              <Button onClick={() => router.push(`/products/${idOrHandle}`)}>{t("Back to product", "Ürüne dön", "Retour au produit", "Volver al producto", "Torna al prodotto", "Zurück zum Produkt")}</Button>
            </BlockStack>
          </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
