import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { marketFromHeader, publicPath } from "@/lib/seo";

/** Legacy /category/[slug] → canonical /{market}/{locale}/{slug}. */
export default async function CategoryPage({ params }) {
  const { locale, slug } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  permanentRedirect(publicPath(market, locale, slug));
}
