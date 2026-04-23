"use client";

import React, { useState, useEffect, useContext, useRef } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import styled from "styled-components";
import { Button } from "@belucha/ui";
import { getMedusaClient } from "@/lib/medusa-client";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import { storefrontProductHandle } from "@/lib/product-url-handle";
import { localizedProductMediaList, variantImageUrlForLocale, variantMediaForLocale, variantLocaleContent } from "@/lib/product-locale-media";
import { optionDisplayLabel, optionCanonicalValue, variationGroupDisplayName } from "@/lib/variation-labels";
import Breadcrumbs from "@/components/Breadcrumbs";
import NewtonsCradle from "@/components/NewtonsCradle";
import { useMarketPrefix } from "@/context/MarketPrefixContext";
import { useShippingCountryForQuotes } from "@/hooks/useShippingCountryForQuotes";
import { findShippingGroup, resolveShippingQuoteCents, resolveShippingQuoteStrict } from "@/lib/shipping-price";
import Carousel from "@/components/Carousel";
import { StarRating } from "@/components/ProductCard";
import { ProductCard } from "@/components/ProductCard";
import dynamic from "next/dynamic";
// Lightbox only mounts when the user clicks an image — lazy-load to keep initial bundle lean.
const Lightbox = dynamic(
  () => import("@/components/Lightbox").then((m) => ({ default: m.Lightbox })),
  { ssr: false }
);
// TrustpilotTrustBox injects a third-party script — defer until after hydration.
const TrustpilotTrustBox = dynamic(() => import("@/components/TrustpilotTrustBox"), { ssr: false });
const TrustpilotWordmark  = dynamic(
  () => import("@/components/TrustpilotTrustBox").then((m) => ({ default: m.TrustpilotWordmark })),
  { ssr: false }
);
import ToCartButton from "@/components/ui/To Cart Button";
import ProductWishlistHeart from "@/components/ProductWishlistHeart";
import BestsellerBadge from "@/components/BestsellerBadge";
import { isBestsellerMetadata } from "@/lib/bestseller";

const Container = styled.div`
  max-width: 100%;
  padding: 32px 24px 64px;
  @media (max-width: 767px) {
    padding: 16px 12px 80px;
  }
  @media (min-width: 1200px) {
    padding-left: 150px;
    padding-right: 150px;
  }
`;

const ThreeCol = styled.div`
  display: grid;
  grid-template-columns: 0.55fr 1fr 290px;
  gap: 32px;
  margin-bottom: 48px;
  align-items: start;
  @media (max-width: 1024px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
`;

const GalleryCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 116px;
  margin-left: -40px;
  @media (max-width: 1024px) {
    position: static;
    top: auto;
    margin-left: 0;
  }
  /* Mobile: gallery first */
  @media (max-width: 768px) {
    order: 1;
  }
`;

const MainImageWrap = styled.div`
  position: relative;
  z-index: 0;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: #f3f4f6;
  cursor: pointer;
`;

const GalleryActionRow = styled.div`
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

const GalleryActionBtn = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.94);
  color: #374151;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
`;

const MainImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
  display: block;
`;

const Thumbnails = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
`;

const Thumbnail = styled.img`
  width: 64px;
  height: 64px;
  object-fit: contain;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid ${(p) => (p.$active ? "#0ea5e9" : "transparent")};
  flex-shrink: 0;
`;

const CenterCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  /* Mobile: description goes after gallery + buybox for better conversion */
  @media (max-width: 768px) {
    order: 3;
  }
`;

const Title = styled.h1.attrs({ className: "shop-typo-product-title" })``;

const DesktopOnly = styled.div`
  display: block;
  @media (max-width: 768px) {
    display: none;
  }
`;

const MobileHeaderBlock = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
`;

const MobileBrandReviewRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const MobileBadgeCategoryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const CategoryPill = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 62%;
`;

const Brand = styled.span`
  font-size: 0.9rem;
  color: #6b7280;
`;

const PriceBlock = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
`;

const VariantSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 2px;
`;

const MobileVariantsWrap = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: block;
    margin-top: 10px;
  }
`;

const VarGroup = styled.div``;

const VarLabel = styled.div`
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
`;

const VarLabelSelected = styled.span`
  font-weight: 400;
  color: #374151;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
`;

const VarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

/* Compact text chip — sizes, materials, etc */
const VarChip = styled.button`
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.2;
  border: 1px solid ${(p) => (p.$selected ? "#374151" : "#e5e7eb")};
  background: ${(p) => (p.$selected ? "#374151" : "#fff")};
  color: ${(p) => (p.$selected ? "#fff" : p.$oos ? "#9ca3af" : "#374151")};
  border-radius: 10px;
  cursor: ${(p) => (p.$oos ? "default" : "pointer")};
  text-decoration: ${(p) => (p.$oos && !p.$selected ? "line-through" : "none")};
  opacity: ${(p) => (p.$oos && !p.$selected ? 0.6 : 1)};
  pointer-events: ${(p) => (p.$oos && !p.$selected ? "none" : "auto")};
  transition: border-color 0.12s, background 0.12s, color 0.12s;
  &:hover:not(:disabled) {
    border-color: ${(p) => (p.$selected ? "#374151" : "#9ca3af")};
    color: ${(p) => (p.$selected ? "#fff" : "#111")};
  }
`;

/* Compact swatch circle — color / image options */
const VarSwatch = styled.button`
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid ${(p) => (p.$selected ? "#374151" : "#e5e7eb")};
  padding: 0;
  background: none;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color 0.12s, transform 0.12s;
  transform: ${(p) => (p.$selected ? "scale(1.08)" : "scale(1)")};
  opacity: ${(p) => (p.$oos && !p.$selected ? 0.5 : 1)};
  pointer-events: ${(p) => (p.$oos && !p.$selected ? "none" : "auto")};
  position: relative;
  display: block;
  &::after {
    content: "";
    display: ${(p) => (p.$oos && !p.$selected ? "block" : "none")};
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 45%, #9ca3af 45%, #9ca3af 55%, transparent 55%);
    border-radius: 50%;
  }
`;

const Price = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  color: #c2410c;
`;

const ComparePrice = styled.span`
  font-size: 1.1rem;
  color: #9ca3af;
  text-decoration: line-through;
`;

const BulletList = styled.ul`
  margin: 0;
  padding-left: 20px;
  list-style-type: disc;
  color: #4b5563;
  line-height: 1.6;
  font-size: 0.95rem;
`;

const MetaTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  & th, & td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  & th { color: #6b7280; font-weight: 500; width: 40%; }
`;

const RightCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  @media (max-width: 1024px) {
    grid-column: 1 / -1;
  }
  /* Mobile: show buybox immediately after gallery (order 2, center col goes last) */
  @media (max-width: 768px) {
    order: 2;
  }
`;


const BuyboxCard = styled.aside`
  position: static;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.98));
  box-shadow:
    0 8px 24px rgba(17, 24, 39, 0.10),
    0 2px 8px rgba(17, 24, 39, 0.06);
  overflow: hidden;
  border: 1px solid rgba(17, 24, 39, 0.06);

  @supports ((-webkit-backdrop-filter: blur(12px)) or (backdrop-filter: blur(12px))) {
    background: rgba(255, 255, 255, 0.72);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
  }

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    padding: 1px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(255,106,0,0.45), rgba(255,106,0,0.05), rgba(17,24,39,0.08));
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

`;

const BuyboxInner = styled.div`
  position: relative;
  padding: 16px;
`;

const OtherSellersCard = styled.div`
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 14px 16px 10px;
`;

const OtherSellerRow = styled.div`
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #e5e7eb;
  &:last-child {
    border-bottom: none;
    padding-bottom: 2px;
  }
`;

const PriceTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`;

const PriceStack = styled.div`
  min-width: 0;
`;

const PriceMainRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
`;

const PriceMain = styled.span`
  font-size: 1.7rem;
  font-weight: 650;
  color: #374151;
  letter-spacing: -0.03em;
  line-height: 1.05;
`;

const DiscountPill = styled.span`
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #7c2d12;
  background: #ffedd5;
  border: 1px solid #fed7aa;
  padding: 3px 8px;
  border-radius: 999px;
`;

const PriceSubRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`;

const Strike = styled.span`
  font-size: 0.9rem;
  color: #9ca3af;
  text-decoration: line-through;
`;

const MSRP = styled.span`
  font-size: 0.82rem;
  color: #9ca3af;
`;

const TaxLine = styled.div`
  font-size: 0.72rem;
  color: #9ca3af;
  margin-top: 6px;
`;

const StockRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 14px;
  background: rgba(249, 250, 251, 0.9);
  border: 1px solid rgba(229, 231, 235, 0.9);
  margin-bottom: 14px;
`;

const QtyWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const QtyLabel = styled.label`
  font-size: 0.75rem;
  color: #6b7280;
  font-weight: 600;
`;

const QtySelect = styled.select`
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 0.9rem;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
  color: #111;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  &[type="number"] {
    width: 11.5rem;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
    padding-left: 6px;
    padding-right: 6px;
    cursor: text;
  }
  &:focus {
    border-color: rgba(255,106,0,0.55);
    box-shadow: 0 0 0 4px rgba(255,106,0,0.12);
  }
`;

const CtaStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
`;

const InfoList = styled.div`
  border-top: 1px solid rgba(229,231,235,0.9);
  padding-top: 12px;
  display: grid;
  gap: 9px;
`;

const InfoRow = styled.div`
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 10px;
  align-items: baseline;
  font-size: 0.84rem;
`;

const InfoLabel = styled.span`
  color: #9ca3af;
  font-weight: 650;
`;

const InfoValue = styled.span`
  color: #111827;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CartNotice = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: #065f46;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 10px;
  padding: 8px 10px;
  text-align: center;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transform: translateY(${(p) => (p.$visible ? "0px" : "6px")});
  transition: opacity 450ms ease, transform 450ms ease;
  z-index: 5;
  position: relative;
  pointer-events: none;
`;

const SectionTitle = styled.h2`
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1f2937;
`;

const DescriptionSection = styled.section`
  margin-bottom: 48px;
  max-width: 780px;
  color: var(--body-color, #4b5563);
  line-height: var(--body-lh, 1.7);
  font-size: var(--body-fs, 1rem);
  font-family: var(--body-font);

  /* && = çift sınıf özgüllüğü: Tailwind preflight / global h1 tema H1–H5’i ezmesin */
  && h1 {
    font-family: var(--h1-ff);
    font-size: var(--h1-fs);
    font-weight: var(--h1-fw);
    font-style: var(--h1-style);
    color: var(--h1-color);
    letter-spacing: var(--h1-ls);
    line-height: var(--h1-lh);
    margin: 1.25em 0 0.5em;
  }
  && h2 {
    font-family: var(--h2-ff);
    font-size: var(--h2-fs);
    font-weight: var(--h2-fw);
    font-style: var(--h2-style);
    color: var(--h2-color);
    letter-spacing: var(--h2-ls);
    line-height: var(--h2-lh);
    margin: 1.25em 0 0.5em;
  }
  && h3 {
    font-family: var(--h3-ff);
    font-size: var(--h3-fs);
    font-weight: var(--h3-fw);
    font-style: var(--h3-style);
    color: var(--h3-color);
    letter-spacing: var(--h3-ls);
    line-height: var(--h3-lh);
    margin: 1em 0 0.4em;
  }
  && h4 {
    font-family: var(--h4-ff);
    font-size: var(--h4-fs);
    font-weight: var(--h4-fw);
    font-style: var(--h4-style);
    color: var(--h4-color);
    letter-spacing: var(--h4-ls);
    line-height: var(--h4-lh);
    margin: 0.85em 0 0.35em;
  }
  && h5 {
    font-family: var(--h5-ff);
    font-size: var(--h5-fs);
    font-weight: var(--h5-fw);
    font-style: var(--h5-style);
    color: var(--h5-color);
    letter-spacing: var(--h5-ls);
    line-height: var(--h5-lh);
    margin: 0.85em 0 0.35em;
  }
  && h6 {
    font-family: var(--h5-ff);
    font-size: var(--h5-fs);
    font-weight: var(--h5-fw);
    font-style: var(--h5-style);
    color: var(--h5-color);
    letter-spacing: var(--h5-ls);
    line-height: var(--h5-lh);
    margin: 0.85em 0 0.35em;
  }
  && h1:first-child,
  && h2:first-child,
  && h3:first-child,
  && h4:first-child,
  && h5:first-child,
  && h6:first-child {
    margin-top: 0;
  }
  & p { margin: 0 0 1em; }
  & ul, & ol { margin: 0.5em 0 1em 1.5em; padding-left: 1.5em; }
  & strong { font-weight: 600; }
  & a { color: #0ea5e9; text-decoration: underline; }
  & blockquote { margin: 1em 0; padding-left: 1em; border-left: 4px solid #e5e7eb; color: #6b7280; }
  & p:last-child { margin-bottom: 0; }
  & ul { list-style-type: disc; }
  & ol { list-style-type: decimal; }
  & li { margin-bottom: 0.35em; }
  & strong { font-weight: 600; color: #374151; }
  & em { font-style: italic; }
  & a:hover { text-decoration: none; }
  & hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.25em 0; }
`;

const ReviewsSection = styled.section`
  margin-bottom: 48px;
`;

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s*on\w+=["'][^"']*["']/gi, "")
    // Editor’den gelen inline stiller (font-size, color, font-family) tema H1–H5’i bastırıyor
    .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<font\b[^>]*>/gi, "")
    .replace(/<\/font>/gi, "");
}

const META_ATTR_KEYS = ["material", "farbe", "colour", "color", "size", "gewicht", "cart", "curt", "stoff", "typ"];

const META_HIDDEN_KEYS = [
  "category_slug",
  "category_id", "admin_category_id", "collection_id", "collection_ids",
  "seller_id", "product_id", "media", "bullet_points", "uvp_cents", "rabattpreis_cents",
  "ean", "brand", "seller_name", "shop_name", "return_days", "return_cost", "return_kostenlos",
  "review_count", "review_avg", "sold_last_month", "metafields", "publish_date",
  "brand_id", "hersteller", "seo_keywords", "seo_meta_title", "seo_meta_description",
  "hersteller_information", "verantwortliche_person_information", "brand_name", "brand_logo", "brand_handle",
  "shipping_group_id", "unit_type", "unit_value", "unit_reference",
  "dimensions", "dimension_width", "dimension_height", "dimension_depth", "dimension_length", "dimension_weight",
  "dimensions_length", "dimensions_width", "dimensions_height",
  "weight", "width", "height", "depth", "length",
];

const DEFAULT_VARIANT_TITLES = new Set(["default title", "default", "standard"]);

/* Legacy: group flat variants by title for products without variation_groups */
function groupVariantsByTitle(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return [];
  // Single default variant → no UI needed
  if (variants.length === 1) {
    const t = (variants[0].title || variants[0].value || "").toString().trim().toLowerCase();
    if (!t || DEFAULT_VARIANT_TITLES.has(t)) return [];
  }
  const groups = [];
  const byTitle = new Map();
  variants.forEach((v, index) => {
    const title = (v.title || v.value || "Option").toString().trim() || "Option";
    if (!byTitle.has(title)) {
      byTitle.set(title, []);
      groups.push({ title, options: byTitle.get(title) });
    }
    byTitle.get(title).push({ variant: v, index });
  });
  return groups.map((g) => ({ title: g.title, options: g.options }));
}

function normalizeVariants(variants, variationGroups) {
  if (!Array.isArray(variationGroups) || !variationGroups.length) return variants;
  const numGroups = variationGroups.length;
  return (variants || []).map((v) => {
    const ov = Array.isArray(v.option_values) ? v.option_values : [];
    if (ov.length === numGroups) return v;
    const titleStr = v.title || v.value || "";
    const parts = titleStr.split(" / ").map((s) => s.trim()).filter(Boolean);
    if (parts.length === numGroups) return { ...v, option_values: parts };
    if (numGroups === 1 && (v.value || titleStr)) return { ...v, option_values: [v.value || titleStr] };
    return v;
  });
}

/**
 * Find the best-matching variant index given selectedOptions = { groupName: value }.
 * Returns the index of the first variant where every selected option matches.
 */
function findVariantIndexByMap(variants, variationGroups, selectedOptions) {
  if (!Array.isArray(variants) || !Array.isArray(variationGroups)) return 0;
  const idx = variants.findIndex((v) => {
    const ov = Array.isArray(v.option_values) ? v.option_values : [];
    return variationGroups.every((g, i) => {
      const sel = selectedOptions[g.name];
      if (!sel) return true;
      return String(ov[i] ?? "").trim().toLowerCase() === sel.trim().toLowerCase();
    });
  });
  return idx >= 0 ? idx : 0;
}

/**
 * Does any in-stock variant exist that has `optionValue` for `groupName`
 * and is compatible with the rest of selectedOptions?
 */
function hasStockForOption(variants, variationGroups, groupName, optionValue, selectedOptions) {
  const gIdx = (variationGroups || []).findIndex((g) => g.name === groupName);
  if (gIdx < 0) return true;
  return variants.some((v) => {
    const ov = Array.isArray(v.option_values) ? v.option_values : [];
    if (String(ov[gIdx] ?? "").trim().toLowerCase() !== optionValue.trim().toLowerCase()) return false;
    const othersMatch = (variationGroups || []).every((g, i) => {
      if (i === gIdx) return true;
      const sel = selectedOptions[g.name];
      if (!sel) return true;
      return String(ov[i] ?? "").trim().toLowerCase() === sel.trim().toLowerCase();
    });
    if (!othersMatch) return false;
    const qty = v.inventory_quantity ?? v.inventory ?? 0;
    return Number(qty) > 0;
  });
}

function buildMetaRows(meta) {
  if (!meta || typeof meta !== "object") return [];
  const keyLower = (k) => String(k).toLowerCase();
  const hidden = new Set(META_HIDDEN_KEYS.map((h) => keyLower(h)));
  return Object.entries(meta)
    .filter(([k, v]) => {
      const key = keyLower(k);
      if (hidden.has(key)) return false;
      return META_ATTR_KEYS.some((m) => key.includes(m)) || (typeof v === "string" && v && !k.startsWith("_"));
    })
    .map(([k, v]) => ({ key: k, value: String(v) }));
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function BrandRow({ brandName, brandHandle, brandLogo, reviewCount }) {
  // Fallback: if enrichment hasn't run yet, try to slugify the brand name
  const handle = brandHandle || slugify(brandName) || null;

  const content = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.875rem" }}>
      {brandLogo ? (
        <img
          src={brandLogo}
          alt={brandName}
          style={{ width: 34, height: 34, objectFit: "cover", borderRadius: "50%", border: "1px solid #e5e7eb", flexShrink: 0 }}
        />
      ) : (
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#9ca3af" }}>
          {(brandName || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <span style={{ color: "#0ea5e9", textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 500 }}>
        {brandName}
      </span>
      {reviewCount > 0 && (
        <span style={{ color: "#9ca3af", fontWeight: 400 }}>({reviewCount})</span>
      )}
    </span>
  );

  if (!handle) return <div>{content}</div>;

  return (
    <Link href={`/brand/${handle}`} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

function findCategoryNodeBySlug(nodes, slug) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n) continue;
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return n;
    const child = findCategoryNodeBySlug(n.children, slug);
    if (child) return child;
  }
  return null;
}

/** Returns ancestor nodes (root → direct parent) for a given slug, or null if not found. */
function findAncestors(nodes, slug, path = []) {
  const norm = String(slug || "").replace(/^\//, "");
  for (const n of nodes || []) {
    if (!n) continue;
    const s = String(n.slug || n.handle || "").replace(/^\//, "");
    if (s === norm) return path;
    const found = findAncestors(n.children || [], slug, [...path, n]);
    if (found !== null) return found;
  }
  return null;
}

export default function ProductTemplateMobile() {
  const params = useParams();
  const locale = useLocale();
  const marketPrefixVal = useMarketPrefix();
  const marketCountry = (marketPrefixVal?.split("/").filter(Boolean)[0] || "de").toUpperCase();
  const countryCode = useShippingCountryForQuotes(marketCountry);
  const slug = params?.slug ?? params?.handle;
  const [selectedImage, setSelectedImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [product, setProduct] = useState(null);
  const [recommended, setRecommended] = useState([]);
  const [alsoBought, setAlsoBought] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  // Object map: { [groupName]: selectedValue } — each group is independent
  const [selectedOptions, setSelectedOptions] = useState({});
  const [sellerStoreName, setSellerStoreName] = useState("");
  const [cartNotice, setCartNotice] = useState({ text: "", visible: false });
  const [productReviews, setProductReviews] = useState([]);
  const [multiOffer, setMultiOffer] = useState(null);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [otherSellersOpen, setOtherSellersOpen] = useState(false);
  const [categoryAncestors, setCategoryAncestors] = useState([]);
  const [categoryCurrentNode, setCategoryCurrentNode] = useState(null);
  const cartNoticeTimersRef = useRef({ hide: null, clear: null });
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);
  const openCartSidebar = cartState?.openCartSidebar ?? (() => {});
  const shippingGroups = cartState?.shippingGroups ?? [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store-seller-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSellerStoreName((d?.store_name || "").toString());
      })
      .catch(() => {
        if (!cancelled) setSellerStoreName("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!slug) {
        setLoading(false);
        setProduct(null);
        setError(null);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/store-products/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (res.status === 404 || !data?.product) {
          setMultiOffer(null);
          setProduct(null);
          setError(res.status === 404 ? "Produkt nicht gefunden." : "Produkt konnte nicht geladen werden.");
          return;
        }
        setMultiOffer(data.multi_offer || null);
        setSelectedSellerId(null);
        setProduct(data.product);
      } catch (err) {
        console.error("Failed to fetch product:", err);
        setError(err?.message || "Fehler beim Laden");
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [slug]);

  useEffect(() => {
    if (typeof document === "undefined" || !product) return;
    const pathSlug = storefrontProductHandle(product, locale);
    if (!pathSlug) return;
    const href = `${window.location.origin}/produkt/${pathSlug}`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [product, locale]);

  // Breadcrumb: show full category chain (root → … → current) if product has `metadata.category_slug`.
  useEffect(() => {
    const categorySlug = product?.metadata?.category_slug;
    if (!categorySlug) {
      setCategoryAncestors([]);
      setCategoryCurrentNode(null);
      return;
    }

    let cancelled = false;
    fetch("/api/store-categories?tree=true&is_visible=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const tree = data?.tree || data?.categories || [];
        const roots = Array.isArray(tree) ? tree : [tree];
        const ancestors = findAncestors(roots, categorySlug) || [];
        const currentNode = findCategoryNodeBySlug(roots, categorySlug) || null;
        setCategoryAncestors(ancestors);
        setCategoryCurrentNode(currentNode);
      })
      .catch(() => {
        if (cancelled) return;
        setCategoryAncestors([]);
        setCategoryCurrentNode(null);
      });

    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.metadata?.category_slug]);

  useEffect(() => {
    if (!product?.variation_groups?.length || !product?.variants?.length) return;
    const normalized = normalizeVariants(product.variants, product.variation_groups);
    const first = normalized[0];
    const ov = Array.isArray(first?.option_values) ? first.option_values : [];
    const init = {};
    product.variation_groups.forEach((g, i) => {
      if (ov[i] != null) init[g.name] = String(ov[i]);
    });
    setSelectedOptions(init);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const ids = product.metadata?.related_product_ids || product.metadata?.also_bought_ids;
    const idList = Array.isArray(ids) ? ids.filter((id) => id && String(id).trim()) : [];
    if (idList.length > 0) {
      Promise.all(idList.slice(0, 12).map((id) => fetch(`/api/store-products/${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => d.product).catch(() => null)))
        .then((products) => {
          const valid = (products || []).filter(Boolean);
          setRecommended(valid.slice(0, 8));
          setAlsoBought(valid.slice(0, 8));
        })
        .catch(() => {
          setRecommended([]);
          setAlsoBought([]);
        });
      return;
    }
    const client = getMedusaClient();
    client.getProducts({ limit: 20 }).then((r) => {
      const list = r.products || [];
      const others = list.filter((p) => p.id !== product.id && (p.handle || p.id) !== (product.handle || product.id));
      setRecommended(others.slice(0, 8));
      setAlsoBought(others.slice(0, 8));
    }).catch(() => {});
  }, [product]);

  useEffect(() => {
    if (!product?.id) return;
    const reviewQs =
      multiOffer?.review_product_ids?.length > 0
        ? `product_ids=${multiOffer.review_product_ids.map((id) => encodeURIComponent(String(id))).join(",")}`
        : `product_id=${encodeURIComponent(product.id)}`;
    setProductReviews([]);
    getMedusaClient()
      .request(`/store/reviews?${reviewQs}`)
      .then((res) => {
        if (res?.reviews?.length) setProductReviews(res.reviews);
      })
      .catch(() => {});
  }, [product?.id, multiOffer?.review_product_ids]);

  if (loading) return <Container><NewtonsCradle /></Container>;
  if (error) return <Container>Fehler: {error}</Container>;
  if (!product) return <Container>Produkt nicht gefunden.</Container>;

  const { title: displayTitle, description: displayDescription } = getLocalizedProduct(product, locale);
  const localeMedia = localizedProductMediaList(product, locale);
  const rawImages = product.images?.length
    ? product.images
    : product.thumbnail
      ? [{ url: product.thumbnail, alt: product.title }]
      : localeMedia.length
        ? localeMedia.map((url) => ({ url: typeof url === "string" ? url : url?.url, alt: product.title }))
        : [];
  const images = rawImages.map((img) => ({ ...img, url: resolveImageUrl(img?.url || img) || img?.url || img }));
  const meta = product.metadata || {};
  const shippingGroupIdRaw = meta.shipping_group_id;
  const shippingGroup =
    shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== ""
      ? findShippingGroup(shippingGroups, shippingGroupIdRaw)
      : null;
  const shippingPriceCents = shippingGroup ? resolveShippingQuoteStrict(shippingGroup.prices, marketCountry) : null;
  const hasShippingGroup = shippingGroupIdRaw != null && String(shippingGroupIdRaw).trim() !== "" && shippingGroup != null;
  // If a shipping group is assigned but no price exists for current market → product not shippable here
  const shippingUnavailable = hasShippingGroup && shippingPriceCents === null;
  const shippingDisplay = hasShippingGroup
    ? (shippingPriceCents != null
        ? `${formatPriceCents(shippingPriceCents)} €`
        : { de: "Nicht verfügbar in dieser Region", tr: "Bu bölgede mevcut değil", fr: "Non disponible dans cette région", it: "Non disponibile in questa regione", es: "No disponible en esta región" }[locale] ?? "Not available in this region")
    : (meta.shipping_info || meta.versand || "Standardversand");
  const rawVariants = product.variants || [];
  const variationGroups = product.variation_groups || null;
  const variants = normalizeVariants(rawVariants, variationGroups);
  const useLinkedVariations = Array.isArray(variationGroups) && variationGroups.length > 0 &&
    variants.some((v) => Array.isArray(v.option_values) && v.option_values.length === variationGroups.length);
  const effectiveVariantIndex = useLinkedVariations
    ? findVariantIndexByMap(variants, variationGroups, selectedOptions)
    : selectedVariantIndex;
  const variant = variants[effectiveVariantIndex] ?? variants[selectedVariantIndex] ?? variants[0];
  // Variant media: prefer metadata.media array, fall back to single image_url
  const variantMediaList = variant ? variantMediaForLocale(variant, locale).map((u) => resolveImageUrl(u)).filter(Boolean) : [];
  const variantImageUrl = variant ? resolveImageUrl(variantImageUrlForLocale(variant, locale)) : null;
  // When variant has its own images, gallery shows those; otherwise show product images
  const displayImages = variantMediaList.length > 0
    ? variantMediaList.map((url) => ({ url, alt: variant?.title || displayTitle }))
    : images;
  // Variant-specific locale content overrides (title, description, bullets)
  const variantContent = variant ? variantLocaleContent(variant, locale) : {};
  const effectiveTitle = variantContent.title || displayTitle;
  const effectiveDescription = variantContent.description || displayDescription;
  const mainImage = displayImages[selectedImage]?.url || variantImageUrl || (product.thumbnail ? resolveImageUrl(product.thumbnail) : null) || "https://via.placeholder.com/600";
  const variantCountryPrice = (() => {
    const vm = variant?.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
    const prices = vm.prices && typeof vm.prices === "object" ? vm.prices : {};
    const direct = prices[countryCode] || prices[marketCountry];
    return direct && direct.brutto_cents != null ? Number(direct.brutto_cents) : null;
  })();
  const parentCountryPrice = (() => {
    const prices = meta.prices && typeof meta.prices === "object" ? meta.prices : {};
    const direct = prices[countryCode] || prices[marketCountry];
    return direct && direct.brutto_cents != null ? Number(direct.brutto_cents) : null;
  })();
  const priceCents =
    variantCountryPrice != null
      ? variantCountryPrice
      : (variant?.prices?.[0]?.amount != null
          ? Number(variant.prices[0].amount)
          : (parentCountryPrice != null
              ? parentCountryPrice
              : (product.price != null ? Math.round(Number(product.price) * 100) : 0)));
  const uvpCountryCents = (() => {
    const vm = variant?.metadata && typeof variant.metadata === "object" ? variant.metadata : {};
    const prices = vm.prices && typeof vm.prices === "object" ? vm.prices : {};
    const direct = prices[countryCode] || prices[marketCountry];
    return direct && direct.uvp_cents != null ? Number(direct.uvp_cents) : null;
  })();
  const uvpCents = uvpCountryCents != null
    ? uvpCountryCents
    : (variant?.compare_at_price_cents != null ? Number(variant.compare_at_price_cents) : (meta.uvp_cents != null ? Number(meta.uvp_cents) : null));
  const saleCents = meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) : null;
  const hasSale = saleCents != null && saleCents > 0 && priceCents > 0;
  const displayCents = hasSale ? saleCents : priceCents;
  const discountPercent = hasSale && priceCents > 0 && saleCents < priceCents
    ? Math.round(((priceCents - saleCents) / priceCents) * 100)
    : null;
  const productBullets = Array.isArray(meta.bullet_points) ? meta.bullet_points.filter(Boolean) : [];
  const bulletPoints = (variantContent.bullet_points && variantContent.bullet_points.length > 0)
    ? variantContent.bullet_points.filter(Boolean)
    : productBullets;
  const reviewCount = productReviews.length > 0 ? productReviews.length : (meta.review_count != null ? Number(meta.review_count) : 0);
  const reviewAvg = productReviews.length > 0
    ? productReviews.reduce((s, r) => s + Number(r.rating || 0), 0) / productReviews.length
    : (meta.review_avg != null ? Number(meta.review_avg) : 0);
  const soldLastMonth = meta.sold_last_month != null ? Number(meta.sold_last_month) : null;
  const isBestseller = isBestsellerMetadata(meta);
  const inventory = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity ?? 0;
  const inventorySafe =
    variant?.inventory_quantity ??
    variant?.inventory ??
    product.variants?.[0]?.inventory_quantity ??
    product.variants?.[0]?.inventory ??
    0;
  const inventorySafeNum = Number(inventorySafe);
  const inStock = inventorySafeNum > 0;
  const maxQty = inventorySafeNum || 9999;
  const publishDate = meta.publish_date ? new Date(meta.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const variantMetafields = Array.isArray(variant?.metadata?.metafields) ? variant.metadata.metafields.filter((f) => f?.key && f?.value) : [];
  const metaRows = buildMetaRows(meta);

  // Grundpreis (unit price) — e.g. "1 kg = 50,00 €"
  const grundpreis = (() => {
    const unitTypeRaw = meta.unit_type;
    const unitValueRaw = meta.unit_value;
    const unitRefRaw = meta.unit_reference;
    if (!unitTypeRaw || unitValueRaw == null || unitValueRaw === "") return null;
    // Support both "0.2" and "0,2" (German decimal)
    const unitVal = parseFloat(String(unitValueRaw).replace(",", "."));
    const unitRef = parseFloat(String(unitRefRaw ?? "1").replace(",", ".")) || 1;
    if (!unitVal || unitVal <= 0 || !isFinite(unitVal)) return null;
    const perUnitCents = Math.round((displayCents / unitVal) * unitRef);
    if (!perUnitCents || perUnitCents <= 0) return null;
    const unitLabel = unitTypeRaw === "stück" ? "Stück" : unitTypeRaw;
    const refLabel = unitRef === 1 ? `1 ${unitLabel}` : `${unitRef} ${unitLabel}`;
    const contentLabel = `${String(unitValueRaw).replace(".", ",")} ${unitLabel}`;
    return { display: `(${refLabel} = ${formatPriceCents(perUnitCents)} €)`, contentLabel };
  })();

  // Combined dimensions row — "H × B × T cm" (only if at least one value is set)
  const dimensionsDisplay = (() => {
    const h = meta.dimensions_height != null && meta.dimensions_height !== "" ? String(meta.dimensions_height).replace(".", ",") : null;
    const w = meta.dimensions_width  != null && meta.dimensions_width  !== "" ? String(meta.dimensions_width).replace(".", ",")  : null;
    const l = meta.dimensions_length != null && meta.dimensions_length !== "" ? String(meta.dimensions_length).replace(".", ",") : null;
    // Keep the same order as the Excel template columns:
    // length -> width -> height
    const parts = [l, w, h].filter(Boolean);
    if (!parts.length) return null;
    return parts.join(" × ") + " cm";
  })();

  const storeName =
    (sellerStoreName || "").trim() ||
    product?.metadata?.shop_name ||
    product?.metadata?.store_name ||
    product?.metadata?.seller_name ||
    "Shop";

  const selectedSellerOffer = selectedSellerId
    ? (multiOffer?.other_sellers || []).find((o) => o.seller_id === selectedSellerId) || null
    : null;
  const effectiveDisplayCents = selectedSellerOffer != null ? Number(selectedSellerOffer.price_cents) : displayCents;
  const effectiveStoreName = selectedSellerOffer?.store_name || storeName;
  const returnDays = meta.return_days != null ? meta.return_days : 14;
  const returnCost = meta.return_cost === false || meta.return_kostenlos === true ? "kostenlos" : (meta.return_cost || "kostenlos");
  const titleDisplay = (effectiveTitle || displayTitle || "").slice(0, 120);

  const goPrev = () => setSelectedImage((i) => (i <= 0 ? displayImages.length - 1 : i - 1));
  const goNext = () => setSelectedImage((i) => (i >= displayImages.length - 1 ? 0 : i + 1));
  const shareProduct = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const shareData = { title: titleDisplay || displayTitle || "Produkt", url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (_) {}
    try {
      await navigator.clipboard.writeText(url);
      setCartNotice({ text: locale === "de" ? "Link kopiert" : "Link copied", visible: true });
      if (cartNoticeTimersRef.current.hide) window.clearTimeout(cartNoticeTimersRef.current.hide);
      if (cartNoticeTimersRef.current.clear) window.clearTimeout(cartNoticeTimersRef.current.clear);
      cartNoticeTimersRef.current.hide = window.setTimeout(() => {
        setCartNotice((s) => ({ ...s, visible: false }));
      }, 1600);
      cartNoticeTimersRef.current.clear = window.setTimeout(() => {
        setCartNotice({ text: "", visible: false });
      }, 2000);
    } catch (_) {}
  };

  const handleAddToCart = async () => {
    const variantId = variant?.id;
    if (!variantId) return;
    if (shippingUnavailable) return;
    // Avoid timer-race when user clicks quickly multiple times
    if (cartNoticeTimersRef.current.hide) window.clearTimeout(cartNoticeTimersRef.current.hide);
    if (cartNoticeTimersRef.current.clear) window.clearTimeout(cartNoticeTimersRef.current.clear);

    const successText = {
      de: "Zum Warenkorb hinzugefügt", tr: "Sepete eklendi",
      fr: "Ajouté au panier", it: "Aggiunto al carrello", es: "Añadido al carrito",
    }[locale] ?? "Added to cart";
    const errorText = {
      de: "Hinzufügen fehlgeschlagen", tr: "Sepete eklenemedi",
      fr: "Échec de l'ajout", it: "Aggiunta fallita", es: "Error al añadir",
    }[locale] ?? "Add to cart failed";

    try {
      const ok = await addToCart(variantId, quantity, selectedSellerId);
      if (ok) openCartSidebar();
      setCartNotice({ text: ok ? successText : errorText, visible: true });

      cartNoticeTimersRef.current.hide = window.setTimeout(() => {
        setCartNotice((s) => ({ ...s, visible: false }));
      }, 3800);
      cartNoticeTimersRef.current.clear = window.setTimeout(() => {
        setCartNotice({ text: "", visible: false });
      }, 4300);
    } catch (e) {
      setCartNotice({ text: errorText, visible: true });
      cartNoticeTimersRef.current.hide = window.setTimeout(() => {
        setCartNotice((s) => ({ ...s, visible: false }));
      }, 3800);
      cartNoticeTimersRef.current.clear = window.setTimeout(() => {
        setCartNotice({ text: "", visible: false });
      }, 4300);
    }
  };

  const categorySlugNorm = meta.category_slug ? String(meta.category_slug).replace(/^\//, "") : "";
  const categoryCurrentLabel =
    categoryCurrentNode?.name ||
    meta.category_name ||
    (categorySlugNorm
      ? categorySlugNorm.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
      : "");

  const collectionHandleNorm = product.collection?.handle ? String(product.collection.handle).replace(/^\//, "") : "";
  const includeCollection = Boolean(product.collection) && collectionHandleNorm && collectionHandleNorm !== categorySlugNorm;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    ...(categoryAncestors || []).map((anc) => {
      const ancSlug = String(anc.slug || anc.handle || "").replace(/^\//, "");
      return { label: anc.name || ancSlug, href: ancSlug ? `/${ancSlug}` : null };
    }),
    ...(categorySlugNorm
      ? [{ label: categoryCurrentLabel, href: `/${categorySlugNorm}` }]
      : []),
    ...(includeCollection ? [{ label: product.collection.title, href: `/${product.collection.handle}` }] : []),
    { label: displayTitle, href: null },
  ];


  // JSON-LD structured data for SEO (Product schema)
  const jsonLd = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: effectiveTitle || displayTitle,
    description: displayDescription || "",
    image: displayImages.length > 0 ? displayImages.map((i) => i.url || i) : undefined,
    sku: variant?.sku || product.id,
    brand: meta.brand_name ? { "@type": "Brand", name: meta.brand_name } : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: displayCents > 0 ? (displayCents / 100).toFixed(2) : "0.00",
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: typeof window !== "undefined" ? window.location.href : undefined,
    },
    ...(reviewCount > 0 && reviewAvg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewAvg.toFixed(1),
            reviewCount: reviewCount,
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
  } : null;

  const variantSelectorContent = useLinkedVariations && variationGroups?.length ? (
    <VariantSection>
      {variationGroups.map((group, gIdx) => {
        const groupName = group.name || "";
        const selected = selectedOptions[groupName] ?? "";
        const groupTitle = variationGroupDisplayName(group, gIdx, meta, locale);
        const selectedOpt = (group.options || []).find(
          (o) => optionCanonicalValue(o).toLowerCase() === selected.trim().toLowerCase()
        );
        const selectedLabel = selected
          ? (selectedOpt ? optionDisplayLabel(selectedOpt, locale) : selected)
          : "";
        const isSwatch = (group.options || []).some(
          (o) => (typeof o === "object" && o.swatch_image)
        );
        return (
          <VarGroup key={groupName}>
            <VarLabel>
              {groupTitle || groupName}
              {selectedLabel && <VarLabelSelected>: {selectedLabel}</VarLabelSelected>}
            </VarLabel>
            <VarRow>
              {(group.options || []).map((opt, oIdx) => {
                const valueStr = optionCanonicalValue(opt);
                const displayStr = optionDisplayLabel(opt, locale) || `Option ${oIdx + 1}`;
                const swatchUrl = typeof opt === "object" && opt.swatch_image
                  ? resolveImageUrl(opt.swatch_image)
                  : null;
                const isSelected = selected.trim().toLowerCase() === valueStr.toLowerCase();
                const inStockOpt = hasStockForOption(variants, variationGroups, groupName, valueStr, selectedOptions);
                const handleClick = () => {
                  if (isSelected || !inStockOpt) return;
                  setSelectedOptions((prev) => ({ ...prev, [groupName]: valueStr }));
                  setSelectedImage(0);
                };
                if (isSwatch || swatchUrl) {
                  return (
                    <VarSwatch
                      key={oIdx}
                      type="button"
                      title={displayStr}
                      $selected={isSelected}
                      $oos={!inStockOpt}
                      onClick={handleClick}
                      aria-label={displayStr}
                      aria-pressed={isSelected}
                    >
                      {swatchUrl ? (
                        <img src={swatchUrl} alt={displayStr} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
                      ) : (
                        <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: valueStr.toLowerCase() }} />
                      )}
                    </VarSwatch>
                  );
                }
                return (
                  <VarChip
                    key={oIdx}
                    type="button"
                    $selected={isSelected}
                    $oos={!inStockOpt}
                    onClick={handleClick}
                    aria-pressed={isSelected}
                  >
                    {displayStr}
                  </VarChip>
                );
              })}
            </VarRow>
          </VarGroup>
        );
      })}
    </VariantSection>
  ) : (() => {
    const legacyGroups = groupVariantsByTitle(variants);
    if (legacyGroups.length === 0) return null;
    return (
      <VariantSection>
        {legacyGroups.map((group) => (
          <VarGroup key={group.title}>
            <VarLabel>{group.title}</VarLabel>
            <VarRow>
              {group.options.map(({ variant: v, index: idx }) => {
                const qty = v.inventory_quantity ?? v.inventory ?? 0;
                const oos = Number(qty) <= 0;
                return (
                  <VarChip
                    key={idx}
                    type="button"
                    $selected={selectedVariantIndex === idx}
                    $oos={oos}
                    onClick={() => !oos && setSelectedVariantIndex(idx)}
                    aria-pressed={selectedVariantIndex === idx}
                  >
                    {v.value || v.title || `Option ${idx + 1}`}
                  </VarChip>
                );
              })}
            </VarRow>
          </VarGroup>
        ))}
      </VariantSection>
    );
  })();

  return (
    <Container>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Breadcrumbs items={breadcrumbItems} />

      <MobileHeaderBlock>
        <MobileBrandReviewRow>
          {(meta.brand_name || meta.brand) ? (
            <BrandRow
              brandName={meta.brand_name || meta.brand || ""}
              brandHandle={meta.brand_handle || null}
              brandLogo={meta.brand_logo ? resolveImageUrl(meta.brand_logo) : null}
              reviewCount={0}
            />
          ) : <span />}
          <a
            href="#reviews"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", color: "inherit", whiteSpace: "nowrap" }}
          >
            <StarRating average={reviewAvg} count={reviewCount} />
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
              {reviewCount > 0 ? `${reviewCount}` : "0"}
            </span>
          </a>
        </MobileBrandReviewRow>

        <Title>{titleDisplay}</Title>

        <MobileBadgeCategoryRow>
          <span>{isBestseller && <BestsellerBadge style={{ alignSelf: "flex-start" }} />}</span>
          {categoryCurrentLabel ? (
            <CategoryPill title={categoryCurrentLabel}>{categoryCurrentLabel}</CategoryPill>
          ) : <span />}
        </MobileBadgeCategoryRow>
      </MobileHeaderBlock>

      <ThreeCol>
        {/* Left: Gallery — sticky until Kunden section */}
        <GalleryCol>
          <div style={{ position: "relative", width: "100%" }}>
            <MainImageWrap onClick={() => displayImages.length > 0 && setLightboxOpen(true)}>
              <MainImage src={mainImage} alt={displayTitle} />
            </MainImageWrap>
            {product?.id && (
              <GalleryActionRow
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <div style={{ position: "relative" }}>
                  <ProductWishlistHeart productId={product.id} positionAbsolute={false} />
                </div>
                <GalleryActionBtn type="button" aria-label="Share product" title="Share product" onClick={shareProduct}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line>
                    <line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line>
                  </svg>
                </GalleryActionBtn>
              </GalleryActionRow>
            )}
          </div>
          {displayImages.length > 1 && (
            <Thumbnails>
              {displayImages.map((img, index) => (
                <Thumbnail
                  key={index}
                  src={img.url || ""}
                  alt={img.alt || displayTitle}
                  $active={index === selectedImage}
                  onClick={() => setSelectedImage(index)}
                />
              ))}
            </Thumbnails>
          )}
          {displayImages.length > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" onClick={goPrev} className="px-3 py-1 border rounded hover:bg-gray-100">‹</button>
              <button type="button" onClick={goNext} className="px-3 py-1 border rounded hover:bg-gray-100">›</button>
            </div>
          )}
          <MobileVariantsWrap>{variantSelectorContent}</MobileVariantsWrap>
        </GalleryCol>

        {/* Center: Title, brand, reviews, price, variants, bullets, meta */}
        <CenterCol>
          <DesktopOnly>
            {isBestseller && <BestsellerBadge style={{ alignSelf: "flex-start", marginBottom: 2 }} />}
            <Title>{titleDisplay}</Title>
            <a
              href="#reviews"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}
            >
              <StarRating average={reviewAvg} count={reviewCount} />
              {reviewAvg > 0 ? (
                <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                  {reviewAvg.toFixed(1).replace(".", ",")}
                </span>
              ) : null}
              <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>
                {reviewCount > 0 ? `(${reviewCount} Bewertungen)` : "Noch keine Bewertungen"}
              </span>
            </a>
            {(meta.brand_name || meta.brand) && (
              <BrandRow
                brandName={meta.brand_name || meta.brand || ""}
                brandHandle={meta.brand_handle || null}
                brandLogo={meta.brand_logo ? resolveImageUrl(meta.brand_logo) : null}
                reviewCount={reviewCount}
              />
            )}
          </DesktopOnly>
          {soldLastMonth != null && soldLastMonth > 0 && (
            <p className="text-gray-500 text-sm">
              {soldLastMonth} im letzten Monat verkauft
            </p>
          )}

          <DesktopOnly>{variantSelectorContent}</DesktopOnly>

          {bulletPoints.length > 0 && (
            <BulletList>
              {bulletPoints.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </BulletList>
          )}
          {(metaRows.length > 0 || dimensionsDisplay || (Array.isArray(meta.metafields) && meta.metafields.some((f) => f?.key && f?.value)) || variantMetafields.length > 0) && (
            <MetaTable>
              <tbody>
                {metaRows.map(({ key, value }) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
                {dimensionsDisplay && (
                  <tr>
                    <th>Abmessungen</th>
                    <td>{dimensionsDisplay}</td>
                  </tr>
                )}
                {Array.isArray(meta.metafields) && meta.metafields.filter((f) => f?.key && f?.value).map((f, i) => (
                  <tr key={`mf-${i}`}>
                    <th>{f.key}</th>
                    <td>{f.value}</td>
                  </tr>
                ))}
                {variantMetafields.map((f, i) => (
                  <tr key={`vmf-${i}`}>
                    <th>{f.key}</th>
                    <td>{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </MetaTable>
          )}
        </CenterCol>

        {/* Right: Buybox — sticky */}
        <RightCol>
          <BuyboxCard>
            <BuyboxInner>
              {multiOffer?.canonical_ean ? (
                <p style={{ fontSize: 12, color: "#047857", margin: "0 0 10px", fontWeight: 600, lineHeight: 1.35 }}>
                  {locale === "tr"
                    ? "Öne çıkan teklif: en iyi fiyat ve mağaza puanı kombinasyonu."
                    : locale === "de"
                      ? "Empfohlenes Angebot: beste Kombination aus Preis und Verkäuferbewertung."
                      : "Featured offer: best combination of price and seller rating."}
                  {multiOffer.landed_product_id &&
                  product?.id &&
                  String(multiOffer.landed_product_id) !== String(product.id) ? (
                    <span style={{ display: "block", fontWeight: 500, color: "#6b7280", marginTop: 4 }}>
                      {locale === "tr"
                        ? "Ziyaret ettiğiniz listeleme farklı bir satıcıya ait; sepete eklenen ürün öne çıkan tekliftendir."
                        : locale === "de"
                          ? "Sie haben eine andere Verkäufer-URL aufgerufen; Ihr Warenkorb nutzt das empfohlene Angebot."
                          : "You opened another seller’s listing; checkout uses the featured offer."}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <PriceTop>
                <PriceStack>
                  <PriceMainRow>
                    <PriceMain>{formatPriceCents(effectiveDisplayCents)} €</PriceMain>
                    {discountPercent != null && discountPercent > 0 && (
                      <DiscountPill>-{discountPercent}%</DiscountPill>
                    )}
                  </PriceMainRow>
                  {(hasSale || (uvpCents != null && uvpCents > 0)) && (
                    <PriceSubRow>
                      {hasSale && <Strike>{formatPriceCents(priceCents)} €</Strike>}
                      {uvpCents != null && uvpCents > 0 && <MSRP>UVP {formatPriceCents(uvpCents)} €</MSRP>}
                    </PriceSubRow>
                  )}
                  <TaxLine>inkl. MwSt. · zzgl. Versandkosten</TaxLine>
                  {grundpreis && (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {grundpreis.contentLabel && <span>{grundpreis.contentLabel} · </span>}
                      <span>{grundpreis.display}</span>
                    </div>
                  )}
                </PriceStack>
              </PriceTop>

              <StockRow>
                <QtyWrap>
                  <QtyLabel>Menge</QtyLabel>
                  <QtySelect
                    as="input"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => {
                      const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                      setQuantity(v);
                    }}
                    onBlur={(e) => {
                      const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                      setQuantity(v);
                    }}
                    disabled={!inStock || isComingSoon || shippingUnavailable}
                  />
                </QtyWrap>
              </StockRow>

              <CtaStack>
                {cartNotice.text ? (
                  <CartNotice $visible={cartNotice.visible}>{cartNotice.text}</CartNotice>
                ) : null}
                <ToCartButton
                  onClick={handleAddToCart}
                  disabled={!inStock || isComingSoon || shippingUnavailable}
                >
                  {shippingUnavailable
                    ? ({ de: "Nicht in diese Region lieferbar", tr: "Bu bölgeye teslimat yok", fr: "Pas de livraison dans cette région", it: "Nessuna consegna in questa regione", es: "Sin envío a esta región" }[locale] ?? "Not available in this region")
                    : isComingSoon
                      ? ({ de: "Bald verfügbar", tr: "Yakında", fr: "Bientôt disponible", it: "Disponibile presto", es: "Próximamente" }[locale] ?? "Coming Soon")
                      : !inStock
                        ? ({ de: "Ausverkauft", tr: "Stokta Yok", fr: "Épuisé", it: "Esaurito", es: "Agotado" }[locale] ?? "Out of Stock")
                        : ({ de: "In den Einkaufswagen", tr: "Sepete Ekle", fr: "Ajouter au panier", it: "Aggiungi al carrello", es: "Añadir al carrito" }[locale] ?? "Add to Cart")
                  }
                </ToCartButton>
                {isComingSoon && publishDate && (
                  <p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: "8px 0 0", fontWeight: 400 }}>
                    {({ de: "Bald verfügbar", tr: "Pek yakında", fr: "Bientôt disponible", it: "Disponibile presto", es: "Próximamente" }[locale] ?? "Coming Soon")}
                    {publishDate && !isNaN(publishDate.getTime()) && (
                      <span style={{ marginLeft: 6 }}>
                        ({publishDate.toLocaleDateString(locale === "tr" ? "tr-TR" : "de-DE", { day: "numeric", month: "long", year: "numeric" })})
                      </span>
                    )}
                  </p>
                )}
              </CtaStack>

              <InfoList>
                {[
                  { label: "Versand", value: shippingDisplay },
                  { label: "Rückgabe", value: `${returnDays} Tage, ${returnCost}` },
                  { label: "Verkäufer", value: effectiveStoreName },
                  ...((variant?.ean || meta.ean) ? [{ label: "EAN", value: variant?.ean || meta.ean }] : []),
                ].map(({ label, value }) => (
                  <InfoRow key={label}>
                    <InfoLabel>{label}</InfoLabel>
                    <InfoValue title={String(value ?? "")}>{value}</InfoValue>
                  </InfoRow>
                ))}
              </InfoList>
            </BuyboxInner>
          </BuyboxCard>

          {multiOffer?.other_sellers?.length > 0 ? (
            <OtherSellersCard>
              <button
                type="button"
                onClick={() => setOtherSellersOpen((v) => !v)}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, marginBottom: 6, cursor: "pointer", fontWeight: 700, fontSize: 14, color: "#111827" }}
              >
                {locale === "tr" ? `Diğer satıcılar (${multiOffer.other_sellers.length})` : locale === "de" ? `Other sellers (${multiOffer.other_sellers.length})` : `Other sellers (${multiOffer.other_sellers.length})`}
                <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{otherSellersOpen ? "▲" : "▼"}</span>
              </button>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px", lineHeight: 1.35 }}>
                {locale === "tr"
                  ? "Aynı EAN için diğer mağazalar. Mağaza puanları tüm ürün yorumlarından türetilir."
                  : locale === "de"
                    ? "Weitere Händler mit derselben EAN. Verkäufersterne aus allen Produktbewertungen."
                    : "More sellers for this EAN. Seller scores combine all their product reviews."}
              </p>
              {otherSellersOpen && (
                <>
              {selectedSellerId && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 10px", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "#166534", fontWeight: 600 }}>
                    {locale === "tr" ? "Seçili satıcıdan alıyorsunuz" : locale === "de" ? "Kauf beim ausgewählten Händler" : "Buying from selected seller"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedSellerId(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#6b7280", textDecoration: "underline", padding: 0 }}
                  >
                    {locale === "tr" ? "Sıfırla" : locale === "de" ? "Zurücksetzen" : "Reset"}
                  </button>
                </div>
              )}
              {multiOffer.other_sellers.map((o) => {
                const isSelected = selectedSellerId === o.seller_id;
                return (
                  <OtherSellerRow key={o.product_id} style={isSelected ? { background: "#f0fdf4", borderColor: "#86efac" } : {}}>
                    {o.thumbnail ? (
                      <img
                        src={resolveImageUrl(o.thumbnail) || o.thumbnail}
                        alt=""
                        width={44}
                        height={44}
                        style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, background: "#e5e7eb", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: "#e5e7eb", flexShrink: 0 }} aria-hidden />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{o.store_name}</div>
                      <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {o.seller_review_count > 0 && Number(o.seller_review_avg) > 0 ? (
                          <StarRating average={Number(o.seller_review_avg) || 0} count={Number(o.seller_review_count) || 0} />
                        ) : (
                          <span>{locale === "tr" ? "Mağaza yorumu yok" : locale === "de" ? "Keine Verkäuferbewertungen" : "No seller reviews yet"}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          disabled={!o.in_stock}
                          onClick={() => setSelectedSellerId(isSelected ? null : o.seller_id)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, cursor: o.in_stock ? "pointer" : "not-allowed",
                            background: isSelected ? "#16a34a" : o.in_stock ? "#111827" : "#d1d5db",
                            color: isSelected || o.in_stock ? "#fff" : "#6b7280",
                            border: "none",
                          }}
                        >
                          {isSelected
                            ? (locale === "tr" ? "Seçildi ✓" : locale === "de" ? "Ausgewählt ✓" : "Selected ✓")
                            : !o.in_stock
                              ? (locale === "tr" ? "Stokta yok" : locale === "de" ? "Ausverkauft" : "Out of stock")
                              : (locale === "tr" ? "Bu satıcıdan al" : locale === "de" ? "Bei diesem Händler kaufen" : "Buy from this seller")}
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                        {formatPriceCents(Number(o.price_cents) || 0)} €
                      </div>
                    </div>
                  </OtherSellerRow>
                );
              })}
                </>
              )}
            </OtherSellersCard>
          ) : null}
        </RightCol>
      </ThreeCol>

      {(effectiveDescription || product.subtitle) && (
        <DescriptionSection
          id="description"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(effectiveDescription || product.subtitle || "") || "",
          }}
        />
      )}

      {(meta.hersteller || meta.hersteller_information || meta.verantwortliche_person_information) && (
        <DescriptionSection id="produktsicherheit" as="section" style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12, color: "#1f2937" }}>Produktsicherheitsinformationen</h3>
          {meta.hersteller && <p style={{ marginBottom: 8, color: "#4b5563", fontSize: "0.9375rem" }}><strong>Hersteller:</strong> {String(meta.hersteller)}</p>}
          {meta.hersteller_information && <p style={{ marginBottom: 8, color: "#4b5563", fontSize: "0.9375rem", whiteSpace: "pre-wrap" }}><strong>Hersteller-Informationen:</strong><br />{String(meta.hersteller_information)}</p>}
          {meta.verantwortliche_person_information && <p style={{ marginBottom: 0, color: "#4b5563", fontSize: "0.9375rem", whiteSpace: "pre-wrap" }}><strong>Verantwortliche Person (EU):</strong><br />{String(meta.verantwortliche_person_information)}</p>}
        </DescriptionSection>
      )}


      <ReviewsSection id="reviews">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <SectionTitle style={{ marginBottom: 0 }}>
            Kundenbewertungen {reviewCount > 0 && `(${reviewCount})`}
          </SectionTitle>
          <a
            href="https://www.trustpilot.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
            aria-label="Trustpilot"
          >
            <TrustpilotWordmark />
          </a>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
          Bewertungen stammen aus diesem Shop. Darstellung im Trustpilot-Stil. Vollständiges Profil siehe Widget unten.
        </p>
        <StarRating average={reviewAvg} count={reviewCount} />
        {productReviews.length > 0 ? (
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {productReviews.map((rv) => (
              <div
                key={rv.id}
                style={{
                  padding: "18px 20px",
                  background: "#fff",
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 1px 2px rgba(25,25,25,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#191919" }}>
                    {rv.customer_name || [rv.first_name, rv.last_name].filter(Boolean).join(" ") || "Verifizierter Kauf"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, letterSpacing: 1 }} aria-hidden>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} style={{ color: rv.rating >= n ? "#00B67A" : "#dcdce6" }}>★</span>
                      ))}
                    </span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {new Date(rv.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                </div>
                {rv.comment ? <p style={{ margin: 0, fontSize: 14, color: "#191919", lineHeight: 1.65 }}>{rv.comment}</p> : null}
              </div>
            ))}
          </div>
        ) : reviewCount === 0 ? (
          <p className="text-gray-500 text-sm mt-2">Noch keine Bewertungen vorhanden.</p>
        ) : null}
        <TrustpilotTrustBox
          locale={locale === "en" ? "en-US" : "de-DE"}
          style={{ marginTop: 28 }}
        />
      </ReviewsSection>

      {/* Full width below */}
      {alsoBought.length > 0 && (
        <div style={{ marginBottom: 48 }}>
          <Carousel
            contained={false}
            title="Kunden, die diesen Artikel gekauft haben, kauften auch"
            visibleCount={2}
            gap={16}
            showFade={false}
            navOnSides
          >
            {alsoBought.map((p) => (
              <ProductCard key={p.id} product={p} plainImage />
            ))}
          </Carousel>
        </div>
      )}

      {lightboxOpen && displayImages.length > 0 && (
        <Lightbox
          images={displayImages}
          currentIndex={selectedImage}
          onClose={() => setLightboxOpen(false)}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </Container>
  );
}
