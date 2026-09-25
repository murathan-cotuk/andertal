'use strict'
/**
 * Flag likely English leftovers in de (and Group A locales).
 * Usage: node _scan-hybrids.js _partial-06.json
 */
const fs = require('fs')
const groupA = new Set(require('./chunk7-groupA-names.json'))

const COMMON_EN = new Set(
  `Accessories Equipment Supplies Products Tools Kits Sets Bags Cases Covers Parts Systems Devices Machines Filters Motors Pumps Valves Switches Sensors Boards Cards Games Consoles Controllers Storage Training Care Health Home Office Kitchen Garden Sports Music Books Guides History Fiction Cooking Food Wine Travel Lamps Lights Fans Heaters Cleaners Washers Dryers Speakers Cameras Lenses Batteries Cables Chargers Holders Organizers Mirrors Tables Chairs Sofas Beds Mats Pads Belts Boots Shoes Pants Shirts Jackets Hats Gloves Socks Underwear Swimwear Jewelry Rings Earrings Necklaces Bracelets Watches Makeup Creams Oils Sprays Masks Brushes Combs Scissors Knives Forks Spoons Plates Bowls Cups Gloves Gloves Toys Dolls Figures Models Rockets Trains Planes Cars Trucks Bikes Helmets Pads Guards Targets Balls Clubs Rackets Nets Goals Nets Paper Pens Pencils Notebooks Folders Labels Stickers Tapes Glue Paint Ink Toner Cartridges Screens Displays Monitors Keyboards Mice Printers Scanners Routers Switches Servers Drives Discs Media Files Folders`.split(
    /\s+/
  )
)

const ALLOW = new Set(
  `DVD CD USB MIDI GPS HVAC HID NAS LCD LED PDA MP3 LSAT LGBT LDAP GED MCT MGM HIV IV DIY BBQ DJ CLA CLEP Rock Manga Jazz Blues Pop Punk Rap Metal Folk Blues Flamenco Mariachi Dub Goth Golf Yoga Spa BBQ DVD USB CD MIDI GPS HEPA HID NAS LCD LED PDA`.split(
    /\s+/
  )
)

const file = process.argv[2]
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
let hits = 0
for (const [en, v] of Object.entries(data)) {
  for (const loc of groupA.has(en) ? ['de', 'es', 'fr', 'it', 'tr'] : ['de']) {
    const text = String(v[loc] || '')
    const words = text.split(/[\s,&/\-]+/).filter(Boolean)
    const bad = words.filter((w) => {
      const clean = w.replace(/[^A-Za-zÄÖÜäöüßÉéÈèÊêÁáÀàÂâÍíÌìÎîÓóÒòÔôÚúÙùÛûÇçĞğİıŞş]/g, '')
      if (!clean || clean.length < 4) return false
      if (ALLOW.has(clean) || ALLOW.has(clean.toUpperCase())) return false
      // proper nouns from source
      if (en.split(/[\s,&/\-]+/).some((ew) => ew.toLowerCase() === clean.toLowerCase() && /^[A-Z]/.test(ew) && !COMMON_EN.has(ew)))
        return false
      return COMMON_EN.has(clean) || (clean === clean.toLowerCase() ? false : COMMON_EN.has(clean))
    })
    // also catch exact English phrase leftovers
    const enTokens = en.split(/[\s,&/\-]+/).filter((w) => w.length > 4 && COMMON_EN.has(w))
    const leftover = enTokens.filter((t) => text.includes(t))
    if (leftover.length || bad.length) {
      hits++
      console.log(`${loc}\t${en}\t=>\t${text}\t[${[...new Set([...bad, ...leftover])].join(', ')}]`)
    }
  }
}
console.error('hits', hits)
