/**
 * Grundpreis (unit price) per PAngV 2022 §4/§5.
 *
 * - Weight / volume goods: the reference unit is always 1 kg or 1 l (the old 100 g / 100 ml
 *   option was abolished in 2022), regardless of the seller's "Grundeinheit" field.
 * - Pieces: the seller's reference quantity is kept (not legally required, informational).
 * - A variant's own content (e.g. 30 ml vs 60 ml) wins over the parent's, otherwise every
 *   variant would show the parent's unit price.
 */

const hasUnitValue = (m) => m && m.unit_type && m.unit_value != null && String(m.unit_value).trim() !== "";

const parseNum = (raw) => {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const fmtNum = (n) => String(Math.round(n * 1000) / 1000).replace(".", ",");

const fmtCents = (cents) =>
  (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Picks unit fields from the variant when it carries its own content, else from the parent. */
export function resolveUnitFields(productMeta, variantMeta) {
  if (hasUnitValue(variantMeta)) return variantMeta;
  if (hasUnitValue(productMeta)) return productMeta;
  return null;
}

/**
 * @returns {{ display: string, contentLabel: string, perUnitCents: number, referenceLabel: string } | null}
 */
export function computeGrundpreis(productMeta, variantMeta, priceCents, formatCents = fmtCents) {
  const src = resolveUnitFields(productMeta, variantMeta);
  if (!src) return null;
  const type = String(src.unit_type).trim();
  const lower = type.toLowerCase();
  const content = parseNum(src.unit_value);
  const price = Number(priceCents);
  if (!(content > 0) || !(price > 0)) return null;

  let factor; // reference quantity expressed in the content's unit
  let referenceLabel;
  let contentUnit = type;
  if (lower === "g") { factor = 1000; referenceLabel = "1 kg"; }
  else if (lower === "kg") { factor = 1; referenceLabel = "1 kg"; }
  else if (lower === "ml") { factor = 1000; referenceLabel = "1 l"; }
  else if (lower === "l") { factor = 1; referenceLabel = "1 l"; contentUnit = "l"; }
  else {
    const ref = parseNum(src.unit_reference) > 0 ? parseNum(src.unit_reference) : 1;
    const unit = lower === "stück" || lower === "piece" ? "Stück" : type;
    factor = ref;
    referenceLabel = `${fmtNum(ref)} ${unit}`;
    contentUnit = unit;
  }
  const perUnitCents = Math.round((price / content) * factor);
  if (!(perUnitCents > 0)) return null;
  return {
    perUnitCents,
    referenceLabel,
    contentLabel: `${fmtNum(content)} ${contentUnit}`,
    display: `(${referenceLabel} = ${formatCents(perUnitCents)} €)`,
  };
}
