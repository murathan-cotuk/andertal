"use client";

import React, { useState, useContext, useRef } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct, htmlToText } from "@/lib/format";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { resolveImageUrl } from "@/lib/image-url";
import { localizedProductMediaList, variantImageUrlForLocale } from "@/lib/product-locale-media";
import { optionDisplayLabel, optionCanonicalValue, variationGroupDisplayName } from "@/lib/variation-labels";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { findShippingGroup, resolveShippingQuoteStrict } from "@/lib/shipping-price";
import ProductWishlistHeart from "@/components/ProductWishlistHeart";
import BestsellerBadge from "@/components/BestsellerBadge";
import { isBestsellerMetadata } from "@/lib/bestseller";
import styled from "styled-components";

/* ─────────────────────────────────────────────────────────── *
 *  Helpers
 * ─────────────────────────────────────────────────────────── */
function resolveImg(src) {
  if (!src) return null;
  return resolveImageUrl(src);
}

/* ─────────────────────────────────────────────────────────── *
 *  Styled components
 * ─────────────────────────────────────────────────────────── */

const Card = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
`;

/* Image block: keep full image visible (no crop). */
const ImgBlock = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #fff;
  isolation: isolate;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #fff;
    padding: 6px;
    box-sizing: border-box;
    display: block;
    transition: transform 0.45s ease, opacity 0.35s ease;
  }

  img.img-primary {
    z-index: 1;
  }
  img.img-secondary {
    z-index: 2;
    opacity: 0;
  }
  &:hover img.img-primary {
    opacity: 0;
    transform: scale(1.01);
  }
  &:hover img.img-secondary {
    opacity: 1;
    transform: scale(1.01);
  }
`;

const ImgPlaceholder = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

/* Add to cart — always visible, minimal */
const AddToCartBtn = styled.button`
  width: calc(100% - 4px);
  margin: 6px 2px 0;
  padding: 8px 10px;
  background: #111;
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;

  &:hover:not(:disabled) { background: #333; }
  &:disabled { opacity: 0.5; cursor: not-allowed; background: #999; }
`;

const QtyRow = styled.div`
  width: calc(100% - 4px);
  margin: 6px 2px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f3f4f6;
  overflow: hidden;
`;

const QtyBtn = styled.button`
  width: 34px;
  height: 30px;
  border: 0;
  background: transparent;
  color: #6b7280;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: #e5e7eb;
    color: #111827;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QtyInput = styled.input`
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  letter-spacing: 0.02em;
  border: 0;
  background: transparent;
  outline: none;
  min-width: 0;
  padding: 0 4px;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  &[type="number"] {
    -moz-appearance: textfield;
  }
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

const DescriptionPreview = styled.p`
  margin: 8px 0 0;
  font-size: 12.5px;
  color: #6b7280;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: calc(12.5px * 1.45 * 2);
`;

const ReviewRow = styled.div`
  margin-top: 8px;
  min-height: 22px;
`;

/* Badges */
const Badges = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 8;
  pointer-events: none;
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
  padding: 3px 7px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
  background: ${(p) =>
    p.$sale ? "#e53e3e" : p.$sold ? "#999" : p.$comingSoon ? "#c2410c" : "#111"};
`;

/* Info block below image */
const Info = styled.div`
  padding: 10px 2px 14px;
`;

const Name = styled.h3`
  font-size: 13px;
  font-weight: 500;
  color: #111;
  line-height: 1.4;
  margin: 0 0 5px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const Prices = styled.div`
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 7px;
`;

const CurrentPrice = styled.span`
  font-size: 13.5px;
  font-weight: 600;
  color: ${(p) => (p.$sale ? "#e53e3e" : "#111")};
`;

const OriginalPrice = styled.span`
  font-size: 12.5px;
  color: #aaa;
  text-decoration: line-through;
`;

/* Variant groups area */
const VariantGroups = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 12px;
`;

const VGroupRow = styled.div``;

const VGroupLabel = styled.div`
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #999;
  margin-bottom: 3px;
`;

/* Variant pills */
const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`;

const Pill = styled.button`
  padding: ${(p) => (p.$swatch ? "0" : "7px 13px")};
  width: ${(p) => (p.$swatch ? "32px" : "auto")};
  height: ${(p) => (p.$swatch ? "32px" : "auto")};
  min-width: ${(p) => (p.$swatch ? "32px" : "36px")};
  min-height: ${(p) => (p.$swatch ? "32px" : "32px")};
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.1;
  border-radius: ${(p) => (p.$swatch ? "50%" : "8px")};
  border: ${(p) => p.$swatch
    ? `3px solid ${p.$on ? "#111" : "#e0e0e0"}`
    : `1.5px solid ${p.$on ? "#111" : "#e0e0e0"}`};
  background: ${(p) => (p.$swatch ? "none" : p.$on ? "#111" : "transparent")};
  color: ${(p) => (p.$on ? "#fff" : p.$outOfStock ? "#bbb" : "#555")};
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s, transform 0.12s;
  transform: ${(p) => (p.$swatch && p.$on ? "scale(1.1)" : "scale(1)")};
  text-decoration: ${(p) => (p.$outOfStock && !p.$on ? "line-through" : "none")};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  opacity: ${(p) => (p.$outOfStock && !p.$on ? 0.5 : 1)};

  &:hover {
    border-color: #111;
    color: ${(p) => (p.$on ? "#fff" : "#111")};
  }
`;

const MorePill = styled.span`
  padding: 2px 6px;
  font-size: 10px;
  color: #aaa;
  border: 1px solid #e0e0e0;
  border-radius: 2px;
  line-height: 1.5;
`;

/* ─────────────────────────────────────────────────────────── *
 *  Component
 * ─────────────────────────────────────────────────────────── */

export function ProductCard({ product, activeFilters = {} }) {
  const locale = useLocale();
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
  const variationGroups = Array.isArray(product.variation_groups) && product.variation_groups.length > 0
    ? product.variation_groups : null;

  // Normalize variants for linked-group products (title "Red / S" → option_values ["Red","S"])
  const normalizedVariants = variationGroups ? variants.map((v) => {
    const ov = Array.isArray(v.option_values) ? v.option_values : [];
    if (ov.length === variationGroups.length) return v;
    const parts = (v.title || v.value || "").split(" / ").map((s) => s.trim()).filter(Boolean);
    if (parts.length === variationGroups.length) return { ...v, option_values: parts };
    return v;
  }) : variants;

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

  const localeMedia = localizedProductMediaList(product, locale);
  /* Resolve primary and second image (hover) */
  const rawImg =
    variantImageUrlForLocale(variant, locale) ||
    product.images?.[0]?.url ||
    product.thumbnail ||
    localeMedia[0] ||
    null;
  const imgSrc = resolveImg(rawImg);
  const rawImg2 =
    product.images?.[1]?.url ||
    (localeMedia[1] ? localeMedia[1] : null);
  const imgSrc2 = resolveImg(rawImg2);

  /* Price */
  const priceCents =
    variant?.prices?.[0]?.amount != null
      ? Number(variant.prices[0].amount)
      : product.price != null
        ? Math.round(Number(product.price) * 100)
        : 0;
  const saleCents =
    product.metadata?.rabattpreis_cents != null
      ? Number(product.metadata.rabattpreis_cents)
      : null;
  const hasSale = saleCents != null && saleCents > 0 && saleCents < priceCents;

  /* Flags */
  const isNew =
    product.metadata?.is_new === true ||
    product.metadata?.is_new === "true" ||
    product.metadata?.badge === "new";
  const publishDate = product.metadata?.publish_date ? new Date(product.metadata.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const isBestseller = isBestsellerMetadata(product.metadata || {});
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
  const productUrl = productHandle ? `/produkt/${productHandle}` : null;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock || shippingUnavailable) return;
    setAdding(true);
    // Avoid timer races
    if (cartNoticeTimersRef.current.hide) window.clearTimeout(cartNoticeTimersRef.current.hide);
    if (cartNoticeTimersRef.current.clear) window.clearTimeout(cartNoticeTimersRef.current.clear);

    const successText =
      locale === "tr" ? "Sepete eklendi" : locale === "de" ? "Zum Warenkorb hinzugefügt" : "Added to cart";
    const errorText =
      locale === "tr" ? "Sepete eklenemedi" : locale === "de" ? "Hinzufügen fehlgeschlagen" : "Add to cart failed";

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

  return (
    <Card>
      {/* ── Image ── */}
      <ImgBlock>
        {productUrl ? (
          <Link href={productUrl} aria-label={displayTitle} style={{ position: "absolute", inset: 0, zIndex: 0 }}>
            {imgSrc ? (
              <>
                <img className="img-primary" src={imgSrc} alt={displayTitle} loading="lazy" />
                {imgSrc2 && <img className="img-secondary" src={imgSrc2} alt="" aria-hidden />}
              </>
            ) : (
              <ImgPlaceholder>No image</ImgPlaceholder>
            )}
          </Link>
        ) : (
          <>
            {imgSrc ? (
              <>
                <img className="img-primary" src={imgSrc} alt={displayTitle} loading="lazy" />
                {imgSrc2 && <img className="img-secondary" src={imgSrc2} alt="" aria-hidden />}
              </>
            ) : (
              <ImgPlaceholder>No image</ImgPlaceholder>
            )}
          </>
        )}

        {/* Badges */}
        <Badges>
          {isBestseller && !isComingSoon && <BestsellerBadge />}
          {isComingSoon && <Badge $comingSoon>Pek yakında</Badge>}
          {hasSale && !isComingSoon && <Badge $sale>Sale</Badge>}
          {isNew && !hasSale && !isComingSoon && <Badge>New</Badge>}
          {shippingUnavailable && !isComingSoon && <Badge $sold>Nicht lieferbar</Badge>}
          {outOfStock && !isComingSoon && <Badge $sold>Sold out</Badge>}
        </Badges>
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

      <AddToCartBtn
        type="button"
        onClick={handleQuickAdd}
        disabled={cartLoading || adding || outOfStock || isComingSoon || shippingUnavailable}
      >
        {adding ? "…" : isComingSoon ? "Pek yakında" : shippingUnavailable ? "Nicht lieferbar" : outOfStock ? "Sold out" : "Add to cart"}
      </AddToCartBtn>

      <QtyRow>
        <QtyBtn
          type="button"
          onClick={() => setQuantity((q) => clampQty(q - 1))}
          disabled={quantity <= 1 || outOfStock || isComingSoon || shippingUnavailable || adding || cartLoading}
          aria-label="Menge verringern"
        >
          −
        </QtyBtn>
        <QtyInput
          type="number"
          min={1}

          value={quantity}
          onChange={(e) => setQuantity(clampQty(e.target.value))}
          onBlur={(e) => setQuantity(clampQty(e.target.value))}
          disabled={outOfStock || isComingSoon || shippingUnavailable || adding || cartLoading}
          aria-label="Menge"
        />
        <QtyBtn
          type="button"
          onClick={() => setQuantity((q) => clampQty(q + 1))}
          disabled={quantity >= maxQty || outOfStock || isComingSoon || shippingUnavailable || adding || cartLoading}
          aria-label="Menge erhöhen"
        >
          +
        </QtyBtn>
      </QtyRow>

      <CartNotice $visible={!!cartNotice.visible}>{cartNotice.text}</CartNotice>

      {/* ── Info ── */}
      <Info>
        <Link href={productUrl} style={{ textDecoration: "none" }}>
          <Name>{displayTitle}</Name>
        </Link>

        <Prices>
          {hasSale && (
            <OriginalPrice>{formatPriceCents(priceCents)} €</OriginalPrice>
          )}
          <CurrentPrice $sale={hasSale}>
            {formatPriceCents(hasSale ? saleCents : priceCents)} €
          </CurrentPrice>
        </Prices>

        <ReviewRow>
          {(reviewCount > 0 || reviewAvg > 0) && (
            <StarRating average={reviewAvg} count={reviewCount} />
          )}
        </ReviewRow>

        <DescriptionPreview>
          {localizedDescription ? `${htmlToText(localizedDescription).slice(0, 100)}${htmlToText(localizedDescription).length > 100 ? "…" : ""}` : ""}
        </DescriptionPreview>

        {showPills && (
          variationGroups ? (
            /* Grouped display: one row per variation group */
            <VariantGroups>
              {variationGroups.map((group, gIdx) => {
                const MAX_OPTS = 5;
                const opts = (group.options || []).slice(0, MAX_OPTS);
                const extra = Math.max(0, (group.options || []).length - MAX_OPTS);
                const pMeta = product.metadata || {};
                return (
                  <VGroupRow key={gIdx}>
                    <VGroupLabel>{variationGroupDisplayName(group, gIdx, pMeta, locale) || group.name}</VGroupLabel>
                    <Pills>
                      {opts.map((opt, oIdx) => {
                        const val = optionCanonicalValue(opt);
                        const displayStr = optionDisplayLabel(opt, locale) || val;
                        const swatchUrl = typeof opt === "object" && opt.swatch_image ? resolveImg(opt.swatch_image) : null;
                        const isOn = (selectedOpts[gIdx] || "").toLowerCase() === val.toLowerCase();
                        // Check stock for this option (any variant with this option value)
                        const hasStock = normalizedVariants.some((v) => {
                          const ov = Array.isArray(v.option_values) ? v.option_values : [];
                          if (String(ov[gIdx] || "").toLowerCase() !== val.toLowerCase()) return false;
                          const qty = v.inventory_quantity ?? v.inventory ?? 0;
                          return Number(qty) > 0;
                        });
                        return (
                          <Pill
                            key={oIdx}
                            $on={isOn}
                            $outOfStock={!hasStock}
                            $swatch={!!swatchUrl}
                            type="button"
                            title={displayStr}
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedOpts((prev) => ({ ...prev, [gIdx]: val }));
                            }}
                          >
                            {swatchUrl ? (
                              <img src={swatchUrl} alt={displayStr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }} />
                            ) : displayStr}
                          </Pill>
                        );
                      })}
                      {extra > 0 && <MorePill>+{extra}</MorePill>}
                    </Pills>
                  </VGroupRow>
                );
              })}
            </VariantGroups>
          ) : (
            /* Legacy: flat pill list */
            <Pills style={{ marginTop: 12 }}>
              {normalizedVariants.slice(0, 5).map((v, i) => {
                const qty = v.inventory_quantity ?? v.inventory ?? 0;
                const outOfStock = Number(qty) <= 0;
                const swatchUrl = v.swatch_image_url ? resolveImg(v.swatch_image_url) : null;
                return (
                  <Pill
                    key={i}
                    $on={i === selIdx}
                    $outOfStock={outOfStock}
                    $swatch={!!swatchUrl}
                    type="button"
                    onClick={(e) => { e.preventDefault(); setSelIdx(i); }}
                    title={v.title || v.value || `${i + 1}`}
                  >
                    {swatchUrl ? (
                      <img src={swatchUrl} alt={v.value || v.title || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }} />
                    ) : (v.title || v.value || `${i + 1}`)}
                  </Pill>
                );
              })}
              {normalizedVariants.length > 5 && <MorePill>+{normalizedVariants.length - 5}</MorePill>}
            </Pills>
          )
        )}
      </Info>
    </Card>
  );
}

export function StarRating({ average = 0, count = 0 }) {
  const full = Math.floor(average);
  const half = average - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span aria-hidden style={{ display: "flex" }}>
        {[...Array(full)].map((_, i) => <span key={`f${i}`} style={{ color: "#f59e0b" }}>★</span>)}
        {half ? <span style={{ color: "#f59e0b" }}>★</span> : null}
        {[...Array(empty)].map((_, i) => <span key={`e${i}`} style={{ color: "#d1d5db" }}>★</span>)}
      </span>
      {count > 0 && <span style={{ fontSize: 12, color: "#9ca3af" }}>({count})</span>}
    </div>
  );
}
