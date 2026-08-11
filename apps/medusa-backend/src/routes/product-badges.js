'use strict'
const { Router } = require('express')

const pgDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  const { Client } = require('pg')
  return new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
}

const ALLOWED_POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
const ALLOWED_TARGET_TYPES = new Set(['product', 'group', 'api'])
// "bestseller" (global, single top-N catalog-wide) was removed — "bestseller_category" is now
// the only bestseller rule and auto-covers every category's own top seller (see
// getCategoryTopSellerIds in store-products.js), no per-rule category picker needed anymore.
const ALLOWED_API_RULES = new Set(['bestseller_category', 'sale', 'new'])
const ALLOWED_BADGE_TYPES = new Set(['text', 'image'])

const normalizeBadgeInput = (body) => {
  const b = body || {}
  const position = ALLOWED_POSITIONS.has(b.position) ? b.position : 'top-left'
  const target_type = ALLOWED_TARGET_TYPES.has(b.target_type) ? b.target_type : 'product'
  const api_rule = ALLOWED_API_RULES.has(b.api_rule) ? b.api_rule : null
  // i18n: { [locale]: { label?, image_url? } } — same _i18n[locale][field] convention as
  // landing containers; DE always lives on the root label/image_url columns.
  const i18n = b.i18n && typeof b.i18n === 'object' && !Array.isArray(b.i18n) ? b.i18n : null
  return {
    label: (b.label || '').toString().trim(),
    position,
    bg_color: (b.bg_color || '#e53935').toString().trim(),
    text_color: (b.text_color || '#ffffff').toString().trim(),
    font_size: Number.isFinite(Number(b.font_size)) ? Number(b.font_size) : 12,
    border_width: Number.isFinite(Number(b.border_width)) ? Number(b.border_width) : 0,
    border_color: (b.border_color || '#000000').toString().trim(),
    border_radius: Number.isFinite(Number(b.border_radius)) ? Number(b.border_radius) : 4,
    offset_x: Number.isFinite(Number(b.offset_x)) ? Number(b.offset_x) : 8,
    offset_y: Number.isFinite(Number(b.offset_y)) ? Number(b.offset_y) : 8,
    target_type,
    product_id: target_type === 'product' ? (b.product_id || null) : null,
    group_id: target_type === 'group' ? (b.group_id || null) : null,
    api_rule: target_type === 'api' ? api_rule : null,
    api_category_id: target_type === 'api' && api_rule === 'bestseller_category' ? (b.api_category_id || null) : null,
    active: b.active !== false,
    badge_type: ALLOWED_BADGE_TYPES.has(b.badge_type) ? b.badge_type : 'text',
    image_url: (b.image_url || '').toString().trim() || null,
    i18n,
  }
}

module.exports = function createProductBadgesRouter({ requireSuperuser }) {
  const router = Router()

  router.get('/admin-hub/v1/product-badges', requireSuperuser, async (_req, res) => {
    const c = pgDbClient(); try {
      await c.connect()
      const r = await c.query(`SELECT * FROM admin_hub_product_badges ORDER BY created_at DESC`)
      await c.end(); res.json({ badges: r.rows })
    } catch (e) { try { await c.end() } catch (_) {}; res.status(500).json({ message: e?.message }) }
  })

  router.post('/admin-hub/v1/product-badges', requireSuperuser, async (req, res) => {
    const b = normalizeBadgeInput(req.body)
    if (!b.label) return res.status(400).json({ message: 'label required' })
    const c = pgDbClient(); try {
      await c.connect()
      const r = await c.query(
        `INSERT INTO admin_hub_product_badges
          (label, position, bg_color, text_color, font_size, border_width, border_color, border_radius, offset_x, offset_y, target_type, product_id, group_id, api_rule, api_category_id, active, badge_type, image_url, i18n)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [b.label, b.position, b.bg_color, b.text_color, b.font_size, b.border_width, b.border_color, b.border_radius, b.offset_x, b.offset_y, b.target_type, b.product_id, b.group_id, b.api_rule, b.api_category_id, b.active, b.badge_type, b.image_url, b.i18n ? JSON.stringify(b.i18n) : null]
      )
      await c.end(); res.status(201).json({ badge: r.rows[0] })
    } catch (e) { try { await c.end() } catch (_) {}; res.status(500).json({ message: e?.message }) }
  })

  router.put('/admin-hub/v1/product-badges/:id', requireSuperuser, async (req, res) => {
    const b = normalizeBadgeInput(req.body)
    if (!b.label) return res.status(400).json({ message: 'label required' })
    const c = pgDbClient(); try {
      await c.connect()
      const exist = await c.query(`SELECT id FROM admin_hub_product_badges WHERE id = $1`, [req.params.id])
      if (!exist.rows[0]) { await c.end(); return res.status(404).json({ message: 'Not found' }) }
      const r = await c.query(
        `UPDATE admin_hub_product_badges SET
          label=$1, position=$2, bg_color=$3, text_color=$4, font_size=$5, border_width=$6, border_color=$7, border_radius=$8,
          offset_x=$9, offset_y=$10, target_type=$11, product_id=$12, group_id=$13, api_rule=$14, api_category_id=$15, active=$16,
          badge_type=$17, image_url=$18, i18n=$19, updated_at=now()
         WHERE id=$20 RETURNING *`,
        [b.label, b.position, b.bg_color, b.text_color, b.font_size, b.border_width, b.border_color, b.border_radius, b.offset_x, b.offset_y, b.target_type, b.product_id, b.group_id, b.api_rule, b.api_category_id, b.active, b.badge_type, b.image_url, b.i18n ? JSON.stringify(b.i18n) : null, req.params.id]
      )
      await c.end(); res.json({ badge: r.rows[0] })
    } catch (e) { try { await c.end() } catch (_) {}; res.status(500).json({ message: e?.message }) }
  })

  router.delete('/admin-hub/v1/product-badges/:id', requireSuperuser, async (req, res) => {
    const c = pgDbClient(); try {
      await c.connect()
      await c.query(`DELETE FROM admin_hub_product_badges WHERE id=$1`, [req.params.id])
      await c.end(); res.json({ deleted: true })
    } catch (e) { try { await c.end() } catch (_) {}; res.status(500).json({ message: e?.message }) }
  })

  return router
}
