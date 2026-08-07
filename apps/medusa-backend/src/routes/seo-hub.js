'use strict'

const { Router } = require('express')
const {
  demoteH1ToH2,
  analyzeHtml,
  evaluateMeta,
  autoGenerateProductSeo,
  normalizeEntityType,
  stripHtml,
  TITLE_IDEAL,
  DESC_IDEAL,
} = require('../seo-hub-core')

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHOP_PUBLIC_URL || 'https://andertal.de').replace(/\/+$/, '')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

const requireSuperuser = (req, res, next) => {
  if (!req.sellerUser?.is_superuser) return res.status(403).json({ message: 'Superuser access required' })
  next()
}

const parseMeta = (row) => {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  return { metadata, ...metadata }
}

const scoreFromIssues = (issues) => {
  if (!issues.length) return 'good'
  if (issues.some((i) => i.severity === 'error')) return 'poor'
  return 'needs_work'
}

const buildPublicHints = (type, row) => {
  const handle = row.handle || row.slug || ''
  const pathMap = {
    products: handle ? `produkt/${handle}` : '',
    categories: handle ? `category/${handle}` : '',
    collections: handle ? handle : '',
    pages: handle ? `pages/${handle}` : '',
    blogs: handle ? `pages/${handle}` : '',
  }
  const path = pathMap[type] || ''
  const url = path ? `${SITE_URL}/de/de/${path}` : ''
  return {
    url,
    canonical: url,
    robots: 'index,follow',
    lang: 'de',
    author: 'Andertal',
    publisher: 'Andertal',
  }
}

async function listProducts(client, { q, limit, offset }) {
  const params = []
  let where = 'WHERE 1=1'
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (title ILIKE $${params.length} OR handle ILIKE $${params.length})`
  }
  params.push(limit, offset)
  const r = await client.query(
    `SELECT id, title, handle, description, status, metadata, updated_at,
            COUNT(*) OVER()::int AS total
       FROM admin_hub_products ${where}
      ORDER BY updated_at DESC NULLS LAST, title ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return {
    total: r.rows[0]?.total || 0,
    items: r.rows.map((row) => {
      const meta = parseMeta(row)
      const title = meta.seo_meta_title || ''
      const description = meta.seo_meta_description || ''
      const keywords = meta.seo_keywords || ''
      const evaluation = evaluateMeta({ title, description, keywords, entityType: 'products' })
      const analysis = analyzeHtml(row.description || '')
      return {
        id: row.id,
        type: 'products',
        label: row.title,
        handle: row.handle,
        status: row.status,
        updated_at: row.updated_at,
        meta_title: title,
        meta_description: description,
        meta_keywords: keywords,
        evaluation,
        score: scoreFromIssues(evaluation.issues),
        analysis,
        ...buildPublicHints('products', row),
      }
    }),
  }
}

async function listCategories(client, { q, limit, offset }) {
  const params = []
  let where = 'WHERE 1=1'
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (name ILIKE $${params.length} OR slug ILIKE $${params.length})`
  }
  params.push(limit, offset)
  const r = await client.query(
    `SELECT id, name, slug, seo_title, seo_description, metadata, updated_at,
            COUNT(*) OVER()::int AS total
       FROM admin_hub_categories ${where}
      ORDER BY name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return {
    total: r.rows[0]?.total || 0,
    items: r.rows.map((row) => {
      const meta = parseMeta(row)
      const title = row.seo_title || meta.meta_title || ''
      const description = row.seo_description || meta.meta_description || ''
      const keywords = meta.keywords || meta.meta_keywords || ''
      const evaluation = evaluateMeta({ title, description, keywords, entityType: 'categories' })
      return {
        id: row.id,
        type: 'categories',
        label: row.name,
        handle: row.slug,
        updated_at: row.updated_at,
        meta_title: title,
        meta_description: description,
        meta_keywords: keywords,
        evaluation,
        score: scoreFromIssues(evaluation.issues),
        analysis: analyzeHtml(meta.richtext || ''),
        ...buildPublicHints('categories', { handle: row.slug }),
      }
    }),
  }
}

async function listCollections(client, { q, limit, offset }) {
  const params = []
  let where = 'WHERE 1=1'
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (title ILIKE $${params.length} OR handle ILIKE $${params.length})`
  }
  params.push(limit, offset)
  const r = await client.query(
    `SELECT id, title, handle, metadata, updated_at,
            COUNT(*) OVER()::int AS total
       FROM admin_hub_collections ${where}
      ORDER BY title ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  return {
    total: r.rows[0]?.total || 0,
    items: r.rows.map((row) => {
      const meta = parseMeta(row)
      const title = meta.meta_title || ''
      const description = meta.meta_description || ''
      const keywords = meta.keywords || ''
      const evaluation = evaluateMeta({ title, description, keywords, entityType: 'collections' })
      return {
        id: row.id,
        type: 'collections',
        label: row.title,
        handle: row.handle,
        updated_at: row.updated_at,
        meta_title: title,
        meta_description: description,
        meta_keywords: keywords,
        evaluation,
        score: scoreFromIssues(evaluation.issues),
        analysis: analyzeHtml(meta.richtext || ''),
        ...buildPublicHints('collections', row),
      }
    }),
  }
}

async function listPages(client, { q, limit, offset, blogOnly }) {
  const params = []
  let where = blogOnly ? `WHERE page_type = 'blog'` : `WHERE COALESCE(page_type, 'page') <> 'blog'`
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (title ILIKE $${params.length} OR slug ILIKE $${params.length})`
  }
  params.push(limit, offset)
  const r = await client.query(
    `SELECT id, title, slug, body, status, page_type, meta_title, meta_description, meta_keywords, updated_at,
            COUNT(*) OVER()::int AS total
       FROM admin_hub_pages ${where}
      ORDER BY updated_at DESC NULLS LAST, title ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const type = blogOnly ? 'blogs' : 'pages'
  return {
    total: r.rows[0]?.total || 0,
    items: r.rows.map((row) => {
      const title = row.meta_title || ''
      const description = row.meta_description || ''
      const keywords = row.meta_keywords || ''
      const evaluation = evaluateMeta({ title, description, keywords, entityType: type })
      return {
        id: row.id,
        type,
        label: row.title,
        handle: row.slug,
        status: row.status,
        updated_at: row.updated_at,
        meta_title: title,
        meta_description: description,
        meta_keywords: keywords,
        evaluation,
        score: scoreFromIssues(evaluation.issues),
        analysis: analyzeHtml(row.body || ''),
        ...buildPublicHints(type, { handle: row.slug }),
      }
    }),
  }
}

async function getEntity(client, type, id) {
  if (type === 'products') {
    const r = await client.query(
      `SELECT id, title, handle, description, status, metadata, updated_at FROM admin_hub_products WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return null
    const row = r.rows[0]
    const meta = parseMeta(row)
    const title = meta.seo_meta_title || ''
    const description = meta.seo_meta_description || ''
    const keywords = meta.seo_keywords || ''
    const evaluation = evaluateMeta({ title, description, keywords, entityType: 'products' })
    return {
      id: row.id,
      type: 'products',
      label: row.title,
      handle: row.handle,
      status: row.status,
      updated_at: row.updated_at,
      content_html: row.description || '',
      meta_title: title,
      meta_description: description,
      meta_keywords: keywords,
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: analyzeHtml(row.description || ''),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL },
      ...buildPublicHints('products', row),
    }
  }
  if (type === 'categories') {
    const r = await client.query(
      `SELECT id, name, slug, seo_title, seo_description, metadata, updated_at FROM admin_hub_categories WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return null
    const row = r.rows[0]
    const meta = parseMeta(row)
    const title = row.seo_title || meta.meta_title || ''
    const description = row.seo_description || meta.meta_description || ''
    const keywords = meta.keywords || meta.meta_keywords || ''
    const evaluation = evaluateMeta({ title, description, keywords, entityType: 'categories' })
    return {
      id: row.id,
      type: 'categories',
      label: row.name,
      handle: row.slug,
      updated_at: row.updated_at,
      content_html: meta.richtext || '',
      meta_title: title,
      meta_description: description,
      meta_keywords: keywords,
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: analyzeHtml(meta.richtext || ''),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL, strict: true },
      ...buildPublicHints('categories', { handle: row.slug }),
    }
  }
  if (type === 'collections') {
    const r = await client.query(
      `SELECT id, title, handle, metadata, updated_at FROM admin_hub_collections WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return null
    const row = r.rows[0]
    const meta = parseMeta(row)
    const title = meta.meta_title || ''
    const description = meta.meta_description || ''
    const keywords = meta.keywords || ''
    const evaluation = evaluateMeta({ title, description, keywords, entityType: 'collections' })
    return {
      id: row.id,
      type: 'collections',
      label: row.title,
      handle: row.handle,
      updated_at: row.updated_at,
      content_html: meta.richtext || '',
      meta_title: title,
      meta_description: description,
      meta_keywords: keywords,
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: analyzeHtml(meta.richtext || ''),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL },
      ...buildPublicHints('collections', row),
    }
  }
  if (type === 'pages' || type === 'blogs') {
    const r = await client.query(
      `SELECT id, title, slug, body, status, page_type, meta_title, meta_description, meta_keywords, updated_at
         FROM admin_hub_pages WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return null
    const row = r.rows[0]
    const isBlog = row.page_type === 'blog'
    if (type === 'blogs' && !isBlog) return null
    if (type === 'pages' && isBlog) return null
    const title = row.meta_title || ''
    const description = row.meta_description || ''
    const keywords = row.meta_keywords || ''
    const entityType = isBlog ? 'blogs' : 'pages'
    const evaluation = evaluateMeta({ title, description, keywords, entityType })
    return {
      id: row.id,
      type: entityType,
      label: row.title,
      handle: row.slug,
      status: row.status,
      updated_at: row.updated_at,
      content_html: row.body || '',
      meta_title: title,
      meta_description: description,
      meta_keywords: keywords,
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: analyzeHtml(row.body || ''),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL },
      ...buildPublicHints(entityType, { handle: row.slug }),
    }
  }
  return null
}

async function patchEntity(client, type, id, body) {
  const metaTitle = body.meta_title !== undefined ? String(body.meta_title || '').trim() : undefined
  const metaDescription = body.meta_description !== undefined ? String(body.meta_description || '').trim() : undefined
  const metaKeywords = body.meta_keywords !== undefined ? String(body.meta_keywords || '').trim() : undefined

  if (type === 'products') {
    const r = await client.query(`SELECT metadata FROM admin_hub_products WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    if (metaTitle !== undefined) metadata.seo_meta_title = metaTitle
    if (metaDescription !== undefined) metadata.seo_meta_description = metaDescription
    if (metaKeywords !== undefined) metadata.seo_keywords = metaKeywords
    await client.query(`UPDATE admin_hub_products SET metadata = $1, updated_at = now() WHERE id = $2`, [JSON.stringify(metadata), id])
    return { ok: true }
  }

  if (type === 'categories') {
    const r = await client.query(`SELECT seo_title, seo_description, metadata FROM admin_hub_categories WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    const nextTitle = metaTitle !== undefined ? metaTitle : (r.rows[0].seo_title || metadata.meta_title || '')
    const nextDesc = metaDescription !== undefined ? metaDescription : (r.rows[0].seo_description || metadata.meta_description || '')
    const nextKw = metaKeywords !== undefined ? metaKeywords : (metadata.keywords || metadata.meta_keywords || '')
    const evaluation = evaluateMeta({ title: nextTitle, description: nextDesc, keywords: nextKw, entityType: 'categories' })
    if (evaluation.issues.some((i) => i.severity === 'error')) {
      return { error: 400, message: 'Category SEO rules not met', evaluation }
    }
    if (metaTitle !== undefined) {
      metadata.meta_title = metaTitle
    }
    if (metaDescription !== undefined) {
      metadata.meta_description = metaDescription
    }
    if (metaKeywords !== undefined) {
      metadata.keywords = metaKeywords
      metadata.meta_keywords = metaKeywords
    }
    await client.query(
      `UPDATE admin_hub_categories SET seo_title = COALESCE($1, seo_title), seo_description = COALESCE($2, seo_description), metadata = $3, updated_at = now() WHERE id = $4`,
      [metaTitle !== undefined ? metaTitle : null, metaDescription !== undefined ? metaDescription : null, JSON.stringify(metadata), id],
    )
    return { ok: true, evaluation }
  }

  if (type === 'collections') {
    const r = await client.query(`SELECT metadata FROM admin_hub_collections WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    if (metaTitle !== undefined) metadata.meta_title = metaTitle
    if (metaDescription !== undefined) metadata.meta_description = metaDescription
    if (metaKeywords !== undefined) metadata.keywords = metaKeywords
    await client.query(`UPDATE admin_hub_collections SET metadata = $1, updated_at = now() WHERE id = $2`, [JSON.stringify(metadata), id])
    return { ok: true }
  }

  if (type === 'pages' || type === 'blogs') {
    const r = await client.query(`SELECT id, page_type FROM admin_hub_pages WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const isBlog = r.rows[0].page_type === 'blog'
    if (type === 'blogs' && !isBlog) return { error: 404 }
    if (type === 'pages' && isBlog) return { error: 404 }
    await client.query(
      `UPDATE admin_hub_pages SET
         meta_title = COALESCE($1, meta_title),
         meta_description = COALESCE($2, meta_description),
         meta_keywords = COALESCE($3, meta_keywords),
         updated_at = now()
       WHERE id = $4`,
      [
        metaTitle !== undefined ? metaTitle : null,
        metaDescription !== undefined ? metaDescription : null,
        metaKeywords !== undefined ? metaKeywords : null,
        id,
      ],
    )
    return { ok: true }
  }
  return { error: 400, message: 'Unknown type' }
}

function createSeoHubRouter() {
  const router = Router()

  router.get('/admin-hub/v1/seo/rules', requireSuperuser, (req, res) => {
    res.json({
      title: TITLE_IDEAL,
      description: DESC_IDEAL,
      categories_strict: true,
      product_no_h1: true,
      site_url: SITE_URL,
    })
  })

  router.get('/admin-hub/v1/seo/entities', requireSuperuser, async (req, res) => {
    const type = normalizeEntityType(req.query.type)
    if (!type) return res.status(400).json({ message: 'type required: products|categories|collections|pages|blogs' })
    const q = String(req.query.q || '').trim()
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200)
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'Database not configured' })
    try {
      await client.connect()
      let result
      if (type === 'products') result = await listProducts(client, { q, limit, offset })
      else if (type === 'categories') result = await listCategories(client, { q, limit, offset })
      else if (type === 'collections') result = await listCollections(client, { q, limit, offset })
      else if (type === 'pages') result = await listPages(client, { q, limit, offset, blogOnly: false })
      else result = await listPages(client, { q, limit, offset, blogOnly: true })
      res.json({ type, ...result, rules: { title: TITLE_IDEAL, description: DESC_IDEAL } })
    } catch (err) {
      console.error('SEO list error:', err)
      res.status(500).json({ message: err.message || 'Internal error' })
    } finally {
      await client.end().catch(() => {})
    }
  })

  router.get('/admin-hub/v1/seo/entities/:type/:id', requireSuperuser, async (req, res) => {
    const type = normalizeEntityType(req.params.type)
    if (!type) return res.status(400).json({ message: 'Invalid type' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'Database not configured' })
    try {
      await client.connect()
      const entity = await getEntity(client, type, req.params.id)
      if (!entity) return res.status(404).json({ message: 'Not found' })
      res.json({ entity })
    } catch (err) {
      console.error('SEO get error:', err)
      res.status(500).json({ message: err.message || 'Internal error' })
    } finally {
      await client.end().catch(() => {})
    }
  })

  router.patch('/admin-hub/v1/seo/entities/:type/:id', requireSuperuser, async (req, res) => {
    const type = normalizeEntityType(req.params.type)
    if (!type) return res.status(400).json({ message: 'Invalid type' })
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'Database not configured' })
    try {
      await client.connect()
      await client.query('BEGIN')
      const result = await patchEntity(client, type, req.params.id, req.body || {})
      if (result.error) {
        await client.query('ROLLBACK')
        return res.status(result.error).json({ message: result.message || 'Error', evaluation: result.evaluation })
      }
      const entity = await getEntity(client, type, req.params.id)
      await client.query('COMMIT')
      res.json({ entity, evaluation: result.evaluation })
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('SEO patch error:', err)
      res.status(500).json({ message: err.message || 'Internal error' })
    } finally {
      await client.end().catch(() => {})
    }
  })

  router.post('/admin-hub/v1/seo/analyze', requireSuperuser, async (req, res) => {
    const html = String(req.body?.html || '')
    const title = String(req.body?.meta_title || '')
    const description = String(req.body?.meta_description || '')
    const keywords = String(req.body?.meta_keywords || '')
    const entityType = normalizeEntityType(req.body?.type) || 'pages'
    const analysis = analyzeHtml(html)
    const evaluation = evaluateMeta({ title, description, keywords, entityType })
    let live = null
    const targetUrl = String(req.body?.url || '').trim()
    if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': 'AndertalSeoHub/1.0' },
          redirect: 'follow',
        })
        clearTimeout(timer)
        const text = await response.text()
        live = {
          status: response.status,
          finalUrl: response.url,
          analysis: analyzeHtml(text),
          titleTag: (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '',
          metaDescription: (text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '',
          canonical: (text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) || [])[1] || '',
          robots: (text.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '',
          lang: (text.match(/<html[^>]+lang=["']([^"']+)["']/i) || [])[1] || '',
        }
      } catch (err) {
        live = { error: err.message || 'Fetch failed' }
      }
    }
    res.json({ analysis, evaluation, live, rules: { title: TITLE_IDEAL, description: DESC_IDEAL } })
  })

  router.post('/admin-hub/v1/seo/products/auto-generate', requireSuperuser, async (req, res) => {
    const onlyMissing = req.body?.only_missing !== false
    const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 200, 1), 2000)
    const client = getDbClient()
    if (!client) return res.status(503).json({ message: 'Database not configured' })
    try {
      await client.connect()
      const r = await client.query(
        `SELECT id, title, description, metadata FROM admin_hub_products ORDER BY updated_at DESC NULLS LAST LIMIT $1`,
        [limit],
      )
      let updated = 0
      for (const row of r.rows) {
        const metadata = { ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) }
        const hasTitle = String(metadata.seo_meta_title || '').trim()
        const hasDesc = String(metadata.seo_meta_description || '').trim()
        const hasKw = String(metadata.seo_keywords || '').trim()
        if (onlyMissing && hasTitle && hasDesc && hasKw) continue
        const generated = autoGenerateProductSeo(row)
        if (!hasTitle || !onlyMissing) metadata.seo_meta_title = generated.seo_meta_title
        if (!hasDesc || !onlyMissing) metadata.seo_meta_description = generated.seo_meta_description
        if (!hasKw || !onlyMissing) metadata.seo_keywords = generated.seo_keywords
        await client.query(`UPDATE admin_hub_products SET metadata = $1, updated_at = now() WHERE id = $2`, [
          JSON.stringify(metadata),
          row.id,
        ])
        updated += 1
      }
      res.json({ updated, scanned: r.rows.length, only_missing: onlyMissing })
    } catch (err) {
      console.error('SEO auto-generate error:', err)
      res.status(500).json({ message: err.message || 'Internal error' })
    } finally {
      await client.end().catch(() => {})
    }
  })

  return router
}

module.exports = createSeoHubRouter
module.exports.demoteH1ToH2 = demoteH1ToH2
module.exports.stripHtml = stripHtml
