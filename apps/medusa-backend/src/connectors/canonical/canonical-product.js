'use strict'

/**
 * @typedef {Object} CanonicalVariant
 * @property {string} externalId
 * @property {string} [sku]
 * @property {string} [ean]
 * @property {string} [title]
 * @property {number} [priceCents]
 * @property {number} [stock]
 * @property {Object<string,string>} [optionValues] - e.g. { Color: 'Black', Size: 'M' }
 *
 * @typedef {Object} CanonicalProduct
 * @property {string} externalId - ID in the source ERP
 * @property {string} sku
 * @property {string} [ean]
 * @property {string} title
 * @property {string} [description]
 * @property {CanonicalVariant[]} variants
 * @property {string[]} images
 * @property {number} stock - total/simple stock when there are no variants
 * @property {number} priceCents
 * @property {number} [vatPercent]
 * @property {string} [categoryExternalId]
 * @property {Object<string,string>} attributes
 * @property {string} [manufacturer]
 * @property {'jtl'|'billbee'} source
 * @property {Object} raw - untouched source payload, kept for debugging/re-mapping
 */

/** Builds a CanonicalProduct with sane defaults so mappers only need to set what they actually have. */
function makeCanonicalProduct(partial) {
  return {
    externalId: '',
    sku: '',
    ean: null,
    title: '',
    description: '',
    variants: [],
    images: [],
    stock: 0,
    priceCents: 0,
    vatPercent: null,
    categoryExternalId: null,
    attributes: {},
    manufacturer: null,
    source: null,
    raw: null,
    ...partial,
  }
}

module.exports = { makeCanonicalProduct }
