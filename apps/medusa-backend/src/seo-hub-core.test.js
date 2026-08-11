'use strict'

const assert = require('assert')
const {
  demoteH1ToH2,
  analyzeHtml,
  evaluateMeta,
  autoGenerateProductSeo,
  TITLE_IDEAL,
  DESC_IDEAL,
} = require('./seo-hub-core')

assert.strictEqual(demoteH1ToH2('<h1 class="x">Hi</h1>'), '<h2 class="x">Hi</h2>')
assert.strictEqual(demoteH1ToH2('<H1>A</H1><p>b</p>'), '<h2>A</h2><p>b</p>')
assert.strictEqual(demoteH1ToH2(''), '')

const analysis = analyzeHtml('<h1>t</h1><h2>a</h2><h2>b</h2><img src="x"><img alt="y" src="z"><a href="/">l</a>')
assert.strictEqual(analysis.headings.h1, 1)
assert.strictEqual(analysis.headings.h2, 2)
assert.strictEqual(analysis.images, 2)
assert.strictEqual(analysis.imagesWithoutAlt, 1)
assert.strictEqual(analysis.links, 1)
assert.strictEqual(analysis.hasH1, true)

const catBad = evaluateMeta({ title: 'short', description: 'short', keywords: '', entityType: 'categories' })
assert.ok(catBad.issues.some((i) => i.field === 'title' && i.severity === 'warn'))
assert.ok(catBad.issues.some((i) => i.field === 'keywords' && i.severity === 'warn'))
const catMissing = evaluateMeta({ title: '', description: '', keywords: '', entityType: 'categories' })
assert.ok(catMissing.issues.some((i) => i.field === 'title' && i.severity === 'error'))
assert.ok(catMissing.issues.some((i) => i.field === 'description' && i.severity === 'error'))

const goodTitle = 'A'.repeat(TITLE_IDEAL.min)
const goodDesc = 'B'.repeat(DESC_IDEAL.min)
const catOk = evaluateMeta({ title: goodTitle, description: goodDesc, keywords: 'a, b', entityType: 'categories' })
assert.strictEqual(catOk.issues.length, 0)

const generated = autoGenerateProductSeo({
  title: 'Premium Wanderschuhe',
  description: '<p>' + 'Leichter Schuh für lange Touren. '.repeat(20) + '</p>',
})
assert.ok(generated.seo_meta_title.length >= 1)
assert.ok(generated.seo_meta_description.length >= DESC_IDEAL.min)
assert.ok(generated.seo_keywords.includes('premium') || generated.seo_keywords.includes('wanderschuhe'))

console.log('seo-hub-core.test.js: ok')
