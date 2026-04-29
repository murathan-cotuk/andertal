const BASE = typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "") : "";

export async function generateMetadata({ params }) {
  const { handle } = await params;
  if (!handle) return { title: "Andertal" };
  try {
    const res = await fetch(`${BASE}/store/collections?handle=${encodeURIComponent(handle)}`, { next: { revalidate: 60 } });
    const data = await res.json();
    const c = data?.collection;
    if (!c) return { title: "Andertal" };
    const title = (c.meta_title || c.display_title || c.title || handle).trim() || "Andertal";
    const description = (c.meta_description || "").trim() || null;
    return {
      title,
      description: description || undefined,
      openGraph: {
        title,
        description: description || undefined,
      },
    };
  } catch {
    return { title: "Andertal" };
  }
}

export default function CollectionLayout({ children }) {
  return children;
}
