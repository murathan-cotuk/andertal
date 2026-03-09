const path = require('path');
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin(path.resolve(__dirname, "./src/i18n/request.js"));

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

