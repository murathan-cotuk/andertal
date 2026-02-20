/**
 * Veritabanındaki Admin Hub media kayıtlarını listeler.
 * Tablo: admin_hub_media
 * Kullanım: node scripts/list-media-in-db.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const url = process.env.DATABASE_URL
if (!url || !url.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL gerekli.')
  process.exit(1)
}

const { Client } = require('pg')
const client = new Client({
  connectionString: url,
  ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined,
})

async function main() {
  await client.connect()
  try {
    const res = await client.query(`
      SELECT id, filename, url, mime_type, size, alt, created_at
      FROM admin_hub_media
      ORDER BY created_at DESC
    `)
    if (res.rows.length === 0) {
      console.log('admin_hub_media tablosunda kayıt yok.')
      return
    }
    console.log('Admin Hub Media (admin_hub_media):\n')
    console.table(
      res.rows.map((r) => ({
        id: String(r.id).slice(0, 8) + '...',
        filename: (r.filename || '').slice(0, 32),
        url: (r.url || '').slice(0, 40),
        mime_type: (r.mime_type || '-').slice(0, 20),
        size: r.size,
        created_at: r.created_at,
      }))
    )
    console.log('Toplam:', res.rows.length, 'kayıt')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: admin_hub_media tablosu bulunamadı.')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
