"use client";

import React, { useState, useEffect, useRef, useContext } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import styled from "styled-components";
import { Button } from "@belucha/ui";
import { getMedusaClient } from "@/lib/medusa-client";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct } from "@/lib/format";
import { resolveImageUrl } from "@/lib/image-url";
import Breadcrumbs from "@/components/Breadcrumbs";
import { StarRating } from "@/components/ProductCard";
import { ProductCard } from "@/components/ProductCard";
import { Lightbox } from "@/components/Lightbox";

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px 48px;
`;

const ThreeCol = styled.div`
  display: grid;
  grid-template-columns: 1.65fr 1fr 290px;
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
  @media (max-width: 1024px) {
    position: static;
    top: auto;
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
  gap: 14px;
  margin-top: 4px;
`;

const VarGroup = styled.div``;

const VarLabel = styled.div`
  font-size: 0.6875rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
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
  gap: 6px;
`;

/* Text chip — sizes, materials, etc */
const VarChip = styled.button`
  padding: 5px 11px;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.35;
  border: 1.5px solid ${(p) => (p.$selected ? "#111" : "#e0e0e0")};
  background: ${(p) => (p.$selected ? "#111" : "#fff")};
  color: ${(p) => (p.$selected ? "#fff" : p.$oos ? "#bbb" : "#374151")};
  border-radius: 4px;
  cursor: ${(p) => (p.$oos ? "default" : "pointer")};
  text-decoration: ${(p) => (p.$oos && !p.$selected ? "line-through" : "none")};
  opacity: ${(p) => (p.$oos && !p.$selected ? 0.5 : 1)};
  transition: border-color 0.12s, background 0.12s, color 0.12s;
  &:hover:not(:disabled) {
    border-color: ${(p) => (p.$selected ? "#111" : "#999")};
    color: ${(p) => (p.$selected ? "#fff" : "#111")};
  }
`;

/* Swatch circle — color / image options */
const VarSwatch = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid ${(p) => (p.$selected ? "#111" : "transparent")};
  outline: ${(p) => (p.$selected ? "none" : "1.5px solid #e0e0e0")};
  outline-offset: 1px;
  padding: 2px;
  background: none;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  transition: border-color 0.12s, transform 0.12s;
  transform: ${(p) => (p.$selected ? "scale(1.12)" : "scale(1)")};
  opacity: ${(p) => (p.$oos && !p.$selected ? 0.4 : 1)};
  position: relative;
  &::after {
    content: "";
    display: ${(p) => (p.$oos && !p.$selected ? "block" : "none")};
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, transparent 45%, #999 45%, #999 55%, transparent 55%);
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

const Card = styled.div`
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
`;

const StockBadge = styled.span`
  display: inline-block;
  padding: 6px 12px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  &.in-stock { background: #d1fae5; color: #065f46; }
  &.out-of-stock { background: #fee2e2; color: #991b1b; }
`;

const CarouselSection = styled.section`
  margin-bottom: 48px;
`;

const CarouselTitle = styled.h2`
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 16px;
  color: #1f2937;
`;

const CarouselScroll = styled.div`
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 12px;
  scroll-snap-type: x mandatory;
  & > * { flex-shrink: 0; scroll-snap-align: start; }
`;

const HEADING_ORANGE = "#c2410c";

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
  "hersteller_information", "verantwortliche_person_information", "brand_name", "brand_logo",
];

/* Legacy: group flat variants by title for products without variation_groups */
function groupVariantsByTitle(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return [];
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
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);
  const [gallerySticky, setGallerySticky] = useState(true);
  const kundenSectionRef = useRef(null);

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
    if (typeof document === "undefined" || !product?.handle) return;
    const href = `${window.location.origin}/produkt/${product.handle}`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [product?.handle]);

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
    const el = kundenSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setGallerySticky(!entry.isIntersecting),
      { rootMargin: "-116px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product]);

  if (loading) return <Container>Laden…</Container>;
  if (error) return <Container>Fehler: {error}</Container>;
  if (!product) return <Container>Produkt nicht gefunden.</Container>;

  const { title: displayTitle, description: displayDescription } = getLocalizedProduct(product, locale);
  const rawImages = product.images?.length
    ? product.images
    : product.thumbnail
      ? [{ url: product.thumbnail, alt: product.title }]
      : Array.isArray(product.metadata?.media) && product.metadata.media.length
        ? product.metadata.media.map((url) => ({ url: typeof url === "string" ? url : url?.url, alt: product.title }))
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
  const variantImageUrl = variant?.image_url ? resolveImageUrl(variant.image_url) : null;
  const mainImage = variantImageUrl || images[selectedImage]?.url || (product.thumbnail ? resolveImageUrl(product.thumbnail) : null) || "https://via.placeholder.com/600";
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
  const inStock = inventory > 0;
  const maxQty = Math.min(inventory || 10, 10);
  const publishDate = meta.publish_date ? new Date(meta.publish_date) : null;
  const isComingSoon = publishDate && !isNaN(publishDate.getTime()) && publishDate.getTime() > Date.now();
  const metaRows = buildMetaRows(meta);
  const sellerName = product?.metadata?.seller_name || product?.metadata?.shop_name || "Shop";
  const returnDays = meta.return_days != null ? meta.return_days : 14;
  const returnCost = meta.return_cost === false || meta.return_kostenlos === true ? "kostenlos" : (meta.return_cost || "kostenlos");
  const titleDisplay = (displayTitle || "").slice(0, 120);

  const goPrev = () => setSelectedImage((i) => (i <= 0 ? images.length - 1 : i - 1));
  const goNext = () => setSelectedImage((i) => (i >= images.length - 1 ? 0 : i + 1));

  const handleAddToCart = async () => {
    const variantId = variant?.id;
    if (!variantId) return;
    const ok = await addToCart(variantId, quantity);
    if (ok) alert("In den Einkaufswagen gelegt");
    else alert("Hinzufügen fehlgeschlagen");
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
        <GalleryCol style={gallerySticky ? { position: "sticky", top: 116 } : { position: "relative" }}>
          <MainImageWrap onClick={() => images.length > 0 && setLightboxOpen(true)}>
            <MainImage src={mainImage} alt={displayTitle} />
          </MainImageWrap>
          {images.length > 1 && (
            <Thumbnails>
              {images.map((img, index) => (
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
          {images.length > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button type="button" onClick={goPrev} className="px-3 py-1 border rounded hover:bg-gray-100">‹</button>
              <button type="button" onClick={goNext} className="px-3 py-1 border rounded hover:bg-gray-100">›</button>
            </div>
          )}
        </GalleryCol>

        {/* Center: Title, brand, reviews, price, variants, bullets, meta */}
        <CenterCol>
          <Title>{titleDisplay}</Title>
          {(meta.brand_name || meta.brand) && (
            <Brand>
              {meta.brand_logo && <img src={meta.brand_logo} alt="" style={{ width: 20, height: 20, objectFit: "contain", marginRight: 6, verticalAlign: "middle" }} />}
              {meta.brand_name || meta.brand}
            </Brand>
          )}
          <a href="#reviews" className="inline-flex items-center gap-1 text-gray-600 hover:text-blue-600">
            <StarRating average={reviewAvg} count={reviewCount} />
          </a>
          {soldLastMonth != null && soldLastMonth > 0 && (
            <p className="text-gray-500 text-sm">
              {soldLastMonth} im letzten Monat verkauft
            </p>
          )}

          {/* ── Variant selector ── */}
          {useLinkedVariations && variationGroups?.length ? (
            <VariantSection>
              {variationGroups.map((group) => {
                const groupName = group.name || "";
                const selected = selectedOptions[groupName] ?? "";
                const isSwatch = (group.options || []).some(
                  (o) => (typeof o === "object" && o.swatch_image)
                );
                return (
                  <VarGroup key={groupName}>
                    <VarLabel>
                      {groupName}
                      {selected && <VarLabelSelected>: {selected}</VarLabelSelected>}
                    </VarLabel>
                    <VarRow>
                      {(group.options || []).map((opt, oIdx) => {
                        const valueStr = (typeof opt === "object" ? (opt.value ?? "") : String(opt ?? "")).toString().trim();
                        const swatchUrl = typeof opt === "object" && opt.swatch_image
                          ? resolveImageUrl(opt.swatch_image)
                          : null;
                        const isSelected = selected.trim().toLowerCase() === valueStr.toLowerCase();
                        const inStock = hasStockForOption(variants, variationGroups, groupName, valueStr, selectedOptions);
                        const handleClick = () => {
                          if (isSelected || !inStock) return;
                          setSelectedOptions((prev) => ({ ...prev, [groupName]: valueStr }));
                        };
                        if (isSwatch || swatchUrl) {
                          return (
                            <VarSwatch
                              key={oIdx}
                              type="button"
                              title={valueStr}
                              $selected={isSelected}
                              $oos={!inStock}
                              onClick={handleClick}
                              aria-label={valueStr}
                              aria-pressed={isSelected}
                            >
                              {swatchUrl ? (
                                <img src={swatchUrl} alt={valueStr} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }} />
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
                            {valueStr || `Option ${oIdx + 1}`}
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
          <Card>
            {/* Price at top of buybox */}
            <div style={{ marginBottom: 12 }}>
              {uvpCents != null && uvpCents > 0 && (
                <div style={{ fontSize: "0.8125rem", color: "#9ca3af", textDecoration: "line-through", marginBottom: 2 }}>
                  UVP {formatPriceCents(uvpCents)} €
                </div>
              )}
              {hasSale && (
                <div style={{ fontSize: "0.875rem", color: "#9ca3af", textDecoration: "line-through", marginBottom: 2 }}>
                  {formatPriceCents(priceCents)} €
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: "1.875rem", fontWeight: 700, color: "#16a34a" }}>
                  {formatPriceCents(displayCents)} €
                </span>
                {discountPercent != null && discountPercent > 0 && (
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#dc2626" }}>
                    –{discountPercent}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 2 }}>
                Preise inkl. MwSt. zzgl. Versandkosten
              </div>
            </div>
            <StockBadge className={inStock ? "in-stock" : "out-of-stock"}>
              {inStock ? "Auf Lager" : "Ausverkauft"}
            </StockBadge>
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Anzahl</label>
              <select
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                style={{ width: "100%", maxWidth: 100, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14 }}
              >
                {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Button size="lg" fullWidth onClick={handleAddToCart} disabled={!inStock || isComingSoon} style={{ marginTop: 16, marginBottom: 8, background: "#c2410c", color: "#fff", border: "none" }}>
              {isComingSoon ? "Bald verfügbar" : "In den Einkaufswagen"}
            </Button>
            <Button size="lg" variant="outline" fullWidth disabled={!inStock || isComingSoon} style={{ borderColor: "#c2410c", color: "#c2410c" }}>
              Jetzt kaufen
            </Button>
            {isComingSoon && publishDate && (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280", textAlign: "center" }}>
                Verfügbar ab {publishDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            )}
            <div style={{ marginTop: 16, borderTop: "1px solid #f3f4f6", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#374151", minWidth: 72, flexShrink: 0 }}>Versand</span>
                <span style={{ color: "#6b7280" }}>{meta.shipping_info || meta.versand || "Standardversand"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#374151", minWidth: 72, flexShrink: 0 }}>Rückgabe</span>
                <span style={{ color: "#6b7280" }}>{returnDays} Tage, {returnCost}</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "#374151", minWidth: 72, flexShrink: 0 }}>Verkäufer</span>
                <span style={{ color: "#6b7280" }} data-seller-source="metadata">{sellerName}</span>
              </div>
            </div>
          </Card>
          {isComingSoon && (
            <p style={{ margin: "8px 0 0", padding: "10px 14px", background: "#FFF2E6", color: "#c2410c", borderRadius: 8, fontSize: 14, fontWeight: 600, textAlign: "center" }}>
              Bald verfügbar
            </p>
          )}
        </RightCol>
      </ThreeCol>

      {/* Full width below */}
      {alsoBought.length > 0 && (
        <CarouselSection ref={kundenSectionRef}>
          <CarouselTitle>Kunden, die diesen Artikel gekauft haben, kauften auch</CarouselTitle>
          <CarouselScroll>
            {alsoBought.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </CarouselScroll>
        </CarouselSection>
      )}

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

      {recommended.length > 0 && (
        <CarouselSection>
          <CarouselTitle>Sizin için önerilenler</CarouselTitle>
          <CarouselScroll>
            {recommended.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </CarouselScroll>
        </CarouselSection>
      )}

      <ReviewsSection id="reviews">
        <CarouselTitle>
          Kundenbewertungen {reviewCount > 0 && `(${reviewCount})`}
        </CarouselTitle>
        <StarRating average={reviewAvg} count={reviewCount} />
        <p className="text-gray-500 text-sm mt-2">Hier können später die vollständigen Bewertungen angezeigt werden.</p>
      </ReviewsSection>

      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          currentIndex={selectedImage}
          onClose={() => setLightboxOpen(false)}
          onPrev={goPrev}
          onNext={goNext}
        />
      )}
    </Container>
  );
}
