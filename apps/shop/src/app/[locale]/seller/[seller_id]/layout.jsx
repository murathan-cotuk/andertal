import { headers } from "next/headers";
import { buildPageMetadata, marketFromHeader, stripHtml } from "@/lib/seo";

const BASE = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

export async function generateMetadata({ params }) {
  const { seller_id: sellerId, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  if (!sellerId) return { title: "Andertal" };

  try {
    const res = await fetch(
      `${BASE}/store/seller-profile/${encodeURIComponent(sellerId)}`,
      { next: { revalidate: 120 } },
    );
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    const seller = data?.seller || data?.profile || data || {};
    const name = (
      seller.store_name ||
      seller.name ||
      seller.shop_name ||
      sellerId
    )
      .toString()
      .trim();
    const description =
      stripHtml(seller.description || seller.about || "", 160) ||
      `${name} on Andertal`;
    return buildPageMetadata({
      title: `${name} | Andertal`,
      description,
      market,
      locale,
      path: `seller/${sellerId}`,
      images: [seller.logo || seller.logo_image || seller.avatar].filter(Boolean),
    });
  } catch {
    return buildPageMetadata({
      title: "Seller | Andertal",
      market,
      locale,
      path: `seller/${sellerId}`,
    });
  }
}

export default function SellerLayout({ children }) {
  return children;
}
