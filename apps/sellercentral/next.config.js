const path = require('path');

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
  // Fix Turbopack panic with Turkish characters in path
  experimental: {
    turbopack: {
      root: path.resolve(__dirname, '../../..'), // Set root to monorepo root
    },
  },
};

module.exports = nextConfig;

