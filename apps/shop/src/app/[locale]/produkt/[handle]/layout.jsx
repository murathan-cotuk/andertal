import { headers } from "next/headers";
import {
  buildPageMetadata,
  fetchStoreProduct,
  marketFromHeader,
  productHandleForLocale,
  productImageUrls,
  stripHtml,
} from "@/lib/seo";

/** Legacy /produkt/[handle] — metadata kept for redirect response; page permanently redirects. */
export async function generateMetadata({ params }) {
  const { handle, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  if (!handle) return { title: "Andertal" };
  const product = await fetchStoreProduct(handle);
  if (!product) return { title: "Andertal" };
  const meta = product.metadata && typeof product.metadata === "object" ? product.metadata : {};
  const title = (meta.seo_meta_title || product.title || handle).trim() || "Andertal";
  const description =
    stripHtml(meta.seo_meta_description || product.description || "", 160) || undefined;
  return buildPageMetadata({
    title,
    description,
    market,
    locale,
    pathForLocale: (loc) => productHandleForLocale(product, loc),
    images: productImageUrls(product),
  });
}

export default function ProductLayout({ children }) {
  return children;
}
