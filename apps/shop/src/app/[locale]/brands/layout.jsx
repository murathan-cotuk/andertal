import { headers } from "next/headers";
import {
  buildPageMetadata,
  marketFromHeader,
} from "@/lib/seo";
import { catalogCmsSeo, fetchCatalogCmsPage } from "@/lib/catalog-cms-page";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  const page = await fetchCatalogCmsPage("brands", { revalidate: 0 });
  const fallback = locale === "tr" ? "Markalar" : locale === "de" ? "Marken" : "Brands";
  const seo = catalogCmsSeo(page, locale, fallback);
  const title = (seo.title || fallback).trim() || "Andertal";
  return {
    ...buildPageMetadata({
      title,
      description: seo.description,
      market,
      locale,
      path: "brands",
    }),
    ...(seo.keywords?.length ? { keywords: seo.keywords } : {}),
  };
}

export default function BrandsLayout({ children }) {
  return children;
}
