import { headers } from "next/headers";
import {
  buildPageMetadata,
  localizedCmsField,
  marketFromHeader,
  stripHtml,
} from "@/lib/seo";

const BACKEND = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

export async function generateMetadata({ params }) {
  const { slug, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  if (!slug) return { title: "Andertal" };
  try {
    const r = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(String(slug))}`, {
      next: { revalidate: 120 },
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
    const kwRaw = (page.meta_keywords && String(page.meta_keywords).trim()) || "";
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
        path: `pages/${page.slug || slug}`,
      }),
      ...(keywords?.length ? { keywords } : {}),
    };
  } catch {
    return { title: "Andertal" };
  }
}

export default function PagesSlugLayout({ children }) {
  return children;
}
