const path = require('path');
const createNextIntlPlugin = require("next-intl/plugin");
const { withSentryConfig } = require("@sentry/nextjs");

// Must be relative to app root so Turbopack alias resolves correctly at runtime
const withNextIntl = createNextIntlPlugin("./src/i18n/request.js");

// Bundle analyzer — enable by running: ANALYZE=true npm run build
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (cfg) => cfg;

/** Monorepo kökü — aksi halde Next, üst dizindeki başka package-lock.json'ı seçip yanlış root kullanıyor (Windows'ta 500 / tracing hataları). */
const monorepoRoot = path.join(__dirname, "../..");
const devHost = process.env.NEXT_PUBLIC_SITE_URL
  ? (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
      } catch {
        return null;
      }
    })()
  : null;

const allowedDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.240:3000",
  devHost,
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: monorepoRoot,
  allowedDevOrigins,
  reactStrictMode: true,
  transpilePackages: ["@belucha/ui", "@belucha/lib", "@belucha/shop-theme"],
  compiler: {
    styledComponents: true,
  },
  typescript: { ignoreBuildErrors: false },
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
  // Vercel deployment için optimize
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // next-intl: Turbopack must resolve 'next-intl/config' to our request.js (required for SSG/build)
  turbopack: {
    resolveAlias: {
      'next-intl/config': './src/i18n/request.js',
    },
  },
  async headers() {
    // Content-Security-Policy — split across named directives for readability.
    // 'unsafe-inline' + 'unsafe-eval' are required by Next.js inline scripts and
    // styled-components; nonce-based CSP would remove these but requires middleware
    // changes that are out of scope here. The remaining directives still provide
    // meaningful protection against clickjacking, base-tag injection, and data exfil.
    const csp = [
      "default-src 'self'",
      // Next.js hydration, styled-components, Stripe SDK, Trustpilot widget
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://widget.trustpilot.com",
      // Styled-components injects inline styles
      "style-src 'self' 'unsafe-inline'",
      // Product images from any HTTPS source; data URIs for QR codes / placeholders
      "img-src 'self' data: blob: https:",
      // Web fonts
      "font-src 'self' data: https://fonts.gstatic.com",
      // Fetch/XHR: backend API, Sentry tunnel, PostHog analytics, Stripe
      // In development also allow http://localhost:* for the local backend
      `connect-src 'self' https: wss:${process.env.NODE_ENV !== 'production' ? ' http://localhost:9000 http://localhost:* ws://localhost:*' : ''}`,
      // Stripe payment iframes, Trustpilot rating widget
      "frame-src https://js.stripe.com https://hooks.stripe.com https://widget.trustpilot.com",
      // No embedding of this page in foreign iframes
      "frame-ancestors 'self'",
      // Disable plugins (Flash, etc.)
      "object-src 'none'",
      // Prevent <base> tag injection
      "base-uri 'self'",
      // Only allow forms to submit to same origin or Stripe hosted checkout
      "form-action 'self' https://checkout.stripe.com",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Prevent clickjacking (legacy browsers — frame-ancestors above covers modern ones)
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy — don't leak full URL to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — force HTTPS for 1 year (production only; harmless in dev)
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Permissions — disable unused browser APIs
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Basic XSS protection for older browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
      // API routes — no caching by default
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

const sentryWrapped = withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "murathan-cotuk",
  project: "belucha-shop",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: (config, { isServer }) => {
    // Path alias support + next-intl config (when webpack is used)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
      'next-intl/config': path.resolve(__dirname, 'src/i18n/request.js'),
    };
    
    // Node.js modüllerini client-side'da exclude et
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'child_process': false,
        'fs': false,
        'net': false,
        'tls': false,
        'crypto': false,
      };
    }
    
    return config;
  },
});

// Bundle analyzer — opt-in via: ANALYZE=true npm run build
// Install when needed: npm add -D @next/bundle-analyzer
module.exports = withBundleAnalyzer(sentryWrapped);

