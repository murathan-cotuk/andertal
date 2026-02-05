// Environment variables yükle
require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

// Render'da SERVER_URL belirtilmemişse, PORT'tan oluştur
const SERVER_URL = process.env.SERVER_URL || (process.env.PORT 
  ? `http://${HOST}:${PORT}` 
  : 'http://localhost:9000')

// Custom entities - TypeScript dosyaları compile edildikten sonra yüklenecek
// Medusa v2 otomatik olarak models/ klasöründeki entity'leri yükler

module.exports = {
  projectConfig: {
    // PostgreSQL database (Production - Render)
    // Development için SQLite fallback
    database_url: process.env.DATABASE_URL || `file:./medusa.db`,
    database_type: process.env.DATABASE_TYPE || (process.env.DATABASE_URL ? "postgres" : "sqlite"),
    
    // CORS configuration
    // store_cors: Frontend shop app origin (müşteri tarafı)
    store_cors: process.env.STORE_CORS || "http://localhost:3000",
    // admin_cors: Frontend admin panel ve sellercentral origin'leri (virgülle ayrılmış, backend URL'i DEĞİL)
    // Production: https://belucha-admin.vercel.app,https://belucha-sellercentral.vercel.app
    // Development: http://localhost:7001,http://localhost:3002
    admin_cors: process.env.ADMIN_CORS || "http://localhost:7001,http://localhost:3002",
    
    // Database extra config (PostgreSQL SSL için)
    database_extra: process.env.DATABASE_URL?.includes('render.com') ? {
      ssl: {
        rejectUnauthorized: false
      }
    } : {},
    
    // Redis (Production için gerekli)
    redis_url: process.env.REDIS_URL || "redis://localhost:6379",
    
    // Server URL
    server_url: SERVER_URL,
    
    // JWT & Cookie secrets
    jwt_secret: process.env.JWT_SECRET || "v9jGVPyXYhNkIEPcOAD85RRsPv8SgYJsqD/FgJ4wa6Q",
    cookie_secret: process.env.COOKIE_SECRET || "qR1itY6si1ntDASglX/OqHafAVxQuLt5hNPSwwlmJ9A",
  },
  plugins: [],
  // Custom TypeORM entities - Medusa v2 otomatik olarak models/ klasöründeki entity'leri yükler
  // TypeORM entity'leri @Entity decorator ile işaretlenmiş dosyalar otomatik register edilir
}
