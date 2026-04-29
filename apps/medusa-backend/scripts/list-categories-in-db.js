/**
 * Veritabanındaki Admin Hub kategorilerini listeler.
 * Kullanım: node scripts/list-categories-in-db.js
 * .env / .env.local içindeki DATABASE_URL kullanılır.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

// Render DB'yi görüntülemek için: DATABASE_URL="postgresql://..." node scripts/list-categories-in-db.js
const url = process.env.DATABASE_URL
if (!url || !url.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL gerekli.')
  console.error('Kullanım: DATABASE_URL="postgresql://user:pass@host:port/db?sslmode=require" node scripts/list-categories-in-db.js')
  console.error('Render: Dashboard → andertal-medusa-db → "External Database URL" kopyalayın.')
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
      SELECT id, name, slug, parent_id, active, is_visible, sort_order, created_at
      FROM admin_hub_categories
      ORDER BY sort_order ASC, name ASC
    `)
    if (res.rows.length === 0) {
      console.log('admin_hub_categories tablosunda kayıt yok.')
      return
    }
    console.log('Admin Hub Kategorileri (admin_hub_categories):\n')
    console.table(
      res.rows.map((r) => ({
        id: r.id.slice(0, 8) + '...',
        name: r.name,
        slug: r.slug,
        parent_id: r.parent_id ? r.parent_id.slice(0, 8) + '...' : '-',
        active: r.active,
        is_visible: r.is_visible,
        sort_order: r.sort_order,
        created_at: r.created_at,
      }))
    )
    console.log('Toplam:', res.rows.length, 'kategori')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('Hata: admin_hub_categories tablosu bulunamadı. Önce migration çalıştırın: npm run db:migrate veya medusa db:migrate')
    } else {
      console.error('Hata:', err.message)
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
