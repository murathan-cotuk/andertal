const createNextIntlPlugin = require("next-intl/plugin");

// Must be relative to app root so Turbopack alias resolves correctly at runtime
const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
  // Turbopack root configuration removed - Next.js 16 handles this automatically
};

module.exports = withNextIntl(nextConfig);

