const path = require('path');
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

const monorepoRoot = path.join(__dirname, "../..");

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
      // Next.js hydration + Polaris + styled-components require unsafe-inline/eval
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // User-uploaded images can come from the backend or any HTTPS CDN
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // XHR/fetch to backend API; wss for any future WebSocket features
      "connect-src 'self' https: wss:",
      // Admin panel must never be embeddable in any frame
      "frame-src 'none'",
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
};

module.exports = withNextIntl(nextConfig);

