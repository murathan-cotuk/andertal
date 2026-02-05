/**
 * Manual Migration Runner
 * 
 * Medusa CLI migration çalışmadığında kullanılabilir.
 * TypeORM migration'larını manuel olarak çalıştırır.
 * 
 * Kullanım:
 *   node scripts/run-migrations.js
 * 
 * Not: Medusa v2 bazen kendi ORM'ini kullandığı için bu script
 * TypeORM migration'larıyla uyumlu olmayabilir. O durumda
 * SQL ile kolon ekle (docs/TASKS.md veya docs/RAPOR.md'de not var).
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const { DataSource } = require('typeorm')
const path = require('path')
const fs = require('fs')

const DATABASE_URL = process.env.DATABASE_URL || 'file:./medusa.db'
const DATABASE_TYPE = process.env.DATABASE_TYPE || (DATABASE_URL.includes('postgres') ? 'postgres' : 'sqlite')

async function runMigrations() {
  console.log('\n🚀 Migration runner başlatılıyor...\n')
  console.log(`📊 Database Type: ${DATABASE_TYPE}`)
  console.log(`📊 Database URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`)

  // Migration dosyalarını bul
  const migrationsPath = path.join(__dirname, '../migrations')
  const migrationFiles = fs.readdirSync(migrationsPath)
    .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
    .map(file => path.join(migrationsPath, file))

  console.log(`📋 Bulunan migration dosyaları: ${migrationFiles.length}`)
  migrationFiles.forEach(file => {
    console.log(`   - ${path.basename(file)}`)
  })
  console.log()

  // DataSource config
  const dataSourceConfig = {
    type: DATABASE_TYPE,
    migrations: migrationFiles,
    migrationsTableName: 'migrations',
    synchronize: false, // ÖNEMLİ: synchronize false olmalı, sadece migration çalıştır
  }

  // PostgreSQL için
  if (DATABASE_TYPE === 'postgres') {
    dataSourceConfig.url = DATABASE_URL
    // Render.com için SSL
    if (DATABASE_URL.includes('render.com')) {
      dataSourceConfig.extra = {
        ssl: {
          rejectUnauthorized: false
        }
      }
    }
  } else {
    // SQLite için
    dataSourceConfig.database = DATABASE_URL.replace('file:', '')
  }

  const dataSource = new DataSource(dataSourceConfig)

  try {
    console.log('🔌 Database bağlantısı kuruluyor...')
    await dataSource.initialize()
    console.log('✅ Database bağlantısı başarılı\n')

    console.log('🔄 Migration'lar çalıştırılıyor...')
    const migrations = await dataSource.runMigrations()
    
    if (migrations.length === 0) {
      console.log('ℹ️  Çalıştırılacak yeni migration yok (tüm migration'lar zaten uygulanmış)\n')
    } else {
      console.log(`\n✅ ${migrations.length} migration başarıyla çalıştırıldı:\n`)
      migrations.forEach(migration => {
        console.log(`   ✅ ${migration.name}`)
      })
      console.log()
    }

    await dataSource.destroy()
    console.log('✅ Migration runner tamamlandı\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Migration hatası:')
    console.error(error)
    console.error('\n💡 Alternatif: SQL ile manuel ekleme yapabilirsiniz:')
    console.error('   PostgreSQL:')
    console.error('   ALTER TABLE admin_hub_categories')
    console.error('   ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,')
    console.error('   ADD COLUMN IF NOT EXISTS has_collection boolean DEFAULT false;\n')
    
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
    process.exit(1)
  }
}

// Script'i çalıştır
runMigrations()
