/**
 * Veritabanındaki Admin Hub sayfalarını listeler.
 * Tablo: admin_hub_pages
 * Kullanım: node scripts/list-pages-in-db.js
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
      SELECT id, title, slug, status, created_at, updated_at
      FROM admin_hub_pages
      ORDER BY updated_at DESC
    `)
    if (res.rows.length === 0) {
      console.log('admin_hub_pages tablosunda kayıt yok.')
      return
    }
    console.log('Admin Hub Pages (admin_hub_pages):\n')
    console.table(
      res.rows.map((r) => ({
        id: String(r.id).slice(0, 8) + '...',
        title: (r.title || '').slice(0, 36),
        slug: (r.slug || '').slice(0, 24),
        status: r.status || 'draft',
        updated_at: r.updated_at,
      }))
    )
    console.log('Toplam:', res.rows.length, 'sayfa')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: admin_hub_pages tablosu bulunamadı.')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
