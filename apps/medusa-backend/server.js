/**
 * Medusa v2 Backend Server
 * 
 * Sadece bootstrap - Medusa lifecycle'a müdahale etmiyor
 * Loader'lar Medusa tarafından otomatik keşfedilip yüklenir
 */

// Environment variables yükle
require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const { MedusaAppLoader, configLoader, pgConnectionLoader, container } = require('@medusajs/framework')
const { logger } = require('@medusajs/framework/logger')
const { asValue } = require('@medusajs/framework/awilix')
const { ContainerRegistrationKeys } = require('@medusajs/utils')
const path = require('path')

const PORT = process.env.PORT || 9000
const HOST = process.env.HOST || '0.0.0.0'

async function start() {
  try {
    console.log('\n🚀 Medusa v2 backend başlatılıyor...\n')

    // Config loader'ın proje dizininden medusa-config.js okuması için önce yükle
    await configLoader(path.resolve(__dirname), 'medusa-config')
    // Logger container'a kaydedilsin (MedusaAppLoader buna ihtiyaç duyar)
    if (!container.hasRegistration(ContainerRegistrationKeys.LOGGER)) {
      container.register(ContainerRegistrationKeys.LOGGER, asValue(logger))
    }
    // PG bağlantısı container'a kaydedilsin (MedusaAppLoader buna ihtiyaç duyar)
    await pgConnectionLoader()
    // MedusaAppLoader - framework kendi lifecycle'ını yönetir
    const app = new MedusaAppLoader({
      cwd: path.resolve(__dirname),
    })

    const { app: expressApp } = await app.load()

    // Static files (admin UI)
    const express = require('express')
    expressApp.use('/admin-ui', express.static(path.join(__dirname, 'public')))

    // Server'ı başlat
    expressApp.listen(PORT, HOST, () => {
      console.log(`\n✅ Medusa v2 backend başarıyla başlatıldı!`)
      console.log(`📍 Listening on ${HOST}:${PORT}`)
      console.log(`🌐 Health check: http://localhost:${PORT}/health`)
      console.log(`🛍️  Store API: http://localhost:${PORT}/store`)
      console.log(`⚙️  Admin API: http://localhost:${PORT}/admin`)
      console.log(`📊 Admin UI: http://localhost:${PORT}/admin-ui`)
      console.log(`\n📝 Mode: Production-ready Medusa v2`)
      console.log(`🗄️  Database: ${process.env.DATABASE_TYPE || 'PostgreSQL'}`)
      console.log(`\n✅ Sellercentral → Medusa ProductService → PostgreSQL → Shop app`)
      console.log(`🌍 Region/Market desteği aktif`)
      console.log(`\n📋 Custom Endpoints (Medusa v2 native):`)
      console.log(`   POST /admin/regions - Yeni region oluştur`)
      console.log(`   GET /admin/regions - Region'ları listele`)
      console.log(`   POST /admin/regions/:id/products - Ürünü region'a bağla`)
      console.log(`   DELETE /admin/regions/:id/products/:productId - Ürünü region'dan ayır`)
      console.log(`   GET /admin/product-categories - Kategorileri listele (DEPRECATED - read-only)`)
      console.log(`   GET /store/products?region=DE - Medusa ProductService + RegionService filtre`)
      console.log(`\n🎯 Admin Hub API v1 (Super Admin - Single Source of Truth):`)
      console.log(`   GET /admin-hub/v1/categories - Kategorileri listele`)
      console.log(`   POST /admin-hub/v1/categories - Yeni kategori oluştur`)
      console.log(`   PUT /admin-hub/v1/categories/:id - Kategori güncelle`)
      console.log(`   DELETE /admin-hub/v1/categories/:id - Kategori sil`)
      console.log(`   GET /admin-hub/v1/banners - Banner'ları listele`)
      console.log(`   POST /admin-hub/v1/banners - Yeni banner oluştur`)
      console.log(`   PUT /admin-hub/v1/banners/:id - Banner güncelle`)
      console.log(`   DELETE /admin-hub/v1/banners/:id - Banner sil\n`)
    })

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\nSIGTERM received, shutting down gracefully')
      expressApp.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('\nSIGINT received, shutting down gracefully')
      expressApp.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

  } catch (error) {
    console.error('\n❌ Medusa v2 başlatma hatası:')
    console.error(error)
    process.exit(1)
  }
}

start()
