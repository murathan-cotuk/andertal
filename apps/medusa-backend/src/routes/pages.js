'use strict'
const { Router } = require('express')

const pagesI18nJsonbOrNull = (v) => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  try {
    return JSON.stringify(v)
  } catch {
    return null
  }
}

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

const SUPPORT_CONTAINER_TYPES = new Set([
  'support_hero',
  'support_case_wizard',
  'support_topic_grid',
  'support_faq',
  'support_order_picker',
  'support_help_cards',
  'support_help_library',
])
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const LOCALES = new Set(['de', 'en', 'tr', 'fr', 'es', 'it'])
const PLATFORM_SUPPORT_CATEGORIES = new Set(['payment', 'account', 'bonus', 'privacy', 'technical', 'other'])
const ORDER_SUPPORT_CATEGORIES = new Set(['order', 'delivery', 'return', 'refund', 'invoice', 'product', 'seller'])
const COLOR_RE = /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|transparent)$/i
const SAFE_PATH_RE = /^\/(?!\/)[^\s<>{}\\]*$/
const HTTPS_URL_RE = /^https:\/\/[^\s<>{}\\]+$/i
const SAFE_ANCHOR_RE = /^#[a-z][a-z0-9_-]*$/i
const CSS_SIZE_RE = /^(?:0|(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vw|vh))$/
const CSS_BOX_RE = /^(?:0|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))(?:\s+(?:0|\d+(?:\.\d+)?(?:px|rem|em|%|vw|vh))){0,3}$/

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const cleanObject = (value) => {
  if (Array.isArray(value)) return value.map(cleanObject)
  if (!isPlainObject(value)) return value
  const out = Object.create(null)
  for (const [key, child] of Object.entries(value)) {
    if (!POLLUTION_KEYS.has(key)) out[key] = cleanObject(child)
  }
  return out
}

const fail = (path, message) => {
  const err = new Error(`${path}: ${message}`)
  err.statusCode = 400
  throw err
}
const text = (value, path, max, { required = false } = {}) => {
  if (value == null && !required) return undefined
  if (typeof value !== 'string') fail(path, 'must be a string')
  const result = value.trim()
  if (required && !result) fail(path, 'is required')
  if (result.length > max) fail(path, `must be at most ${max} characters`)
  return result
}
const bool = (value, path) => {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}
const integer = (value, path, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) fail(path, `must be an integer from ${min} to ${max}`)
  return value
}
const color = (value, path) => {
  const result = text(value, path, 64, { required: true })
  if (!COLOR_RE.test(result)) fail(path, 'must be a safe CSS color')
  return result
}
const url = (value, path, { optional = true } = {}) => {
  const result = text(value, path, 2048, { required: !optional })
  if (!result) return ''
  if (!SAFE_PATH_RE.test(result) && !HTTPS_URL_RE.test(result) && !SAFE_ANCHOR_RE.test(result)) fail(path, 'must be a relative path, anchor or HTTPS URL')
  return result
}
const oneOf = (value, path, allowed) => {
  if (!allowed.includes(value)) fail(path, `must be one of: ${allowed.join(', ')}`)
  return value
}
const boundedArray = (value, path, max, min = 0) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `must contain ${min}-${max} items`)
  return value
}
const copyFields = (source, target, fields, path) => {
  for (const [key, max, required] of fields) {
    if (source[key] !== undefined) target[key] = text(source[key], `${path}.${key}`, max, { required })
  }
}
const localized = (source, target, fields, path) => {
  if (source._i18n === undefined) return
  if (!isPlainObject(source._i18n)) fail(`${path}._i18n`, 'must be an object')
  const translations = Object.create(null)
  for (const [locale, values] of Object.entries(source._i18n)) {
    if (!LOCALES.has(locale) || locale === 'de') fail(`${path}._i18n.${locale}`, 'unsupported locale')
    if (!isPlainObject(values)) fail(`${path}._i18n.${locale}`, 'must be an object')
    const translated = Object.create(null)
    const allowed = new Set(fields.map(([key]) => key))
    for (const key of Object.keys(values)) if (!allowed.has(key)) fail(`${path}._i18n.${locale}.${key}`, 'unknown field')
    copyFields(values, translated, fields, `${path}._i18n.${locale}`)
    translations[locale] = translated
  }
  target._i18n = translations
}
const validateKeys = (source, path, allowed) => {
  for (const key of Object.keys(source)) if (!allowed.has(key)) fail(`${path}.${key}`, 'unknown field')
}

const COMMON_FIELDS = new Set([
  'id', 'type', 'visible', 'visible_on', 'padding', 'margin', 'content_layout', 'content_max_width', '_i18n', 'children',
])
const sanitizeCommon = (source, out, path) => {
  if (source.id !== undefined) out.id = text(source.id, `${path}.id`, 100, { required: true })
  out.type = source.type
  if (source.visible !== undefined) out.visible = bool(source.visible, `${path}.visible`)
  if (source.visible_on !== undefined) out.visible_on = oneOf(source.visible_on, `${path}.visible_on`, ['desktop', 'tablet', 'mobile', 'both'])
  if (source.padding !== undefined) {
    const padding = text(source.padding, `${path}.padding`, 100, { required: true })
    if (!CSS_BOX_RE.test(padding)) fail(`${path}.padding`, 'must be safe CSS box spacing')
    out.padding = padding
  }
  if (source.content_layout !== undefined) out.content_layout = oneOf(source.content_layout, `${path}.content_layout`, ['full', 'contained'])
  if (source.content_max_width !== undefined) {
    const size = text(source.content_max_width, `${path}.content_max_width`, 32, { required: true })
    if (!CSS_SIZE_RE.test(size)) fail(`${path}.content_max_width`, 'must be a safe CSS size')
    out.content_max_width = size
  }
  if (source.margin !== undefined) {
    if (!isPlainObject(source.margin)) fail(`${path}.margin`, 'must be an object')
    out.margin = Object.create(null)
    for (const [key, value] of Object.entries(source.margin)) {
      if (!['top', 'right', 'bottom', 'left'].includes(key)) fail(`${path}.margin.${key}`, 'unknown field')
      const spacing = text(value, `${path}.margin.${key}`, 32, { required: true })
      if (!CSS_SIZE_RE.test(spacing)) fail(`${path}.margin.${key}`, 'must be a safe CSS size')
      out.margin[key] = spacing
    }
  }
}

const sanitizeSupportContainer = (source, path) => {
  if (!isPlainObject(source)) fail(path, 'must be an object')
  const out = Object.create(null)
  sanitizeCommon(source, out, path)
  const localizedFields = []
  let allowed = new Set(COMMON_FIELDS)

  if (source.type === 'support_hero') {
    const fields = [
      ['title', 160, true], ['description', 600], ['trust_text', 240], ['search_placeholder', 160],
      ['primary_action_label', 100], ['secondary_action_label', 100], ['open_case_count_text', 160],
    ]
    fields.forEach(([key]) => allowed.add(key))
    ;['primary_action_url', 'secondary_action_url'].forEach((key) => allowed.add(key))
    ;['bg_color', 'text_color', 'accent_color'].forEach((key) => allowed.add(key))
    ;['image', 'layout'].forEach((key) => allowed.add(key))
    allowed.add('open_case_count_enabled')
    copyFields(source, out, fields, path)
    for (const key of ['primary_action_url', 'secondary_action_url']) if (source[key] !== undefined) out[key] = url(source[key], `${path}.${key}`)
    for (const key of ['bg_color', 'text_color', 'accent_color']) if (source[key] !== undefined) out[key] = color(source[key], `${path}.${key}`)
    if (source.image !== undefined) out.image = url(source.image, `${path}.image`)
    if (source.layout !== undefined) out.layout = oneOf(source.layout, `${path}.layout`, ['centered', 'split', 'image-left'])
    if (source.open_case_count_enabled !== undefined) out.open_case_count_enabled = bool(source.open_case_count_enabled, `${path}.open_case_count_enabled`)
    localizedFields.push(...fields, ['image', 2048])
  } else if (source.type === 'support_case_wizard') {
    const fields = [
      ['title', 160, true], ['description', 600], ['category_heading', 160],
      ['subtopic_heading', 160], ['order_heading', 160], ['continue_label', 80], ['back_label', 80],
    ]
    fields.forEach(([key]) => allowed.add(key))
    allowed.add('categories')
    copyFields(source, out, fields, path)
    const categories = boundedArray(source.categories, `${path}.categories`, 16, 1)
    out.categories = categories.map((category, index) => {
      const itemPath = `${path}.categories[${index}]`
      if (!isPlainObject(category)) fail(itemPath, 'must be an object')
      validateKeys(category, itemPath, new Set(['key', 'runtime_category', 'label', 'order', 'order_related', 'platform', 'subtopics', '_i18n']))
      const item = Object.create(null)
      item.key = text(category.key, `${itemPath}.key`, 64, { required: true })
      if (!/^[a-z0-9_-]+$/.test(item.key)) fail(`${itemPath}.key`, 'must be a semantic key')
      item.runtime_category = text(category.runtime_category, `${itemPath}.runtime_category`, 50, { required: true })
      if (!PLATFORM_SUPPORT_CATEGORIES.has(item.runtime_category) && !ORDER_SUPPORT_CATEGORIES.has(item.runtime_category)) {
        fail(`${itemPath}.runtime_category`, 'must be a backend-supported category')
      }
      item.label = text(category.label, `${itemPath}.label`, 120, { required: true })
      item.order = integer(category.order, `${itemPath}.order`, 0, 999)
      item.order_related = bool(category.order_related, `${itemPath}.order_related`)
      item.platform = bool(category.platform, `${itemPath}.platform`)
      if (item.platform !== PLATFORM_SUPPORT_CATEGORIES.has(item.runtime_category)) fail(`${itemPath}.platform`, 'must match runtime category routing')
      if (item.order_related !== ORDER_SUPPORT_CATEGORIES.has(item.runtime_category)) fail(`${itemPath}.order_related`, 'must match runtime category routing')
      item.subtopics = boundedArray(category.subtopics, `${itemPath}.subtopics`, 24, 1).map((subtopic, subIndex) => {
        const subPath = `${itemPath}.subtopics[${subIndex}]`
        if (!isPlainObject(subtopic)) fail(subPath, 'must be an object')
        validateKeys(subtopic, subPath, new Set(['label', 'order', '_i18n']))
        const sub = { label: text(subtopic.label, `${subPath}.label`, 160, { required: true }), order: integer(subtopic.order, `${subPath}.order`, 0, 999) }
        localized(subtopic, sub, [['label', 160]], subPath)
        return sub
      })
      localized(category, item, [['label', 120]], itemPath)
      return item
    })
    localizedFields.push(...fields)
  } else if (source.type === 'support_topic_grid') {
    const fields = [['title', 160, true], ['description', 600]]
    fields.forEach(([key]) => allowed.add(key))
    ;['topics', 'columns'].forEach((key) => allowed.add(key))
    copyFields(source, out, fields, path)
    if (source.columns !== undefined) out.columns = integer(source.columns, `${path}.columns`, 2, 4)
    out.topics = boundedArray(source.topics, `${path}.topics`, 24, 1).map((topic, index) => {
      const itemPath = `${path}.topics[${index}]`
      if (!isPlainObject(topic)) fail(itemPath, 'must be an object')
      validateKeys(topic, itemPath, new Set(['icon', 'title', 'description', 'category', 'order', '_i18n']))
      const item = {
        icon: text(topic.icon, `${itemPath}.icon`, 80, { required: true }),
        title: text(topic.title, `${itemPath}.title`, 120, { required: true }),
        description: text(topic.description, `${itemPath}.description`, 400),
        category: text(topic.category, `${itemPath}.category`, 64, { required: true }),
        order: integer(topic.order, `${itemPath}.order`, 0, 999),
      }
      if (!/^[a-z0-9_-]+$/.test(item.category)) fail(`${itemPath}.category`, 'must be a semantic category key')
      localized(topic, item, [['title', 120], ['description', 400]], itemPath)
      return item
    })
    localizedFields.push(...fields)
  } else if (source.type === 'support_order_picker') {
    const fields = [
      ['title', 160, true], ['subtitle', 240], ['guest_title', 160], ['empty_orders_text', 160],
      ['cta_other_item_label', 100], ['cta_other_problem_label', 100],
    ]
    fields.forEach(([key]) => allowed.add(key))
    ;['orders_limit', 'orders_columns_desktop', 'orders_columns_tablet', 'orders_columns_mobile', 'cta_other_item_url', 'cta_other_problem_url'].forEach((key) => allowed.add(key))
    copyFields(source, out, fields, path)
    if (source.orders_limit !== undefined) out.orders_limit = integer(source.orders_limit, `${path}.orders_limit`, 1, 24)
    for (const key of ['orders_columns_desktop', 'orders_columns_tablet', 'orders_columns_mobile']) {
      if (source[key] !== undefined) out[key] = integer(source[key], `${path}.${key}`, 1, 4)
    }
    for (const key of ['cta_other_item_url', 'cta_other_problem_url']) {
      if (source[key] !== undefined) out[key] = url(source[key], `${path}.${key}`)
    }
    localizedFields.push(...fields)
  } else if (source.type === 'support_help_cards') {
    const fields = [['title', 160, true], ['view_all_label', 100]]
    fields.forEach(([key]) => allowed.add(key))
    ;['view_all_url', 'columns_desktop', 'columns_tablet', 'columns_mobile', 'cards'].forEach((key) => allowed.add(key))
    copyFields(source, out, fields, path)
    if (source.view_all_url !== undefined) out.view_all_url = url(source.view_all_url, `${path}.view_all_url`)
    for (const key of ['columns_desktop', 'columns_tablet', 'columns_mobile']) {
      if (source[key] !== undefined) out[key] = integer(source[key], `${path}.${key}`, 1, 4)
    }
    out.cards = boundedArray(source.cards, `${path}.cards`, 12, 1).map((card, index) => {
      const itemPath = `${path}.cards[${index}]`
      if (!isPlainObject(card)) fail(itemPath, 'must be an object')
      validateKeys(card, itemPath, new Set(['id', 'icon', 'title', 'description', 'url', 'order', '_i18n']))
      const item = {
        id: text(card.id, `${itemPath}.id`, 100, { required: true }),
        icon: text(card.icon, `${itemPath}.icon`, 80, { required: true }),
        title: text(card.title, `${itemPath}.title`, 120, { required: true }),
        description: text(card.description, `${itemPath}.description`, 400),
        order: integer(card.order, `${itemPath}.order`, 0, 999),
      }
      if (card.url !== undefined) item.url = url(card.url, `${itemPath}.url`)
      localized(card, item, [['title', 120], ['description', 400]], itemPath)
      return item
    })
    localizedFields.push(...fields)
  } else if (source.type === 'support_help_library') {
    const fields = [
      ['title', 160, true], ['search_placeholder', 160], ['all_topics_label', 100], ['recommended_heading', 160],
      ['more_heading', 160], ['footer_title', 160], ['footer_body', 600], ['footer_cta_label', 100],
    ]
    fields.forEach(([key]) => allowed.add(key))
    ;['footer_cta_url', 'topics', 'articles'].forEach((key) => allowed.add(key))
    copyFields(source, out, fields, path)
    if (source.footer_cta_url !== undefined) out.footer_cta_url = url(source.footer_cta_url, `${path}.footer_cta_url`)
    out.topics = boundedArray(source.topics, `${path}.topics`, 24, 0).map((topic, index) => {
      const itemPath = `${path}.topics[${index}]`
      if (!isPlainObject(topic)) fail(itemPath, 'must be an object')
      validateKeys(topic, itemPath, new Set(['id', 'title', 'url', 'order', '_i18n']))
      const item = {
        id: text(topic.id, `${itemPath}.id`, 100, { required: true }),
        title: text(topic.title, `${itemPath}.title`, 160, { required: true }),
        order: integer(topic.order, `${itemPath}.order`, 0, 999),
      }
      if (topic.url !== undefined) item.url = url(topic.url, `${itemPath}.url`)
      localized(topic, item, [['title', 160]], itemPath)
      return item
    })
    out.articles = boundedArray(source.articles, `${path}.articles`, 24, 0).map((article, index) => {
      const itemPath = `${path}.articles[${index}]`
      if (!isPlainObject(article)) fail(itemPath, 'must be an object')
      validateKeys(article, itemPath, new Set(['id', 'title', 'excerpt', 'url', 'order', '_i18n']))
      const item = {
        id: text(article.id, `${itemPath}.id`, 100, { required: true }),
        title: text(article.title, `${itemPath}.title`, 160, { required: true }),
        excerpt: text(article.excerpt, `${itemPath}.excerpt`, 600),
        order: integer(article.order, `${itemPath}.order`, 0, 999),
      }
      if (article.url !== undefined) item.url = url(article.url, `${itemPath}.url`)
      localized(article, item, [['title', 160], ['excerpt', 600]], itemPath)
      return item
    })
    localizedFields.push(...fields)
  } else {
    const fields = [['title', 160, true], ['description', 600], ['section_label', 120], ['no_results_text', 240]]
    fields.forEach(([key]) => allowed.add(key))
    allowed.add('categories')
    copyFields(source, out, fields, path)
    out.categories = boundedArray(source.categories, `${path}.categories`, 16, 1).map((category, index) => {
      const itemPath = `${path}.categories[${index}]`
      if (!isPlainObject(category)) fail(itemPath, 'must be an object')
      validateKeys(category, itemPath, new Set(['title', 'order', 'items', '_i18n']))
      const item = {
        title: text(category.title, `${itemPath}.title`, 120, { required: true }),
        order: integer(category.order, `${itemPath}.order`, 0, 999),
      }
      item.items = boundedArray(category.items, `${itemPath}.items`, 40, 1).map((faq, faqIndex) => {
        const faqPath = `${itemPath}.items[${faqIndex}]`
        if (!isPlainObject(faq)) fail(faqPath, 'must be an object')
        validateKeys(faq, faqPath, new Set(['question', 'answer', 'order', 'action_label', 'action_url', '_i18n']))
        const entry = {
          question: text(faq.question, `${faqPath}.question`, 240, { required: true }),
          answer: text(faq.answer, `${faqPath}.answer`, 4000, { required: true }),
          order: integer(faq.order, `${faqPath}.order`, 0, 999),
        }
        if (faq.action_label !== undefined) entry.action_label = text(faq.action_label, `${faqPath}.action_label`, 100)
        if (faq.action_url !== undefined) entry.action_url = url(faq.action_url, `${faqPath}.action_url`)
        localized(faq, entry, [['question', 240], ['answer', 4000], ['action_label', 100]], faqPath)
        return entry
      })
      localized(category, item, [['title', 120]], itemPath)
      return item
    })
    localizedFields.push(...fields)
  }

  validateKeys(source, path, allowed)
  localized(source, out, localizedFields, path)
  if (source.type === 'support_hero' && out._i18n) {
    for (const [locale, values] of Object.entries(out._i18n)) {
      if (values.image !== undefined) values.image = url(values.image, `${path}._i18n.${locale}.image`)
    }
  }
  return out
}

// Nesting (docs/SUPPORT-LANDING-STEP1-ARCHITECTURE.md §2.1): any container — support-typed or
// not — may carry an optional `children[]` of the same shape, recursively. Root = depth 1, so
// depth 4 (root → child → grandchild → great-grandchild) is the first depth that's rejected.
// Every non-support type still passes through unsanitized (existing behavior) except for its
// own `children`, which are walked and depth/count-checked the same way.
const MAX_CONTAINER_DEPTH = 3
const MAX_TOTAL_CONTAINERS = 200

const sanitizeAnyContainer = (source, path, depth, counter) => {
  if (!isPlainObject(source)) fail(path, 'must be an object')
  if (depth > MAX_CONTAINER_DEPTH) fail(path, `container nesting deeper than ${MAX_CONTAINER_DEPTH} is not allowed`)
  counter.count += 1
  if (counter.count > MAX_TOTAL_CONTAINERS) fail(path, `containers (including nested children) must not exceed ${MAX_TOTAL_CONTAINERS}`)

  const out = SUPPORT_CONTAINER_TYPES.has(source?.type)
    ? sanitizeSupportContainer(source, path)
    : { ...source }

  if (source.children !== undefined) {
    const kids = boundedArray(source.children, `${path}.children`, MAX_TOTAL_CONTAINERS, 0)
    out.children = kids.map((child, index) => sanitizeAnyContainer(child, `${path}.children[${index}]`, depth + 1, counter))
  }
  return out
}

const sanitizeLandingPayload = (body) => {
  const cleaned = cleanObject(body)
  if (!isPlainObject(cleaned)) fail('body', 'must be an object')
  if (!Array.isArray(cleaned.containers)) fail('containers', 'must be an array')
  if (cleaned.settings !== undefined && !isPlainObject(cleaned.settings)) fail('settings', 'must be an object')
  const containers = cleaned.containers
  const counter = { count: 0 }
  return {
    containers: containers.map((container, index) => sanitizeAnyContainer(container, `containers[${index}]`, 1, counter)),
    settings: isPlainObject(cleaned.settings) ? cleaned.settings : {},
  }
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
    // Editing a page must not bump it to the top of the list — sort by creation date
    // (or title) rather than updated_at, which jumped around on every save.
    const sort = (req.query.sort || '').trim()
    const orderBy = sort === 'alpha' ? 'LOWER(title) ASC' : 'created_at DESC'
    let q = `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords,
      title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, created_at, updated_at
      FROM admin_hub_pages WHERE 1=1`
    const params = []
    if (status) { params.push(status); q += ` AND status = $${params.length}` }
    if (pageType) { params.push(pageType); q += ` AND page_type = $${params.length}` }
    q += ` ORDER BY ${orderBy} LIMIT $` + (params.length + 1) + ' OFFSET $' + (params.length + 2)
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
  const title_i18n = pagesI18nJsonbOrNull(b.title_i18n)
  const body_i18n = pagesI18nJsonbOrNull(b.body_i18n)
  const excerpt_i18n = pagesI18nJsonbOrNull(b.excerpt_i18n)
  const meta_title_i18n = pagesI18nJsonbOrNull(b.meta_title_i18n)
  const meta_description_i18n = pagesI18nJsonbOrNull(b.meta_description_i18n)
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_pages (title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, created_at, updated_at`,
      [title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n]
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
      `SELECT id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords,
              title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, created_at, updated_at
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
  if (b.title_i18n !== undefined) { updates.push(`title_i18n = $${i++}::jsonb`); values.push(pagesI18nJsonbOrNull(b.title_i18n)) }
  if (b.body_i18n !== undefined) { updates.push(`body_i18n = $${i++}::jsonb`); values.push(pagesI18nJsonbOrNull(b.body_i18n)) }
  if (b.excerpt_i18n !== undefined) { updates.push(`excerpt_i18n = $${i++}::jsonb`); values.push(pagesI18nJsonbOrNull(b.excerpt_i18n)) }
  if (b.meta_title_i18n !== undefined) { updates.push(`meta_title_i18n = $${i++}::jsonb`); values.push(pagesI18nJsonbOrNull(b.meta_title_i18n)) }
  if (b.meta_description_i18n !== undefined) { updates.push(`meta_description_i18n = $${i++}::jsonb`); values.push(pagesI18nJsonbOrNull(b.meta_description_i18n)) }
  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' })
  updates.push(`updated_at = now()`)
  values.push(req.params.id)
  try {
    await client.connect()
    const r = await client.query(
      `UPDATE admin_hub_pages SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, slug, body, status, page_type, featured_image, excerpt, meta_title, meta_description, meta_keywords, title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, created_at, updated_at`,
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
    let q = `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords,
      title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, updated_at
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
      `SELECT id, title, slug, body, excerpt, featured_image, page_type, meta_title, meta_description, meta_keywords,
              title_i18n, body_i18n, excerpt_i18n, meta_title_i18n, meta_description_i18n, updated_at
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
          title_i18n: row.title_i18n || null,
          excerpt,
          excerpt_i18n: row.excerpt_i18n || null,
          body: row.body,
          body_i18n: row.body_i18n || null,
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
    const { containers, settings } = sanitizeLandingPayload(req.body)
    await client.connect()
    await client.query(
      `INSERT INTO admin_hub_landing_page (id, containers, settings, updated_at) VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET containers = $1, settings = $2, updated_at = NOW()`,
      [JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message })
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
    const { containers, settings } = sanitizeLandingPayload(req.body)
    await client.connect()
    await client.query(
      `INSERT INTO admin_hub_landing_categories (category_id, containers, settings, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (category_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
      [categoryId, JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message })
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
    const { containers, settings } = sanitizeLandingPayload(req.body)
    await client.connect()
    const pageId = req.params.pageId
    await client.query(
      `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (page_id) DO UPDATE SET containers = $2, settings = $3, updated_at = NOW()`,
      [pageId, JSON.stringify(containers), JSON.stringify(settings)]
    )
    res.json({ ok: true, containers, settings })
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ message: err.message })
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}

// ── API-driven page settings (/bestsellers, /sales — hardcoded pages, not CMS containers) ──
const API_PAGE_SLUGS = new Set(['bestsellers', 'sales'])
const API_SORT_MODES = new Set(['sales', 'views', 'rating', 'newest', 'random'])

const apiPageSettingsGET = async (req, res) => {
  const slug = (req.params.slug || '').trim()
  if (!API_PAGE_SLUGS.has(slug)) return res.status(404).json({ message: 'Unknown API page' })
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `SELECT page_slug, title_i18n, subtitle_i18n, max_items, sort_mode, updated_at FROM admin_hub_api_page_settings WHERE page_slug = $1`,
      [slug]
    )
    res.json(r.rows[0] || { page_slug: slug, title_i18n: null, subtitle_i18n: null, max_items: null, sort_mode: 'sales', updated_at: null })
  } catch (err) {
    console.error('API page settings GET error:', err)
    res.status(500).json({ message: (err && err.message) || 'Internal server error' })
  } finally {
    await client.end().catch(() => {})
  }
}
const apiPageSettingsPUT = async (req, res) => {
  const slug = (req.params.slug || '').trim()
  if (!API_PAGE_SLUGS.has(slug)) return res.status(404).json({ message: 'Unknown API page' })
  const b = req.body || {}
  const title_i18n = pagesI18nJsonbOrNull(b.title_i18n)
  const subtitle_i18n = pagesI18nJsonbOrNull(b.subtitle_i18n)
  const max_items = b.max_items != null && Number.isFinite(Number(b.max_items)) ? Math.min(Math.max(Number(b.max_items), 4), 50) : null
  const sort_mode = API_SORT_MODES.has(b.sort_mode) ? b.sort_mode : 'sales'
  const client = getDbClient()
  if (!client) return res.status(503).json({ message: 'Database not configured' })
  try {
    await client.connect()
    const r = await client.query(
      `INSERT INTO admin_hub_api_page_settings (page_slug, title_i18n, subtitle_i18n, max_items, sort_mode, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (page_slug) DO UPDATE SET title_i18n = $2, subtitle_i18n = $3, max_items = $4, sort_mode = $5, updated_at = now()
       RETURNING page_slug, title_i18n, subtitle_i18n, max_items, sort_mode, updated_at`,
      [slug, title_i18n, subtitle_i18n, max_items, sort_mode]
    )
    res.json(r.rows[0])
  } catch (err) {
    console.error('API page settings PUT error:', err)
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

  router.get('/admin-hub/v1/api-page-settings/:slug', apiPageSettingsGET)
  router.put('/admin-hub/v1/api-page-settings/:slug', apiPageSettingsPUT)
  router.get('/store/api-page-settings/:slug', apiPageSettingsGET)

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
module.exports._sanitizeLandingPayload = sanitizeLandingPayload
