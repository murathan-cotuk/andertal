'use strict'

const crypto = require('crypto')

const ACCEPTED_CATEGORIES = new Set([
  'order', 'delivery', 'return', 'refund', 'payment', 'invoice',
  'account', 'bonus', 'product', 'seller', 'technical', 'privacy', 'other',
])
const PLATFORM_CATEGORIES = new Set(['payment', 'account', 'bonus', 'privacy', 'technical', 'other'])
const ORDER_CATEGORIES = new Set(['order', 'delivery', 'return', 'refund', 'invoice', 'product', 'seller'])
const TERMINAL_STATUSES = new Set(['resolved', 'closed'])
const STATUSES = new Set([
  'open', 'awaiting_seller', 'awaiting_customer', 'awaiting_support',
  'resolved', 'closed', 'reopened',
])

const TRANSITIONS = Object.freeze({
  customer: {
    close: { from: new Set(['open', 'awaiting_seller', 'awaiting_customer', 'awaiting_support', 'reopened']), to: 'closed' },
    reopen: { from: new Set(['closed', 'resolved']), to: 'reopened' },
  },
  seller: {
    close: { from: new Set(['open', 'awaiting_customer', 'awaiting_seller', 'reopened']), to: 'resolved' },
    reopen: { from: new Set(['closed', 'resolved']), to: 'reopened' },
  },
  support: {
    close: { from: new Set(['open', 'awaiting_customer', 'awaiting_seller', 'awaiting_support', 'reopened']), to: 'resolved' },
    reopen: { from: new Set(['closed', 'resolved']), to: 'reopened' },
  },
})

function normalizePlainText(value, maxLength = 10000) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function routeCategory(category) {
  const normalized = normalizePlainText(category, 50).toLowerCase()
  return {
    category: normalized,
    accepted: ACCEPTED_CATEGORIES.has(normalized),
    isPlatform: PLATFORM_CATEGORIES.has(normalized),
    requiresOrder: ORDER_CATEGORIES.has(normalized),
  }
}

function normalizeCaseView(view) {
  const normalized = normalizePlainText(view, 20).toLowerCase()
  return normalized === '' || normalized === 'open' || normalized === 'unread' ? normalized : null
}

function groupOrderItemsBySeller(items, category) {
  const routing = routeCategory(category)
  if (routing.isPlatform) return [{ sellerId: null, items: Array.isArray(items) ? items : [] }]
  const groups = new Map()
  for (const item of items || []) {
    const sellerId = String(item.seller_id || '').trim()
    if (!sellerId || sellerId === 'default') throw Object.assign(new Error('Order item has no routable seller'), { status: 422 })
    if (!groups.has(sellerId)) groups.set(sellerId, [])
    groups.get(sellerId).push(item)
  }
  return [...groups].map(([sellerId, groupedItems]) => ({ sellerId, items: groupedItems }))
}

function transitionFor(role, action, status) {
  const rule = TRANSITIONS[role]?.[action]
  if (!rule || !rule.from.has(status)) return null
  return rule.to
}

function nextStatusAfterMessage(senderRole, hasSeller) {
  if (senderRole === 'customer') return hasSeller ? 'awaiting_seller' : 'awaiting_support'
  return 'awaiting_customer'
}

function canAccessCase(actor, supportCase) {
  if (!actor || !supportCase) return false
  if (actor.role === 'customer') {
    const idMatch = actor.customerId && supportCase.customer_id && actor.customerId === supportCase.customer_id
    const emailMatch = actor.email && supportCase.customer_email &&
      actor.email.toLowerCase() === supportCase.customer_email.toLowerCase()
    return !!(idMatch || emailMatch)
  }
  if (actor.role === 'support' && actor.isSuperuser) return true
  return actor.role === 'seller' && !!actor.sellerId && actor.sellerId === supportCase.seller_id
}

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' }
  return null
}

function makeAttachmentKey(ext) {
  const day = new Date().toISOString().slice(0, 10)
  return `support-attachments/${day}/${crypto.randomUUID()}.${ext}`
}

module.exports = {
  ACCEPTED_CATEGORIES,
  PLATFORM_CATEGORIES,
  ORDER_CATEGORIES,
  TERMINAL_STATUSES,
  STATUSES,
  normalizePlainText,
  routeCategory,
  normalizeCaseView,
  groupOrderItemsBySeller,
  transitionFor,
  nextStatusAfterMessage,
  canAccessCase,
  detectFileType,
  makeAttachmentKey,
}
