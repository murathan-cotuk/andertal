'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const DIR = __dirname
const LOCALES = ['de', 'es', 'fr', 'it', 'tr']
const BATCH = 150
const DELAY_MS = Number(process.env.TRANSLATE_DELAY_MS || 300)

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function loadDone() {
  const done = new Set()
  for (const f of fs.readdirSync(DIR)) {
    if (!/^chunk2-bulk-\d+\.json$/.test(f)) continue
    const obj = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
    for (const k of Object.keys(obj)) done.add(k)
  }
  return done
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const OVERRIDES = loadJson(path.join(DIR, '_overrides-chunk2.json'), {})

async function mt(text, loc) {
  if (OVERRIDES[text] && OVERRIDES[text][loc]) return OVERRIDES[text][loc]
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    '&langpair=' +
    encodeURIComponent('en|' + loc)
  const res = await fetch(url)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const j = await res.json()
  let t = (j.responseData && j.responseData.translatedText) || ''
  if (/MYMEMORY WARNING/i.test(t)) throw new Error(t.slice(0, 160))
  t = String(t).trim()
  if (!t) throw new Error('empty translation')
  return t
}

function isLoanOrProper(src) {
  return /^(USB|DVD|CD|GPS|BMX|CPAP|MIDI|MP3|PMP|PC|RC|RV|SAT|STEM|LANs|WoD|R&B|Jazz|Manga|Rock|Bacon|Baguette|Brie|Gouda|Mozzarella|Colby|Hummus|Paprika|Rosemary|Taoism|Sikhism|Judaism|Coleman|Mars|Mochi|Grupero|Noels|Oratorio|Motets|Waltzes|Vedas|Warhammer|Battletech|Exalted|GURPS|Intellivision|Commodore|Sega|Nintendo|PlayStation|Xbox|Wii|OpenGL|Visual Basic|PMP Exam)\b/i.test(
    src,
  )
}

function flagEnglish(src, tr) {
  if (!tr) return true
  if (tr === src && src.includes(' ') && !isLoanOrProper(src)) return true
  // English catalog words that must not remain unless they are established loanwords
  const banned =
    /\b(Accessories|Equipment|Supplies|Products|Replacement|Parts|Kits|Tools|Guides|Systems|Machines|Devices|Clothing|Shoes|Furniture|Lighting|Storage|Filters|Sensors|Motors|Switches|Cables|Pumps|Valves|Gaskets|Seals|Hoses|Belts|Gears|Bearings|Batteries|Chargers|Adapters|Cases|Covers|Bags|Racks|Stands|Mats|Pads|Creams|Lotions|Powders|Mixes|Recipes|Travel|History|Fiction|Romance|Horror|Sports|Games|Toys|Baby|Boys|Girls|Mens|Womens|Childrens|Kids|Cat|Dog|Home|Office|Kitchen|Bathroom|Garden|Camping|Outdoor|Indoor|Commercial|Industrial|Medical|Dental|Legal|Business|Christian|Christmas|Automotive|Camera|Computer|Guitar|Horse|Hair|Hand|Foot|Food|Fresh|Frozen|Dried|Canned|Packaged|Portable|Power|Electric|Manual|Digital|Wireless|Books|Strips|Sets)\b/
  // Count banned tokens present in translation
  const m = tr.match(new RegExp(banned.source, 'g'))
  if (!m) return false
  // Allow Rock, Manga, Jazz etc already handled; if >=1 banned common noun remains, flag
  return m.length >= 1 && !/^(Classic R&B|Classic Southern Rock|Hard Rock|Country Rock|Surf Rock|Pop Metal|Proto Punk)$/i.test(src)
}

async function translateName(name) {
  if (OVERRIDES[name] && LOCALES.every((l) => OVERRIDES[name][l])) return OVERRIDES[name]
  const out = {}
  for (const loc of LOCALES) {
    let lastErr
    for (let a = 0; a < 6; a++) {
      try {
        out[loc] = await mt(name, loc)
        lastErr = null
        break
      } catch (e) {
        lastErr = e
        console.warn('retry', loc, name, String(e.message || e).slice(0, 100))
        await sleep(2000 * (a + 1))
      }
    }
    if (lastErr) throw lastErr
    await sleep(DELAY_MS)
  }
  return out
}

;(async () => {
  const all = require('./still-need-chunk-2.json')
  const done = loadDone()
  const remaining = all.filter((n) => !done.has(n))
  console.log(JSON.stringify({ total: all.length, done: done.size, remaining: remaining.length }))

  let bulk = 3
  while (fs.existsSync(path.join(DIR, `chunk2-bulk-${String(bulk).padStart(2, '0')}.json`))) bulk++

  let i = 0
  while (i < remaining.length) {
    const slice = remaining.slice(i, i + BATCH)
    const map = {}
    const flags = []
    for (let j = 0; j < slice.length; j++) {
      const name = slice[j]
      console.log(`[${String(bulk).padStart(2, '0')}] ${i + j + 1}/${remaining.length} ${name}`)
      const tr = await translateName(name)
      map[name] = tr
      for (const loc of LOCALES) {
        if (flagEnglish(name, tr[loc])) flags.push(`${name}\t${loc}\t${tr[loc]}`)
      }
    }
    const num = String(bulk).padStart(2, '0')
    const outPath = path.join(DIR, `chunk2-bulk-${num}.json`)
    fs.writeFileSync(outPath, JSON.stringify(map))
    fs.writeFileSync(path.join(DIR, `chunk2-bulk-${num}-flags.txt`), flags.join('\n'))
    console.log('Wrote', outPath, 'entries', Object.keys(map).length, 'flags', flags.length)

    const cmd = `node scripts/fix-category-translations.js --translations scripts/_category-translation-backups/chunk2-bulk-${num}.json --chunk-index 2 --chunk-count 8`
    const result = execSync(cmd, { cwd: path.join(DIR, '..', '..'), encoding: 'utf8' })
    console.log(result)
    const line = result
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith('{'))
      .pop()
    const parsed = JSON.parse(line)
    if (parsed.errors !== 0) {
      console.error('Apply errors, stopping at bulk', num)
      process.exit(1)
    }
    bulk++
    i += BATCH
  }
  console.log('COMPLETE lastBulk', bulk - 1)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
