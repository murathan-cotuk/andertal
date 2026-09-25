'use strict'
const fs = require('fs')
const need = require('./still-need-chunk-7.json')
const rem = need.slice(1050)
const covered = new Set()
let totalKeys = 0
for (let i = 8; i <= 14; i++) {
  const p = `chunk7-bulk-${String(i).padStart(2, '0')}.json`
  const d = JSON.parse(fs.readFileSync(require('path').join(__dirname, p), 'utf8'))
  const n = Object.keys(d).length
  totalKeys += n
  Object.keys(d).forEach((k) => covered.add(k))
  console.log('bulk', i, n)
}
const missing = rem.filter((n) => !covered.has(n))
console.log('remaining', rem.length, 'covered', covered.size, 'totalKeys', totalKeys, 'missing', missing.length)
if (missing.length) console.log(missing)

const p14 = require('path').join(__dirname, 'chunk7-bulk-14.json')
const d14 = JSON.parse(fs.readFileSync(p14, 'utf8'))
d14['Western & Frontier Christian Romance'].de = 'Christliche Western- & Frontier-Romanzen'
d14['Womens Statement Rings'] = {
  de: 'Damen-Blickfangringe',
  es: 'Anillos llamativos para mujer',
  fr: 'Bagues imposantes pour femme',
  it: 'Anelli di carattere da donna',
  tr: 'Kadın Gösterişli Yüzükler',
}
d14['Womens Wear to Work Pants & Capris'].de = 'Damen-Büro-Hosen & Caprihosen'
d14['Womens Ear Cuffs & Wraps'] = {
  de: 'Damen-Ohrclips & -wickel',
  es: 'Pendientes tipo manguito y envolturas para mujer',
  fr: "Manchons et enveloppes d'oreille pour femme",
  it: 'Fasce e avvolgimenti per orecchio da donna',
  tr: 'Kadın Kulak Manşetleri ve Sargıları',
}
d14['Womens Fashion Sneakers'].de = 'Damen-Modeturnschuhe'
d14['Window Treatment Sets'].de = 'Fensterdekorationsets'
d14['Yoga Starter Sets'] = {
  de: 'Yoga-Einsteiger-Sets',
  es: 'Sets de inicio de yoga',
  fr: 'Kits de démarrage yoga',
  it: 'Kit iniziali di yoga',
  tr: 'Yoga Başlangıç Setleri',
}
fs.writeFileSync(p14, JSON.stringify(d14, null, 0) + '\n')
console.log('patched14')
