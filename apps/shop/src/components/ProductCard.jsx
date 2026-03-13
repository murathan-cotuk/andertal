"use client";

import React, { useState, useContext } from "react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, htmlToText, getLocalizedProduct } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import styled, { keyframes } from "styled-components";

/* ─── Animations ─────────────────────────────────────────── */
const fadeIn = keyframes`from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); }`;

/* ─── Card shell ─────────────────────────────────────────── */
const Card = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  cursor: pointer;

  &:hover .card-image img {
    transform: scale(1.04);
  }
  &:hover .card-overlay {
    opacity: 1;
    pointer-events: auto;
  }
`;

/* ─── Image area ─────────────────────────────────────────── */
const ImageWrap = styled.div`
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: #f5f5f3;
  width: 100%;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
`;

const NoImage = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 13px;
  letter-spacing: 0.03em;
`;

/* ─── Overlay quick-add ─────────────────────────────────── */
const Overlay = styled.div.attrs({ className: "card-overlay" })`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
  animation: ${fadeIn} 0.2s ease;
`;

const QuickAddBtn = styled.button`
  width: 100%;
  background: rgba(17, 17, 17, 0.88);
  color: #fff;
  border: none;
  padding: 11px 16px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s;
  backdrop-filter: blur(4px);

  &:hover { background: rgba(17, 17, 17, 1); }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

/* ─── Badges ─────────────────────────────────────────────── */
const BadgeWrap = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 2;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${(p) => (p.$sale ? "#ef4444" : "#111")};
  color: #fff;
`;

/* ─── Info area ──────────────────────────────────────────── */
const Info = styled.div`
  padding: 12px 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ProductName = styled.h3`
  font-size: 13.5px;
  font-weight: 500;
  color: #111;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
`;

const Price = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${(p) => (p.$sale ? "#ef4444" : "#111")};
`;

const OldPrice = styled.span`
  font-size: 13px;
  color: #aaa;
  text-decoration: line-through;
`;

/* ─── Variant pills ──────────────────────────────────────── */
const PillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const Pill = styled.button`
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid ${(p) => (p.$active ? "#111" : "#ddd")};
  background: ${(p) => (p.$active ? "#111" : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : "#444")};
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;

  &:hover {
    border-color: #111;
    color: #111;
    background: ${(p) => (p.$active ? "#111" : "#f5f5f5")};
  }
`;

/* ─── Component ──────────────────────────────────────────── */
export function ProductCard({ product }) {
  const locale = useLocale();
  const { title: displayTitle } = getLocalizedProduct(product, locale);
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);
  const cartLoading = cartState?.loading ?? false;
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  const variants = product.variants || [];
  const variant = variants[selectedVariantIndex] || variants[0];

  const image =
    variant?.image_url ||
    product.images?.[0]?.url ||
    product.thumbnail ||
    (Array.isArray(product.metadata?.media) ? product.metadata.media[0] : null);

  const resolvedImage = image
    ? typeof image === "string" && (image.startsWith("http") || image.startsWith("//"))
      ? image
      : resolveImageUrl(image)
    : null;

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
  const discountPercent =
    hasSale ? Math.round(((priceCents - saleCents) / priceCents) * 100) : null;

  const isNew =
    product.metadata?.is_new === true ||
    product.metadata?.is_new === "true" ||
    product.metadata?.badge === "new";

  const inventory = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity ?? 10;
  const outOfStock = inventory !== undefined && inventory <= 0;

  const productUrl = `/produkt/${product.handle || product.id}`;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const variantId = variant?.id;
    if (!variantId || outOfStock) return;
    setAdding(true);
    await addToCart(variantId, 1);
    setAdding(false);
  };

  /* show max 6 variant pills to keep card compact */
  const showPills = variants.length > 1 && variants.length <= 12;

  return (
    <Card>
      <Link href={productUrl} style={{ textDecoration: "none" }}>
        <ImageWrap className="card-image">
          {resolvedImage ? (
            <img src={resolvedImage} alt={displayTitle} loading="lazy" />
          ) : (
            <NoImage>No image</NoImage>
          )}

          <BadgeWrap>
            {hasSale && discountPercent && (
              <Badge $sale>-{discountPercent}%</Badge>
            )}
            {isNew && !hasSale && <Badge>New</Badge>}
            {outOfStock && <Badge style={{ background: "#888" }}>Sold out</Badge>}
          </BadgeWrap>
        </ImageWrap>
      </Link>

      <Overlay>
        <QuickAddBtn
          onClick={handleQuickAdd}
          disabled={cartLoading || adding || outOfStock}
        >
          {adding ? "Adding…" : outOfStock ? "Sold out" : "Quick add"}
        </QuickAddBtn>
      </Overlay>

      <Info>
        <Link href={productUrl} style={{ textDecoration: "none" }}>
          <ProductName>{displayTitle}</ProductName>
        </Link>

        <PriceRow>
          {hasSale && <OldPrice>{formatPriceCents(priceCents)} €</OldPrice>}
          <Price $sale={hasSale}>{formatPriceCents(hasSale ? saleCents : priceCents)} €</Price>
        </PriceRow>

        {showPills && (
          <PillRow>
            {variants.slice(0, 6).map((v, i) => (
              <Pill
                key={i}
                $active={i === selectedVariantIndex}
                onClick={(e) => { e.preventDefault(); setSelectedVariantIndex(i); }}
              >
                {v.title || v.value || `${i + 1}`}
              </Pill>
            ))}
            {variants.length > 6 && (
              <Pill as="span" style={{ cursor: "default", borderColor: "#ddd", color: "#999" }}>
                +{variants.length - 6}
              </Pill>
            )}
          </PillRow>
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
        {[...Array(full)].map((_, i) => <span key={i} style={{ color: "#f59e0b" }}>★</span>)}
        {half ? <span style={{ color: "#f59e0b" }}>★</span> : null}
        {[...Array(empty)].map((_, i) => <span key={i} style={{ color: "#d1d5db" }}>★</span>)}
      </span>
      {count > 0 && (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>({count})</span>
      )}
    </div>
  );
}
