// One-off helper: merge every scratch JSON file for a chunk (produced by the interrupted
// forks) into one clean names-chunk-N.json translation map. Skips empty/unparseable files.
'use strict'
const fs = require('fs')
const path = require('path')

const dir = path.join(__dirname, '_category-translation-backups')
const chunk = process.argv[2]
if (!chunk) throw new Error('usage: node _merge-chunk-scratch.js <chunk-index> <file1> <file2> ...')
const files = process.argv.slice(3)

const merged = {}
let mergedFrom = 0
for (const f of files) {
  const p = path.join(dir, f)
  if (!fs.existsSync(p)) continue
  const raw = fs.readFileSync(p, 'utf8').trim()
  if (!raw) continue
  let obj
  try { obj = JSON.parse(raw) } catch (e) { console.warn('skip unparseable:', f, e.message); continue }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
  let added = 0
  for (const [name, tr] of Object.entries(obj)) {
    if (!tr || typeof tr !== 'object') continue
    merged[name] = { ...(merged[name] || {}), ...tr }
    added++
  }
  if (added) { mergedFrom++; console.log(f, '->', added, 'names') }
}

const outPath = path.join(dir, `names-chunk-${chunk}.json`)
let existing = {}
if (fs.existsSync(outPath)) {
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')) } catch (_) {}
}
const final = { ...existing, ...merged }
fs.writeFileSync(outPath, JSON.stringify(final, null, 1))
console.log(`Wrote ${Object.keys(final).length} total names to ${outPath} (merged from ${mergedFrom} files, ${Object.keys(existing).length} pre-existing)`)
