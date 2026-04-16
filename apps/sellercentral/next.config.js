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
  transpilePackages: ["@belucha/ui", "@belucha/lib"],
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
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" }, // seller panel: stricter than shop
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

