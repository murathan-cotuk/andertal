/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@belucha/ui", "@belucha/lib"],
  compiler: {
    styledComponents: true,
  },
  images: {
    domains: ["localhost", "cdnjs.cloudflare.com"],
  },
};

module.exports = nextConfig;

