'use strict'

/**
 * Pure mapping between SCX (JTL-Wawi) data and Andertal (admin_hub_products / store_orders).
 */

const PRICE_TYPE_ID = 'ANDERTAL_B2C'

/**
 * Channel global attributes registered at setup (PUT /v1/channel/attribute/global). JTL-Wawi
 * shows them on every listing; values come back in channelAttributeList and are written to the
 * product metadata keys used by the Sellercentral form / GPSR gate (no invented fields).
 */
const GLOBAL_ATTRIBUTES = [
  { attributeId: 'manufacturer', displayName: 'Hersteller (GPSR)', type: 'smalltext', required: true, metaKey: 'manufacturer' },
  { attributeId: 'manufacturer_information', displayName: 'Herstelleranschrift (GPSR)', type: 'text', required: true, metaKey: 'manufacturer_information' },
  { attributeId: 'responsible_person_information', displayName: 'Verantwortliche Person in der EU (GPSR)', type: 'text', required: true, metaKey: 'responsible_person_information' },
  { attributeId: 'unit_type', displayName: 'Grundpreis-Einheit', type: 'enum', metaKey: 'unit_type', values: ['g', 'kg', 'ml', 'l', 'stück'].map((v) => ({ value: v })) },
  { attributeId: 'unit_value', displayName: 'Inhalt (Menge)', type: 'decimal', metaKey: 'unit_value' },
  { attributeId: 'weee_number', displayName: 'WEEE-Reg.-Nr.', type: 'smalltext', metaKey: 'weee_number' },
  { attributeId: 'eprel_number', displayName: 'EPREL-Nummer', type: 'smalltext', metaKey: 'eprel_number' },
]

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Unit gross price (EUR) for our price type (fallback: first price list), quantity 1 tier. */
function pickPrice(priceList, priceTypeId = PRICE_TYPE_ID) {
  const lists = Array.isArray(priceList) ? priceList : []
  const pc = lists.find((p) => String(p?.id) === priceTypeId) || lists[0]
  const tiers = Array.isArray(pc?.quantityPriceList) ? pc.quantityPriceList : []
  const tier = tiers.find((t) => toNum(t?.quantity ?? 1) === 1) || tiers[0]
  if (!tier) return null
  if (tier.currency && String(tier.currency).toUpperCase() !== 'EUR') return null
  const amount = toNum(tier.amount)
  return amount != null && amount > 0 ? Math.round(amount * 100) / 100 : null
}

const parseQty = (v) => {
  const n = toNum(v)
  return n != null && n > 0 ? Math.floor(n) : 0
}

function attributesToMeta(list) {
  const out = {}
  const byId = new Map(GLOBAL_ATTRIBUTES.map((a) => [a.attributeId, a]))
  for (const a of Array.isArray(list) ? list : []) {
    const def = byId.get(String(a?.attributeId || ''))
    if (def && a.value != null && String(a.value).trim() !== '') out[def.metaKey] = String(a.value).trim()
  }
  return out
}

/**
 * One sellable unit of an offer event: the offer itself, or one entry of its variationList.
 * @returns {{ offerId, channelOfferId, product: object, imageUrls: string[], optionValue: string|null }}
 */
function unitToProduct({ offer, unit, sellerId, isVariation }) {
  const sku = String(unit.sku || offer.sku || '').trim()
  const gtin = String(unit.gtin || (!isVariation ? offer.gtin : '') || '').trim()
  const title = String(unit.title || offer.title || '').trim()
  const images = [
    ...(isVariation ? (Array.isArray(unit.pictureList) ? unit.pictureList : []) : []),
    offer.mainPicture,
    ...(Array.isArray(offer.pictureList) ? offer.pictureList : []),
  ].filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
  const price = pickPrice(unit.priceList || offer.priceList)
  const optionValue = isVariation
    ? (Array.isArray(unit.variationDimensionList) ? unit.variationDimensionList.map((d) => String(d?.value ?? '').trim()).filter(Boolean).join(' / ') : '') || title
    : null
  return {
    offerId: Number(unit.offerId || offer.offerId),
    channelOfferId: offer.channelOfferId || null,
    optionValue,
    imageUrls: [...new Set(images)],
    product: {
      title,
      description: String(offer.description || '').trim() || null,
      sku: sku || null,
      price,
      inventory: parseQty(unit.quantity ?? offer.quantity),
      seller_id: sellerId,
      metadata: {
        ...attributesToMeta(offer.channelAttributeList),
        ...(gtin ? { ean: gtin } : {}),
        ...(offer.brand ? { brand_name: String(offer.brand).trim() } : {}),
        ...(offer.channelCategoryId ? { category_id: String(offer.channelCategoryId), category_ids: [String(offer.channelCategoryId)] } : {}),
        seller_id: sellerId,
        ...(price != null ? { prices: { DE: { brutto_cents: Math.round(price * 100) } } } : {}),
        erp: { source: 'jtl_scx', offer_id: Number(unit.offerId || offer.offerId), parent_offer_id: isVariation ? Number(offer.offerId) : null },
      },
    },
  }
}

/** Seller:Offer.New / Seller:Offer.Update → sellable units (variations become own products). */
function offerEventToUnits(offer, sellerId) {
  const vars = Array.isArray(offer?.variationList) ? offer.variationList.filter((v) => v && v.offerId) : []
  if (!vars.length) return [unitToProduct({ offer, unit: offer, sellerId, isVariation: false })]
  return vars.map((v) => unitToProduct({ offer, unit: v, sellerId, isVariation: true }))
}

const money = (cents) => (Math.round(Number(cents) || 0) / 100).toFixed(2)

function splitStreet(line) {
  const s = String(line || '').trim()
  const m = s.match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/)
  return m ? { street: m[1].trim(), houseNumber: m[2].replace(/\s+/g, '') } : { street: s, houseNumber: '' }
}

function addressFromOrder(o, prefix = '') {
  const pick = (k) => o[`${prefix}${k}`] ?? (prefix ? o[k] : null)
  const { street, houseNumber } = splitStreet(pick('address_line1'))
  return {
    firstName: o.first_name || '',
    lastName: o.last_name || o.first_name || '-',
    street: street || '-',
    houseNumber,
    ...(pick('address_line2') ? { addition: String(pick('address_line2')) } : {}),
    postcode: String(pick('postal_code') || ''),
    city: String(pick('city') || '-'),
    country: String(pick('country') || 'DE').toUpperCase().slice(0, 2),
    ...(o.phone ? { phone: String(o.phone) } : {}),
  }
}

/**
 * One Andertal order (seller's part) → SCX order (status ACCEPTED, paid, with addresses).
 * @param {{ order, items: Array<{id, quantity, unit_price_cents, title, sku?, offer_id?}>, sellerId, shippingCents, vatPercent }} a
 */
function buildScxOrder({ order, items, sellerId, shippingCents = 0, vatPercent = null }) {
  const num = order.order_number != null ? String(order.order_number) : String(order.id)
  const created = new Date(order.created_at || Date.now()).toISOString()
  const tax = vatPercent != null ? { taxPercent: String(vatPercent) } : {}
  const orderItem = items.map((it) => ({
    orderItemId: String(it.id),
    type: 'ITEM',
    itemStatus: 'UNSHIPPED',
    itemPaymentStatus: 'PAID',
    grossPrice: money(it.unit_price_cents),
    total: money(Number(it.unit_price_cents) * Number(it.quantity || 1)),
    quantity: String(Number(it.quantity || 1)),
    ...(it.sku ? { sku: String(it.sku) } : {}),
    ...(it.offer_id ? { offerId: Number(it.offer_id) } : {}),
    title: String(it.title || '').slice(0, 255),
    ...tax,
  }))
  if (Number(shippingCents) > 0) {
    orderItem.push({ orderItemId: `SHIP-${num}`, type: 'SHIPPING', grossPrice: money(shippingCents), shippingGroup: 'Standard', ...tax })
  }
  const billingSame = order.billing_same_as_shipping !== false || !order.billing_address_line1
  return {
    sellerId,
    orderStatus: 'ACCEPTED',
    orderId: `A${num}`,
    purchasedAt: created,
    lastChangedAt: new Date(order.updated_at || order.created_at || Date.now()).toISOString(),
    currency: 'EUR',
    paymentMethod: 'Andertal',
    paymentReference: num,
    orderItem,
    shippingAddress: addressFromOrder(order),
    billingAddress: billingSame ? addressFromOrder(order) : addressFromOrder(order, 'billing_'),
    buyer: { ...(order.email ? { email: String(order.email) } : {}), ...(order.customer_vat_id ? { vatId: String(order.customer_vat_id) } : {}) },
    salesChannelName: 'Andertal',
    language: String(order.locale || 'de').slice(0, 2),
  }
}

module.exports = {
  PRICE_TYPE_ID, GLOBAL_ATTRIBUTES, pickPrice, parseQty, attributesToMeta, offerEventToUnits, buildScxOrder, splitStreet,
}
