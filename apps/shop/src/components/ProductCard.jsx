"use client";

import React, { useState, useContext } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
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
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
`;

/* Image block: hover = second image if present + slight zoom. */
const ImgBlock = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #f4f4f2;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    transform: scale(1.04);
  }
  &:hover img.img-secondary {
    opacity: 1;
    transform: scale(1.04);
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

/* Badges */
const Badges = styled.div`
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  z-index: 3;
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
  padding: ${(p) => (p.$swatch ? "0" : "3px 7px")};
  width: ${(p) => (p.$swatch ? "22px" : "auto")};
  height: ${(p) => (p.$swatch ? "22px" : "auto")};
  min-width: ${(p) => (p.$swatch ? "22px" : "24px")};
  min-height: ${(p) => (p.$swatch ? "22px" : "22px")};
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: ${(p) => (p.$swatch ? "50%" : "2px")};
  border: ${(p) => p.$swatch
    ? `2.5px solid ${p.$on ? "#111" : "#e0e0e0"}`
    : `1px solid ${p.$on ? "#111" : "#e0e0e0"}`};
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

export function ProductCard({ product }) {
  const locale = useLocale();
  const { title: displayTitle } = getLocalizedProduct(product, locale);
  const cartCtx = useContext(CartContext);
  const addToCart = cartCtx?.addToCart ?? (async () => null);
  const cartLoading = cartCtx?.loading ?? false;

  const [selIdx, setSelIdx] = useState(0);
  const [adding, setAdding] = useState(false);

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

  // For grouped display: track selected option per group index
  const [selectedOpts, setSelectedOpts] = useState(() => {
    if (!variationGroups) return {};
    const first = variants[0];
    const ov = Array.isArray(first?.option_values) ? first.option_values : [];
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

  /* Resolve primary and second image (hover) */
  const rawImg =
    variant?.image_url ||
    product.images?.[0]?.url ||
    product.thumbnail ||
    (Array.isArray(product.metadata?.media) ? product.metadata.media[0] : null);
  const imgSrc = resolveImg(rawImg);
  const rawImg2 =
    product.images?.[1]?.url ||
    (Array.isArray(product.metadata?.media) && product.metadata.media[1] ? product.metadata.media[1] : null);
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
  const managesInventory = variant?.manage_inventory === true;
  const inventoryQty = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity;
  const outOfStock = managesInventory && typeof inventoryQty === "number" && inventoryQty <= 0;

  const productUrl = `/produkt/${product.handle || product.id}`;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock) return;
    setAdding(true);
    await addToCart(vid, 1);
    setAdding(false);
    // Reset grouped selection back to first variant after add
  };

  const showPills = variants.length > 1;

  return (
    <Card>
      {/* ── Image ── */}
      <ImgBlock>
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

        {/* Badges */}
        <Badges>
          {isComingSoon && <Badge $comingSoon>Pek yakında</Badge>}
          {hasSale && !isComingSoon && <Badge $sale>Sale</Badge>}
          {isNew && !hasSale && !isComingSoon && <Badge>New</Badge>}
          {outOfStock && !isComingSoon && <Badge $sold>Sold out</Badge>}
        </Badges>
      </ImgBlock>

      {/* ── Add to cart (always visible) ── */}
      <AddToCartBtn
        type="button"
        onClick={handleQuickAdd}
        disabled={cartLoading || adding || outOfStock || isComingSoon}
      >
        {adding ? "…" : isComingSoon ? "Pek yakında" : outOfStock ? "Sold out" : "Add to cart"}
      </AddToCartBtn>

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

        {showPills && (
          variationGroups ? (
            /* Grouped display: one row per variation group */
            <VariantGroups>
              {variationGroups.map((group, gIdx) => {
                const MAX_OPTS = 5;
                const opts = (group.options || []).slice(0, MAX_OPTS);
                const extra = Math.max(0, (group.options || []).length - MAX_OPTS);
                return (
                  <VGroupRow key={gIdx}>
                    <VGroupLabel>{group.name}</VGroupLabel>
                    <Pills>
                      {opts.map((opt, oIdx) => {
                        const val = typeof opt === "object" ? (opt.value || "") : String(opt || "");
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
                            title={val}
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedOpts((prev) => ({ ...prev, [gIdx]: val }));
                            }}
                          >
                            {swatchUrl ? (
                              <img src={swatchUrl} alt={val} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: "50%" }} />
                            ) : val}
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
            <Pills>
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
