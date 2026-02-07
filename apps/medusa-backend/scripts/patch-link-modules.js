const fs = require('fs')
const path = require('path')

const content = "module.exports = require('@medusajs/link-modules')\n"

function findMedusaDirs(startDir, maxDepth = 10) {
  const found = new Set()
  let dir = startDir
  let depth = 0
  while (dir && depth < maxDepth) {
    const medusaDir = path.join(dir, 'node_modules', '@medusajs', 'medusa')
    if (fs.existsSync(medusaDir)) found.add(medusaDir)
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
    depth++
  }
  return found
}

// Root = apps/medusa-backend: modüller bazen repo kökünde (src/node_modules). Script __dirname ve cwd üzerinden yukarı çıkıp hepsini patch'le.
const fromScript = findMedusaDirs(__dirname)
const fromCwd = findMedusaDirs(process.cwd())
const medusaDirs = [...fromScript, ...fromCwd]

let written = false
for (const medusaDir of medusaDirs) {
  const filePath = path.join(medusaDir, 'link-modules.js')
  try {
    fs.writeFileSync(filePath, content)
    console.log('patch-link-modules: wrote', medusaDir)
    written = true
  } catch (e) {
    console.error('patch-link-modules: failed to write', filePath, e.message)
    process.exit(1)
  }
}
if (!written) {
  console.error('patch-link-modules: @medusajs/medusa not found (walked from __dirname and cwd)')
  process.exit(1)
}
process.exit(0)
