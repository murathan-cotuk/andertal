import {
  SEO_DEFAULT_LOCALE,
  SEO_DEFAULT_MARKET,
  SEO_LOCALES,
  SITE_URL,
  productHandleForLocale,
  publicPath,
} from "@/lib/seo";

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
 * pathForLocale(locale) → path without market prefix, e.g. "bestsellers" or "foo-a-12345678"
 */
function urlEntry(pathForLocale, lastmod, changefreq = "weekly", priority = "0.7") {
  const defaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(SEO_DEFAULT_LOCALE)
      : pathForLocale;
  const loc = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, SEO_DEFAULT_LOCALE, defaultPath)}`;
  const alternates = SEO_LOCALES.map((locale) => {
    const path =
      typeof pathForLocale === "function" ? pathForLocale(locale) : pathForLocale;
    const href = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, locale, path)}`;
    return `    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(href)}"/>`;
  }).join("\n");
  const xDefaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(SEO_DEFAULT_LOCALE)
      : pathForLocale;
  const xDefault = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, SEO_DEFAULT_LOCALE, xDefaultPath)}`;
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefault)}"/>
  </url>`;
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
  // Backend loads the catalog in-memory and applies limit; use a high ceiling.
  const data = await fetchJSON("/store/products?limit=5000&status=published");
  return Array.isArray(data?.products) ? data.products : [];
}

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  const [products, collectionsData, pagesData, brandsData] = await Promise.all([
    fetchAllProducts(),
    fetchJSON("/store/collections"),
    fetchJSON("/store/pages?type=page&limit=200"),
    fetchJSON("/store/brands"),
  ]);

  const collections = collectionsData?.collections || [];
  const pages = pagesData?.pages || [];
  const brands = brandsData?.brands || [];

  const staticUrls = [
    urlEntry("", today, "daily", "1.0"),
    urlEntry("bestsellers", today, "daily", "0.8"),
    urlEntry("neuheiten", today, "daily", "0.8"),
    urlEntry("sales", today, "daily", "0.8"),
    urlEntry("brands", today, "weekly", "0.6"),
  ];

  const productUrls = products
    .filter((p) => p?.handle || p?.id)
    .map((p) =>
      urlEntry(
        (locale) => productHandleForLocale(p, locale),
        String(p.updated_at || today).split("T")[0],
        "weekly",
        "0.9",
      ),
    )
    .filter((entry) => entry.includes("<loc>"));

  const collectionUrls = collections
    .filter((c) => c?.handle)
    .map((c) => urlEntry(c.handle, today, "daily", "0.8"));

  const pageUrls = pages
    .filter((p) => p?.slug)
    .map((p) =>
      urlEntry(
        `pages/${p.slug}`,
        String(p.updated_at || today).split("T")[0],
        "monthly",
        "0.5",
      ),
    );

  const brandUrls = brands
    .filter((b) => b?.handle)
    .map((b) => urlEntry(`brand/${b.handle}`, today, "weekly", "0.6"));

  const allUrls = [
    ...staticUrls,
    ...collectionUrls,
    ...productUrls,
    ...pageUrls,
    ...brandUrls,
  ];

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
