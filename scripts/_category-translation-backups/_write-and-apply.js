'use strict'
/**
 * Usage: node _write-and-apply.js <bulkNum> <map.js>
 * map.js should module.exports = { "English": {de,es,fr,it,tr}, ... }
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const bulkNum = String(process.argv[2] || '').padStart(2, '0')
const mapPath = process.argv[3]
if (!bulkNum || !mapPath) {
  console.error('Usage: node _write-and-apply.js <NN> <map.js>')
  process.exit(1)
}

const names = require(`./_chunk2-names-${bulkNum}.json`)
const T = require(path.resolve(mapPath))
const out = {}
const missing = []
for (const n of names) {
  if (!T[n] || !T[n].de || !T[n].es || !T[n].fr || !T[n].it || !T[n].tr) missing.push(n)
  else out[n] = T[n]
}
if (missing.length) {
  console.error('Missing', missing.length, missing.slice(0, 20))
  process.exit(1)
}
const outPath = path.join(__dirname, `chunk2-bulk-${bulkNum}.json`)
fs.writeFileSync(outPath, JSON.stringify(out))
console.log('Wrote', Object.keys(out).length, 'to', outPath)

const cmd = `node scripts/fix-category-translations.js --translations scripts/_category-translation-backups/chunk2-bulk-${bulkNum}.json --chunk-index 2 --chunk-count 8`
console.log('Applying…')
const result = execSync(cmd, { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' })
console.log(result)
