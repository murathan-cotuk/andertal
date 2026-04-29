/**
 * PostgreSQL bağlantı testi
 * Kullanım: node scripts/test-db-connection.js
 * .env.local içindeki DATABASE_URL kullanılır (Render External URL olmalı).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const url = process.env.DATABASE_URL
if (!url || !url.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL .env.local içinde postgres:// veya postgresql:// ile başlamalı.')
  console.error('Yerel geliştirme için Render → andertal-medusa-db → External Database URL kopyalayıp .env.local\'e yapıştırın.')
  process.exit(1)
}

const { Client } = require('pg')
const client = new Client({ connectionString: url })

client
  .connect()
  .then(() => client.query('SELECT 1 as ok, current_database() as db'))
  .then((res) => {
    console.log('PostgreSQL bağlantısı başarılı.')
    console.log('Veritabanı:', res.rows[0].db)
    return client.end()
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bağlantı hatası:', err.message)
    if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
      console.error('\nİpucu: DATABASE_URL Render "External Database URL" mi? (Internal sadece Render içinde çalışır.)')
    }
    process.exit(1)
  })
