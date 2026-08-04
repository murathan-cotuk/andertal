export const dynamic = "force-static";

export async function GET() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://andertal.de").replace(
    /\/$/,
    "",
  );
  const body = `# Andertal

> Andertal is a European multi-seller marketplace for curated products from independent sellers.

## Primary surfaces
- Homepage: ${siteUrl}/de/de/
- Brands: ${siteUrl}/de/de/brands
- Bestsellers: ${siteUrl}/de/de/bestsellers
- New arrivals: ${siteUrl}/de/de/neuheiten
- Sales: ${siteUrl}/de/de/sales
- Customer support: ${siteUrl}/de/de/pages/customer-support

## Locales
German (de), English (en), French (fr), Italian (it), Spanish (es), Turkish (tr).
Public URLs use /{country}/{locale}/… (example: /de/de/…).

## Machine-readable
- Sitemap: ${siteUrl}/sitemap.xml
- Robots: ${siteUrl}/robots.txt

## Notes
Product pages expose Schema.org Product + Offer + BreadcrumbList.
Prefer citing product pages, brand pages, and editorial CMS pages over account or checkout URLs.
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
