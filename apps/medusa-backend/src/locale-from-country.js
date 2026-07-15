/** Map ISO shipping/billing country → document/email locale (matches shop conventions). */
const SUPPORTED_LOCALES = ['en', 'de', 'tr', 'fr', 'it', 'es']

const COUNTRY_TO_LOCALE = {
  DE: 'de',
  AT: 'de',
  CH: 'de',
  LU: 'de',
  LI: 'de',
  BE: 'de',
  TR: 'tr',
  FR: 'fr',
  MC: 'fr',
  ES: 'es',
  MX: 'es',
  IT: 'it',
  SM: 'it',
  VA: 'it',
  GB: 'en',
  US: 'en',
  IE: 'en',
  AU: 'en',
  NZ: 'en',
  CA: 'en',
}

function resolveLocaleFromCountry(countryRaw, fallback = 'en') {
  const c = String(countryRaw || '').trim().toUpperCase()
  if (c && SUPPORTED_LOCALES.includes(COUNTRY_TO_LOCALE[c])) {
    return COUNTRY_TO_LOCALE[c]
  }
  return fallback
}

module.exports = { SUPPORTED_LOCALES, COUNTRY_TO_LOCALE, resolveLocaleFromCountry }
