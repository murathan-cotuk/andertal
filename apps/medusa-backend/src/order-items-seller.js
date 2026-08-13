'use strict'

/**
 * Enrich store_order_items with sku/ean and (when needed) resolved seller_id,
 * then optionally filter to the calling seller's lines only.
 */

function normalizeEan(v) {
  return String(v || '').replace(/\D/g, '')
}

function parseVariants(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function eanFromProductRow(p, variantId) {
  const meta = p?.metadata && typeof p.metadata === 'object' ? p.metadata : {}
  let ean = normalizeEan(meta.ean)
  const variants = parseVariants(p?.variants)
  if (variantId && variants.length) {
    const vid = String(variantId)
    const match = variants.find((v) => {
      if (!v) return false
      if (v.id != null && String(v.id) === vid) return true
      if (v.variant_id != null && String(v.variant_id) === vid) return true
      // Cart sometimes stores productId-v-N
      const m = vid.match(/-v-(\d+)$/)
      if (m && String(v.index ?? v.i ?? '') === m[1]) return true
      return false
    })
    if (match) {
      const ve = normalizeEan(match.ean || match.barcode || match.gtin)
      if (ve) ean = ve
    }
  }
  if (!ean && variants.length === 1) {
    ean = normalizeEan(variants[0].ean || variants[0].barcode || variants[0].gtin)
  }
  return ean || ''
}

// Mirrors eanFromProductRow: a product row with variants is an umbrella record — the
// purchased variant's own sku must win over the umbrella row's top-level sku.
function skuFromProductRow(p, variantId) {
  let sku = String(p?.sku || '').trim()
  const variants = parseVariants(p?.variants)
  if (variantId && variants.length) {
    const vid = String(variantId)
    const match = variants.find((v) => {
      if (!v) return false
      if (v.id != null && String(v.id) === vid) return true
      if (v.variant_id != null && String(v.variant_id) === vid) return true
      const m = vid.match(/-v-(\d+)$/)
      if (m && String(v.index ?? v.i ?? '') === m[1]) return true
      return false
    })
    if (match && match.sku) sku = String(match.sku).trim()
  } else if (!sku && variants.length === 1 && variants[0].sku) {
    sku = String(variants[0].sku).trim()
  }
  return sku || ''
}

/**
 * Load sku/ean/seller for a list of order-item rows.
 * @param {import('pg').Client} client
 * @param {Array<object>} itemRows raw store_order_items rows
 * @returns {Promise<Array<object>>}
 */
async function enrichOrderItemRows(client, itemRows) {
  const rows = Array.isArray(itemRows) ? itemRows : []
  if (!rows.length) return []

  const productIds = [...new Set(rows.map((r) => String(r.product_id || '').trim()).filter(Boolean))]
  const productById = {}
  const listingSkuByKey = {}
  const listingSellersByProduct = {}

  if (productIds.length) {
    const pr = await client.query(
      `SELECT id::text AS id, sku, metadata, variants, seller_id
       FROM admin_hub_products
       WHERE id::text = ANY($1::text[])`,
      [productIds],
    )
    for (const p of pr.rows || []) productById[String(p.id)] = p

    const lr = await client.query(
      `SELECT product_id::text AS product_id, seller_id, sku
       FROM admin_hub_seller_listings
       WHERE product_id::text = ANY($1::text[])`,
      [productIds],
    )
    for (const l of lr.rows || []) {
      const pid = String(l.product_id)
      const sid = String(l.seller_id || '').trim()
      if (!sid) continue
      const key = `${pid}::${sid}`
      if (l.sku) listingSkuByKey[key] = String(l.sku).trim()
      if (!listingSellersByProduct[pid]) listingSellersByProduct[pid] = []
      listingSellersByProduct[pid].push(sid)
    }
  }

  return rows.map((r) => {
    const pid = String(r.product_id || '').trim()
    const p = productById[pid] || null
    const storedSeller = String(r.seller_id || '').trim()
    const storedReal = storedSeller && storedSeller !== 'default' ? storedSeller : ''
    const productSellerRaw = String(p?.seller_id || '').trim()
    const productSeller = productSellerRaw && productSellerRaw !== 'default' ? productSellerRaw : ''
    const listingSellers = listingSellersByProduct[pid] || []
    const otherListers = listingSellers.filter((s) => s && s !== productSeller)
    let resolvedSeller = storedReal
    if (!resolvedSeller) {
      // Unstamped: catalog owner only when nobody else lists this product.
      if (productSeller && otherListers.length === 0) resolvedSeller = productSeller
      else if (!productSeller && listingSellers.length === 1) resolvedSeller = listingSellers[0]
    }
    const listingSku = resolvedSeller ? listingSkuByKey[`${pid}::${resolvedSeller}`] : ''
    const sku = String(listingSku || skuFromProductRow(p, r.variant_id) || '').trim()
    const ean = eanFromProductRow(p, r.variant_id)
    return {
      id: r.id,
      variant_id: r.variant_id,
      product_id: r.product_id,
      quantity: r.quantity,
      unit_price_cents: r.unit_price_cents,
      title: r.title,
      thumbnail: r.thumbnail,
      product_handle: r.product_handle,
      seller_id: resolvedSeller || null,
      listing_seller_ids: listingSellers,
      sku: sku || null,
      ean: ean || null,
    }
  })
}

/**
 * Keep only lines that belong to sellerId.
 * Stamped item.seller_id wins. Unstamped lines are not guessed when other sellers list the product.
 */
function filterItemsForSeller(items, sellerId, { isSuperuser = false } = {}) {
  if (isSuperuser || !sellerId) return items
  const sid = String(sellerId).trim()
  if (!sid || sid === 'default') return items
  return (items || []).filter((it) => {
    const lineSeller = String(it.seller_id || '').trim()
    if (lineSeller && lineSeller !== 'default') return lineSeller === sid
    const listings = Array.isArray(it.listing_seller_ids) ? it.listing_seller_ids : []
    const others = listings.filter((s) => s && s !== sid)
    if (others.length > 0) return false
    if (listings.length === 1 && listings[0] === sid) return true
    return false
  })
}

function itemsSubtotalCents(items) {
  return (items || []).reduce(
    (sum, it) => sum + Number(it.unit_price_cents || 0) * Number(it.quantity || 1),
    0,
  )
}

module.exports = {
  enrichOrderItemRows,
  filterItemsForSeller,
  itemsSubtotalCents,
  normalizeEan,
}
