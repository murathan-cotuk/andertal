'use strict'
/**
 * Merge a partial/full translation batch with Group B existing es/fr/it/tr,
 * then write the final bulk file. Input map must at least have `de` for every key;
 * for Group A keys it must have de/es/fr/it/tr.
 *
 * Usage:
 *   node scripts/_category-translation-backups/_merge-bulk.js <partial.json> <out-bulk.json>
 */
const fs = require('fs')
const path = require('path')

const partialPath = process.argv[2]
const outPath = process.argv[3]
if (!partialPath || !outPath) {
  console.error('Usage: node _merge-bulk.js <partial.json> <out-bulk.json>')
  process.exit(1)
}

const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8'))
const groupB = JSON.parse(fs.readFileSync(path.join(__dirname, 'chunk7-groupB-existing.json'), 'utf8'))
const groupA = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'chunk7-groupA-names.json'), 'utf8')))

const out = {}
const missing = []
for (const [en, v] of Object.entries(partial)) {
  const de = String(v.de || '').trim()
  if (!de) {
    missing.push(en + ' (de)')
    continue
  }
  if (groupB[en]) {
    const b = groupB[en]
    out[en] = {
      de,
      es: String(v.es || b.es || '').trim(),
      fr: String(v.fr || b.fr || '').trim(),
      it: String(v.it || b.it || '').trim(),
      tr: String(v.tr || b.tr || '').trim(),
    }
  } else if (groupA.has(en)) {
    const es = String(v.es || '').trim()
    const fr = String(v.fr || '').trim()
    const it = String(v.it || '').trim()
    const tr = String(v.tr || '').trim()
    if (!es || !fr || !it || !tr) {
      missing.push(en + ' (groupA incomplete)')
      continue
    }
    out[en] = { de, es, fr, it, tr }
  } else {
    // Unknown — require all 5
    const es = String(v.es || '').trim()
    const fr = String(v.fr || '').trim()
    const it = String(v.it || '').trim()
    const tr = String(v.tr || '').trim()
    if (!es || !fr || !it || !tr) {
      missing.push(en + ' (unknown incomplete)')
      continue
    }
    out[en] = { de, es, fr, it, tr }
  }
  for (const loc of ['es', 'fr', 'it', 'tr']) {
    if (!out[en][loc]) missing.push(en + ' (' + loc + ' empty)')
  }
}

if (missing.length) {
  console.error('MISSING', missing.length)
  console.error(missing.slice(0, 30).join('\n'))
  process.exit(1)
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + '\n')
console.log('wrote', Object.keys(out).length, '->', outPath)
