const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");

function plainFromHtml(html, max) {
  const t = String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  if (!slug) return { title: "Andertal" };
  try {
    const r = await fetch(`${BACKEND}/store/pages/${encodeURIComponent(String(slug))}`, {
      next: { revalidate: 120 },
    });
    if (!r.ok) return { title: "Andertal" };
    const page = await r.json();
    const title = (page.meta_title || page.title || "Andertal").trim();
    const description =
      (page.meta_description && String(page.meta_description).trim()) || plainFromHtml(page.body, 160) || undefined;
    const kwRaw = (page.meta_keywords && String(page.meta_keywords).trim()) || "";
    const keywords = kwRaw
      ? kwRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return {
      title,
      description: description || undefined,
      ...(keywords && keywords.length ? { keywords } : {}),
    };
  } catch {
    return { title: "Andertal" };
  }
}

export default function PagesSlugLayout({ children }) {
  return children;
}
