import { getLocalizedProduct, getLocalizedCategory } from "@/lib/format";
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

/** hreflang that matches the one indexed URL for that language. English stays generic `en`. */
export function hreflangForLocale(locale) {
  const loc = normalizeLocale(locale);
  if (loc === "en") return "en";
  return `${loc}-${defaultMarketForLocale(loc).toUpperCase()}`;
}

export function languageAlternates(_market, pathForLocale) {
  const byLocale = Object.fromEntries(
    SEO_LOCALES.map((locale) => {
      const path =
        typeof pathForLocale === "function" ? pathForLocale(locale) : pathForLocale;
      return [hreflangForLocale(locale), absolutePublicUrl(defaultMarketForLocale(locale), locale, path)];
    }),
  );
  byLocale["x-default"] = absolutePublicUrl(
    DEFAULT_MARKET,
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

/** Shop <title> / meta description: explicit SEO fields, else product name + description. */
export function productSeoFallback(product, locale) {
  const meta = product?.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const loc = getLocalizedProduct(product, locale);
  const locKey = normalizeLocale(locale);
  const tr = meta.translations && typeof meta.translations === "object" ? meta.translations[locKey] : null;
  const title = String(
    (tr && tr.seo_title) || meta.seo_meta_title || loc.title || product?.title || ""
  ).trim();
  const description = stripHtml(
    (tr && tr.seo_description) || meta.seo_meta_description || loc.description || product?.description || "",
    160
  );
  return { title, description };
}

/** Shop <title> / meta description: explicit SEO fields, else category name + body. */
export function categorySeoFallback(category, locale) {
  const c = category || {};
  const m = c.metadata && typeof c.metadata === "object" ? c.metadata : {};
  const locKey = normalizeLocale(locale);
  const seoI18n = m.seo_i18n && typeof m.seo_i18n === "object" ? m.seo_i18n : {};
  const seoLoc = locKey && seoI18n[locKey] && typeof seoI18n[locKey] === "object" ? seoI18n[locKey] : null;
  const trLoc =
    locKey && m.translations && typeof m.translations === "object" && m.translations[locKey]
      ? m.translations[locKey]
      : null;
  const localized = getLocalizedCategory(c, locale) || {};
  const localizedName = localized.name || "";
  const localizedDesc = localized.description || "";
  const title = String(
    (seoLoc && (seoLoc.meta_title || seoLoc.title)) ||
      (trLoc && (trLoc.seo_title || trLoc.meta_title)) ||
      c.seo_title ||
      m.meta_title ||
      m.display_title ||
      localizedName ||
      c.name ||
      c.slug ||
      ""
  ).trim();
  const description = stripHtml(
    (seoLoc && (seoLoc.meta_description || seoLoc.description)) ||
      (trLoc && (trLoc.seo_description || trLoc.meta_description)) ||
      c.seo_description ||
      m.meta_description ||
      localizedDesc ||
      localized.long_content ||
      c.long_content ||
      m.richtext ||
      c.description ||
      "",
    160
  );
  return { title, description };
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
 * A URL's own market segment ("/us/de/produkt-x") vs. the one locale/market pair the
 * canonical tag and sitemap actually point at ("/de/de/produkt-x") — isValidMarket()
 * accepts any two-letter code so every one of ~676 country codes × 6 locales renders
 * the identical page with HTTP 200 today; this is the cheap, additive fix (noindex the
 * non-canonical copies) rather than restricting routing itself, which real bookmarks/
 * campaign links may depend on.
 */
export function isCanonicalMarket(market, locale) {
  return normalizeMarket(market) === defaultMarketForLocale(normalizeLocale(locale));
}

/**
 * Next.js Metadata object with canonical + hreflang + Open Graph.
 */
export function buildPageMetadata({
  title,
  description,
  keywords,
  market,
  locale,
  path,
  pathForLocale,
  images = [],
  type = "website",
  noIndex = false,
  noFollow = false,
}) {
  const loc = normalizeLocale(locale);
  const shouldNoIndex = noIndex || !isCanonicalMarket(market, loc);
  const canonicalPath =
    typeof pathForLocale === "function" ? pathForLocale(loc) : path || "";
  const canonical = absolutePublicUrl(defaultMarketForLocale(loc), loc, canonicalPath);
  const titleText =
    title && typeof title === "object" && title.absolute != null
      ? String(title.absolute)
      : String(title || "Andertal");
  const imageList = (Array.isArray(images) ? images : [])
    .map(absoluteImageUrl)
    .filter(Boolean)
    .slice(0, 6)
    .map((url) => ({ url, alt: titleText }));
  const kw =
    typeof keywords === "string"
      ? keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(keywords)
        ? keywords.map((s) => String(s || "").trim()).filter(Boolean)
        : [];

  return {
    title,
    description: description || undefined,
    keywords: kw.length ? kw : undefined,
    alternates: {
      canonical,
      languages: languageAlternates(market, pathForLocale || path || ""),
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
    ...(shouldNoIndex ? { robots: { index: false, follow: !noFollow } } : {}),
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

/** CollectionPage + BreadcrumbList for a category page — no ItemList (would need a live
 * product fetch just for markup; CategoryTemplate already renders the real product grid). */
export function buildCategoryJsonLd(category, { locale, market, canonicalUrl } = {}) {
  if (!category) return null;
  const loc = normalizeLocale(locale);
  const mkt = normalizeMarket(market);
  const localized = getLocalizedCategory(category, loc) || {};
  const name = localized.name || category.name || category.slug;
  const description = stripHtml(
    localized.description || category.description || category.long_content || "",
    500,
  );
  const ancestors = Array.isArray(category._ancestors) ? category._ancestors : [];

  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Andertal", item: absolutePublicUrl(mkt, loc) },
    ...ancestors.map((a, i) => ({
      "@type": "ListItem",
      position: i + 2,
      name: a?.name || a?.slug || "",
      item: absolutePublicUrl(mkt, loc, String(a?.slug || "").replace(/^\/+/, "")),
    })),
    { "@type": "ListItem", position: ancestors.length + 2, name, item: canonicalUrl },
  ];

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonicalUrl}#category`,
      url: canonicalUrl,
      name,
      ...(description ? { description } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbItems,
    },
  ];
}

/** CollectionPage + BreadcrumbList for a brand storefront page (/brand/[handle]) — same shape
 * as buildCategoryJsonLd, no dedicated "Brand page" schema.org type exists for this. */
export function buildBrandJsonLd(brand, { locale, market, canonicalUrl } = {}) {
  if (!brand) return null;
  const loc = normalizeLocale(locale);
  const mkt = normalizeMarket(market);
  const name = brand.name || brand.handle || "";
  if (!name) return null;
  const description = stripHtml(brand.description || brand.about || "", 500);
  const image = brand.logo_image || brand.banner_image || "";

  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${canonicalUrl}#brand`,
      url: canonicalUrl,
      name,
      ...(description ? { description } : {}),
      ...(image ? { image: absoluteImageUrl(image) } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Andertal", item: absolutePublicUrl(mkt, loc) },
        { "@type": "ListItem", position: 2, name: "Brands", item: absolutePublicUrl(mkt, loc, "brands") },
        { "@type": "ListItem", position: 3, name, item: canonicalUrl },
      ],
    },
  ];
}

/** WebPage + BreadcrumbList for a public seller storefront (/seller/[seller_id]) — review
 * data (review_avg/review_count) is real, sourced from admin_hub_seller_settings, same as the
 * seller-profile page itself; no AggregateRating without a nonzero review_count. */
export function buildSellerJsonLd(seller, { locale, market, canonicalUrl } = {}) {
  if (!seller) return null;
  const loc = normalizeLocale(locale);
  const mkt = normalizeMarket(market);
  const name = seller.store_name || "";
  if (!name) return null;
  const description = stripHtml(seller.shop_about || "", 500);
  const reviewCount = Number(seller.review_count);
  const reviewAvg = Number(seller.review_avg);

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${canonicalUrl}#seller`,
      url: canonicalUrl,
      name,
      ...(description ? { description } : {}),
      ...(Number.isFinite(reviewCount) && reviewCount > 0 && Number.isFinite(reviewAvg) && reviewAvg > 0
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: reviewAvg.toFixed(1),
              reviewCount,
              bestRating: "5",
              worstRating: "1",
            },
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Andertal", item: absolutePublicUrl(mkt, loc) },
        { "@type": "ListItem", position: 2, name, item: canonicalUrl },
      ],
    },
  ];
}

/** Same locale-fallback rule as LandingContainers.jsx's own `lt()` helper (duplicated, not
 * imported — that file is a large "use client" component tree, inappropriate to pull into a
 * server-only lib module just for one field accessor). */
function localizedContainerField(obj, field, locale) {
  const loc = normalizeLocale(locale);
  if (loc === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[loc]?.[field] ?? obj?.[field] ?? "";
}

/** FAQPage from a CMS page's `accordion` landing containers (Sellercentral's landing-page
 * editor — real seller/admin-authored Q&A, not generated). `support_faq`'s nested
 * category/items shape isn't covered here (unverified at the time this was written — only the
 * flat `accordion` container's `items[]` shape was confirmed against LandingContainers.jsx). */
export function buildFaqJsonLd(containers, locale) {
  const list = Array.isArray(containers) ? containers : [];
  const questions = [];
  for (const c of list) {
    if (!c || c.visible === false || c.type !== "accordion") continue;
    for (const item of Array.isArray(c.items) ? c.items : []) {
      const question = String(localizedContainerField(item, "question", locale) || "").trim();
      const answer = String(localizedContainerField(item, "answer", locale) || "").trim();
      if (!question || !answer) continue;
      questions.push({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      });
    }
  }
  if (!questions.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions,
  };
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
    const category = data?.category || data?.categories?.[0] || null;
    if (!category) return null;
    // Attach the response's own ancestor chain (already computed server-side from the
    // cached category tree) so callers can build a real BreadcrumbList without a second
    // full-tree fetch — the raw endpoint returns this as a sibling field, not nested.
    return { ...category, _ancestors: Array.isArray(data?.ancestors) ? data.ancestors : [] };
  } catch {
    return null;
  }
}

export async function fetchStorePage(slug, { revalidate = 0 } = {}) {
  const raw = String(slug || "").trim();
  if (!raw) return null;
  try {
    const res = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(raw)}`, {
      ...(revalidate ? { next: { revalidate } } : { cache: "no-store" }),
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
  const bag = page?.[`${field}_i18n`];
  const entry = bag && typeof bag === "object" ? bag[loc] : null;
  if (typeof entry === "string" && entry.trim()) return entry;
  if (entry && typeof entry === "object" && entry[field]) return entry[field];
  return page?.[field] || "";
}
