'use strict'

/**
 * Seeds admin_hub_landing_page (id = 1) only when containers are empty.
 * Never overwrites an existing homepage composition.
 */

const { randomUUID } = require('crypto')

const LAYOUT_VERSION = 'andertal_home_v1'
const LANGUAGES = ['en', 'tr', 'fr', 'es', 'it']

const value = (de, en, tr, fr, es, it) => ({ de, en, tr, fr, es, it })
const localize = (base, fields) => ({
  ...base,
  ...Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values.de])),
  _i18n: Object.fromEntries(LANGUAGES.map((language) => [
    language,
    Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values[language]])),
  ])),
})

function homepageContainers() {
  const catalogPad = '56px 24px'
  const compactPad = '40px 24px'

  return [
    localize({
      id: randomUUID(),
      type: 'hero_banner',
      visible: true,
      visible_on: 'both',
      padding: '0px',
      content_layout: 'full',
      height: '380px',
      mobile_height: '280px',
      autoplay: false,
      slides: [
        localize({
          overlay: 20,
          text_color: '#f7f4ee',
          text_position: 'center-left',
          btn_url: '/bestsellers',
          btn_bg: '#FF971C',
          btn_color: '#1A1A1A',
          btn_border: 'none',
          btn_radius: 8,
          btn_variant: 'flat',
          content_padding: '48px 56px',
        }, {
          title: value(
            'Europas Marktplatz für unabhängige Händler.',
            'Europe’s marketplace for independent sellers.',
            'Bağımsız satıcılar için Avrupa pazaryeri.',
            'Le marketplace européen des vendeurs indépendants.',
            'El marketplace europeo para vendedores independientes.',
            'Il marketplace europeo per seller indipendenti.',
          ),
          subtitle: value(
            'Entdecke geprüfte Marken, faire Preise und Lieferung in die EU.',
            'Discover verified brands, fair prices, and EU delivery.',
            'Doğrulanmış markalar, adil fiyatlar ve AB teslimatı.',
            'Marques vérifiées, prix justes, livraison UE.',
            'Marcas verificadas, precios justos y envío a la UE.',
            'Brand verificati, prezzi corretti, consegna UE.',
          ),
          btn_text: value('Bestseller entdecken', 'Shop bestsellers', 'Çok satanları keşfet', 'Voir les best-sellers', 'Ver más vendidos', 'Scopri i bestseller'),
        }),
      ],
    }, {}),

    localize({
      id: randomUUID(),
      type: 'collections_carousel',
      visible: true,
      visible_on: 'both',
      padding: catalogPad,
      content_layout: 'full',
      content_max_width: '1440px',
      source: 'categories',
      limit: 8,
      items_per_row: 4,
      items_per_row_mobile: 2,
      gap: 16,
      card_aspect_ratio: '4/5',
      card_image_object_fit: 'cover',
      collections: [],
    }, {
      title: value('Kategorien entdecken', 'Shop by category', 'Kategorilere göz at', 'Explorer les catégories', 'Explorar categorías', 'Esplora le categorie'),
    }),

    localize({
      id: randomUUID(),
      type: 'bestseller_carousel',
      visible: true,
      visible_on: 'both',
      padding: catalogPad,
      content_layout: 'full',
      content_max_width: '1440px',
      mode: 'bestseller',
      category_slug: '',
      limit: 8,
      items_per_row: 5,
      items_per_row_mobile: 2,
      gap: 12,
    }, {
      title: value('Bestseller', 'Bestsellers', 'Çok satanlar', 'Meilleures ventes', 'Más vendidos', 'Bestseller'),
    }),

    localize({
      id: randomUUID(),
      type: 'banner_cta',
      visible: true,
      visible_on: 'both',
      padding: '28px 24px',
      content_layout: 'full',
      bg_color: '#1A1A1A',
      text_color: '#ffffff',
      text_position: 'center',
      btn_url: '/sales',
      btn_bg: '#FF971C',
      btn_color: '#1A1A1A',
      btn_border: 'none',
      btn_radius: 8,
    }, {
      title: value('Aktuelle Angebote', 'Deals on now', 'Güncel fırsatlar', 'Offres en cours', 'Ofertas ahora', 'Offerte attive'),
      subtitle: value('Reduzierte Produkte aus dem Live-Katalog.', 'Discounted products from the live catalog.', 'Canlı katalogdan indirimli ürünler.', 'Produits en promo du catalogue live.', 'Productos rebajados del catálogo.', 'Prodotti scontati dal catalogo live.'),
      btn_text: value('Zu den Angeboten', 'See deals', 'Fırsatlara git', 'Voir les offres', 'Ver ofertas', 'Vedi le offerte'),
    }),

    localize({
      id: randomUUID(),
      type: 'bestseller_carousel',
      visible: true,
      visible_on: 'both',
      padding: catalogPad,
      content_layout: 'full',
      content_max_width: '1440px',
      mode: 'sale',
      category_slug: '',
      limit: 8,
      items_per_row: 5,
      items_per_row_mobile: 2,
      gap: 12,
    }, {
      title: value('Angebote', 'Deals', 'Fırsatlar', 'Promotions', 'Ofertas', 'Offerte'),
    }),

    localize({
      id: randomUUID(),
      type: 'brands_directory',
      visible: true,
      visible_on: 'both',
      padding: catalogPad,
      content_layout: 'full',
      content_max_width: '1440px',
      items_per_row: 6,
      items_per_row_mobile: 3,
      max_rows: 2,
      gap: 14,
    }, {
      title: value('Marken', 'Brands', 'Markalar', 'Marques', 'Marcas', 'Brand'),
    }),

    localize({
      id: randomUUID(),
      type: 'bestseller_carousel',
      visible: true,
      visible_on: 'both',
      padding: catalogPad,
      content_layout: 'full',
      content_max_width: '1440px',
      mode: 'newest',
      category_slug: '',
      limit: 8,
      items_per_row: 5,
      items_per_row_mobile: 2,
      gap: 12,
    }, {
      title: value('Neuheiten', 'New arrivals', 'Yenilikler', 'Nouveautés', 'Novedades', 'Novità'),
    }),

    localize({
      id: randomUUID(),
      type: 'image_text',
      visible: true,
      visible_on: 'both',
      padding: '64px 24px',
      content_layout: 'full',
      content_max_width: '1100px',
      bg_color: '#FAFAFA',
      text_color: '#1A1A1A',
      image_side: 'left',
      btn_url: '/verkaeufer-werden',
      btn_bg: '#1B8880',
      btn_color: '#ffffff',
      btn_border: 'none',
      btn_radius: 8,
    }, {
      title: value('Verkaufe auf Andertal', 'Sell on Andertal', 'Andertal’de sat', 'Vendez sur Andertal', 'Vende en Andertal', 'Vendi su Andertal'),
      body: value(
        '<p>Unabhängig verkaufen, in der EU sichtbar sein — mit einem Sellercentral, das Bestellungen, Versand und Auszahlung zusammenhält.</p>',
        '<p>Sell independently and be visible across the EU — with a Sellercentral that keeps orders, shipping, and payouts in one place.</p>',
        '<p>Bağımsız sat, AB’de görünür ol — sipariş, kargo ve ödemeyi bir arada tutan Sellercentral ile.</p>',
        '<p>Vendez en indépendant et soyez visible en UE — un Sellercentral pour commandes, expédition et paiements.</p>',
        '<p>Vende de forma independiente y sé visible en la UE — Sellercentral junta pedidos, envíos y pagos.</p>',
        '<p>Vendi in autonomia e sii visibile in UE — Sellercentral unisce ordini, spedizioni e pagamenti.</p>',
      ),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
    }),

    localize({
      id: randomUUID(),
      type: 'feature_grid',
      visible: true,
      visible_on: 'both',
      padding: compactPad,
      content_layout: 'full',
      content_max_width: '1440px',
      variant: 'stats_strip',
      card_style: 'flat',
      cols: 4,
      bg_color: '#ffffff',
      card_bg: 'transparent',
      text_color: '#1A1A1A',
      items: [
        localize({}, {
          title: value('EU-Versand', 'EU shipping', 'AB teslimatı', 'Livraison UE', 'Envío UE', 'Spedizione UE'),
          body: value('Lieferung in europäische Märkte', 'Delivery across European markets', 'Avrupa pazarlarına teslimat', 'Livraison vers les marchés européens', 'Entrega en mercados europeos', 'Consegna sui mercati europei'),
        }),
        localize({}, {
          title: value('14 Tage Rückgabe', '14-day returns', '14 gün iade', 'Retours 14 jours', '14 días de devolución', 'Resi 14 giorni'),
          body: value('Klare Rückgabelogik nach Lieferung', 'Clear returns after delivery', 'Teslimat sonrası net iade', 'Retours clairs après livraison', 'Devoluciones claras tras la entrega', 'Resi chiari dopo la consegna'),
        }),
        localize({}, {
          title: value('Verifizierte Händler', 'Verified sellers', 'Doğrulanmış satıcılar', 'Vendeurs vérifiés', 'Vendedores verificados', 'Seller verificati'),
          body: value('Geprüfte Shops im Marketplace', 'Reviewed shops on the marketplace', 'Marketplace’te incelenmiş mağazalar', 'Boutiques contrôlées sur le marketplace', 'Tiendas revisadas en el marketplace', 'Shop verificati nel marketplace'),
        }),
        localize({}, {
          title: value('Sichere Zahlung', 'Secure payment', 'Güvenli ödeme', 'Paiement sécurisé', 'Pago seguro', 'Pagamento sicuro'),
          body: value('Zahlung über die Andertal-Plattform', 'Pay through the Andertal platform', 'Andertal platformu üzerinden ödeme', 'Paiement via la plateforme Andertal', 'Pago a través de la plataforma Andertal', 'Pagamento tramite la piattaforma Andertal'),
        }),
      ],
    }, {}),

    localize({
      id: randomUUID(),
      type: 'newsletter',
      visible: true,
      visible_on: 'both',
      padding: '48px 24px',
      content_layout: 'full',
      bg_color: '#f3f4f6',
      text_color: '#1A1A1A',
      btn_bg: '#1B8880',
      btn_color: '#ffffff',
    }, {
      title: value('Angebote & Neuheiten', 'Deals & new arrivals', 'Fırsatlar ve yenilikler', 'Offres et nouveautés', 'Ofertas y novedades', 'Offerte e novità'),
      subtitle: value('Einmal anmelden — keine Produktlisten im Newsletter-Block.', 'Sign up once — no fake product lists in this block.', 'Bir kez kaydol — bu blokta sahte ürün listesi yok.', 'Inscrivez-vous — pas de fausse liste produits.', 'Regístrate — sin listas de productos falsas.', 'Iscriviti — nessuna lista prodotti finta.'),
    }),
  ]
}

/**
 * Writes the Andertal homepage composition to draft_* only.
 * Never overwrites published containers. Skips if a draft already exists
 * or the published page already uses this layout.
 */
async function seedHomepageDraftIfAbsent(client) {
  const row = await client.query(
    'SELECT containers, settings, draft_containers FROM admin_hub_landing_page WHERE id = 1'
  )
  if (!row.rows[0]) {
    return ensureHomepageLanding(client)
  }
  const published = Array.isArray(row.rows[0].containers) ? row.rows[0].containers : []
  if (published.length === 0) {
    return ensureHomepageLanding(client)
  }
  if (row.rows[0].draft_containers != null) {
    return { drafted: false, skipped: true, reason: 'draft_exists', added: published.length }
  }
  const settings =
    row.rows[0].settings && typeof row.rows[0].settings === 'object'
      ? { ...row.rows[0].settings }
      : {}
  if (settings.homepage_layout === LAYOUT_VERSION || settings.homepage_composition_offered === true) {
    return { drafted: false, skipped: true, reason: 'already_offered', added: published.length }
  }
  const containers = homepageContainers()
  const draftSettings = { ...settings, homepage_layout: LAYOUT_VERSION }
  const publishedSettings = { ...settings, homepage_composition_offered: true }
  await client.query(
    `UPDATE admin_hub_landing_page
        SET draft_containers = $1::jsonb,
            draft_settings = $2::jsonb,
            settings = $3::jsonb,
            updated_at = NOW()
      WHERE id = 1`,
    [JSON.stringify(containers), JSON.stringify(draftSettings), JSON.stringify(publishedSettings)]
  )
  return { drafted: true, skipped: false, added: containers.length }
}

async function ensureHomepageLanding(client, { force = false } = {}) {
  const row = await client.query(
    'SELECT containers, settings FROM admin_hub_landing_page WHERE id = 1'
  )
  const existing = Array.isArray(row.rows[0]?.containers) ? row.rows[0].containers : []
  const settings =
    row.rows[0]?.settings && typeof row.rows[0].settings === 'object'
      ? { ...row.rows[0].settings }
      : {}

  if (!force && existing.length > 0) {
    return { seeded: false, skipped: true, added: existing.length }
  }

  const containers = homepageContainers()
  const nextSettings = { ...settings, homepage_layout: LAYOUT_VERSION }

  if (row.rows[0]) {
    await client.query(
      `UPDATE admin_hub_landing_page
          SET containers = $1::jsonb, settings = $2::jsonb, updated_at = NOW()
        WHERE id = 1`,
      [JSON.stringify(containers), JSON.stringify(nextSettings)]
    )
  } else {
    await client.query(
      `INSERT INTO admin_hub_landing_page (id, containers, settings, updated_at)
       VALUES (1, $1::jsonb, $2::jsonb, NOW())`,
      [JSON.stringify(containers), JSON.stringify(nextSettings)]
    )
  }

  return { seeded: true, skipped: false, added: containers.length }
}

module.exports = {
  LAYOUT_VERSION,
  homepageContainers,
  ensureHomepageLanding,
  seedHomepageDraftIfAbsent,
}
