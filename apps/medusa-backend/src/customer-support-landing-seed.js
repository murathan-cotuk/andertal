'use strict'

// Ensures the `customer-support` CMS landing page exists with the Amazon-style
// support hub layout (order picker → help cards → help library → case wizard).
//
// Layout version `amazon_v1` is stored in landing settings. On first boot after
// upgrade (or with force), desktop containers are rebuilt; tablet/mobile keep
// their previous variants until Adım 5. Always strips “YAPTIM OLDU” test blocks.
// Idempotent for the same layout version — safe on every server boot.

const { randomUUID } = require('crypto')

const LAYOUT_VERSION = 'amazon_v2'
const LANGUAGES = ['en', 'tr', 'fr', 'es', 'it']

/** Per-device spacing / grid. Same content order; columns + padding differ. */
const DEVICE_PRESETS = {
  desktop: {
    padding: '48px 24px',
    content_max_width: '1200px',
    orders_limit: 6,
    orderCols: { desktop: 3, tablet: 2, mobile: 1 },
    helpCols: { desktop: 2, tablet: 2, mobile: 1 },
  },
  tablet: {
    padding: '40px 20px',
    content_max_width: '960px',
    orders_limit: 4,
    orderCols: { desktop: 3, tablet: 2, mobile: 1 },
    helpCols: { desktop: 2, tablet: 2, mobile: 1 },
  },
  mobile: {
    padding: '28px 16px',
    content_max_width: '100%',
    orders_limit: 3,
    orderCols: { desktop: 3, tablet: 2, mobile: 1 },
    helpCols: { desktop: 2, tablet: 1, mobile: 1 },
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
const issue = (label, order) => localize({ order }, { label })
const category = (key, runtimeCategory, order, orderRelated, platform, label, subtopics) => localize({
  key, runtime_category: runtimeCategory, order, order_related: orderRelated, platform,
  subtopics: subtopics.map((entry, index) => issue(entry, index)),
}, { label })
const helpCard = (id, icon, order, title, description, url) => localize(
  { id, icon, order, url },
  { title, description },
)
const helpTopic = (id, order, title, url) => localize({ id, order, url }, { title })
const helpArticle = (id, order, title, excerpt, url) => localize({ id, order, url }, { title, excerpt })

const AMAZON_STACK_TYPES = new Set([
  'support_hero',
  'support_topic_grid',
  'support_faq',
  'support_order_picker',
  'support_help_cards',
  'support_help_library',
  'support_case_wizard',
  'layout_section',
])

const isYaptimOlduBlock = (container) => {
  if (!container || container.type !== 'text_block') return false
  const blob = `${container.title || ''} ${container.body || ''} ${JSON.stringify(container._i18n || {})}`
  return /YAPTIM\s*OLDU/i.test(blob)
}

const buildCaseWizard = (visibleOn, preset) => localize({
  id: randomUUID(), type: 'support_case_wizard', visible: true, visible_on: visibleOn,
  categories: [
    category('order', 'order', 0, true, false, value('Bestellung', 'Order', 'Sipariş', 'Commande', 'Pedido', 'Ordine'), [
      value('Falscher Artikel erhalten', 'Wrong item received', 'Yanlış ürün geldi', 'Mauvais article reçu', 'Artículo incorrecto', 'Articolo errato'),
      value('Bestellung unvollständig', 'Order incomplete', 'Sipariş eksik', 'Commande incomplète', 'Pedido incompleto', 'Ordine incompleto'),
    ]),
    category('delivery', 'delivery', 1, true, false, value('Lieferung', 'Delivery', 'Teslimat', 'Livraison', 'Entrega', 'Consegna'), [
      value('Paket nicht angekommen', 'Package not received', 'Paket gelmedi', 'Colis non reçu', 'Paquete no recibido', 'Pacco non ricevuto'),
    ]),
    category('return', 'return', 2, true, false, value('Rückgabe', 'Return', 'İade', 'Retour', 'Devolución', 'Reso'), [
      value('Rückgabe gewünscht', 'Return wanted', 'İade etmek istiyorum', 'Retour souhaité', 'Quiero devolverlo', 'Voglio effettuare un reso'),
    ]),
    category('refund', 'refund', 3, true, false, value('Erstattung', 'Refund', 'Para iadesi', 'Remboursement', 'Reembolso', 'Rimborso'), [
      value('Erstattung fehlt', 'Refund missing', 'Para iadesi eksik', 'Remboursement manquant', 'Falta el reembolso', 'Rimborso mancante'),
    ]),
    category('payment', 'payment', 4, false, true, value('Zahlung', 'Payment', 'Ödeme', 'Paiement', 'Pago', 'Pagamento'), [
      value('Zahlung fehlgeschlagen', 'Payment failed', 'Ödeme başarısız', 'Paiement échoué', 'Pago fallido', 'Pagamento non riuscito'),
    ]),
    category('invoice', 'invoice', 5, true, false, value('Rechnung', 'Invoice', 'Fatura', 'Facture', 'Factura', 'Fattura'), [
      value('Rechnung ist falsch', 'Invoice is incorrect', 'Fatura yanlış', 'Facture incorrecte', 'Factura incorrecta', 'Fattura errata'),
    ]),
    category('account', 'account', 6, false, true, value('Konto', 'Account', 'Hesap', 'Compte', 'Cuenta', 'Account'), [
      value('Konto nicht zugänglich', 'Account inaccessible', 'Hesaba erişemiyorum', 'Compte inaccessible', 'Cuenta inaccesible', 'Account non accessibile'),
    ]),
    category('bonus', 'bonus', 7, false, true, value('Bonus & Gutschein', 'Bonus & coupon', 'Bonus ve kupon', 'Bonus et coupon', 'Bono y cupón', 'Bonus e coupon'), [
      value('Bonus oder Gutschein funktioniert nicht', 'Bonus or coupon not working', 'Bonus veya kupon çalışmıyor', 'Bonus ou coupon invalide', 'Bono o cupón no funciona', 'Bonus o coupon non funziona'),
    ]),
    category('product', 'product', 8, true, false, value('Produkt', 'Product', 'Ürün', 'Produit', 'Producto', 'Prodotto'), [
      value('Produkt beschädigt', 'Product damaged', 'Ürün hasarlı', 'Produit endommagé', 'Producto dañado', 'Prodotto danneggiato'),
    ]),
    category('seller', 'seller', 9, true, false, value('Verkäufer', 'Seller', 'Satıcı', 'Vendeur', 'Vendedor', 'Venditore'), [
      value('Beschwerde über Verkäufer', 'Seller complaint', 'Satıcı şikayeti', 'Réclamation vendeur', 'Queja sobre vendedor', 'Reclamo venditore'),
    ]),
    category('technical', 'technical', 10, false, true, value('Technisches Problem', 'Technical issue', 'Teknik sorun', 'Problème technique', 'Problema técnico', 'Problema tecnico'), [
      value('Technischer Fehler', 'Technical error', 'Teknik hata', 'Erreur technique', 'Error técnico', 'Errore tecnico'),
    ]),
    category('privacy', 'privacy', 11, false, true, value('Datenschutz', 'Privacy', 'Gizlilik', 'Confidentialité', 'Privacidad', 'Privacy'), [
      value('Datenschutzanfrage', 'Privacy request', 'Gizlilik talebi', 'Demande de confidentialité', 'Solicitud de privacidad', 'Richiesta privacy'),
    ]),
    category('other', 'other', 12, false, true, value('Sonstiges', 'Other', 'Diğer', 'Autre', 'Otro', 'Altro'), [
      value('Anderes Anliegen', 'Other issue', 'Diğer konu', 'Autre demande', 'Otro asunto', 'Altro problema'),
    ]),
  ],
  padding: preset.padding, content_layout: 'contained', content_max_width: preset.content_max_width,
}, {
  title: value('Worum geht es?', 'What do you need help with?', 'Hangi konuda yardıma ihtiyacınız var?', 'Comment pouvons-nous vous aider ?', '¿Con qué necesitas ayuda?', 'Come possiamo aiutarti?'),
  description: value('Wählen Sie zuerst einen Bereich und anschließend das passende Thema.', 'Choose an area, then the matching topic.', 'Önce alanı, ardından uygun konuyu seçin.', 'Choisissez un domaine puis le thème.', 'Elige un área y el tema.', "Scegli un'area e l'argomento."),
  category_heading: value('Bereich auswählen', 'Choose an area', 'Alan seçin', 'Choisir un domaine', 'Elegir área', "Scegli un'area"),
  subtopic_heading: value('Thema auswählen', 'Choose a topic', 'Konu seçin', 'Choisir un thème', 'Elegir tema', 'Scegli un argomento'),
  order_heading: value('Welche Bestellung betrifft Ihre Anfrage?', 'Which order is this about?', 'Hangi siparişle ilgili?', 'Quelle commande est concernée ?', '¿Qué pedido está relacionado?', 'Quale ordine riguarda?'),
  continue_label: value('Weiter', 'Continue', 'Devam', 'Continuer', 'Continuar', 'Continua'),
  back_label: value('Zurück', 'Back', 'Geri', 'Retour', 'Atrás', 'Indietro'),
})

const buildOrderPicker = (visibleOn, preset) => localize({
  id: randomUUID(), type: 'support_order_picker', visible: true, visible_on: visibleOn,
  orders_limit: preset.orders_limit,
  orders_columns_desktop: preset.orderCols.desktop,
  orders_columns_tablet: preset.orderCols.tablet,
  orders_columns_mobile: preset.orderCols.mobile,
  cta_other_item_url: '/orders',
  cta_other_problem_url: '#support-wizard',
  padding: preset.padding, content_layout: 'contained', content_max_width: preset.content_max_width,
}, {
  title: value(
    'Brauchst du Hilfe bei einem aktuellen Artikel, {first_name}?',
    'Need help with a recent item, {first_name}?',
    'Güncel bir ürün için yardıma mı ihtiyacın var, {first_name}?',
    'Besoin d\'aide pour un article récent, {first_name} ?',
    '¿Necesitas ayuda con un artículo reciente, {first_name}?',
    'Ti serve aiuto con un articolo recente, {first_name}?',
  ),
  subtitle: value(
    'Wähle unten den Artikel aus, zu dem du Hilfe brauchst.',
    'Select the item below that you need help with.',
    'Yardım istediğin ürünü aşağıdan seç.',
    'Sélectionnez ci-dessous l\'article concerné.',
    'Selecciona abajo el artículo con el que necesitas ayuda.',
    'Seleziona sotto l\'articolo per cui ti serve aiuto.',
  ),
  guest_title: value(
    'Brauchst du Hilfe bei einer Bestellung?',
    'Need help with an order?',
    'Bir sipariş için yardıma mı ihtiyacın var?',
    'Besoin d\'aide pour une commande ?',
    '¿Necesitas ayuda con un pedido?',
    'Ti serve aiuto con un ordine?',
  ),
  empty_orders_text: value(
    'Noch keine Bestellungen vorhanden.',
    'No orders yet.',
    'Henüz sipariş yok.',
    'Aucune commande pour le moment.',
    'Aún no hay pedidos.',
    'Nessun ordine ancora.',
  ),
  cta_other_item_label: value(
    'Hilfe bei einem anderen Artikel',
    'Help with another item',
    'Başka bir ürün için yardım',
    'Aide pour un autre article',
    'Ayuda con otro artículo',
    'Aiuto per un altro articolo',
  ),
  cta_other_problem_label: value(
    'Hilfe bei einem anderen Problem',
    'Help with another problem',
    'Başka bir sorun için yardım',
    'Aide pour un autre problème',
    'Ayuda con otro problema',
    'Aiuto per un altro problema',
  ),
})

const buildHelpCards = (visibleOn, preset) => localize({
  id: randomUUID(), type: 'support_help_cards', visible: true, visible_on: visibleOn,
  view_all_url: '/orders',
  columns_desktop: preset.helpCols.desktop,
  columns_tablet: preset.helpCols.tablet,
  columns_mobile: preset.helpCols.mobile,
  cards: [
    helpCard('where_is_order', '📦', 0,
      value('Wo ist meine Bestellung?', 'Where is my order?', 'Siparişim nerede?', 'Où est ma commande ?', '¿Dónde está mi pedido?', "Dov'è il mio ordine?"),
      value('Verfolge Sendungen und prüfe den Lieferstatus.', 'Track shipments and check delivery status.', 'Gönderileri takip et ve teslimat durumunu kontrol et.', 'Suivez les envois et le statut de livraison.', 'Sigue envíos y consulta el estado de entrega.', 'Traccia le spedizioni e controlla lo stato.'),
      '/orders'),
    helpCard('return_item', '↩️', 1,
      value('Artikel zurückgeben oder ersetzen', 'Return or replace an item', 'Ürün iade veya değişim', 'Retourner ou remplacer un article', 'Devolver o cambiar un artículo', 'Reso o sostituzione'),
      value('Starte eine Rückgabe oder melde ein Problem.', 'Start a return or report an issue.', 'İade başlat veya sorun bildir.', 'Lancez un retour ou signalez un problème.', 'Inicia una devolución o informa un problema.', 'Avvia un reso o segnala un problema.'),
      '#support-wizard'),
    helpCard('cancel_order', '🚫', 2,
      value('Bestellung stornieren', 'Cancel an order', 'Siparişi iptal et', 'Annuler une commande', 'Cancelar un pedido', 'Annulla un ordine'),
      value('Prüfe, ob eine Stornierung noch möglich ist.', 'Check whether cancellation is still possible.', 'İptalin hâlâ mümkün olup olmadığını kontrol et.', "Vérifiez si l'annulation est encore possible.", 'Comprueba si aún es posible cancelar.', "Verifica se l'annullamento è ancora possibile."),
      '/orders'),
    helpCard('account_help', '👤', 3,
      value('Konto & Sicherheit', 'Account & security', 'Hesap ve güvenlik', 'Compte et sécurité', 'Cuenta y seguridad', 'Account e sicurezza'),
      value('Zugang, Daten und Sicherheitseinstellungen.', 'Access, data and security settings.', 'Erişim, veri ve güvenlik ayarları.', 'Accès, données et paramètres de sécurité.', 'Acceso, datos y ajustes de seguridad.', 'Accesso, dati e impostazioni di sicurezza.'),
      '#support-wizard'),
  ],
  padding: preset.padding, content_layout: 'contained', content_max_width: preset.content_max_width,
}, {
  title: value(
    'Haben Sie Fragen zu Ihren Einkäufen?',
    'Questions about your purchases?',
    'Alışverişlerinizle ilgili sorularınız mı var?',
    'Des questions sur vos achats ?',
    '¿Preguntas sobre tus compras?',
    'Domande sui tuoi acquisti?',
  ),
  view_all_label: value('Alles ansehen', 'View all', 'Tümünü gör', 'Tout voir', 'Ver todo', 'Vedi tutto'),
})

const buildHelpLibrary = (visibleOn, preset) => localize({
  id: randomUUID(), type: 'support_help_library', visible: true, visible_on: visibleOn,
  footer_cta_url: '#support-wizard',
  topics: [
    helpTopic('where_order', 0,
      value('Wo ist meine Bestellung?', 'Where is my order?', 'Siparişim nerede?', 'Où est ma commande ?', '¿Dónde está mi pedido?', "Dov'è il mio ordine?"),
      '/orders'),
    helpTopic('returns', 1,
      value('Rückgabe & Erstattung', 'Returns & refunds', 'İade ve para iadesi', 'Retours et remboursements', 'Devoluciones y reembolsos', 'Resi e rimborsi'),
      '#support-wizard'),
    helpTopic('payment', 2,
      value('Zahlung & Rechnung', 'Payment & invoice', 'Ödeme ve fatura', 'Paiement et facture', 'Pago y factura', 'Pagamento e fattura'),
      '#support-wizard'),
    helpTopic('account', 3,
      value('Konto verwalten', 'Manage account', 'Hesabı yönet', 'Gérer le compte', 'Gestionar cuenta', 'Gestisci account'),
      '#support-wizard'),
  ],
  articles: [
    helpArticle('track_package', 0,
      value('Sendung verfolgen', 'Track a shipment', 'Gönderiyi takip et', 'Suivre un envoi', 'Seguir un envío', 'Traccia una spedizione'),
      value('Öffne die Bestellung und prüfe den aktuellen Lieferstatus.', 'Open the order and check the latest delivery status.', 'Siparişi açıp güncel teslimat durumunu kontrol et.', 'Ouvrez la commande et vérifiez le statut.', 'Abre el pedido y consulta el estado.', "Apri l'ordine e controlla lo stato."),
      '/orders'),
    helpArticle('start_return', 1,
      value('Rückgabe starten', 'Start a return', 'İade başlat', 'Commencer un retour', 'Iniciar una devolución', 'Avvia un reso'),
      value('Wähle die Bestellung und den betroffenen Artikel aus.', 'Choose the order and the affected item.', 'Siparişi ve ilgili ürünü seç.', "Choisissez la commande et l'article.", 'Elige el pedido y el artículo.', "Scegli l'ordine e l'articolo."),
      '#support-wizard'),
    helpArticle('payment_issue', 2,
      value('Zahlungsproblem melden', 'Report a payment issue', 'Ödeme sorunu bildir', 'Signaler un problème de paiement', 'Informar un problema de pago', 'Segnala un problema di pagamento'),
      value('Beschreibe den Fehler und füge ggf. einen Beleg hinzu.', 'Describe the issue and attach a receipt if needed.', 'Sorunu açıkla ve gerekirse belge ekle.', 'Décrivez le problème et joignez un reçu.', 'Describe el problema y adjunta un recibo.', 'Descrivi il problema e allega una ricevuta.'),
      '#support-wizard'),
  ],
  padding: preset.padding, content_layout: 'contained', content_max_width: preset.content_max_width,
}, {
  title: value(
    'Durchsuche unsere Hilfe-Bibliothek',
    'Browse our help library',
    'Yardım kütüphanesine göz at',
    "Parcourir la bibliothèque d'aide",
    'Explora la biblioteca de ayuda',
    'Sfoglia la biblioteca di aiuto',
  ),
  search_placeholder: value(
    'Gib etwas ein, wie z. B. „Frage zu einer Gebühr.“',
    'Type something like “question about a fee.”',
    'Örn. “ücret hakkında soru” yazın.',
    'Saisissez p. ex. « question sur des frais ».',
    'Escribe p. ej. «pregunta sobre una tarifa».',
    'Scrivi ad es. «domanda su una commissione».',
  ),
  all_topics_label: value('Alle Hilfethemen', 'All help topics', 'Tüm yardım konuları', "Tous les thèmes d'aide", 'Todos los temas de ayuda', 'Tutti gli argomenti di aiuto'),
  recommended_heading: value('Empfohlene Themen', 'Recommended topics', 'Önerilen konular', 'Thèmes recommandés', 'Temas recomendados', 'Argomenti consigliati'),
  more_heading: value('Weitere Themen & Hilfeseiten', 'More topics & help pages', 'Diğer konular ve yardım sayfaları', "Autres thèmes et pages d'aide", 'Más temas y páginas de ayuda', 'Altri argomenti e pagine di aiuto'),
  footer_title: value('Brauchst du weitere Hilfe?', 'Need more help?', 'Daha fazla yardıma mı ihtiyacın var?', "Besoin d'aide supplémentaire ?", '¿Necesitas más ayuda?', 'Ti serve altro aiuto?'),
  footer_body: value(
    'Starte eine Support-Anfrage — wir helfen dir weiter.',
    'Start a support request — we’re here to help.',
    'Destek talebi başlat — yardımcı oluruz.',
    'Lancez une demande — nous sommes là.',
    'Inicia una solicitud — estamos para ayudarte.',
    'Avvia una richiesta — siamo qui per aiutarti.',
  ),
  footer_cta_label: value('Neue Support-Anfrage', 'New support request', 'Yeni destek talebi', 'Nouvelle demande', 'Nueva solicitud', 'Nuova richiesta'),
})

/** Amazon hub stack for one device (order → cards → library → wizard). */
const buildDeviceAmazonContainers = (visibleOn) => {
  const preset = DEVICE_PRESETS[visibleOn] || DEVICE_PRESETS.desktop
  return [
    buildOrderPicker(visibleOn, preset),
    buildHelpCards(visibleOn, preset),
    buildHelpLibrary(visibleOn, preset),
    buildCaseWizard(visibleOn, preset),
  ]
}

/** @deprecated use buildDeviceAmazonContainers('desktop') — kept for exports */
const buildDesktopAmazonContainers = () => buildDeviceAmazonContainers('desktop')

/** Full 3-device Amazon set. */
const supportContainers = () => [
  ...buildDeviceAmazonContainers('desktop'),
  ...buildDeviceAmazonContainers('tablet'),
  ...buildDeviceAmazonContainers('mobile'),
]

const stripTestBlocks = (containers) => (Array.isArray(containers) ? containers : []).filter((c) => !isYaptimOlduBlock(c))

/**
 * Rebuild all devices to Amazon hub; keep only non-stack custom containers.
 * Strips YAPTIM OLDU and legacy hero/topic_grid/faq on every device.
 */
const migrateToAmazonLayout = (containers) => {
  const cleaned = stripTestBlocks(containers)
  const custom = cleaned.filter((c) => !AMAZON_STACK_TYPES.has(c.type) && c.type !== 'text_block')
  return [...supportContainers(), ...custom]
}

/** @deprecated alias */
const migrateToAmazonDesktop = migrateToAmazonLayout

/**
 * Ensures the customer-support page + Amazon landing containers exist.
 * @returns {{ created: boolean, added: number, migrated?: boolean, stripped?: number }}
 */
async function ensureCustomerSupportLanding(client, opts = {}) {
  const dryRun = !!opts.dryRun
  const force = !!opts.force
  await client.query('BEGIN')
  try {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'admin_hub_pages' AND column_name IN ('slug', 'handle')`
    )
    const pageColumns = new Set(columns.rows.map((row) => row.column_name))
    if (!pageColumns.has('slug')) throw new Error('admin_hub_pages.slug is required')
    const predicates = [`regexp_replace(slug, '^/+', '') = $1`]
    if (pageColumns.has('handle')) predicates.push(`regexp_replace(handle, '^/+', '') = $1`)
    let pageResult = await client.query(
      `SELECT id, slug FROM admin_hub_pages WHERE ${predicates.join(' OR ')} ORDER BY updated_at DESC LIMIT 1`,
      ['customer-support']
    )
    let createdPage = false
    if (!pageResult.rows[0]) {
      createdPage = true
      if (dryRun) {
        await client.query('ROLLBACK')
        return { created: false, added: 0, wouldCreate: true }
      }
      pageResult = await client.query(
        `INSERT INTO admin_hub_pages (title, slug, body, status, page_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, slug`,
        ['Kundenservice', 'customer-support', '', 'published', 'page']
      )
    }

    const pageId = String(pageResult.rows[0].id)
    const landingResult = await client.query(
      'SELECT containers, settings FROM admin_hub_landing_pages WHERE page_id = $1 FOR UPDATE',
      [pageId]
    )
    const existing = Array.isArray(landingResult.rows[0]?.containers) ? landingResult.rows[0].containers : []
    const settings = (landingResult.rows[0]?.settings && typeof landingResult.rows[0].settings === 'object')
      ? { ...landingResult.rows[0].settings }
      : {}
    const currentLayout = settings.support_landing_layout || ''
    const strippedCount = existing.filter(isYaptimOlduBlock).length
    const needsMigrate = force || createdPage || !landingResult.rows[0] || currentLayout !== LAYOUT_VERSION

    if (dryRun) {
      await client.query('ROLLBACK')
      if (!landingResult.rows[0] || createdPage) {
        return { created: false, added: 0, wouldCreate: true, wouldMigrate: true }
      }
      return {
        created: false,
        added: 0,
        wouldMigrate: needsMigrate,
        wouldStrip: strippedCount,
        currentLayout: currentLayout || '(none)',
        targetLayout: LAYOUT_VERSION,
      }
    }

    let nextContainers
    let migrated = false
    if (!landingResult.rows[0] || createdPage) {
      nextContainers = supportContainers()
      migrated = true
    } else if (needsMigrate) {
      nextContainers = migrateToAmazonLayout(existing)
      migrated = true
    } else if (strippedCount > 0) {
      nextContainers = stripTestBlocks(existing)
    } else {
      await client.query('ROLLBACK')
      return { created: false, added: 0, migrated: false, stripped: 0 }
    }

    settings.support_landing_layout = LAYOUT_VERSION
    if (landingResult.rows[0]) {
      await client.query(
        'UPDATE admin_hub_landing_pages SET containers = $2, settings = $3, updated_at = NOW() WHERE page_id = $1',
        [pageId, JSON.stringify(nextContainers), JSON.stringify(settings)]
      )
    } else {
      await client.query(
        `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [pageId, JSON.stringify(nextContainers), JSON.stringify(settings)]
      )
    }
    await client.query('COMMIT')
    return {
      created: createdPage,
      added: nextContainers.length,
      migrated,
      stripped: strippedCount,
      layout: LAYOUT_VERSION,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

module.exports = {
  LAYOUT_VERSION,
  DEVICE_PRESETS,
  supportContainers,
  buildDeviceAmazonContainers,
  buildDesktopAmazonContainers,
  migrateToAmazonLayout,
  migrateToAmazonDesktop,
  stripTestBlocks,
  ensureCustomerSupportLanding,
}
