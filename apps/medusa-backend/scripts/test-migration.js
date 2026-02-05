/**
 * Migration Test Script
 * 
 * Bu script migration'ların gerçekten çalışıp çalışmadığını kontrol eder
 * 
 * Kullanım:
 * node scripts/test-migration.js
 */

require('dotenv').config()
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // .env.local yoksa sorun değil
}

const { DataSource } = require('typeorm')
// TypeScript dosyalarını require edemeyiz, direkt SQL kullanacağız

const DATABASE_URL = process.env.DATABASE_URL || 'file:./medusa.db'
const DATABASE_TYPE = process.env.DATABASE_TYPE || (DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite')

async function testMigration() {
  console.log('\n🔍 Migration Test Başlatılıyor...\n')
  console.log(`Database Type: ${DATABASE_TYPE}`)
  console.log(`Database URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`)

  const dataSource = new DataSource({
    type: DATABASE_TYPE,
    url: DATABASE_URL,
    synchronize: false, // Migration'ları kullan, synchronize kullanma
    logging: false,
    // PostgreSQL SSL için (Render.com)
    ...(DATABASE_TYPE === 'postgres' && DATABASE_URL.includes('render.com') ? {
      extra: {
        ssl: {
          rejectUnauthorized: false
        }
      }
    } : {}),
  })

  try {
    await dataSource.initialize()
    console.log('✅ Database bağlantısı başarılı\n')

    // Tabloları kontrol et
    const queryRunner = dataSource.createQueryRunner()
    
    console.log('📋 Tablo Kontrolü:\n')
    
    // admin_hub_categories tablosu
    const categoriesTableExists = await queryRunner.hasTable('admin_hub_categories')
    console.log(`admin_hub_categories: ${categoriesTableExists ? '✅ VAR' : '❌ YOK'}`)
    
    if (categoriesTableExists) {
      const categoriesCount = await queryRunner.query('SELECT COUNT(*) as count FROM admin_hub_categories')
      console.log(`   Kayıt sayısı: ${categoriesCount[0]?.count || 0}`)
    }

    // admin_hub_banners tablosu
    const bannersTableExists = await queryRunner.hasTable('admin_hub_banners')
    console.log(`admin_hub_banners: ${bannersTableExists ? '✅ VAR' : '❌ YOK'}`)
    
    if (bannersTableExists) {
      const bannersCount = await queryRunner.query('SELECT COUNT(*) as count FROM admin_hub_banners')
      console.log(`   Kayıt sayısı: ${bannersCount[0]?.count || 0}`)
    }

    console.log('\n')

    // Eğer tablolar yoksa uyarı ver
    if (!categoriesTableExists || !bannersTableExists) {
      console.log('⚠️  UYARI: Tablolar bulunamadı!')
      console.log('   Migration\'lar otomatik çalışmamış olabilir.')
      console.log('   Çözüm:')
      console.log('   1. Medusa v2 loadMedusaApp ile custom TypeORM migration\'ları TETİKLENMİYOR olabilir')
      console.log('   2. Manuel migration runner veya DataSource.initialize + runMigrations ekle')
      console.log('   3. Veya synchronize: true kullan (sadece development için)\n')
    } else {
      console.log('✅ Tüm tablolar mevcut!\n')
    }

    await queryRunner.release()
    await dataSource.destroy()

    console.log('✅ Test tamamlandı\n')
  } catch (error) {
    console.error('❌ Test hatası:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

testMigration()
