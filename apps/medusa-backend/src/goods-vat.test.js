'use strict'

const {
  getGoodsVatRatePercent,
  splitInclusiveVat,
  pickCountryMerchandiseCents,
  salesInvoiceVat,
  formatVatPercent,
} = require('./goods-vat')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

assert(getGoodsVatRatePercent('DE') === 19, 'DE 19')
assert(getGoodsVatRatePercent('fr') === 20, 'FR 20')
assert(getGoodsVatRatePercent('BE') === 21, 'BE 21')
assert(getGoodsVatRatePercent('NL') === 21, 'NL 21')
assert(getGoodsVatRatePercent('IT') === 22, 'IT 22')

const de = splitInclusiveVat(5000, 19)
assert(de.vatCents === 798, `DE vat got ${de.vatCents}`)
assert(de.netCents === 4202, `DE net got ${de.netCents}`)

const frSamePrice = splitInclusiveVat(5000, 20)
assert(frSamePrice.vatCents === 833, `FR vat on 50 got ${frSamePrice.vatCents}`)
assert(frSamePrice.netCents === 4167, 'seller kept same 50 brutto — net shrinks, their choice')

const frPriced = splitInclusiveVat(5042, 20)
assert(frPriced.vatCents === 840, `FR vat on 50.42 got ${frPriced.vatCents}`)
assert(frPriced.netCents === 4202, 'net matches DE when seller set FR brutto')

assert(splitInclusiveVat(5000, 0).vatCents === 0, 'zero rate')
assert(formatVatPercent(19) === '19', 'int format')
assert(formatVatPercent(25.5) === '25.5', 'decimal format')

const prices = {
  DE: { brutto_cents: 5000 },
  FR: { brutto_cents: 5042 },
}
assert(pickCountryMerchandiseCents(prices, 'FR') === 5042, 'use seller FR price')
assert(pickCountryMerchandiseCents(prices, 'BE') === 5000, 'missing BE → DE as-is, no auto 50.84')
assert(pickCountryMerchandiseCents(prices, 'BE', { fallbackDe: false }) == null, 'no silent DE when exact-only')
assert(pickCountryMerchandiseCents({ FR: { sale_cents: 4900, brutto_cents: 5042 } }, 'FR') === 4900, 'sale wins')

const invFr = salesInvoiceVat({ country: 'FR' }, { sellerHasVatId: true, taxableGrossCents: 5000 })
assert(invFr.ratePercent === 20 && invFr.vatCents === 833, 'invoice FR rate on charged 50')
const klein = salesInvoiceVat({ country: 'FR' }, { sellerHasVatId: false, taxableGrossCents: 5000 })
assert(klein.exempt === true && klein.vatCents === 0, 'Kleinunternehmer no goods VAT')

console.log('goods-vat.test.js ok')
