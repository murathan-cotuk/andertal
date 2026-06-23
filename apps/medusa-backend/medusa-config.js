/**
 * Medusa v2 Application Configuration
 * defineConfig + loadEnv ile config yüklenir; "medusa start" config'i kullanır.
 */
const path = require("path")

// Medusa v2 config yardımcıları (env yükleme)
try {
  const { loadEnv, defineConfig } = require("@medusajs/framework/utils")
  loadEnv(process.env.NODE_ENV || "development", path.resolve(__dirname))
} catch (e) {
  require("dotenv").config()
  try {
    require("dotenv").config({ path: path.join(__dirname, ".env.local") })
  } catch (_) {}
}

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || "0.0.0.0"
const SERVER_URL =
  process.env.SERVER_URL ||
  (process.env.PORT ? `http://${HOST}:${PORT}` : "http://localhost:9000")

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/medusa"

// ── Production secret validation ──────────────────────────────────────────────
// JWT_SECRET and COOKIE_SECRET must be supplied in production. Failing fast is
// safer than silently using a hardcoded default that is visible in the public
// repo (the previous fallback values v9jGV... and qR1it... are considered
// compromised and were removed in PR fix/s1-1-rotate-secrets).
const IS_PRODUCTION = process.env.NODE_ENV === "production"

function readSecretOrFail(envName, devPlaceholder) {
  const value = process.env[envName]
  if (value && value.length >= 32) return value
  if (IS_PRODUCTION) {
    // eslint-disable-next-line no-console
    console.error(
      `[SECURITY] ${envName} is missing or shorter than 32 chars. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" ` +
        `and set it in your deployment environment before starting the server.`,
    )
    process.exit(1)
  }
  // Development only — use an obvious, non-secret placeholder. NEVER ship to prod.
  // eslint-disable-next-line no-console
  console.warn(
    `[SECURITY] ${envName} is unset — using a dev-only placeholder. ` +
      `Add ${envName} to apps/medusa-backend/.env.local for real authentication.`,
  )
  return devPlaceholder
}

const RESOLVED_JWT_SECRET = readSecretOrFail(
  "JWT_SECRET",
  "dev-only-jwt-secret-do-not-use-in-prod",
)
const RESOLVED_COOKIE_SECRET = readSecretOrFail(
  "COOKIE_SECRET",
  "dev-only-cookie-secret-do-not-use-in-prod",
)
const isPostgres = databaseUrl.startsWith("postgres")
const isRender = databaseUrl.includes("render.com")

// Knex pool: local'de bağlantı zaman aşımı ve pool ayarları (KnexTimeoutError önlemi)
function getDatabaseDriverOptions() {
  if (!isPostgres) return undefined
  const opts = {}
  if (isRender) {
    opts.connection = { ssl: { rejectUnauthorized: false } }
  } else {
    // Lokal geliştirme: daha uzun acquire timeout, sınırlı pool
    opts.acquireConnectionTimeout = 60000
    opts.pool = { min: 0, max: 10 }
  }
  return Object.keys(opts).length ? opts : undefined
}

// defineConfig yoksa (eski sürüm) düz export
let config = {
  // true = Product, Order vb. commerce modülleri yüklensin (productService resolve edilebilsin)
  linkModules: { enabled: true },
  projectConfig: {
    databaseUrl,
    databaseDriverOptions: getDatabaseDriverOptions(),
    ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:3002",
      authCors:
        process.env.AUTH_CORS ||
        [process.env.STORE_CORS || "http://localhost:3000", process.env.ADMIN_CORS || "http://localhost:3002"].join(","),
      jwtSecret: RESOLVED_JWT_SECRET,
      cookieSecret: RESOLVED_COOKIE_SECRET,
    },
  },
  plugins: [],
  modules: [
    {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          { resolve: "@medusajs/auth-emailpass", id: "emailpass" },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          { resolve: "@medusajs/file-local", id: "local" },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          { resolve: "@medusajs/notification-local", id: "local" },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          { resolve: "@medusajs/fulfillment-manual", id: "manual" },
        ],
      },
    },
  ],
}

try {
  const { defineConfig } = require("@medusajs/framework/utils")
  module.exports = defineConfig(config)
} catch (_) {
  module.exports = config
}