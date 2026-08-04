import { headers } from "next/headers";
import { buildPageMetadata, marketFromHeader, stripHtml } from "@/lib/seo";

const BASE = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/$/, "");

function siteDisplayName() {
  const explicit = (process.env.NEXT_PUBLIC_SITE_NAME || "").trim();
  if (explicit) return explicit;
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "https://andertal.de").trim();
  try {
    const host = new URL(raw).hostname.replace(/^www\./i, "");
    const seg = host.split(".")[0] || "";
    if (seg) return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
  } catch {
    /* ignore */
  }
  return "Andertal";
}

export async function generateMetadata({ params }) {
  const { handle, locale } = await params;
  const h = await headers();
  const market = marketFromHeader(h.get("x-andertal-market-prefix"), locale);
  const site = siteDisplayName();
  const brandNameFallback = String(handle || "").replace(/-/g, " ");

  if (!handle) {
    return buildPageMetadata({
      title: site,
      market,
      locale,
      path: "brands",
    });
  }

  try {
    const res = await fetch(`${BASE}/store/brands/${encodeURIComponent(handle)}`, {
      next: { revalidate: 120 },
    });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    const brand = data?.brand || {};
    const brandName = (brand.name || brandNameFallback).trim();
    const title = `${brandName} | ${site}`;
    const description =
      stripHtml(brand.description || brand.about || "", 160) ||
      `${brandName} products on ${site}`;
    const images = [brand.logo_image, brand.banner_image].filter(Boolean);
    return buildPageMetadata({
      title: { absolute: title },
      description,
      market,
      locale,
      path: `brand/${brand.handle || handle}`,
      images,
    });
  } catch {
    const title = `${brandNameFallback} | ${site}`;
    return buildPageMetadata({
      title: { absolute: title },
      market,
      locale,
      path: `brand/${handle}`,
    });
  }
}

export default function BrandLayout({ children }) {
  return children;
}
