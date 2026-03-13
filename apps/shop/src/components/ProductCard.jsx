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
  if (typeof src === "string" && (src.startsWith("http") || src.startsWith("//"))) return src;
  return resolveImageUrl(src);
}

/* ─────────────────────────────────────────────────────────── *
 *  Styled components
 * ─────────────────────────────────────────────────────────── */

const Card = styled.article`
  display: flex;
  flex-direction: column;
  background: #fff;
`;

/* Image block */
const ImgBlock = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: #f4f4f2;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  ${Card}:hover & img { transform: scale(1.05); }
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

/* Quick-add overlay — lives INSIDE ImgBlock */
const QuickAddLayer = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0 10px 10px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.22s ease, transform 0.22s ease;
  z-index: 2;

  ${Card}:hover & {
    opacity: 1;
    transform: translateY(0);
  }
`;

const QuickAddBtn = styled.button`
  width: 100%;
  padding: 10px;
  background: rgba(17, 17, 17, 0.92);
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.15s;

  &:hover:not(:disabled) { background: #111; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
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
    p.$sale ? "#e53e3e" : p.$sold ? "#999" : "#111"};
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

/* Variant pills */
const Pills = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`;

const Pill = styled.button`
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.6;
  border: 1px solid ${(p) => (p.$on ? "#111" : "#e0e0e0")};
  background: ${(p) => (p.$on ? "#111" : "transparent")};
  color: ${(p) => (p.$on ? "#fff" : "#555")};
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;

  &:hover {
    border-color: #111;
    color: ${(p) => (p.$on ? "#fff" : "#111")};
  }
`;

const MorePill = styled.span`
  padding: 2px 7px;
  font-size: 10.5px;
  color: #aaa;
  border: 1px solid #e0e0e0;
  line-height: 1.6;
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
  const variant = variants[selIdx] ?? variants[0];

  /* Resolve image */
  const rawImg =
    variant?.image_url ||
    product.images?.[0]?.url ||
    product.thumbnail ||
    (Array.isArray(product.metadata?.media) ? product.metadata.media[0] : null);
  const imgSrc = resolveImg(rawImg);

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
  const inventory =
    variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity ?? 10;
  const outOfStock = typeof inventory === "number" && inventory <= 0;

  const productUrl = `/produkt/${product.handle || product.id}`;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    const vid = variant?.id;
    if (!vid || outOfStock) return;
    setAdding(true);
    await addToCart(vid, 1);
    setAdding(false);
  };

  const showPills = variants.length > 1;
  const visiblePills = variants.slice(0, 5);
  const extraCount = Math.max(0, variants.length - 5);

  return (
    <Card>
      {/* ── Image ── */}
      <ImgBlock>
        <Link href={productUrl} aria-label={displayTitle} style={{ display: "block", height: "100%" }}>
          {imgSrc ? (
            <img src={imgSrc} alt={displayTitle} loading="lazy" />
          ) : (
            <ImgPlaceholder>No image</ImgPlaceholder>
          )}
        </Link>

        {/* Badges */}
        <Badges>
          {hasSale && <Badge $sale>Sale</Badge>}
          {isNew && !hasSale && <Badge>New</Badge>}
          {outOfStock && <Badge $sold>Sold out</Badge>}
        </Badges>

        {/* Quick-add — overlay inside image block */}
        <QuickAddLayer>
          <QuickAddBtn
            type="button"
            onClick={handleQuickAdd}
            disabled={cartLoading || adding || outOfStock}
          >
            {adding ? "Adding…" : outOfStock ? "Sold out" : "Add to cart"}
          </QuickAddBtn>
        </QuickAddLayer>
      </ImgBlock>

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
          <Pills>
            {visiblePills.map((v, i) => (
              <Pill
                key={i}
                $on={i === selIdx}
                type="button"
                onClick={(e) => { e.preventDefault(); setSelIdx(i); }}
              >
                {v.title || v.value || `${i + 1}`}
              </Pill>
            ))}
            {extraCount > 0 && <MorePill>+{extraCount}</MorePill>}
          </Pills>
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
