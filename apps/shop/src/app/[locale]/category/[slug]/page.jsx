import { permanentRedirect } from "next/navigation";

/** Legacy /category/[slug] → canonical /[slug] (same CategoryTemplate). */
export default async function CategoryPage({ params }) {
  const { locale, slug } = await params;
  permanentRedirect(`/${locale}/${slug}`);
}
