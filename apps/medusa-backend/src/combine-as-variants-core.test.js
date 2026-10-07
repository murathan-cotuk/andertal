'use strict'

const {
  productRowToVariant,
  buildCombineAsVariantsPlan,
  buildNewRoofCombinePlan,
  assertCallerOwnsAllForCombine,
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

function testRejectTwoParents() {
  const products = [
    {
      id: 'a',
      title: 'Parent A',
      variants: [{ option_values: ['S'], title: 'S' }],
      metadata: {},
    },
    {
      id: 'b',
      title: 'Parent B',
      variants: [{ option_values: ['M'], title: 'M' }],
      metadata: {},
    },
  ]
  const plan = buildCombineAsVariantsPlan({ parentId: 'a', products })
  assert(!plan.ok, 'two parents must fail')
  assert(/two parent products/i.test(plan.message), 'clear multi-parent message')
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

function testNewRoofPlan() {
  const products = [
    { id: 'a', title: 'Red', sku: 'A', inventory: 1, price_cents: 100, metadata: { ean: '1111111111111', brand_id: 'b1' }, variants: [] },
    { id: 'b', title: 'Blue', sku: 'B', inventory: 2, price_cents: 200, metadata: { ean: '2222222222222' }, variants: [] },
  ]
  const plan = buildNewRoofCombinePlan({
    products,
    roofTitle: 'Shirt Family',
    roofSku: 'SHIRT-ROOF',
    optionName: 'Farbe',
    optionValues: { a: 'Rot', b: 'Blau' },
  })
  assert(plan.ok, plan.message)
  assert(plan.mode === 'new_roof', 'mode')
  assert(plan.roof_title === 'Shirt Family', 'title')
  assert(plan.roof_sku === 'SHIRT-ROOF', 'sku')
  assert(plan.variants.length === 2, '2 variants')
  assert(plan.source_ids_to_archive.join() === 'a,b', 'archive both')
  assert(plan.parent_metadata.brand_id === 'b1', 'brand seeded')
  assert(plan.parent_metadata.ean == null, 'no parent ean')
}

function testNewRoofRequiresTitleSku() {
  const products = [
    { id: 'a', title: 'Red', variants: [], metadata: {} },
    { id: 'b', title: 'Blue', variants: [], metadata: {} },
  ]
  assert(!buildNewRoofCombinePlan({ products, roofTitle: '', roofSku: 'X' }).ok, 'title required')
  assert(!buildNewRoofCombinePlan({ products, roofTitle: 'T', roofSku: '' }).ok, 'sku required')
}

function testNewRoofRejectsExistingParent() {
  const products = [
    { id: 'a', title: 'Parent', variants: [{ option_values: ['S'] }], metadata: {} },
    { id: 'b', title: 'Blue', variants: [], metadata: {} },
  ]
  const plan = buildNewRoofCombinePlan({ products, roofTitle: 'X', roofSku: 'Y' })
  assert(!plan.ok, 'reject parent member')
}

function testOwnershipSellerMustOwn() {
  const products = [
    { id: 'a', title: 'Mine', seller_id: 's1', metadata: {} },
    { id: 'b', title: 'Listed catalog', seller_id: null, metadata: {} },
  ]
  const denied = assertCallerOwnsAllForCombine({ products, callerSellerId: 's1', isSuperuser: false })
  assert(!denied.ok, 'reject catalog listing')
  const other = assertCallerOwnsAllForCombine({
    products: [
      { id: 'a', seller_id: 's1', metadata: {} },
      { id: 'b', seller_id: 's2', metadata: {} },
    ],
    callerSellerId: 's1',
    isSuperuser: false,
  })
  assert(!other.ok, 'reject other seller')
  const ok = assertCallerOwnsAllForCombine({
    products: [
      { id: 'a', seller_id: 's1', metadata: {} },
      { id: 'b', seller_id: 's1', metadata: {} },
    ],
    callerSellerId: 's1',
    isSuperuser: false,
  })
  assert(ok.ok, 'own products ok')
  const su = assertCallerOwnsAllForCombine({
    products: [
      { id: 'a', seller_id: 's1', metadata: {} },
      { id: 'b', seller_id: null, metadata: {} },
    ],
    callerSellerId: 's9',
    isSuperuser: true,
  })
  assert(su.ok, 'superuser bypass')
}

testUniqueLabels()
testProductRowToVariant()
testBuildPlanStandalone()
testRejectNested()
testRejectTwoParents()
testAppendToExistingParent()
testNewRoofPlan()
testNewRoofRequiresTitleSku()
testNewRoofRejectsExistingParent()
testOwnershipSellerMustOwn()
console.log('combine-as-variants-core.test.js OK')
