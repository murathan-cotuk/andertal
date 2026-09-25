'use strict'
/**
 * Resume-friendly GTX drafts. Saves after every name.
 * Usage: node _gtx-draft.js --skip 1050 --batch-size 150 --batches 7 --start-batch 8
 */
const fs = require('fs')
const path = require('path')
const { translate } = require('./node_modules/@vitalets/google-translate-api')

const need = require('./still-need-chunk-7.json')
const groupA = new Set(require('./chunk7-groupA-names.json'))

function parseArgs() {
  const a = process.argv.slice(2)
  const o = { skip: 1050, batchSize: 150, batches: 1, startBatch: 8 }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--skip') o.skip = +a[++i]
    else if (a[i] === '--batch-size') o.batchSize = +a[++i]
    else if (a[i] === '--batches') o.batches = +a[++i]
    else if (a[i] === '--start-batch') o.startBatch = +a[++i]
  }
  return o
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function tr(text, to) {
  let lastErr
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await translate(text, { from: 'en', to })
      const t = String(r.text || '').trim()
      if (t) return t
    } catch (e) {
      lastErr = e
      const wait = 1500 * (attempt + 1)
      process.stderr.write(`retry ${to} attempt ${attempt + 1}: ${e.message}\n`)
      await sleep(wait)
    }
  }
  throw lastErr || new Error('translate failed: ' + text + ' -> ' + to)
}

async function translateName(en) {
  const de = await tr(en, 'de')
  await sleep(150)
  if (!groupA.has(en)) return { de }
  const es = await tr(en, 'es')
  await sleep(150)
  const fr = await tr(en, 'fr')
  await sleep(150)
  const it = await tr(en, 'it')
  await sleep(150)
  const trk = await tr(en, 'tr')
  await sleep(150)
  return { de, es, fr, it, tr: trk }
}

function isComplete(en, v) {
  if (!v || !String(v.de || '').trim()) return false
  if (/MYMEMORY WARNING/i.test(JSON.stringify(v))) return false
  if (!groupA.has(en)) return true
  return ['es', 'fr', 'it', 'tr'].every((l) => String(v[l] || '').trim())
}

;(async () => {
  const opts = parseArgs()
  for (let b = 0; b < opts.batches; b++) {
    const batchNum = opts.startBatch + b
    const start = opts.skip + b * opts.batchSize
    const slice = need.slice(start, start + opts.batchSize)
    if (!slice.length) break
    const outPath = path.join(__dirname, `_partial-${String(batchNum).padStart(2, '0')}.json`)
    let out = {}
    if (fs.existsSync(outPath)) {
      try {
        out = JSON.parse(fs.readFileSync(outPath, 'utf8'))
      } catch (_) {
        out = {}
      }
    }
    let i = 0
    for (const en of slice) {
      i++
      if (isComplete(en, out[en])) {
        process.stdout.write(`[${batchNum}] ${i}/${slice.length} SKIP ${en.slice(0, 50)}\n`)
        continue
      }
      process.stdout.write(`[${batchNum}] ${i}/${slice.length} ${en.slice(0, 60)}\n`)
      out[en] = await translateName(en)
      fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + '\n')
    }
    // ensure key order matches slice
    const ordered = {}
    for (const en of slice) ordered[en] = out[en]
    fs.writeFileSync(outPath, JSON.stringify(ordered, null, 0) + '\n')
    console.log('wrote', Object.keys(ordered).length, outPath)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
