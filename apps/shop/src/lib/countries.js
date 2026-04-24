/**
 * Comprehensive world countries list for the shop.
 * Includes ISO code, German label, flag emoji, default currency and locale.
 */

import { normalizeIsoCountryCode } from "@/lib/iso-country";

export const ALL_COUNTRIES = [
  { code: "AF", label: "Afghanistan",              flag: "🇦🇫", currency: "eur", locale: "en" },
  { code: "AL", label: "Albanien",                 flag: "🇦🇱", currency: "eur", locale: "en" },
  { code: "DZ", label: "Algerien",                 flag: "🇩🇿", currency: "eur", locale: "en" },
  { code: "AD", label: "Andorra",                  flag: "🇦🇩", currency: "eur", locale: "en" },
  { code: "AO", label: "Angola",                   flag: "🇦🇴", currency: "eur", locale: "en" },
  { code: "AG", label: "Antigua und Barbuda",      flag: "🇦🇬", currency: "eur", locale: "en" },
  { code: "AR", label: "Argentinien",              flag: "🇦🇷", currency: "eur", locale: "en" },
  { code: "AM", label: "Armenien",                 flag: "🇦🇲", currency: "eur", locale: "en" },
  { code: "AU", label: "Australien",               flag: "🇦🇺", currency: "eur", locale: "en" },
  { code: "AT", label: "Österreich",               flag: "🇦🇹", currency: "eur", locale: "de" },
  { code: "AZ", label: "Aserbaidschan",            flag: "🇦🇿", currency: "eur", locale: "en" },
  { code: "BS", label: "Bahamas",                  flag: "🇧🇸", currency: "eur", locale: "en" },
  { code: "BH", label: "Bahrain",                  flag: "🇧🇭", currency: "eur", locale: "en" },
  { code: "BD", label: "Bangladesch",              flag: "🇧🇩", currency: "eur", locale: "en" },
  { code: "BB", label: "Barbados",                 flag: "🇧🇧", currency: "eur", locale: "en" },
  { code: "BY", label: "Belarus",                  flag: "🇧🇾", currency: "eur", locale: "en" },
  { code: "BE", label: "Belgien",                  flag: "🇧🇪", currency: "eur", locale: "de" },
  { code: "BZ", label: "Belize",                   flag: "🇧🇿", currency: "eur", locale: "en" },
  { code: "BJ", label: "Benin",                    flag: "🇧🇯", currency: "eur", locale: "fr" },
  { code: "BT", label: "Bhutan",                   flag: "🇧🇹", currency: "eur", locale: "en" },
  { code: "BO", label: "Bolivien",                 flag: "🇧🇴", currency: "eur", locale: "es" },
  { code: "BA", label: "Bosnien und Herzegowina",  flag: "🇧🇦", currency: "eur", locale: "en" },
  { code: "BW", label: "Botswana",                 flag: "🇧🇼", currency: "eur", locale: "en" },
  { code: "BR", label: "Brasilien",                flag: "🇧🇷", currency: "eur", locale: "es" },
  { code: "BN", label: "Brunei",                   flag: "🇧🇳", currency: "eur", locale: "en" },
  { code: "BG", label: "Bulgarien",                flag: "🇧🇬", currency: "eur", locale: "en" },
  { code: "BF", label: "Burkina Faso",             flag: "🇧🇫", currency: "eur", locale: "fr" },
  { code: "BI", label: "Burundi",                  flag: "🇧🇮", currency: "eur", locale: "fr" },
  { code: "CV", label: "Cabo Verde",               flag: "🇨🇻", currency: "eur", locale: "en" },
  { code: "KH", label: "Kambodscha",               flag: "🇰🇭", currency: "eur", locale: "en" },
  { code: "CM", label: "Kamerun",                  flag: "🇨🇲", currency: "eur", locale: "fr" },
  { code: "CA", label: "Kanada",                   flag: "🇨🇦", currency: "eur", locale: "en" },
  { code: "CF", label: "Zentralafrikan. Republik", flag: "🇨🇫", currency: "eur", locale: "fr" },
  { code: "TD", label: "Tschad",                   flag: "🇹🇩", currency: "eur", locale: "fr" },
  { code: "CL", label: "Chile",                    flag: "🇨🇱", currency: "eur", locale: "es" },
  { code: "CN", label: "China",                    flag: "🇨🇳", currency: "eur", locale: "en" },
  { code: "CO", label: "Kolumbien",                flag: "🇨🇴", currency: "eur", locale: "es" },
  { code: "KM", label: "Komoren",                  flag: "🇰🇲", currency: "eur", locale: "fr" },
  { code: "CG", label: "Kongo",                    flag: "🇨🇬", currency: "eur", locale: "fr" },
  { code: "CD", label: "DR Kongo",                 flag: "🇨🇩", currency: "eur", locale: "fr" },
  { code: "CR", label: "Costa Rica",               flag: "🇨🇷", currency: "eur", locale: "es" },
  { code: "HR", label: "Kroatien",                 flag: "🇭🇷", currency: "eur", locale: "en" },
  { code: "CU", label: "Kuba",                     flag: "🇨🇺", currency: "eur", locale: "es" },
  { code: "CY", label: "Zypern",                   flag: "🇨🇾", currency: "eur", locale: "en" },
  { code: "CZ", label: "Tschechien",               flag: "🇨🇿", currency: "eur", locale: "en" },
  { code: "DK", label: "Dänemark",                 flag: "🇩🇰", currency: "eur", locale: "en" },
  { code: "DJ", label: "Dschibuti",                flag: "🇩🇯", currency: "eur", locale: "fr" },
  { code: "DM", label: "Dominica",                 flag: "🇩🇲", currency: "eur", locale: "en" },
  { code: "DO", label: "Dominikan. Republik",      flag: "🇩🇴", currency: "eur", locale: "es" },
  { code: "EC", label: "Ecuador",                  flag: "🇪🇨", currency: "eur", locale: "es" },
  { code: "EG", label: "Ägypten",                  flag: "🇪🇬", currency: "eur", locale: "en" },
  { code: "SV", label: "El Salvador",              flag: "🇸🇻", currency: "eur", locale: "es" },
  { code: "GQ", label: "Äquatorialguinea",         flag: "🇬🇶", currency: "eur", locale: "es" },
  { code: "ER", label: "Eritrea",                  flag: "🇪🇷", currency: "eur", locale: "en" },
  { code: "EE", label: "Estland",                  flag: "🇪🇪", currency: "eur", locale: "en" },
  { code: "SZ", label: "Eswatini",                 flag: "🇸🇿", currency: "eur", locale: "en" },
  { code: "ET", label: "Äthiopien",                flag: "🇪🇹", currency: "eur", locale: "en" },
  { code: "FJ", label: "Fidschi",                  flag: "🇫🇯", currency: "eur", locale: "en" },
  { code: "FI", label: "Finnland",                 flag: "🇫🇮", currency: "eur", locale: "en" },
  { code: "FR", label: "Frankreich",               flag: "🇫🇷", currency: "eur", locale: "fr" },
  { code: "GA", label: "Gabun",                    flag: "🇬🇦", currency: "eur", locale: "fr" },
  { code: "GM", label: "Gambia",                   flag: "🇬🇲", currency: "eur", locale: "en" },
  { code: "GE", label: "Georgien",                 flag: "🇬🇪", currency: "eur", locale: "en" },
  { code: "DE", label: "Deutschland",              flag: "🇩🇪", currency: "eur", locale: "de" },
  { code: "GH", label: "Ghana",                    flag: "🇬🇭", currency: "eur", locale: "en" },
  { code: "GR", label: "Griechenland",             flag: "🇬🇷", currency: "eur", locale: "en" },
  { code: "GD", label: "Grenada",                  flag: "🇬🇩", currency: "eur", locale: "en" },
  { code: "GT", label: "Guatemala",                flag: "🇬🇹", currency: "eur", locale: "es" },
  { code: "GN", label: "Guinea",                   flag: "🇬🇳", currency: "eur", locale: "fr" },
  { code: "GW", label: "Guinea-Bissau",            flag: "🇬🇼", currency: "eur", locale: "en" },
  { code: "GY", label: "Guyana",                   flag: "🇬🇾", currency: "eur", locale: "en" },
  { code: "HT", label: "Haiti",                    flag: "🇭🇹", currency: "eur", locale: "fr" },
  { code: "HN", label: "Honduras",                 flag: "🇭🇳", currency: "eur", locale: "es" },
  { code: "HU", label: "Ungarn",                   flag: "🇭🇺", currency: "eur", locale: "en" },
  { code: "IS", label: "Island",                   flag: "🇮🇸", currency: "eur", locale: "en" },
  { code: "IN", label: "Indien",                   flag: "🇮🇳", currency: "eur", locale: "en" },
  { code: "ID", label: "Indonesien",               flag: "🇮🇩", currency: "eur", locale: "en" },
  { code: "IR", label: "Iran",                     flag: "🇮🇷", currency: "eur", locale: "en" },
  { code: "IQ", label: "Irak",                     flag: "🇮🇶", currency: "eur", locale: "en" },
  { code: "IE", label: "Irland",                   flag: "🇮🇪", currency: "eur", locale: "en" },
  { code: "IL", label: "Israel",                   flag: "🇮🇱", currency: "eur", locale: "en" },
  { code: "IT", label: "Italien",                  flag: "🇮🇹", currency: "eur", locale: "it" },
  { code: "JM", label: "Jamaika",                  flag: "🇯🇲", currency: "eur", locale: "en" },
  { code: "JP", label: "Japan",                    flag: "🇯🇵", currency: "eur", locale: "en" },
  { code: "JO", label: "Jordanien",                flag: "🇯🇴", currency: "eur", locale: "en" },
  { code: "KZ", label: "Kasachstan",               flag: "🇰🇿", currency: "eur", locale: "en" },
  { code: "KE", label: "Kenia",                    flag: "🇰🇪", currency: "eur", locale: "en" },
  { code: "KI", label: "Kiribati",                 flag: "🇰🇮", currency: "eur", locale: "en" },
  { code: "KP", label: "Nordkorea",                flag: "🇰🇵", currency: "eur", locale: "en" },
  { code: "KR", label: "Südkorea",                 flag: "🇰🇷", currency: "eur", locale: "en" },
  { code: "KW", label: "Kuwait",                   flag: "🇰🇼", currency: "eur", locale: "en" },
  { code: "KG", label: "Kirgisistan",              flag: "🇰🇬", currency: "eur", locale: "en" },
  { code: "LA", label: "Laos",                     flag: "🇱🇦", currency: "eur", locale: "en" },
  { code: "LV", label: "Lettland",                 flag: "🇱🇻", currency: "eur", locale: "en" },
  { code: "LB", label: "Libanon",                  flag: "🇱🇧", currency: "eur", locale: "en" },
  { code: "LS", label: "Lesotho",                  flag: "🇱🇸", currency: "eur", locale: "en" },
  { code: "LR", label: "Liberia",                  flag: "🇱🇷", currency: "eur", locale: "en" },
  { code: "LY", label: "Libyen",                   flag: "🇱🇾", currency: "eur", locale: "en" },
  { code: "LI", label: "Liechtenstein",            flag: "🇱🇮", currency: "chf", locale: "de" },
  { code: "LT", label: "Litauen",                  flag: "🇱🇹", currency: "eur", locale: "en" },
  { code: "LU", label: "Luxemburg",                flag: "🇱🇺", currency: "eur", locale: "de" },
  { code: "MG", label: "Madagaskar",               flag: "🇲🇬", currency: "eur", locale: "fr" },
  { code: "MW", label: "Malawi",                   flag: "🇲🇼", currency: "eur", locale: "en" },
  { code: "MY", label: "Malaysia",                 flag: "🇲🇾", currency: "eur", locale: "en" },
  { code: "MV", label: "Malediven",                flag: "🇲🇻", currency: "eur", locale: "en" },
  { code: "ML", label: "Mali",                     flag: "🇲🇱", currency: "eur", locale: "fr" },
  { code: "MT", label: "Malta",                    flag: "🇲🇹", currency: "eur", locale: "en" },
  { code: "MH", label: "Marshallinseln",           flag: "🇲🇭", currency: "eur", locale: "en" },
  { code: "MR", label: "Mauretanien",              flag: "🇲🇷", currency: "eur", locale: "fr" },
  { code: "MU", label: "Mauritius",                flag: "🇲🇺", currency: "eur", locale: "en" },
  { code: "MX", label: "Mexiko",                   flag: "🇲🇽", currency: "eur", locale: "es" },
  { code: "FM", label: "Mikronesien",              flag: "🇫🇲", currency: "eur", locale: "en" },
  { code: "MD", label: "Moldau",                   flag: "🇲🇩", currency: "eur", locale: "en" },
  { code: "MC", label: "Monaco",                   flag: "🇲🇨", currency: "eur", locale: "fr" },
  { code: "MN", label: "Mongolei",                 flag: "🇲🇳", currency: "eur", locale: "en" },
  { code: "ME", label: "Montenegro",               flag: "🇲🇪", currency: "eur", locale: "en" },
  { code: "MA", label: "Marokko",                  flag: "🇲🇦", currency: "eur", locale: "fr" },
  { code: "MZ", label: "Mosambik",                 flag: "🇲🇿", currency: "eur", locale: "en" },
  { code: "MM", label: "Myanmar",                  flag: "🇲🇲", currency: "eur", locale: "en" },
  { code: "NA", label: "Namibia",                  flag: "🇳🇦", currency: "eur", locale: "en" },
  { code: "NR", label: "Nauru",                    flag: "🇳🇷", currency: "eur", locale: "en" },
  { code: "NP", label: "Nepal",                    flag: "🇳🇵", currency: "eur", locale: "en" },
  { code: "NL", label: "Niederlande",              flag: "🇳🇱", currency: "eur", locale: "en" },
  { code: "NZ", label: "Neuseeland",               flag: "🇳🇿", currency: "eur", locale: "en" },
  { code: "NI", label: "Nicaragua",                flag: "🇳🇮", currency: "eur", locale: "es" },
  { code: "NE", label: "Niger",                    flag: "🇳🇪", currency: "eur", locale: "fr" },
  { code: "NG", label: "Nigeria",                  flag: "🇳🇬", currency: "eur", locale: "en" },
  { code: "MK", label: "Nordmazedonien",           flag: "🇲🇰", currency: "eur", locale: "en" },
  { code: "NO", label: "Norwegen",                 flag: "🇳🇴", currency: "eur", locale: "en" },
  { code: "OM", label: "Oman",                     flag: "🇴🇲", currency: "eur", locale: "en" },
  { code: "PK", label: "Pakistan",                 flag: "🇵🇰", currency: "eur", locale: "en" },
  { code: "PW", label: "Palau",                    flag: "🇵🇼", currency: "eur", locale: "en" },
  { code: "PA", label: "Panama",                   flag: "🇵🇦", currency: "eur", locale: "es" },
  { code: "PG", label: "Papua-Neuguinea",          flag: "🇵🇬", currency: "eur", locale: "en" },
  { code: "PY", label: "Paraguay",                 flag: "🇵🇾", currency: "eur", locale: "es" },
  { code: "PE", label: "Peru",                     flag: "🇵🇪", currency: "eur", locale: "es" },
  { code: "PH", label: "Philippinen",              flag: "🇵🇭", currency: "eur", locale: "en" },
  { code: "PL", label: "Polen",                    flag: "🇵🇱", currency: "eur", locale: "en" },
  { code: "PT", label: "Portugal",                 flag: "🇵🇹", currency: "eur", locale: "en" },
  { code: "QA", label: "Katar",                    flag: "🇶🇦", currency: "eur", locale: "en" },
  { code: "RO", label: "Rumänien",                 flag: "🇷🇴", currency: "eur", locale: "en" },
  { code: "RU", label: "Russland",                 flag: "🇷🇺", currency: "eur", locale: "en" },
  { code: "RW", label: "Ruanda",                   flag: "🇷🇼", currency: "eur", locale: "fr" },
  { code: "KN", label: "St. Kitts und Nevis",      flag: "🇰🇳", currency: "eur", locale: "en" },
  { code: "LC", label: "St. Lucia",                flag: "🇱🇨", currency: "eur", locale: "en" },
  { code: "VC", label: "St. Vincent",              flag: "🇻🇨", currency: "eur", locale: "en" },
  { code: "WS", label: "Samoa",                    flag: "🇼🇸", currency: "eur", locale: "en" },
  { code: "SM", label: "San Marino",               flag: "🇸🇲", currency: "eur", locale: "it" },
  { code: "ST", label: "São Tomé und Príncipe",    flag: "🇸🇹", currency: "eur", locale: "en" },
  { code: "SA", label: "Saudi-Arabien",            flag: "🇸🇦", currency: "eur", locale: "en" },
  { code: "SN", label: "Senegal",                  flag: "🇸🇳", currency: "eur", locale: "fr" },
  { code: "RS", label: "Serbien",                  flag: "🇷🇸", currency: "eur", locale: "en" },
  { code: "SC", label: "Seychellen",               flag: "🇸🇨", currency: "eur", locale: "en" },
  { code: "SL", label: "Sierra Leone",             flag: "🇸🇱", currency: "eur", locale: "en" },
  { code: "SG", label: "Singapur",                 flag: "🇸🇬", currency: "eur", locale: "en" },
  { code: "SK", label: "Slowakei",                 flag: "🇸🇰", currency: "eur", locale: "en" },
  { code: "SI", label: "Slowenien",                flag: "🇸🇮", currency: "eur", locale: "en" },
  { code: "SB", label: "Salomonen",                flag: "🇸🇧", currency: "eur", locale: "en" },
  { code: "SO", label: "Somalia",                  flag: "🇸🇴", currency: "eur", locale: "en" },
  { code: "ZA", label: "Südafrika",                flag: "🇿🇦", currency: "eur", locale: "en" },
  { code: "SS", label: "Südsudan",                 flag: "🇸🇸", currency: "eur", locale: "en" },
  { code: "ES", label: "Spanien",                  flag: "🇪🇸", currency: "eur", locale: "es" },
  { code: "LK", label: "Sri Lanka",                flag: "🇱🇰", currency: "eur", locale: "en" },
  { code: "SD", label: "Sudan",                    flag: "🇸🇩", currency: "eur", locale: "en" },
  { code: "SR", label: "Suriname",                 flag: "🇸🇷", currency: "eur", locale: "en" },
  { code: "SE", label: "Schweden",                 flag: "🇸🇪", currency: "eur", locale: "en" },
  { code: "CH", label: "Schweiz",                  flag: "🇨🇭", currency: "chf", locale: "de" },
  { code: "SY", label: "Syrien",                   flag: "🇸🇾", currency: "eur", locale: "en" },
  { code: "TW", label: "Taiwan",                   flag: "🇹🇼", currency: "eur", locale: "en" },
  { code: "TJ", label: "Tadschikistan",            flag: "🇹🇯", currency: "eur", locale: "en" },
  { code: "TZ", label: "Tansania",                 flag: "🇹🇿", currency: "eur", locale: "en" },
  { code: "TH", label: "Thailand",                 flag: "🇹🇭", currency: "eur", locale: "en" },
  { code: "TL", label: "Osttimor",                 flag: "🇹🇱", currency: "eur", locale: "en" },
  { code: "TG", label: "Togo",                     flag: "🇹🇬", currency: "eur", locale: "fr" },
  { code: "TO", label: "Tonga",                    flag: "🇹🇴", currency: "eur", locale: "en" },
  { code: "TT", label: "Trinidad und Tobago",      flag: "🇹🇹", currency: "eur", locale: "en" },
  { code: "TN", label: "Tunesien",                 flag: "🇹🇳", currency: "eur", locale: "fr" },
  { code: "TR", label: "Türkiye",                  flag: "🇹🇷", currency: "try", locale: "tr" },
  { code: "TM", label: "Turkmenistan",             flag: "🇹🇲", currency: "eur", locale: "en" },
  { code: "TV", label: "Tuvalu",                   flag: "🇹🇻", currency: "eur", locale: "en" },
  { code: "UG", label: "Uganda",                   flag: "🇺🇬", currency: "eur", locale: "en" },
  { code: "UA", label: "Ukraine",                  flag: "🇺🇦", currency: "eur", locale: "en" },
  { code: "AE", label: "Verein. Arab. Emirate",    flag: "🇦🇪", currency: "eur", locale: "en" },
  { code: "GB", label: "Vereinigtes Königreich",   flag: "🇬🇧", currency: "gbp", locale: "en" },
  { code: "US", label: "USA",                      flag: "🇺🇸", currency: "usd", locale: "en" },
  { code: "UY", label: "Uruguay",                  flag: "🇺🇾", currency: "eur", locale: "es" },
  { code: "UZ", label: "Usbekistan",               flag: "🇺🇿", currency: "eur", locale: "en" },
  { code: "VU", label: "Vanuatu",                  flag: "🇻🇺", currency: "eur", locale: "en" },
  { code: "VE", label: "Venezuela",                flag: "🇻🇪", currency: "eur", locale: "es" },
  { code: "VN", label: "Vietnam",                  flag: "🇻🇳", currency: "eur", locale: "en" },
  { code: "YE", label: "Jemen",                    flag: "🇾🇪", currency: "eur", locale: "en" },
  { code: "ZM", label: "Sambia",                   flag: "🇿🇲", currency: "eur", locale: "en" },
  { code: "ZW", label: "Simbabwe",                 flag: "🇿🇼", currency: "eur", locale: "en" },
];

/** Fast lookup by code */
export const COUNTRY_MAP = Object.fromEntries(ALL_COUNTRIES.map((c) => [c.code, c]));

/**
 * Returns the localized display name for a country code using Intl.DisplayNames.
 * Falls back to the German label from ALL_COUNTRIES, then to the code itself.
 */
export function getLocalizedCountryName(code, locale = "de") {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    const name = dn.of(code);
    if (name && name !== code) return name;
  } catch (_) {}
  return COUNTRY_MAP[code]?.label || code;
}

/**
 * Given shippingGroups from /store/shipping-groups,
 * returns countries that have at least one finite, non-negative price (incl. 0 = free).
 * Sorted alphabetically by label in the requested locale. Unknown ISO codes still appear with code as label.
 */
export function getShippableCountries(shippingGroups, locale = "de") {
  const codes = new Set();
  for (const g of (shippingGroups || [])) {
    const prices = g.prices || {};
    for (const [rawCode, rawPrice] of Object.entries(prices)) {
      if (rawPrice == null || rawPrice === "") continue;
      const n = Number(rawPrice);
      if (!Number.isFinite(n) || n < 0) continue;
      const iso = normalizeIsoCountryCode(rawCode);
      if (iso) codes.add(iso);
    }
  }
  const out = [];
  for (const code of codes) {
    const meta = COUNTRY_MAP[code];
    const localizedLabel = getLocalizedCountryName(code, locale);
    if (meta) out.push({ ...meta, label: localizedLabel });
    else out.push({ code, label: localizedLabel, flag: "", currency: "eur", locale: "en" });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, locale));
}
