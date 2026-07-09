import { optionCanonicalValue } from "@/lib/variation-labels";

function optionKey(opt) {
  return optionCanonicalValue(opt).toLowerCase();
}

function findMetaOption(options, value) {
  const v = String(value ?? "").trim().toLowerCase();
  return (options || []).find((o) => optionCanonicalValue(o).toLowerCase() === v) || null;
}

/**
 * Merge variation_groups.options with unique values from variant.option_values
 * so PDP shows the same choices as listing cards (metadata order preserved).
 */
export function enrichVariationGroups(variationGroups, variants) {
  if (!Array.isArray(variationGroups) || !variationGroups.length) return variationGroups;
  const list = Array.isArray(variants) ? variants : [];

  return variationGroups.map((group, gIdx) => {
    const merged = Array.isArray(group.options) ? [...group.options] : [];
    const seen = new Set(merged.map((o) => optionKey(o)).filter(Boolean));

    for (const v of list) {
      const ov = Array.isArray(v.option_values) ? v.option_values : [];
      const raw = ov[gIdx];
      if (raw == null || String(raw).trim() === "") continue;
      const key = String(raw).trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (findMetaOption(merged, raw)) continue;
      const swatch = v.swatch_image_url || v.swatch_image;
      merged.push(
        swatch
          ? { value: String(raw).trim(), swatch_image: swatch }
          : { value: String(raw).trim() },
      );
    }

    return { ...group, options: merged };
  });
}
