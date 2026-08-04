import { getLocalizedProduct } from "@/lib/format";
import {
  DEFAULT_MARKET,
  SHOP_LOCALES,
  defaultMarketForLocale,
  isValidLocale,
  isValidMarket,
} from "@/lib/shop-market";
import { storefrontProductHandle, baseHandleFromUrl } from "@/lib/product-url-handle";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://andertal.de"
).replace(/\/+$/, "");

export const SEO_LOCALES = SHOP_LOCALES;
export const SEO_DEFAULT_LOCALE = "de";
export const SEO_DEFAULT_MARKET = DEFAULT_MARKET;

const BACKEND = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

export function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase();
  return isValidLocale(value) ? value : SEO_DEFAULT_LOCALE;
}

export function normalizeMarket(market) {
  const value = String(market || "").toLowerCase();
  return isValidMarket(value) ? value : DEFAULT_MARKET;
}

export function marketFromHeader(value, locale = SEO_DEFAULT_LOCALE) {
  const first = String(value || "").split("/").filter(Boolean)[0];
  return isValidMarket(first) ? first.toLowerCase() : defaultMarketForLocale(locale);
}

export function publicPath(market, locale, path = "") {
  const suffix = String(path || "").replace(/^\/+/, "");
  const prefix = `/${normalizeMarket(market)}/${normalizeLocale(locale)}`;
  return suffix ? `${prefix}/${suffix}` : `${prefix}/`;
}

export function absolutePublicUrl(market, locale, path = "") {
  return `${SITE_URL}${publicPath(market, locale, path)}`;
}

export function languageAlternates(market, pathForLocale) {
  const resolvedMarket = normalizeMarket(market);
  const byLocale = Object.fromEntries(
    SEO_LOCALES.map((locale) => {
      const path =
        typeof pathForLocale === "function" ? pathForLocale(locale) : pathForLocale;
      return [locale, absolutePublicUrl(resolvedMarket, locale, path)];
    }),
  );
  byLocale["x-default"] = absolutePublicUrl(
    resolvedMarket,
    SEO_DEFAULT_LOCALE,
    typeof pathForLocale === "function"
      ? pathForLocale(SEO_DEFAULT_LOCALE)
      : pathForLocale,
  );
  return byLocale;
}

export function stripHtml(value, maxLength = 160) {
  const plain = String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!maxLength || plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function productHandleForLocale(product, locale) {
  return storefrontProductHandle(product, normalizeLocale(locale)) || product?.handle || "";
}

export function productBaseHandle(handle) {
  return baseHandleFromUrl(String(handle || ""));
}

export function productImageUrls(product) {
  const metadata = product?.metadata || {};
  const media = Array.isArray(product?.images)
    ? product.images
    : Array.isArray(metadata.media)
      ? metadata.media
      : [];
  const values = [
    ...media.map((item) => (typeof item === "string" ? item : item?.url)),
    product?.thumbnail,
    metadata.thumbnail,
  ];
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function firstVariant(product) {
  return Array.isArray(product?.variants) ? product.variants[0] : null;
}

export function productPriceCents(product) {
  const direct = Number(product?.price_cents);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  const variant = firstVariant(product);
  const amount = Number(variant?.prices?.[0]?.amount);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

export function productIsInStock(product) {
  const inventory = Number(product?.inventory_quantity);
  if (Number.isFinite(inventory)) return inventory > 0;
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.some((variant) => Number(variant?.inventory_quantity) > 0);
}

function normalizedGtin(product) {
  const raw =
    product?.ean ||
    product?.metadata?.ean ||
    product?.metadata?.canonical_ean ||
    firstVariant(product)?.ean ||
    firstVariant(product)?.barcode;
  const digits = String(raw || "").replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : "";
}

function absoluteImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("http") || value.startsWith("//")) return value;
  return `${BACKEND}${value.startsWith("/") ? "" : "/"}${value}`;
}

/**
 * Next.js Metadata object with canonical + hreflang + Open Graph.
 */
export function buildPageMetadata({
  title,
  description,
  market,
  locale,
  path,
  pathForLocale,
  images = [],
  type = "website",
  noIndex = false,
}) {
  const loc = normalizeLocale(locale);
  const mkt = normalizeMarket(market);
  const canonicalPath =
    typeof pathForLocale === "function" ? pathForLocale(loc) : path || "";
  const canonical = absolutePublicUrl(mkt, loc, canonicalPath);
  const titleText =
    title && typeof title === "object" && title.absolute != null
      ? String(title.absolute)
      : String(title || "Andertal");
  const imageList = (Array.isArray(images) ? images : [])
    .map(absoluteImageUrl)
    .filter(Boolean)
    .slice(0, 6)
    .map((url) => ({ url, alt: titleText }));

  return {
    title,
    description: description || undefined,
    alternates: {
      canonical,
      languages: languageAlternates(mkt, pathForLocale || path || ""),
    },
    openGraph: {
      type,
      url: canonical,
      title: titleText,
      description: description || undefined,
      siteName: "Andertal",
      locale: loc,
      ...(imageList.length ? { images: imageList } : {}),
    },
    twitter: {
      card: imageList.length ? "summary_large_image" : "summary",
      title: titleText,
      description: description || undefined,
      ...(imageList.length ? { images: imageList.map((i) => i.url) } : {}),
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Andertal",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  };
}

export function buildWebsiteJsonLd(market = SEO_DEFAULT_MARKET) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Andertal",
    url: absolutePublicUrl(market, SEO_DEFAULT_LOCALE),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absolutePublicUrl(market, SEO_DEFAULT_LOCALE, "search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildProductJsonLd(product, {
  locale,
  market,
  canonicalUrl,
  reviewCount,
  reviewAverage,
  priceCents: priceOverride,
  inStock: inStockOverride,
} = {}) {
  if (!product?.id) return null;
  const loc = normalizeLocale(locale);
  const mkt = normalizeMarket(market);
  const localized = getLocalizedProduct(product, loc);
  const metadata = product.metadata || {};
  const priceCents =
    priceOverride != null && Number.isFinite(Number(priceOverride))
      ? Math.round(Number(priceOverride))
      : productPriceCents(product);
  const gtin = normalizedGtin(product);
  const sku = firstVariant(product)?.sku || product.sku || product.id;
  const sellerName = metadata.seller_name || metadata.shop_name || metadata.store_name;
  const categorySlug = String(metadata.category_slug || "").replace(/^\/+/, "");
  const categoryName = metadata.category_name || categorySlug;
  const productName = localized.title || product.title || product.handle;
  const images = productImageUrls(product).map(absoluteImageUrl).filter(Boolean);
  const inStock =
    typeof inStockOverride === "boolean" ? inStockOverride : productIsInStock(product);
  const ratingCount = Number(reviewCount ?? metadata.review_count);
  const ratingAvg = Number(reviewAverage ?? metadata.review_avg ?? metadata.average_rating);
  const priceValidUntil = new Date();
  priceValidUntil.setFullYear(priceValidUntil.getFullYear() + 1);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    url: canonicalUrl,
    name: productName,
    description: stripHtml(localized.description || product.description, 5000),
    image: images.length ? images : undefined,
    sku,
    ...(gtin ? { [`gtin${gtin.length}`]: gtin } : {}),
    ...(metadata.brand_name || metadata.brand
      ? { brand: { "@type": "Brand", name: metadata.brand_name || metadata.brand } }
      : {}),
    ...(categoryName ? { category: categoryName } : {}),
    ...(priceCents != null
      ? {
          offers: {
            "@type": "Offer",
            url: canonicalUrl,
            priceCurrency: "EUR",
            price: (Math.max(0, priceCents) / 100).toFixed(2),
            priceValidUntil: priceValidUntil.toISOString().slice(0, 10),
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            ...(sellerName
              ? { seller: { "@type": "Organization", name: sellerName } }
              : { seller: { "@type": "Organization", name: "Andertal" } }),
          },
        }
      : {}),
    ...(Number.isFinite(ratingCount) &&
    ratingCount > 0 &&
    Number.isFinite(ratingAvg) &&
    ratingAvg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratingAvg.toFixed(1),
            reviewCount: Math.round(ratingCount),
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
  };

  const breadcrumbItems = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Andertal",
      item: absolutePublicUrl(mkt, loc),
    },
    ...(categorySlug
      ? [
          {
            "@type": "ListItem",
            position: 2,
            name: categoryName,
            item: absolutePublicUrl(mkt, loc, categorySlug),
          },
        ]
      : []),
    {
      "@type": "ListItem",
      position: categorySlug ? 3 : 2,
      name: productName,
      item: canonicalUrl,
    },
  ];

  return [
    productSchema,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    },
  ];
}

/** Server-side product fetch with -a-{8char} / legacy suffix fallback. */
export async function fetchStoreProduct(handle, { revalidate = 60 } = {}) {
  const raw = String(handle || "").trim();
  if (!raw) return null;
  const tryFetch = async (h) => {
    try {
      const res = await fetch(`${BACKEND}/store/products/${encodeURIComponent(h)}`, {
        next: { revalidate },
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return data?.product || null;
    } catch {
      return null;
    }
  };
  let product = await tryFetch(raw);
  if (!product) {
    const base = productBaseHandle(raw);
    if (base && base !== raw) product = await tryFetch(base);
  }
  return product;
}

export async function fetchStoreCollection(handle, { revalidate = 60 } = {}) {
  const raw = String(handle || "").trim();
  if (!raw) return null;
  try {
    const res = await fetch(
      `${BACKEND}/store/collections?handle=${encodeURIComponent(raw)}`,
      { next: { revalidate } },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.collection || null;
  } catch {
    return null;
  }
}

export async function fetchStoreCategoryBySlug(slug, { revalidate = 60 } = {}) {
  const raw = String(slug || "").trim();
  if (!raw) return null;
  try {
    const res = await fetch(
      `${BACKEND}/store/categories?slug=${encodeURIComponent(raw)}`,
      { next: { revalidate } },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.category || data?.categories?.[0] || null;
  } catch {
    return null;
  }
}

export async function fetchStorePage(slug, { revalidate = 120 } = {}) {
  const raw = String(slug || "").trim();
  if (!raw) return null;
  try {
    const res = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(raw)}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export function localizedCmsField(page, field, locale) {
  const loc = normalizeLocale(locale);
  if (!page) return "";
  if (loc === "de") return page?.[field] || "";
  return page?.[`${field}_i18n`]?.[loc]?.[field] || page?.[field] || "";
}
