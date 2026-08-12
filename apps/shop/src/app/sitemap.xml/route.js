import {
  SEO_DEFAULT_LOCALE,
  SEO_DEFAULT_MARKET,
  SEO_LOCALES,
  SITE_URL,
  productHandleForLocale,
  publicPath,
} from "@/lib/seo";
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
 */
function urlEntry(pathForLocale, lastmod, changefreq = "weekly", priority = "0.7", locales = SEO_LOCALES) {
  const list = Array.isArray(locales) && locales.length ? locales : SEO_LOCALES;
  const defaultLocale = list.includes(SEO_DEFAULT_LOCALE) ? SEO_DEFAULT_LOCALE : list[0];
  const defaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(defaultLocale)
      : pathForLocale;
  const loc = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, defaultLocale, defaultPath)}`;
  const alternates = list.map((locale) => {
    const path =
      typeof pathForLocale === "function" ? pathForLocale(locale) : pathForLocale;
    const href = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, locale, path)}`;
    return `    <xhtml:link rel="alternate" hreflang="${locale}" href="${escapeXml(href)}"/>`;
  }).join("\n");
  const xDefaultPath =
    typeof pathForLocale === "function"
      ? pathForLocale(defaultLocale)
      : pathForLocale;
  const xDefault = `${SITE_URL}${publicPath(SEO_DEFAULT_MARKET, defaultLocale, xDefaultPath)}`;
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

  const [products, collectionsData, pagesData, brandsData, enabledLocales] = await Promise.all([
    fetchAllProducts(),
    fetchJSON("/store/collections"),
    fetchJSON("/store/pages?type=page&limit=200"),
    fetchJSON("/store/brands"),
    fetchEnabledShopLocales(),
  ]);

  const locales = enabledLocales;
  const entry = (pathForLocale, lastmod, changefreq = "weekly", priority = "0.7") =>
    urlEntry(pathForLocale, lastmod, changefreq, priority, locales);

  const collections = collectionsData?.collections || [];
  const pages = pagesData?.pages || [];
  const brands = brandsData?.brands || [];

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
    .map((b) => entry(`brand/${b.handle}`, today, "weekly", "0.6"));

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
