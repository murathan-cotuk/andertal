import { permanentRedirect } from "next/navigation";

// Legacy product URL (/produkt/[handle]) — permanently redirects to the clean
// /[locale]/[handle] URL so old bookmarks/indexed links keep working without
// rendering duplicate content under two paths.
export default async function ProduktPage({ params }) {
  const { locale, handle } = await params;
  permanentRedirect(`/${locale}/${handle}`);
}
