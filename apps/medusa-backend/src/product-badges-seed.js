'use strict'

/**
 * Idempotent default Product Badges (Content → Styles → Product Badges).
 * Inserts api-rule rows only when that api_rule does not already exist —
 * never overwrites admin edits.
 *
 * Rules:
 *   - bestseller_category → top seller per category (score > 0)
 *   - sale                → products with a sale price
 *   - new                 → published/created within ~15 days
 *   - made_in_europe      → verified EU origin (metadata)
 */

const DEFAULT_API_BADGES = [
  {
    label: 'Bestseller',
    api_rule: 'bestseller_category',
    position: 'top-left',
    bg_color: '#111827',
    text_color: '#ffffff',
    i18n: {
      en: { label: 'Bestseller' },
      tr: { label: 'Çok Satan' },
      fr: { label: 'Best-seller' },
      es: { label: 'Más vendido' },
      it: { label: 'Bestseller' },
    },
  },
  {
    label: 'Sale',
    api_rule: 'sale',
    position: 'top-right',
    bg_color: '#dc2626',
    text_color: '#ffffff',
    i18n: {
      en: { label: 'Sale' },
      tr: { label: 'İndirim' },
      fr: { label: 'Promo' },
      es: { label: 'Oferta' },
      it: { label: 'Saldi' },
    },
  },
  {
    label: 'Neu',
    api_rule: 'new',
    position: 'top-left',
    bg_color: '#2563eb',
    text_color: '#ffffff',
    i18n: {
      en: { label: 'New' },
      tr: { label: 'Yeni' },
      fr: { label: 'Nouveau' },
      es: { label: 'Nuevo' },
      it: { label: 'Nuovo' },
    },
  },
  {
    label: 'Made in Europe',
    api_rule: 'made_in_europe',
    position: 'bottom-left',
    bg_color: '#1e3a5f',
    text_color: '#ffffff',
    i18n: {
      en: { label: 'Made in Europe' },
      tr: { label: 'Made in Europe' },
      fr: { label: 'Made in Europe' },
      es: { label: 'Made in Europe' },
      it: { label: 'Made in Europe' },
    },
  },
]

async function seedDefaultProductBadges(client) {
  if (!client || typeof client.query !== 'function') {
    return { inserted: 0, skipped: 0 }
  }
  let inserted = 0
  let skipped = 0
  for (const b of DEFAULT_API_BADGES) {
    const exists = await client.query(
      `SELECT id FROM admin_hub_product_badges
       WHERE target_type = 'api' AND api_rule = $1
       LIMIT 1`,
      [b.api_rule],
    )
    if (exists.rows[0]) {
      skipped += 1
      continue
    }
    await client.query(
      `INSERT INTO admin_hub_product_badges
        (label, position, bg_color, text_color, font_size, border_width, border_color, border_radius,
         offset_x, offset_y, target_type, product_id, group_id, api_rule, api_category_id, active,
         badge_type, image_url, i18n)
       VALUES
        ($1,$2,$3,$4,12,0,'#000000',4,8,8,'api',NULL,NULL,$5,NULL,true,'text',NULL,$6::jsonb)`,
      [
        b.label,
        b.position || 'top-left',
        b.bg_color,
        b.text_color,
        b.api_rule,
        JSON.stringify(b.i18n || {}),
      ],
    )
    inserted += 1
  }
  return { inserted, skipped }
}

module.exports = {
  DEFAULT_API_BADGES,
  seedDefaultProductBadges,
}
