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
import { localizedProductMediaList, variantImageUrlForLocale } from "@/lib/product-locale-media";
import { optionDisplayLabel, optionCanonicalValue, variationGroupDisplayName } from "@/lib/variation-labels";
import Breadcrumbs from "@/components/Breadcrumbs";
import Carousel from "@/components/Carousel";
import { StarRating } from "@/components/ProductCard";
import { ProductCard } from "@/components/ProductCard";
import { Lightbox } from "@/components/Lightbox";
import ToCartButton from "@/components/ui/To Cart Button";
import ProductWishlistHeart from "@/components/ProductWishlistHeart";

const Container = styled.div`
  max-width: 100%;
  padding: 32px 24px 64px;
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
`;

const MainImageWrap = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  background: #f3f4f6;
  cursor: pointer;
`;

const MainImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  object-fit: cover;
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
`;

const Title = styled.h1`
  font-size: clamp(1.25rem, 2.5vw, 1.75rem);
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
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

const HEADING_ORANGE = "#c2410c";

const SectionTitle = styled.h2`
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1f2937;
`;

const DescriptionSection = styled.section`
  margin-bottom: 48px;
  color: #4b5563;
  line-height: 1.7;
  font-size: 1rem;

  & h1 { font-size: 1.75rem; font-weight: 700; margin: 1.25em 0 0.5em; color: ${HEADING_ORANGE}; line-height: 1.3; }
  & h2 { font-size: 1.5rem; font-weight: 700; margin: 1.25em 0 0.5em; color: ${HEADING_ORANGE}; line-height: 1.3; }
  & h3 { font-size: 1.25rem; font-weight: 600; margin: 1em 0 0.4em; color: ${HEADING_ORANGE}; line-height: 1.35; }
  & h4, & h5, & h6 { font-size: 1.125rem; font-weight: 600; margin: 0.85em 0 0.35em; color: ${HEADING_ORANGE}; line-height: 1.4; }
  & h1:first-child, & h2:first-child, & h3:first-child { margin-top: 0; }
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
    .replace(/\s*on\w+=["'][^"']*["']/gi, "");
}

const META_ATTR_KEYS = ["material", "farbe", "colour", "color", "size", "gewicht", "dimensions", "cart", "curt", "stoff", "typ"];

const META_HIDDEN_KEYS = [
  "category_id", "admin_category_id", "collection_id", "collection_ids",
  "seller_id", "product_id", "media", "bullet_points", "uvp_cents", "rabattpreis_cents",
  "ean", "brand", "seller_name", "shop_name", "return_days", "return_cost", "return_kostenlos",
  "review_count", "review_avg", "sold_last_month", "metafields", "publish_date",
  "brand_id", "hersteller", "seo_keywords", "seo_meta_title", "seo_meta_description",
  "hersteller_information", "verantwortliche_person_information", "brand_name", "brand_logo", "brand_handle",
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

export default function ProductTemplate() {
  const params = useParams();
  const locale = useLocale();
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
  const cartNoticeTimersRef = useRef({ hide: null, clear: null });
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);
  const openCartSidebar = cartState?.openCartSidebar ?? (() => {});

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
      if (!slug) return;
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/store-products/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (res.status === 404 || !data?.product) {
          setProduct(null);
          setError(res.status === 404 ? "Produkt nicht gefunden." : "Produkt konnte nicht geladen werden.");
          return;
        }
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


  if (loading) return <Container>Laden…</Container>;
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
  const rawVariants = product.variants || [];
  const variationGroups = product.variation_groups || null;
  const variants = normalizeVariants(rawVariants, variationGroups);
  const useLinkedVariations = Array.isArray(variationGroups) && variationGroups.length > 0 &&
    variants.some((v) => Array.isArray(v.option_values) && v.option_values.length === variationGroups.length);
  const effectiveVariantIndex = useLinkedVariations
    ? findVariantIndexByMap(variants, variationGroups, selectedOptions)
    : selectedVariantIndex;
  const variant = variants[effectiveVariantIndex] ?? variants[selectedVariantIndex] ?? variants[0];
  const variantImageUrl = (() => {
    const raw = variant ? variantImageUrlForLocale(variant, locale) : "";
    return raw ? resolveImageUrl(raw) : null;
  })();
  // When variant has its own image, gallery shows only that image; otherwise show product images
  const displayImages = variantImageUrl
    ? [{ url: variantImageUrl, alt: variant?.title || displayTitle }]
    : images;
  const mainImage = displayImages[selectedImage]?.url || variantImageUrl || (product.thumbnail ? resolveImageUrl(product.thumbnail) : null) || "https://via.placeholder.com/600";
  const priceCents =
    variant?.prices?.[0]?.amount != null
      ? Number(variant.prices[0].amount)
      : product.price != null
        ? Math.round(Number(product.price) * 100)
        : 0;
  const uvpCents = variant?.compare_at_price_cents != null ? Number(variant.compare_at_price_cents) : (meta.uvp_cents != null ? Number(meta.uvp_cents) : null);
  const saleCents = meta.rabattpreis_cents != null ? Number(meta.rabattpreis_cents) : null;
  const hasSale = saleCents != null && saleCents > 0 && priceCents > 0;
  const displayCents = hasSale ? saleCents : priceCents;
  const discountPercent = hasSale && priceCents > 0 && saleCents < priceCents
    ? Math.round(((priceCents - saleCents) / priceCents) * 100)
    : null;
  const bulletPoints = Array.isArray(meta.bullet_points) ? meta.bullet_points.filter(Boolean) : [];
  const reviewCount = meta.review_count != null ? Number(meta.review_count) : 0;
  const reviewAvg = meta.review_avg != null ? Number(meta.review_avg) : 0;
  const soldLastMonth = meta.sold_last_month != null ? Number(meta.sold_last_month) : null;
  const inventory = variant?.inventory_quantity ?? product.variants?.[0]?.inventory_quantity ?? 0;
  const inventorySafe =
    variant?.inventory_quantity ??
    variant?.inventory ??
    product.variants?.[0]?.inventory_quantity ??
    product.variants?.[0]?.inventory ??
    0;
  const inventorySafeNum = Number(inventorySafe);
  const inStock = inventorySafeNum > 0;
  const maxQty = Math.min(inventorySafeNum || 10, 10);
  const publishDate = meta.publish_date ? new Date(meta.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const metaRows = buildMetaRows(meta);
  const storeName =
    (sellerStoreName || "").trim() ||
    product?.metadata?.shop_name ||
    product?.metadata?.store_name ||
    product?.metadata?.seller_name ||
    "Shop";
  const returnDays = meta.return_days != null ? meta.return_days : 14;
  const returnCost = meta.return_cost === false || meta.return_kostenlos === true ? "kostenlos" : (meta.return_cost || "kostenlos");
  const titleDisplay = (displayTitle || "").slice(0, 120);

  const goPrev = () => setSelectedImage((i) => (i <= 0 ? displayImages.length - 1 : i - 1));
  const goNext = () => setSelectedImage((i) => (i >= displayImages.length - 1 ? 0 : i + 1));

  const handleAddToCart = async () => {
    const variantId = variant?.id;
    if (!variantId) return;
    // Avoid timer-race when user clicks quickly multiple times
    if (cartNoticeTimersRef.current.hide) window.clearTimeout(cartNoticeTimersRef.current.hide);
    if (cartNoticeTimersRef.current.clear) window.clearTimeout(cartNoticeTimersRef.current.clear);

    const successText =
      locale === "tr" ? "Sepete eklendi" : locale === "de" ? "Zum Warenkorb hinzugefügt" : "Added to cart";
    const errorText =
      locale === "tr" ? "Sepete eklenemedi" : locale === "de" ? "Hinzufügen fehlgeschlagen" : "Add to cart failed";

    try {
      const ok = await addToCart(variantId, quantity);
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

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    ...(product.collection ? [{ label: product.collection.title, href: `/${product.collection.handle}` }] : []),
    { label: displayTitle, href: null },
  ];


  return (
    <Container>
      <Breadcrumbs items={breadcrumbItems} />

      <ThreeCol>
        {/* Left: Gallery — sticky until Kunden section */}
        <GalleryCol>
          <div style={{ position: "relative", width: "100%" }}>
            <MainImageWrap onClick={() => displayImages.length > 0 && setLightboxOpen(true)}>
              <MainImage src={mainImage} alt={displayTitle} />
            </MainImageWrap>
            {product?.id && (
              <div
                style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <div style={{ position: "relative" }}>
                  <ProductWishlistHeart productId={product.id} positionAbsolute={false} />
                </div>
              </div>
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
        </GalleryCol>

        {/* Center: Title, brand, reviews, price, variants, bullets, meta */}
        <CenterCol>
          <Title>{titleDisplay}</Title>
          {/* ── Review row — always visible ── */}
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

          {/* ── Seller / Brand row ── */}
          {(meta.brand_name || meta.brand) && (
            <BrandRow
              brandName={meta.brand_name || meta.brand || ""}
              brandHandle={meta.brand_handle || null}
              brandLogo={meta.brand_logo ? resolveImageUrl(meta.brand_logo) : null}
              reviewCount={reviewCount}
            />
          )}
          {soldLastMonth != null && soldLastMonth > 0 && (
            <p className="text-gray-500 text-sm">
              {soldLastMonth} im letzten Monat verkauft
            </p>
          )}

          {/* ── Variant selector ── */}
          {useLinkedVariations && variationGroups?.length ? (
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
                        const inStock = hasStockForOption(variants, variationGroups, groupName, valueStr, selectedOptions);
                        const handleClick = () => {
                          if (isSelected || !inStock) return;
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
                              $oos={!inStock}
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
                            $oos={!inStock}
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
          })()}

          {bulletPoints.length > 0 && (
            <BulletList>
              {bulletPoints.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </BulletList>
          )}
          {(metaRows.length > 0 || (Array.isArray(meta.metafields) && meta.metafields.some((f) => f?.key && f?.value))) && (
            <MetaTable>
              <tbody>
                {metaRows.map(({ key, value }) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
                {Array.isArray(meta.metafields) && meta.metafields.filter((f) => f?.key && f?.value).map((f, i) => (
                  <tr key={`mf-${i}`}>
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
              <PriceTop>
                <PriceStack>
                  <PriceMainRow>
                    <PriceMain>{formatPriceCents(displayCents)} €</PriceMain>
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
                </PriceStack>
              </PriceTop>

              <StockRow>
                <QtyWrap>
                  <QtyLabel>Menge</QtyLabel>
                  <QtySelect
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    disabled={!inStock || isComingSoon}
                  >
                    {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </QtySelect>
                </QtyWrap>
              </StockRow>

              <CtaStack>
                {cartNotice.text ? (
                  <CartNotice $visible={cartNotice.visible}>{cartNotice.text}</CartNotice>
                ) : null}
                <ToCartButton
                  onClick={handleAddToCart}
                  disabled={!inStock || isComingSoon}
                  style={{ width: "100%" }}
                >
                  {isComingSoon ? "Bald verfügbar" : !inStock ? "Ausverkauft" : "In den Einkaufswagen"}
                </ToCartButton>
                {isComingSoon && publishDate && (
                  <p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: "8px 0 0", fontWeight: 400 }}>
                    {locale === "tr" ? "Pek yakında" : "Bald verfügbar"}
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
                  { label: "Versand", value: meta.shipping_info || meta.versand || "Standardversand" },
                  { label: "Rückgabe", value: `${returnDays} Tage, ${returnCost}` },
                  { label: "Verkäufer", value: storeName },
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
        </RightCol>
      </ThreeCol>

      {(displayDescription || product.subtitle) && (
        <DescriptionSection
          id="description"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(displayDescription || product.subtitle || "") || "",
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
        <SectionTitle>
          Kundenbewertungen {reviewCount > 0 && `(${reviewCount})`}
        </SectionTitle>
        <StarRating average={reviewAvg} count={reviewCount} />
        <p className="text-gray-500 text-sm mt-2">Hier können später die vollständigen Bewertungen angezeigt werden.</p>
      </ReviewsSection>

      {/* Full width below */}
      {alsoBought.length > 0 && (
        <div style={{ marginBottom: 48 }}>
          <Carousel
            contained={false}
            title="Kunden, die diesen Artikel gekauft haben, kauften auch"
            itemWidth={260}
          >
            {alsoBought.map((p) => (
              <ProductCard key={p.id} product={p} compact />
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
