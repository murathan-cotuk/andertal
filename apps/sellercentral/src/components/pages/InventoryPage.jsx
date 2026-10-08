"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import {
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
  Icon,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { userError } from "@/lib/api-error-messages";
import { getUI } from "@/lib/ui-strings";
import { lt, fmtMoney, fmtDateShort } from "@/lib/locale-text";
import {
  shopVisibilityHiddenReasons,
  shopVisibilityReasonLabel,
} from "@/lib/shop-visibility-i18n";
import { formatDecimal } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { Link as I18nLink } from "@/i18n/navigation";
import {
  formatChangeRequestValueForDisplay,
  fieldNameDisplayLabel,
} from "@/lib/product-change-request-format";
import CustomCheckbox from "@/components/ui/CustomCheckbox";
import { SettingsIcon } from "@shopify/polaris-icons";

import { confirmRemoval } from "@/lib/confirm-delete";
import { ScPageHeader, ScTabs, ScBulkBar } from "@/components/sc/ScPage";
import { encodeVariantPathKey } from "@/lib/variant-path-key";
const INVENTORY_ROW_GRID = "2.5rem 3.5rem 6.875rem 4.5rem minmax(20rem, 2fr) minmax(8.75rem, 0.9fr) minmax(9.375rem, 1fr) minmax(12.5rem, 1.2fr) 9.25rem";
const EXCEL_BORDER = "1px solid #e6dfd4";

/* ── Layout: same compact shell as OrdersPage (full width, slim header, white filter bar) ── */
const InvPageContainer = styled.div`
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 4px 0 16px;
  min-height: 100%;
  background: transparent;
`;

const InvFilterBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e6dfd4;
  border-radius: 8px;
`;

const InvFilterInput = styled.input`
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 340px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #d6ccbd;
  border-radius: 6px;
  font-size: 12px;
  color: #1d1b18;
  background: #fff;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #a65300; box-shadow: 0 0 0 2px rgba(166, 83, 0, 0.15); }
  &::placeholder { color: #a39a8d; }
`;

const InvFilterSelect = styled.select`
  height: 28px;
  max-width: 190px;
  padding: 0 6px;
  border: 1px solid #d6ccbd;
  border-radius: 6px;
  font-size: 12px;
  color: #1d1b18;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
  &:focus { outline: none; border-color: #a65300; box-shadow: 0 0 0 2px rgba(166, 83, 0, 0.15); }
`;

const InvFilterToggle = styled.button`
  height: 28px;
  padding: 0 10px;
  border: 1px solid ${(p) => (p.$on ? "#a65300" : "#d6ccbd")};
  border-radius: 6px;
  background: ${(p) => (p.$on ? "#fcebd5" : "#fff")};
  color: ${(p) => (p.$on ? "#7f3f00" : "#1d1b18")};
  font: inherit;
  font-size: 12px;
  font-weight: ${(p) => (p.$on ? 600 : 500)};
  cursor: pointer;
`;

const InvTableCard = styled.div`
  padding: 0;
  margin-bottom: 8px;
  overflow: clip;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e6dfd4;
`;

const InvSectionLabel = styled.div`
  padding: 4px 10px;
  margin: 4px 0 6px;
  border-radius: 6px;
  background: ${(p) => (p.$seller ? "#f3eee6" : "#fcebd5")};
  border: 1px solid ${(p) => (p.$seller ? "#e6dfd4" : "#f5d3a8")};
  font-weight: 700;
  font-size: 11px;
  color: ${(p) => (p.$seller ? "#3a352f" : "#7f3f00")};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const InvSellerGroupHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #faf7f2;
  border: none;
  border-bottom: 1px solid #e6dfd4;
  font: inherit;
  text-align: left;
  cursor: pointer;
`;

const InvEmpty = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e6dfd4;
  border-radius: 8px;
  font-size: 12px;
  color: #5e574e;
`;

/** Manual "Group products" folder — own card, not a broken row inside the excel grid. */
const InvGroupCard = styled.div`
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e6dfd4;
  border-radius: 8px;
  overflow: clip;
`;

const InvGroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: #faf7f2;
  border-bottom: ${(p) => (p.$open ? "1px solid #e6dfd4" : "none")};
`;

const InvGroupToggle = styled.button`
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid #d6ccbd;
  background: #fff;
  color: #5e574e;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  padding: 0;
  &:hover { border-color: #a65300; color: #7f3f00; }
`;

const InvGroupTitle = styled.span`
  font-size: 13px;
  font-weight: 650;
  color: #1d1b18;
  letter-spacing: -0.01em;
`;

const InvGroupMeta = styled.span`
  font-size: 12px;
  color: #5e574e;
`;

const InvGroupBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: #fcebd5;
  color: #7f3f00;
  border: 1px solid #f5d3a8;
`;

const InvGroupUngroup = styled.button`
  margin-left: auto;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #d6ccbd;
  background: #fff;
  color: #5e574e;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  &:hover { border-color: #a39a8d; color: #1d1b18; }
`;

const InvGroupBody = styled.div`
  overflow-x: auto;
  border-left: 3px solid #f5d3a8;
`;

const InvFamilyHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #faf7f2;
  border-bottom: 1px solid #e6dfd4;
`;

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

function isPlaceholderProductTitle(value) {
  const t = String(value || "").trim();
  return !t || /^(untitled|unbenannt)$/i.test(t);
}

function coerceProductMediaUrl(entry) {
  if (entry == null || entry === "") return "";
  if (typeof entry === "string") return entry.trim();
  if (typeof entry === "object") return String(entry.url || entry.src || entry.path || "").trim();
  return "";
}

function coerceProductMediaList(list) {
  if (!Array.isArray(list)) {
    const one = coerceProductMediaUrl(list);
    return one ? [one] : [];
  }
  return list.map(coerceProductMediaUrl).filter(Boolean);
}

function getLocalizedTitle(product, locale) {
  const tr = product.metadata?.translations && typeof product.metadata.translations === "object"
    ? product.metadata.translations
    : {};
  const loc = String(locale || "de").toLowerCase();
  const order = [loc, "de", "en", "tr", "fr", "es", "it"];
  for (const l of order) {
    const t = tr[l]?.title;
    if (!isPlaceholderProductTitle(t)) return t;
  }
  for (const l of Object.keys(tr)) {
    const t = tr[l]?.title;
    if (!isPlaceholderProductTitle(t)) return t;
  }
  if (!isPlaceholderProductTitle(product.title)) return product.title;
  return product.title || "Untitled";
}

function firstProductMediaUrl(product, locale) {
  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const tr = meta.translations && typeof meta.translations === "object" ? meta.translations : {};
  const loc = String(locale || "de").toLowerCase();
  const fromLoc = coerceProductMediaList(tr[loc]?.media);
  if (fromLoc[0]) return fromLoc[0];
  const fromDe = coerceProductMediaList(tr.de?.media);
  if (fromDe[0]) return fromDe[0];
  const fromRoot = coerceProductMediaList(meta.media);
  if (fromRoot[0]) return fromRoot[0];
  for (const l of ["en", "tr", "fr", "es", "it"]) {
    if (l === loc) continue;
    const list = coerceProductMediaList(tr[l]?.media);
    if (list[0]) return list[0];
  }
  return coerceProductMediaUrl(meta.thumbnail) || "";
}

function isOwnInventoryProduct(product, mySellerId) {
  const s = String(product?.seller_id || "").trim();
  if (!s) return true;
  return s === String(mySellerId || "").trim();
}

/** Combine-as-variants: seller must own the master row (seller_id match). Listed catalog / other-seller add-existing products are not combinable. */
function sellerOwnsForCombine(product, mySellerId) {
  const mine = String(mySellerId || "").trim();
  if (!mine) return false;
  const owner = String(
    product?.seller_id ||
      (product?.metadata && typeof product.metadata === "object"
        ? product.metadata.seller_id || product.metadata.seller
        : "") ||
      ""
  ).trim();
  return Boolean(owner) && owner === mine;
}

// A product a seller listed (but didn't originally create ? e.g. an already-existing
// catalog product) has `created_at` from the ORIGINAL owner, not from when this seller
// added it. `seller_listing_created_at` (populated server-side only for this viewing
// seller) reflects when THEY actually added it, so "recently added" sorts correctly
// even for products they didn't create first.
function effectiveAddedAt(product) {
  return product?.seller_listing_created_at || product?.created_at || 0;
}

/** Mirrors apps/medusa-backend/src/commission-rate.js's productCommissionOverridePct — display
 *  only, 0-100 with one decimal, or null when no override is stored. */
function productCommissionOverridePct(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  const fraction = n <= 1 ? n : n <= 100 ? n / 100 : null;
  return fraction == null ? null : Math.round(fraction * 1000) / 10;
}

function sortProductsList(list, locale, sortKey) {
  const arr = [...(list || [])];
  if (sortKey === "title_desc") {
    arr.sort((a, b) => getLocalizedTitle(b, locale).localeCompare(getLocalizedTitle(a, locale), undefined, { sensitivity: "base" }));
  } else if (sortKey === "inventory_desc") {
    arr.sort((a, b) => Number(b?.inventory ?? 0) - Number(a?.inventory ?? 0));
  } else if (sortKey === "inventory_asc") {
    arr.sort((a, b) => Number(a?.inventory ?? 0) - Number(b?.inventory ?? 0));
  } else if (sortKey === "price_desc") {
    arr.sort((a, b) => Number(b?.price ?? 0) - Number(a?.price ?? 0));
  } else if (sortKey === "price_asc") {
    arr.sort((a, b) => Number(a?.price ?? 0) - Number(b?.price ?? 0));
  } else if (sortKey === "created_desc") {
    arr.sort((a, b) => new Date(effectiveAddedAt(b)) - new Date(effectiveAddedAt(a)));
  } else if (sortKey === "created_asc") {
    arr.sort((a, b) => new Date(effectiveAddedAt(a)) - new Date(effectiveAddedAt(b)));
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
  if (opts.length === 0) {
    const raw = (v.value ?? v.option ?? "").toString().trim();
    return raw;
  }
  return opts
    .map((o) => {
      if (o == null) return "";
      if (typeof o === "string" || typeof o === "number") return String(o).trim();
      const label =
        (o.labels && (o.labels[locale] || o.labels["de"] || o.labels["en"])) ||
        o.label ||
        o.value ||
        "";
      return String(label).trim();
    })
    .filter(Boolean)
    .join("/");
}

function getVariantName(v, locale, fallbackName = "?") {
  if (!v) return "";
  const l = String(locale || "de").toLowerCase();
  const normalizeSig = (s) =>
    String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "")
      .replace(/[_\-|]+/g, "/")
      .replace(/\/+/g, "/")
      .replace(/[^a-z0-9/]/g, "");
  const optionSignature = normalizeSig(getVariantLabel(v, l));
  const isOptionDerived = (text) => {
    const t = normalizeSig(text);
    if (!t) return false;
    return optionSignature && t === optionSignature;
  };
  const tr = v.metadata && typeof v.metadata === "object" && v.metadata.translations && typeof v.metadata.translations === "object"
    ? v.metadata.translations
    : {};
  const trTitle = String(tr[l]?.title || tr.de?.title || tr.en?.title || "").trim();
  if (trTitle && !isOptionDerived(trTitle)) return trTitle;
  const byName = String(v.name || "").trim();
  if (byName && !isOptionDerived(byName)) return byName;
  const byTitle = String(v.title || "").trim();
  if (byTitle && !isOptionDerived(byTitle)) return byTitle;
  const skuFallback = String(v?.sku || "").trim();
  if (skuFallback) return skuFallback;
  return String(fallbackName || "?");
}

function getDefaultShopUrl() {
  const env = process.env.NEXT_PUBLIC_SHOP_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  if (url) return url.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }
    return "https://andertal.com";
  }
  return "https://andertal.com";
}

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
  return `/${defaultShopMarketForLocale(l)}/${l}`;
}

function shopProductHandleForLocale(product, loc) {
  const tr = product?.metadata?.translations?.[loc];
  const h = ((tr?.handle || "").trim() || (product?.handle || "").trim());
  if (!h) return "";
  const rawId = String(product?.id || "").replace(/^prod_/i, "").toLowerCase();
  const uuid = rawId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  const id = uuid ? uuid[0] : rawId;
  const shortCode = id.length >= 8 ? id.slice(-8) : id;
  return shortCode ? `${h}-a-${shortCode}` : h;
}

function statusLabel(statusRaw) {
  const s = String(statusRaw || "").toLowerCase();
  if (s === "published" || s === "active") return "active";
  if (s === "draft" || !s) return "draft";
  if (s === "merged") return "merged";
  if (s === "inactive" || s === "archived") return "inactive";
  return s;
}

function statusColors(statusRaw) {
  const s = String(statusRaw || "").toLowerCase();
  if (s === "published" || s === "active") return { bg: "#dcfce7", fg: "#166534", br: "#86efac" };
  if (s === "draft" || !s) return { bg: "#fef3c7", fg: "#92400e", br: "#fde68a" };
  if (s === "merged") return { bg: "#eef2ff", fg: "#3730a3", br: "#c7d2fe" };
  return { bg: "#fee2e2", fg: "#991b1b", br: "#fecaca" };
}

function isMasterCatalogProduct(product) {
  return !String(product?.seller_id || "").trim();
}

/** Product row toggle: master catalog listings use active/inactive; own products use published/archived (ProductEditPage). */
function productToggleStatusValues(product) {
  if (isMasterCatalogProduct(product)) {
    return { on: "active", off: "inactive" };
  }
  return { on: "published", off: "archived" };
}

function isProductToggleOn(statusRaw) {
  return statusLabel(statusRaw) === "active";
}

function ProductStatusToggle({ on, onChange, disabled, title }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!on);
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-checked={on}
      role="switch"
      style={{
        width: 46,
        height: 26,
        borderRadius: 13,
        padding: 0,
        background: on ? "#10b981" : "#d6ccbd",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

function InlineVariantEditor({ product, locale, medusaClient, setProducts }) {
  const router = useRouter();
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
      setSavedMsg((locale === "en" ? "Saved" : locale === "tr" ? "Kaydedildi" : locale === "fr" ? "Enregistré" : locale === "es" ? "Guardado" : locale === "it" ? "Salvato" : "Gespeichert") + " ✓");
    } catch (e) {
      setSavedMsg((locale === "en" ? "Error: " : locale === "tr" ? "Hata: " : locale === "fr" ? "Erreur : " : locale === "es" ? "Error: " : locale === "it" ? "Errore: " : "Fehler: ") + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const shopBaseUrl = getDefaultShopUrl();
  const l = String(locale || "en").toLowerCase();
  const i18n = {
    select: l === "tr" ? "Seç" : l === "de" ? "Ausw." : l === "fr" ? "Sél." : l === "es" ? "Sel." : l === "it" ? "Sel." : "Select",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : l === "fr" ? "Statut" : l === "es" ? "Estado" : l === "it" ? "Stato" : "Status",
    details: l === "tr" ? "Ürün detayları" : l === "de" ? "Produktdetails" : l === "fr" ? "Détails produit" : l === "es" ? "Detalles producto" : l === "it" ? "Dettagli prodotto" : "Product details",
    inventory: l === "tr" ? "Envanter" : l === "de" ? "Bestand" : l === "fr" ? "Stock" : l === "es" ? "Inventario" : l === "it" ? "Inventario" : "Inventory",
    price: l === "tr" ? "Fiyat" : l === "de" ? "Preis" : l === "fr" ? "Prix" : l === "es" ? "Precio" : l === "it" ? "Prezzo" : "Price",
    variations: l === "tr" ? "Varyasyonlar" : l === "de" ? "Variationen" : l === "fr" ? "Variantes" : l === "es" ? "Variantes" : l === "it" ? "Varianti" : "Variations",
    sku: "SKU",
    ean: "EAN",
    save: l === "tr" ? "Kaydet" : l === "de" ? "Speichern" : l === "fr" ? "Enregistrer" : l === "es" ? "Guardar" : l === "it" ? "Salva" : "Save",
    saving: l === "tr" ? "Kaydediliyor?" : l === "de" ? "Speichern?" : l === "fr" ? "Enregistrement?" : l === "es" ? "Guardando?" : l === "it" ? "Salvataggio?" : "Saving?",
    noVariations: l === "tr" ? "Varyasyon yok" : l === "de" ? "Keine Variationen" : l === "fr" ? "Pas de variantes" : l === "es" ? "Sin variantes" : l === "it" ? "Nessuna variante" : "No variations",
  };
  const localizeStatus = (k) => {
    if (k === "active") return l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : l === "fr" ? "Actif" : l === "es" ? "Activo" : l === "it" ? "Attivo" : "Active";
    if (k === "inactive") return l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : l === "fr" ? "Inactif" : l === "es" ? "Inactivo" : l === "it" ? "Inattivo" : "Inactive";
    return l === "tr" ? "Taslak" : l === "de" ? "Entwurf" : l === "fr" ? "Brouillon" : l === "es" ? "Borrador" : l === "it" ? "Bozza" : "Draft";
  };
  if (matrixVariants.length === 0) {
    return <div style={{ padding: "8px 12px", fontSize: 13, color: "#5e574e" }}>{i18n.noVariations}</div>;
  }

  return (
    <div style={{ marginTop: 0, borderTop: EXCEL_BORDER, background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "40px 56px 110px 56px 2fr 140px 150px 1.2fr", gap: 0, marginBottom: 0, background: "#faf7f2", borderBottom: EXCEL_BORDER, alignItems: "center" }}>
        <div />
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", padding: "8px 6px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.select}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", padding: "8px 6px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.status}</div>
        <div style={{ borderRight: EXCEL_BORDER, padding: "8px 6px" }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", padding: "8px 8px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.details}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", textAlign: "center", padding: "8px 8px", borderRight: EXCEL_BORDER }}>{i18n.inventory}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", textAlign: "center", padding: "8px 8px", borderRight: EXCEL_BORDER }}>{i18n.price}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#a39a8d", textTransform: "uppercase", padding: "8px 8px", textAlign: "center" }}>{i18n.variations}</div>
      </div>
      {drafts.map((d, idx) => {
        const vRow = matrixVariants[idx] || {};
        const vMedia = vRow.metadata?.media;
        const vRawThumb =
          (Array.isArray(vMedia) && vMedia[0] ? (typeof vMedia[0] === "string" ? vMedia[0] : vMedia[0]?.url || null) : null) ||
          vRow.image_urls?.[locale] ||
          vRow.image_url ||
          null;
        const vThumbUrl = vRawThumb ? resolveImageUrl(vRawThumb) : null;
        return (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "40px 56px 110px 56px 2fr 140px 150px 1.2fr", gap: 0, alignItems: "center", borderBottom: idx === drafts.length - 1 ? "none" : EXCEL_BORDER, background: idx % 2 === 0 ? "#fff" : "#fcfdff" }}>
          <div style={{ textAlign: "center", color: "#a39a8d", padding: "8px 4px", borderRight: EXCEL_BORDER }}>?</div>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER }}><CustomCheckbox checked={false} onChange={() => {}} size={18} /></div>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER }}>
            {(() => {
              const c = statusColors(matrixVariants[idx]?.status || product.status);
              return (
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>
                  {localizeStatus(statusLabel(matrixVariants[idx]?.status || product.status))}
                </span>
              );
            })()}
          </div>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: 40, height: 40, flexShrink: 0, borderRadius: 6, overflow: "hidden",
                background: "#f4f4f5", border: "1px solid #e6dfd4",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {vThumbUrl ? (
                <img
                  src={vThumbUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c1c1c6" strokeWidth="1.6" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="9" cy="9" r="1.6" fill="#c1c1c6" stroke="none" />
                  <path d="M21 15l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <div style={{ minWidth: 0, padding: "8px 8px", borderRight: EXCEL_BORDER }}>
            <a
              href={`${shopBaseUrl}${shopPreviewPrefix(locale)}/${encodeURIComponent(shopProductHandleForLocale(product, locale))}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: "#1d1b18", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={getVariantName(matrixVariants[idx], locale, `Variant ${idx + 1}`)}
            >
              {getVariantName(matrixVariants[idx], locale, `Variant ${idx + 1}`)}
            </a>
            <button
              type="button"
              onClick={() => {
                const ov = d.option_values || matrixVariants[idx]?.option_values;
                if (Array.isArray(ov) && ov.length) {
                  router.push(`/products/${product.id}/variants/${encodeVariantPathKey(ov)}`);
                } else {
                  router.push(`/products/${product.id}`);
                }
              }}
              style={{ marginTop: 1, padding: 0, background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 12, textDecoration: "underline" }}
              title={lt(locale, "Open full product edit for this SKU", "Bu SKU için tam ürün düzenlemeyi aç", "Ouvrir l'édition complète de ce SKU", "Abrir edición completa de este SKU", "Apri modifica completa di questo SKU", "Vollständige Produktbearbeitung für diese SKU öffnen")}
            >
              {i18n.sku}: {matrixVariants[idx]?.sku || "?"}
            </button>
            <div style={{ fontSize: 11, color: "#5e574e", lineHeight: 1.2 }}>
              {i18n.ean}: {matrixVariants[idx]?.ean || "?"}
            </div>
          </div>
          <div style={{ padding: "8px 8px", borderRight: EXCEL_BORDER }}>
          <input
            type="number"
            min="0"
            value={d.inventory}
            onChange={(e) => setField(idx, "inventory", e.target.value)}
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d6ccbd", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none", height: 30 }}
          />
          </div>
          <div style={{ padding: "8px 8px", borderRight: EXCEL_BORDER }}>
          <input
            type="number"
            min="0"
            step="0.01"
            value={d.price}
            onChange={(e) => setField(idx, "price", e.target.value)}
            placeholder="0.00"
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d6ccbd", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none", height: 30 }}
          />
          </div>
          <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "8px 8px", textAlign: "center" }}>
            {getVariantLabel(matrixVariants[idx], locale) || "?"}
          </div>
        </div>
        );
      })}
      <div style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 6px", borderTop: "1px solid #e6dfd4", background: "#fff" }}>
        <Button type="button" onClick={save} loading={saving} variant="primary">
          {saving ? i18n.saving : i18n.save}
        </Button>
        {savedMsg && <span style={{ fontSize: 12, color: (savedMsg.startsWith("Fehler") || savedMsg.startsWith("Error") || savedMsg.startsWith("Erreur") || savedMsg.startsWith("Errore")) ? "#dc2626" : "#16a34a" }}>{savedMsg}</span>}
      </div>
    </div>
  );
}

function GroupProductsModal({ locale, ownProducts, manualGroupedIdSet, initialSelectedIds, getLocalizedTitle, onClose, onCreate }) {
  const l = String(locale || "en").toLowerCase();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [checked, setChecked] = useState(() => new Set((initialSelectedIds || []).filter((id) => !manualGroupedIdSet.has(id))));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const candidates = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (ownProducts || [])
      .filter((p) => !manualGroupedIdSet.has(String(p.id)))
      .filter((p) => !qq || getLocalizedTitle(p, locale).toLowerCase().includes(qq) || String(p.sku || "").toLowerCase().includes(qq))
      .slice(0, 200);
  }, [ownProducts, manualGroupedIdSet, q, locale, getLocalizedTitle]);

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr(l === "tr" ? "Grup adı gerekli." : l === "en" ? "Group name is required." : l === "fr" ? "Le nom du groupe est obligatoire." : l === "es" ? "El nombre del grupo es obligatorio." : l === "it" ? "Il nome del gruppo è obbligatorio." : "Gruppenname erforderlich."); return; }
    if (checked.size < 2) { setErr(l === "tr" ? "En az 2 ürün seçin." : l === "en" ? "Select at least 2 products." : l === "fr" ? "Sélectionnez au moins 2 produits." : l === "es" ? "Selecciona al menos 2 productos." : l === "it" ? "Seleziona almeno 2 prodotti." : "Mindestens 2 Produkte auswählen."); return; }
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), sku: sku.trim(), member_ids: [...checked] });
    } catch (e) {
      setErr(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={l === "tr" ? "Ürünleri grupla" : l === "en" ? "Group products" : l === "fr" ? "Grouper les produits" : l === "es" ? "Agrupar productos" : l === "it" ? "Raggruppa prodotti" : "Produkte gruppieren"}
      primaryAction={{ content: l === "tr" ? "Grup oluştur" : l === "en" ? "Create group" : l === "fr" ? "Créer le groupe" : l === "es" ? "Crear grupo" : l === "it" ? "Crea gruppo" : "Gruppe erstellen", onAction: submit, loading: saving }}
      secondaryActions={[{ content: l === "tr" ? "İptal" : l === "en" ? "Cancel" : l === "fr" ? "Annuler" : l === "es" ? "Cancelar" : l === "it" ? "Annulla" : "Abbrechen", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          <Text as="p" tone="subdued" variant="bodySm">
            {l === "tr" ? "Bu sadece Envanter sayfanızı düzenli görüntülemek içindir — shop'ta hiçbir etkisi yoktur ve sadece siz görürsünüz." : l === "en" ? "Purely to keep your own Inventory page tidy — has no effect on the shop and is only visible to you." : l === "fr" ? "Uniquement pour garder votre page Inventaire lisible — sans effet sur la boutique et visible par vous seul." : l === "es" ? "Solo para ordenar tu página de Inventario: no afecta a la tienda y solo lo ves tú." : l === "it" ? "Solo per tenere ordinata la tua pagina Inventario — nessun effetto sul negozio, visibile solo a te." : "Nur zur übersichtlicheren Darstellung deiner Inventory-Seite — hat keine Auswirkung auf den Shop und ist nur für dich sichtbar."}
          </Text>
          {err && <Banner tone="critical">{err}</Banner>}
          <TextField label={l === "tr" ? "Grup adı" : l === "en" ? "Group name" : l === "fr" ? "Nom du groupe" : l === "es" ? "Nombre del grupo" : l === "it" ? "Nome del gruppo" : "Gruppenname"} value={name} onChange={setName} autoComplete="off" />
          <TextField label="SKU" value={sku} onChange={setSku} autoComplete="off" helpText={l === "tr" ? "İsteğe bağlı, sadece kendi referansınız için." : l === "en" ? "Optional, for your own reference only." : l === "fr" ? "Facultatif, uniquement pour votre propre référence." : l === "es" ? "Opcional, solo como referencia propia." : l === "it" ? "Facoltativo, solo come tuo riferimento." : "Optional, nur zu deiner eigenen Referenz."} />
          <TextField
            label={l === "tr" ? "Ürün ara" : l === "en" ? "Search products" : l === "fr" ? "Rechercher des produits" : l === "es" ? "Buscar productos" : l === "it" ? "Cerca prodotti" : "Produkte suchen"}
            value={q}
            onChange={setQ}
            autoComplete="off"
            placeholder={l === "tr" ? "isim veya SKU" : l === "en" ? "name or SKU" : l === "fr" ? "nom ou SKU" : l === "es" ? "nombre o SKU" : l === "it" ? "nome o SKU" : "Name oder SKU"}
          />
          <Text as="p" variant="bodySm" tone="subdued">{checked.size} {l === "tr" ? "seçildi" : l === "en" ? "selected" : l === "fr" ? "sélectionné(s)" : l === "es" ? "seleccionados" : l === "it" ? "selezionati" : "ausgewählt"}</Text>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid #e6dfd4", borderRadius: 8 }}>
            {candidates.length === 0 && (
              <div style={{ padding: 16, color: "#a39a8d", fontSize: 13 }}>{l === "tr" ? "Ürün yok" : l === "en" ? "No products" : l === "fr" ? "Aucun produit" : l === "es" ? "Sin productos" : l === "it" ? "Nessun prodotto" : "Keine Produkte"}</div>
            )}
            {candidates.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid #f3eee6", cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: "#a65300", width: 15, height: 15, cursor: "pointer" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getLocalizedTitle(p, locale)}</span>
                <span style={{ color: "#a39a8d", fontSize: 11, marginLeft: "auto", whiteSpace: "nowrap" }}>SKU: {p.sku || "—"}</span>
              </label>
            ))}
          </div>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function InventoryProductRow({
  product,
  mergedParentLabel,
  locale,
  selectedIds,
  setSelectedIds,
  menuOpenId,
  setMenuOpenId,
  medusaClient,
  openDuplicateModal,
  setProducts,
  pendingChangeRequests,
  onOpenChangeRequests,
  ui,
  isSuperuser,
  onOpenCommissionModal,
  sellerCommissionRatePct,
  inventoryI18n,
}) {
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [invDraft, setInvDraft] = useState(null);
  const [priceDraft, setPriceDraft] = useState(null);
  const [rowSaving, setRowSaving] = useState(false);
  const menuBtnRef = useRef(null);
  const menuPanelRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const shopBaseUrl = getDefaultShopUrl();
  const l = String(locale || "en").toLowerCase();
  const menuOpen = menuOpenId === product.id;

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = menuBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuW = 180;
      const menuH = 196;
      const gap = 6;
      let top = r.bottom + gap;
      let left = r.right - menuW;
      if (left < 8) left = 8;
      if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
      if (top + menuH > window.innerHeight - 8 && r.top > menuH + gap) {
        top = r.top - menuH - gap;
      }
      setMenuPos({ top, left, width: menuW });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      const t = e.target;
      if (!(t instanceof Node)) {
        setMenuOpenId(null);
        return;
      }
      if (menuBtnRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return;
      setMenuOpenId(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    // Capture phase so Polaris / row handlers that stopPropagation still close the menu.
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("touchstart", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("touchstart", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, setMenuOpenId]);

  const statusOn = isProductToggleOn(product.status);
  const statusValues = productToggleStatusValues(product);
  const i18n = {
    sku: "SKU",
    ean: "EAN",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : l === "fr" ? "Statut" : l === "es" ? "Estado" : l === "it" ? "Stato" : "Status",
    active: l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : l === "fr" ? "Actif" : l === "es" ? "Activo" : l === "it" ? "Attivo" : "Active",
    draft: l === "tr" ? "Taslak" : l === "de" ? "Entwurf" : l === "fr" ? "Brouillon" : l === "es" ? "Borrador" : l === "it" ? "Bozza" : "Draft",
    inactive: l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : l === "fr" ? "Inactif" : l === "es" ? "Inactivo" : l === "it" ? "Inattivo" : "Inactive",
    merged: l === "tr" ? "Grup üyesi" : l === "de" ? "Gruppiert" : l === "fr" ? "Groupé" : l === "es" ? "Agrupado" : l === "it" ? "Raggruppato" : "Grouped",
    openVariants: l === "tr" ? "Varyasyonları aç" : l === "de" ? "Variationen öffnen" : l === "fr" ? "Ouvrir les variantes" : l === "es" ? "Abrir variantes" : l === "it" ? "Apri varianti" : "Open variations",
    closeVariants: l === "tr" ? "Varyasyonları kapat" : l === "de" ? "Variationen schließen" : l === "fr" ? "Fermer les variantes" : l === "es" ? "Cerrar variantes" : l === "it" ? "Chiudi varianti" : "Close variations",
    noVariants: l === "tr" ? "Varyasyon yok" : l === "de" ? "Keine Variationen" : l === "fr" ? "Pas de variantes" : l === "es" ? "Sin variantes" : l === "it" ? "Nessuna variante" : "No variations",
    changeProposed: l === "tr" ? "Değişiklik önerildi" : l === "de" ? "Änderung vorgeschlagen" : l === "fr" ? "Modification proposée" : l === "es" ? "Cambio propuesto" : l === "it" ? "Modifica proposta" : "Change proposed",
    activateProduct: l === "tr" ? "Ürün aktifleştir" : l === "de" ? "Produkt aktivieren" : l === "fr" ? "Activer le produit" : l === "it" ? "Attiva prodotto" : l === "es" ? "Activar producto" : "Activate product",
    deactivateProduct: l === "tr" ? "Ürün pasifleştir" : l === "de" ? "Produkt deaktivieren" : l === "fr" ? "Désactiver le produit" : l === "it" ? "Disattiva prodotto" : l === "es" ? "Desactivar producto" : "Deactivate product",
  };
  const handleStatusToggle = async (nextOn) => {
    const nextStatus = nextOn ? statusValues.on : statusValues.off;
    setStatusSaving(true);
    try {
      const res = await medusaClient.updateAdminHubProduct(product.id, { status: nextStatus });
      if (res?.suggestion_submitted) {
        window.alert(
          l === "tr"
            ? "Değişiklik onaya gönderildi."
            : l === "de"
              ? "Änderung zur Freigabe eingereicht."
              : l === "fr"
              ? "Modification soumise pour approbation."
              : l === "es"
              ? "Cambio enviado para aprobación."
              : l === "it"
              ? "Modifica inviata per approvazione."
              : "Change submitted for approval.",
        );
        return;
      }
      const updated = res?.product ?? res;
      const newStatus = updated?.status ?? nextStatus;
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p)));
    } catch (err) {
      console.error("Failed to update product status", err);
      window.alert(
        l === "tr"
          ? "Durum güncellenemedi."
          : l === "de"
            ? "Status konnte nicht aktualisiert werden."
            : l === "fr"
            ? "Impossible de mettre à jour le statut."
            : l === "es"
            ? "No se pudo actualizar el estado."
            : l === "it"
            ? "Impossibile aggiornare lo stato."
            : "Could not update status.",
      );
    } finally {
      setStatusSaving(false);
    }
  };
  const localizeStatus = (k) => {
    if (k === "active") return i18n.active;
    if (k === "inactive") return i18n.inactive;
    if (k === "merged") return i18n.merged;
    return i18n.draft;
  };
  const meta = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const commissionOverridePct = productCommissionOverridePct(meta.commission_rate_override);
  const media = meta.media;
  const rawThumb =
    product.thumbnail ||
    firstProductMediaUrl(product, locale) ||
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
      : product.price_cents != null
        ? Number(product.price_cents) / 100
      : product.variants?.[0]?.prices?.[0]?.amount
        ? Number(product.variants[0].prices[0].amount) / 100
        : 0;
  const inv = product.inventory != null ? Number(product.inventory) : 0;
  const sku = product.sku || "?";
  const ean = meta?.ean || "?";
  const variationSummary = Array.isArray(meta?.variation_groups)
    ? meta.variation_groups.map((g) => g?.name).filter(Boolean).join(" / ")
    : "?";
  const hasVariants = Array.isArray(product.variants) && product.variants.filter((v) => Array.isArray(v.option_values) && v.option_values.length > 0).length > 0;
  const pendingCount = Array.isArray(pendingChangeRequests) ? pendingChangeRequests.length : 0;

  const invDisplay = invDraft != null ? invDraft : String(inv);
  const priceDisplay = priceDraft != null
    ? priceDraft
    : (Number.isFinite(price) ? price.toFixed(2) : "");

  const commitRowCommercial = async (nextInv, nextPrice) => {
    const inventoryVal = parseInt(String(nextInv ?? inv).replace(/[^\d-]/g, ""), 10);
    const priceVal = parseFloat(String(nextPrice ?? price).replace(",", "."));
    const inventory = Number.isFinite(inventoryVal) && inventoryVal >= 0 ? inventoryVal : 0;
    const priceNum = Number.isFinite(priceVal) && priceVal >= 0 ? priceVal : 0;
    const sameInv = inventory === inv;
    const samePrice = Math.abs(priceNum - (Number.isFinite(price) ? price : 0)) < 0.001;
    if (sameInv && samePrice) {
      setInvDraft(null);
      setPriceDraft(null);
      return;
    }
    setRowSaving(true);
    try {
      const res = await medusaClient.updateAdminHubProduct(product.id, {
        inventory,
        price: priceNum,
      });
      if (res?.suggestion_submitted && !res?.listing_saved && !res?.product) {
        window.alert(
          l === "tr"
            ? "Değişiklik onaya gönderildi."
            : l === "de"
              ? "Änderung zur Freigabe eingereicht."
              : l === "fr"
                ? "Modification soumise pour approbation."
                : l === "es"
                  ? "Cambio enviado para aprobación."
                  : l === "it"
                    ? "Modifica inviata per approvazione."
                    : "Change submitted for approval.",
        );
        setInvDraft(null);
        setPriceDraft(null);
        return;
      }
      const updated = res?.product ?? res;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? {
                ...p,
                inventory: updated?.inventory ?? inventory,
                price: updated?.price != null ? Number(updated.price) : priceNum,
                price_cents: updated?.price_cents != null ? Number(updated.price_cents) : Math.round(priceNum * 100),
                status: updated?.status ?? p.status,
              }
            : p
        )
      );
      setInvDraft(null);
      setPriceDraft(null);
    } catch (err) {
      console.error("Failed to update inventory/price", err);
      window.alert(
        l === "tr"
          ? "Fiyat/stok güncellenemedi."
          : l === "de"
            ? "Preis/Bestand konnte nicht aktualisiert werden."
            : l === "fr"
              ? "Impossible de mettre à jour le prix/stock."
              : l === "es"
                ? "No se pudo actualizar precio/stock."
                : l === "it"
                  ? "Impossibile aggiornare prezzo/scorte."
                  : "Could not update price/stock.",
      );
      setInvDraft(null);
      setPriceDraft(null);
    } finally {
      setRowSaving(false);
    }
  };

  const cellInputStyle = {
    width: "100%",
    maxWidth: "6.5rem",
    height: 30,
    margin: "0 auto",
    display: "block",
    fontSize: 13,
    padding: "4px 8px",
    border: "1px solid #d6ccbd",
    borderRadius: 6,
    boxSizing: "border-box",
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    outline: "none",
    background: rowSaving ? "#f3eee6" : "#fff",
    color: "#1d1b18",
  };
  return (
    <div
      style={{ background: "#fff", borderBottom: EXCEL_BORDER, transition: "background-color .1s" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#faf7f2"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
    >
      <div style={{ display: "grid", gridTemplateColumns: INVENTORY_ROW_GRID, gap: 0, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => hasVariants && setVariantsOpen((v) => !v)}
          disabled={!hasVariants}
          style={{
            width: "1.75rem",
            height: "1.75rem",
            borderRadius: "0.375rem",
            border: "1px solid #d6ccbd",
            background: hasVariants ? "#fff" : "#f3eee6",
            color: hasVariants ? "#3a352f" : "#a39a8d",
            cursor: hasVariants ? "pointer" : "not-allowed",
            fontSize: "0.875rem",
            lineHeight: 1,
          }}
          title={hasVariants ? (variantsOpen ? i18n.closeVariants : i18n.openVariants) : i18n.noVariants}
        >
          {hasVariants ? (variantsOpen ? "▲" : "▼") : "—"}
        </button>
          <div style={{ padding: "0.5rem 0.375rem", borderRight: EXCEL_BORDER, display: "flex", justifyContent: "center" }}>
          <CustomCheckbox
            checked={selectedIds.includes(product.id)}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedIds((prev) =>
                e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id)
              );
            }}
            size={18}
            style={{ margin: 0 }}
          />
          </div>
          <div style={{ minWidth: 0, padding: "0.5rem 0.375rem", borderRight: EXCEL_BORDER, textAlign: "center" }}>
            {(() => {
              const c = statusColors(product.status);
              const hideReasons = shopVisibilityHiddenReasons(product);
              const hideTitle = hideReasons
                .map((r) => shopVisibilityReasonLabel(r.code, locale) || r.message)
                .filter(Boolean)
                .join(" · ");
              return (
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0.125rem 0.4375rem", borderRadius: "999px", fontSize: "0.6875rem", fontWeight: 600, background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>
                    {localizeStatus(statusLabel(product.status))}
                  </span>
                  {hideReasons.length > 0 && (
                    <span
                      title={hideTitle}
                      style={{ fontSize: "0.5625rem", fontWeight: 600, color: "#b45309", lineHeight: 1.2, maxWidth: "5.5rem" }}
                    >
                      {lt(locale, "Not in shop", "Shop’ta yok", "Pas en boutique", "No en tienda", "Non in negozio", "Nicht im Shop")}
                    </span>
                  )}
                </span>
              );
            })()}
          </div>
          <div style={{ padding: "0.5rem 0.375rem", borderRight: EXCEL_BORDER, display: "flex", justifyContent: "center" }}>
          <div
            style={{
              width: "3.5rem", height: "3.5rem", flexShrink: 0, borderRadius: "0.5rem", overflow: "hidden",
              background: "#f4f4f5", border: "1px solid #e6dfd4",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt={getLocalizedTitle(product, locale)}
                referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
              />
            ) : null}
            <div
              style={{
                display: thumbUrl ? "none" : "flex",
                width: "100%", height: "100%", alignItems: "center", justifyContent: "center",
                color: "#c1c1c6",
              }}
              aria-hidden
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
                <path d="M21 15l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          </div>
          <div style={{ minWidth: 0, padding: "0.5rem", borderRight: EXCEL_BORDER }}>
            <a
              href={`${shopBaseUrl}${shopPreviewPrefix(locale)}/${encodeURIComponent(shopProductHandleForLocale(product, locale))}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1d1b18", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.3125rem", whiteSpace: "nowrap", overflow: "hidden" }}
              title={`${getLocalizedTitle(product, locale)} · ${lt(locale, "opens in shop, new tab", "mağazada açılır, yeni sekme", "s'ouvre dans la boutique, nouvel onglet", "se abre en la tienda, pestaña nueva", "si apre nel negozio, nuova scheda", "öffnet im Shop, neuer Tab")}`}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{getLocalizedTitle(product, locale)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a39a8d" strokeWidth="2.2" style={{ flexShrink: 0 }} aria-hidden>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 3h6v6M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <I18nLink
              href={`/products/${product.id}`}
              style={{ marginTop: "0.125rem", padding: 0, color: "#4b5563", fontSize: "0.75rem", textDecoration: "underline", display: "inline-block" }}
              title={lt(locale, "Open product edit page via SKU", "SKU ile ürün düzenleme sayfasına git", "Ouvrir la page produit via SKU", "Abrir edición de producto vía SKU", "Apri modifica prodotto tramite SKU", "SKU üzerinden ürün düzenleme sayfasına git")}
            >
              {i18n.sku}: {sku}
            </I18nLink>
            <div style={{ fontSize: "0.6875rem", color: "#5e574e", lineHeight: 1.2 }}>{i18n.ean}: {ean}</div>
            {product.an_id && (
              <div style={{ fontSize: "0.625rem", color: "#a39a8d", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>AN-ID: {product.an_id}</div>
            )}
            {mergedParentLabel && (
              <div style={{ marginTop: "0.1875rem" }}>
                <span
                  style={{ display: "inline-block", padding: "0.0625rem 0.375rem", borderRadius: 999, fontSize: "0.625rem", fontWeight: 600, background: "#fcebd5", color: "#7f3f00", border: "1px solid #f5d3a8" }}
                  title={l === "tr" ? "Bu ürün başka bir üründe varyasyon olarak gösteriliyor" : l === "en" ? "This product is displayed as a variant of another product" : l === "fr" ? "Ce produit est affiché comme variante d’un autre produit" : l === "es" ? "Este producto se muestra como variante de otro producto" : l === "it" ? "Questo prodotto è mostrato come variante di un altro prodotto" : "Dieses Produkt wird als Variante eines anderen Produkts angezeigt"}
                >
                  {(l === "tr" ? "Aile: " : l === "en" ? "Family: " : l === "fr" ? "Famille : " : l === "es" ? "Familia: " : l === "it" ? "Famiglia: " : "Familie: ") + mergedParentLabel}
                </span>
              </div>
            )}
            {isSuperuser && commissionOverridePct != null && (
              <div style={{ marginTop: "0.1875rem" }}>
                <span style={{ display: "inline-block", padding: "0.0625rem 0.375rem", borderRadius: 999, fontSize: "0.625rem", fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>
                  {inventoryI18n.customCommissionBadge(commissionOverridePct)}
                </span>
              </div>
            )}
          </div>
          <div style={{ padding: "0.5rem", borderRight: EXCEL_BORDER }}>
            <input
              type="number"
              min={0}
              step={1}
              disabled={rowSaving}
              value={invDisplay}
              onChange={(e) => setInvDraft(e.target.value)}
              onFocus={() => { if (invDraft == null) setInvDraft(String(inv)); }}
              onBlur={() => commitRowCommercial(invDraft != null ? invDraft : inv, priceDraft != null ? priceDraft : priceDisplay)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setInvDraft(null); e.currentTarget.blur(); }
              }}
              aria-label={i18n.inventory}
              title={hasVariants
                ? lt(locale, "Parent stock — also edit each variation when expanded", "Üst stok — açınca her varyasyonu da düzenleyin", "Stock parent — modifiez aussi chaque variante une fois dépliée", "Stock padre — edita también cada variación al expandir", "Scorte parent — modifica anche ogni variante quando espansa", "Parent-Bestand — bei aufgeklappten Variationen auch einzeln bearbeiten")
                : undefined}
              style={cellInputStyle}
            />
          </div>
          <div style={{ padding: "0.5rem", borderRight: EXCEL_BORDER }}>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={rowSaving}
              value={priceDisplay}
              onChange={(e) => setPriceDraft(e.target.value)}
              onFocus={() => { if (priceDraft == null) setPriceDraft(Number.isFinite(price) ? price.toFixed(2) : ""); }}
              onBlur={() => commitRowCommercial(invDraft != null ? invDraft : inv, priceDraft != null ? priceDraft : priceDisplay)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") { setPriceDraft(null); e.currentTarget.blur(); }
              }}
              aria-label={i18n.price}
              title={hasVariants
                ? lt(locale, "Parent price — also edit each variation when expanded", "Üst fiyat — açınca her varyasyonu da düzenleyin", "Prix parent — modifiez aussi chaque variante une fois dépliée", "Precio padre — edita también cada variación al expandir", "Prezzo parent — modifica anche ogni variante quando espansa", "Parent-Preis — bei aufgeklappten Variationen auch einzeln bearbeiten")
                : undefined}
              style={cellInputStyle}
            />
          </div>
          <div style={{ fontSize: "0.75rem", color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0.5rem", borderRight: EXCEL_BORDER, textAlign: "center" }}>
            {variationSummary || "?"}
          </div>
          <InlineStack gap="100" blockAlign="center" style={{ padding: "0.5rem 0.375rem", justifyContent: "flex-end" }}>
          <I18nLink
            href={`/products/${product.id}`}
            aria-label="Edit product"
            title="Edit product"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              color: "#3a352f",
              textDecoration: "none",
            }}
          >
            <EditPencilIcon />
          </I18nLink>
          <Box position="relative">
            {pendingCount > 0 && (
              <span
                title={`${pendingCount} change proposal(s) pending`}
                style={{
                  position: "absolute",
                  top: 1,
                  right: 1,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#dc2626",
                  boxShadow: "0 0 0 2px #fff",
                  zIndex: 2,
                }}
              />
            )}
            <div ref={menuBtnRef} style={{ display: "inline-flex" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId((prev) => (prev === product.id ? null : product.id));
                }}
                aria-label={ui.actions || "Actions"}
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: "1px solid #e6dfd4",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#5e574e",
                  fontSize: 16,
                  lineHeight: 1,
                  fontWeight: 700,
                }}
              >
                ⋯
              </button>
            </div>
            {menuOpen && menuPos && typeof document !== "undefined" && createPortal(
              <div
                ref={menuPanelRef}
                style={{
                  position: "fixed",
                  top: menuPos.top,
                  left: menuPos.left,
                  zIndex: 10050,
                  minWidth: menuPos.width,
                  background: "#fff",
                  border: "1px solid #e6dfd4",
                  borderRadius: 8,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChangeRequests(product.id);
                      setMenuOpenId(null);
                    }}
                    style={{
                      width: "100%",
                      height: 36,
                      border: "none",
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "0 12px",
                      fontSize: 13,
                      color: "#dc2626",
                    }}
                    title="View proposed changes"
                  >
                    {i18n.changeProposed} ({pendingCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDuplicateModal(product);
                    setMenuOpenId(null);
                  }}
                  style={{
                    width: "100%",
                    height: 36,
                    border: "none",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 13,
                    color: "#1d1b18",
                  }}
                >
                  {ui.duplicate}
                </button>
                {isSuperuser && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCommissionModal(product);
                    }}
                    style={{
                      width: "100%",
                      height: 36,
                      border: "none",
                      borderTop: "1px solid #f1f5f9",
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      padding: "0 12px",
                      fontSize: 13,
                      color: "#1d1b18",
                    }}
                  >
                    {inventoryI18n.commissionRateBtn}
                  </button>
                )}
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!(await confirmRemoval())) return;
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
                  style={{
                    width: "100%",
                    height: 36,
                    border: "none",
                    borderTop: "1px solid #f1f5f9",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: "0 12px",
                    fontSize: 13,
                    color: "#b91c1c",
                  }}
                >
                  {ui.delete}
                </button>
              </div>,
              document.body
            )}
          </Box>
          <ProductStatusToggle
            on={statusOn}
            disabled={statusSaving}
            title={statusOn ? i18n.deactivateProduct : i18n.activateProduct}
            onChange={handleStatusToggle}
          />
        </InlineStack>
      </div>
      {variantsOpen && hasVariants && (
        <InlineVariantEditor
          product={product}
          locale={locale}
          medusaClient={medusaClient}
          setProducts={setProducts}
        />
      )}
    </div>
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
  const [commissionModalProduct, setCommissionModalProduct] = useState(null);
  const [commissionRateInput, setCommissionRateInput] = useState("");
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionError, setCommissionError] = useState("");
  const [showCustomCommissionOnly, setShowCustomCommissionOnly] = useState(false);
  const [combineModalOpen, setCombineModalOpen] = useState(false);
  const [combineRoofTitle, setCombineRoofTitle] = useState("");
  const [combineRoofSku, setCombineRoofSku] = useState("");
  const [combineOptionName, setCombineOptionName] = useState("Variante");
  const [combineLabels, setCombineLabels] = useState({});
  const [combineSaving, setCombineSaving] = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [eanDuplicateGroups, setEanDuplicateGroups] = useState([]);
  // Private, per-seller "Produkte gruppieren" folders — cosmetic-only Inventory organization,
  // never a product, never shop-facing (see admin_hub_inventory_groups / inventory-groups.js).
  const [inventoryGroups, setInventoryGroups] = useState([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState(new Set());
  const [eanDuplicatesModalOpen, setEanDuplicatesModalOpen] = useState(false);
  const [eanDuplicateMergingId, setEanDuplicateMergingId] = useState(null);
  const [mySellerId, setMySellerId] = useState("");
  const [sellerLabelById, setSellerLabelById] = useState({});
  const [sellerCommissionRateById, setSellerCommissionRateById] = useState({});
  const [productListingsMap, setProductListingsMap] = useState({});
  const [sellerSearchFilter, setSellerSearchFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailsFilter, setDetailsFilter] = useState("");
  const [variationFilter, setVariationFilter] = useState("");
  const [inventoryMin, setInventoryMin] = useState("");
  const [inventoryMax, setInventoryMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [inventorySort, setInventorySort] = useState("created_desc");
  const [sellerSectionsOpen, setSellerSectionsOpen] = useState({});
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exporting, setExporting] = useState(false);
  // Same required-setup check as OnboardingChecklist (dashboard home) — repeated here because
  // a seller who never visits the dashboard can otherwise publish/manage products for a long
  // time without ever seeing the IBAN/card warning (TASKS.md #25: "ilgili settings net uyarmalı").
  // null = not checked yet; render nothing until known so the banner never flashes in then out.
  const [payoutSetupMissing, setPayoutSetupMissing] = useState(null);
  const medusaClient = getMedusaAdminClient();
  const ui = getUI(locale);
  const l = String(locale || "en").toLowerCase();
  const inventoryI18n = {
    commissionRateBtn: l === "tr" ? "Komisyon oranı ayarla" : l === "de" ? "Provisionssatz festlegen" : l === "fr" ? "Définir le taux de commission" : l === "es" ? "Definir tasa de comisión" : l === "it" ? "Imposta tasso di commissione" : "Set commission rate",
    commissionRateModalTitle: l === "tr" ? "Ürün komisyon oranı" : l === "de" ? "Provisionssatz des Produkts" : l === "fr" ? "Taux de commission du produit" : l === "es" ? "Tasa de comisión del producto" : l === "it" ? "Tasso di commissione del prodotto" : "Product commission rate",
    commissionRateModalHint: l === "tr" ? "Sadece bu ürün için satıcının kendi komisyon oranını geçersiz kılar." : l === "de" ? "Überschreibt den eigenen Provisionssatz des Sellers nur für dieses Produkt." : l === "fr" ? "Remplace le taux de commission du vendeur pour ce produit uniquement." : l === "es" ? "Anula la tasa de comisión del vendedor solo para este producto." : l === "it" ? "Sostituisce il tasso di commissione del venditore solo per questo prodotto." : "Overrides the seller's own commission rate for this product only.",
    commissionRateInputLabel: l === "tr" ? "Özel komisyon oranı (%)" : l === "de" ? "Individueller Provisionssatz (%)" : l === "fr" ? "Taux de commission personnalisé (%)" : l === "es" ? "Tasa de comisión personalizada (%)" : l === "it" ? "Tasso di commissione personalizzato (%)" : "Custom commission rate (%)",
    commissionRateClear: l === "tr" ? "Geçersiz kıl (satıcının oranını kullan)" : l === "de" ? "Zurücksetzen (Seller-Satz verwenden)" : l === "fr" ? "Réinitialiser (utiliser le taux du vendeur)" : l === "es" ? "Restablecer (usar la tasa del vendedor)" : l === "it" ? "Rimuovi (usa il tasso del venditore)" : "Clear override (use seller's rate)",
    commissionRateSave: l === "tr" ? "Kaydet" : l === "de" ? "Speichern" : l === "fr" ? "Enregistrer" : l === "es" ? "Guardar" : l === "it" ? "Salva" : "Save",
    commissionRateError: l === "tr" ? "0 ile 100 arasında bir oran girin." : l === "de" ? "Bitte einen Satz zwischen 0 und 100 eingeben." : l === "fr" ? "Saisissez un taux entre 0 et 100." : l === "es" ? "Introduzca una tasa entre 0 y 100." : l === "it" ? "Inserisci un tasso tra 0 e 100." : "Enter a rate between 0 and 100.",
    customCommissionFilter: l === "tr" ? "Farklı komisyonlu ürünler" : l === "de" ? "Produkte mit abweichender Provision" : l === "fr" ? "Produits à commission différente" : l === "es" ? "Productos con comisión distinta" : l === "it" ? "Prodotti con commissione diversa" : "Products with custom commission",
    customCommissionBadge: (pct) => (l === "tr" ? `Komisyon: %${pct}` : l === "de" ? `Provision: ${pct} %` : l === "fr" ? `Commission : ${pct} %` : l === "es" ? `Comisión: ${pct} %` : l === "it" ? `Commissione: ${pct}%` : `Commission: ${pct}%`),
  };

  const [pendingChangeRequestsByProductId, setPendingChangeRequestsByProductId] = useState({});
  const [changeRequestsModalOpen, setChangeRequestsModalOpen] = useState(false);
  const [changeRequestsModalProductId, setChangeRequestsModalProductId] = useState(null);
  const [changeRequestsModalItems, setChangeRequestsModalItems] = useState([]);
  const rowHead = {
    select: l === "tr" ? "Seç" : l === "de" ? "Ausw." : l === "fr" ? "Sél." : l === "es" ? "Sel." : l === "it" ? "Sel." : "Select",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : l === "fr" ? "Statut" : l === "es" ? "Estado" : l === "it" ? "Stato" : "Status",
    details: l === "tr" ? "Ürün detayları" : l === "de" ? "Produktdetails" : l === "fr" ? "Détails produit" : l === "es" ? "Detalles producto" : l === "it" ? "Dettagli prodotto" : "Product details",
    inventory: l === "tr" ? "Envanter" : l === "de" ? "Bestand" : l === "fr" ? "Stock" : l === "es" ? "Inventario" : l === "it" ? "Inventario" : "Inventory",
    price: l === "tr" ? "Fiyat" : l === "de" ? "Preis" : l === "fr" ? "Prix" : l === "es" ? "Precio" : l === "it" ? "Prezzo" : "Price",
    variations: l === "tr" ? "Varyasyonlar" : l === "de" ? "Variationen" : l === "fr" ? "Variantes" : l === "es" ? "Variantes" : l === "it" ? "Varianti" : "Variations",
  };
  const renderInventoryHeader = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: INVENTORY_ROW_GRID,
        gap: 0,
        borderBottom: EXCEL_BORDER,
        alignItems: "center",
        background: "#faf7f2",
        position: "sticky",
        top: 0,
        zIndex: 2,
      }}
    >
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.5rem 0.375rem" }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "0.5rem 0.375rem", textAlign: "center" }}>{rowHead.select}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "0.5rem 0.375rem", textAlign: "center" }}>{rowHead.status}</div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.5rem 0.375rem" }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "0.5rem", textAlign: "center" }}>{rowHead.details}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center", borderRight: EXCEL_BORDER, padding: "0.5rem", cursor: "pointer" }} onClick={() => setInventorySort((s) => (s === "inventory_desc" ? "inventory_asc" : "inventory_desc"))}>{rowHead.inventory}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center", borderRight: EXCEL_BORDER, padding: "0.5rem", cursor: "pointer" }} onClick={() => setInventorySort((s) => (s === "price_desc" ? "price_asc" : "price_desc"))}>{rowHead.price}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5e574e", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "0.5rem", textAlign: "center" }}>{rowHead.variations}</div>
      <div style={{ padding: "0.5rem 0.375rem" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem 0.5rem" }}>
        <input value={detailsFilter} onChange={(e) => setDetailsFilter(e.target.value)} placeholder={l === "tr" ? "isim / sku / ean" : l === "en" ? "name / sku / ean" : l === "fr" ? "nom / sku / ean" : l === "es" ? "nombre / sku / ean" : l === "it" ? "nome / sku / ean" : "Name / SKU / EAN"} style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.5rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem 0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem" }}>
        <input value={inventoryMin} onChange={(e) => setInventoryMin(e.target.value)} placeholder="min" style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.375rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
        <input value={inventoryMax} onChange={(e) => setInventoryMax(e.target.value)} placeholder="max" style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.375rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem 0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem" }}>
        <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="min" style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.375rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
        <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="max" style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.375rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "0.375rem 0.5rem" }}>
        <input value={variationFilter} onChange={(e) => setVariationFilter(e.target.value)} placeholder={l === "tr" ? "varyasyon" : l === "en" ? "variation" : l === "fr" ? "variante" : l === "es" ? "variante" : l === "it" ? "variante" : "Variante"} style={{ width: "100%", height: "1.75rem", border: "1px solid #d6ccbd", borderRadius: "0.25rem", padding: "0 0.5rem", fontSize: "0.75rem", boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ padding: "6px" }} />
    </div>
  );

  // No inner scroll box — the table grows with the page, like the Orders table.
  const TableShell = ({ children }) => (
    <InvTableCard>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </InvTableCard>
  );

  const runQuickExport = async () => {
    try {
      setExporting(true);
      const sellerToken = typeof window !== "undefined" ? (localStorage.getItem("sellerToken") || "") : "";
      const response = await fetch("/api/import-export/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerToken,
          datasets: ["products"],
          format: exportFormat,
          filters: {
            search: productSearch || detailsFilter || variationFilter || "",
            status: statusFilter === "all" ? "" : statusFilter,
          },
        }),
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `inventory-export.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      setExportModalOpen(false);
    } catch (e) {
      setError(userError(e, locale, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
    setMySellerId(localStorage.getItem("sellerId") || "");
  }, []);

  useEffect(() => {
    if (isSuperuser) return;
    let cancelled = false;
    Promise.all([
      medusaClient.getSellerAccount().catch(() => null),
      medusaClient.getSellerCard().catch(() => null),
    ]).then(([account, cardRes]) => {
      if (cancelled) return;
      const seller = account?.sellerUser || account?.user || {};
      const iban = String(seller?.iban || "").replace(/\s+/g, "");
      setPayoutSetupMissing({ card: !cardRes?.has_card, iban: iban.length < 15 });
    });
    return () => { cancelled = true; };
  }, [isSuperuser, medusaClient]);

  useEffect(() => {
    if (!isSuperuser) return;
    medusaClient
      .getSellers()
      .then((d) => {
        const m = {};
        const rates = {};
        for (const s of d.sellers || []) {
          if (!s.seller_id) continue;
          m[s.seller_id] = s.store_name || s.company_name || s.email || s.seller_id;
          rates[s.seller_id] = s.commission_rate != null ? Number(s.commission_rate) : 0.12;
        }
        setSellerLabelById(m);
        setSellerCommissionRateById(rates);
      })
      .catch(() => {});
    medusaClient
      .getProductListingsMap()
      .then((map) => setProductListingsMap(map || {}))
      .catch(() => {});
  }, [isSuperuser, medusaClient]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await medusaClient.getAdminHubProducts();
        setProducts(data.products || []);
        if (localStorage.getItem("sellerIsSuperuser") === "true") {
          medusaClient.getProductListingsMap().then((map) => setProductListingsMap(map || {})).catch(() => {});
        }
      } catch (err) {
        setError(userError(err, locale, "Failed to load products"));
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const refetchPendingChangeRequests = async () => {
    // Pending-change-request review ("Proposal" marker/count) is a superuser moderation tool ?
    // a seller must never see that their own edit to an existing/shared product is queued for
    // approval, so this is skipped entirely for non-superusers.
    if (!isSuperuser) {
      setPendingChangeRequestsByProductId({});
      return {};
    }
    try {
      const data = await medusaClient.request('/admin-hub/v1/product-change-requests?status=pending');
      const map = {};
      for (const cr of (data?.change_requests || [])) {
        const pid = String(cr?.product_id || '');
        if (!pid) continue;
        if (!map[pid]) map[pid] = [];
        map[pid].push(cr);
      }
      setPendingChangeRequestsByProductId(map);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("andertal-notifications-refresh"));
      }
      return map;
    } catch (e) {
      // Non-critical: inventory should still work if proposal backend fails.
      console.warn('Failed to load pending change requests:', e?.message || e);
      return {};
    }
  };

  useEffect(() => {
    refetchPendingChangeRequests();
  }, [isSuperuser]);

  const refetchInventoryGroups = async () => {
    try {
      const data = await medusaClient.getInventoryGroups();
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setInventoryGroups(groups);
      setExpandedGroupIds((prev) => {
        const next = new Set();
        for (const g of groups) if (!g.collapsed && prev.has(g.id)) next.add(g.id);
        // A freshly-loaded group's own `collapsed` flag is the source of truth on first load.
        for (const g of groups) if (!g.collapsed) next.add(g.id);
        return next;
      });
      return groups;
    } catch (e) {
      console.warn('Failed to load inventory groups:', e?.message || e);
      return [];
    }
  };

  useEffect(() => {
    refetchInventoryGroups();
  }, []);

  const refetchEanDuplicates = async () => {
    // Same visibility rule as change requests: only a superuser may see that two
    // catalog rows for the same real-world EAN exist and need reconciling.
    if (!isSuperuser) {
      setEanDuplicateGroups([]);
      return [];
    }
    try {
      const data = await medusaClient.request('/admin-hub/v1/products/duplicate-eans');
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setEanDuplicateGroups(groups);
      return groups;
    } catch (e) {
      console.warn('Failed to load duplicate EAN groups:', e?.message || e);
      return [];
    }
  };

  useEffect(() => {
    refetchEanDuplicates();
  }, [isSuperuser]);

  const mergeEanDuplicate = async (masterId, duplicateProductId) => {
    setEanDuplicateMergingId(duplicateProductId);
    try {
      await medusaClient.request(`/admin-hub/v1/products/duplicate-eans/${encodeURIComponent(masterId)}/merge`, {
        method: 'POST',
        body: JSON.stringify({ duplicateProductId }),
      });
      await refetchEanDuplicates();
      const data = await medusaClient.getAdminHubProducts();
      setProducts(data.products || []);
    } catch (e) {
      setError(userError(e, locale, 'Failed to merge duplicate product'));
    } finally {
      setEanDuplicateMergingId(null);
    }
  };

  const openChangeRequestsModal = async (productId) => {
    const pid = String(productId || '');
    const product = products.find((p) => String(p?.id || '') === pid) || null;
    setChangeRequestsModalProductId(pid || null);
    setChangeRequestsModalItems(pendingChangeRequestsByProductId[pid] || []);
    setChangeRequestsModalOpen(true);
  };

  const approveChangeRequest = async (id) => {
    try {
      await medusaClient.request(`/admin-hub/v1/product-change-requests/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ reviewer_note: 'Approved via inventory' }),
      });
      const data = await medusaClient.getAdminHubProducts();
      setProducts(data.products || []);
      const map = await refetchPendingChangeRequests();
      if (changeRequestsModalProductId) {
        setChangeRequestsModalItems(map[String(changeRequestsModalProductId)] || []);
      }
    } catch (e) {
      setError(e?.message || 'Approval failed');
    }
  };

  const rejectChangeRequest = async (id) => {
    try {
      await medusaClient.request(`/admin-hub/v1/product-change-requests/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reviewer_note: 'Rejected via inventory' }),
      });
      const map = await refetchPendingChangeRequests();
      if (changeRequestsModalProductId) {
        setChangeRequestsModalItems(map[String(changeRequestsModalProductId)] || []);
      }
    } catch (e) {
      setError(e?.message || 'Rejection failed');
    }
  };

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

  const productMatchesFilters = useCallback((product) => {
    const st = String(product?.status || "draft").toLowerCase();
    // "merged" rows (this product got folded into another product's variants[] via
    // Combine as variants) are still real, independent, fully-editable products — their
    // own SKU/price/inventory, own sale history — the "parent" is only a display shell.
    // They used to be hidden from the default view entirely; now they show like any other
    // row (with a "Group: …" badge), matching every other row's edit/3-dot behavior.
    const statusOk = statusFilter === "all" ? true : st === statusFilter;
    if (!statusOk) return false;
    const q = String(productSearch || "").trim().toLowerCase();
    const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
    const hay = [
      getLocalizedTitle(product, locale),
      product?.title || "",
      product?.sku || "",
      meta?.ean || "",
      product?.an_id || "",
      ...(Array.isArray(product?.variants)
        ? product.variants.map((v) =>
            [v?.sku || "", v?.ean || "", getVariantLabel(v, locale) || "", getVariantName(v, locale, "") || ""].join(" ")
          )
        : []),
    ]
      .join(" ")
      .toLowerCase();
    if (q && !hay.includes(q)) return false;
    const detailsQ = String(detailsFilter || "").trim().toLowerCase();
    if (detailsQ && !hay.includes(detailsQ)) return false;
    const varQ = String(variationFilter || "").trim().toLowerCase();
    if (varQ) {
      const variationHay = (Array.isArray(product?.variants)
        ? product.variants.map((v) => getVariantLabel(v, locale)).join(" ")
        : "").toLowerCase();
      if (!variationHay.includes(varQ)) return false;
    }
    const inv = Number(product?.inventory ?? 0);
    if (inventoryMin !== "" && Number.isFinite(Number(inventoryMin)) && inv < Number(inventoryMin)) return false;
    if (inventoryMax !== "" && Number.isFinite(Number(inventoryMax)) && inv > Number(inventoryMax)) return false;
    const pr = Number(product?.price ?? 0);
    if (priceMin !== "" && Number.isFinite(Number(priceMin)) && pr < Number(priceMin)) return false;
    if (priceMax !== "" && Number.isFinite(Number(priceMax)) && pr > Number(priceMax)) return false;
    if (showCustomCommissionOnly) {
      const overridePct = productCommissionOverridePct(meta.commission_rate_override);
      if (overridePct == null) return false;
      const sellerRate = product?.seller_id != null ? sellerCommissionRateById[product.seller_id] : null;
      const sellerPct = sellerRate != null ? Math.round(Number(sellerRate) * 1000) / 10 : 12;
      if (Math.abs(overridePct - sellerPct) <= 0.01) return false;
    }
    return true;
  }, [statusFilter, productSearch, detailsFilter, variationFilter, inventoryMin, inventoryMax, priceMin, priceMax, locale, showCustomCommissionOnly, sellerCommissionRateById]);

  // Parent lookup for "merged" rows (folded into another product's variants[] via Combine
  // as variants) — the parent is always the same seller's own product, already in `products`.
  const productsById = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  const { ownProducts, sellerGroups } = useMemo(() => {
    const own = [];
    const g = new Map();
    for (const p of products) {
      if (!productMatchesFilters(p)) continue;
      if (isOwnInventoryProduct(p, mySellerId)) {
        // A superuser-owned master product (null seller_id) is never exclusively
        // "claimed" by whichever seller listed it ? it stays in the superuser's own
        // section AND shows under every seller who has a listing for it.
        own.push(p);
        const listingSellers = isSuperuser ? (productListingsMap[p.id] || []) : [];
        if (isSuperuser && listingSellers.length > 0) {
          for (const sid of listingSellers) {
            if (!g.has(sid)) g.set(sid, []);
            g.get(sid).push({ ...p, _listingSellerIds: listingSellers });
          }
        }
      } else {
        const sid = String(p.seller_id || "unknown");
        if (!g.has(sid)) g.set(sid, []);
        g.get(sid).push(p);
      }
    }
    const keys = [...g.keys()].sort((a, b) =>
      (sellerLabelById[a] || a).localeCompare(sellerLabelById[b] || b, undefined, { sensitivity: "base" })
    );
    return { ownProducts: own, sellerGroups: keys.map((k) => ({ sellerId: k, items: g.get(k) })) };
  }, [products, mySellerId, sellerLabelById, productMatchesFilters, isSuperuser, productListingsMap]);

  const filteredSellerGroups = useMemo(() => {
    const q = sellerSearchFilter.trim().toLowerCase();
    if (!q) return sellerGroups;
    return sellerGroups.filter(({ sellerId }) => {
      const label = (sellerLabelById[sellerId] || sellerId || "").toLowerCase();
      return label.includes(q) || sellerId.toLowerCase().includes(q);
    });
  }, [sellerGroups, sellerSearchFilter, sellerLabelById]);

  // Every product id currently folded into one of the seller's own manual "Produkte
  // gruppieren" folders — pulled out of the normal list below and rendered once, under
  // their folder, instead of as their own top-level row.
  const manualGroupedIdSet = useMemo(
    () => new Set(inventoryGroups.flatMap((g) => (Array.isArray(g.member_ids) ? g.member_ids : []))),
    [inventoryGroups]
  );

  // Group own products that share the same master_product_id under a parent header.
  const sortedOwnRows = useMemo(() => {
    const ungrouped = ownProducts.filter((p) => !manualGroupedIdSet.has(String(p.id)));
    const sorted = sortProductsList(ungrouped, locale, inventorySort);
    const groupMap = new Map(); // masterId ? index in result
    const result = [];
    for (const p of sorted) {
      const masterId = String(p.metadata?.master_product_id || "").trim();
      if (!masterId) {
        result.push({ type: "standalone", product: p });
      } else if (groupMap.has(masterId)) {
        result[groupMap.get(masterId)].items.push(p);
      } else {
        groupMap.set(masterId, result.length);
        result.push({ type: "group", masterId, items: [p] });
      }
    }
    // Groups with only 1 item ? treat as standalone
    const autoGrouped = result.map((entry) =>
      entry.type === "group" && entry.items.length === 1
        ? { type: "standalone", product: entry.items[0] }
        : entry
    );
    const manualGroupEntries = inventoryGroups.map((g) => ({
      type: "manualGroup",
      group: g,
      items: (Array.isArray(g.member_ids) ? g.member_ids : [])
        .map((id) => productsById.get(String(id)))
        .filter(Boolean),
    })).filter((entry) => entry.items.length > 0);
    return [...manualGroupEntries, ...autoGrouped];
  }, [ownProducts, locale, inventorySort, manualGroupedIdSet, inventoryGroups, productsById]);

  const openCommissionModal = (product) => {
    setMenuOpenId(null);
    setCommissionError("");
    const overridePct = productCommissionOverridePct(product?.metadata?.commission_rate_override);
    setCommissionRateInput(overridePct != null ? String(overridePct) : "");
    setCommissionModalProduct(product);
  };

  const saveCommissionOverride = async () => {
    if (!commissionModalProduct) return;
    setCommissionError("");
    const n = Number(commissionRateInput.trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setCommissionError(inventoryI18n.commissionRateError);
      return;
    }
    setCommissionSaving(true);
    try {
      const res = await medusaClient.setProductCommissionOverride(commissionModalProduct.id, n);
      const nextRate = res?.commission_rate_override ?? n / 100;
      setProducts((prev) => prev.map((p) => (
        p.id === commissionModalProduct.id
          ? { ...p, metadata: { ...(p.metadata || {}), commission_rate_override: nextRate } }
          : p
      )));
      setCommissionModalProduct(null);
    } catch (e) {
      setCommissionError(e?.message || inventoryI18n.commissionRateError);
    } finally {
      setCommissionSaving(false);
    }
  };

  const clearCommissionOverride = async () => {
    if (!commissionModalProduct) return;
    setCommissionError("");
    setCommissionSaving(true);
    try {
      await medusaClient.setProductCommissionOverride(commissionModalProduct.id, null);
      setProducts((prev) => prev.map((p) => {
        if (p.id !== commissionModalProduct.id) return p;
        const nextMeta = { ...(p.metadata || {}) };
        delete nextMeta.commission_rate_override;
        return { ...p, metadata: nextMeta };
      }));
      setCommissionModalProduct(null);
    } catch (e) {
      setCommissionError(e?.message || inventoryI18n.commissionRateError);
    } finally {
      setCommissionSaving(false);
    }
  };

  const openDuplicateModal = (product) => {
    setMenuOpenId(null);
    setDuplicateSourceId(product.id);
    setDuplicateOptions({ ...DEFAULT_DUPLICATE_OPTIONS });
    setDuplicateModalOpen(true);
  };

  const renderRow = (product) => {
    const mergedIntoId = String(product?.status || "").toLowerCase() === "merged"
      ? String(product?.metadata?.merged_into_id || "").trim()
      : "";
    const mergedParent = mergedIntoId ? productsById.get(mergedIntoId) : null;
    const mergedParentLabel = mergedParent
      ? (getLocalizedTitle(mergedParent, locale) || mergedParent.sku || mergedIntoId)
      : (mergedIntoId || null);
    return (
    <InventoryProductRow
      key={product.id}
      product={product}
      mergedParentLabel={mergedIntoId ? mergedParentLabel : null}
      locale={locale}
      selectedIds={selectedIds}
      setSelectedIds={setSelectedIds}
      menuOpenId={menuOpenId}
      setMenuOpenId={setMenuOpenId}
      medusaClient={medusaClient}
      openDuplicateModal={openDuplicateModal}
      setProducts={setProducts}
      pendingChangeRequests={pendingChangeRequestsByProductId[product.id] || []}
      onOpenChangeRequests={(pid) => {
        setMenuOpenId(null);
        openChangeRequestsModal(pid);
      }}
      ui={ui}
      isSuperuser={isSuperuser}
      onOpenCommissionModal={openCommissionModal}
      sellerCommissionRatePct={
        product.seller_id && sellerCommissionRateById[product.seller_id] != null
          ? Math.round(Number(sellerCommissionRateById[product.seller_id]) * 1000) / 10
          : null
      }
      inventoryI18n={inventoryI18n}
    />
    );
  };

  const renderParentGroup = (masterId, items) => {
    const groupTitle = getLocalizedTitle(items[0], locale);
    return (
      <React.Fragment key={masterId}>
        <InvFamilyHeader>
          <InvGroupBadge>
            {locale === "tr" ? "Katalog ailesi" : locale === "en" ? "Catalog family" : locale === "fr" ? "Famille catalogue" : locale === "es" ? "Familia de catálogo" : locale === "it" ? "Famiglia catalogo" : "Katalogfamilie"}
          </InvGroupBadge>
          <InvGroupTitle>{groupTitle}</InvGroupTitle>
          <InvGroupMeta>
            {items.length}{" "}
            {locale === "tr" ? "ürün" : locale === "en" ? "products" : locale === "fr" ? "produits" : locale === "es" ? "productos" : locale === "it" ? "prodotti" : "Produkte"}
          </InvGroupMeta>
        </InvFamilyHeader>
        {items.map((product) => renderRow(product))}
      </React.Fragment>
    );
  };

  const toggleManualGroupExpanded = async (group) => {
    const willCollapse = expandedGroupIds.has(group.id);
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      willCollapse ? next.delete(group.id) : next.add(group.id);
      return next;
    });
    try {
      await medusaClient.updateInventoryGroup(group.id, { collapsed: willCollapse });
    } catch (_) { /* purely cosmetic — a failed persist just resets on next reload */ }
  };

  const deleteManualGroup = async (group) => {
    try {
      await medusaClient.deleteInventoryGroup(group.id);
      setInventoryGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (e) {
      setError(e?.message || "Failed to delete group");
    }
  };

  const renderManualGroup = (group, items) => {
    const isOpen = expandedGroupIds.has(group.id);
    const totalInv = items.reduce((s, p) => s + (Number(p?.inventory) || 0), 0);
    const sortedItems = sortProductsList(items, locale, inventorySort);
    return (
      <InvGroupCard key={`mg-${group.id}`}>
        <InvGroupHeader $open={isOpen}>
          <InvGroupToggle
            type="button"
            onClick={() => toggleManualGroupExpanded(group)}
            aria-expanded={isOpen}
            title={isOpen
              ? (locale === "tr" ? "Grubu kapat" : locale === "en" ? "Collapse group" : locale === "fr" ? "Replier le groupe" : locale === "es" ? "Contraer grupo" : locale === "it" ? "Comprimi gruppo" : "Gruppe einklappen")
              : (locale === "tr" ? "Grubu aç" : locale === "en" ? "Expand group" : locale === "fr" ? "Déplier le groupe" : locale === "es" ? "Expandir grupo" : locale === "it" ? "Espandi gruppo" : "Gruppe ausklappen")}
          >
            {isOpen ? "▼" : "▶"}
          </InvGroupToggle>
          <InvGroupBadge>
            {locale === "tr" ? "Grup" : locale === "en" ? "Group" : locale === "fr" ? "Groupe" : locale === "es" ? "Grupo" : locale === "it" ? "Gruppo" : "Gruppe"}
          </InvGroupBadge>
          <InvGroupTitle>{group.name}</InvGroupTitle>
          {group.sku ? <InvGroupMeta>SKU {group.sku}</InvGroupMeta> : null}
          <InvGroupMeta>
            {items.length}{" "}
            {locale === "tr" ? "ürün" : locale === "en" ? "products" : locale === "fr" ? "produits" : locale === "es" ? "productos" : locale === "it" ? "prodotti" : "Produkte"}
            {" · "}
            {locale === "tr" ? "stok" : locale === "en" ? "stock" : locale === "fr" ? "stock" : locale === "es" ? "stock" : locale === "it" ? "scorte" : "Bestand"}{" "}
            {totalInv}
          </InvGroupMeta>
          <InvGroupUngroup
            type="button"
            onClick={async () => { if (await confirmRemoval()) { deleteManualGroup(group); } }}
            title={locale === "tr" ? "Grubu çöz (ürünler silinmez)" : locale === "en" ? "Ungroup (products stay untouched)" : locale === "fr" ? "Dissocier (les produits sont conservés)" : locale === "es" ? "Desagrupar (los productos se mantienen)" : locale === "it" ? "Separa (i prodotti restano invariati)" : "Gruppierung aufheben (Produkte bleiben erhalten)"}
          >
            {locale === "tr" ? "Grubu çöz" : locale === "en" ? "Ungroup" : locale === "fr" ? "Dissocier" : locale === "es" ? "Desagrupar" : locale === "it" ? "Separa" : "Gruppierung aufheben"}
          </InvGroupUngroup>
        </InvGroupHeader>
        {isOpen && (
          <InvGroupBody>
            {renderInventoryHeader()}
            {sortedItems.map((product) => renderRow(product))}
          </InvGroupBody>
        )}
      </InvGroupCard>
    );
  };

  const manualGroupRows = sortedOwnRows.filter((e) => e.type === "manualGroup");
  const tableOwnRows = sortedOwnRows.filter((e) => e.type !== "manualGroup");

  const renderOwnRows = () =>
    tableOwnRows.map((entry) =>
      entry.type === "group"
        ? renderParentGroup(entry.masterId, entry.items)
        : renderRow(entry.product)
    );

  const closeDuplicateModal = () => {
    setDuplicateModalOpen(false);
    setDuplicateSourceId(null);
    setDuplicateFullProduct(null);
  };

  const productHasRealVariants = (product) =>
    Array.isArray(product?.variants) &&
    product.variants.some((v) => Array.isArray(v?.option_values) && v.option_values.length > 0);

  const openCombineModal = () => {
    if (selectedIds.length < 2) return;
    const selectedProducts = selectedIds.map((id) => products.find((p) => p.id === id)).filter(Boolean);
    if (!isSuperuser) {
      const notOwned = selectedProducts.filter((p) => !sellerOwnsForCombine(p, mySellerId));
      if (notOwned.length > 0) {
        setError(
          lt(
            locale,
            "You can only combine products you own. Products you added from the catalog or another seller cannot be combined as variants.",
            "Yalnızca kendi ürünlerinizi birleştirebilirsiniz. Katalogdan veya başka satıcıdan eklediğiniz ürünler varyant olarak birleştirilemez.",
            "Vous ne pouvez fusionner que vos propres produits. Les produits ajoutés depuis le catalogue ou un autre vendeur ne peuvent pas être fusionnés en variantes.",
            "Solo puedes combinar productos que posees. Los añadidos del catálogo u otro vendedor no se pueden combinar como variantes.",
            "Puoi unire solo i prodotti di tua proprietà. Quelli aggiunti dal catalogo o da un altro venditore non possono essere uniti come varianti.",
            "Sie können nur eigene Produkte zusammenführen. Aus dem Katalog oder von einem anderen Verkäufer hinzugefügte Produkte können nicht als Varianten kombiniert werden.",
          ),
        );
        return;
      }
    }
    const alreadyParent = selectedProducts.filter(productHasRealVariants);
    if (alreadyParent.length > 0) {
      setError(
        lt(
          locale,
          "Products that already have variants can't be combined under a new roof. Pick standalone products only.",
          "Zaten varyantı olan ürünler yeni bir çatı altına alınamaz. Yalnızca bağımsız ürünler seçin.",
          "Les produits qui ont déjà des variantes ne peuvent pas être fusionnés sous un nouveau toit. Sélectionnez uniquement des produits autonomes.",
          "Los productos que ya tienen variantes no se pueden combinar bajo un techo nuevo. Elige solo productos independientes.",
          "I prodotti che hanno già varianti non possono essere uniti sotto un nuovo tetto. Seleziona solo prodotti autonomi.",
          "Produkte, die bereits Varianten haben, können nicht unter ein neues Dach gelegt werden. Nur Standalone-Produkte wählen.",
        ),
      );
      return;
    }
    const firstTitle = getLocalizedTitle(selectedProducts[0], locale) || "";
    setCombineRoofTitle(firstTitle ? `${firstTitle}`.replace(/\s+/g, " ").trim() : "");
    setCombineRoofSku("");
    setCombineOptionName(
      locale === "en"
        ? "Variant"
        : locale === "tr"
          ? "Varyant"
          : locale === "fr"
            ? "Variante"
            : locale === "es"
              ? "Variante"
              : locale === "it"
                ? "Variante"
                : "Variante"
    );
    const labels = {};
    for (const id of selectedIds) {
      const prod = products.find((p) => p.id === id);
      labels[id] = getLocalizedTitle(prod, locale) || id;
    }
    setCombineLabels(labels);
    setCombineModalOpen(true);
  };

  const closeCombineModal = () => {
    setCombineModalOpen(false);
    setCombineSaving(false);
  };

  const runCombineAsVariants = async () => {
    if (selectedIds.length < 2) return;
    const title = String(combineRoofTitle || "").trim();
    const sku = String(combineRoofSku || "").trim();
    if (!title || !sku) {
      setError(
        lt(
          locale,
          "Enter a name and SKU for the new roof product.",
          "Yeni çatı ürünü için isim ve SKU girin.",
          "Saisissez un nom et un SKU pour le nouveau produit toit.",
          "Introduce un nombre y un SKU para el nuevo producto techo.",
          "Inserisci nome e SKU per il nuovo prodotto tetto.",
          "Name und SKU für das neue Dachprodukt eingeben.",
        ),
      );
      return;
    }
    setCombineSaving(true);
    setError(null);
    try {
      const res = await medusaClient.combineProductsAsVariants({
        createNewParent: true,
        parentTitle: title,
        parentSku: sku,
        productIds: selectedIds,
        optionName: combineOptionName,
        optionValues: combineLabels,
      });
      closeCombineModal();
      setSelectedIds([]);
      const data = await medusaClient.getAdminHubProducts();
      setProducts(data.products || []);
      const parent = res?.parent_id || (Array.isArray(res?.product_ids) ? res.product_ids[0] : null);
      if (parent) router.push(`/products/${parent}`);
    } catch (e) {
      setError(userError(e, locale, "Failed to combine products"));
      setCombineSaving(false);
    }
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
      <InvPageContainer>
        <InvTableCard style={{ padding: 16 }}>
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={6} />
          </BlockStack>
        </InvTableCard>
      </InvPageContainer>
    );
  }

  const invTitle = lt(locale, "Inventory", "Envanter", "Inventaire", "Inventario", "Inventario", "Bestand");
  const statusOptions = [
    { label: lt(locale, "All statuses", "Tüm statüler", "Tous les statuts", "Todos los estados", "Tutti gli stati", "Alle Status"), value: "all" },
    { label: lt(locale, "Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv"), value: "published" },
    { label: lt(locale, "Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf"), value: "draft" },
    { label: lt(locale, "Inactive", "Pasif", "Inactif", "Inactivo", "Inattivo", "Inaktiv"), value: "inactive" },
    { label: lt(locale, "Archived", "Arşiv", "Archivé", "Archivado", "Archiviato", "Archiviert"), value: "archived" },
  ];
  const sortOptions = [
    { label: "Name A→Z", value: "title_asc" },
    { label: "Name Z→A", value: "title_desc" },
    { label: lt(locale, "Inventory (high→low)", "Stok (yüksek→düşük)", "Stock (haut→bas)", "Stock (alto→bajo)", "Stock (alto→basso)", "Bestand (hoch→niedrig)"), value: "inventory_desc" },
    { label: lt(locale, "Inventory (low→high)", "Stok (düşük→yüksek)", "Stock (bas→haut)", "Stock (bajo→alto)", "Stock (basso→alto)", "Bestand (niedrig→hoch)"), value: "inventory_asc" },
    { label: lt(locale, "Price (high→low)", "Fiyat (yüksek→düşük)", "Prix (haut→bas)", "Precio (alto→bajo)", "Prezzo (alto→basso)", "Preis (hoch→niedrig)"), value: "price_desc" },
    { label: lt(locale, "Price (low→high)", "Fiyat (düşük→yüksek)", "Prix (bas→haut)", "Precio (bajo→alto)", "Prezzo (basso→alto)", "Preis (niedrig→hoch)"), value: "price_asc" },
    { label: lt(locale, "Newest first", "Önce yeni", "Plus récent", "Más reciente", "Più recente", "Neu zuerst"), value: "created_desc" },
    { label: lt(locale, "Oldest first", "Önce eski", "Plus ancien", "Más antiguo", "Più vecchio", "Älteste zuerst"), value: "created_asc" },
  ];
  const productsWord = lt(locale, "products", "ürün", "produits", "productos", "prodotti", "Produkte");
  const totalCount = ownProducts.length + (isSuperuser ? filteredSellerGroups.reduce((n, g) => n + g.items.length, 0) : 0);
  const emptyText = isSuperuser
    ? lt(locale, "No products in this section.", "Bu bölümde ürün yok.", "Aucun produit dans cette section.", "Sin productos en esta sección.", "Nessun prodotto in questa sezione.", "Keine Produkte in diesem Bereich.")
    : lt(locale, "No products yet. Add your first product to get started.", "Henüz ürün yok. Başlamak için ilk ürününüzü ekleyin.", "Aucun produit pour l'instant. Ajoutez votre premier produit.", "Aún no hay productos. Agrega tu primer producto.", "Ancora nessun prodotto. Aggiungi il tuo primo prodotto.", "Noch keine Produkte. Fügen Sie Ihr erstes Produkt hinzu.");
  const addProductLabel = lt(locale, "Add product", "Ürün ekle", "Ajouter un produit", "Agregar producto", "Aggiungi prodotto", "Produkt hinzufügen");
  const bulkUploadLabel = lt(locale, "Bulk upload", "Toplu yükleme", "Import en masse", "Carga masiva", "Caricamento in blocco", "Massenimport");
  const selectedCount = selectedIds.length;
  const canCombineSelection =
    selectedCount >= 2 &&
    (isSuperuser ||
      selectedIds.every((id) => {
        const p = products.find((x) => x.id === id);
        return p && sellerOwnsForCombine(p, mySellerId);
      }));

  return (
    <InvPageContainer>
      <ScPageHeader
        breadcrumb={[{ label: lt(locale, "Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte") }]}
        title={invTitle}
        subtitle={`${totalCount} ${productsWord}`}
        actions={<>
          {isSuperuser && (
            <Button
              size="slim"
              icon={SettingsIcon}
              accessibilityLabel={lt(locale, "Inventory settings", "Envanter ayarları", "Paramètres inventaire", "Ajustes de inventario", "Impostazioni inventario", "Bestand-Einstellungen")}
              onClick={() => router.push("/settings/inventory")}
            />
          )}
          <Button size="slim" onClick={() => router.push("/products/add-existing")}>
            {lt(locale, "Add existing product", "Mevcut ürün ekle", "Ajouter produit existant", "Agregar producto existente", "Aggiungi prodotto esistente", "Bestehendes Produkt hinzufügen")}
          </Button>
          <Button size="slim" url="/import-export">{bulkUploadLabel}</Button>
          <Button size="slim" onClick={() => setExportModalOpen(true)}>
            {lt(locale, "Export", "Dışa aktar", "Exporter", "Exportar", "Esporta", "Exportieren")}
          </Button>
          <Button size="slim" onClick={() => setGroupModalOpen(true)}>
            {lt(locale, "Group products", "Ürünleri grupla", "Grouper les produits", "Agrupar productos", "Raggruppa prodotti", "Produkte gruppieren")}
          </Button>
          <Button variant="primary" size="slim" onClick={() => router.push("/products/new")}>{addProductLabel}</Button>
        </>}
      />

      {error && (
        <div style={{ marginBottom: 8 }}>
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        </div>
      )}

      {!isSuperuser && payoutSetupMissing && (payoutSetupMissing.card || payoutSetupMissing.iban) && (
        <div style={{ marginBottom: 8 }}>
          <Banner
            tone="warning"
            title={lt(locale, "Required setup missing", "Satış için zorunlu bilgiler eksik", "Informations obligatoires manquantes", "Faltan datos obligatorios", "Dati obbligatori mancanti", "Pflichtangaben für den Verkauf fehlen")}
            action={{ content: lt(locale, "Complete now", "Şimdi tamamla", "Compléter maintenant", "Completar ahora", "Completa ora", "Jetzt erledigen"), onAction: () => router.push("/settings/payments") }}
          >
            <p>
              {payoutSetupMissing.card && payoutSetupMissing.iban
                ? lt(locale, "You can keep managing products, but without a credit card (fees) and IBAN (payouts) your seller setup isn't complete for real sales.", "Ürünlerinizi yönetmeye devam edebilirsiniz, ama Gebühren için kredi kartı ve Auszahlung için IBAN eklemeden gerçek satış/ödeme akışı tamamlanmış sayılmaz.", "Vous pouvez continuer à gérer vos produits, mais sans carte bancaire (frais) ni IBAN (versements), votre configuration vendeur n’est pas complète pour vendre réellement.", "Puedes seguir gestionando productos, pero sin tarjeta de crédito (comisiones) ni IBAN (pagos) tu configuración de vendedor no está completa para vender de verdad.", "Puoi continuare a gestire i prodotti, ma senza carta di credito (commissioni) e IBAN (pagamenti) la configurazione del venditore non è completa per vendere davvero.", "Sie können Ihre Produkte weiter verwalten, aber ohne Kreditkarte (Gebühren) und IBAN (Auszahlung) gilt die Einrichtung für den echten Verkauf nicht als abgeschlossen.")
                : payoutSetupMissing.card
                ? lt(locale, "You haven't added a credit card for platform fees yet.", "Platform ücretleri (Gebühren) için kredi kartı eklemediniz.", "Vous n’avez pas encore ajouté de carte bancaire pour les frais de la plateforme.", "Aún no has añadido una tarjeta de crédito para las comisiones de la plataforma.", "Non hai ancora aggiunto una carta di credito per le commissioni della piattaforma.", "Sie haben noch keine Kreditkarte für die Plattformgebühren (Gebühren) hinterlegt.")
                : lt(locale, "You haven't added an IBAN for your payouts yet.", "Ödemelerinizin (Auszahlung) yatırılabilmesi için IBAN eklemediniz.", "Vous n’avez pas encore ajouté d’IBAN pour vos versements.", "Aún no has añadido un IBAN para tus pagos.", "Non hai ancora aggiunto un IBAN per i tuoi pagamenti.", "Sie haben noch keine IBAN für Ihre Auszahlungen hinterlegt.")}
            </p>
          </Banner>
        </div>
      )}

      {selectedCount > 0 && (
        <ScBulkBar label={`${selectedCount} ${lt(locale, "selected", "seçili", "sélectionné(s)", "seleccionado(s)", "selezionato/i", "ausgewählt")}`}>
          <InlineStack gap="200" wrap blockAlign="center">
            {canCombineSelection && (
              <Button size="slim" onClick={openCombineModal}>
                {lt(locale, "Combine as variants", "Varyant olarak birleştir", "Fusionner en variantes", "Combinar como variantes", "Unisci come varianti", "Als Varianten zusammenführen")} ({selectedCount})
              </Button>
            )}
            <Button
              variant="primary"
              size="slim"
              onClick={() => {
                const firstId = selectedIds[0];
                if (firstId) router.push(`/products/${products.find((p) => p.id === firstId)?.id || firstId}`);
              }}
            >
              {lt(locale, "Bulk edit", "Toplu düzenle", "Modifier en masse", "Edición masiva", "Modifica in blocco", "Massenbearbeitung")} ({selectedCount})
            </Button>
            <Button variant="plain" size="slim" onClick={() => setSelectedIds([])}>
              {lt(locale, "Clear selection", "Seçimi temizle", "Effacer la sélection", "Borrar selección", "Cancella selezione", "Auswahl aufheben")}
            </Button>
          </InlineStack>
        </ScBulkBar>
      )}

      {/* Status tabs (Konsept s32/s33) replace the status dropdown */}
      <ScTabs
        tabs={statusOptions.map((o) => ({ id: o.value, label: o.value === "all" ? lt(locale, "All", "Tümü", "Tous", "Todos", "Tutti", "Alle") : o.label, count: o.value === statusFilter ? totalCount : undefined }))}
        selected={statusFilter}
        onSelect={setStatusFilter}
      />
      <InvFilterBar>
        <InvFilterInput
          placeholder={lt(locale, "Search products (name, SKU, EAN, variation)…", "Ürün ara (isim, sku, ean, varyasyon)…", "Rechercher produits (nom, SKU, EAN, variation)…", "Buscar productos (nombre, SKU, EAN, variación)…", "Cerca prodotti (nome, SKU, EAN, variazione)…", "Produkte suchen (Name, SKU, EAN, Variation)…")}
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          aria-label="Search products"
        />
        <InvFilterSelect value={inventorySort} onChange={(e) => setInventorySort(e.target.value)} aria-label="Sort">
          {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </InvFilterSelect>
        {isSuperuser && (
          <InvFilterToggle type="button" $on={showCustomCommissionOnly} aria-pressed={showCustomCommissionOnly} onClick={() => setShowCustomCommissionOnly((v) => !v)}>
            {inventoryI18n.customCommissionFilter}
          </InvFilterToggle>
        )}
        {isSuperuser && (
          <InvFilterInput
            placeholder={lt(locale, "Search seller (store name)…", "Satıcı ara (Mağaza adı)…", "Chercher vendeur (nom de boutique)…", "Buscar vendedor (nombre de tienda)…", "Cerca venditore (nome negozio)…", "Verkäufer suchen (Store-Name)…")}
            value={sellerSearchFilter}
            onChange={(e) => setSellerSearchFilter(e.target.value)}
            aria-label="Seller filter"
          />
        )}
      </InvFilterBar>

      {isSuperuser && eanDuplicateGroups.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Banner
            tone="warning"
            title={lt(locale, `${eanDuplicateGroups.length} duplicate product(s) found`, `${eanDuplicateGroups.length} yinelenen ürün bulundu`, `${eanDuplicateGroups.length} produit(s) en double trouvé(s)`, `${eanDuplicateGroups.length} producto(s) duplicado(s) encontrado(s)`, `${eanDuplicateGroups.length} prodotto/i duplicato/i trovato/i`, `${eanDuplicateGroups.length} doppelte Produkt(e) gefunden`)}
            action={{
              content: lt(locale, "Review & merge", "İncele ve birleştir", "Vérifier et fusionner", "Revisar y fusionar", "Rivedi e unisci", "Prüfen & zusammenführen"),
              onAction: () => setEanDuplicatesModalOpen(true),
            }}
          >
            <p>
              {lt(
                locale,
                "Multiple sellers listed the same EAN and it created separate catalog entries instead of one shared listing. Merge each group back into the original entry so ownership stays with whoever added it first.",
                "Birden fazla satıcı aynı EAN'i listeledi ve bu, ortak bir listing yerine ayrı katalog kayıtları oluşturdu. Sahipliğin ilk ekleyen satıcıda kalması için her grubu orijinal kayda geri birleştirin.",
                "Plusieurs vendeurs ont référencé le même EAN, créant des fiches catalogue distinctes au lieu d'une seule offre partagée. Fusionnez chaque groupe dans la fiche d'origine pour que la propriété reste au premier vendeur.",
                "Varios vendedores listaron el mismo EAN y se crearon fichas de catálogo separadas en lugar de una sola oferta compartida. Fusiona cada grupo con la ficha original para que la propiedad se mantenga con quien la añadió primero.",
                "Più venditori hanno inserito lo stesso EAN creando voci di catalogo separate invece di un'unica offerta condivisa. Unisci ogni gruppo alla voce originale così la proprietà resta al primo venditore.",
                "Mehrere Verkäufer haben dieselbe EAN gelistet, wodurch getrennte Katalogeinträge statt eines gemeinsamen Angebots entstanden sind. Führe jede Gruppe wieder mit dem ursprünglichen Eintrag zusammen, damit die Inhaberschaft beim Erstverkäufer bleibt."
              )}
            </p>
          </Banner>
        </div>
      )}

      {isSuperuser && (
        <InvSectionLabel>
          {lt(locale, "Your superuser area", "Süper kullanıcı alanınız", "Votre espace super-utilisateur", "Tu área de superusuario", "La tua area superutente", "Ihr Superuser-Bereich")} ({ownProducts.length})
        </InvSectionLabel>
      )}
      {ownProducts.length === 0 ? (
        <InvEmpty>
          <span>{emptyText}</span>
          {!isSuperuser && (
            <InlineStack gap="200">
              <Button variant="primary" size="slim" url="/products/new">{addProductLabel}</Button>
              <Button size="slim" url="/import-export">{bulkUploadLabel}</Button>
            </InlineStack>
          )}
        </InvEmpty>
      ) : (
        <>
          {manualGroupRows.map((entry) => renderManualGroup(entry.group, entry.items))}
          {tableOwnRows.length > 0 && (
            <TableShell>
              {renderInventoryHeader()}
              {renderOwnRows()}
            </TableShell>
          )}
        </>
      )}

      {isSuperuser && (
        <>
          <InvSectionLabel $seller>
            {lt(locale, "Seller products", "Satıcı ürünleri", "Produits des vendeurs", "Productos de vendedores", "Prodotti dei venditori", "Verkäufer-Produkte")}
          </InvSectionLabel>
          {filteredSellerGroups.length === 0 ? (
            <InvEmpty>
              <span>
                {lt(locale, "No more seller products", "Başka satıcı ürünü yok", "Aucun autre produit de vendeur", "No hay más productos de vendedores", "Nessun altro prodotto di venditori", "Keine weiteren Verkäufer-Produkte")}
                {sellerSearchFilter.trim() ? " (Filter)" : ""}.
              </span>
            </InvEmpty>
          ) : (
            filteredSellerGroups.map(({ sellerId, items }) => {
              const label = sellerLabelById[sellerId] || sellerId;
              const open = sellerSectionsOpen[sellerId] !== false;
              const sortedItems = sortProductsList(items, locale, inventorySort);
              return (
                <InvTableCard key={sellerId}>
                  <InvSellerGroupHeader
                    type="button"
                    aria-expanded={open}
                    onClick={() => setSellerSectionsOpen((prev) => ({ ...prev, [sellerId]: !open }))}
                  >
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#1d1b18" }}>{label}</span>
                    <span style={{ fontSize: 11, color: "#5e574e" }}>{open ? "▲" : "▼"} {sortedItems.length} {productsWord}</span>
                  </InvSellerGroupHeader>
                  {open && (
                    <div style={{ overflowX: "auto" }}>
                      {renderInventoryHeader()}
                      {sortedItems.map((product) => renderRow(product))}
                    </div>
                  )}
                </InvTableCard>
              );
            })
          )}
        </>
      )}

      {groupModalOpen && (
        <GroupProductsModal
          locale={locale}
          ownProducts={ownProducts}
          manualGroupedIdSet={manualGroupedIdSet}
          initialSelectedIds={selectedIds}
          getLocalizedTitle={getLocalizedTitle}
          onClose={() => setGroupModalOpen(false)}
          onCreate={async (payload) => {
            const res = await medusaClient.createInventoryGroup(payload);
            if (res?.group) {
              setInventoryGroups((prev) => [...prev, res.group]);
              setExpandedGroupIds((prev) => {
                const next = new Set(prev);
                next.add(res.group.id);
                return next;
              });
            }
            setSelectedIds([]);
            setGroupModalOpen(false);
          }}
        />
      )}

      <Modal
        open={combineModalOpen}
        onClose={closeCombineModal}
        title={
          locale === "en"
            ? "Combine as variants"
            : locale === "tr"
              ? "Varyant olarak birlestir"
              : locale === "fr"
                ? "Fusionner en variantes"
                : locale === "es"
                  ? "Combinar como variantes"
                  : locale === "it"
                    ? "Unisci come varianti"
                    : "Als Varianten zusammenführen"
        }
        primaryAction={{
          content:
            locale === "en"
              ? "Create roof & combine"
              : locale === "tr"
                ? "Çatı oluştur ve birleştir"
                : locale === "fr"
                  ? "Créer le toit et fusionner"
                  : locale === "es"
                    ? "Crear techo y combinar"
                    : locale === "it"
                      ? "Crea tetto e unisci"
                      : "Dach erstellen & zusammenführen",
          onAction: runCombineAsVariants,
          loading: combineSaving,
          disabled: selectedIds.length < 2 || !String(combineRoofTitle || "").trim() || !String(combineRoofSku || "").trim(),
        }}
        secondaryActions={[{ content: ui.cancel, onAction: closeCombineModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {locale === "tr"
                ? "Yeni bir çatı ürün oluşturulur (isim + SKU). Seçilen ürünler onun varyantı olur ve arşivlenir (silinmez). Mevcut ürünlerden hiçbiri parent olmaz."
                : locale === "en"
                  ? "A new roof product is created (name + SKU). Selected products become its variants and are archived (not deleted). None of the existing products becomes the parent."
                  : locale === "fr"
                    ? "Un nouveau produit toit est créé (nom + SKU). Les produits sélectionnés deviennent ses variantes et sont archivés (pas supprimés). Aucun produit existant ne devient le parent."
                    : locale === "es"
                      ? "Se crea un nuevo producto techo (nombre + SKU). Los seleccionados pasan a ser sus variantes y se archivan. Ningún producto existente se convierte en el padre."
                      : locale === "it"
                        ? "Viene creato un nuovo prodotto tetto (nome + SKU). I selezionati diventano sue varianti e vengono archiviati. Nessun prodotto esistente diventa il parent."
                        : "Es wird ein neues Dachprodukt angelegt (Name + SKU). Die ausgewählten Produkte werden seine Varianten und archiviert (nicht gelöscht). Kein bestehendes Produkt wird zum Parent."}
            </Text>
            <TextField
              label={
                locale === "tr" ? "Çatı ürün adı" : locale === "en" ? "Roof product name" : locale === "fr" ? "Nom du produit toit" : locale === "es" ? "Nombre del producto techo" : locale === "it" ? "Nome prodotto tetto" : "Dachprodukt-Name"
              }
              value={combineRoofTitle}
              onChange={setCombineRoofTitle}
              autoComplete="off"
              helpText={
                locale === "tr" ? "Shop’ta görünen aile / çatı başlığı" : locale === "en" ? "Family / roof title shown in the shop" : locale === "fr" ? "Titre famille / toit affiché en boutique" : locale === "es" ? "Título de familia / techo en la tienda" : locale === "it" ? "Titolo famiglia / tetto nel negozio" : "Familien-/Dachtitel im Shop"
              }
            />
            <TextField
              label={locale === "tr" ? "Çatı SKU" : locale === "en" ? "Roof SKU" : locale === "fr" ? "SKU toit" : locale === "es" ? "SKU techo" : locale === "it" ? "SKU tetto" : "Dach-SKU"}
              value={combineRoofSku}
              onChange={setCombineRoofSku}
              autoComplete="off"
              helpText={
                locale === "tr" ? "Çatı ürünün kendi SKU’su (varyant SKU’larından ayrı)" : locale === "en" ? "SKU for the roof itself (separate from variant SKUs)" : locale === "fr" ? "SKU du toit (distinct des SKU des variantes)" : locale === "es" ? "SKU del techo (aparte de los SKU de variantes)" : locale === "it" ? "SKU del tetto (separato dagli SKU delle varianti)" : "SKU des Dachs (getrennt von Varianten-SKUs)"
              }
            />
            <TextField
              label={
                locale === "tr" ? "Seçenek adı" : locale === "en" ? "Option name" : locale === "fr" ? "Nom de l’option" : locale === "es" ? "Nombre de la opción" : locale === "it" ? "Nome opzione" : "Optionsname"
              }
              value={combineOptionName}
              onChange={setCombineOptionName}
              autoComplete="off"
              helpText={
                locale === "tr" ? "örn. Renk, Beden" : locale === "en" ? "e.g. Color, Size" : locale === "fr" ? "p. ex. Couleur, Taille" : locale === "es" ? "p. ej. Color, Talla" : locale === "it" ? "ad es. Colore, Taglia" : "z. B. Farbe, Größe"
              }
            />
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                {locale === "tr" ? "Varyant etiketleri" : locale === "en" ? "Variant labels" : locale === "fr" ? "Libellés des variantes" : locale === "es" ? "Etiquetas de variantes" : locale === "it" ? "Etichette varianti" : "Variantenbezeichnungen"}
              </Text>
              {selectedIds.map((id) => {
                const prod = products.find((p) => p.id === id);
                return (
                  <TextField
                    key={id}
                    label={getLocalizedTitle(prod, locale) || id}
                    value={combineLabels[id] || ""}
                    onChange={(v) => setCombineLabels((prev) => ({ ...prev, [id]: v }))}
                    autoComplete="off"
                  />
                );
              })}
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={duplicateModalOpen}
        onClose={closeDuplicateModal}
        title={locale === "en" ? "Duplicate product" : locale === "tr" ? "Ürünü kopyala" : locale === "fr" ? "Dupliquer le produit" : locale === "es" ? "Duplicar producto" : locale === "it" ? "Duplica prodotto" : "Produkt duplizieren"}
        primaryAction={{
          content: locale === "en" ? "Create duplicate" : locale === "tr" ? "Kopyayı oluştur" : locale === "fr" ? "Créer le doublon" : locale === "es" ? "Crear duplicado" : locale === "it" ? "Crea duplicato" : "Duplikat erstellen",
          onAction: runDuplicate,
          loading: duplicateSaving,
        }}
        secondaryActions={[{ content: ui.cancel, onAction: closeDuplicateModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text as="p" tone="subdued">
              {locale === "en" ? <><span>Choose what to copy into the new product. </span><strong>SKU and EAN are never copied</strong><span> and must be set for the new product.</span></> : locale === "tr" ? <><span>Yeni ürüne kopyalanacakları seçin. </span><strong>SKU ve EAN hiçbir zaman kopyalanmaz</strong><span> ve yeni ürün için ayarlanmalıdır.</span></> : locale === "fr" ? <><span>Choisissez ce qui doit être copié dans le nouveau produit. </span><strong>SKU et EAN ne sont jamais copiés</strong><span> et doivent être définis pour le nouveau produit.</span></> : locale === "es" ? <><span>Elige qué copiar en el nuevo producto. </span><strong>SKU y EAN nunca se copian</strong><span> y deben definirse para el nuevo producto.</span></> : locale === "it" ? <><span>Scegli cosa copiare nel nuovo prodotto. </span><strong>SKU e EAN non vengono mai copiati</strong><span> e devono essere impostati per il nuovo prodotto.</span></> : <><span>Auswählen, was in das neue Produkt kopiert werden soll. </span><strong>SKU und EAN werden nie kopiert</strong><span> und müssen für das neue Produkt gesetzt werden.</span></>}
            </Text>
            {!duplicateFullProduct ? (
              <InlineStack gap="200" blockAlign="center">
                <SkeletonBodyText lines={1} />
                <Text as="span" tone="subdued">{locale === "en" ? "Loading product…" : locale === "tr" ? "Ürün yükleniyor…" : locale === "fr" ? "Chargement du produit…" : locale === "es" ? "Cargando producto…" : locale === "it" ? "Caricamento prodotto…" : "Produkt wird geladen…"}</Text>
              </InlineStack>
            ) : (
              <BlockStack gap="300">
                <Checkbox
                  label={locale === "en" ? "Copy title" : locale === "tr" ? "Başlığı kopyala" : locale === "fr" ? "Copier le titre" : locale === "es" ? "Copiar título" : locale === "it" ? "Copia titolo" : "Titel kopieren"}
                  checked={duplicateOptions.title}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, title: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Description" : locale === "tr" ? "Açıklama" : locale === "fr" ? "Description" : locale === "es" ? "Descripción" : locale === "it" ? "Descrizione" : "Beschreibung"}
                  checked={duplicateOptions.description}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, description: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Price" : locale === "tr" ? "Fiyat" : locale === "fr" ? "Prix" : locale === "es" ? "Precio" : locale === "it" ? "Prezzo" : "Preis"}
                  checked={duplicateOptions.price}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, price: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Inventory quantity" : locale === "tr" ? "Envanter miktarı" : locale === "fr" ? "Quantité en stock" : locale === "es" ? "Cantidad en inventario" : locale === "it" ? "Quantità inventario" : "Bestandsmenge"}
                  checked={duplicateOptions.inventory}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, inventory: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Categories / collection" : locale === "tr" ? "Kategoriler / koleksiyon" : locale === "fr" ? "Catégories / collection" : locale === "es" ? "Categorías / colección" : locale === "it" ? "Categorie / collezione" : "Kategorien / Kollektion"}
                  checked={duplicateOptions.categories}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, categories: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Images / media" : locale === "tr" ? "Görseller / medya" : locale === "fr" ? "Images / médias" : locale === "es" ? "Imágenes / medios" : locale === "it" ? "Immagini / media" : "Bilder / Medien"}
                  checked={duplicateOptions.media}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, media: v }))}
                />
                <Checkbox
                  label={locale === "en" ? "Variants (option names and values; SKU/EAN never copied)" : locale === "tr" ? "Varyantlar (seçenek adları ve değerleri; SKU/EAN hiçbir zaman kopyalanmaz)" : locale === "fr" ? "Variantes (noms et valeurs d'options ; SKU/EAN jamais copiés)" : locale === "es" ? "Variantes (nombres y valores de opciones; SKU/EAN nunca se copian)" : locale === "it" ? "Varianti (nomi e valori delle opzioni; SKU/EAN mai copiati)" : "Varianten (Optionsnamen und -werte; SKU/EAN werden nie kopiert)"}
                  checked={duplicateOptions.variants}
                  onChange={(v) => setDuplicateOptions((o) => ({ ...o, variants: v }))}
                />
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={changeRequestsModalOpen}
        onClose={() => setChangeRequestsModalOpen(false)}
        title={(() => {
          const label = locale === "en" ? "Proposed changes" : locale === "tr" ? "Önerilen değişiklikler" : locale === "fr" ? "Modifications proposées" : locale === "es" ? "Cambios propuestos" : locale === "it" ? "Modifiche proposte" : "Vorgeschlagene Änderungen";
          if (changeRequestsModalProductId) {
            const productTitle = products.find((p) => String(p?.id || '') === String(changeRequestsModalProductId))?.title || (locale === "en" ? "Product" : locale === "tr" ? "Ürün" : locale === "fr" ? "Produit" : locale === "es" ? "Producto" : locale === "it" ? "Prodotto" : "Produkt");
            return `${label} (${productTitle})`;
          }
          return label;
        })()}
        primaryAction={{ content: ui.close, onAction: () => setChangeRequestsModalOpen(false) }}
        secondaryActions={[]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {changeRequestsModalProductId ? (
              <Box paddingBlockEnd="200">
                <I18nLink
                  href={`/products/${changeRequestsModalProductId}`}
                  style={{ fontSize: 13, fontWeight: 600, color: "#0284c7", textDecoration: "none" }}
                >
                  {locale === "en" ? "Open product edit page →" : locale === "tr" ? "Ürün düzenleme sayfasına git →" : locale === "fr" ? "Ouvrir la page de modification du produit →" : locale === "es" ? "Abrir página de edición del producto →" : locale === "it" ? "Apri pagina di modifica prodotto →" : "Zur Produktbearbeitung →"}
                </I18nLink>
              </Box>
            ) : null}
            {changeRequestsModalItems.length === 0 ? (
              <Text as="p" tone="subdued">
                {locale === "en" ? "No pending change proposals." : locale === "tr" ? "Bekleyen değişiklik önerisi yok." : locale === "fr" ? "Aucune proposition de modification en attente." : locale === "es" ? "No hay propuestas de cambio pendientes." : locale === "it" ? "Nessuna proposta di modifica in sospeso." : "Keine ausstehenden Änderungsvorschläge."}
              </Text>
            ) : (
              changeRequestsModalItems
                .map((cr) => {
                const field = String(cr.field_name || '');
                const curLabel = l === "tr" ? "Mevcut deger" : l === "de" ? "Aktueller Wert" : l === "fr" ? "Valeur actuelle" : l === "es" ? "Valor actual" : l === "it" ? "Valore attuale" : "Current value";
                const propLabel = l === "tr" ? "Önerilen değer" : l === "de" ? "Vorgeschlagener Wert" : l === "fr" ? "Valeur proposée" : l === "es" ? "Valor propuesto" : l === "it" ? "Valore proposto" : "Proposed value";
                return (
                  <Card key={cr.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        {fieldNameDisplayLabel(field, l)}
                      </Text>
                      <Divider />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <Text as="p" variant="bodySm" tone="subdued">{curLabel}</Text>
                          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 4 }}>
                            {formatChangeRequestValueForDisplay(cr.old_value)}
                          </div>
                        </div>
                        <div>
                          <Text as="p" variant="bodySm" tone="subdued">{propLabel}</Text>
                          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: 600, marginTop: 4 }}>
                            {formatChangeRequestValueForDisplay(cr.new_value)}
                          </div>
                        </div>
                      </div>
                      {isSuperuser && (
                        <InlineStack gap="200">
                          <Button
                            variant="primary"
                            tone="success"
                            size="slim"
                            onClick={() => approveChangeRequest(cr.id)}
                          >
                            {locale === "en" ? "Approve" : locale === "tr" ? "Onayla" : locale === "fr" ? "Approuver" : locale === "es" ? "Aprobar" : locale === "it" ? "Approva" : "Genehmigen"}
                          </Button>
                          <Button
                            variant="secondary"
                            tone="critical"
                            size="slim"
                            onClick={() => rejectChangeRequest(cr.id)}
                          >
                            {locale === "en" ? "Reject" : locale === "tr" ? "Reddet" : locale === "fr" ? "Refuser" : locale === "es" ? "Rechazar" : locale === "it" ? "Rifiuta" : "Ablehnen"}
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Card>
                );
              })
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title={l === "tr" ? "Envanteri disa aktar" : l === "de" ? "Inventar exportieren" : l === "fr" ? "Exporter l'inventaire" : l === "es" ? "Exportar inventario" : l === "it" ? "Esporta inventario" : "Export inventory"}
        primaryAction={{
          content: l === "tr" ? "Disa aktar" : l === "de" ? "Exportieren" : l === "fr" ? "Exporter" : l === "es" ? "Exportar" : l === "it" ? "Esporta" : "Export",
          onAction: runQuickExport,
          loading: exporting,
        }}
        secondaryActions={[
          { content: l === "tr" ? "Iptal" : l === "de" ? "Abbrechen" : l === "fr" ? "Annuler" : l === "es" ? "Cancelar" : l === "it" ? "Annulla" : "Cancel", onAction: () => setExportModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              {l === "tr"
                ? "Filtrelenmiş ürünler dışa aktarılır: her ürün için bir parent satırı, her varyant için bir child satırı (ilk sütun: product_type)."
                : l === "de"
                ? "Gefilterte Produkte werden exportiert: pro Artikel eine Parent-Zeile, pro Variante eine Child-Zeile (erste Spalte: product_type)."
                : l === "fr"
                ? "Les produits filtrés sont exportés : une ligne parent par produit, une ligne enfant par variante (première colonne : product_type)."
                : l === "es"
                ? "Los productos filtrados se exportan: una fila padre por producto, una fila hijo por variante (primera columna: product_type)."
                : l === "it"
                ? "I prodotti filtrati vengono esportati: una riga padre per prodotto, una riga figlio per variante (prima colonna: product_type)."
                : "Filtered products are exported: one parent row per product, one child row per variant (first column: product_type)."}
            </Text>
            <Select
              label={l === "tr" ? "Format" : l === "en" ? "Format" : l === "fr" ? "Format" : l === "es" ? "Formato" : l === "it" ? "Formato" : "Format"}
              value={exportFormat}
              onChange={setExportFormat}
              options={[
                { label: "XLSX", value: "xlsx" },
                { label: "CSV", value: "csv" },
                { label: "TXT", value: "txt" },
              ]}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {isSuperuser && (
        <Modal
          open={eanDuplicatesModalOpen}
          onClose={() => setEanDuplicatesModalOpen(false)}
          title={lt(locale, "Duplicate products", "Yinelenen ürünler", "Produits en double", "Productos duplicados", "Prodotti duplicati", "Doppelte Produkte")}
          secondaryActions={[{ content: ui.cancel, onAction: () => setEanDuplicatesModalOpen(false) }]}
        >
          <Modal.Section>
            {eanDuplicateGroups.length === 0 ? (
              <Text as="p" tone="subdued">
                {lt(locale, "No duplicates found.", "Yinelenen ürün bulunamadı.", "Aucun doublon trouvé.", "No se encontraron duplicados.", "Nessun duplicato trovato.", "Keine Duplikate gefunden.")}
              </Text>
            ) : (
              <BlockStack gap="400">
                {eanDuplicateGroups.map((group) => (
                  <Card key={group.ean}>
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">EAN {group.ean}</Text>
                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <BlockStack gap="050">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {lt(locale, "Original (keeps ownership)", "Orijinal (sahiplik burada kalır)", "Original (conserve la propriété)", "Original (mantiene la propiedad)", "Originale (mantiene la proprietà)", "Original (behält die Inhaberschaft)")}
                          </Text>
                          <Text as="p">
                            {group.master.title || group.master.id} · {sellerLabelById[group.master.seller_id] || group.master.seller_id || "—"}  {fmtDateShort(group.master.created_at, locale)}
                          </Text>
                        </BlockStack>
                      </Box>
                      {group.duplicates.map((dup) => (
                        <InlineStack key={dup.id} align="space-between" blockAlign="center" wrap>
                          <BlockStack gap="050">
                            <Text as="p">
                              {dup.title || dup.id} · {sellerLabelById[dup.seller_id] || dup.seller_id || "—"}  {fmtDateShort(dup.created_at, locale)}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {fmtMoney(dup.price_cents, locale)} · {lt(locale, "Stock", "Stok", "Stock", "Stock", "Scorte", "Bestand")}: {dup.inventory ?? 0}
                            </Text>
                          </BlockStack>
                          <Button
                            onClick={() => mergeEanDuplicate(group.master.id, dup.id)}
                            loading={eanDuplicateMergingId === dup.id}
                            disabled={Boolean(eanDuplicateMergingId) && eanDuplicateMergingId !== dup.id}
                          >
                            {lt(locale, "Merge into original", "Orijinalle birleştir", "Fusionner avec l'original", "Fusionar con el original", "Unisci all'originale", "Mit Original zusammenführen")}
                          </Button>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>
      )}

      {isSuperuser && commissionModalProduct && (
        <Modal
          open
          onClose={() => setCommissionModalProduct(null)}
          title={inventoryI18n.commissionRateModalTitle}
          primaryAction={{
            content: inventoryI18n.commissionRateSave,
            onAction: saveCommissionOverride,
            loading: commissionSaving,
          }}
          secondaryActions={[
            ...(commissionModalProduct.metadata?.commission_rate_override != null
              ? [{ content: inventoryI18n.commissionRateClear, destructive: true, onAction: clearCommissionOverride, loading: commissionSaving }]
              : []),
            { content: ui.cancel, onAction: () => setCommissionModalProduct(null) },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">{inventoryI18n.commissionRateModalHint}</Text>
              {commissionError && <Banner tone="critical">{commissionError}</Banner>}
              <TextField
                label={inventoryI18n.commissionRateInputLabel}
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={commissionRateInput}
                onChange={setCommissionRateInput}
                suffix="%"
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </InvPageContainer>
  );
}
