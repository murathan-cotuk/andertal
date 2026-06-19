import { dateLocaleFor } from "@/lib/locale-text";

const ISO_CODES = [
  "AF", "AL", "DZ", "AD", "AO", "AG", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ",
  "BJ", "BT", "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "CF", "TD", "CL", "CN",
  "CO", "KM", "CG", "CD", "CR", "HR", "CU", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER",
  "EE", "SZ", "ET", "FJ", "FI", "FR", "GA", "GM", "GE", "DE", "GH", "GR", "GD", "GT", "GN", "GW", "GY", "HT",
  "HN", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI", "KP", "KR",
  "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MG", "MW", "MY", "MV", "ML", "MT", "MH",
  "MR", "MU", "MX", "FM", "MD", "MC", "MN", "ME", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NZ", "NI", "NE",
  "NG", "MK", "NO", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PH", "PL", "PT", "QA", "RO", "RU", "RW", "KN",
  "LC", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO", "ZA", "SS", "ES",
  "LK", "SD", "SR", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TO", "TT", "TN", "TR", "TM", "TV",
  "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VU", "VE", "VN", "YE", "ZM", "ZW",
];

/** Locale-aware country list for pickers (labels via Intl.DisplayNames). */
export function getCountryList(locale) {
  const loc = dateLocaleFor(locale).split("-")[0];
  let dn;
  try {
    dn = new Intl.DisplayNames([loc], { type: "region" });
  } catch {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  }
  return ISO_CODES.map((code) => ({ code, label: dn.of(code) || code }))
    .sort((a, b) => a.label.localeCompare(b.label, loc));
}

export function defaultCountryName(locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  if (loc === "en") return "Germany";
  if (loc === "tr") return "Almanya";
  if (loc === "fr") return "Allemagne";
  if (loc === "es") return "Alemania";
  if (loc === "it") return "Germania";
  return "Deutschland";
}
