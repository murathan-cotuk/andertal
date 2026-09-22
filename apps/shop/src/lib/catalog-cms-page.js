import { fetchStorePage, localizedCmsField, stripHtml } from "@/lib/seo";

/** CMS slugs that belong on a dedicated catalog hub, not /pages/{slug}. */
export const CATALOG_CMS_ALIASES = {
  brands: ["brands", "marken", "markalar"],
  bestsellers: ["bestsellers", "bestseller"],
  sales: ["sales", "sale", "angebote"],
  "new-in": ["new-in", "neuheiten", "new"],
};

const HUB_PATH = {
  brands: "/brands",
  bestsellers: "/bestsellers",
  sales: "/sales",
  "new-in": "/neuheiten",
};

export function catalogHubForSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  for (const [hub, aliases] of Object.entries(CATALOG_CMS_ALIASES)) {
    if (aliases.includes(s)) return hub;
  }
  return null;
}

export function catalogShopPathForSlug(slug) {
  const hub = catalogHubForSlug(slug);
  return hub ? HUB_PATH[hub] : null;
}

export function catalogAliasesForHub(hub) {
  return CATALOG_CMS_ALIASES[hub] || [hub];
}

export async function fetchCatalogCmsPage(hub, opts = {}) {
  const aliases = catalogAliasesForHub(hub);
  for (const slug of aliases) {
    const page = await fetchStorePage(slug, opts);
    if (page?.id) return page;
  }
  return null;
}

export function catalogCmsSeo(page, locale, fallbackTitle = "") {
  const title = (
    localizedCmsField(page, "meta_title", locale) ||
    localizedCmsField(page, "title", locale) ||
    fallbackTitle ||
    ""
  ).trim();
  const description =
    localizedCmsField(page, "meta_description", locale) ||
    stripHtml(localizedCmsField(page, "body", locale), 160) ||
    undefined;
  const kwRaw = (localizedCmsField(page, "meta_keywords", locale) || "").trim();
  const keywords = kwRaw
    ? kwRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  return { title, description, keywords };
}
