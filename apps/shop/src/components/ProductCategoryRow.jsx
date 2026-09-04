"use client";

import React, { useState, useContext, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct } from "@/lib/format";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { resolveImageUrl } from "@/lib/image-url";
import { resolveProductListingImage } from "@/lib/product-locale-media";
import { optionDisplayLabel, optionCanonicalValue } from "@/lib/variation-labels";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { findShippingGroup, resolveShippingQuoteStrict } from "@/lib/shipping-price";
import ProductWishlistHeart from "@/components/ProductWishlistHeart";
import { CustomProductBadges } from "@/components/CustomProductBadge";
import { getBruttoCentsFromPricesMap } from "@/lib/product-price";
import { StarRating } from "@/components/ProductCard";
import styled from "styled-components";

function resolveImg(src) {
  if (!src) return null;
  if (typeof src === "object") {
    const nested = src.url ?? src.src ?? src.path ?? "";
    return nested ? resolveImageUrl(String(nested)) : null;
  }
  return resolveImageUrl(src) || null;
}

const Row = styled.article`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid #e8e8e6;
  background: #fff;
  &:last-child {
    border-bottom: none;
  }
  @media (max-width: 400px) {
    gap: 12px;
  }
`;

const ImgCol = styled.div`
  position: relative;
  flex: 0 0 160px;
  width: 160px;
  min-height: 120px;
  background: #fafaf9;
  border-radius: 8px;
  overflow: hidden;
  a {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 120px;
  }
  a img,
  > img:not(.product-custom-badge-img) {
    width: 100%;
    height: 100%;
    min-height: 120px;
    object-fit: contain;
    display: block;
  }
  /* Renders via next/image \`fill\` (CustomProductBadge.jsx) — wants the same absolute-fill
     treatment as the product photo above it, not the old static/auto override. */
  img.product-custom-badge-img {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 !important;
    object-fit: contain !important;
  }
  @media (max-width: 400px) {
    flex: 0 0 120px;
    width: 120px;
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
`;

const Title = styled(Link)`
  font-size: 16px;
  font-weight: 600;
  color: #111;
  line-height: 1.35;
  text-decoration: none;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  &:hover {
    text-decoration: underline;
  }
`;

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  align-items: center;
`;

const Tag = styled.span`
  display: inline-block;
  padding: 4px 9px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  background: ${(p) => (p.$sale ? "#e11d48" : p.$mut ? "#6b7280" : "#18181b")};
  border-radius: 6px;
`;

const Prices = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
`;

const Cur = styled.span`
  font-size: 16px;
  font-weight: 700;
  color: ${(p) => (p.$sale ? "#e53e3e" : "#111")};
`;
const Old = styled.span`
  font-size: 14px;
  color: #aaa;
  text-decoration: line-through;
`;

const ShipLine = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: #6b7280;
`;

const AtcRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  width: 100%;
`;

const Atc = styled.button`
  padding: 10px 18px;
  background: #111;
  color: #fff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: none;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s, opacity 0.15s;
  &:hover:not(:disabled) {
    background: #333;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #999;
  }
`;

const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
`;
const Pill = styled.button`
  padding: 5px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1.5px solid ${(p) => (p.$on ? "#111" : "#e0e0e0")};
  background: ${(p) => (p.$on ? "#111" : "transparent")};
  color: ${(p) => (p.$on ? "#fff" : "#555")};
  cursor: pointer;
  &:hover {
    border-color: #111;
  }
`;

function atcLabel(tp, adding, oos, soon, unavail) {
  if (adding) return "…";
  if (soon) return tp("comingSoon");
  if (unavail) return tp("notAvailable");
  if (oos) return tp("outOfStock");
  return tp("addToCart");
}

export function ProductCategoryRow({ product, activeFilters = {} }) {
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
  const variationGroups = Array.isArray(product.variation_groups) && product.variation_groups.length > 0
    ? product.variation_groups
    : null;

  const normalizedVariants = useMemo(
    () =>
      variationGroups
        ? variants.map((v) => {
            const ov = Array.isArray(v.option_values) ? v.option_values : [];
            if (ov.length === variationGroups.length) return v;
            const parts = (v.title || v.value || "")
              .split(" / ")
              .map((s) => s.trim())
              .filter(Boolean);
            if (parts.length === variationGroups.length) return { ...v, option_values: parts };
            return v;
          })
        : variants,
    [variants, variationGroups],
  );

  const filterVals = useMemo(
    () => Object.values(activeFilters).flat().map((s) => String(s).toLowerCase()),
    [activeFilters],
  );
  const bestVariantIdx = useMemo(() => {
    if (filterVals.length > 0) {
      const idx = normalizedVariants.findIndex((v) => {
        const ov = (Array.isArray(v.option_values) ? v.option_values : []).map((x) => String(x).toLowerCase());
        return filterVals.some((fv) => ov.includes(fv));
      });
      if (idx >= 0) return idx;
    }
    const stockIdx = normalizedVariants.findIndex((v) => {
      const inStock = !v.manage_inventory || (v.inventory_quantity ?? v.inventory ?? 0) > 0;
      return inStock;
    });
    return stockIdx >= 0 ? stockIdx : 0;
  }, [filterVals, normalizedVariants]);

  const [selIdx, setSelIdx] = useState(bestVariantIdx);
  const [adding, setAdding] = useState(false);
  const [selectedOpts, setSelectedOpts] = useState(() => {
    if (!variationGroups) return {};
    const target = normalizedVariants[bestVariantIdx] ?? normalizedVariants[0];
    const ov = Array.isArray(target?.option_values) ? target.option_values : [];
    const init = {};
    variationGroups.forEach((_, i) => {
      if (ov[i]) init[i] = ov[i];
    });
    return init;
  });
  const effectiveIdx = (() => {
    if (!variationGroups) return selIdx;
    const numGroups = variationGroups.length;
    const opts = variationGroups.map((_, i) => selectedOpts[i] || "");
    const idx = normalizedVariants.findIndex((v) => {
      const ov = Array.isArray(v.option_values) ? v.option_values : [];
      return (
        ov.length === numGroups && opts.every((o, i) => !o || String(ov[i]).toLowerCase() === o.toLowerCase())
      );
    });
    return idx >= 0 ? idx : 0;
  })();

  const variant = normalizedVariants[effectiveIdx] ?? normalizedVariants[0] ?? variants[0];
  const rawImg = resolveProductListingImage(product, locale, variant);
  const imgSrc = resolveImg(rawImg);
  const productHandle = storefrontProductHandle(product, locale);
  const productUrl = productHandle ? `/${productHandle}` : null;

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
      : variant?.prices?.[0]?.amount != null
        ? Number(variant.prices[0].amount)
        : parentCountryPrice != null
          ? parentCountryPrice
          : product.price != null
            ? Math.round(Number(product.price) * 100)
            : 0;
  const saleCents =
    product.metadata?.rabattpreis_cents != null ? Number(product.metadata.rabattpreis_cents) : null;
  const hasSale = saleCents != null && saleCents > 0 && saleCents < priceCents;

  const publishDate = product.metadata?.publish_date ? new Date(product.metadata.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const managesInventory = variant?.manage_inventory === true;
  const inventoryQty = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity;
  const outOfStock = managesInventory && typeof inventoryQty === "number" && inventoryQty <= 0;
  const lowStock =
    managesInventory && typeof inventoryQty === "number" && inventoryQty > 0 && inventoryQty <= 5;

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

  const showPills = variants.length > 1;

  const shipText = (() => {
    if (shippingUnavailable) return tp("shippingUnavailable");
    if (!hasShippingGroup) return null;
    if (shippingPriceCents === 0) return tp("freeShipping");
    if (shippingPriceCents != null) return `${tp("shipping")}: ${formatPriceCents(shippingPriceCents)} €`;
    return null;
  })();

  const lowStockText = (() => {
    if (!lowStock || isComingSoon) return null;
    const n = Number(inventoryQty);
    return tp("lowStock", { n });
  })();

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock || shippingUnavailable) return;
    setAdding(true);
    try {
      const ok = await addToCart(vid, 1);
      if (ok) openCartSidebar();
    } catch {
      // noop
    }
    setAdding(false);
  };

  return (
    <Row>
      <ImgCol>
        {productUrl ? (
          <Link href={productUrl} aria-label={displayTitle}>
            {imgSrc ? <img src={imgSrc} alt={displayTitle} loading="lazy" /> : <div style={{ minHeight: 120 }} />}
          </Link>
        ) : imgSrc ? (
          <img src={imgSrc} alt={displayTitle} loading="lazy" />
        ) : null}
        {product?.id ? (
          <div style={{ position: "absolute", bottom: 4, right: 4, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
            <ProductWishlistHeart productId={product.id} positionAbsolute={false} />
          </div>
        ) : null}
        <CustomProductBadges badges={product?.metadata?.custom_badges} locale={locale} />
      </ImgCol>
      <Content>
        {productUrl ? <Title href={productUrl}>{displayTitle}</Title> : <span style={{ fontSize: 16, fontWeight: 600 }}>{displayTitle}</span>}

        <div style={{ minHeight: 20 }}>
          {reviewCount > 0 ? <StarRating average={reviewAvg} count={reviewCount} /> : null}
        </div>

        <TagRow>
          {isComingSoon && <Tag>{tp("comingSoon")}</Tag>}
          {lowStockText && !isComingSoon && <Tag $mut>{lowStockText}</Tag>}
          {shippingUnavailable && !isComingSoon && <Tag $mut>{tp("notAvailable")}</Tag>}
          {outOfStock && !isComingSoon && <Tag $mut>{tp("outOfStock")}</Tag>}
        </TagRow>

        <Prices>
          {hasSale && <Old>{formatPriceCents(priceCents)} €</Old>}
          <Cur $sale={hasSale}>{formatPriceCents(hasSale ? saleCents : priceCents)} €</Cur>
        </Prices>

        {shipText ? <ShipLine>{shipText}</ShipLine> : null}

        {showPills && variationGroups ? (
          <Pills>
            {variationGroups.flatMap((group, gIdx) =>
              (group.options || [])
                .slice(0, 5)
                .map((opt) => {
                  const val = optionCanonicalValue(opt);
                  const displayStr = optionDisplayLabel(opt, locale) || val;
                  const isOn = (selectedOpts[gIdx] || "").toLowerCase() === val.toLowerCase();
                  return (
                    <Pill
                      key={`${gIdx}-${val}`}
                      type="button"
                      $on={isOn}
                      onClick={() => setSelectedOpts((p) => ({ ...p, [gIdx]: val }))}
                    >
                      {displayStr}
                    </Pill>
                  );
                }),
            )}
          </Pills>
        ) : showPills ? (
          <Pills>
            {normalizedVariants.slice(0, 5).map((v, i) => (
              <Pill
                key={i}
                type="button"
                $on={i === selIdx}
                onClick={() => setSelIdx(i)}
              >
                {v.title || v.value || `${i + 1}`}
              </Pill>
            ))}
          </Pills>
        ) : null}

        <AtcRow>
          <Atc
            type="button"
            onClick={handleQuickAdd}
            disabled={cartLoading || adding || outOfStock || isComingSoon || shippingUnavailable}
          >
            {atcLabel(tp, adding, outOfStock, isComingSoon, shippingUnavailable)}
          </Atc>
        </AtcRow>
      </Content>
    </Row>
  );
}
