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
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:3002",
      authCors:
        process.env.AUTH_CORS ||
        [process.env.STORE_CORS || "http://localhost:3000", process.env.ADMIN_CORS || "http://localhost:3002"].join(","),
      jwtSecret:
        process.env.JWT_SECRET ||
        "v9jGVPyXYhNkIEPcOAD85RRsPv8SgYJsqD/FgJ4wa6Q",
      cookieSecret:
        process.env.COOKIE_SECRET ||
        "qR1itY6si1ntDASglX/OqHafAVxQuLt5hNPSwwlmJ9A",
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