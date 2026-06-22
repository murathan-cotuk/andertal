export const CATEGORY_LOCALES = ["de", "en", "tr", "fr", "es", "it"];

export function normalizeCategoryLocale(locale) {
  return String(locale || "de").slice(0, 2).toLowerCase();
}

/**
 * Localized category fields: API may already return auto-translated `name` when locale is passed.
 * Manual metadata.translations override auto-translate. Fallback chain: manual → cached/auto → canonical name.
 */
export function getLocalizedCategory(category, locale) {
  if (!category) return { name: "", description: "", long_content: "" };
  const loc = normalizeCategoryLocale(locale);
  const meta = category.metadata && typeof category.metadata === "object" ? category.metadata : {};
  const tr = meta.translations;
  const fallbackOrder = [loc, "de", "en"];

  function pickField(field, base) {
    if (tr) {
      for (const l of fallbackOrder) {
        if (l && tr[l]?.[field]) return tr[l][field];
      }
      for (const l of CATEGORY_LOCALES) {
        if (tr[l]?.[field]) return tr[l][field];
      }
    }
    const flatKey = `${field}_${loc}`;
    if (meta[flatKey]) return meta[flatKey];
    for (const l of CATEGORY_LOCALES) {
      const k = `${field}_${l}`;
      if (meta[k]) return meta[k];
    }
    return base ?? "";
  }

  return {
    name: pickField("name", category.name),
    description: pickField("description", category.description),
    long_content: pickField("long_content", category.long_content),
  };
}

export function categoryDisplayName(category, locale) {
  const { name } = getLocalizedCategory(category, locale);
  return name || category?.slug || String(category?.id || "");
}

/** Name shown in the edit form for the active UI locale. */
export function categoryNameForEditForm(category, locale) {
  const loc = normalizeCategoryLocale(locale);
  const meta = category?.metadata && typeof category.metadata === "object" ? category.metadata : {};
  const explicit = meta.translations?.[loc]?.name;
  if (explicit) return explicit;
  return getLocalizedCategory(category, locale).name || category?.name || "";
}
