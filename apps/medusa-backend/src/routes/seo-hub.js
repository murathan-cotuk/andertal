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

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHOP_PUBLIC_URL || 'https://www.andertal.com').replace(/\/+$/, '')

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

// Categories/collections/pages/blogs always render the entity's own name/title as a
// standalone <h1> in the storefront template (see CategoryTemplate.jsx, pages/[slug]/page.jsx)
// — that heading lives outside the analyzed content field entirely, so a raw scan of the
// content HTML alone would always under-count by exactly one. Products are excluded: their
// title is likewise a separate template <h1>, but the description editor's own H1 tags are
// auto-demoted to H2 on save (see demoteH1ToH2 / product_no_h1), so description content is
// expected to contribute zero h1 either way.
const withTemplateTitleH1 = (analysis) => ({
  ...analysis,
  headings: { ...analysis.headings, h1: (analysis.headings.h1 || 0) + 1 },
  headingTotal: analysis.headingTotal + 1,
  hasH1: true,
})

const scoreFromIssues = (issues) => {
  if (!issues.length) return 'good'
  if (issues.some((i) => i.severity === 'error')) return 'poor'
  return 'needs_work'
}

const buildPublicHints = (type, row, locale = 'de') => {
  const handle = row.handle || row.slug || ''
  // Shop routes are /{market}/{locale}/{slug} (see apps/shop/src/lib/seo.js publicPath).
  const loc = ['de', 'en', 'tr', 'fr', 'es', 'it'].includes(locale) ? locale : 'de'
  const market = 'de'
  const pathMap = {
    products: handle ? handle : '',
    categories: handle ? handle : '',
    collections: handle ? handle : '',
    pages: handle ? `pages/${handle}` : '',
    blogs: handle ? `pages/${handle}` : '',
  }
  const path = pathMap[type] || ''
  const url = path ? `${SITE_URL}/${market}/${loc}/${path}` : ''
  return {
    url,
    canonical: url,
    robots: 'index,follow',
    lang: loc,
    author: 'Andertal',
    publisher: 'Andertal',
  }
}

/** Template pages always render entity name as <h1> outside CMS HTML (and often only after hydration). */
const applyTemplateH1 = (analysis, type) => {
  if (!analysis) return analysis
  // Products: storefront title is H1; description H1s are demoted on save — count template as the single H1.
  if (type === 'products') {
    return {
      ...analysis,
      headings: { ...analysis.headings, h1: 1 },
      headingTotal: (analysis.headingTotal || 0) - (analysis.headings?.h1 || 0) + 1,
      hasH1: true,
    }
  }
  if (type === 'categories' || type === 'collections' || type === 'pages' || type === 'blogs') {
    return withTemplateTitleH1(analysis)
  }
  return analysis
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
    `SELECT id, name, slug, parent_id, seo_title, seo_description, long_content, metadata, updated_at,
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
        parent_id: row.parent_id || null,
        updated_at: row.updated_at,
        meta_title: title,
        meta_description: description,
        meta_keywords: keywords,
        evaluation,
        score: scoreFromIssues(evaluation.issues),
        analysis: applyTemplateH1(analyzeHtml(row.long_content || meta.richtext || ''), 'categories'),
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
        analysis: applyTemplateH1(analyzeHtml(meta.richtext || ''), 'collections'),
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
        analysis: applyTemplateH1(analyzeHtml(row.body || ''), type),
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
      analysis: applyTemplateH1(analyzeHtml(row.description || ''), 'products'),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL },
      ...buildPublicHints('products', row),
    }
  }
  if (type === 'categories') {
    const r = await client.query(
      `SELECT id, name, slug, parent_id, seo_title, seo_description, long_content, metadata, updated_at FROM admin_hub_categories WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return null
    const row = r.rows[0]
    const meta = parseMeta(row)
    const title = row.seo_title || meta.meta_title || ''
    const description = row.seo_description || meta.meta_description || ''
    const keywords = meta.keywords || meta.meta_keywords || ''
    const seoI18n = meta.seo_i18n && typeof meta.seo_i18n === 'object' ? meta.seo_i18n : {}
    const evaluation = evaluateMeta({ title, description, keywords, entityType: 'categories' })
    const contentHtml = row.long_content || meta.richtext || ''
    return {
      id: row.id,
      type: 'categories',
      label: row.name,
      handle: row.slug,
      parent_id: row.parent_id || null,
      updated_at: row.updated_at,
      content_html: contentHtml,
      meta_title: title,
      meta_description: description,
      meta_keywords: keywords,
      seo_i18n: seoI18n,
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: applyTemplateH1(analyzeHtml(contentHtml), 'categories'),
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
      analysis: applyTemplateH1(analyzeHtml(meta.richtext || ''), 'collections'),
      rules: { title: TITLE_IDEAL, description: DESC_IDEAL },
      ...buildPublicHints('collections', row),
    }
  }
  if (type === 'pages' || type === 'blogs') {
    const r = await client.query(
      `SELECT id, title, slug, body, status, page_type, meta_title, meta_description, meta_keywords,
              meta_title_i18n, meta_description_i18n, updated_at
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
      meta_title_i18n: row.meta_title_i18n && typeof row.meta_title_i18n === 'object' ? row.meta_title_i18n : {},
      meta_description_i18n: row.meta_description_i18n && typeof row.meta_description_i18n === 'object' ? row.meta_description_i18n : {},
      evaluation,
      score: scoreFromIssues(evaluation.issues),
      analysis: applyTemplateH1(analyzeHtml(row.body || ''), entityType),
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
  const locale = String(body.locale || 'de').toLowerCase()
  const isDe = !locale || locale === 'de'
  const nextHandle = body.handle !== undefined ? String(body.handle || '').trim().replace(/^\/+/, '') : undefined

  if (type === 'products') {
    const r = await client.query(`SELECT metadata, handle FROM admin_hub_products WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    if (isDe) {
      if (metaTitle !== undefined) metadata.seo_meta_title = metaTitle
      if (metaDescription !== undefined) metadata.seo_meta_description = metaDescription
      if (metaKeywords !== undefined) metadata.seo_keywords = metaKeywords
    } else {
      const seoI18n = { ...(metadata.seo_i18n && typeof metadata.seo_i18n === 'object' ? metadata.seo_i18n : {}) }
      const loc = { ...(seoI18n[locale] || {}) }
      if (metaTitle !== undefined) loc.meta_title = metaTitle
      if (metaDescription !== undefined) loc.meta_description = metaDescription
      if (metaKeywords !== undefined) loc.meta_keywords = metaKeywords
      seoI18n[locale] = loc
      metadata.seo_i18n = seoI18n
    }
    if (nextHandle !== undefined && nextHandle && nextHandle !== r.rows[0].handle) {
      const clash = await client.query(`SELECT id FROM admin_hub_products WHERE handle = $1 AND id <> $2 LIMIT 1`, [nextHandle, id])
      if (clash.rows[0]) return { error: 400, message: 'Handle already in use' }
      await client.query(`UPDATE admin_hub_products SET handle = $1, metadata = $2, updated_at = now() WHERE id = $3`, [nextHandle, JSON.stringify(metadata), id])
    } else {
      await client.query(`UPDATE admin_hub_products SET metadata = $1, updated_at = now() WHERE id = $2`, [JSON.stringify(metadata), id])
    }
    return { ok: true }
  }

  if (type === 'categories') {
    const r = await client.query(`SELECT seo_title, seo_description, metadata, slug FROM admin_hub_categories WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    let nextTitle = r.rows[0].seo_title || metadata.meta_title || ''
    let nextDesc = r.rows[0].seo_description || metadata.meta_description || ''
    let nextKw = metadata.keywords || metadata.meta_keywords || ''

    if (isDe) {
      if (metaTitle !== undefined) nextTitle = metaTitle
      if (metaDescription !== undefined) nextDesc = metaDescription
      if (metaKeywords !== undefined) nextKw = metaKeywords
      if (metaTitle !== undefined) metadata.meta_title = metaTitle
      if (metaDescription !== undefined) metadata.meta_description = metaDescription
      if (metaKeywords !== undefined) {
        metadata.keywords = metaKeywords
        metadata.meta_keywords = metaKeywords
      }
    } else {
      const seoI18n = { ...(metadata.seo_i18n && typeof metadata.seo_i18n === 'object' ? metadata.seo_i18n : {}) }
      const loc = { ...(seoI18n[locale] || {}) }
      if (metaTitle !== undefined) loc.meta_title = metaTitle
      if (metaDescription !== undefined) loc.meta_description = metaDescription
      if (metaKeywords !== undefined) loc.meta_keywords = metaKeywords
      seoI18n[locale] = loc
      metadata.seo_i18n = seoI18n
      // Evaluate against DE canonical for save gate
      nextTitle = r.rows[0].seo_title || metadata.meta_title || ''
      nextDesc = r.rows[0].seo_description || metadata.meta_description || ''
      nextKw = metadata.keywords || metadata.meta_keywords || ''
    }

    const evaluation = evaluateMeta({ title: nextTitle, description: nextDesc, keywords: nextKw, entityType: 'categories' })
    if (evaluation.issues.some((i) => i.severity === 'error')) {
      return { error: 400, message: evaluation.issues.find((i) => i.severity === 'error')?.message || 'Category SEO rules not met', evaluation }
    }

    let slug = r.rows[0].slug
    if (nextHandle !== undefined && nextHandle && nextHandle !== slug) {
      const clash = await client.query(`SELECT id FROM admin_hub_categories WHERE slug = $1 AND id <> $2 LIMIT 1`, [nextHandle, id])
      if (clash.rows[0]) return { error: 400, message: 'Slug already in use' }
      slug = nextHandle
    }

    await client.query(
      `UPDATE admin_hub_categories SET
         seo_title = $1, seo_description = $2, metadata = $3, slug = $4, updated_at = now()
       WHERE id = $5`,
      [nextTitle || null, nextDesc || null, JSON.stringify(metadata), slug, id],
    )
    return { ok: true, evaluation }
  }

  if (type === 'collections') {
    const r = await client.query(`SELECT metadata, handle FROM admin_hub_collections WHERE id = $1`, [id])
    if (!r.rows[0]) return { error: 404 }
    const metadata = { ...(r.rows[0].metadata && typeof r.rows[0].metadata === 'object' ? r.rows[0].metadata : {}) }
    if (isDe) {
      if (metaTitle !== undefined) metadata.meta_title = metaTitle
      if (metaDescription !== undefined) metadata.meta_description = metaDescription
      if (metaKeywords !== undefined) metadata.keywords = metaKeywords
    } else {
      const seoI18n = { ...(metadata.seo_i18n && typeof metadata.seo_i18n === 'object' ? metadata.seo_i18n : {}) }
      const loc = { ...(seoI18n[locale] || {}) }
      if (metaTitle !== undefined) loc.meta_title = metaTitle
      if (metaDescription !== undefined) loc.meta_description = metaDescription
      if (metaKeywords !== undefined) loc.meta_keywords = metaKeywords
      seoI18n[locale] = loc
      metadata.seo_i18n = seoI18n
    }
    if (nextHandle !== undefined && nextHandle && nextHandle !== r.rows[0].handle) {
      const clash = await client.query(`SELECT id FROM admin_hub_collections WHERE handle = $1 AND id <> $2 LIMIT 1`, [nextHandle, id])
      if (clash.rows[0]) return { error: 400, message: 'Handle already in use' }
      await client.query(`UPDATE admin_hub_collections SET handle = $1, metadata = $2, updated_at = now() WHERE id = $3`, [nextHandle, JSON.stringify(metadata), id])
    } else {
      await client.query(`UPDATE admin_hub_collections SET metadata = $1, updated_at = now() WHERE id = $2`, [JSON.stringify(metadata), id])
    }
    return { ok: true }
  }

  if (type === 'pages' || type === 'blogs') {
    const r = await client.query(
      `SELECT id, page_type, slug, meta_title, meta_description, meta_keywords, meta_title_i18n, meta_description_i18n
         FROM admin_hub_pages WHERE id = $1`,
      [id],
    )
    if (!r.rows[0]) return { error: 404 }
    const isBlog = r.rows[0].page_type === 'blog'
    if (type === 'blogs' && !isBlog) return { error: 404 }
    if (type === 'pages' && isBlog) return { error: 404 }

    let slug = r.rows[0].slug
    if (nextHandle !== undefined && nextHandle && nextHandle !== slug) {
      const clash = await client.query(`SELECT id FROM admin_hub_pages WHERE slug = $1 AND id <> $2 LIMIT 1`, [nextHandle, id])
      if (clash.rows[0]) return { error: 400, message: 'Slug already in use' }
      slug = nextHandle
    }

    if (isDe) {
      await client.query(
        `UPDATE admin_hub_pages SET
           meta_title = COALESCE($1, meta_title),
           meta_description = COALESCE($2, meta_description),
           meta_keywords = COALESCE($3, meta_keywords),
           slug = $4,
           updated_at = now()
         WHERE id = $5`,
        [
          metaTitle !== undefined ? metaTitle : null,
          metaDescription !== undefined ? metaDescription : null,
          metaKeywords !== undefined ? metaKeywords : null,
          slug,
          id,
        ],
      )
    } else {
      const titleI18n = { ...(r.rows[0].meta_title_i18n && typeof r.rows[0].meta_title_i18n === 'object' ? r.rows[0].meta_title_i18n : {}) }
      const descI18n = { ...(r.rows[0].meta_description_i18n && typeof r.rows[0].meta_description_i18n === 'object' ? r.rows[0].meta_description_i18n : {}) }
      if (metaTitle !== undefined) titleI18n[locale] = { ...(titleI18n[locale] || {}), meta_title: metaTitle, title: metaTitle }
      if (metaDescription !== undefined) descI18n[locale] = { ...(descI18n[locale] || {}), meta_description: metaDescription, description: metaDescription }
      await client.query(
        `UPDATE admin_hub_pages SET
           meta_title_i18n = $1::jsonb,
           meta_description_i18n = $2::jsonb,
           slug = $3,
           updated_at = now()
         WHERE id = $4`,
        [JSON.stringify(titleI18n), JSON.stringify(descI18n), slug, id],
      )
    }
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
    const analysis = applyTemplateH1(analyzeHtml(html), entityType)
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
          // Client-rendered template H1 is often missing from raw HTML — apply the same bump.
          analysis: applyTemplateH1(analyzeHtml(text), entityType),
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
