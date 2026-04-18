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
import { Link as I18nLink } from "@/i18n/navigation";
import {
  formatChangeRequestValueForDisplay,
  fieldNameDisplayLabel,
} from "@/lib/product-change-request-format";

const INVENTORY_ROW_GRID = "40px 56px 110px 72px minmax(320px, 2fr) minmax(140px, 0.9fr) minmax(150px, 1fr) minmax(200px, 1.2fr) 108px";
const EXCEL_BORDER = "1px solid #e5e7eb";

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
  } else if (sortKey === "inventory_desc") {
    arr.sort((a, b) => Number(b?.inventory ?? 0) - Number(a?.inventory ?? 0));
  } else if (sortKey === "inventory_asc") {
    arr.sort((a, b) => Number(a?.inventory ?? 0) - Number(b?.inventory ?? 0));
  } else if (sortKey === "price_desc") {
    arr.sort((a, b) => Number(b?.price ?? 0) - Number(a?.price ?? 0));
  } else if (sortKey === "price_asc") {
    arr.sort((a, b) => Number(a?.price ?? 0) - Number(b?.price ?? 0));
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

function getVariantName(v, locale, fallbackName = "—") {
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
  return String(fallbackName || "—");
}

function getDefaultShopUrl() {
  const env = process.env.NEXT_PUBLIC_SHOP_URL || "";
  const url = (typeof env === "string" ? env : "").trim();
  if (url) return url.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost") return "http://localhost:3000";
    return window.location.origin;
  }
  return "";
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
  return `/${defaultShopMarketForLocale(l)}/${l}/eur`;
}

function shopProductHandleForLocale(product, loc) {
  const tr = product?.metadata?.translations?.[loc];
  const h = (tr?.handle || "").trim();
  if (h) return h;
  return (product?.handle || "").trim();
}

function statusLabel(statusRaw) {
  const s = String(statusRaw || "").toLowerCase();
  if (s === "published" || s === "active") return "active";
  if (s === "draft" || !s) return "draft";
  if (s === "inactive" || s === "archived") return "inactive";
  return s;
}

function statusColors(statusRaw) {
  const s = String(statusRaw || "").toLowerCase();
  if (s === "published" || s === "active") return { bg: "#dcfce7", fg: "#166534", br: "#86efac" };
  if (s === "draft" || !s) return { bg: "#fef3c7", fg: "#92400e", br: "#fde68a" };
  return { bg: "#fee2e2", fg: "#991b1b", br: "#fecaca" };
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

  const shopBaseUrl = getDefaultShopUrl();
  const l = String(locale || "en").toLowerCase();
  const i18n = {
    select: l === "tr" ? "Seç" : l === "de" ? "Ausw." : "Select",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : "Status",
    details: l === "tr" ? "Ürün detayları" : l === "de" ? "Produktdetails" : "Product details",
    inventory: l === "tr" ? "Envanter" : l === "de" ? "Bestand" : "Inventory",
    price: l === "tr" ? "Fiyat" : l === "de" ? "Preis" : "Price",
    variations: l === "tr" ? "Varyasyonlar" : l === "de" ? "Variationen" : "Variations",
    sku: "SKU",
    ean: "EAN",
    save: l === "tr" ? "Kaydet" : l === "de" ? "Speichern" : "Save",
    saving: l === "tr" ? "Kaydediliyor…" : l === "de" ? "Speichern…" : "Saving…",
    noVariations: l === "tr" ? "Varyasyon yok" : l === "de" ? "Keine Variationen" : "No variations",
  };
  const localizeStatus = (k) => {
    if (k === "active") return l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : "Active";
    if (k === "inactive") return l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : "Inactive";
    return l === "tr" ? "Taslak" : l === "de" ? "Draft" : "Draft";
  };
  if (matrixVariants.length === 0) {
    return <div style={{ padding: "8px 12px", fontSize: 13, color: "#6b7280" }}>{i18n.noVariations}</div>;
  }

  return (
    <div style={{ marginTop: 0, borderTop: EXCEL_BORDER, background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "40px 56px 110px 2fr 140px 150px 1.2fr", gap: 0, marginBottom: 0, background: "#f8fafc", borderBottom: EXCEL_BORDER, alignItems: "center" }}>
        <div />
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", padding: "8px 6px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.select}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", padding: "8px 6px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.status}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", padding: "8px 8px", borderRight: EXCEL_BORDER, textAlign: "center" }}>{i18n.details}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "center", padding: "8px 8px", borderRight: EXCEL_BORDER }}>{i18n.inventory}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", textAlign: "center", padding: "8px 8px", borderRight: EXCEL_BORDER }}>{i18n.price}</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", padding: "8px 8px", textAlign: "center" }}>{i18n.variations}</div>
      </div>
      {drafts.map((d, idx) => (
        <div key={idx} style={{ display: "grid", gridTemplateColumns: "40px 56px 110px 2fr 140px 150px 1.2fr", gap: 0, alignItems: "center", borderBottom: idx === drafts.length - 1 ? "none" : EXCEL_BORDER, background: idx % 2 === 0 ? "#fff" : "#fcfdff" }}>
          <div style={{ textAlign: "center", color: "#9ca3af", padding: "8px 4px", borderRight: EXCEL_BORDER }}>↳</div>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER }}><input type="checkbox" /></div>
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
          <div style={{ minWidth: 0, padding: "8px 8px", borderRight: EXCEL_BORDER }}>
            <a
              href={`${shopBaseUrl}${shopPreviewPrefix(locale)}/produkt/${encodeURIComponent(shopProductHandleForLocale(product, locale))}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, fontWeight: 600, color: "#111827", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={getVariantName(matrixVariants[idx], locale, `Variant ${idx + 1}`)}
            >
              {getVariantName(matrixVariants[idx], locale, `Variant ${idx + 1}`)}
            </a>
            <button
              type="button"
              onClick={() => window.location.assign(`/products/${product.id}`)}
              style={{ marginTop: 1, padding: 0, background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 12, textDecoration: "underline" }}
              title="SKU üzerinden ürün düzenleme sayfasına git"
            >
              {i18n.sku}: {matrixVariants[idx]?.sku || "—"}
            </button>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2 }}>
              {i18n.ean}: {matrixVariants[idx]?.ean || "—"}
            </div>
          </div>
          <div style={{ padding: "8px 8px", borderRight: EXCEL_BORDER }}>
          <input
            type="number"
            min="0"
            value={d.inventory}
            onChange={(e) => setField(idx, "inventory", e.target.value)}
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none", height: 30 }}
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
            style={{ fontSize: 13, padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none", height: 30 }}
          />
          </div>
          <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "8px 8px", textAlign: "center" }}>
            {getVariantLabel(matrixVariants[idx], locale) || "—"}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 12, padding: "8px 6px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
        <Button type="button" onClick={save} loading={saving} variant="primary">
          {saving ? i18n.saving : i18n.save}
        </Button>
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
  pendingChangeRequests,
  onOpenChangeRequests,
}) {
  const [variantsOpen, setVariantsOpen] = useState(false);
  const shopBaseUrl = getDefaultShopUrl();
  const l = String(locale || "en").toLowerCase();
  const i18n = {
    sku: "SKU",
    ean: "EAN",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : "Status",
    active: l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : "Active",
    draft: l === "tr" ? "Taslak" : "Draft",
    inactive: l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : "Inactive",
    openVariants: l === "tr" ? "Varyasyonları aç" : l === "de" ? "Variationen öffnen" : "Open variations",
    closeVariants: l === "tr" ? "Varyasyonları kapat" : l === "de" ? "Variationen schließen" : "Close variations",
    noVariants: l === "tr" ? "Varyasyon yok" : l === "de" ? "Keine Variationen" : "No variations",
    changeProposed: l === "tr" ? "Değişiklik önerildi" : l === "de" ? "Änderung vorgeschlagen" : "Change proposed",
    changeProposedShort: l === "tr" ? "Öneri" : l === "de" ? "Vorschlag" : "Proposal",
  };
  const localizeStatus = (k) => {
    if (k === "active") return i18n.active;
    if (k === "inactive") return i18n.inactive;
    return i18n.draft;
  };
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
  const ean = meta?.ean || "—";
  const variationSummary = Array.isArray(meta?.variation_groups)
    ? meta.variation_groups.map((g) => g?.name).filter(Boolean).join(" / ")
    : "—";
  const hasVariants = Array.isArray(product.variants) && product.variants.filter((v) => Array.isArray(v.option_values) && v.option_values.length > 0).length > 0;
  const pendingCount = Array.isArray(pendingChangeRequests) ? pendingChangeRequests.length : 0;
  return (
    <div style={{ background: "#fff", borderBottom: EXCEL_BORDER }}>
      <div style={{ display: "grid", gridTemplateColumns: INVENTORY_ROW_GRID, gap: 0, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => hasVariants && setVariantsOpen((v) => !v)}
          disabled={!hasVariants}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid #d1d5db",
            background: hasVariants ? "#fff" : "#f3f4f6",
            color: hasVariants ? "#374151" : "#9ca3af",
            cursor: hasVariants ? "pointer" : "not-allowed",
            fontSize: 14,
            lineHeight: 1,
          }}
          title={hasVariants ? (variantsOpen ? i18n.closeVariants : i18n.openVariants) : i18n.noVariants}
        >
          {hasVariants ? (variantsOpen ? "▾" : "▸") : "·"}
        </button>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER, display: "flex", justifyContent: "center" }}>
          <input
            type="checkbox"
            checked={selectedIds.includes(product.id)}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedIds((prev) =>
                e.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id)
              );
            }}
            style={{ margin: 0 }}
          />
          </div>
          <div style={{ minWidth: 0, padding: "8px 6px", borderRight: EXCEL_BORDER, textAlign: "center" }}>
            {(() => {
              const c = statusColors(product.status);
              return (
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg, border: `1px solid ${c.br}` }}>
                  {localizeStatus(statusLabel(product.status))}
                </span>
              );
            })()}
          </div>
          <div style={{ padding: "8px 6px", borderRight: EXCEL_BORDER, display: "flex", justifyContent: "center" }}>
          <Box minWidth="56px" width="56px" minHeight="56px" height="56px" background="bg-fill-secondary" borderRadius="200" overflow="hidden">
            {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
          </Box>
          </div>
          <div style={{ minWidth: 0, padding: "8px 8px", borderRight: EXCEL_BORDER }}>
            <a
              href={`${shopBaseUrl}${shopPreviewPrefix(locale)}/produkt/${encodeURIComponent(shopProductHandleForLocale(product, locale))}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 14, fontWeight: 600, color: "#111827", textDecoration: "none", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              title={getLocalizedTitle(product, locale)}
            >
              {getLocalizedTitle(product, locale)}
            </a>
            <button
              type="button"
              onClick={() => router.push(`/products/${product.id}`)}
              style={{ marginTop: 2, padding: 0, background: "none", border: "none", cursor: "pointer", color: "#4b5563", fontSize: 12, textDecoration: "underline" }}
              title="SKU üzerinden ürün düzenleme sayfasına git"
            >
              {i18n.sku}: {sku}
            </button>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.2 }}>{i18n.ean}: {ean}</div>
          </div>
          <div style={{ fontSize: 13, color: "#111827", textAlign: "center", fontVariantNumeric: "tabular-nums", padding: "8px 8px", borderRight: EXCEL_BORDER }}>{inv}</div>
          <div style={{ fontSize: 13, color: "#111827", textAlign: "center", fontVariantNumeric: "tabular-nums", padding: "8px 8px", borderRight: EXCEL_BORDER }}>€{formatDecimal(price)}</div>
          <div style={{ fontSize: 12, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "8px 8px", borderRight: EXCEL_BORDER, textAlign: "center" }}>
            {variationSummary || "—"}
          </div>
          <InlineStack gap="100" blockAlign="center" style={{ padding: "8px 6px", justifyContent: "flex-end" }}>
          <Button
            variant="tertiary"
            onClick={() => router.push(`/products/${product.id}`)}
            icon={EditPencilIcon}
            accessibilityLabel="Edit product"
          />
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChangeRequests(product.id);
              }}
              title={`${i18n.changeProposed} (${pendingCount})`}
              style={{
                width: 44,
                height: 28,
                borderRadius: 6,
                border: '1px solid #dc2626',
                background: '#fee2e2',
                color: '#b91c1c',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {i18n.changeProposedShort}
            </button>
          )}
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
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  zIndex: 40,
                  minWidth: 156,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                }}
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
                    color: "#111827",
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
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
                  Delete
                </button>
              </div>
            )}
          </Box>
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
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [mySellerId, setMySellerId] = useState("");
  const [sellerLabelById, setSellerLabelById] = useState({});
  const [sellerSearchFilter, setSellerSearchFilter] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailsFilter, setDetailsFilter] = useState("");
  const [variationFilter, setVariationFilter] = useState("");
  const [inventoryMin, setInventoryMin] = useState("");
  const [inventoryMax, setInventoryMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [inventorySort, setInventorySort] = useState("title_asc");
  const [sellerSectionsOpen, setSellerSectionsOpen] = useState({});
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("xlsx");
  const [exporting, setExporting] = useState(false);
  const medusaClient = getMedusaAdminClient();
  const l = String(locale || "en").toLowerCase();

  const [pendingChangeRequestsByProductId, setPendingChangeRequestsByProductId] = useState({});
  const [changeRequestsModalOpen, setChangeRequestsModalOpen] = useState(false);
  const [changeRequestsModalProductId, setChangeRequestsModalProductId] = useState(null);
  const [changeRequestsModalItems, setChangeRequestsModalItems] = useState([]);
  const rowHead = {
    select: l === "tr" ? "Seç" : l === "de" ? "Ausw." : "Select",
    status: l === "tr" ? "Durum" : l === "de" ? "Status" : "Status",
    details: l === "tr" ? "Ürün detayları" : l === "de" ? "Produktdetails" : "Product details",
    inventory: l === "tr" ? "Envanter" : l === "de" ? "Bestand" : "Inventory",
    price: l === "tr" ? "Fiyat" : l === "de" ? "Preis" : "Price",
    variations: l === "tr" ? "Varyasyonlar" : l === "de" ? "Variationen" : "Variations",
  };
  const renderInventoryHeader = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: INVENTORY_ROW_GRID,
        gap: 0,
        borderBottom: EXCEL_BORDER,
        alignItems: "center",
        background: "#f8fafc",
        position: "sticky",
        top: 0,
        zIndex: 2,
      }}
    >
      <div style={{ borderRight: EXCEL_BORDER, padding: "8px 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "8px 6px", textAlign: "center" }}>{rowHead.select}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "8px 6px", textAlign: "center" }}>{rowHead.status}</div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "8px 6px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "8px 8px", textAlign: "center" }}>{rowHead.details}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center", borderRight: EXCEL_BORDER, padding: "8px 8px", cursor: "pointer" }} onClick={() => setInventorySort((s) => (s === "inventory_desc" ? "inventory_asc" : "inventory_desc"))}>{rowHead.inventory}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", textAlign: "center", borderRight: EXCEL_BORDER, padding: "8px 8px", cursor: "pointer" }} onClick={() => setInventorySort((s) => (s === "price_desc" ? "price_asc" : "price_desc"))}>{rowHead.price}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", borderRight: EXCEL_BORDER, padding: "8px 8px", textAlign: "center" }}>{rowHead.variations}</div>
      <div style={{ padding: "8px 6px" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px" }} />
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px 8px" }}>
        <input value={detailsFilter} onChange={(e) => setDetailsFilter(e.target.value)} placeholder={l === "tr" ? "isim / sku / ean" : l === "de" ? "name / sku / ean" : "name / sku / ean"} style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 8px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input value={inventoryMin} onChange={(e) => setInventoryMin(e.target.value)} placeholder="min" style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 6px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
        <input value={inventoryMax} onChange={(e) => setInventoryMax(e.target.value)} placeholder="max" style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 6px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="min" style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 6px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
        <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="max" style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 6px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ borderRight: EXCEL_BORDER, padding: "6px 8px" }}>
        <input value={variationFilter} onChange={(e) => setVariationFilter(e.target.value)} placeholder={l === "tr" ? "varyasyon" : l === "de" ? "variation" : "variation"} style={{ width: "100%", height: 28, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 8px", fontSize: 12, boxSizing: "border-box", textAlign: "center" }} />
      </div>
      <div style={{ padding: "6px" }} />
    </div>
  );

  const TableShell = ({ children }) => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
        maxHeight: "68vh",
        overflowY: "auto",
      }}
    >
      {children}
    </div>
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
      setError(e?.message || "Export failed");
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

  const refetchPendingChangeRequests = async () => {
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
        window.dispatchEvent(new Event("belucha-notifications-refresh"));
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
  }, []);

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
    const statusOk = statusFilter === "all" ? true : String(product?.status || "draft").toLowerCase() === statusFilter;
    if (!statusOk) return false;
    const q = String(productSearch || "").trim().toLowerCase();
    const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
    const hay = [
      getLocalizedTitle(product, locale),
      product?.title || "",
      product?.sku || "",
      meta?.ean || "",
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
    return true;
  }, [statusFilter, productSearch, detailsFilter, variationFilter, inventoryMin, inventoryMax, priceMin, priceMax, locale]);

  const { ownProducts, sellerGroups } = useMemo(() => {
    const own = [];
    const g = new Map();
    for (const p of products) {
      if (!productMatchesFilters(p)) continue;
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
  }, [products, mySellerId, sellerLabelById, productMatchesFilters]);

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
      pendingChangeRequests={pendingChangeRequestsByProductId[product.id] || []}
      onOpenChangeRequests={(pid) => {
        setMenuOpenId(null);
        openChangeRequestsModal(pid);
      }}
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
        { content: "Export", onAction: () => setExportModalOpen(true) },
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
                <Box minWidth="260px">
                  <TextField
                    label="Search products"
                    labelHidden
                    autoComplete="off"
                    placeholder={l === "tr" ? "Ürün ara (isim, sku, ean, varyasyon)..." : l === "de" ? "Produkte suchen (Name, SKU, EAN, Variation)..." : "Search products (name, SKU, EAN, variation)..."}
                    value={productSearch}
                    onChange={setProductSearch}
                  />
                </Box>
                <Box minWidth="180px">
                  <Select
                    label="Status filter"
                    labelHidden
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { label: l === "tr" ? "Tüm statüler" : l === "de" ? "Alle Status" : "All statuses", value: "all" },
                      { label: l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : "Active", value: "published" },
                      { label: l === "tr" ? "Taslak" : "Draft", value: "draft" },
                      { label: l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : "Inactive", value: "inactive" },
                      { label: l === "tr" ? "Arşiv" : l === "de" ? "Archiviert" : "Archived", value: "archived" },
                    ]}
                  />
                </Box>
                <Box minWidth="200px">
                  <Select
                    label="Sortierung"
                    labelHidden
                    options={[
                      { label: "Name A–Z", value: "title_asc" },
                      { label: "Name Z–A", value: "title_desc" },
                      { label: l === "tr" ? "Stok (yüksek→düşük)" : l === "de" ? "Bestand (hoch→niedrig)" : "Inventory (high→low)", value: "inventory_desc" },
                      { label: l === "tr" ? "Stok (düşük→yüksek)" : l === "de" ? "Bestand (niedrig→hoch)" : "Inventory (low→high)", value: "inventory_asc" },
                      { label: l === "tr" ? "Fiyat (yüksek→düşük)" : l === "de" ? "Preis (hoch→niedrig)" : "Price (high→low)", value: "price_desc" },
                      { label: l === "tr" ? "Fiyat (düşük→yüksek)" : l === "de" ? "Preis (niedrig→hoch)" : "Price (low→high)", value: "price_asc" },
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
                    <Box minWidth="260px">
                      <TextField
                        label="Search products"
                        labelHidden
                        autoComplete="off"
                        placeholder={l === "tr" ? "Ürün ara (isim, sku, ean, varyasyon)..." : l === "de" ? "Produkte suchen (Name, SKU, EAN, Variation)..." : "Search products (name, SKU, EAN, variation)..."}
                        value={productSearch}
                        onChange={setProductSearch}
                      />
                    </Box>
                    <Box minWidth="180px">
                      <Select
                        label="Status filter"
                        labelHidden
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                          { label: l === "tr" ? "Tüm statüler" : l === "de" ? "Alle Status" : "All statuses", value: "all" },
                          { label: l === "tr" ? "Aktif" : l === "de" ? "Aktiv" : "Active", value: "published" },
                          { label: l === "tr" ? "Taslak" : "Draft", value: "draft" },
                          { label: l === "tr" ? "Pasif" : l === "de" ? "Inaktiv" : "Inactive", value: "inactive" },
                          { label: l === "tr" ? "Arşiv" : l === "de" ? "Archiviert" : "Archived", value: "archived" },
                        ]}
                      />
                    </Box>
                    <Box minWidth="200px">
                      <Select
                        label="Sortierung"
                        labelHidden
                        options={[
                          { label: "Name A–Z", value: "title_asc" },
                          { label: "Name Z–A", value: "title_desc" },
                          { label: l === "tr" ? "Stok (yüksek→düşük)" : l === "de" ? "Bestand (hoch→niedrig)" : "Inventory (high→low)", value: "inventory_desc" },
                          { label: l === "tr" ? "Stok (düşük→yüksek)" : l === "de" ? "Bestand (niedrig→hoch)" : "Inventory (low→high)", value: "inventory_asc" },
                          { label: l === "tr" ? "Fiyat (yüksek→düşük)" : l === "de" ? "Preis (hoch→niedrig)" : "Price (high→low)", value: "price_desc" },
                          { label: l === "tr" ? "Fiyat (düşük→yüksek)" : l === "de" ? "Preis (niedrig→hoch)" : "Price (low→high)", value: "price_asc" },
                          { label: "Neu zuerst", value: "created_desc" },
                          { label: "Älteste zuerst", value: "created_asc" },
                        ]}
                        value={inventorySort}
                        onChange={setInventorySort}
                      />
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {ownProducts.length} {ownProducts.length === 1 ? "product" : "products"}
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
                {ownProducts.length === 0 ? (
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
                  <TableShell>
                    {renderInventoryHeader()}
                    {sortProductsList(ownProducts, locale, inventorySort).map((product) => renderRow(product))}
                  </TableShell>
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
                    <TableShell>
                      {renderInventoryHeader()}
                      {sortProductsList(ownProducts, locale, inventorySort).map((product) => renderRow(product))}
                    </TableShell>
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
                                <TableShell>
                                  {renderInventoryHeader()}
                                  {sortedItems.map((product) => renderRow(product))}
                                </TableShell>
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

      <Modal
        open={changeRequestsModalOpen}
        onClose={() => setChangeRequestsModalOpen(false)}
        title={
          changeRequestsModalProductId
            ? `Proposed changes (${products.find((p) => String(p?.id || '') === String(changeRequestsModalProductId))?.title || 'Product'})`
            : 'Proposed changes'
        }
        primaryAction={isSuperuser ? { content: 'Close', onAction: () => setChangeRequestsModalOpen(false) } : { content: 'Close', onAction: () => setChangeRequestsModalOpen(false) }}
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
                  {l === "tr"
                    ? "Ürün düzenleme sayfasına git →"
                    : l === "de"
                      ? "Zur Produktbearbeitung →"
                      : "Open product edit page →"}
                </I18nLink>
              </Box>
            ) : null}
            {changeRequestsModalItems.length === 0 ? (
              <Text as="p" tone="subdued">
                No pending change proposals.
              </Text>
            ) : (
              changeRequestsModalItems.map((cr) => {
                const field = String(cr.field_name || '');
                return (
                  <Card key={cr.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        {fieldNameDisplayLabel(field, l)}
                      </Text>
                      <Divider />
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          {l === "tr" ? "Mevcut değer" : l === "de" ? "Aktueller Wert" : "Current value"}
                        </Text>
                        <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {formatChangeRequestValueForDisplay(cr.old_value)}
                        </div>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          {l === "tr" ? "Önerilen değer" : l === "de" ? "Vorgeschlagener Wert" : "Proposed value"}
                        </Text>
                        <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: 600 }}>
                          {formatChangeRequestValueForDisplay(cr.new_value)}
                        </div>
                      </BlockStack>
                      {isSuperuser && (
                        <InlineStack gap="200">
                          <Button
                            variant="primary"
                            tone="success"
                            size="slim"
                            onClick={() => approveChangeRequest(cr.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="secondary"
                            tone="critical"
                            size="slim"
                            onClick={() => rejectChangeRequest(cr.id)}
                          >
                            Reject
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
        title={l === "tr" ? "Envanteri dışa aktar" : l === "de" ? "Inventar exportieren" : "Export inventory"}
        primaryAction={{
          content: l === "tr" ? "Dışa aktar" : l === "de" ? "Exportieren" : "Export",
          onAction: runQuickExport,
          loading: exporting,
        }}
        secondaryActions={[
          { content: l === "tr" ? "İptal" : l === "de" ? "Abbrechen" : "Cancel", onAction: () => setExportModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              {l === "tr"
                ? "Mevcut filtrelenmiş ürün görünümü dışa aktarılır."
                : l === "de"
                ? "Die aktuell gefilterte Produktansicht wird exportiert."
                : "Current filtered product view will be exported."}
            </Text>
            <Select
              label={l === "tr" ? "Format" : "Format"}
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
    </Page>
  );
}
