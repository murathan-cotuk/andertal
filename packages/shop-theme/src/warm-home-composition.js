/**
 * Homepage composition of the "Warmer Marktplatz" design.
 *
 * Until the merchant saves a homepage built from the new templates (Sellercentral → Landing page →
 * "Alle einfügen"), the storefront renders this composition instead of the stored one. Nothing is
 * written to the database. Images the merchant already uploaded (hero slides, Bilder-Karussell) are
 * reused, the Bilder-Karussell container keeps its own settings and logic.
 *
 * The stored composition wins when:
 *  - the shop uses the classic design (styles.design_preset === "classic"), or
 *  - the saved page already contains one of the new templates, or settings.homepage_layout says so
 *    (Sellercentral writes "warm_marketplace_v1" or "custom" whenever the homepage is saved).
 */

export const WARM_HOME_LAYOUT = "warm_marketplace_v1";
/** Set by Sellercentral when the merchant saves a homepage of their own. */
export const CUSTOM_HOME_LAYOUT = "custom";
const WARM_TYPES = new Set(["promo_bento", "category_circles"]);
const LANGS = ["en", "tr", "fr", "es", "it"];

/** { de, en, tr, fr, es, it } per field → root (de) + _i18n */
function loc(base, fields) {
  const out = { ...base };
  for (const [k, v] of Object.entries(fields)) out[k] = v.de;
  out._i18n = Object.fromEntries(LANGS.map((l) => [l, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[l] ?? v.en ?? v.de]))]));
  return out;
}
const v = (de, en, tr, fr, es, it) => ({ de, en, tr, fr, es, it });

function uid(key) {
  return `warm-home-${key}`;
}

function heroImages(containers) {
  const urls = [];
  for (const c of containers) {
    if (c?.visible === false) continue;
    if (c.type === "hero_banner" && Array.isArray(c.slides)) {
      for (const s of c.slides) if (s?.image) urls.push({ url: s.image, title: s.title || "", text: s.subtitle || "", link: s.btn_url || "" });
    }
    if (c.type === "image_carousel" && Array.isArray(c.images)) {
      for (const im of c.images) if (im?.url) urls.push({ url: im.url, title: im.title || "", text: im.text || "", link: im.link || "" });
    }
  }
  return urls;
}

export function isWarmHomeSaved(containers, settings) {
  const layout = settings && settings.homepage_layout;
  if (layout === WARM_HOME_LAYOUT || layout === CUSTOM_HOME_LAYOUT) return true;
  return (containers || []).some((c) => c && WARM_TYPES.has(c.type));
}

export function buildWarmHomeContainers(stored = []) {
  const list = Array.isArray(stored) ? stored.filter(Boolean) : [];
  const images = heroImages(list);
  const storedCarousel = list.find((c) => c.type === "image_carousel" && c.visible !== false && Array.isArray(c.images) && c.images.some((i) => i?.url));

  const bento = loc(
    {
      id: uid("bento"),
      type: "promo_bento",
      visible: true,
      // Phones open with the image carousel (design: MobileHome); the bento is the desktop hero.
      visible_on: "desktop",
      btn_url: "/neuheiten",
      btn2_url: "/verkaufen",
      bg_color: "#FCEBD5",
      text_color: "#1D1B18",
      images: images.slice(0, 4).map((im) => ({ url: im.url })),
      tiles: [
        loc({ link: "/sales", bg_color: "#1D1B18", text_color: "#FFFFFF", eyebrow_color: "#EE8A12" }, {
          eyebrow: v("Sale", "Sale", "İndirim", "Soldes", "Rebajas", "Saldi"),
          title: v("Bis zu −50 %", "Up to −50%", "%50’ye varan", "Jusqu’à −50 %", "Hasta −50 %", "Fino al −50%"),
          subtitle: v("auf ausgewählte Marken", "on selected brands", "seçili markalarda", "sur une sélection de marques", "en marcas seleccionadas", "su brand selezionati"),
        }),
        loc({ link: "/neuheiten", bg_color: "#DCE3D6", text_color: "#1D1B18", eyebrow_color: "#2F5A36", arrow: true }, {
          eyebrow: v("Neuheiten", "New in", "Yeni", "Nouveautés", "Novedades", "Novità"),
          title: v("Frisch eingetroffen", "Just arrived", "Yeni geldi", "Tout juste arrivés", "Recién llegados", "Appena arrivati"),
          subtitle: v("Alle ansehen", "See all", "Tümünü gör", "Tout voir", "Ver todo", "Vedi tutto"),
        }),
      ],
    },
    {
      badge: v("Herbst-Kollektion", "Autumn collection", "Sonbahar koleksiyonu", "Collection d’automne", "Colección de otoño", "Collezione autunno"),
      title: v("Gutes aus Europa. Direkt von den Machern.", "Good things from Europe. Straight from the makers.", "Avrupa’dan iyi ürünler. Doğrudan üreticisinden.", "Le meilleur d’Europe. Directement des créateurs.", "Lo mejor de Europa. Directo de los creadores.", "Il meglio d’Europa. Direttamente dai produttori."),
      text: v(
        "Entdecke unabhängige Marken und geprüfte Händler — mit Käuferschutz und Bonuspunkten bei jedem Kauf.",
        "Discover independent brands and verified sellers — with buyer protection and bonus points on every purchase.",
        "Bağımsız markaları ve doğrulanmış satıcıları keşfet — her alışverişte alıcı koruması ve bonus puan.",
        "Découvrez des marques indépendantes et des vendeurs vérifiés — avec protection acheteur et points bonus.",
        "Descubre marcas independientes y vendedores verificados — con protección al comprador y puntos.",
        "Scopri brand indipendenti e venditori verificati — con protezione acquirenti e punti bonus.",
      ),
      btn_text: v("Jetzt entdecken", "Discover now", "Keşfet", "Découvrir", "Descubrir", "Scopri ora"),
      btn2_text: v("Verkäufer werden", "Become a seller", "Satıcı ol", "Devenir vendeur", "Hazte vendedor", "Diventa venditore"),
    },
  );

  const trust = {
    id: uid("trust"),
    type: "feature_grid",
    visible: true,
    visible_on: "desktop",
    variant: "trust_bar",
    cols: 4,
    items: [
      loc({ icon: "shield" }, { title: v("Käuferschutz", "Buyer protection", "Alıcı koruması", "Protection acheteur", "Protección al comprador", "Protezione acquirenti"), body: v("Geld zurück bei Problemen", "Money back if something goes wrong", "Sorun olursa para iadesi", "Remboursé en cas de problème", "Reembolso si algo falla", "Rimborso in caso di problemi") }),
      loc({ icon: "truck" }, { title: v("Schneller Versand", "Fast shipping", "Hızlı kargo", "Livraison rapide", "Envío rápido", "Spedizione veloce"), body: v("Lieferdatum vor dem Kauf", "Delivery date before you buy", "Satın almadan önce teslim tarihi", "Date de livraison avant l’achat", "Fecha de entrega antes de comprar", "Data di consegna prima dell’acquisto") }),
      loc({ icon: "points" }, { title: v("Bonuspunkte", "Bonus points", "Bonus puan", "Points bonus", "Puntos extra", "Punti bonus"), body: v("Bei jedem Einkauf sammeln", "Collect on every purchase", "Her alışverişte kazan", "À chaque achat", "En cada compra", "A ogni acquisto") }),
      loc({ icon: "badge" }, { title: v("Verifizierte Marken", "Verified brands", "Doğrulanmış markalar", "Marques vérifiées", "Marcas verificadas", "Brand verificati"), body: v("Geprüfte Händler & Belege", "Checked sellers & documents", "Kontrol edilmiş satıcılar", "Vendeurs contrôlés", "Vendedores comprobados", "Venditori controllati") }),
    ],
  };

  const inspirationTitle = v("Inspiration der Woche", "Inspiration of the week", "Haftanın ilhamı", "L’inspiration de la semaine", "Inspiración de la semana", "Ispirazione della settimana");
  let carousel = null;
  if (storedCarousel) {
    carousel = { ...storedCarousel, id: uid("carousel"), visible_on: "both" };
    if (!String(carousel.title || "").trim()) carousel = loc(carousel, { title: inspirationTitle });
  } else if (images.length >= 3) {
    carousel = loc(
      { id: uid("carousel"), type: "image_carousel", visible: true, visible_on: "both", aspect_ratio: "4/5", items_per_row: 4, gap: 20, images },
      { title: inspirationTitle },
    );
  }

  const circles = loc(
    { id: uid("circles"), type: "category_circles", visible: true, visible_on: "both", source: "catalog", max_items: 6, link_url: "/kategorien" },
    {
      title: v("Beliebte Kategorien", "Popular categories", "Popüler kategoriler", "Catégories populaires", "Categorías populares", "Categorie popolari"),
      link_text: v("Alle Kategorien", "All categories", "Tüm kategoriler", "Toutes les catégories", "Todas las categorías", "Tutte le categorie"),
    },
  );

  const bestsellers = loc(
    { id: uid("bestsellers"), type: "bestseller_carousel", visible: true, visible_on: "both", mode: "bestseller", limit: 20, items_per_row: 5, gap: 20 },
    { title: v("Bestseller dieser Woche", "Bestsellers this week", "Haftanın çok satanları", "Meilleures ventes de la semaine", "Más vendidos de la semana", "Più venduti della settimana") },
  );

  return [bento, trust, carousel, circles, bestsellers].filter(Boolean);
}

/**
 * @param {unknown[]} containers stored homepage containers
 * @param {Record<string, unknown>} settings stored homepage settings
 * @param {string} designPreset styles.design_preset ("" = never chosen → warm design)
 */
export function resolveHomeComposition(containers, settings, designPreset = "") {
  const list = Array.isArray(containers) ? containers : [];
  const s = settings && typeof settings === "object" ? settings : {};
  if (String(designPreset || "").trim() === "classic") return { containers: list, settings: s };
  if (isWarmHomeSaved(list, s)) return { containers: list, settings: s };
  return { containers: buildWarmHomeContainers(list), settings: { ...s, homepage_layout: WARM_HOME_LAYOUT } };
}
