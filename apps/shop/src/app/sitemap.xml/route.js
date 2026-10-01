import {
  SEO_DEFAULT_LOCALE,
  SEO_LOCALES,
  SITE_URL,
  hreflangForLocale,
  productHandleForLocale,
  publicPath,
} from "@/lib/seo";
import { defaultMarketForLocale } from "@/lib/shop-market";
import { fetchEnabledShopLocales } from "@/lib/enabled-shop-locales";

export const revalidate = 3600;

const BACKEND = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * pathForLocale(locale) ? path without market prefix, e.g. "bestsellers" or "foo-a-12345678"
 * `lastmod`: pass a real timestamp when one exists (product/brand/page updated_at). Pass
 * null/undefined when there is no real per-item date to report — the <lastmod> tag is then
 * omitted entirely rather than stamped with today's date, which would misrepresent content
 * as "just changed" when it didn't (categories have no updated_at column exposed today).
 */
function urlEntry(pathForLocale, lastmod, changefreq = "weekly", priority = "0.7", locales = SEO_LOCALES) {
  const list = Array.isArray(locales) && locales.length ? locales : SEO_LOCALES;
  const defaultLocale = list.includes(SEO_DEFAULT_LOCALE) ? SEO_DEFAULT_LOCALE : list[0];
  const defaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(defaultLocale)
      : pathForLocale;
  const loc = `${SITE_URL}${publicPath(defaultMarketForLocale(defaultLocale), defaultLocale, defaultPath)}`;
  const alternates = list.map((locale) => {
    const path =
      typeof pathForLocale === "function" ? pathForLocale(locale) : pathForLocale;
    const href = `${SITE_URL}${publicPath(defaultMarketForLocale(locale), locale, path)}`;
    return `    <xhtml:link rel="alternate" hreflang="${hreflangForLocale(locale)}" href="${escapeXml(href)}"/>`;
  }).join("\n");
  const xDefaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(defaultLocale)
      : pathForLocale;
  const xDefault = `${SITE_URL}${publicPath(defaultMarketForLocale(defaultLocale), defaultLocale, xDefaultPath)}`;
  const lastmodStr = lastmod ? String(lastmod).split("T")[0] : "";
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
${lastmodStr ? `    <lastmod>${escapeXml(lastmodStr)}</lastmod>\n` : ""}    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefault)}"/>
  </url>`;
}

/** Depth-first flatten of the /store/categories tree (same shape LandingContainers/menus
 * consume) into the nodes we need for the sitemap — reuses the already-computed `has_products`
 * flag (store-category-tree.js, annotateCategoryTreeHasProducts) instead of re-deriving it. */
function flattenVisibleCategoriesWithProducts(nodes, out = []) {
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n) continue;
    if (n.is_visible !== false && n.has_products !== false && (n.slug || n.handle)) {
      out.push(n);
    }
    if (Array.isArray(n.children) && n.children.length) {
      flattenVisibleCategoriesWithProducts(n.children, out);
    }
  }
  return out;
}

async function fetchJSON(path) {
  try {
    const r = await fetch(`${BACKEND}${path}`, { next: { revalidate: 3600 } });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

async function fetchAllProducts() {
  const pageSize = 200
  const maxPages = 750 // hard ceiling ~150k rows for sitemap generation
  const products = []
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize
    const data = await fetchJSON(
      `/store/products?limit=${pageSize}&offset=${offset}&status=published`
    )
    const batch = Array.isArray(data?.products) ? data.products : []
    if (!batch.length) break
    products.push(...batch)
    if (batch.length < pageSize) break
  }
  return products
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const [products, collectionsData, pagesData, brandsData, categoryTreeData, sellersData, enabledLocales] = await Promise.all([
    fetchAllProducts(),
    fetchJSON("/store/collections"),
    fetchJSON("/store/pages?type=page&limit=200"),
    fetchJSON("/store/brands"),
    fetchJSON("/store/categories"),
    fetchJSON("/store/sellers"),
    fetchEnabledShopLocales(),
  ]);

  const locales = enabledLocales;
  const entry = (pathForLocale, lastmod, changefreq = "weekly", priority = "0.7") =>
    urlEntry(pathForLocale, lastmod, changefreq, priority, locales);

  const collections = collectionsData?.collections || [];
  const pages = pagesData?.pages || [];
  const brands = brandsData?.brands || [];
  const categories = flattenVisibleCategoriesWithProducts(categoryTreeData?.tree || categoryTreeData?.categories || []);
  const sellers = sellersData?.sellers || [];

  const staticUrls = [
    entry("", today, "daily", "1.0"),
    entry("bestsellers", today, "daily", "0.8"),
    entry("neuheiten", today, "daily", "0.8"),
    entry("sales", today, "daily", "0.8"),
    entry("brands", today, "weekly", "0.6"),
  ];

  const productUrls = products
    .filter((p) => p?.handle || p?.id)
    .map((p) =>
      entry(
        (locale) => productHandleForLocale(p, locale),
        String(p.updated_at || today).split("T")[0],
        "weekly",
        "0.9",
      ),
    )
    .filter((entryXml) => entryXml.includes("<loc>"));

  const collectionUrls = collections
    .filter((c) => c?.handle)
    .map((c) => entry(c.handle, today, "daily", "0.8"));

  const pageUrls = pages
    .filter((p) => p?.slug)
    .map((p) =>
      entry(
        `pages/${p.slug}`,
        String(p.updated_at || today).split("T")[0],
        "monthly",
        "0.5",
      ),
    );

  const brandUrls = brands
    .filter((b) => b?.handle)
    .map((b) => entry(`brand/${b.handle}`, b.updated_at || null, "weekly", "0.6"));

  // Categories: only ones actually reachable/sellable (is_visible, has_products — the same
  // signal store-category-tree.js already uses to prune empty branches from the storefront
  // menu) so ~24k categories doesn't mean ~24k thin/empty indexable URLs. No lastmod — the
  // tree doesn't carry a real per-category updated_at today (see docs/seo-geo-architecture.md).
  const categoryUrls = categories
    .filter((c) => c?.slug)
    .map((c) => entry(String(c.slug).replace(/^\/+/, ""), null, "weekly", "0.6"));

  const sellerUrls = sellers
    .filter((s) => s?.seller_id)
    .map((s) => entry(`seller/${s.seller_id}`, s.updated_at || null, "weekly", "0.5"));

  const allUrls = [
    ...staticUrls,
    ...collectionUrls,
    ...productUrls,
    ...categoryUrls,
    ...pageUrls,
    ...brandUrls,
    ...sellerUrls,
  ];

  // Sitemap protocol caps a single file at 50,000 URLs. This route is still a single
  // <urlset> (see docs/seo-geo-architecture.md for the sitemap-index migration plan) —
  // surface it loudly in server logs well before the hard limit instead of silently
  // producing a spec-invalid file.
  if (allUrls.length > 45000) {
    console.warn(
      `[sitemap.xml] ${allUrls.length} URLs — approaching/over the 50,000-per-file sitemap limit. ` +
      "Split into a sitemap index (per docs/seo-geo-architecture.md) before this grows further.",
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
