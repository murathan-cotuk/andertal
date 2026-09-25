'use strict'
/**
 * Draft German (and full Group A) translations via MyMemory for remaining chunk-7 names.
 * Writes _partial-auto-NN.json files of ~150 entries each, starting after skip count.
 *
 * Usage: node _auto-draft.js --skip 750 --batch-size 150 --batches 3
 */
const fs = require('fs')
const path = require('path')

const need = require('./still-need-chunk-7.json')
const groupA = new Set(require('./chunk7-groupA-names.json'))

function parseArgs() {
  const a = process.argv.slice(2)
  const o = { skip: 750, batchSize: 150, batches: 1, startBatch: 6 }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--skip') o.skip = +a[++i]
    else if (a[i] === '--batch-size') o.batchSize = +a[++i]
    else if (a[i] === '--batches') o.batches = +a[++i]
    else if (a[i] === '--start-batch') o.startBatch = +a[++i]
  }
  return o
}

async function translate(text, lang) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=en|' +
    lang
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url)
      const j = await r.json()
      const t = String(j.responseData?.translatedText || '').trim()
      if (t && t.toLowerCase() !== text.toLowerCase()) return t
      if (t) return t
    } catch (_) {}
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)))
  }
  return ''
}

async function translateName(en) {
  const isA = groupA.has(en)
  const de = await translate(en, 'de')
  await new Promise((r) => setTimeout(r, 120))
  if (!isA) return { de }
  const es = await translate(en, 'es')
  await new Promise((r) => setTimeout(r, 120))
  const fr = await translate(en, 'fr')
  await new Promise((r) => setTimeout(r, 120))
  const it = await translate(en, 'it')
  await new Promise((r) => setTimeout(r, 120))
  const tr = await translate(en, 'tr')
  await new Promise((r) => setTimeout(r, 120))
  return { de, es, fr, it, tr }
}

;(async () => {
  const opts = parseArgs()
  for (let b = 0; b < opts.batches; b++) {
    const batchNum = opts.startBatch + b
    const start = opts.skip + b * opts.batchSize
    const slice = need.slice(start, start + opts.batchSize)
    if (!slice.length) break
    const out = {}
    let i = 0
    for (const en of slice) {
      i++
      process.stdout.write(`[${batchNum}] ${i}/${slice.length} ${en.slice(0, 50)}\n`)
      const tr = await translateName(en)
      if (!tr.de) {
        console.error('FAILED de for', en)
        process.exit(1)
      }
      if (groupA.has(en) && (!tr.es || !tr.fr || !tr.it || !tr.tr)) {
        console.error('FAILED groupA locales for', en, tr)
        process.exit(1)
      }
      out[en] = tr
    }
    const outPath = path.join(__dirname, `_partial-${String(batchNum).padStart(2, '0')}.json`)
    fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + '\n')
    console.log('wrote', Object.keys(out).length, outPath)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
