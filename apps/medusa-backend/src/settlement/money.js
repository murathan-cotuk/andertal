'use strict'

/**
 * Pure settlement arithmetic — no DB, no Stripe. Every amount is an integer number of cents.
 * Rounding rule: half away from zero via Math.round on non-negative values; multi-way splits use
 * the largest-remainder method so parts always add up to the exact total (no cent lost or minted).
 */

/** Hold period after a confirmed delivery (Verkäufervertrag §11: max. 14 Kalendertage). */
const HOLD_DAYS = 14
const DAY_MS = 86400000

const toCents = (v) => {
  const n = Math.round(Number(v) || 0)
  return Number.isFinite(n) ? n : 0
}

/** Split `total` across non-negative `weights`; parts sum exactly to `total`. */
function allocateProportional(total, weights) {
  const t = toCents(total)
  const ws = (weights || []).map((w) => Math.max(0, Number(w) || 0))
  const sum = ws.reduce((a, b) => a + b, 0)
  if (!ws.length) return []
  if (sum <= 0 || t === 0) return ws.map(() => 0)
  const sign = t < 0 ? -1 : 1
  const abs = Math.abs(t)
  const raw = ws.map((w) => (abs * w) / sum)
  const floors = raw.map((r) => Math.floor(r))
  let rest = abs - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: ws[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i)
  for (let k = 0; k < order.length && rest > 0; k++, rest--) floors[order[k].i] += 1
  return floors.map((f) => f * sign)
}

/** Commission for one item line at a snapshot rate (fraction, 0.12 = 12 %). */
function commissionCents(grossCents, rate) {
  const g = Math.max(0, toCents(grossCents))
  const r = Number(rate)
  if (!Number.isFinite(r) || r < 0) throw new Error('invalid commission rate')
  return Math.max(0, Math.round(g * r))
}

function vatOnCents(netCents, vatPercent) {
  const p = Number(vatPercent)
  if (!Number.isFinite(p) || p <= 0) return 0
  return Math.round(Math.max(0, toCents(netCents)) * p / 100)
}

/**
 * Commission reversal for refunding `refundGrossCents` more of a payable (Vertrag §12: full
 * refund → full commission back; partial → proportional to the refunded goods price). The last
 * refund that empties the payable reverses exactly what is left, so rounding never strands cents.
 */
function commissionReversalCents(payable, refundGrossCents) {
  const gross = toCents(payable.gross_cents)
  const commission = toCents(payable.commission_cents)
  const alreadyRefunded = toCents(payable.refunded_gross_cents)
  const alreadyReversed = toCents(payable.refund_commission_reversal_cents)
  const add = Math.max(0, Math.min(toCents(refundGrossCents), gross - alreadyRefunded))
  if (add <= 0 || gross <= 0 || commission <= 0) return 0
  if (alreadyRefunded + add >= gross) return Math.max(0, commission - alreadyReversed)
  const targetTotal = Math.round(commission * (alreadyRefunded + add) / gross)
  return Math.max(0, Math.min(commission - alreadyReversed, targetTotal - alreadyReversed))
}

/**
 * VAT on the commission reversal, same rule as the commission itself (§17 UStG correction):
 * proportional to the refunded goods value, the last refund takes exactly what is left.
 */
function commissionVatReversalCents(payable, refundGrossCents) {
  const gross = toCents(payable.gross_cents)
  const vat = toCents(payable.commission_vat_cents)
  const alreadyRefunded = toCents(payable.refunded_gross_cents)
  const alreadyReversed = toCents(payable.refund_commission_vat_reversal_cents)
  const add = Math.max(0, Math.min(toCents(refundGrossCents), gross - alreadyRefunded))
  if (add <= 0 || gross <= 0 || vat <= 0) return 0
  if (alreadyRefunded + add >= gross) return Math.max(0, vat - alreadyReversed)
  const targetTotal = Math.round(vat * (alreadyRefunded + add) / gross)
  return Math.max(0, Math.min(vat - alreadyReversed, targetTotal - alreadyReversed))
}

/**
 * Commission VAT treatment of the PLATFORM's commission invoice to a seller (B2B service,
 * place of supply = seller's seat, §3a Abs. 2 UStG):
 *   - seller in Germany (or seat unknown)            → German VAT (PLATFORM_VAT_PERCENT, 19 %)
 *   - seller in another EU state WITH a VIES-valid VAT ID → 0 %, reverse charge (§13b UStG / Art. 196 MwStSystRL)
 *   - seller in another EU state WITHOUT a VAT ID     → German VAT (business status not evidenced)
 *   - seller outside the EU                           → 0 %, not taxable in Germany
 * German Kleinunternehmer are charged VAT like any domestic seller (they just can't deduct it).
 */
function commissionVatScheme(seller, { domesticPercent, euCountries }) {
  const a = seller?.business_address && typeof seller.business_address === 'object' ? seller.business_address : {}
  const country = String(a.country || seller?.country || '').trim().toUpperCase().slice(0, 2)
  const vatId = String(seller?.vat_id || '').replace(/\s/g, '')
  if (!country || country === 'DE') return { scheme: 'domestic', percent: domesticPercent }
  const eu = euCountries.has(country) || (country === 'GR' && euCountries.has('EL'))
  // Reverse charge only with a VAT ID that VIES confirmed (Gelangensnachweis-like diligence for
  // §13b: an unverified ID would make Andertal liable for the VAT it did not charge).
  const verified = vatId && seller?.vat_id_vies_valid === true
    && String(seller?.vat_id_vies_checked_value || '') === vatId.toUpperCase()
  if (eu) return verified ? { scheme: 'reverse_charge_eu', percent: 0 } : { scheme: 'domestic_no_vat_id', percent: domesticPercent }
  return { scheme: 'non_eu_not_taxable', percent: 0 }
}

/** Remaining refundable goods / shipping on a payable. */
function remainingGross(p) {
  return Math.max(0, toCents(p.gross_cents) - toCents(p.refunded_gross_cents))
}
function remainingShipping(p) {
  return Math.max(0, toCents(p.shipping_cents) - toCents(p.refunded_shipping_cents))
}

/**
 * Seller-side refund allocation (Phase 9/20).
 *
 *  - `lines` given (return items): each line refunds `quantity` units of ONE order item at that
 *    item's snapshot unit value; `shipping_seller_ids` additionally refunds that seller's shipping.
 *  - no lines: `amountCents` is spread over the remaining goods value of the payables in scope
 *    (caller restricts scope to one seller for multi-seller orders), proportionally.
 *
 * Returns [{ payable_id, seller_id, order_item_id, kind, quantity, gross_cents, shipping_cents,
 * commission_reversal_cents }]. Throws on anything that would refund more than is left.
 */
function allocateRefund(payables, { lines = null, amountCents = 0, shippingSellerIds = [] } = {}) {
  const out = []
  const byItem = new Map(payables.filter((p) => p.kind === 'item').map((p) => [String(p.order_item_id), p]))
  // Work on copies so several lines against the same payable see each other's effect.
  const state = new Map(payables.map((p) => [String(p.id), { ...p }]))
  const push = (p, gross, ship, qty) => {
    const st = state.get(String(p.id))
    const rev = gross > 0 ? commissionReversalCents(st, gross) : 0
    const vatRev = gross > 0 ? commissionVatReversalCents(st, gross) : 0
    st.refunded_gross_cents = toCents(st.refunded_gross_cents) + gross
    st.refunded_shipping_cents = toCents(st.refunded_shipping_cents) + ship
    st.refund_commission_reversal_cents = toCents(st.refund_commission_reversal_cents) + rev
    st.refund_commission_vat_reversal_cents = toCents(st.refund_commission_vat_reversal_cents) + vatRev
    st.refunded_quantity = toCents(st.refunded_quantity) + qty
    out.push({
      payable_id: p.id,
      seller_id: p.seller_id,
      order_item_id: p.order_item_id || null,
      kind: p.kind,
      quantity: qty,
      gross_cents: gross,
      shipping_cents: ship,
      commission_reversal_cents: rev,
      commission_vat_reversal_cents: vatRev,
    })
  }

  if (Array.isArray(lines) && lines.length) {
    for (const line of lines) {
      const p = byItem.get(String(line.order_item_id))
      if (!p) throw new Error(`refund line: unknown order item ${line.order_item_id}`)
      const st = state.get(String(p.id))
      const qty = Math.round(Number(line.quantity) || 0)
      const qtyLeft = toCents(p.quantity) - toCents(st.refunded_quantity)
      if (qty <= 0 || qty > qtyLeft) throw new Error(`refund line: quantity ${qty} exceeds refundable ${qtyLeft}`)
      // Unit value from the snapshot; the last unit takes the remainder so totals match exactly.
      const gross = qty === qtyLeft
        ? remainingGross(st)
        : Math.min(remainingGross(st), Math.round(toCents(p.gross_cents) * qty / Math.max(1, toCents(p.quantity))))
      push(p, gross, 0, qty)
    }
    for (const sid of shippingSellerIds || []) {
      const sp = payables.find((p) => p.kind === 'shipping' && String(p.seller_id) === String(sid))
      if (!sp) continue
      const ship = remainingShipping(state.get(String(sp.id)))
      if (ship > 0) push(sp, 0, ship, 0)
    }
    return out
  }

  const amount = toCents(amountCents)
  if (amount <= 0) throw new Error('refund amount must be positive')
  const items = payables.filter((p) => p.kind === 'item')
  const capacity = items.reduce((s, p) => s + remainingGross(p), 0)
  if (amount > capacity) throw new Error(`refund ${amount} exceeds refundable goods value ${capacity}`)
  const parts = allocateProportional(amount, items.map((p) => remainingGross(p)))
  items.forEach((p, i) => { if (parts[i] > 0) push(p, parts[i], 0, 0) })
  return out
}

/**
 * Payout eligibility for one payable (Phase 6). `ctx` carries the order-level facts; returns the
 * new status, the persisted eligible_at and every reason that currently blocks payment.
 */
function evaluateEligibility(payable, ctx, now = new Date()) {
  if (['paid', 'in_payout', 'cancelled', 'charged_back'].includes(payable.status)) {
    return { status: payable.status, eligibleAt: payable.eligible_at || null, reasons: [] }
  }
  // A lost dispute is final: the chargeback entries stand and the payable settles as-is
  // (its remaining entries are claimable so the seller's balance reflects the loss).
  if (ctx.lostDispute) return { status: 'charged_back', eligibleAt: payable.eligible_at || null, reasons: [] }
  const reasons = []
  if (!ctx.paymentOk) reasons.push('payment_not_confirmed')
  if (ctx.openDispute) reasons.push('dispute_open')
  if (ctx.openReturn) reasons.push('return_open')
  if (ctx.pendingRefund) reasons.push('refund_pending')
  if (ctx.sellerPayoutBlocked) reasons.push('seller_payout_blocked')
  if (ctx.sellerComplianceBlocked) reasons.push('seller_compliance')
  const deliveredAt = ctx.deliveryConfirmedAt ? new Date(ctx.deliveryConfirmedAt) : null
  const eligibleAt = deliveredAt ? new Date(deliveredAt.getTime() + HOLD_DAYS * DAY_MS) : null
  if (remainingGross(payable) <= 0 && remainingShipping(payable) <= 0) {
    return { status: 'refunded', eligibleAt, reasons: [] }
  }
  if (reasons.length) return { status: 'blocked', eligibleAt, reasons }
  if (!deliveredAt) return { status: 'pending', eligibleAt: null, reasons: ['delivery_not_confirmed'] }
  if (now.getTime() < eligibleAt.getTime()) return { status: 'pending', eligibleAt, reasons: ['hold_period'] }
  return { status: 'eligible', eligibleAt, reasons: [] }
}

module.exports = {
  HOLD_DAYS,
  allocateProportional,
  commissionCents,
  vatOnCents,
  commissionReversalCents,
  commissionVatReversalCents,
  commissionVatScheme,
  allocateRefund,
  remainingGross,
  remainingShipping,
  evaluateEligibility,
}
