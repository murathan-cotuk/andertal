"use client";

import React, { useState, useEffect, useContext } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import styled from "styled-components";
import { Button } from "@belucha/ui";
import { getMedusaClient } from "@/lib/medusa-client";
import { CartContext } from "@/context/CartContext";
import { formatPriceCents, getLocalizedProduct } from "@/lib/format";
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
  grid-template-columns: 1fr 1fr 340px;
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
  top: 24px;
  @media (max-width: 1024px) {
    position: static;
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
  color: #1f2937;
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
  margin-top: 4px;
`;

const VariantGroupLabel = styled.div`
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
`;

const VariantOptions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
`;

const VariantBox = styled.button`
  min-width: 44px;
  min-height: 44px;
  padding: 8px 14px;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${(p) => (p.$selected ? "#fff" : "#374151")};
  background: ${(p) => (p.$selected ? "#0ea5e9" : "#f3f4f6")};
  border: 2px solid ${(p) => (p.$selected ? "#0ea5e9" : "#e5e7eb")};
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    background: ${(p) => (p.$selected ? "#0c8ac7" : "#e5e7eb")};
    border-color: ${(p) => (p.$selected ? "#0c8ac7" : "#d1d5db")};
  }
`;

const Price = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  color: #0ea5e9;
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
  position: sticky;
  top: 24px;
  @media (max-width: 1024px) {
    grid-column: 1 / -1;
    position: static;
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

const DescriptionSection = styled.section`
  margin-bottom: 48px;
  color: #4b5563;
  line-height: 1.7;
  & p { margin-bottom: 1em; }
  & ul, & ol { margin-left: 1.5em; }
  & strong { font-weight: 600; }
  & a { color: #0ea5e9; text-decoration: underline; }
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

// Metadata keys to show as attributes (Eigenschaften) – exclude internal ones
const META_ATTR_KEYS = ["material", "farbe", "colour", "color", "size", "gewicht", "dimensions", "cart", "curt", "stoff", "typ"];

// Internal keys that must never be shown on the product page (no IDs, no SEO/backend fields)
const META_HIDDEN_KEYS = [
  "category_id", "admin_category_id", "collection_id", "collection_ids",
  "seller_id", "product_id", "media", "bullet_points", "uvp_cents", "rabattpreis_cents",
  "ean", "brand", "seller_name", "shop_name", "return_days", "return_cost", "return_kostenlos",
  "review_count", "review_avg", "sold_last_month", "metafields",
  "brand_id", "hersteller", "seo_keywords", "seo_meta_title", "seo_meta_description",
  "hersteller_information", "verantwortliche_person_information", "brand_name", "brand_logo",
];

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
  const cartState = useContext(CartContext);
  const addToCart = cartState?.addToCart ?? (async () => null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const client = getMedusaClient();
        const result = await client.getProduct(slug);
        setProduct(result.product);
      } catch (err) {
        console.error("Failed to fetch product:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchProduct();
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
    if (!product) return;
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
  const images = product.images?.length
    ? product.images
    : product.thumbnail
      ? [{ url: product.thumbnail, alt: product.title }]
      : Array.isArray(product.metadata?.media) && product.metadata.media.length
        ? product.metadata.media.map((url) => ({ url: typeof url === "string" ? url : url?.url, alt: product.title }))
        : [];
  const meta = product.metadata || {};
  const variants = product.variants || [];
  const variant = variants[selectedVariantIndex] || variants[0];
  const variantImageUrl = variant?.image_url || null;
  const mainImage = variantImageUrl || images[selectedImage]?.url || product.thumbnail || "https://via.placeholder.com/600";
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
  const metaRows = buildMetaRows(meta);
  // Verkäufer: reactive from API (product.metadata). Priority: seller_name → shop_name → fallback "Shop"
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
        {/* Left: Gallery */}
        <GalleryCol>
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

        {/* Center: Title, brand (from Brand module only), reviews, sold, price, bullets, meta */}
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
          <PriceBlock>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {uvpCents != null && uvpCents > 0 && (
                <span style={{ fontSize: "0.875rem", color: "#6b7280", textDecoration: "line-through" }}>
                  UVP {formatPriceCents(uvpCents)} €
                </span>
              )}
              {hasSale && (
                <span style={{ fontSize: "0.875rem", color: "#9ca3af", textDecoration: "line-through" }}>
                  {formatPriceCents(priceCents)} €
                </span>
              )}
              <Price>
                {formatPriceCents(displayCents)} €
                {discountPercent != null && discountPercent > 0 && (
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#dc2626", marginLeft: 8 }}>
                    –{discountPercent}%
                  </span>
                )}
              </Price>
              <span style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: 4 }}>
                Preise inkl. MwSt. zzgl. Versandkosten
              </span>
            </div>
          </PriceBlock>

          {(() => {
            const variantGroups = groupVariantsByTitle(variants);
            if (variantGroups.length === 0) return null;
            return (
              <VariantSection>
                {variantGroups.map((group) => (
                  <div key={group.title}>
                    <VariantGroupLabel>{group.title}</VariantGroupLabel>
                    <VariantOptions>
                      {group.options.map(({ variant: v, index: idx }) => (
                        <VariantBox
                          key={idx}
                          type="button"
                          $selected={selectedVariantIndex === idx}
                          onClick={() => setSelectedVariantIndex(idx)}
                        >
                          {v.value || v.title || `Option ${idx + 1}`}
                        </VariantBox>
                      ))}
                    </VariantOptions>
                  </div>
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
          {metaRows.length > 0 && (
            <MetaTable>
              <tbody>
                {metaRows.map(({ key, value }) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </MetaTable>
          )}
        </CenterCol>

        {/* Right: Shipping, address, stock, qty, buttons, seller, return */}
        <RightCol>
          <Card>
            <p className="text-sm text-gray-600 mb-2">Versand: Standardversand</p>
            <a href="/account" className="text-sm text-gray-600 mb-2 block hover:text-blue-600 hover:underline focus:outline-none focus:underline">Adresse: Bitte auswählen</a>
            <StockBadge className={inStock ? "in-stock" : "out-of-stock"}>
              {inStock ? "Auf Lager" : "Ausverkauft"}
            </StockBadge>
          </Card>
          <Card>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">Anzahl</label>
              <select
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm max-w-[100px]"
              >
                {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Button size="lg" fullWidth onClick={handleAddToCart} disabled={!inStock} style={{ marginBottom: 8 }}>
              In den Einkaufswagen
            </Button>
            <Button size="lg" variant="outline" fullWidth disabled={!inStock}>
              Jetzt kaufen
            </Button>
          </Card>
          <Card>
            <p className="text-sm font-medium text-gray-700">Verkäufer</p>
            <p className="text-sm text-gray-600" data-seller-source="metadata">{sellerName}</p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-gray-700">Rückgaberichtlinie</p>
            <p className="text-sm text-gray-600">{returnDays} Tage Rückgabe, {returnCost}</p>
          </Card>
        </RightCol>
      </ThreeCol>

      {/* Full width below */}
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
        <CarouselTitle>
          Kundenbewertungen {reviewCount > 0 && `(${reviewCount})`}
        </CarouselTitle>
        <StarRating average={reviewAvg} count={reviewCount} />
        <p className="text-gray-500 text-sm mt-2">Hier können später die vollständigen Bewertungen angezeigt werden.</p>
      </ReviewsSection>

      {alsoBought.length > 0 && (
        <CarouselSection>
          <CarouselTitle>Kunden, die diesen Artikel gekauft haben, kauften auch</CarouselTitle>
          <CarouselScroll>
            {alsoBought.map((p) => (
              <ProductCard key={p.id} product={p} compact />
            ))}
          </CarouselScroll>
        </CarouselSection>
      )}

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
