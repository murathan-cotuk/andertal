'use strict'
const { Router } = require('express')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

const pagesListGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const status = (req.query.status || '').trim() || null
    const pageType = (req.query.page_type || '').trim() || null
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100)
    const offset = parseInt(req.query.offset, 10) || 0
    let q = `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at
      FROM admin_hub_pages WHERE 1=1`
    const params = []
    if (status) { params.push(status); q += ` AND status = $${params.length}` }
    if (pageType) { params.push(pageType); q += ` AND page_type = $${params.length}` }
    q += ' ORDER BY updated_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2)
    params.push(limit, offset)
    const r = await client.query(q, params)
    let countSql = 'SELECT COUNT(*)::int AS c FROM admin_hub_pages WHERE 1=1'
    const countParams = []
    if (status) { countParams.push(status); countSql += ` AND status = $${countParams.length}` }
    if (pageType) { countParams.push(pageType); countSql += ` AND page_type = $${countParams.length}` }
    const countRes = await client.query(countSql, countParams)
    res.json({ pages: r.rows, count: countRes.rows[0].c })
  } catch (err) {
    console.error('Pages list error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const pagesCreatePOST = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const b = req.body || {}
  let title = (b.title || '').trim()
  let slug = (b.slug || '').trim()
  if (!title) return res.status(400).json({ message: 'title is required' })
  if (!slug) slug = title.toLowerCase()
    .replace(/ü/g,'ue').replace(/ö/g,'oe').replace(/ä/g,'ae').replace(/ß/g,'ss')
    .replace(/[àáâã]/g,'a').replace(/[èéêë]/g,'e').replace(/[ìíîï]/g,'i')
    .replace(/[òóôõ]/g,'o').replace(/[ùúû]/g,'u').replace(/ç/g,'c').replace(/ñ/g,'n')
    .replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-').replace(/^-+|-+$/g,'')
  const body = (b.body != null ? b.body : '')
  const status = (b.status === 'published' ? 'published' : 'draft')
  const page_type = (b.page_type === 'blog' ? 'blog' : 'page')
  const featured_image = b.featured_image != null ? String(b.featured_image).trim() || null : null
  const excerpt = b.excerpt != null ? String(b.excerpt) : null
  const meta_title = b.meta_title != null ? String(b.meta_title).trim() || null : null
  const meta_description = b.meta_description != null ? String(b.meta_description) : null
  const meta_keywords = b.meta_keywords != null ? String(b.meta_keywords).trim() || null : null
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_pages (title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at`,
      [title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords]
    )
    res.status(201).json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Slug already exists' })
    console.error('Pages create error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const pageByIdGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at
       FROM admin_hub_pages WHERE id = $1`,
      [req.params.id]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('Page get error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const pageByIdPUT = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const b = req.body || {}
  const updates = []
  const values = []
  let i = 1
  if (b.title !== undefined) { updates.push(`title = $${i++}`); values.push(b.title) }
  if (b.slug !== undefined) { updates.push(`slug = $${i++}`); values.push(b.slug) }
  if (b.body !== undefined) { updates.push(`body = $${i++}`); values.push(b.body) }
  if (b.status !== undefined) { updates.push(`status = $${i++}`); values.push(b.status === 'published' ? 'published' : 'draft') }
  if (b.page_type !== undefined) { updates.push(`page_type = $${i++}`); values.push(b.page_type === 'blog' ? 'blog' : 'page') }
  if (b.featured_image !== undefined) { updates.push(`featured_image = $${i++}`); values.push(b.featured_image ? String(b.featured_image).trim() : null) }
  if (b.excerpt !== undefined) { updates.push(`excerpt = $${i++}`); values.push(b.excerpt) }
  if (b.meta_title !== undefined) { updates.push(`meta_title = $${i++}`); values.push(b.meta_title ? String(b.meta_title).trim() : null) }
  if (b.meta_description !== undefined) { updates.push(`meta_description = $${i++}`); values.push(b.meta_description) }
  if (b.meta_keywords !== undefined) { updates.push(`meta_keywords = $${i++}`); values.push(b.meta_keywords ? String(b.meta_keywords).trim() : null) }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
  updates.push(`updated_at = now()`)
  values.push(req.params.id)
  try {
    await client.connect()
    const r = await client.query(
      `UPDATE admin_hub_pages SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, created_at, updated_at`,
      values
    )
    if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
    res.json(r.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Slug already exists' })
    console.error('Page update error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const pageByIdDELETE = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query('DELETE FROM admin_hub_pages WHERE id = $1 RETURNING id', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
    res.status(200).json({ deleted: true })
  } catch (err) {
    console.error('Page delete error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

const storePagesListGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const pageType = (req.query.page_type || '').trim() || null
    let q = `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords, updated_at
      FROM admin_hub_pages WHERE status = $1`
    const params = ['published']
    if (pageType) { params.push(pageType); q += ` AND page_type = $2` }
    q += ' ORDER BY updated_at DESC'
    const r = await client.query(q, params)
    res.json({ pages: r.rows, count: r.rows.length })
  } catch (err) {
    console.error('Store pages list error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const storePageBySlugGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords, updated_at
       FROM admin_hub_pages WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    )
    if (r.rows.length === 0) return res.status(404).json({ message: 'Page not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('Store page by slug error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// ── Landing Page CMS ──────────────────────────────────────────────────

// Enrich collections_carousel containers with live name + image_url from DB (always refresh)
const enrichCollectionImages = async (containers, client) => {
  if (!Array.isArray(containers)) return containers
  // Collect ALL collection IDs across all carousels (always refresh, not only missing)
  const allIds = new Set()
  containers.forEach(c => {
    if (c.type === 'collections_carousel' && Array.isArray(c.collections)) {
      c.collections.forEach(col => { if (col.id) allIds.add(String(col.id)) })
    }
  })
  if (!allIds.size) return containers
  const idList = [...allIds]
  let collectionMap = {}
  try {
    const res = await client.query(
      `SELECT id, title, handle, metadata FROM admin_hub_collections WHERE id::text = ANY($1::text[])`,
      [idList]
    )
    res.rows.forEach(row => {
      const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
      collectionMap[String(row.id)] = {
        title: row.title || null,
        handle: row.handle || null,
        image: meta.image_url || null,
      }
    })
  } catch (_) {}
  // Inject fresh name + image for every collection in carousel
  return containers.map(c => {
    if (c.type !== 'collections_carousel' || !Array.isArray(c.collections)) return c
    return {
      ...c,
      collections: c.collections.map(col => {
        const live = collectionMap[String(col.id)]
        if (!live) return col
        return {
          ...col,
          image: live.image || col.image || null,
          title: live.title || col.title || null,
          handle: live.handle || col.handle || null,
        }
      })
    }
  })
}

const _previewPlain = (html, max) => {
  const t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1) + '…'
}

const enrichBlogCarousel = async (containers, client) => {
  if (!Array.isArray(containers)) return containers
  const ids = new Set()
  containers.forEach((c) => {
    if (c.type === 'blog_carousel' && Array.isArray(c.posts)) {
      c.posts.forEach((p) => {
        if (p && p.page_id) ids.add(String(p.page_id))
      })
    }
  })
  if (!ids.size) return containers
  const idList = [...ids]
  let rows = []
  try {
    const r = await client.query(
      `SELECT id, title, slug, body, excerpt, featured_image, page_type, status
       FROM admin_hub_pages
       WHERE id = ANY($1::uuid[]) AND status = 'published' AND page_type = 'blog'`,
      [idList]
    )
    rows = r.rows
  } catch (_) {}
  const map = {}
  rows.forEach((row) => {
    map[String(row.id)] = row
  })
  return containers.map((c) => {
    if (c.type !== 'blog_carousel' || !Array.isArray(c.posts)) return c
    const posts = c.posts
      .map((p) => {
        if (!p || !p.page_id) return p
        const row = map[String(p.page_id)]
        if (!row) return null
        const excerpt = row.excerpt ? String(row.excerpt) : _previewPlain(row.body, 280)
        return {
          ...p,
          title: row.title,
          excerpt,
          body: row.body,
          image: row.featured_image || p.image || '',
          href: (p.href && String(p.href).trim()) || `pages/${row.slug}`,
        }
      })
      .filter(Boolean)
    return { ...c, posts }
  })
}

const enrichLandingContainers = async (containers, client) => {
  let list = containers
  list = await enrichCollectionImages(list, client)
  list = await enrichBlogCarousel(list, client)
  return list
}

const landingPageGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query('SELECT containers, settings, updated_at FROM admin_hub_landing_page WHERE id = 1')
    const containers = await enrichLandingContainers(r.rows[0]?.containers || [], client)
    const settings =
      r.rows[0]?.settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
    res.json({ containers, settings, updated_at: r.rows[0]?.updated_at || null })
  } catch (err) {
    console.error('Landing page GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const landingPagePUT = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
    const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
    await client.query(
      `INSERT INTO admin_hub_landing_page (id, containers, settings, updated_at) VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET containers = $1, settings = $2, updated_at = NOW()`,
      [JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    console.error('Landing page PUT error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// ── Landing layout by category (containers + settings; must register before /landing-page/:pageId)
const landingCategoryGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const categoryId = (req.params.categoryId || '').trim()
  if (!categoryId) return res.json({ containers: [], settings: {}, updated_at: null })
  try {
    await client.connect()
    const r = await client.query(
      'SELECT containers, settings, updated_at FROM admin_hub_landing_categories WHERE category_id = $1',
      [categoryId]
    )
    if (!r.rows[0]) {
      return res.json({ containers: [], settings: {}, updated_at: null })
    }
    const rawSettings = r.rows[0].settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
    const containers = await enrichLandingContainers(r.rows[0].containers || [], client)
    res.json({
      containers,
      settings: rawSettings,
      updated_at: r.rows[0].updated_at || null,
    })
  } catch (err) {
    console.error('Landing category GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const landingCategoryPUT = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  const categoryId = (req.params.categoryId || '').trim()
  if (!categoryId) return res.status(400).json({ message: 'categoryId required' })
  try {
    await client.connect()
    const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
    const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
    await client.query(
      `INSERT INTO admin_hub_landing_categories (category_id, containers, settings, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (category_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
      [categoryId, JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    console.error('Landing category PUT error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// ── Landing page by page_id ──────────────────────────────────────────────
const landingPageByIdGET = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const pageId = req.params.pageId
    const r = await client.query('SELECT containers, settings, updated_at FROM admin_hub_landing_pages WHERE page_id = $1', [pageId])
    if (r.rows[0]) {
      const containers = await enrichLandingContainers(r.rows[0].containers || [], client)
      const settings =
        r.rows[0].settings && typeof r.rows[0].settings === 'object' ? r.rows[0].settings : {}
      return res.json({ containers, settings, updated_at: r.rows[0].updated_at || null })
    }
    // One-time fallback: only for the oldest page when new table is completely empty
    const newCount = await client.query('SELECT COUNT(*) FROM admin_hub_landing_pages')
    if (parseInt(newCount.rows[0].count) === 0) {
      const firstPage = await client.query('SELECT id FROM admin_hub_pages ORDER BY id ASC LIMIT 1')
      if (firstPage.rows[0] && String(firstPage.rows[0].id) === String(pageId)) {
        const old = await client.query('SELECT containers, settings FROM admin_hub_landing_page WHERE id = 1')
        if (old.rows[0]?.containers?.length) {
          const containers = await enrichLandingContainers(old.rows[0].containers, client)
          const settings =
            old.rows[0].settings && typeof old.rows[0].settings === 'object' ? old.rows[0].settings : {}
          return res.json({ containers, settings, updated_at: null, _migrated: true })
        }
      }
    }
    res.json({ containers: [], settings: {}, updated_at: null })
  } catch (err) {
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const landingPageByIdPUT = async (req, res) => {
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const pageId = req.params.pageId
    const containers = Array.isArray(req.body?.containers) ? req.body.containers : []
    const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {}
    await client.query(
      `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (page_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
      [pageId, JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

module.exports = function createPagesRouter() {
  const router = Router()

  router.get('/admin-hub/v1/pages', pagesListGET)
  router.post('/admin-hub/v1/pages', pagesCreatePOST)
  router.get('/admin-hub/v1/pages/:id', pageByIdGET)
  router.put('/admin-hub/v1/pages/:id', pageByIdPUT)
  router.delete('/admin-hub/v1/pages/:id', pageByIdDELETE)

  router.get('/store/pages', storePagesListGET)
  router.get('/store/pages/:slug', storePageBySlugGET)

  router.get('/admin-hub/landing-page', landingPageGET)
  router.put('/admin-hub/landing-page', landingPagePUT)
  router.get('/store/landing-page', landingPageGET)

  router.get('/admin-hub/landing-page/category/:categoryId', landingCategoryGET)
  router.put('/admin-hub/landing-page/category/:categoryId', landingCategoryPUT)
  router.get('/store/landing-page/category/:categoryId', landingCategoryGET)

  router.get('/admin-hub/landing-page/:pageId', landingPageByIdGET)
  router.put('/admin-hub/landing-page/:pageId', landingPageByIdPUT)
  router.get('/store/landing-page/:pageId', landingPageByIdGET)

  return router
}
