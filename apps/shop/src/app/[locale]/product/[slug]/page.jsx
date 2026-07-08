import { permanentRedirect } from "next/navigation";

// Legacy product URL (/product/[slug]) — permanently redirects to the clean
// /[locale]/[handle] URL. Nothing in this codebase generates links here anymore;
// this only exists to not break any externally indexed/bookmarked URLs.
export default async function ProductSlugPage({ params }) {
  const { locale, slug } = await params;
  permanentRedirect(`/${locale}/${slug}`);
}
