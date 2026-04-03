import { DEFAULT_BUTTON_COLORS } from "./button-type-colors.js";

export function ensureActiveVariant(variants = []) {
  if (variants.length === 0) return [];
  const hasActive = variants.some((v) => v?.active);
  if (hasActive) return variants;
  return variants.map((v, i) => ({ ...v, active: i === 0 }));
}

export function normalizeButtonType(typeData = {}) {
  return {
    ...typeData,
    variants: ensureActiveVariant(
      (typeData.variants || []).map((variant, idx) => ({
        name: variant?.name || `Variante ${idx + 1}`,
        code: variant?.code || "",
        active: Boolean(variant?.active),
      }))
    ),
  };
}

function mergeButtonColors(typeKey, defColors, loadedColors) {
  const base = { ...(DEFAULT_BUTTON_COLORS[typeKey] || {}), ...(defColors || {}) };
  return { ...base, ...(loadedColors || {}) };
}

export function mergeButtonCatalog(defaults, loaded) {
  const keys = new Set([...Object.keys(defaults || {}), ...Object.keys(loaded || {})]);
  const result = {};
  for (const key of keys) {
    const def = defaults[key] || { label: key, variants: [{ name: "Standard", code: "", active: true }] };
    const lo = loaded[key] || {};
    const variants =
      Array.isArray(lo.variants) && lo.variants.length > 0 ? lo.variants : (def.variants || []);
    const colors = mergeButtonColors(key, def.colors, lo.colors);
    result[key] = normalizeButtonType({
      ...def,
      ...lo,
      colors,
      variants,
    });
  }
  return result;
}
