const BASE = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "") : "";

export async function generateMetadata({ params }) {
  const { handle } = await params;
  if (!handle) return { title: "Andertal" };
  try {
    const res = await fetch(`${BASE}/store/products/${encodeURIComponent(handle)}`, { next: { revalidate: 60 } });
    const data = await res.json();
    const p = data?.product;
    if (!p) return { title: "Andertal" };
    const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
    const title = (meta.seo_meta_title || p.title || handle).trim() || "Andertal";
    const description = (meta.seo_meta_description || p.description || "").trim().replace(/<[^>]+>/g, "").slice(0, 160) || null;
    const image = Array.isArray(meta.media) && meta.media[0] ? (typeof meta.media[0] === "string" ? meta.media[0] : meta.media[0]?.url) : typeof meta.media === "string" ? meta.media : null;
    const imageUrl = image && (image.startsWith("http") || image.startsWith("//")) ? image : image ? `${BASE}${image.startsWith("/") ? "" : "/"}${image}` : null;
    return {
      title,
      description: description || undefined,
      openGraph: {
        title,
        description: description || undefined,
        ...(imageUrl && { images: [{ url: imageUrl, alt: title }] }),
      },
    };
  } catch {
    return { title: "Andertal" };
  }
}

export default function ProductLayout({ children }) {
  return children;
}
