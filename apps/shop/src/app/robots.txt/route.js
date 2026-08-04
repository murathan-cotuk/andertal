export const dynamic = "force-static";

export async function GET() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://andertal.de").replace(
    /\/$/,
    "",
  );
  const body = `User-agent: *
Allow: /

# Private / transactional surfaces
Disallow: /*/account
Disallow: /*/orders
Disallow: /*/addresses
Disallow: /*/payment-methods
Disallow: /*/checkout
Disallow: /*/cart
Disallow: /*/login
Disallow: /*/register
Disallow: /*/merkzettel
Disallow: /*/wishlist
Disallow: /*/nachrichten
Disallow: /*/bonus
Disallow: /*/invoices
Disallow: /*/reviews
Disallow: /api/

# ChatGPT search — allow discovery
User-agent: OAI-SearchBot
Allow: /

# Optional: block foundation-model training crawler while keeping search
User-agent: GPTBot
Disallow: /

# Google / Bing AI features use the same crawlers as Search
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
