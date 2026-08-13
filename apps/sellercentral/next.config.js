const path = require('path');
const createNextIntlPlugin = require("next-intl/plugin");
const { withSentryConfig } = require("@sentry/nextjs");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

const monorepoRoot = path.join(__dirname, "../..");

// Extra dev-only backend origins for CSP `connect-src` (S1.5).
// Set SC_ALLOWED_DEV_BACKEND_HOSTS in apps/sellercentral/.env.local with a
// comma-separated list like:
//   SC_ALLOWED_DEV_BACKEND_HOSTS=http://localhost:9000,http://192.168.x.x:9000
// In production this list is ignored — production CSP only allows
// 'self' https: wss:.
const isProduction = process.env.NODE_ENV === "production";
const devBackendHosts = isProduction
  ? []
  : (process.env.SC_ALLOWED_DEV_BACKEND_HOSTS || "http://localhost:9000")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  experimental: {
    // Allow larger multipart/form-data payloads for Excel import route handlers.
    proxyClientMaxBodySize: 50 * 1024 * 1024, // 50MB
    // Keep in sync for potential server action usage.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  transpilePackages: ["@andertal/ui", "@andertal/lib"],
  compiler: {
    styledComponents: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'cdnjs.cloudflare.com',
      },
    ],
  },
  // Explicitly set turbopack resolveAlias for next-intl (Next.js 16 default bundler)
  turbopack: {
    resolveAlias: {
      'next-intl/config': './src/i18n/request.js',
      '@andertal/lib': '../../packages/lib',
      '@andertal/ui': '../../packages/ui',
    },
  },
  async headers() {
    // Strict CSP for the admin/seller panel — no third-party embeds needed.
    const csp = [
      "default-src 'self'",
      // Next.js hydration + Polaris + styled-components require unsafe-inline/eval.
      // Stripe.js (seller card-on-file for platform fees / shipping label charges) is loaded from js.stripe.com.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      // User-uploaded images can come from the backend or any HTTPS CDN
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
      // XHR/fetch to backend API; wss for any future WebSocket features.
      // Dev-only backend origins come from SC_ALLOWED_DEV_BACKEND_HOSTS env.
      `connect-src 'self' https: wss:${devBackendHosts.length ? " " + devBackendHosts.join(" ") : ""}`,
      // Admin panel must never be embeddable in any frame (frame-ancestors) — but this page embeds
      // Stripe's own Card Element / 3D Secure iframes, so those two origins must be allowed here.
      "frame-src https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/:locale/apps/smtp", destination: "/:locale/settings/integrations", permanent: true },
      { source: "/:locale/apps/installed", destination: "/:locale/settings/integrations?tab=installed", permanent: false },
      { source: "/:locale/apps/:handle", destination: "/:locale/settings/integrations?tab=store&app=:handle", permanent: false },
      { source: "/:locale/apps", destination: "/:locale/settings/integrations?tab=store", permanent: false },
    ];
  },
};

const sentryWrapped = withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG || "murathan-cotuk",
  project: process.env.SENTRY_PROJECT_SELLERCENTRAL || "andertal-sellercentral",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  disableLogger: true,
  hideSourceMaps: true,
});

module.exports = sentryWrapped;

