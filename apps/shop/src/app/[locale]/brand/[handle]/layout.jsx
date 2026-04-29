const BASE =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    : "";

/** Site adı: NEXT_PUBLIC_SITE_NAME varsa o; yoksa NEXT_PUBLIC_SITE_URL hostundan; yoksa Andertal */
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
  const { handle } = await params;
  const site = siteDisplayName();
  if (!handle) {
    return { title: { absolute: site } };
  }
  try {
    const res = await fetch(`${BASE}/store/brands/${encodeURIComponent(handle)}`, {
      cache: "no-store",
    });
    const brandNameFallback = String(handle).replace(/-/g, " ");
    if (!res.ok) {
      const t = `${site} | ${brandNameFallback}`;
      return { title: { absolute: t }, openGraph: { title: t } };
    }
    const data = await res.json();
    const brandName = (data?.brand?.name || brandNameFallback).trim();
    const title = `${site} | ${brandName}`;
    return {
      title: { absolute: title },
      openGraph: { title },
    };
  } catch {
    const t = `${site} | ${String(handle).replace(/-/g, " ")}`;
    return { title: { absolute: t }, openGraph: { title: t } };
  }
}

export default function BrandLayout({ children }) {
  return children;
}
