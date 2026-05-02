/**
 * Tüm Stripe referanslarını DB'de sıfırlar (reset-stripe-ids.sql ile aynı mantık).
 *
 * Kullanım:
 *   STRIPE_RESET_CONFIRM=RESET_STRIPE_IDS node scripts/reset-stripe-ids.js
 *
 * PowerShell:
 *   $env:STRIPE_RESET_CONFIRM="RESET_STRIPE_IDS"; node scripts/reset-stripe-ids.js
 */
const path = require('path')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') })

const dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^postgresql:\/\//, 'postgres://')
if (!dbUrl || !dbUrl.startsWith('postgres')) {
  console.error('Hata: DATABASE_URL (.env / .env.local) postgres:// veya postgresql:// ile başlamalı.')
  process.exit(1)
}

if (process.env.STRIPE_RESET_CONFIRM !== 'RESET_STRIPE_IDS') {
  console.error(
    'Onay gerekli: ortam değişkeni STRIPE_RESET_CONFIRM=RESET_STRIPE_IDS olmadan çalıştırılmaz (yanlışlıkla silmeyi önlemek için).',
  )
  process.exit(1)
}

const { Client } = require('pg')
const client = new Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
})

async function run() {
  await client.connect()
  try {
    await client.query('BEGIN')

    await client.query(`UPDATE store_customers SET stripe_customer_id = NULL`)

    await client.query(`
      UPDATE store_orders SET
        payment_intent_id = NULL,
        stripe_transfer_status = 'legacy_skipped',
        stripe_transfer_id = NULL,
        stripe_transfer_error = NULL,
        stripe_transfer_at = NULL,
        updated_at = now()
    `)

    await client.query(`
      UPDATE seller_users SET
        stripe_account_id = NULL,
        stripe_onboarding_complete = false,
        updated_at = now()
    `)

    await client.query(`UPDATE seller_campaigns SET stripe_charge_id = NULL`)

    await client.query(`
      UPDATE store_platform_checkout SET
        stripe_publishable_key = NULL,
        stripe_secret_key = NULL,
        updated_at = now()
      WHERE id = 1
    `)

    await client.query('COMMIT')
    console.log('Stripe referansları sıfırlandı (reset-stripe-ids.sql ile aynı güncellemeler).')
    console.log('Sonraki adımlar: Sellercentral’da yeni Stripe PK/SK girin; satıcılar Connect’i yeniden bağlasın.')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Hata:', err.message)
    process.exit(1)
  })
