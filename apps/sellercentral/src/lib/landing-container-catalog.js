/** Shared catalog metadata for landing container types (no React). */

export const CONTAINER_GROUPS = [
  { id: "hero_media", order: 1 },
  { id: "commerce", order: 2 },
  { id: "content", order: 3 },
  { id: "support", order: 4 },
];

export const CONTAINER_TYPE_GROUP = {
  hero_banner: "hero_media",
  image_text: "hero_media",
  image_grid: "hero_media",
  content_mosaic: "hero_media",
  image_carousel: "hero_media",
  video_block: "hero_media",
  collection_carousel: "commerce",
  bestseller_carousel: "commerce",
  category_sidebar: "commerce",
  seller_carousel: "commerce",
  collections_carousel: "commerce",
  single_product: "commerce",
  personalized_product_row: "commerce",
  text_block: "content",
  banner_cta: "content",
  accordion: "content",
  tabs: "content",
  blog_carousel: "content",
  newsletter: "content",
  feature_grid: "content",
  testimonials: "content",
  support_hero: "support",
  support_case_wizard: "support",
  support_topic_grid: "support",
  support_faq: "support",
};

export function groupLabel(groupId, locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const map = {
    hero_media: {
      en: "Hero & media",
      tr: "Hero & medya",
      fr: "Hero & médias",
      es: "Hero y medios",
      it: "Hero e media",
      de: "Hero & Medien",
    },
    commerce: {
      en: "Shop & catalog",
      tr: "Mağaza & katalog",
      fr: "Boutique & catalogue",
      es: "Tienda y catálogo",
      it: "Negozio e catalogo",
      de: "Shop & Katalog",
    },
    content: {
      en: "Content & trust",
      tr: "İçerik & güven",
      fr: "Contenu & confiance",
      es: "Contenido y confianza",
      it: "Contenuti e fiducia",
      de: "Inhalt & Vertrauen",
    },
    support: {
      en: "Customer support",
      tr: "Müşteri desteği",
      fr: "Support client",
      es: "Atención al cliente",
      it: "Assistenza clienti",
      de: "Kundensupport",
    },
  };
  const row = map[groupId] || {};
  return row[loc] || row.de || row.en || groupId;
}

export function groupContainerTypes(types, locale) {
  const buckets = new Map(CONTAINER_GROUPS.map((g) => [g.id, []]));
  for (const t of types || []) {
    const gid = t.group || CONTAINER_TYPE_GROUP[t.type] || "content";
    if (!buckets.has(gid)) buckets.set(gid, []);
    buckets.get(gid).push({ ...t, group: gid });
  }
  return CONTAINER_GROUPS
    .map((g) => ({
      id: g.id,
      label: groupLabel(g.id, locale),
      items: buckets.get(g.id) || [],
    }))
    .filter((g) => g.items.length > 0);
}
