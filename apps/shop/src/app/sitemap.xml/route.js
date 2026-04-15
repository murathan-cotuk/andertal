export const dynamic = "force-dynamic";
export const revalidate = 3600; // regenerate every hour

const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://belucha.de").replace(/\/$/, "");
const LOCALES = ["de", "en", "fr", "it", "es", "tr"];
const DEFAULT_LOCALE = "de";

function url(path, lastmod, changefreq = "weekly", priority = "0.7") {
  const loc = `${SITE_URL}/${DEFAULT_LOCALE}${path}`;
  // hreflang alternates
  const alternates = LOCALES.map(
    (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${l}${path}"/>`
  ).join("\n");
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}
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

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  // Fetch products, collections, and CMS pages in parallel
  const [productsData, collectionsData, pagesData] = await Promise.all([
    fetchJSON("/store/products?limit=500&status=published"),
    fetchJSON("/store/collections"),
    fetchJSON("/store/pages?type=page&limit=200"),
  ]);

  const products = productsData?.products || [];
  const collections = collectionsData?.collections || [];
  const pages = pagesData?.pages || [];

  const staticUrls = [
    url("", today, "daily", "1.0"),
    url("/bestsellers", today, "daily", "0.8"),
    url("/recommended", today, "weekly", "0.7"),
    url("/brands", today, "weekly", "0.6"),
    url("/search", today, "monthly", "0.5"),
  ];

  const productUrls = products
    .filter((p) => p?.handle)
    .map((p) => url(`/produkt/${p.handle}`, (p.updated_at || today).split("T")[0], "weekly", "0.9"));

  const collectionUrls = collections
    .filter((c) => c?.handle)
    .map((c) => url(`/${c.handle}`, today, "daily", "0.8"));

  const pageUrls = pages
    .filter((p) => p?.slug)
    .map((p) => url(`/pages/${p.slug}`, (p.updated_at || today).split("T")[0], "monthly", "0.5"));

  const allUrls = [...staticUrls, ...collectionUrls, ...productUrls, ...pageUrls];

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
