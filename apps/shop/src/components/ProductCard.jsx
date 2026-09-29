"use client";

import React, { useState, useContext, useRef } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct, htmlToText } from "@/lib/format";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { resolveImageUrl } from "@/lib/image-url";
import { colorSwatchFallback } from "@/lib/color-swatch";
import { resolveProductListingImage, resolveProductListingImageSecondary } from "@/lib/product-locale-media";
import { optionDisplayLabel, optionCanonicalValue, variationGroupDisplayName } from "@/lib/variation-labels";
import { enrichVariationGroups } from "@/lib/product-variations";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { findShippingGroup, resolveShippingQuoteStrict } from "@/lib/shipping-price";
import ProductWishlistHeart from "@/components/ProductWishlistHeart";
import { CustomProductBadges } from "@/components/CustomProductBadge";
import { getBruttoCentsFromPricesMap, resolveProductSaleCents } from "@/lib/product-price";
import styled from "styled-components";

/* ─────────────────────────────────────────────────────────── *
 *  Helpers
 * ─────────────────────────────────────────────────────────── */
function resolveImg(src) {
  if (!src) return null;
  if (typeof src === "object") {
    const nested = src.url ?? src.src ?? src.path ?? "";
    return nested ? resolveImageUrl(String(nested)) : null;
  }
  return resolveImageUrl(src) || null;
}

// Known dummy/placeholder hosts sometimes left in swatch data (e.g. "example.com/img/swatch-x.jpg"
// from a demo import) — these always 404 and are noisy in the console for no visual benefit since
// the CSS color-fallback swatch already covers the "no real image" case anyway.
const PLACEHOLDER_IMAGE_HOSTS = ["example.com", "example.org", "example.net"];
function resolveSwatchImg(src) {
  const url = resolveImg(src);
  if (!url) return null;
  try {
    const host = new URL(url, "https://placeholder.invalid").hostname;
    if (PLACEHOLDER_IMAGE_HOSTS.includes(host)) return null;
  } catch (_) {}
  return url;
}

/* ─────────────────────────────────────────────────────────── *
 *  Styled components
 *
 *  Every block below the image has a FIXED height, so all cards in a row are exactly the same
 *  height whatever the product has (0/1/2 variation groups, one-line title, no sale price…).
 *  Nothing in the card expands in place: extra options / groups are a "+N" link to the product
 *  page instead. Colors and fonts come from the shop theme (Sellercentral → Styles).
 * ─────────────────────────────────────────────────────────── */

const Card = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fff;
  border-radius: 20px;
  padding: 12px;
  box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.06);
  overflow: hidden;
  height: 100%;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  color: var(--body-color, #1d1b18);
  /* inline-size containment: the card never sizes from its content, so it always needs a width
     from its parent (grid cell / carousel slide) — width: 100% guarantees that. */
  container-type: inline-size;
  transition: box-shadow 0.18s ease;

  &:hover {
    box-shadow: 0 0 0 1px rgba(29, 27, 24, 0.12), 0 8px 24px rgba(29, 27, 24, 0.08);
  }

  @media (max-width: 767px) {
    border-radius: 16px;
    padding: 8px;
    gap: 7px;
  }
`;

/* Image block: keep full image visible (no crop). */
const ImgBlock = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  isolation: isolate;
  @media (max-width: 767px) {
    border-radius: 12px;
  }

  /* Only product photos — never style Sellercentral badge images */
  img.img-primary,
  img.img-secondary {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
    padding: 2px;
    box-sizing: border-box;
    display: block;
    transition: none;
  }

  img.img-primary {
    z-index: 1;
  }
  img.img-secondary {
    display: none !important;
  }

  /* Badge images render via next/image \`fill\` (CustomProductBadge.jsx) — they now WANT the
     same absolute-fill treatment as img-primary/img-secondary above, not the old static/auto
     override that predates that conversion. */
  img.product-custom-badge-img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    padding: 0 !important;
    object-fit: contain !important;
  }
`;

const ImgPlaceholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b8afa2;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const CartNotice = styled.div`
  margin: 6px 10px 0;
  font-size: 12.5px;
  font-weight: 700;
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 10px;
  padding: 8px 10px;
  text-align: center;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translateY(${(p) => (p.$visible ? "0px" : "6px")});
  transition: opacity 250ms ease, transform 250ms ease;
  pointer-events: none;
`;

/* Overlay variant of the notice for the grid card — never pushes the layout. */
const CardNotice = styled(CartNotice)`
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 62px;
  margin: 0;
  z-index: 20;
  background: #ecfdf5;
`;

/* Badges */
const Badges = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  z-index: 8;
  pointer-events: none;
`;

const RankBadge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  background: #1d1b18;
  color: #fff;
  line-height: 1.4;
`;

const WishlistHeartWrap = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 50;
  pointer-events: auto;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  color: #fff;
  white-space: nowrap;
  background: ${(p) =>
    p.$sale ? "#b42318" : p.$sold ? "#6b645b" : p.$comingSoon ? "#a65300" : "#1d1b18"};
`;

/* Two fixed rows for variation groups — always reserved, even when empty. */
const VariantBlock = styled.div`
  flex-shrink: 0;
  height: 62px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 0 2px;
  min-width: 0;
  @media (max-width: 767px) {
    height: 58px;
    gap: 2px;
  }
`;

/* 28px rows: swatches/chips get a finger-sized hit area without growing visually. */
const VariantRow = styled.div`
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  padding-left: 3px;
`;

const Swatch = styled.button`
  flex-shrink: 0;
  position: relative;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  touch-action: manipulation;
  background: #fff;
  box-shadow: ${(p) =>
    p.$on ? "0 0 0 2px #fff, 0 0 0 3.5px var(--body-color, #1d1b18)" : "inset 0 0 0 1px rgba(0, 0, 0, 0.14)"};
  opacity: ${(p) => (p.$outOfStock && !p.$on ? 0.45 : 1)};
  margin: 0 1px;
  img {
    object-fit: cover;
  }
  @media (max-width: 767px) {
    width: 22px;
    height: 22px;
  }
`;

const Chip = styled.button`
  flex-shrink: 0;
  max-width: 100px;
  touch-action: manipulation;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  box-shadow: ${(p) => (p.$on ? "inset 0 0 0 1.5px var(--body-color, #1d1b18)" : "inset 0 0 0 1px #cfc6b8")};
  color: ${(p) => (p.$outOfStock && !p.$on ? "#9a9186" : "var(--body-color, #1d1b18)")};
  text-decoration: ${(p) => (p.$outOfStock && !p.$on ? "line-through" : "none")};
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  @media (max-width: 767px) {
    height: 24px;
    line-height: 24px;
    padding: 0 7px;
    font-size: 10.5px;
  }
`;

const MoreLink = styled(Link)`
  flex-shrink: 0;
  font-size: 12px;
  color: #5e574e;
  text-decoration: none;
  white-space: nowrap;
  &:hover { color: var(--body-color, #1d1b18); }
`;

const MoreGroupsLink = styled(Link)`
  margin-left: auto;
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #fcebd5;
  color: #8a4600;
  font-size: 11px;
  font-weight: 700;
  line-height: 22px;
  white-space: nowrap;
  text-decoration: none;
  @media (max-width: 767px) {
    height: 20px;
    line-height: 20px;
    font-size: 10px;
    padding: 0 6px;
  }
`;

const TextBlock = styled.div`
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 2px;
  min-width: 0;
`;

const BrandLine = styled.span`
  height: 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #5e574e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  @media (max-width: 767px) {
    display: none;
  }
`;

const Name = styled.h3`
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  color: var(--body-color, #1d1b18);
  line-height: 20px;
  height: 40px;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  @media (max-width: 767px) {
    font-size: 13px;
    line-height: 17px;
    height: 34px;
  }
`;

const ReviewRow = styled.div`
  flex-shrink: 0;
  height: 18px;
  padding: 0 2px;
  font-size: 13px;
  display: flex;
  align-items: center;
  @media (max-width: 767px) {
    height: 16px;
    font-size: 11px;
  }
`;

const PriceBlock = styled.div`
  flex-shrink: 0;
  height: 30px;
  padding: 0 2px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  @media (max-width: 767px) {
    height: 26px;
  }
`;

const CurrentPrice = styled.span`
  font-family: var(--h2-ff, inherit);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
  color: ${(p) => (p.$sale ? "#b42318" : "var(--body-color, #1d1b18)")};
  @media (max-width: 767px) {
    font-size: 18px;
  }
`;

const OriginalPrice = styled.span`
  font-size: 12.5px;
  color: #5e574e;
  text-decoration: line-through;
  white-space: nowrap;
`;

const ActionRow = styled.div`
  margin-top: auto;
  flex-shrink: 0;
  height: 44px;
  display: flex;
  gap: 6px;
  min-width: 0;
  @media (max-width: 767px) {
    height: 40px;
  }
`;

const QtyRow = styled.div`
  flex-shrink: 0;
  width: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px #cfc6b8;
  overflow: hidden;

  @container (max-width: 190px) {
    width: 72px;
  }
`;

const QtyBtn = styled.button`
  width: 28px;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--body-color, #1d1b18);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #f6f2ec;
  }
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  @container (max-width: 190px) {
    width: 22px;
  }
`;

const QtyInput = styled.input`
  flex: 1;
  width: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--body-color, #1d1b18);
  border: 0;
  background: transparent;
  outline: none;
  min-width: 0;
  padding: 0;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  &[type="number"] {
    -moz-appearance: textfield;
  }
`;

const AddToCartBtn = styled.button`
  flex: 1;
  min-width: 44px;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--btn-atc-bg, var(--shop-primary, #ee8a12));
  color: var(--btn-atc-text, #1d1b18);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
  &:hover:not(:disabled) {
    background: var(--btn-atc-hover-bg, var(--shop-accent, #d97a06));
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    background: #cfc6b8;
    color: #1d1b18;
  }
  svg {
    flex-shrink: 0;
  }
  .pc-atc-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @container (max-width: 170px) {
    .pc-atc-label {
      display: none;
    }
  }
`;

const CartIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2l2.4 11h10.2L20 8H6.2" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="17" cy="19" r="1.5" />
  </svg>
);

/** Max options shown per variation row before the "+N" link (swatches are narrower than chips). */
const MAX_SWATCHES = 6;
const MAX_CHIPS = 3;

/* ─────────────────────────────────────────────────────────── *
 *  Component
 * ─────────────────────────────────────────────────────────── */

export function ProductCard({ product, activeFilters = {}, plainImage = false, isBestseller: _isBestsellerProp, rank, hideBestsellerBadge: _hideBestsellerBadge = false }) {
  const locale = useLocale();
  const tp = useTranslations("product");
  const marketPrefixVal = useMarketPrefix();
  const marketCountry = (marketPrefixVal?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);
  const { title: displayTitle, description: localizedDescription } = getLocalizedProduct(product, locale);
  const cartCtx = useContext(CartContext);
  const addToCart = cartCtx?.addToCart ?? (async () => null);
  const openCartSidebar = cartCtx?.openCartSidebar ?? (() => {});
  const cartLoading = cartCtx?.loading ?? false;
  const shippingGroups = cartCtx?.shippingGroups ?? [];

  const variants = product.variants || [];
  const variationGroupsRaw = Array.isArray(product.variation_groups) && product.variation_groups.length > 0
    ? product.variation_groups : null;

  // Normalize variants for linked-group products (title "Red / S" → option_values ["Red","S"])
  const normalizedVariants = variationGroupsRaw ? variants.map((v) => {
    const ov = Array.isArray(v.option_values) ? v.option_values : [];
    if (ov.length === variationGroupsRaw.length) return v;
    const titleStr = v.title || v.value || "";
    if (!titleStr.includes(" / ")) return v;
    const parts = titleStr.split(" / ").map((s) => s.trim()).filter(Boolean);
    if (parts.length === variationGroupsRaw.length) return { ...v, option_values: parts };
    return v;
  }) : variants;

  const variationGroups = variationGroupsRaw
    ? enrichVariationGroups(variationGroupsRaw, normalizedVariants)
    : null;

  // Find best initial variant: filter-matching first, then first in-stock, then 0
  const filterVals = Object.values(activeFilters).flat().map(s => String(s).toLowerCase());
  const bestVariantIdx = (() => {
    if (filterVals.length > 0) {
      const idx = normalizedVariants.findIndex(v => {
        const ov = (Array.isArray(v.option_values) ? v.option_values : []).map(x => String(x).toLowerCase());
        return filterVals.some(fv => ov.includes(fv));
      });
      if (idx >= 0) return idx;
    }
    const stockIdx = normalizedVariants.findIndex(v => {
      const inStock = !v.manage_inventory || (v.inventory_quantity ?? v.inventory ?? 0) > 0;
      return inStock;
    });
    return stockIdx >= 0 ? stockIdx : 0;
  })();

  const [selIdx, setSelIdx] = useState(bestVariantIdx);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [cartNotice, setCartNotice] = useState({ text: "", visible: false });
  const cartNoticeTimersRef = useRef({ hide: null, clear: null });

  // For grouped display: track selected option per group index
  const [selectedOpts, setSelectedOpts] = useState(() => {
    if (!variationGroups) return {};
    const target = normalizedVariants[bestVariantIdx] ?? normalizedVariants[0];
    const ov = Array.isArray(target?.option_values) ? target.option_values : [];
    const init = {};
    variationGroups.forEach((_, i) => { if (ov[i]) init[i] = ov[i]; });
    return init;
  });

  // Find variant matching all selected group options (empty = skip that group)
  const effectiveIdx = (() => {
    if (!variationGroups) return selIdx;
    const numGroups = variationGroups.length;
    const opts = variationGroups.map((_, i) => selectedOpts[i] || "");
    const idx = normalizedVariants.findIndex((v) => {
      const ov = Array.isArray(v.option_values) ? v.option_values : [];
      return ov.length === numGroups && opts.every((o, i) => !o || String(ov[i]).toLowerCase() === o.toLowerCase());
    });
    return idx >= 0 ? idx : 0;
  })();

  const variant = normalizedVariants[effectiveIdx] ?? normalizedVariants[0] ?? variants[0];

  /* Cover: selected/first child image; if that child has none, walk other children, then parent. */
  const rawImg = resolveProductListingImage(product, locale, variant);
  const imgSrc = resolveImg(rawImg);
  const rawImg2 = resolveProductListingImageSecondary(product, locale, variant);
  const imgSrc2 = resolveImg(rawImg2);

  /* Price — single EUR list price; VAT/shipping vary by market */
  const variantCountryPrice = (() => {
    const vm = variant?.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
    const prices = vm.prices && typeof vm.prices === "object" ? vm.prices : {};
    return getBruttoCentsFromPricesMap(prices, countryCode, marketCountry);
  })();
  const parentCountryPrice = (() => {
    const pm = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
    const prices = pm.prices && typeof pm.prices === "object" ? pm.prices : {};
    return getBruttoCentsFromPricesMap(prices, countryCode, marketCountry);
  })();
  const priceCents =
    variantCountryPrice != null
      ? variantCountryPrice
      : (variant?.prices?.[0]?.amount != null
          ? Number(variant.prices[0].amount)
          : (parentCountryPrice != null
              ? parentCountryPrice
              : (product.price != null ? Math.round(Number(product.price) * 100) : 0)));
  const saleCents = resolveProductSaleCents(product, variant, countryCode, marketCountry);
  const hasSale = saleCents != null && saleCents > 0 && saleCents < priceCents;

  /* Flags */
  const publishDate = product.metadata?.publish_date ? new Date(product.metadata.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const managesInventory = variant?.manage_inventory === true;
  const inventoryQty = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity;
  const outOfStock = managesInventory && typeof inventoryQty === "number" && inventoryQty <= 0;
  const maxQty = Number(inventoryQty) > 0 ? Number(inventoryQty) : 9999;

  const meta = product.metadata || {};
  const shippingGroupIdRaw = meta.shipping_group_id;
  const shippingGroup =
    shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== ""
      ? findShippingGroup(shippingGroups, shippingGroupIdRaw)
      : null;
  const shippingPriceCents = shippingGroup ? resolveShippingQuoteStrict(shippingGroup.prices, countryCode || marketCountry) : null;
  const hasShippingGroup = shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== "" && shippingGroup != null;
  const shippingUnavailable = hasShippingGroup && shippingPriceCents === null;
  const reviewAvg = meta.review_avg != null ? Number(meta.review_avg) : 0;
  const reviewCount = meta.review_count != null ? Number(meta.review_count) : 0;

  const productHandle = storefrontProductHandle(product, locale);
  const productUrl = productHandle ? `/${productHandle}` : null;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock || shippingUnavailable) return;
    setAdding(true);
    // Avoid timer races
    if (cartNoticeTimersRef.current.hide) window.clearTimeout(cartNoticeTimersRef.current.hide);
    if (cartNoticeTimersRef.current.clear) window.clearTimeout(cartNoticeTimersRef.current.clear);

    const successText = tp("addedToCart");
    const errorText = tp("addToCartFailed");

    try {
      const ok = await addToCart(vid, quantity);
      if (ok) openCartSidebar();
      setCartNotice({ text: ok ? successText : errorText, visible: true });
      cartNoticeTimersRef.current.hide = window.setTimeout(
        () => setCartNotice((s) => ({ ...s, visible: false })),
        2200
      );
      cartNoticeTimersRef.current.clear = window.setTimeout(
        () => setCartNotice({ text: "", visible: false }),
        2700
      );
    } catch {
      setCartNotice({ text: errorText, visible: true });
    }
    setAdding(false);
    // Reset grouped selection back to first variant after add
  };

  const showPills = variants.length > 1;
  const clampQty = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return 1;
    return Math.max(1, Math.floor(num));
  };

  const brandName = (() => {
    const b = meta.brand_name || (typeof meta.brand === "string" ? meta.brand : "");
    return String(b || "").trim();
  })();
  const productHref = productUrl || "#";
  const disabledAtc = cartLoading || adding || outOfStock || isComingSoon || shippingUnavailable;
  const atcLabel = adding ? "…" : isComingSoon ? tp("comingSoon") : shippingUnavailable ? tp("notAvailable") : outOfStock ? tp("outOfStock") : tp("addToCart");

  /* Build the (max 2) variant rows. Each row: options that fit + "+N" link to the product page. */
  const variantRows = (() => {
    if (!showPills) return [];
    if (variationGroups) {
      const pMeta = product.metadata || {};
      return variationGroups.slice(0, 2).map((group, gIdx) => {
        const allOpts = group.options || [];
        const isColorGroup = /farbe|colou?r|renk|couleur|colore|kleur/i.test(String(group.name || ""));
        const isSwatchGroup = allOpts.some((o) => typeof o === "object" && (o.swatch_image || o.hex)) || isColorGroup;
        const max = isSwatchGroup ? MAX_SWATCHES : MAX_CHIPS;
        const groupName = variationGroupDisplayName(group, gIdx, pMeta, locale) || group.name;
        const items = allOpts.slice(0, max).map((opt, oIdx) => {
          const val = optionCanonicalValue(opt);
          const displayStr = optionDisplayLabel(opt, locale) || val;
          const swatchUrl = typeof opt === "object" && opt.swatch_image ? resolveSwatchImg(opt.swatch_image) : null;
          const isOn = (selectedOpts[gIdx] || "").toLowerCase() === val.toLowerCase();
          const hasStock = normalizedVariants.some((v) => {
            const ov = Array.isArray(v.option_values) ? v.option_values : [];
            if (String(ov[gIdx] || "").toLowerCase() !== val.toLowerCase()) return false;
            const qty = v.inventory_quantity ?? v.inventory ?? 0;
            return Number(qty) > 0;
          });
          const onPick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedOpts((prev) => {
              const next = { ...prev, [gIdx]: val };
              const matches = (v, want) => {
                const ov = Array.isArray(v.option_values) ? v.option_values : [];
                return Object.entries(want).every(([i, o]) => !o || String(ov[i] || "").toLowerCase() === String(o).toLowerCase());
              };
              if (normalizedVariants.some((v) => matches(v, next))) return next;
              // No variant has this exact combination: jump to one that has the picked option,
              // so its image and price show instead of silently falling back to the first variant.
              const alt = normalizedVariants.find((v) => matches(v, { [gIdx]: val }));
              if (!alt) return next;
              const ov = Array.isArray(alt.option_values) ? alt.option_values : [];
              return Object.fromEntries(ov.map((o, i) => [i, o]));
            });
          };
          return isSwatchGroup ? (
            <Swatch
              key={oIdx}
              type="button"
              $on={isOn}
              $outOfStock={!hasStock}
              title={`${groupName}: ${displayStr}`}
              aria-label={`${groupName}: ${displayStr}`}
              aria-pressed={isOn}
              onClick={onPick}
            >
              {swatchUrl ? (
                <Image
                  src={swatchUrl}
                  alt=""
                  width={44}
                  height={44}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextSibling;
                    if (fallback) fallback.style.display = "block";
                  }}
                />
              ) : null}
              <span
                style={{
                  display: swatchUrl ? "none" : "block",
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  background: (typeof opt === "object" && /^#[0-9a-f]{3,8}$/i.test(String(opt.hex || "").trim())) ? String(opt.hex).trim() : colorSwatchFallback(val),
                }}
              />
            </Swatch>
          ) : (
            <Chip
              key={oIdx}
              type="button"
              $on={isOn}
              $outOfStock={!hasStock}
              title={`${groupName}: ${displayStr}`}
              aria-pressed={isOn}
              onClick={onPick}
            >
              {displayStr}
            </Chip>
          );
        });
        return { key: `g${gIdx}`, items, extra: Math.max(0, allOpts.length - max) };
      });
    }
    /* Legacy: flat variant list in one row */
    const items = normalizedVariants.slice(0, MAX_CHIPS + 2).map((v, i) => {
      const swatchUrl = v.swatch_image_url ? resolveSwatchImg(v.swatch_image_url) : null;
      const qty = v.inventory_quantity ?? v.inventory ?? 0;
      const label = v.title || v.value || `${i + 1}`;
      const onPick = (e) => { e.preventDefault(); e.stopPropagation(); setSelIdx(i); };
      return swatchUrl ? (
        <Swatch key={i} type="button" $on={i === selIdx} $outOfStock={Number(qty) <= 0} title={label} aria-label={label} aria-pressed={i === selIdx} onClick={onPick}>
          <Image src={swatchUrl} alt="" width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }} />
        </Swatch>
      ) : (
        <Chip key={i} type="button" $on={i === selIdx} $outOfStock={Number(qty) <= 0} title={label} aria-pressed={i === selIdx} onClick={onPick}>
          {label}
        </Chip>
      );
    });
    return [{ key: "flat", items, extra: Math.max(0, normalizedVariants.length - (MAX_CHIPS + 2)) }];
  })();
  const hiddenGroupCount = variationGroups ? Math.max(0, variationGroups.length - 2) : 0;

  const imageInner = imgSrc ? (
    <>
      <Image className="img-primary" src={imgSrc} alt={displayTitle} fill sizes="(max-width: 767px) 50vw, 300px" referrerPolicy="no-referrer" />
      {imgSrc2 && !plainImage ? <Image className="img-secondary" src={imgSrc2} alt="" aria-hidden fill sizes="(max-width: 767px) 50vw, 300px" /> : null}
    </>
  ) : (
    <ImgPlaceholder>No image</ImgPlaceholder>
  );

  return (
    <Card>
      {/* ── Image ── */}
      <ImgBlock $plain={plainImage}>
        {productUrl ? (
          <Link href={productUrl} aria-label={displayTitle} style={{ position: "absolute", inset: 0, zIndex: 0 }}>
            {imageInner}
          </Link>
        ) : imageInner}

        {/* Status + Sellercentral custom badges only (no built-in Sale/Bestseller/New) */}
        <Badges>
          {rank != null && !isComingSoon && <RankBadge>#{rank}</RankBadge>}
          {isComingSoon && <Badge $comingSoon>{tp("comingSoon")}</Badge>}
          {shippingUnavailable && !isComingSoon && <Badge $sold>{tp("notAvailable")}</Badge>}
          {outOfStock && !isComingSoon && <Badge $sold>{tp("outOfStock")}</Badge>}
        </Badges>
        <CustomProductBadges badges={product?.metadata?.custom_badges} locale={locale} />
        {product?.id && (
          <WishlistHeartWrap
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <ProductWishlistHeart productId={product.id} positionAbsolute={false} />
          </WishlistHeartWrap>
        )}
      </ImgBlock>

      {/* ── Variants: two fixed rows ── */}
      <VariantBlock>
        {[0, 1].map((rowIdx) => {
          const row = variantRows[rowIdx];
          return (
            <VariantRow key={rowIdx}>
              {row ? row.items : null}
              {row && row.extra > 0 ? (
                <MoreLink href={productHref} aria-label={tp("moreVariants", { n: row.extra })}>+{row.extra}</MoreLink>
              ) : null}
              {rowIdx === 1 && hiddenGroupCount > 0 ? (
                <MoreGroupsLink href={productHref}>{tp("moreVariants", { n: hiddenGroupCount })}</MoreGroupsLink>
              ) : null}
            </VariantRow>
          );
        })}
      </VariantBlock>

      {/* ── Brand + title ── */}
      <TextBlock>
        <BrandLine>{brandName}</BrandLine>
        <Link href={productHref} style={{ textDecoration: "none" }}>
          <Name>{displayTitle}</Name>
        </Link>
      </TextBlock>

      <ReviewRow>
        {reviewCount > 0 ? (
          <Link href={productUrl ? `${productUrl}#reviews` : "#"} style={{ textDecoration: "none", display: "inline-flex" }}>
            <StarRating average={reviewAvg} count={reviewCount} showAverage />
          </Link>
        ) : (
          <StarRating average={0} count={0} />
        )}
      </ReviewRow>

      <PriceBlock>
        <CurrentPrice $sale={hasSale}>
          {formatPriceCents(hasSale ? saleCents : priceCents)} €
        </CurrentPrice>
        {hasSale && <OriginalPrice>{formatPriceCents(priceCents)} €</OriginalPrice>}
      </PriceBlock>

      {cartNotice.text ? <CardNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CardNotice> : null}

      <ActionRow>
        <AddToCartBtn type="button" onClick={handleQuickAdd} disabled={disabledAtc} aria-label={atcLabel} title={atcLabel}>
          <CartIcon />
          <span className="pc-atc-label">{atcLabel}</span>
        </AddToCartBtn>
      </ActionRow>
    </Card>
  );
}

export function StarRating({ average = 0, count = 0, showAverage = false }) {
  const full = Math.floor(average);
  const half = average - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, lineHeight: 1 }}>
      <span aria-hidden style={{ display: "flex", fontSize: "1em" }}>
        {[...Array(full)].map((_, i) => <span key={`f${i}`} style={{ color: "var(--shop-primary, #ee8a12)" }}>★</span>)}
        {half ? <span style={{ color: "var(--shop-primary, #ee8a12)" }}>★</span> : null}
        {[...Array(empty)].map((_, i) => <span key={`e${i}`} style={{ color: "#ddd4c7" }}>★</span>)}
      </span>
      <span style={{ fontSize: "0.85em", color: "#5e574e", marginLeft: showAverage ? 3 : 0 }}>
        {showAverage && count > 0 ? (
          <b style={{ color: "var(--body-color, #1d1b18)" }}>
            {Number(average).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </b>
        ) : null}
        {showAverage && count > 0 ? " " : ""}({count})
      </span>
    </div>
  );
}

/* ─── Mobile list-view item (horizontal) ───────────────────── */

const ListCard = styled.article`
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  min-width: 0;
  background: #fff;
`;

const ListImgWrap = styled.div`
  flex-shrink: 0;
  width: 110px;
  height: 110px;
  border-radius: 10px;
  overflow: hidden;
  background: #f8f8f8;
  position: relative;
  > a > img,
  > img:not(.product-custom-badge-img) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    padding: 2px;
    box-sizing: border-box;
  }
  img.product-custom-badge-img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    padding: 0 !important;
    object-fit: contain !important;
  }
`;

const ListBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const ListName = styled.h3`
  font-size: 13.5px;
  font-weight: 600;
  color: #111;
  line-height: 1.35;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ListPriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 1px;
`;

const ListPriceMain = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: ${(p) => (p.$sale ? "#e53e3e" : "#111")};
`;

const ListPriceOld = styled.span`
  font-size: 12px;
  color: #aaa;
  text-decoration: line-through;
`;

const ListShippingLine = styled.div`
  font-size: 11.5px;
  color: #6b7280;
`;

const ListCartBtn = styled.button`
  margin-top: 6px;
  padding: 8px 12px;
  background: #111;
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border-radius: 6px;
  cursor: pointer;
  align-self: flex-start;
  white-space: nowrap;
  &:hover:not(:disabled) { background: #333; }
  &:disabled { opacity: 0.45; cursor: not-allowed; background: #888; }
`;

const ListBadge = styled.span`
  display: inline-block;
  padding: 4px 8px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  border-radius: 6px;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  background: ${(p) => p.$sale ? "#e11d48" : p.$gray ? "#9ca3af" : p.$orange ? "#c2410c" : "#15803d"};
`;

export function ProductListItem({ product, activeFilters = {}, isBestseller: _isBestsellerProp }) {
  const locale = useLocale();
  const tp = useTranslations("product");
  const marketPrefixVal = useMarketPrefix();
  const marketCountry = (marketPrefixVal?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);
  const { title: displayTitle } = getLocalizedProduct(product, locale);
  const cartCtx = useContext(CartContext);
  const addToCart = cartCtx?.addToCart ?? (async () => null);
  const openCartSidebar = cartCtx?.openCartSidebar ?? (() => {});
  const cartLoading = cartCtx?.loading ?? false;
  const shippingGroups = cartCtx?.shippingGroups ?? [];

  const variants = product.variants || [];
  const variant = variants[0] ?? null;

  const [adding, setAdding] = useState(false);
  const [cartNotice, setCartNotice] = useState({ text: "", visible: false });
  const cartTimers = useRef({ hide: null, clear: null });

  const rawImg = resolveProductListingImage(product, locale, variant);
  const imgSrc = resolveImg(rawImg);

  const variantCountryPrice = (() => {
    const vm = variant?.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
    const prices = vm.prices && typeof vm.prices === "object" ? vm.prices : {};
    return getBruttoCentsFromPricesMap(prices, countryCode, marketCountry);
  })();
  const parentCountryPrice = (() => {
    const pm = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
    const prices = pm.prices && typeof pm.prices === "object" ? pm.prices : {};
    return getBruttoCentsFromPricesMap(prices, countryCode, marketCountry);
  })();
  const priceCents = variantCountryPrice != null ? variantCountryPrice
    : (variant?.prices?.[0]?.amount != null ? Number(variant.prices[0].amount)
    : (parentCountryPrice != null ? parentCountryPrice
    : (product.price != null ? Math.round(Number(product.price) * 100) : 0)));
  const saleCents = resolveProductSaleCents(product, variant, countryCode, marketCountry);
  const hasSale = saleCents != null && saleCents > 0 && saleCents < priceCents;

  const meta = product.metadata || {};
  const publishDate = meta.publish_date ? new Date(meta.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const inventoryQty = variant?.inventory_quantity ?? null;
  const outOfStock = variant?.manage_inventory === true && typeof inventoryQty === "number" && inventoryQty <= 0;
  const shippingGroupIdRaw = meta.shipping_group_id;
  const shippingGroup = shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== "" ? findShippingGroup(shippingGroups, shippingGroupIdRaw) : null;
  const shippingPriceCents = shippingGroup ? resolveShippingQuoteStrict(shippingGroup.prices, countryCode || marketCountry) : null;
  const hasShippingGroup = shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== "" && shippingGroup != null;
  const shippingUnavailable = hasShippingGroup && shippingPriceCents === null;
  const reviewAvg = meta.review_avg != null ? Number(meta.review_avg) : 0;
  const reviewCount = meta.review_count != null ? Number(meta.review_count) : 0;
  const productHandle = storefrontProductHandle(product, locale);
  const productUrl = productHandle ? `/${productHandle}` : "#";

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock || shippingUnavailable) return;
    setAdding(true);
    if (cartTimers.current.hide) clearTimeout(cartTimers.current.hide);
    if (cartTimers.current.clear) clearTimeout(cartTimers.current.clear);
    const successText = tp("addedToCart");
    const errorText = tp("addToCartFailed");
    try {
      const ok = await addToCart(vid, 1);
      if (ok) openCartSidebar();
      setCartNotice({ text: ok ? successText : errorText, visible: true });
      cartTimers.current.hide = setTimeout(() => setCartNotice((s) => ({ ...s, visible: false })), 2200);
      cartTimers.current.clear = setTimeout(() => setCartNotice({ text: "", visible: false }), 2700);
    } catch {
      setCartNotice({ text: errorText, visible: true });
    }
    setAdding(false);
  };

  const btnLabel = adding ? "…" : isComingSoon ? tp("comingSoon")
    : shippingUnavailable ? tp("notAvailable")
    : outOfStock ? tp("outOfStock")
    : tp("addToCart");

  return (
    <ListCard>
      <Link href={productUrl} style={{ flexShrink: 0, textDecoration: "none" }}>
        <ListImgWrap>
          {imgSrc ? <Image src={imgSrc} alt={displayTitle} fill sizes="110px" style={{ objectFit: "contain" }} referrerPolicy="no-referrer" /> : null}
          <CustomProductBadges badges={product?.metadata?.custom_badges} locale={locale} />
        </ListImgWrap>
      </Link>
      <ListBody>
        <Link href={productUrl} style={{ textDecoration: "none" }}>
          <ListName>{displayTitle}</ListName>
        </Link>
        {reviewCount > 0 && <StarRating average={reviewAvg} count={reviewCount} />}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 1 }}>
          {isComingSoon && <ListBadge $orange>{tp("comingSoon")}</ListBadge>}
          {outOfStock && !isComingSoon && <ListBadge $gray>{tp("outOfStock")}</ListBadge>}
        </div>
        <ListPriceRow>
          {hasSale && <ListPriceOld>{formatPriceCents(priceCents)} €</ListPriceOld>}
          <ListPriceMain $sale={hasSale}>{formatPriceCents(hasSale ? saleCents : priceCents)} €</ListPriceMain>
        </ListPriceRow>
        {hasShippingGroup && shippingPriceCents != null && (
          <ListShippingLine>
            {shippingPriceCents === 0 ? tp("freeShipping") : `${tp("shipping")}: ${formatPriceCents(shippingPriceCents)} €`}
          </ListShippingLine>
        )}
        <ListCartBtn
          type="button"
          onClick={handleQuickAdd}
          disabled={cartLoading || adding || outOfStock || isComingSoon || shippingUnavailable}
        >
          {btnLabel}
        </ListCartBtn>
        {cartNotice.text ? (
          <CartNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CartNotice>
        ) : null}
      </ListBody>
    </ListCard>
  );
}
