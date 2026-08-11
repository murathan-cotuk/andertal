'use strict'

const {
  productRowToVariant,
  buildCombineAsVariantsPlan,
  hasRealVariants,
  uniqueLabels,
} = require('./combine-as-variants-core')

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed')
}

function testUniqueLabels() {
  assert(uniqueLabels(['Red', 'red', 'Blue']).join('|') === 'Red|red (2)|Blue', 'unique labels')
}

function testProductRowToVariant() {
  const v = productRowToVariant(
    {
      id: 'p1',
      title: 'Shirt Red',
      sku: 'SKU-R',
      inventory: 3,
      price_cents: 1990,
      description: 'Nice shirt',
      metadata: {
        ean: '4006381333931',
        category_id: 'cat1',
        brand_id: 'brand1',
        hersteller: 'Acme',
        image_url: 'https://cdn.example/a.jpg',
        variation_groups: [{ name: 'x' }],
      },
    },
    'Rot'
  )
  assert(v.option_values[0] === 'Rot', 'option value')
  assert(v.sku === 'SKU-R', 'sku')
  assert(v.ean === '4006381333931', 'ean')
  assert(v.price_cents === 1990, 'price')
  assert(v.metadata.source_product_id === 'p1', 'source id')
  assert(v.metadata.category_id === 'cat1', 'category folded')
  assert(v.metadata.variation_groups === undefined, 'no variation_groups on variant')
}

function testBuildPlanStandalone() {
  const products = [
    { id: 'a', title: 'Red', sku: 'A', inventory: 1, price_cents: 100, metadata: { ean: '1111111111111' }, variants: [] },
    { id: 'b', title: 'Blue', sku: 'B', inventory: 2, price_cents: 200, metadata: { ean: '2222222222222' }, variants: [] },
  ]
  const plan = buildCombineAsVariantsPlan({
    parentId: 'a',
    products,
    optionName: 'Farbe',
    optionValues: { a: 'Rot', b: 'Blau' },
  })
  assert(plan.ok, plan.message)
  assert(plan.variants.length === 2, '2 variants')
  assert(plan.variants[0].option_values[0] === 'Rot', 'first label')
  assert(plan.variants[1].option_values[0] === 'Blau', 'second label')
  assert(plan.variation_groups[0].name === 'Farbe', 'axis name')
  assert(plan.source_ids_to_archive.join() === 'b', 'archive b only')
  assert(plan.parent_metadata_patch.ean === null, 'clear parent ean')
  assert(plan.convertParentSelf === true, 'convert parent self')
}

function testRejectNested() {
  const products = [
    { id: 'a', title: 'Parent', variants: [], metadata: {} },
    {
      id: 'b',
      title: 'Already varianted',
      variants: [{ option_values: ['S'], title: 'S' }],
      metadata: {},
    },
  ]
  const plan = buildCombineAsVariantsPlan({ parentId: 'a', products })
  assert(!plan.ok, 'should reject')
  assert(/already has variants/i.test(plan.message), 'message')
}

function testAppendToExistingParent() {
  const products = [
    {
      id: 'a',
      title: 'Shirt',
      variants: [{ option_values: ['S'], title: 'S', sku: 'S', ean: '', inventory: 1, price_cents: 10, metadata: {} }],
      metadata: { variation_groups: [{ name: 'Size', options: [{ value: 'S' }] }] },
    },
    { id: 'b', title: 'M', sku: 'M', inventory: 2, price_cents: 20, metadata: {}, variants: [] },
  ]
  assert(hasRealVariants(products[0]) === true)
  const plan = buildCombineAsVariantsPlan({
    parentId: 'a',
    products,
    optionName: 'Size',
    optionValues: { b: 'M' },
  })
  assert(plan.ok, plan.message)
  assert(plan.convertParentSelf === false, 'do not re-fold parent')
  assert(plan.variants.length === 2, 'S + M')
  assert(plan.variants.map((v) => v.option_values[0]).join('|') === 'S|M')
  assert(plan.parent_metadata_patch.ean === undefined, 'do not force-clear ean when appending')
}

testUniqueLabels()
testProductRowToVariant()
testBuildPlanStandalone()
testRejectNested()
testAppendToExistingParent()
console.log('combine-as-variants-core.test.js OK')
