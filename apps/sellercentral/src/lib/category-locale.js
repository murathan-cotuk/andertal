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
    name: pickField("name", category.localized_name || category.name),
    description: pickField("description", category.description),
    long_content:
      (tr && tr[loc] && (tr[loc].long_content || tr[loc].description)) ||
      pickField("long_content", category.long_content),
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

/**
 * Edit-form fields for the active UI locale.
 * Non-German locales use metadata.translations / seo_i18n only — they must not
 * fall back to canonical DE long_content / SEO (that looked like "import stayed German").
 */
export function categoryFieldsForEditForm(category, locale) {
  const loc = normalizeCategoryLocale(locale);
  const meta = category?.metadata && typeof category.metadata === "object" ? category.metadata : {};
  const tr = meta.translations?.[loc] && typeof meta.translations[loc] === "object" ? meta.translations[loc] : {};
  const seo = meta.seo_i18n?.[loc] && typeof meta.seo_i18n[loc] === "object" ? meta.seo_i18n[loc] : {};
  const isDe = loc === "de";
  return {
    name: (tr.name && String(tr.name).trim()) || categoryNameForEditForm(category, locale) || "",
    long_content:
      tr.long_content ||
      tr.description ||
      (isDe ? category?.long_content || meta.richtext || "" : "") ||
      "",
    meta_title:
      tr.seo_title ||
      seo.meta_title ||
      seo.title ||
      (isDe ? category?.seo_title || meta.meta_title || "" : "") ||
      "",
    meta_description:
      tr.seo_description ||
      seo.meta_description ||
      seo.description ||
      (isDe ? category?.seo_description || meta.meta_description || "" : "") ||
      "",
    keywords:
      tr.keywords ||
      tr.seo_keywords ||
      seo.keywords ||
      (isDe ? meta.keywords || "" : "") ||
      "",
  };
}

/** Merge the active-locale form fields into metadata.translations + seo_i18n. */
export function mergeCategoryLocaleIntoMetadata(existingMeta, locale, fields) {
  const loc = normalizeCategoryLocale(locale);
  const meta = existingMeta && typeof existingMeta === "object" ? { ...existingMeta } : {};
  const tr = { ...(meta.translations && typeof meta.translations === "object" ? meta.translations : {}) };
  const seoI18n = { ...(meta.seo_i18n && typeof meta.seo_i18n === "object" ? meta.seo_i18n : {}) };
  const prev = tr[loc] && typeof tr[loc] === "object" ? { ...tr[loc] } : {};
  const name = fields.name != null ? String(fields.name).trim() : "";
  const longContent = fields.long_content != null ? String(fields.long_content) : "";
  const metaTitle = fields.meta_title != null ? String(fields.meta_title).trim() : "";
  const metaDescription = fields.meta_description != null ? String(fields.meta_description).trim() : "";
  const keywords = fields.keywords != null ? String(fields.keywords).trim() : "";
  if (name) prev.name = name;
  prev.long_content = longContent;
  prev.description = longContent;
  prev.seo_title = metaTitle;
  prev.seo_description = metaDescription;
  prev.keywords = keywords;
  prev.seo_keywords = keywords;
  tr[loc] = prev;
  seoI18n[loc] = {
    ...(seoI18n[loc] && typeof seoI18n[loc] === "object" ? seoI18n[loc] : {}),
    meta_title: metaTitle,
    meta_description: metaDescription,
    keywords,
  };
  meta.translations = tr;
  meta.seo_i18n = seoI18n;
  if (loc === "de") {
    meta.meta_title = metaTitle || null;
    meta.meta_description = metaDescription || null;
    meta.keywords = keywords || null;
    meta.richtext = longContent || null;
  }
  return meta;
}
