'use strict'

/**
 * Seeds CMS + landing containers for catalog hub pages:
 * bestsellers, sales, neuheiten, brands (Marke).
 *
 * Pattern mirrors customer-support-landing-seed.js:
 * - admin_hub_pages: title + body HTML per language (no H1 in body — page title is H1)
 * - admin_hub_landing_pages: text_block + product/feature containers × desktop/tablet/mobile
 */

const { randomUUID } = require('crypto')

const LAYOUT_VERSION = 'catalog_hub_v1'
const LANGUAGES = ['en', 'tr', 'fr', 'es', 'it']

const DEVICE_PRESETS = {
  desktop: {
    padding: '40px 24px',
    content_max_width: '1200px',
    visible_count: 5,
    items_per_row: 5,
  },
  tablet: {
    padding: '32px 20px',
    content_max_width: '960px',
    visible_count: 4,
    items_per_row: 4,
  },
  mobile: {
    padding: '24px 16px',
    content_max_width: '100%',
    visible_count: 2,
    items_per_row: 2,
  },
}

const value = (de, en, tr, fr, es, it) => ({ de, en, tr, fr, es, it })

const localize = (base, fields) => ({
  ...base,
  ...Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values.de])),
  _i18n: Object.fromEntries(LANGUAGES.map((language) => [
    language,
    Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values[language]])),
  ])),
})

/** Build title_i18n / body_i18n jsonb shape used by admin_hub_pages (DE also in root columns). */
const pageI18nMap = (field, values) => {
  const out = { de: { [field]: values.de } }
  for (const lang of LANGUAGES) out[lang] = { [field]: values[lang] }
  return out
}

const htmlP = (text) => `<p>${text}</p>`
const htmlStack = (...parts) => parts.filter(Boolean).join('\n')

const CATALOG_PAGES = [
  {
    slug: 'bestsellers',
    titles: value(
      'Bestseller',
      'Bestsellers',
      'Çok Satanlar',
      'Meilleures ventes',
      'Más vendidos',
      'Più venduti',
    ),
    bodies: value(
      htmlStack(
        htmlP('Entdecken Sie die meistverkauften Produkte auf Andertal — sortiert nach Kategorien und aktueller Nachfrage.'),
        htmlP('Hier finden Sie Favoriten unserer Kundinnen und Kunden: geprüfte Qualität, starke Bewertungen und zuverlässige Verkäufer.'),
        '<ul><li>Aktuelle Topseller je Kategorie</li><li>Regelmäßig aktualisierte Rankings</li><li>Schneller Vergleich ähnlicher Produkte</li></ul>',
      ),
      htmlStack(
        htmlP('Discover the best-selling products on Andertal — organized by category and current demand.'),
        htmlP('Browse customer favorites with proven quality, strong ratings, and reliable sellers.'),
        '<ul><li>Top sellers by category</li><li>Frequently updated rankings</li><li>Quick comparison of similar products</li></ul>',
      ),
      htmlStack(
        htmlP('Andertal’de en çok satan ürünleri keşfedin — kategorilere ve güncel talebe göre düzenlenmiş.'),
        htmlP('Kanıtlanmış kalite, güçlü puanlar ve güvenilir satıcılarla müşteri favorilerine göz atın.'),
        '<ul><li>Kategori bazında çok satanlar</li><li>Düzenli güncellenen sıralamalar</li><li>Benzer ürünleri hızlı karşılaştırma</li></ul>',
      ),
      htmlStack(
        htmlP('Découvrez les produits les plus vendus sur Andertal — organisés par catégorie et demande actuelle.'),
        htmlP('Parcourez les favoris des clients : qualité éprouvée, bonnes notes et vendeurs fiables.'),
        '<ul><li>Meilleures ventes par catégorie</li><li>Classements mis à jour régulièrement</li><li>Comparaison rapide de produits similaires</li></ul>',
      ),
      htmlStack(
        htmlP('Descubre los productos más vendidos en Andertal — organizados por categoría y demanda actual.'),
        htmlP('Explora los favoritos de los clientes con calidad probada, buenas valoraciones y vendedores fiables.'),
        '<ul><li>Más vendidos por categoría</li><li>Rankings actualizados con frecuencia</li><li>Comparación rápida de productos similares</li></ul>',
      ),
      htmlStack(
        htmlP('Scopri i prodotti più venduti su Andertal — organizzati per categoria e domanda attuale.'),
        htmlP('Sfoglia i preferiti dei clienti con qualità comprovata, ottime valutazioni e venditori affidabili.'),
        '<ul><li>Più venduti per categoria</li><li>Classifiche aggiornate di frequente</li><li>Confronto rapido di prodotti simili</li></ul>',
      ),
    ),
    algorithm: 'bestsellers',
    rowTitles: value(
      'Top-Produkte insgesamt',
      'Top products overall',
      'Genel en çok satanlar',
      'Meilleurs produits',
      'Productos top',
      'Prodotti top',
    ),
    secondaryAlgorithm: 'trending_in_your_categories',
    secondaryRowTitles: value(
      'Trend in deinen Kategorien',
      'Trending in your categories',
      'Kategorilerinde trend',
      'Tendances dans vos catégories',
      'Tendencias en tus categorías',
      'Tendenze nelle tue categorie',
    ),
  },
  {
    slug: 'sales',
    titles: value(
      'Sale',
      'Sale',
      'İndirimler',
      'Soldes',
      'Rebajas',
      'Saldi',
    ),
    bodies: value(
      htmlStack(
        htmlP('Aktuelle Angebote und reduzierte Preise — sparen Sie bei ausgewählten Produkten auf Andertal.'),
        htmlP('Alle Sale-Artikel werden regelmäßig aktualisiert. Prüfen Sie Preis, Versand und Verkäuferbewertung vor dem Kauf.'),
        '<ul><li>Reduzierte Preise mit klarer UVP-Kennzeichnung</li><li>Begrenzte Aktionen und Restbestände</li><li>Schnelle Filterung nach Kategorie</li></ul>',
      ),
      htmlStack(
        htmlP('Current deals and reduced prices — save on selected products at Andertal.'),
        htmlP('Sale items are updated regularly. Check price, shipping and seller ratings before you buy.'),
        '<ul><li>Clear discounts vs list price</li><li>Limited offers and remaining stock</li><li>Quick filtering by category</li></ul>',
      ),
      htmlStack(
        htmlP('Güncel fırsatlar ve indirimli fiyatlar — Andertal’de seçili ürünlerde tasarruf edin.'),
        htmlP('İndirimli ürünler düzenli güncellenir. Satın almadan önce fiyat, kargo ve satıcı puanını kontrol edin.'),
        '<ul><li>Liste fiyatına göre net indirimler</li><li>Sınırlı kampanyalar ve kalan stok</li><li>Kategoriye göre hızlı filtreleme</li></ul>',
      ),
      htmlStack(
        htmlP('Offres actuelles et prix réduits — économisez sur des produits sélectionnés chez Andertal.'),
        htmlP('Les articles en solde sont mis à jour régulièrement. Vérifiez prix, livraison et notes vendeur.'),
        '<ul><li>Remises claires vs prix barré</li><li>Offres limitées et stocks restants</li><li>Filtrage rapide par catégorie</li></ul>',
      ),
      htmlStack(
        htmlP('Ofertas actuales y precios reducidos — ahorra en productos seleccionados en Andertal.'),
        htmlP('Los artículos en rebaja se actualizan con frecuencia. Revisa precio, envío y valoraciones del vendedor.'),
        '<ul><li>Descuentos claros frente al precio de lista</li><li>Ofertas limitadas y stock restante</li><li>Filtrado rápido por categoría</li></ul>',
      ),
      htmlStack(
        htmlP('Offerte attuali e prezzi ridotti — risparmia su prodotti selezionati su Andertal.'),
        htmlP('Gli articoli in saldo vengono aggiornati di frequente. Controlla prezzo, spedizione e valutazioni del venditore.'),
        '<ul><li>Sconti chiari rispetto al prezzo di listino</li><li>Offerte limitate e scorte residue</li><li>Filtro rapido per categoria</li></ul>',
      ),
    ),
    algorithm: 'on_sale',
    rowTitles: value(
      'Aktuelle Angebote',
      'Current deals',
      'Güncel fırsatlar',
      'Offres actuelles',
      'Ofertas actuales',
      'Offerte attuali',
    ),
    secondaryAlgorithm: 'bestsellers',
    secondaryRowTitles: value(
      'Beliebt und im Angebot',
      'Popular and on sale',
      'Popüler ve indirimde',
      'Populaires et en promo',
      'Populares y en oferta',
      'Popolari e in offerta',
    ),
  },
  {
    slug: 'new-in',
    titles: value(
      'Neuheiten',
      'New arrivals',
      'Yenilikler',
      'Nouveautés',
      'Novedades',
      'Novità',
    ),
    bodies: value(
      htmlStack(
        htmlP('Frisch eingetroffen: neue Produkte und Sortimente auf Andertal.'),
        htmlP('Entdecken Sie Neuheiten nach Kategorie — ideal, um Trends früh zu finden und erste Bewertungen zu prüfen.'),
        '<ul><li>Neu gelistete Artikel</li><li>Frisch aktualisierte Kategorien</li><li>Früh entdecken, was gerade kommt</li></ul>',
      ),
      htmlStack(
        htmlP('Just arrived: new products and assortments on Andertal.'),
        htmlP('Explore new arrivals by category — ideal for spotting trends early and checking first reviews.'),
        '<ul><li>Newly listed items</li><li>Freshly updated categories</li><li>Discover what’s coming next</li></ul>',
      ),
      htmlStack(
        htmlP('Yeni geldi: Andertal’de yeni ürünler ve koleksiyonlar.'),
        htmlP('Yenilikleri kategoriye göre keşfedin — trendleri erken yakalamak ve ilk yorumları görmek için ideal.'),
        '<ul><li>Yeni listelenen ürünler</li><li>Taze güncellenen kategoriler</li><li>Sıradaki ürünleri erken keşfedin</li></ul>',
      ),
      htmlStack(
        htmlP('Tout juste arrivé : nouveaux produits et assortiments sur Andertal.'),
        htmlP('Explorez les nouveautés par catégorie — idéal pour repérer les tendances tôt.'),
        '<ul><li>Articles récemment listés</li><li>Catégories fraîchement mises à jour</li><li>Découvrez ce qui arrive</li></ul>',
      ),
      htmlStack(
        htmlP('Recién llegados: nuevos productos y surtidos en Andertal.'),
        htmlP('Explora novedades por categoría — ideal para detectar tendencias pronto.'),
        '<ul><li>Artículos recién listados</li><li>Categorías actualizadas</li><li>Descubre lo que viene</li></ul>',
      ),
      htmlStack(
        htmlP('Appena arrivati: nuovi prodotti e assortimenti su Andertal.'),
        htmlP('Esplora le novità per categoria — ideale per intercettare i trend in anticipo.'),
        '<ul><li>Articoli appena elencati</li><li>Categorie aggiornate di recente</li><li>Scopri cosa sta arrivando</li></ul>',
      ),
    ),
    algorithm: 'new_arrivals',
    rowTitles: value(
      'Frisch eingetroffen',
      'Just arrived',
      'Yeni gelenler',
      'Tout juste arrivé',
      'Recién llegados',
      'Appena arrivati',
    ),
    secondaryAlgorithm: 'new_in_viewed_categories',
    secondaryRowTitles: value(
      'Neu in deinen Kategorien',
      'New in your categories',
      'Kategorilerinde yeni',
      'Nouveautés dans vos catégories',
      'Novedades en tus categorías',
      'Novità nelle tue categorie',
    ),
  },
  {
    slug: 'brands',
    titles: value(
      'Marken',
      'Brands',
      'Markalar',
      'Marques',
      'Marcas',
      'Marchi',
    ),
    bodies: value(
      htmlStack(
        htmlP('Alle Marken auf Andertal — von etablierten Labels bis zu starken Eigenmarken unserer Verkäufer.'),
        htmlP('Nutzen Sie Suche und A–Z-Navigation, um schnell die passende Marke zu finden und deren Sortiment zu entdecken.'),
        '<ul><li>Alphabetische Markenübersicht</li><li>Direkte Links zu Markenseiten</li><li>Vertrauenswürdige Seller und Produkte</li></ul>',
      ),
      htmlStack(
        htmlP('All brands on Andertal — from established labels to strong seller house brands.'),
        htmlP('Use search and A–Z navigation to find the right brand and explore its assortment.'),
        '<ul><li>Alphabetical brand directory</li><li>Direct links to brand pages</li><li>Trusted sellers and products</li></ul>',
      ),
      htmlStack(
        htmlP('Andertal’deki tüm markalar — köklü markalardan satıcıların güçlü özel markalarına.'),
        htmlP('Doğru markayı bulmak için arama ve A–Z navigasyonunu kullanın.'),
        '<ul><li>Alfabetik marka dizini</li><li>Marka sayfalarına doğrudan bağlantı</li><li>Güvenilir satıcılar ve ürünler</li></ul>',
      ),
      htmlStack(
        htmlP('Toutes les marques sur Andertal — des labels établis aux marques propres des vendeurs.'),
        htmlP('Utilisez la recherche et la navigation A–Z pour trouver la bonne marque.'),
        '<ul><li>Annuaire alphabétique</li><li>Liens directs vers les pages marque</li><li>Vendeurs et produits de confiance</li></ul>',
      ),
      htmlStack(
        htmlP('Todas las marcas en Andertal — desde firmas consolidadas hasta marcas propias de vendedores.'),
        htmlP('Usa la búsqueda y la navegación A–Z para encontrar la marca adecuada.'),
        '<ul><li>Directorio alfabético</li><li>Enlaces directos a páginas de marca</li><li>Vendedores y productos de confianza</li></ul>',
      ),
      htmlStack(
        htmlP('Tutti i marchi su Andertal — da brand affermati a marche proprie dei venditori.'),
        htmlP('Usa ricerca e navigazione A–Z per trovare il marchio giusto.'),
        '<ul><li>Elenco alfabetico dei brand</li><li>Link diretti alle pagine marca</li><li>Venditori e prodotti affidabili</li></ul>',
      ),
    ),
    // Brands hub uses feature_grid + seller_carousel instead of product algorithms
    algorithm: null,
    featureCards: [
      {
        icon: '🔍',
        titles: value('Schnell finden', 'Find fast', 'Hızlı bul', 'Trouver vite', 'Encontrar rápido', 'Trova subito'),
        bodies: value(
          'Suche und A–Z-Filter helfen dir, Marken in Sekunden zu finden.',
          'Search and A–Z filters help you find brands in seconds.',
          'Arama ve A–Z filtreleri markaları saniyeler içinde bulmanı sağlar.',
          'Recherche et filtres A–Z pour trouver une marque en quelques secondes.',
          'Búsqueda y filtros A–Z para encontrar marcas en segundos.',
          'Ricerca e filtri A–Z per trovare i brand in pochi secondi.',
        ),
      },
      {
        icon: '🛡️',
        titles: value('Vertrauenswürdig', 'Trusted', 'Güvenilir', 'Fiable', 'De confianza', 'Affidabile'),
        bodies: value(
          'Markenseiten bündeln geprüfte Produkte und Seller an einem Ort.',
          'Brand pages gather vetted products and sellers in one place.',
          'Marka sayfaları onaylı ürün ve satıcıları tek yerde toplar.',
          'Les pages marque regroupent produits et vendeurs vérifiés.',
          'Las páginas de marca reúnen productos y vendedores verificados.',
          'Le pagine marca raccolgono prodotti e venditori verificati.',
        ),
      },
      {
        icon: '✨',
        titles: value('Vielfalt entdecken', 'Discover variety', 'Çeşitliliği keşfet', 'Découvrir la variété', 'Descubrir variedad', 'Scopri la varietà'),
        bodies: value(
          'Von bekannten Labels bis zu starken Shop-Marken — alles zentral.',
          'From known labels to strong shop brands — all in one hub.',
          'Bilinen markalardan güçlü mağaza markalarına — hepsi bir arada.',
          'Des labels connus aux marques boutique — tout au même endroit.',
          'De firmas conocidas a marcas de tienda — todo en un hub.',
          'Da brand noti a marche shop — tutto in un unico hub.',
        ),
      },
    ],
  },
]

const CATALOG_STACK_TYPES = new Set([
  'text_block',
  'personalized_product_row',
  'feature_grid',
  'seller_carousel',
  'newsletter',
  'banner_cta',
])

const buildIntroTextBlock = (pageDef, visibleOn, preset) => localize({
  id: randomUUID(),
  type: 'text_block',
  visible: true,
  visible_on: visibleOn,
  align: 'left',
  bg_color: '#ffffff',
  text_color: '#111827',
  padding: preset.padding,
  content_layout: 'contained',
  content_max_width: preset.content_max_width,
}, {
  // No title here — page H1 is the page name from CMS
  title: value('', '', '', '', '', ''),
  body: pageDef.bodies,
})

const buildProductRow = (algorithm, titles, visibleOn, preset) => localize({
  id: randomUUID(),
  type: 'personalized_product_row',
  visible: true,
  visible_on: visibleOn,
  algorithm,
  visible_count: preset.visible_count,
  gap: 12,
  padding: preset.padding,
  content_layout: 'contained',
  content_max_width: preset.content_max_width,
}, {
  title: titles,
})

const buildFeatureGrid = (pageDef, visibleOn, preset) => {
  const cards = (pageDef.featureCards || []).map((card, index) => localize({
    id: `feat_${index}`,
    icon: card.icon,
    order: index,
  }, {
    title: card.titles,
    body: card.bodies,
  }))
  return localize({
    id: randomUUID(),
    type: 'feature_grid',
    visible: true,
    visible_on: visibleOn,
    cols: visibleOn === 'mobile' ? 1 : 3,
    gap: 16,
    padding: preset.padding,
    content_layout: 'contained',
    content_max_width: preset.content_max_width,
    card_style: 'bordered',
    items: cards,
  }, {
    title: value(
      'So findest du deine Marke',
      'How to find your brand',
      'Markanı nasıl bulursun',
      'Comment trouver ta marque',
      'Cómo encontrar tu marca',
      'Come trovare il tuo brand',
    ),
  })
}

const buildSellerCarousel = (visibleOn, preset) => localize({
  id: randomUUID(),
  type: 'seller_carousel',
  visible: true,
  visible_on: visibleOn,
  limit: 20,
  items_per_row: preset.items_per_row,
  items_per_row_mobile: 2,
  gap: 16,
  padding: preset.padding,
  content_layout: 'contained',
  content_max_width: preset.content_max_width,
}, {
  title: value(
    'Starke Verkäufer & Markenpartner',
    'Strong sellers & brand partners',
    'Güçlü satıcılar ve marka ortakları',
    'Vendeurs et partenaires marques',
    'Vendedores y socios de marca',
    'Venditori e partner di marca',
  ),
})

const buildNewsletter = (visibleOn, preset) => localize({
  id: randomUUID(),
  type: 'newsletter',
  visible: true,
  visible_on: visibleOn,
  padding: preset.padding,
  content_layout: 'contained',
  content_max_width: preset.content_max_width,
  bg_color: '#f8fafc',
}, {
  title: value(
    'Angebote & Neuheiten per E-Mail',
    'Deals & new arrivals by email',
    'Fırsatlar ve yenilikler e-posta ile',
    'Offres et nouveautés par e-mail',
    'Ofertas y novedades por email',
    'Offerte e novità via e-mail',
  ),
  subtitle: value(
    'Erhalte Updates zu Bestseller, Sale und neuen Marken.',
    'Get updates on bestsellers, sales and new brands.',
    'Çok satanlar, indirimler ve yeni markalar için güncelleme al.',
    'Recevez les actus bestsellers, soldes et nouvelles marques.',
    'Recibe novedades de bestsellers, rebajas y nuevas marcas.',
    'Ricevi aggiornamenti su bestseller, saldi e nuovi brand.',
  ),
  button_text: value('Abonnieren', 'Subscribe', 'Abone ol', "S'abonner", 'Suscribirse', 'Iscriviti'),
})

const buildDeviceContainers = (pageDef, visibleOn) => {
  const preset = DEVICE_PRESETS[visibleOn] || DEVICE_PRESETS.desktop
  const list = [buildIntroTextBlock(pageDef, visibleOn, preset)]
  if (pageDef.slug === 'brands') {
    list.push(buildFeatureGrid(pageDef, visibleOn, preset))
    list.push(buildSellerCarousel(visibleOn, preset))
  } else {
    list.push(buildProductRow(pageDef.algorithm, pageDef.rowTitles, visibleOn, preset))
    if (pageDef.secondaryAlgorithm) {
      list.push(buildProductRow(pageDef.secondaryAlgorithm, pageDef.secondaryRowTitles, visibleOn, preset))
    }
  }
  list.push(buildNewsletter(visibleOn, preset))
  return list
}

const buildPageContainers = (pageDef) => [
  ...buildDeviceContainers(pageDef, 'desktop'),
  ...buildDeviceContainers(pageDef, 'tablet'),
  ...buildDeviceContainers(pageDef, 'mobile'),
]

async function upsertCatalogPage(client, pageDef, opts = {}) {
  const dryRun = !!opts.dryRun
  const force = !!opts.force
  const slug = pageDef.slug
  const titleDe = pageDef.titles.de
  const bodyDe = pageDef.bodies.de
  const titleI18n = pageI18nMap('title', pageDef.titles)
  const bodyI18n = pageI18nMap('body', pageDef.bodies)

  const columns = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'admin_hub_pages'
       AND column_name IN ('slug', 'handle', 'title_i18n', 'body_i18n')`,
  )
  const pageColumns = new Set(columns.rows.map((row) => row.column_name))
  if (!pageColumns.has('slug')) throw new Error('admin_hub_pages.slug is required')

  const predicates = [`regexp_replace(slug, '^/+', '') = $1`]
  if (pageColumns.has('handle')) predicates.push(`regexp_replace(handle, '^/+', '') = $1`)
  let pageResult = await client.query(
    `SELECT id, slug FROM admin_hub_pages WHERE ${predicates.join(' OR ')} ORDER BY updated_at DESC LIMIT 1`,
    [slug],
  )

  let createdPage = false
  if (!pageResult.rows[0]) {
    createdPage = true
    if (dryRun) return { slug, created: false, wouldCreate: true, added: 0 }
    if (pageColumns.has('title_i18n') && pageColumns.has('body_i18n')) {
      pageResult = await client.query(
        `INSERT INTO admin_hub_pages (title, slug, body, status, page_type, title_i18n, body_i18n)
         VALUES ($1, $2, $3, 'published', 'page', $4::jsonb, $5::jsonb)
         RETURNING id, slug`,
        [titleDe, slug, bodyDe, JSON.stringify(titleI18n), JSON.stringify(bodyI18n)],
      )
    } else {
      pageResult = await client.query(
        `INSERT INTO admin_hub_pages (title, slug, body, status, page_type)
         VALUES ($1, $2, $3, 'published', 'page') RETURNING id, slug`,
        [titleDe, slug, bodyDe],
      )
    }
  }

  const pageIdEarly = pageResult.rows[0] ? String(pageResult.rows[0].id) : null
  const landingPeek = pageIdEarly && !dryRun
    ? await client.query('SELECT settings FROM admin_hub_landing_pages WHERE page_id = $1', [pageIdEarly])
    : { rows: [] }
  const layoutPeek = landingPeek.rows[0]?.settings?.catalog_landing_layout || ''
  const willMigrate = force || createdPage || !landingPeek.rows[0] || layoutPeek !== LAYOUT_VERSION

  if (!dryRun && pageResult.rows[0] && (force || opts.refreshContent || willMigrate)) {
    const pageId = pageResult.rows[0].id
    if (pageColumns.has('title_i18n') && pageColumns.has('body_i18n')) {
      await client.query(
        `UPDATE admin_hub_pages
            SET title = $1, body = $2, title_i18n = $3::jsonb, body_i18n = $4::jsonb,
                status = 'published', updated_at = now()
          WHERE id = $5`,
        [titleDe, bodyDe, JSON.stringify(titleI18n), JSON.stringify(bodyI18n), pageId],
      )
    } else {
      await client.query(
        `UPDATE admin_hub_pages SET title = $1, body = $2, status = 'published', updated_at = now() WHERE id = $3`,
        [titleDe, bodyDe, pageId],
      )
    }
  }

  const pageId = String(pageResult.rows[0].id)
  const landingResult = await client.query(
    'SELECT containers, settings FROM admin_hub_landing_pages WHERE page_id = $1 FOR UPDATE',
    [pageId],
  )
  const existing = Array.isArray(landingResult.rows[0]?.containers) ? landingResult.rows[0].containers : []
  const settings = (landingResult.rows[0]?.settings && typeof landingResult.rows[0].settings === 'object')
    ? { ...landingResult.rows[0].settings }
    : {}
  const currentLayout = settings.catalog_landing_layout || ''
  const needsMigrate = force || createdPage || !landingResult.rows[0] || currentLayout !== LAYOUT_VERSION

  if (dryRun) {
    return {
      slug,
      created: false,
      wouldCreate: createdPage,
      wouldMigrate: needsMigrate,
      currentLayout,
      targetLayout: LAYOUT_VERSION,
      added: needsMigrate ? buildPageContainers(pageDef).length : 0,
    }
  }

  if (!needsMigrate) {
    return { slug, created: false, migrated: false, added: existing.length, layout: currentLayout, pageId }
  }

  const custom = existing.filter((c) => c && !CATALOG_STACK_TYPES.has(c.type))
  const nextContainers = [...buildPageContainers(pageDef), ...custom]
  settings.catalog_landing_layout = LAYOUT_VERSION

  if (!landingResult.rows[0]) {
    await client.query(
      `INSERT INTO admin_hub_landing_pages (page_id, containers, settings)
       VALUES ($1, $2::jsonb, $3::jsonb)`,
      [pageId, JSON.stringify(nextContainers), JSON.stringify(settings)],
    )
  } else {
    await client.query(
      `UPDATE admin_hub_landing_pages
          SET containers = $1::jsonb, settings = $2::jsonb, updated_at = now()
        WHERE page_id = $3`,
      [JSON.stringify(nextContainers), JSON.stringify(settings), pageId],
    )
  }

  return {
    slug,
    created: createdPage,
    migrated: true,
    added: nextContainers.length,
    layout: LAYOUT_VERSION,
    pageId,
  }
}

/**
 * Ensure all catalog hub pages + landings exist.
 * @returns {{ pages: object[], created: number, migrated: number }}
 */
async function ensureCatalogLandingPages(client, opts = {}) {
  const dryRun = !!opts.dryRun
  if (!dryRun) await client.query('BEGIN')
  try {
    const pages = []
    for (const pageDef of CATALOG_PAGES) {
      // eslint-disable-next-line no-await-in-loop
      pages.push(await upsertCatalogPage(client, pageDef, opts))
    }
    if (!dryRun) await client.query('COMMIT')
    return {
      pages,
      created: pages.filter((p) => p.created || p.wouldCreate).length,
      migrated: pages.filter((p) => p.migrated || p.wouldMigrate).length,
      layout: LAYOUT_VERSION,
    }
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

module.exports = {
  LAYOUT_VERSION,
  CATALOG_PAGES,
  DEVICE_PRESETS,
  buildPageContainers,
  ensureCatalogLandingPages,
  upsertCatalogPage,
}
