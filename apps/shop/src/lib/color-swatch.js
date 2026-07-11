/**
 * Fallback swatch color when a variation option has no swatch_image.
 *
 * The naive approach (`background: value.toLowerCase()`) only works for values
 * that happen to already be valid CSS color keywords (English). Product option
 * values are entered in the shop's other locales too (de/fr/it/es/tr) — e.g.
 * "Schwarz", "Kırmızı", "Rosso" — which CSS does not recognize, so the browser
 * silently drops the invalid `background` value and the swatch renders blank.
 * This maps common color words across all shop locales to a real CSS color.
 */

const COLOR_HEX = {
  black: "#18181b",
  white: "#ffffff",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  purple: "#9333ea",
  brown: "#78350f",
  pink: "#ec4899",
  orange: "#ea580c",
  gray: "#9ca3af",
  beige: "#e3d5b8",
  gold: "#d4af37",
  silver: "#c0c0c0",
  navy: "#1e3a8a",
  turquoise: "#14b8a6",
  khaki: "#bdb76b",
  cream: "#fdf6e3",
  ivory: "#fffff0",
  mint: "#a7f3d0",
  lavender: "#c4b5fd",
  maroon: "#7f1d1d",
  olive: "#6b7f2a",
  teal: "#0d9488",
  coral: "#f97316",
  burgundy: "#7c2d3e",
  bronze: "#a97142",
  copper: "#b87333",
  multicolor: "linear-gradient(135deg,#ef4444,#f59e0b,#10b981,#3b82f6,#8b5cf6)",
};

/** Normalized (diacritics/umlaut-stripped) color word -> COLOR_HEX key */
const ALIASES = {
  // German
  schwarz: "black", weiss: "white", rot: "red", blau: "blue", grun: "green", gelb: "yellow",
  lila: "purple", violett: "purple", braun: "brown", rosa: "pink", grau: "gray", beige: "beige",
  gold: "gold", silber: "silver", marine: "navy", dunkelblau: "navy", turkis: "turquoise",
  khaki: "khaki", creme: "cream", elfenbein: "ivory", minze: "mint", lavendel: "lavender",
  kastanienbraun: "maroon", oliv: "olive", petrol: "teal", koralle: "coral", bordeaux: "burgundy",
  bronze: "bronze", kupfer: "copper", mehrfarbig: "multicolor", bunt: "multicolor",
  // French
  noir: "black", blanc: "white", rouge: "red", bleu: "blue", vert: "green", jaune: "yellow",
  violet: "purple", marron: "brown", rose: "pink", gris: "gray", argent: "silver",
  ivoire: "ivory", menthe: "mint", lavande: "lavender", corail: "coral", cuivre: "copper",
  multicolore: "multicolor", kaki: "khaki",
  // Italian
  nero: "black", bianco: "white", rosso: "red", blu: "blue", verde: "green", giallo: "yellow",
  viola: "purple", marrone: "brown", arancione: "orange", grigio: "gray", oro: "gold",
  argento: "silver", turchese: "turquoise", cachi: "khaki", crema: "cream", avorio: "ivory",
  menta: "mint", lavanda: "lavender", oliva: "olive", corallo: "coral", bronzo: "bronze",
  rame: "copper",
  // Spanish
  negro: "black", rojo: "red", azul: "blue", amarillo: "yellow", morado: "purple",
  naranja: "orange", plata: "silver", turquesa: "turquoise", caqui: "khaki", marfil: "ivory",
  burdeos: "burgundy", bronce: "bronze", cobre: "copper",
  // Turkish
  siyah: "black", beyaz: "white", kirmizi: "red", mavi: "blue", yesil: "green", sari: "yellow",
  mor: "purple", kahverengi: "brown", pembe: "pink", turuncu: "orange", bej: "beige",
  altin: "gold", gumus: "silver", lacivert: "navy", turkuaz: "turquoise", haki: "khaki",
  krem: "cream", fildisi: "ivory", nane: "mint", lavanta: "lavender", bordo: "burgundy",
  zeytin: "olive", mercan: "coral", bronz: "bronze", bakir: "copper", cokrenkli: "multicolor",
};

const FALLBACK_HEX = "#d1d5db";

/**
 * @param {string} value - raw option value, e.g. "Schwarz", "Kırmızı", "Blau"
 * @returns {string} a valid CSS `background` value (hex or gradient)
 */
export function colorSwatchFallback(value) {
  const raw = String(value || "").trim();
  if (!raw) return FALLBACK_HEX;
  const norm = raw
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "");
  const key = ALIASES[norm] || norm;
  return COLOR_HEX[key] || FALLBACK_HEX;
}
