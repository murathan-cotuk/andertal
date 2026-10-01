import { headers } from "next/headers";
import SeoJsonLd from "@/components/SeoJsonLd";
import {
  buildFaqJsonLd,
  buildPageMetadata,
  localizedCmsField,
  marketFromHeader,
  stripHtml,
} from "@/lib/seo";
import { catalogShopPathForSlug } from "@/lib/catalog-cms-page";

const BACKEND = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

export async function generateMetadata({ params }) {
  const { slug, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  if (!slug) return { title: "Andertal" };
  const dest = catalogShopPathForSlug(slug);
  try {
    const r = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(String(slug))}`, {
      cache: "no-store",
    });
    if (!r.ok) return { title: "Andertal" };
    const page = await r.json();
    const title = (
      localizedCmsField(page, "meta_title", locale) ||
      localizedCmsField(page, "title", locale) ||
      "Andertal"
    ).trim();
    const description =
      localizedCmsField(page, "meta_description", locale) ||
      stripHtml(localizedCmsField(page, "body", locale), 160) ||
      undefined;
    const kwRaw = (localizedCmsField(page, "meta_keywords", locale) || "").trim();
    const keywords = kwRaw
      ? kwRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return {
      ...buildPageMetadata({
        title,
        description,
        market,
        locale,
        path: dest ? dest.replace(/^\//, "") : `pages/${page.slug || slug}`,
      }),
      ...(keywords?.length ? { keywords } : {}),
    };
  } catch {
    return { title: "Andertal" };
  }
}

export default async function PagesSlugLayout({ children, params }) {
  const { slug, locale } = await params;

  let jsonLd = null;
  if (slug) {
    try {
      const pageRes = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(String(slug))}`, {
        cache: "no-store",
      });
      const page = pageRes.ok ? await pageRes.json().catch(() => null) : null;
      if (page?.id) {
        const landingRes = await fetch(`${BACKEND}/store/landing-page/${encodeURIComponent(page.id)}`, {
          cache: "no-store",
        });
        const landing = landingRes.ok ? await landingRes.json().catch(() => null) : null;
        jsonLd = buildFaqJsonLd(landing?.containers, locale);
      }
    } catch {
      /* no JSON-LD for this request — metadata above already has a safe fallback */
    }
  }

  return (
    <>
      <SeoJsonLd data={jsonLd} />
      {children}
    </>
  );
}
