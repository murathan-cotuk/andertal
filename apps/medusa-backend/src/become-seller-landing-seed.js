'use strict'

/**
 * Seed + remote push for CMS page slug `verkaeufer-werden`.
 * Shop renders a dedicated BecomeSellerLanding React page for this slug;
 * these 13 containers keep the Sellercentral landing-page editor in sync
 * (structure / CTA URLs) so editors see the intended sections.
 *
 * Usage:
 *   SELLER_TOKEN=... node scripts/push-become-seller-landing-remote.js
 */

const { randomUUID } = require('crypto')

const LAYOUT_VERSION = 'become_seller_v1'
const REGISTER = {
  de: 'https://sellercentral.andertal.com/de/register',
  en: 'https://sellercentral.andertal.com/en/register',
  tr: 'https://sellercentral.andertal.com/tr/register',
  fr: 'https://sellercentral.andertal.com/fr/register',
  es: 'https://sellercentral.andertal.com/es/register',
  it: 'https://sellercentral.andertal.com/it/register',
}

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

const HERO_IMG = 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=2000&q=80'
const EU_IMG = 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1400&q=80'
const TOOLS_IMG = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80'

function becomeSellerContainers(visibleOn = 'desktop') {
  const pad = visibleOn === 'mobile' ? '32px 16px' : visibleOn === 'tablet' ? '40px 20px' : '56px 24px'
  const ctaUrl = REGISTER.de

  return [
    // 1 Hero
    localize({
      id: randomUUID(), type: 'hero_banner', visible: true, visible_on: visibleOn,
      padding: '0px', content_layout: 'full', image_url: HERO_IMG,
      overlay_opacity: 0.55, text_color: '#f7f4ee', btn_url: ctaUrl,
      min_height: visibleOn === 'mobile' ? '78vh' : '88vh',
    }, {
      title: value('Verkaufe dort, wo Europa einkauft.', 'Sell where Europe shops.', 'Avrupa’nın alışveriş yaptığı yerde sat.', 'Vendez là où l’Europe achète.', 'Vende donde compra Europa.', 'Vendi dove compra l’Europa.'),
      subtitle: value(
        'Eröffne deinen Shop auf dem Andertal Marketplace — klare Tools, EU-weite Reichweite und Sellercentral.',
        'Open your store on the Andertal Marketplace — clear tools, EU-wide reach, and Sellercentral.',
        'Andertal Marketplace’te mağazanı aç — net araçlar ve AB erişimi.',
        'Ouvrez votre boutique sur Andertal — outils clairs et portée UE.',
        'Abre tu tienda en Andertal — herramientas claras y alcance UE.',
        'Apri il tuo shop su Andertal — strumenti chiari e portata UE.',
      ),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
    }),

    // 2 Mid CTA
    localize({
      id: randomUUID(), type: 'banner_cta', visible: true, visible_on: visibleOn,
      padding: pad, bg_color: '#0d1f1a', text_color: '#f4f1ea', btn_url: REGISTER.en,
    }, {
      title: value('0 € Startgebühr. EU-weite Kunden.', '€0 opening fee. EU customers.', '0 € açılış ücreti. AB müşterileri.', '0 € de frais d’ouverture.', '0 € de cuota de apertura.', '0 € di costo di apertura.'),
      subtitle: value('Registriere dich in Sellercentral und liste dein erstes Produkt.', 'Register in Sellercentral and list your first product.', 'Sellercentral’de kaydol ve ilk ürününü listele.', 'Inscrivez-vous et listez votre premier produit.', 'Regístrate y publica tu primer producto.', 'Registrati e pubblica il primo prodotto.'),
      btn_text: value('Jetzt starten', 'Start now', 'Şimdi başla', 'Commencer', 'Empezar', 'Inizia'),
    }),

    // 3 Features
    localize({
      id: randomUUID(), type: 'feature_grid', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({ icon: '1' }, { title: value('Eigene Storefront', 'Your storefront', 'Kendi vitrinin', 'Vitrine', 'Escaparate', 'Vetrina'), description: value('Marke, Produkte und Bewertungen an einem Ort.', 'Brand, products, and reviews in one place.', 'Marka, ürün ve yorumlar bir arada.', 'Marque, produits et avis au même endroit.', 'Marca, productos y reseñas en un lugar.', 'Brand, prodotti e recensioni in un posto.') }),
        localize({ icon: '2' }, { title: value('EU-weite Kunden', 'EU customers', 'AB müşterileri', 'Clients UE', 'Clientes UE', 'Clienti UE'), description: value('Mehrere Märkte — ein Katalog.', 'Multiple markets — one catalog.', 'Birçok pazar — tek katalog.', 'Plusieurs marchés — un catalogue.', 'Varios mercados — un catálogo.', 'Più mercati — un catalogo.') }),
        localize({ icon: '3' }, { title: value('Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral'), description: value('Bestellungen, Lager, Versand, Analytics.', 'Orders, stock, shipping, analytics.', 'Sipariş, stok, kargo, analitik.', 'Commandes, stock, expédition, analytics.', 'Pedidos, stock, envío, analítica.', 'Ordini, stock, spedizione, analytics.') }),
        localize({ icon: '4' }, { title: value('Klare Gebühren', 'Clear fees', 'Net ücretler', 'Frais clairs', 'Tarifas claras', 'Commissioni chiare'), description: value('Planbare Marketplace-Logik.', 'Readable marketplace economics.', 'Okunabilir marketplace ekonomisi.', 'Économie marketplace lisible.', 'Economía del marketplace legible.', 'Economia marketplace leggibile.') }),
        localize({ icon: '5' }, { title: value('Wachstum', 'Growth', 'Büyüme', 'Croissance', 'Crecimiento', 'Crescita'), description: value('Kategorien, Collections, Badges.', 'Categories, collections, badges.', 'Kategori, koleksiyon, rozet.', 'Catégories, collections, badges.', 'Categorías, colecciones, badges.', 'Categorie, collection, badge.') }),
        localize({ icon: '6' }, { title: value('Support', 'Support', 'Destek', 'Support', 'Soporte', 'Supporto'), description: value('Retouren- und Fallprozesse.', 'Returns and case flows.', 'İade ve destek süreçleri.', 'Retours et tickets.', 'Devoluciones y casos.', 'Resi e casi.') }),
      ],
    }, {
      title: value('Warum Andertal', 'Why Andertal', 'Neden Andertal', 'Pourquoi Andertal', 'Por qué Andertal', 'Perché Andertal'),
      subtitle: value('Mehr als ein Shop. Ein europäischer Verkaufskanal.', 'More than a shop. A European sales channel.', 'Mağazadan fazlası. Avrupa satış kanalı.', 'Plus qu’une boutique. Un canal européen.', 'Más que una tienda. Un canal europeo.', 'Più di uno shop. Un canale europeo.'),
    }),

    // 4 Image + text
    localize({
      id: randomUUID(), type: 'image_text', visible: true, visible_on: visibleOn, padding: pad,
      image_url: EU_IMG, image_position: 'right', btn_url: ctaUrl,
    }, {
      title: value('Europa ist dein Schaufenster.', 'Europe is your storefront.', 'Avrupa vitrinin.', 'L’Europe est votre vitrine.', 'Europa es tu escaparate.', 'L’Europa è la tua vetrina.'),
      body: value('Liste einmal und verkaufe in einem kuratierten Marketplace.', 'List once and sell in a curated marketplace.', 'Bir kez listele, kurateli marketplace’te sat.', 'Listez une fois, vendez sur un marketplace.', 'Lista una vez y vende en el marketplace.', 'Elenca una volta e vendi nel marketplace.'),
      btn_text: value('Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
    }),

    // 5 Text / steps
    localize({
      id: randomUUID(), type: 'text_block', visible: true, visible_on: visibleOn, padding: pad,
    }, {
      title: value('In 4 Schritten zum ersten Verkauf', '4 steps to your first sale', 'İlk satışa 4 adım', '4 étapes vers la première vente', '4 pasos hasta la primera venta', '4 passi alla prima vendita'),
      body: value(
        '<ol><li><strong>Registrieren</strong> — Sellercentral Konto anlegen</li><li><strong>Shop vorbereiten</strong> — Marke, Locations, Versand</li><li><strong>Produkte listen</strong> — Varianten, Preise, Medien</li><li><strong>Verkaufen & ausliefern</strong> — Tracking und Auszahlung</li></ol>',
        '<ol><li><strong>Register</strong> — create Sellercentral account</li><li><strong>Prepare shop</strong> — brand, locations, shipping</li><li><strong>List products</strong> — variants, prices, media</li><li><strong>Sell & ship</strong> — tracking and payouts</li></ol>',
        '<ol><li><strong>Kayıt</strong></li><li><strong>Mağaza hazırlığı</strong></li><li><strong>Ürün listele</strong></li><li><strong>Sat ve gönder</strong></li></ol>',
        '<ol><li><strong>Inscription</strong></li><li><strong>Préparer la boutique</strong></li><li><strong>Lister les produits</strong></li><li><strong>Vendre & expédier</strong></li></ol>',
        '<ol><li><strong>Registro</strong></li><li><strong>Preparar tienda</strong></li><li><strong>Publicar productos</strong></li><li><strong>Vender y enviar</strong></li></ol>',
        '<ol><li><strong>Registrazione</strong></li><li><strong>Prepara lo shop</strong></li><li><strong>Elenca prodotti</strong></li><li><strong>Vendi e spedisci</strong></li></ol>',
      ),
    }),

    // 6 Accordion deep
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Warum nicht nur ein eigener Webshop?', 'Why not only my own webshop?', 'Neden sadece kendi mağazam?', 'Pourquoi pas seulement ma boutique?', '¿Por qué no solo mi tienda?', 'Perché non solo il mio shop?'), answer: value('Ein eigener Shop braucht Traffic. Andertal bringt Marketplace-Nachfrage und Infrastruktur.', 'Your own shop needs traffic. Andertal brings marketplace demand and infrastructure.', 'Kendi mağaza trafik ister. Andertal talep ve altyapı getirir.', 'Votre boutique a besoin de trafic. Andertal apporte la demande marketplace.', 'Tu tienda necesita tráfico. Andertal aporta demanda e infraestructura.', 'Il tuo shop ha bisogno di traffico. Andertal porta domanda e infrastruttura.') }),
        localize({}, { question: value('Behalte ich Kontrolle über Preise?', 'Do I keep pricing control?', 'Fiyat kontrolü bende mi?', 'Est-ce que je garde les prix?', '¿Mantengo el control de precios?', 'Mantengo il controllo prezzi?'), answer: value('Ja. Katalog, Preise, Lager und Versandregeln bleiben bei dir.', 'Yes. Catalog, prices, stock, and shipping rules stay with you.', 'Evet. Katalog, fiyat, stok ve kargo sende kalır.', 'Oui. Catalogue, prix, stock et règles d’expédition restent à vous.', 'Sí. Catálogo, precios, stock y envío siguen siendo tuyos.', 'Sì. Catalogo, prezzi, stock e spedizione restano tuoi.') }),
        localize({}, { question: value('Für wen ist Andertal geeignet?', 'Who is Andertal for?', 'Andertal kimler için?', 'Pour qui est Andertal?', '¿Para quién es Andertal?', 'Per chi è Andertal?'), answer: value('Marken, Manufakturen und Händler mit EU-Ambition.', 'Brands, makers, and merchants with EU ambition.', 'Markalar, üreticiler ve AB hedefi olan satıcılar.', 'Marques, artisans et marchands avec ambition UE.', 'Marcas, makers y comercios con ambición UE.', 'Brand, maker e merchant con ambizione UE.') }),
        localize({}, { question: value('Wie schnell bin ich live?', 'How fast can I go live?', 'Ne kadar hızlı yayına çıkarım?', 'En combien de temps suis-je en ligne?', '¿Qué tan rápido salgo en vivo?', 'Quanto tempo per andare live?'), answer: value('Sobald Konto, Pflichtangaben und erste Produkte bereit sind.', 'Once account, required details, and first products are ready.', 'Hesap, zorunlu alanlar ve ilk ürünler hazır olunca.', 'Dès que le compte, les champs requis et les premiers produits sont prêts.', 'Cuando la cuenta, los datos obligatorios y los primeros productos estén listos.', 'Quando account, campi obbligatori e primi prodotti sono pronti.') }),
        localize({}, { question: value('Was passiert nach der Bestellung?', 'What happens after an order?', 'Siparişten sonra ne olur?', 'Que se passe-t-il après une commande?', '¿Qué pasa tras un pedido?', 'Cosa succede dopo un ordine?'), answer: value('Du siehst die Order in Sellercentral, versendest und setzt Tracking.', 'You see the order in Sellercentral, ship, and add tracking.', 'Siparişi Sellercentral’de görür, gönderir ve takip eklersin.', 'Vous voyez la commande dans Sellercentral, expédiez et ajoutez le suivi.', 'Ves el pedido en Sellercentral, envías y añades tracking.', 'Vedi l’ordine in Sellercentral, spedisci e aggiungi tracking.') }),
      ],
    }, {
      title: value('Was dich wirklich weiterbringt', 'What actually moves the needle', 'Seni gerçekten ileri taşıyanlar', 'Ce qui fait vraiment avancer', 'Lo que realmente impulsa', 'Cosa ti fa davvero avanzare'),
    }),

    // 7 Tabs
    localize({
      id: randomUUID(), type: 'tabs', visible: true, visible_on: visibleOn, padding: pad, style: 'pills',
      tabs: [
        localize({}, { label: value('Marke', 'Brand', 'Marka', 'Marque', 'Marca', 'Brand'), content: value('Baue Präsenz mit Markenseite und konsistentem Merchandising.', 'Build presence with a brand page and consistent merchandising.', 'Marka sayfası ve tutarlı merchandising ile görünür ol.', 'Construisez une présence marque cohérente.', 'Construye presencia de marca coherente.', 'Costruisci presenza brand coerente.') }),
        localize({}, { label: value('Manufaktur', 'Maker', 'Üretici', 'Atelier', 'Maker', 'Maker'), content: value('Liste handgemachte oder EU-gefertigte Produkte mit klarer Herkunft.', 'List handcrafted or EU-made goods with clear origin.', 'El yapımı veya AB menşeli ürünleri net kökenle listele.', 'Listez des produits fabriqués en UE avec origine claire.', 'Lista productos hechos en la UE con origen claro.', 'Elenca prodotti UE con origine chiara.') }),
        localize({}, { label: value('Händler', 'Retailer', 'Satıcı', 'Revendeur', 'Comercio', 'Retailer'), content: value('Skaliere Varianten, Lager und Mehrländer-Versand mit Bulk-Uploads.', 'Scale variants, stock, and multi-country shipping with bulk uploads.', 'Varyant, stok ve çok ülke kargoyu bulk ile ölçekle.', 'Scalez variantes, stock et expédition multi-pays.', 'Escala variantes, stock y envío multi-país.', 'Scala varianti, stock e spedizione multi-paese.') }),
      ],
    }, {
      title: value('Seller-Profile', 'Seller profiles', 'Satıcı profilleri', 'Profils vendeurs', 'Perfiles de vendedor', 'Profili seller'),
    }),

    // 8 Testimonials
    localize({
      id: randomUUID(), type: 'testimonials', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { quote: value('Endlich ein Marketplace, der sich wie ein Verkaufssystem anfühlt.', 'Finally a marketplace that feels like a sales system.', 'Sonunda satış sistemi gibi hissettiren bir marketplace.', 'Enfin un marketplace qui ressemble à un vrai système de vente.', 'Por fin un marketplace que se siente como un sistema de ventas.', 'Finalmente un marketplace che sembra un sistema di vendita.'), name: value('Lena M.', 'Lena M.', 'Lena M.', 'Lena M.', 'Lena M.', 'Lena M.'), role: value('Home & Living', 'Home & Living', 'Home & Living', 'Home & Living', 'Home & Living', 'Home & Living') }),
        localize({}, { quote: value('Sellercentral ist klar aufgebaut. Bestellungen sind dort, wo sie sein müssen.', 'Sellercentral is clear. Orders live where they should.', 'Sellercentral net. Siparişler olması gereken yerde.', 'Sellercentral est clair. Les commandes sont au bon endroit.', 'Sellercentral es claro. Los pedidos están donde deben.', 'Sellercentral è chiaro. Gli ordini sono dove devono.'), name: value('Marco R.', 'Marco R.', 'Marco R.', 'Marco R.', 'Marco R.', 'Marco R.'), role: value('Elektronik', 'Electronics', 'Elektronik', 'Électronique', 'Electrónica', 'Elettronica') }),
        localize({}, { quote: value('EU-weit verkaufen, ohne fünf Shops zu pflegen.', 'EU reach without five separate shops.', 'Beş ayrı mağaza olmadan AB erişimi.', 'Portée UE sans cinq boutiques séparées.', 'Alcance UE sin cinco tiendas separadas.', 'Portata UE senza cinque shop separati.'), name: value('Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.'), role: value('Beauty', 'Beauty', 'Beauty', 'Beauty', 'Beauty', 'Beauty') }),
      ],
    }, {
      title: value('Stimmen von Sellern', 'Seller voices', 'Satıcı sesleri', 'Voix des vendeurs', 'Voces de vendedores', 'Voci dei seller'),
    }),

    // 9 Fees CTA
    localize({
      id: randomUUID(), type: 'banner_cta', visible: true, visible_on: visibleOn,
      padding: pad, bg_color: '#14352c', text_color: '#f4f1ea', btn_url: REGISTER.en,
    }, {
      title: value('Transparente Logik. Planbare Auszahlung.', 'Transparent logic. Plannable payouts.', 'Şeffaf mantık. Planlanabilir ödeme.', 'Logique transparente. Paiements planifiables.', 'Lógica transparente. Pagos planificables.', 'Logica trasparente. Pagamenti pianificabili.'),
      subtitle: value('Keine Startgebühr. Marketplace-Anteil erst bei Umsatz.', 'No opening fee. Marketplace share only when you sell.', 'Açılış ücreti yok. Pay yalnızca satışta.', 'Pas de frais d’ouverture. Part seulement à la vente.', 'Sin cuota de apertura. Comisión solo al vender.', 'Nessun costo di apertura. Quota solo alla vendita.'),
      btn_text: value('Zur Registrierung', 'Go to registration', 'Kayıta git', 'Aller à l’inscription', 'Ir al registro', 'Vai alla registrazione'),
    }),

    // 10 FAQ accordion
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Kostet die Registrierung?', 'Does registration cost anything?', 'Kayıt ücretli mi?', 'L’inscription est-elle payante?', '¿Cuesta registrarse?', 'La registrazione costa?'), answer: value('Nein — Shop eröffnen ohne Startgebühr.', 'No — open a shop with no start fee.', 'Hayır — açılış ücreti yok.', 'Non — ouverture sans frais de démarrage.', 'No — sin cuota de inicio.', 'No — nessuna fee di avvio.') }),
        localize({}, { question: value('Brauche ich ein Gewerbe?', 'Do I need a registered business?', 'İşletme gerekli mi?', 'Faut-il une entreprise?', '¿Necesito empresa?', 'Serve un’attività?'), answer: value('Es gelten die üblichen rechtlichen Anforderungen deines Landes.', 'Usual legal requirements of your country apply.', 'Ülkenin yasal gereksinimleri geçerlidir.', 'Les exigences légales de votre pays s’appliquent.', 'Aplican los requisitos legales de tu país.', 'Valgono i requisiti legali del tuo paese.') }),
        localize({}, { question: value('Mehrere Sprachen?', 'Multiple languages?', 'Çok dil?', 'Plusieurs langues?', '¿Varios idiomas?', 'Più lingue?'), answer: value('Ja — Produkte und Inhalte mehrsprachig pflegen.', 'Yes — maintain products and content in multiple locales.', 'Evet — ürün ve içerikleri çok dilli yönet.', 'Oui — contenus multilingues.', 'Sí — contenidos multilingües.', 'Sì — contenuti multilingue.') }),
        localize({}, { question: value('Wie funktionieren Auszahlungen?', 'How do payouts work?', 'Ödemeler nasıl?', 'Comment marchent les paiements?', '¿Cómo funcionan los pagos?', 'Come funzionano i pagamenti?'), answer: value('Nach Lieferung greift die Freigabelogik; Auszahlung folgt dem Rhythmus.', 'After delivery, release logic applies; payouts follow the rhythm.', 'Teslimattan sonra serbest bırakma; ödeme ritmine göre.', 'Après livraison, logique de libération puis rythme de paiement.', 'Tras la entrega, lógica de liberación y ritmo de pago.', 'Dopo la consegna, logica di sblocco e ritmo di pagamento.') }),
        localize({}, { question: value('Integrationen?', 'Integrations?', 'Entegrasyonlar?', 'Intégrations?', '¿Integraciones?', 'Integrazioni?'), answer: value('Sellercentral unterstützt gängige Seller-Workflows je nach Setup.', 'Sellercentral supports common seller workflows depending on setup.', 'Sellercentral yaygın satıcı akışlarını destekler.', 'Sellercentral prend en charge les workflows courants.', 'Sellercentral admite flujos habituales.', 'Sellercentral supporta workflow comuni.') }),
        localize({}, { question: value('Wo bekomme ich Hilfe?', 'Where do I get help?', 'Yardım nerede?', 'Où avoir de l’aide?', '¿Dónde pedir ayuda?', 'Dove chiedere aiuto?'), answer: value('Über Support-Prozesse und Sellercentral-Dokumentation.', 'Via support processes and Sellercentral docs.', 'Destek süreçleri ve Sellercentral dokümanları.', 'Via support et documentation Sellercentral.', 'Vía soporte y docs de Sellercentral.', 'Via supporto e docs Sellercentral.') }),
      ],
    }, {
      title: value('FAQ vor der Registrierung', 'FAQ before you register', 'Kayıt öncesi SSS', 'FAQ avant inscription', 'FAQ antes de registrarte', 'FAQ prima della registrazione'),
    }),

    // 11 Image text tools
    localize({
      id: randomUUID(), type: 'image_text', visible: true, visible_on: visibleOn, padding: pad,
      image_url: TOOLS_IMG, image_position: 'left', btn_url: ctaUrl,
    }, {
      title: value('Alles, was du täglich brauchst — an einem Ort.', 'Everything you need daily — in one place.', 'Günlük ihtiyacın olan her şey — tek yerde.', 'Tout le quotidien — au même endroit.', 'Todo lo diario — en un solo lugar.', 'Tutto il quotidiano — in un solo posto.'),
      body: value('Katalog, Bestellungen, Analytics, Inhalte und Einstellungen.', 'Catalog, orders, analytics, content, and settings.', 'Katalog, sipariş, analitik, içerik ve ayarlar.', 'Catalogue, commandes, analytics, contenu et réglages.', 'Catálogo, pedidos, analítica, contenido y ajustes.', 'Catalogo, ordini, analytics, contenuti e impostazioni.'),
      btn_text: value('Sellercentral öffnen', 'Open Sellercentral', 'Sellercentral’i aç', 'Ouvrir Sellercentral', 'Abrir Sellercentral', 'Apri Sellercentral'),
    }),

    // 12 Ops accordion
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Welche Produktangaben sind Pflicht?', 'Which product fields are required?', 'Hangi ürün alanları zorunlu?', 'Quels champs produit sont requis?', '¿Qué campos de producto son obligatorios?', 'Quali campi prodotto sono obbligatori?'), answer: value('Je nach Kategorie: Titel, Preis, Medien, Varianten und Compliance-Felder.', 'Depending on category: title, price, media, variants, and compliance fields.', 'Kategoriye göre: başlık, fiyat, medya, varyant ve uyumluluk.', 'Selon la catégorie: titre, prix, médias, variantes et conformité.', 'Según categoría: título, precio, medios, variantes y cumplimiento.', 'Secondo categoria: titolo, prezzo, media, varianti e conformità.') }),
        localize({}, { question: value('Versandländer einrichten?', 'Set shipping countries?', 'Kargo ülkeleri?', 'Configurer les pays d’expédition?', '¿Configurar países de envío?', 'Configurare paesi di spedizione?'), answer: value('Unter Shipping/Locations legst du Lieferländer und Adressen fest.', 'Under Shipping/Locations you set countries and addresses.', 'Shipping/Locations altında ülke ve adresleri ayarla.', 'Dans Shipping/Locations vous définissez pays et adresses.', 'En Shipping/Locations defines países y direcciones.', 'In Shipping/Locations imposti paesi e indirizzi.') }),
        localize({}, { question: value('Produkte importieren?', 'Import products?', 'Ürün içe aktar?', 'Importer des produits?', '¿Importar productos?', 'Importare prodotti?'), answer: value('Ja — Bulk-Upload und Vorlagen.', 'Yes — bulk upload and templates.', 'Evet — toplu yükleme ve şablonlar.', 'Oui — import en masse et modèles.', 'Sí — carga masiva y plantillas.', 'Sì — upload bulk e template.') }),
        localize({}, { question: value('Sichtbarkeit in Kategorien?', 'Category visibility?', 'Kategori görünürlüğü?', 'Visibilité catégories?', '¿Visibilidad en categorías?', 'Visibilità nelle categorie?'), answer: value('Katalogqualität, Preis, Verfügbarkeit und Performance zählen.', 'Catalog quality, price, availability, and performance matter.', 'Katalog kalitesi, fiyat, stok ve performans önemli.', 'Qualité catalogue, prix, dispo et performance comptent.', 'Calidad de catálogo, precio, stock y rendimiento cuentan.', 'Qualità catalogo, prezzo, disponibilità e performance contano.') }),
        localize({}, { question: value('Retouren?', 'Returns?', 'İadeler?', 'Retours?', '¿Devoluciones?', 'Resi?'), answer: value('Klare Käufer-/Seller-Flows und Retourenadressen.', 'Clear buyer/seller flows and return addresses.', 'Net alıcı/satıcı akışları ve iade adresleri.', 'Flux acheteur/vendeur clairs et adresses de retour.', 'Flujos claros y direcciones de devolución.', 'Flussi chiari e indirizzi di reso.') }),
        localize({}, { question: value('Team-Zugänge?', 'Team access?', 'Takım erişimi?', 'Accès équipe?', '¿Acceso de equipo?', 'Accesso team?'), answer: value('Rollen und Berechtigungen in Sellercentral.', 'Roles and permissions in Sellercentral.', 'Sellercentral’de roller ve izinler.', 'Rôles et permissions dans Sellercentral.', 'Roles y permisos en Sellercentral.', 'Ruoli e permessi in Sellercentral.') }),
      ],
    }, {
      title: value('Onboarding & Betrieb', 'Onboarding & ops', 'Kurulum & operasyon', 'Onboarding & ops', 'Onboarding y ops', 'Onboarding e ops'),
    }),

    // 13 Final CTA
    localize({
      id: randomUUID(), type: 'banner_cta', visible: true, visible_on: visibleOn,
      padding: pad, bg_color: '#0d1f1a', text_color: '#f4f1ea', btn_url: REGISTER.en,
    }, {
      title: value('Bereit, auf Andertal zu verkaufen?', 'Ready to sell on Andertal?', 'Andertal’de satmaya hazır mısın?', 'Prêt à vendre sur Andertal?', '¿Listo para vender en Andertal?', 'Pronto a vendere su Andertal?'),
      subtitle: value('Registrieren. Shop einrichten. Erstes Produkt listen.', 'Register. Set up your shop. List your first product.', 'Kaydol. Mağazayı kur. İlk ürünü listele.', 'Inscrivez-vous. Configurez. Listez.', 'Regístrate. Configura. Publica.', 'Registrati. Configura. Elenca.'),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller now', 'Şimdi satıcı ol', 'Devenir vendeur maintenant', 'Hazte vendedor ahora', 'Diventa venditore ora'),
    }),
  ].map((container) => ({
    ...container,
    // Prefer locale-matching register URLs when editors switch language in SC
    ...(container.btn_url ? {
      _i18n: {
        ...(container._i18n || {}),
        en: { ...(container._i18n?.en || {}), btn_url: REGISTER.en },
        tr: { ...(container._i18n?.tr || {}), btn_url: REGISTER.tr },
        fr: { ...(container._i18n?.fr || {}), btn_url: REGISTER.fr },
        es: { ...(container._i18n?.es || {}), btn_url: REGISTER.es },
        it: { ...(container._i18n?.it || {}), btn_url: REGISTER.it },
      },
    } : {}),
  }))
}

module.exports = {
  LAYOUT_VERSION,
  PAGE_SLUG: 'verkaeufer-werden',
  PAGE_ID: '3b968ab9-6aac-43fd-a3a6-4329cd5b4d4a',
  becomeSellerContainers,
  REGISTER,
}
