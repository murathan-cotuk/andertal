'use strict'

/**
 * Storefront category tree: slim payload + accurate has_products.
 *
 * The old path loaded every TypeORM column (including long_content) for 10k+
 * categories, then fetched up to 10k full product objects just to mark which
 * categories have shop-visible products. That produced multi-MB JSON, OOM
 * crashes, and a shop menu that fell back to a single CMS item with no image.
 */

const { mapAdminHubCategoryPgRow, buildAdminHubCategoryTreeFromFlat } = require('./categories-helpers')

function unwrapCategoryImageValue(raw, depth = 0) {
  if (raw == null || raw === '' || depth > 4) return ''
  if (Array.isArray(raw)) return unwrapCategoryImageValue(raw[0], depth + 1)
  if (typeof raw === 'object') {
    return unwrapCategoryImageValue(raw.url || raw.src || raw.path || '', depth + 1)
  }
  const s = String(raw).trim()
  if (!s || s === '[object Object]' || s === 'null' || s === 'undefined') return ''
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed) && parsed[0]) return unwrapCategoryImageValue(parsed[0], depth + 1)
    } catch (_) {}
  }
  return s
}

function pickCategoryImageRaw(node) {
  if (!node) return ''
  const meta = node.metadata && typeof node.metadata === 'object' ? node.metadata : {}
  const candidates = [
    node.image_url,
    meta.image_url,
    meta.imageUrl,
    node.banner_image_url,
    meta.banner_image_url,
  ]
  for (const c of candidates) {
    const parsed = unwrapCategoryImageValue(c)
    if (parsed) return parsed
  }
  return ''
}

function productCoverFromMetadata(meta) {
  if (!meta || typeof meta !== 'object') return ''
  const fromThumb = unwrapCategoryImageValue(meta.thumbnail)
  if (fromThumb) return fromThumb
  const media = meta.media
  if (Array.isArray(media) && media[0]) {
    const m = media[0]
    const url = typeof m === 'string' ? m : unwrapCategoryImageValue(m)
    if (url) return url
  } else if (typeof media === 'string') {
    const url = unwrapCategoryImageValue(media)
    if (url) return url
  }
  return unwrapCategoryImageValue(meta.image_url || meta.image)
}

function pushCategoryId(ids, value) {
  if (value == null) return
  const s = String(value).trim().toLowerCase()
  if (s) ids.add(s)
}

function collectRefsFromProductMetadata(meta, ids, slugs, thumbsByCatId) {
  const m = meta && typeof meta === 'object' ? meta : {}
  const cover = productCoverFromMetadata(m)
  const localIds = new Set()
  pushCategoryId(localIds, m.admin_category_id)
  pushCategoryId(localIds, m.category_id)
  if (Array.isArray(m.category_ids)) {
    m.category_ids.forEach((x) => pushCategoryId(localIds, x))
  } else if (typeof m.category_ids === 'string' && m.category_ids.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(m.category_ids)
      if (Array.isArray(parsed)) parsed.forEach((x) => pushCategoryId(localIds, x))
    } catch (_) {}
  }
  for (const id of localIds) {
    ids.add(id)
    if (cover && !thumbsByCatId.has(id)) thumbsByCatId.set(id, cover)
  }
  const slug = String(m.category_slug || '').trim().toLowerCase().replace(/^\//, '')
  if (slug) {
    slugs.add(slug)
    if (cover && !thumbsByCatId.has(`slug:${slug}`)) thumbsByCatId.set(`slug:${slug}`, cover)
  }
}

const PUBLISHED_PRODUCTS_SQL = `
  SELECT seller_id, metadata
  FROM admin_hub_products
  WHERE LOWER(TRIM(COALESCE(status, ''))) IN ('published', 'active')
    AND LOWER(TRIM(COALESCE(metadata->>'_catalog_approval_pending', ''))) NOT IN ('true', 't')
    AND NOT (
      jsonb_typeof(metadata->'_pending_catalog_metafields') = 'array'
      AND jsonb_array_length(COALESCE(metadata->'_pending_catalog_metafields', '[]'::jsonb)) > 0
    )
`

const VISIBLE_SELLER_SQL = `
  AND (
    COALESCE(NULLIF(TRIM(seller_id), ''), 'default') IN ('', 'default')
    OR EXISTS (
      SELECT 1 FROM seller_users su
      WHERE TRIM(su.seller_id) = TRIM(admin_hub_products.seller_id)
        AND LENGTH(TRIM(su.seller_id)) > 0
        AND LOWER(COALESCE(su.approval_status, '')) NOT IN ('rejected', 'suspended')
    )
  )
`

async function collectPublishedProductCategoryRefs(queryFn) {
  const ids = new Set()
  const slugs = new Set()
  const thumbsByCatId = new Map()
  let rows = []
  try {
    const res = await queryFn(`${PUBLISHED_PRODUCTS_SQL} ${VISIBLE_SELLER_SQL}`)
    rows = res?.rows || []
  } catch (_) {
    try {
      const res = await queryFn(PUBLISHED_PRODUCTS_SQL)
      rows = res?.rows || []
    } catch (__) {
      return { ids, slugs, thumbsByCatId }
    }
  }
  for (const row of rows) {
    collectRefsFromProductMetadata(row.metadata, ids, slugs, thumbsByCatId)
  }
  return { ids, slugs, thumbsByCatId }
}

function annotateCategoryTreeHasProducts(tree, refs) {
  const ids = refs?.ids instanceof Set ? refs.ids : new Set()
  const slugs = refs?.slugs instanceof Set ? refs.slugs : new Set()
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (!n) continue
      walk(n.children)
      const idHit = ids.has(String(n.id || '').trim().toLowerCase())
      const slugHit = slugs.has(String(n.slug || n.handle || '').trim().toLowerCase().replace(/^\//, ''))
      const childHit = (n.children || []).some((c) => c && c.has_products)
      n.has_products = !!(idHit || slugHit || childHit)
    }
  }
  walk(tree)
  return tree
}

function pruneEmptyCategoryTree(nodes) {
  const out = []
  for (const n of nodes || []) {
    if (!n || !n.has_products) continue
    out.push({ ...n, children: pruneEmptyCategoryTree(n.children) })
  }
  return out
}

function applyProductImageFallback(tree, thumbsByCatId) {
  if (!thumbsByCatId || thumbsByCatId.size === 0) return tree
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (!n) continue
      walk(n.children)
      if (pickCategoryImageRaw(n)) continue
      const idKey = String(n.id || '').trim().toLowerCase()
      const slugKey = `slug:${String(n.slug || n.handle || '').trim().toLowerCase().replace(/^\//, '')}`
      const direct = thumbsByCatId.get(idKey) || thumbsByCatId.get(slugKey)
      if (direct) {
        n.image_url = direct
        continue
      }
      const child = (n.children || []).find((c) => c && pickCategoryImageRaw(c))
      if (child) n.image_url = pickCategoryImageRaw(child)
    }
  }
  walk(tree)
  return tree
}

function slimStoreCategoryNode(node, resolveUploadUrl) {
  if (!node) return null
  const metaIn = node.metadata && typeof node.metadata === 'object' ? node.metadata : {}
  const imageRaw = pickCategoryImageRaw(node)
  const bannerRaw = unwrapCategoryImageValue(node.banner_image_url || metaIn.banner_image_url)
  const resolvedImage = (typeof resolveUploadUrl === 'function' ? resolveUploadUrl(imageRaw) : imageRaw) || imageRaw || null
  const resolvedBanner = (typeof resolveUploadUrl === 'function' ? resolveUploadUrl(bannerRaw) : bannerRaw) || bannerRaw || null
  const translations = metaIn.translations && typeof metaIn.translations === 'object' ? metaIn.translations : undefined
  const children = Array.isArray(node.children)
    ? node.children.map((c) => slimStoreCategoryNode(c, resolveUploadUrl)).filter(Boolean)
    : []
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    title: node.name,
    handle: node.slug,
    parent_id: node.parent_id || null,
    active: node.active,
    is_visible: node.is_visible,
    sort_order: node.sort_order,
    has_products: !!node.has_products,
    banner_image_url: resolvedBanner || null,
    image_url: resolvedImage || null,
    metadata: {
      ...(resolvedImage ? { image_url: resolvedImage } : {}),
      ...(resolvedBanner ? { banner_image_url: resolvedBanner } : {}),
      ...(translations ? { translations } : {}),
    },
    children,
  }
}

function slimStoreCategoryTree(tree, resolveUploadUrl) {
  return (tree || []).map((n) => slimStoreCategoryNode(n, resolveUploadUrl)).filter(Boolean)
}

const STORE_TREE_SQL = `
  SELECT id, name, slug, parent_id, active, is_visible, has_collection, sort_order,
         banner_image_url, metadata
  FROM admin_hub_categories
  WHERE active = true
  ORDER BY sort_order ASC, name ASC
`

async function loadSlimStoreCategoryTree({ query, resolveUploadUrl }) {
  const catRes = await query(STORE_TREE_SQL)
  let flat = (catRes?.rows || []).map(mapAdminHubCategoryPgRow)
  flat = flat.filter((c) => c && c.is_visible !== false)
  const tree = buildAdminHubCategoryTreeFromFlat(flat)
  const refs = await collectPublishedProductCategoryRefs(query)
  annotateCategoryTreeHasProducts(tree, refs)
  const pruned = pruneEmptyCategoryTree(tree)
  // NOTE: no product-thumbnail fallback here. The menu/list image must be the
  // category's own Kategoriebild/banner (set in Sellercentral › Content ›
  // Categories) or nothing — borrowing a random product photo produced
  // misleading thumbnails (e.g. a vape bottle on "Dishwashers").
  return slimStoreCategoryTree(pruned, resolveUploadUrl)
}

function findStoreCategoryNodeById(nodes, id) {
  const want = String(id || '').trim().toLowerCase()
  if (!want) return null
  for (const n of nodes || []) {
    if (!n) continue
    if (String(n.id || '').trim().toLowerCase() === want) return n
    const hit = findStoreCategoryNodeById(n.children, id)
    if (hit) return hit
  }
  return null
}

function findStoreCategoryNodeBySlug(nodes, slug) {
  const want = String(slug || '').trim().toLowerCase().replace(/^\//, '')
  if (!want) return null
  for (const n of nodes || []) {
    if (!n) continue
    const s = String(n.slug || n.handle || '').trim().toLowerCase().replace(/^\//, '')
    if (s === want) return n
    const hit = findStoreCategoryNodeBySlug(n.children, slug)
    if (hit) return hit
  }
  return null
}

/** Ancestors from root → direct parent (excludes the matched node). */
function findStoreCategoryAncestors(nodes, predicate, path = []) {
  for (const n of nodes || []) {
    if (!n) continue
    if (predicate(n)) return path
    const found = findStoreCategoryAncestors(n.children, predicate, [...path, n])
    if (found) return found
  }
  return null
}

/**
 * Amazon-style shallow slice of an already-built slim tree.
 * depth=1 → current level only (children emptied, has_children set).
 * parent_id → return that node's children as the new roots.
 */
function truncateStoreCategoryDepth(nodes, maxDepth, currentDepth = 1) {
  const out = []
  for (const n of nodes || []) {
    if (!n) continue
    const kids = Array.isArray(n.children) ? n.children : []
    const hasKids = kids.some((c) => c && c.has_products !== false)
    const subtreeIds = collectSubtreeIds(n)
    if (currentDepth >= maxDepth) {
      out.push({ ...n, children: [], has_children: hasKids, subtree_ids: subtreeIds })
    } else {
      out.push({
        ...n,
        has_children: hasKids,
        subtree_ids: subtreeIds,
        children: truncateStoreCategoryDepth(kids, maxDepth, currentDepth + 1),
      })
    }
  }
  return out
}

function collectSubtreeIds(node) {
  const out = []
  const walk = (n) => {
    if (!n) return
    if (n.id != null && String(n.id).trim()) out.push(String(n.id))
    for (const c of n.children || []) walk(c)
  }
  walk(node)
  return out
}

function annotateHasChildrenOnly(nodes) {
  const out = []
  for (const n of nodes || []) {
    if (!n) continue
    const kids = Array.isArray(n.children) ? n.children : []
    out.push({
      ...n,
      has_children: kids.some((c) => c && c.has_products !== false),
      children: annotateHasChildrenOnly(kids),
    })
  }
  return out
}

function sliceStoreCategoryTree(tree, { depth, parentId } = {}) {
  let nodes = Array.isArray(tree) ? tree : []
  if (parentId != null && String(parentId).trim() !== '') {
    const parent = findStoreCategoryNodeById(nodes, parentId)
    nodes = parent && Array.isArray(parent.children) ? parent.children : []
  }
  const d = depth == null || depth === '' ? null : Number(depth)
  if (Number.isFinite(d) && d > 0) {
    // Truncated responses carry subtree_ids so search/facet filters still work.
    nodes = truncateStoreCategoryDepth(nodes, d)
  } else {
    // Full tree: only annotate has_children — never attach subtree_ids (payload bloat).
    nodes = annotateHasChildrenOnly(nodes)
  }
  return nodes
}

/** Strip nested children for breadcrumb path nodes (keep leaf children separately). */
function slimPathNode(node) {
  if (!node) return null
  const { children, ...rest } = node
  const kids = Array.isArray(children) ? children : []
  return {
    ...rest,
    has_children: kids.some((c) => c && c.has_products !== false),
    subtree_ids: collectSubtreeIds(node),
    children: [],
  }
}

function buildStoreCategoryPathPayload(tree, { slug, id } = {}) {
  let current = null
  let ancestors = []
  if (id) {
    current = findStoreCategoryNodeById(tree, id)
    if (current) {
      ancestors = findStoreCategoryAncestors(
        tree,
        (n) => String(n.id || '').trim().toLowerCase() === String(id).trim().toLowerCase(),
      ) || []
    }
  }
  if (!current && slug) {
    const want = String(slug).trim().toLowerCase().replace(/^\//, '')
    current = findStoreCategoryNodeBySlug(tree, want)
    if (current) {
      ancestors = findStoreCategoryAncestors(
        tree,
        (n) => String(n.slug || n.handle || '').trim().toLowerCase().replace(/^\//, '') === want,
      ) || []
    }
  }
  if (!current) return null
  const children = truncateStoreCategoryDepth(
    Array.isArray(current.children) ? current.children : [],
    1,
  )
  return {
    category: slimPathNode(current),
    ancestors: ancestors.map(slimPathNode).filter(Boolean),
    children,
    path: [...ancestors.map(slimPathNode), slimPathNode(current)].filter(Boolean),
  }
}

/** Flat lookup by ids (no deep nesting) — for brand/search facet labels. */
function pickStoreCategoryNodesByIds(tree, ids) {
  const want = new Set(
    (Array.isArray(ids) ? ids : String(ids || '').split(','))
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  )
  if (want.size === 0) return []
  const out = []
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (!n) continue
      if (want.has(String(n.id || '').trim().toLowerCase())) {
        out.push(slimPathNode(n))
        want.delete(String(n.id || '').trim().toLowerCase())
        if (want.size === 0) return
      }
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree)
  return out
}

module.exports = {
  unwrapCategoryImageValue,
  pickCategoryImageRaw,
  productCoverFromMetadata,
  collectRefsFromProductMetadata,
  collectPublishedProductCategoryRefs,
  annotateCategoryTreeHasProducts,
  pruneEmptyCategoryTree,
  applyProductImageFallback,
  slimStoreCategoryNode,
  slimStoreCategoryTree,
  loadSlimStoreCategoryTree,
  findStoreCategoryNodeById,
  findStoreCategoryNodeBySlug,
  findStoreCategoryAncestors,
  truncateStoreCategoryDepth,
  collectSubtreeIds,
  annotateHasChildrenOnly,
  sliceStoreCategoryTree,
  slimPathNode,
  buildStoreCategoryPathPayload,
  pickStoreCategoryNodesByIds,
  STORE_TREE_SQL,
}
