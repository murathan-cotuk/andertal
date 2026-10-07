import { lt } from "@/lib/locale-text";

/** GS1 check digit for GTIN-8/12/13/14 — same rule the backend enforces for new codes. */
export function isValidGtin(raw) {
  const d = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(d) || ![8, 12, 13, 14].includes(d.length)) return false;
  let sum = 0;
  for (let i = d.length - 2, w = 3; i >= 0; i -= 1, w = w === 3 ? 1 : 3) sum += Number(d[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

/**
 * Inline field error for an EAN input. Codes saved before the GTIN rule (unchanged value) are
 * not flagged — the backend accepts them too.
 */
export function gtinFieldError(value, originalValue, locale) {
  const v = String(value ?? "").trim();
  if (!v || v === String(originalValue ?? "").trim() || isValidGtin(v)) return undefined;
  return lt(
    locale,
    "Not a valid EAN/GTIN (8, 12, 13 or 14 digits, check digit). Leave empty if the product has none.",
    "Geçerli bir EAN/GTIN değil (8, 12, 13 veya 14 hane, kontrol hanesi). Ürünün yoksa boş bırakın.",
    "EAN/GTIN invalide (8, 12, 13 ou 14 chiffres, clé de contrôle). Laisser vide si le produit n'en a pas.",
    "EAN/GTIN no válido (8, 12, 13 o 14 dígitos, dígito de control). Déjelo vacío si el producto no tiene.",
    "EAN/GTIN non valido (8, 12, 13 o 14 cifre, cifra di controllo). Lasciare vuoto se il prodotto non ne ha.",
    "Keine gültige EAN/GTIN (8, 12, 13 oder 14 Stellen, Prüfziffer). Leer lassen, wenn das Produkt keine hat.",
  );
}
