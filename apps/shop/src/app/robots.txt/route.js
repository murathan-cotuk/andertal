export const dynamic = "force-static";

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://belucha.de";
  const body = `User-agent: *
Allow: /

# Block admin/account pages from indexing
Disallow: /*/account
Disallow: /*/orders
Disallow: /*/addresses
Disallow: /*/payment-methods
Disallow: /*/checkout
Disallow: /*/cart
Disallow: /*/login
Disallow: /*/register
Disallow: /*/merkzettel
Disallow: /*/nachrichten
Disallow: /*/bonus
Disallow: /*/invoices
Disallow: /*/reviews
Disallow: /api/

Sitemap: ${siteUrl}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
