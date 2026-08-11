'use strict'

/**
 * Seed + ensure for CMS page slug `verkaeufer-werden`.
 * Shop renders via BecomeSellerLanding visual template when
 * settings.become_seller_layout starts with `become_seller` — containers supply copy/images.
 *
 * Section order (1:1 with shop template):
 * 1 hero → 2 stats → 3 why features → 4 reach → 5 steps → 6 deep accordion →
 * 7 tabs → 8 testimonials → 9 fees → 10 FAQ → 11 tools mosaic → 12 ops accordion → 13 final CTA
 *
 * Usage:
 *   SELLER_TOKEN=... node scripts/push-become-seller-landing-remote.js
 *   DATABASE_URL=... node scripts/setup-become-seller-landing.js
 *   DATABASE_URL=... node scripts/setup-become-seller-landing.js --force
 */

const { randomUUID } = require('crypto')

const LAYOUT_VERSION = 'become_seller_v3'
const PAGE_SLUG = 'verkaeufer-werden'
const PAGE_ID = '3b968ab9-6aac-43fd-a3a6-4329cd5b4d4a'
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
const MOSAIC1 = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80'
const MOSAIC2 = 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80'
const MOSAIC3 = 'https://images.unsplash.com/photo-1607083206869-4c797ed044a8?auto=format&fit=crop&w=900&q=80'

function becomeSellerContainers(visibleOn = 'desktop') {
  const pad = visibleOn === 'mobile' ? '32px 16px' : visibleOn === 'tablet' ? '40px 20px' : '56px 24px'
  const ctaUrl = REGISTER.de

  return [
    // 1 Hero
    localize({
      id: randomUUID(), type: 'hero_banner', visible: true, visible_on: visibleOn,
      padding: '0px', content_layout: 'full',
      height: visibleOn === 'mobile' ? '78vh' : '88vh',
      mobile_height: '70vh',
      autoplay: false,
      slides: [
        localize({
          image: HERO_IMG,
          overlay: 0.55,
          text_color: '#f7f4ee',
          text_position: 'center',
          btn_url: ctaUrl,
          btn_bg: '#b08d3a',
          btn_color: '#0d1f1a',
          btn_border: 'none',
          btn_radius: 8,
        }, {
          title: value('Verkaufe dort, wo Europa einkauft.', 'Sell where Europe shops.', 'Avrupa’nın alışveriş yaptığı yerde sat.', 'Vendez là où l’Europe achète.', 'Vende donde compra Europa.', 'Vendi dove compra l’Europa.'),
          subtitle: value(
            'Eröffne deinen Shop auf dem Andertal Marketplace — klare Tools, EU-weite Reichweite und ein Sellercentral, das mitwächst.',
            'Open your store on the Andertal Marketplace — clear tools, EU-wide reach, and a Sellercentral that scales with you.',
            'Andertal Marketplace’te mağazanı aç — net araçlar, AB erişimi ve büyüyen Sellercentral.',
            'Ouvrez votre boutique sur Andertal — outils clairs, portée UE et Sellercentral.',
            'Abre tu tienda en Andertal — herramientas claras, alcance UE y Sellercentral.',
            'Apri il tuo shop su Andertal — strumenti chiari, portata UE e Sellercentral.',
          ),
          btn_text: value('Jetzt Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
        }),
      ],
    }, {}),

    // 2 Stats — side-by-side infographics under hero
    localize({
      id: randomUUID(), type: 'feature_grid', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { title: value('EU', 'EU', 'AB', 'UE', 'UE', 'UE'), description: value('Märkte mit einer Registrierung', 'Markets with one registration', 'Tek kayıtla pazarlar', 'Marchés avec une inscription', 'Mercados con un registro', 'Mercati con una registrazione') }),
        localize({}, { title: value('0 €', '€0', '0 €', '0 €', '0 €', '0 €'), description: value('Startgebühr für deinen Shop', 'Store opening fee', 'Mağaza açılış ücreti', 'Frais d’ouverture', 'Cuota de apertura', 'Costo di apertura') }),
        localize({}, { title: value('14 Tage', '14 days', '14 gün', '14 jours', '14 días', '14 giorni'), description: value('Auszahlungslogik nach Lieferung', 'Payout logic after delivery', 'Teslimat sonrası ödeme mantığı', 'Logique de paiement après livraison', 'Lógica de pago tras entrega', 'Logica di pagamento dopo consegna') }),
        localize({}, { title: value('24/7', '24/7', '24/7', '24/7', '24/7', '24/7'), description: value('Sellercentral & Bestellfluss', 'Sellercentral & order flow', 'Sellercentral & sipariş akışı', 'Sellercentral & flux commandes', 'Sellercentral y flujo de pedidos', 'Sellercentral e flusso ordini') }),
      ],
    }, {
      title: value('Highlights', 'Highlights', 'Öne çıkanlar', 'Points clés', 'Destacados', 'Highlight'),
      subtitle: value('Zahlen & Fakten auf einen Blick', 'Numbers at a glance', 'Rakamlar bir bakışta', 'Chiffres en un coup d’œil', 'Cifras de un vistazo', 'Numeri a colpo d’occhio'),
    }),

    // 3 Why / features
    localize({
      id: randomUUID(), type: 'feature_grid', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({ icon: '1' }, { title: value('Eigene Storefront', 'Your storefront', 'Kendi vitrinin', 'Vitrine', 'Escaparate', 'Vetrina'), description: value('Markenpräsenz im Marketplace — Produkte, Markenseite und Bewertungen an einem Ort.', 'Brand presence inside the marketplace — products, brand page, and reviews in one place.', 'Marketplace’te marka varlığı — ürün, marka sayfası ve yorumlar bir arada.', 'Présence marque dans le marketplace — produits, page marque et avis.', 'Presencia de marca en el marketplace — productos, página y reseñas.', 'Presenza brand nel marketplace — prodotti, pagina brand e recensioni.') }),
        localize({ icon: '2' }, { title: value('EU-weite Kunden', 'EU customers', 'AB müşterileri', 'Clients UE', 'Clientes UE', 'Clienti UE'), description: value('Erreiche Käufer in mehreren Ländern, ohne für jeden Markt einen eigenen Shop zu betreiben.', 'Reach buyers across countries without running a separate shop for each market.', 'Her pazar için ayrı mağaza olmadan ülkeler arası alıcılara ulaş.', 'Touchez des acheteurs dans plusieurs pays sans boutique séparée.', 'Llega a compradores en varios países sin una tienda por mercado.', 'Raggiungi acquirenti in più paesi senza uno shop per mercato.') }),
        localize({ icon: '3' }, { title: value('Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral', 'Sellercentral'), description: value('Bestellungen, Lager, Versand, Inhalte und Analytics in einem ruhigen Workspace.', 'Orders, inventory, shipping, content, and analytics in one calm workspace.', 'Sipariş, stok, kargo, içerik ve analitik tek sakin çalışma alanında.', 'Commandes, stock, expédition, contenu et analytics dans un espace calme.', 'Pedidos, stock, envío, contenido y analítica en un espacio claro.', 'Ordini, stock, spedizione, contenuti e analytics in un workspace calmo.') }),
        localize({ icon: '4' }, { title: value('Klare Gebühren', 'Clear fees', 'Net ücretler', 'Frais clairs', 'Tarifas claras', 'Commissioni chiare'), description: value('Transparente Marketplace-Logik — du weißt, was nach Verkauf und Lieferung bleibt.', 'Transparent marketplace economics — you know what remains after sale and delivery.', 'Şeffaf marketplace ekonomisi — satış ve teslimattan sonra ne kaldığını bilirsin.', 'Économie marketplace lisible — vous savez ce qui reste après vente et livraison.', 'Economía del marketplace legible — sabes qué queda tras venta y entrega.', 'Economia marketplace leggibile — sai cosa resta dopo vendita e consegna.') }),
        localize({ icon: '5' }, { title: value('Wachstumsflächen', 'Growth surfaces', 'Büyüme alanları', 'Surfaces de croissance', 'Superficies de crecimiento', 'Superfici di crescita'), description: value('Kategorien, Collections, Badges und Marketing-Platzierungen für Sichtbarkeit.', 'Categories, collections, badges, and marketing placements that create visibility.', 'Kategori, koleksiyon, rozet ve pazarlama yerleşimleri ile görünürlük.', 'Catégories, collections, badges et emplacements marketing pour la visibilité.', 'Categorías, colecciones, badges y placements de marketing.', 'Categorie, collection, badge e placement marketing.') }),
        localize({ icon: '6' }, { title: value('Support-Struktur', 'Support structure', 'Destek yapısı', 'Structure support', 'Estructura de soporte', 'Struttura support'), description: value('Retouren- und Fallprozesse, damit Kundenanliegen nicht nur in deinem Posteingang leben.', 'Returns and case flows so customer issues don’t live only in your inbox.', 'İade ve vaka süreçleri — müşteri sorunları yalnızca gelen kutunda yaşamasın.', 'Retours et tickets pour que les cas ne restent pas seulement dans votre boîte mail.', 'Devoluciones y casos para que no vivan solo en tu bandeja.', 'Resi e casi così non restano solo nella tua inbox.') }),
      ],
    }, {
      title: value('Warum Andertal', 'Why Andertal', 'Neden Andertal', 'Pourquoi Andertal', 'Por qué Andertal', 'Perché Andertal'),
      subtitle: value('Mehr als ein Shop. Ein europäischer Verkaufskanal.', 'More than a shop. A European sales channel.', 'Mağazadan fazlası. Avrupa satış kanalı.', 'Plus qu’une boutique. Un canal européen.', 'Más que una tienda. Un canal europeo.', 'Più di uno shop. Un canale europeo.'),
    }),

    // 4 Reach split
    localize({
      id: randomUUID(), type: 'image_text', visible: true, visible_on: visibleOn, padding: pad,
      image: EU_IMG, image_side: 'right', btn_url: ctaUrl,
    }, {
      title: value('Europa ist dein Lagerregal — und dein Schaufenster.', 'Europe is your shelf — and your storefront.', 'Avrupa rafın — ve vitrinin.', 'L’Europe est votre étagère — et votre vitrine.', 'Europa es tu estantería — y tu escaparate.', 'L’Europa è il tuo scaffale — e la tua vetrina.'),
      body: value(
        'Andertal verbindet unabhängige Verkäufer mit Käufern, die Qualität und Herkunft schätzen. Du listest einmal und verkaufst in einem kuratierten Marketplace.',
        'Andertal connects independent sellers with buyers who care about quality and origin. List once, sell in a curated marketplace.',
        'Andertal bağımsız satıcıları kalite ve köken önemseyen alıcılarla buluşturur. Bir kez listele, kurateli marketplace’te sat.',
        'Andertal relie vendeurs indépendants et acheteurs attentifs à la qualité. Listez une fois, vendez sur un marketplace.',
        'Andertal conecta vendedores independientes con compradores que valoran calidad y origen. Lista una vez y vende en el marketplace.',
        'Andertal collega seller indipendenti con acquirenti attenti a qualità e origine. Elenca una volta e vendi nel marketplace.',
      ),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
    }),

    // 5 Steps
    localize({
      id: randomUUID(), type: 'text_block', visible: true, visible_on: visibleOn, padding: pad,
    }, {
      title: value('Vom Konto zum ersten Verkauf.', 'From account to first sale.', 'Hesaptan ilk satışa.', 'Du compte à la première vente.', 'De la cuenta a la primera venta.', 'Dall’account alla prima vendita.'),
      body: value(
        '<ol><li><strong>Registrieren</strong> — Lege dein Verkäuferkonto in Sellercentral an — wenige Minuten, klare Angaben.</li><li><strong>Shop vorbereiten</strong> — Markeninfos, Standorte, Versandländer und Zahlungsdaten hinterlegen.</li><li><strong>Produkte listen</strong> — Varianten, Preise, Medien und Compliance-Felder pflegen — einzeln oder im Bulk.</li><li><strong>Verkaufen &amp; ausliefern</strong> — Bestellungen annehmen, versenden, Trackings setzen — Auszahlung folgt dem Prozess.</li></ol>',
        '<ol><li><strong>Register</strong> — Create your seller account in Sellercentral — minutes, not months.</li><li><strong>Prepare shop</strong> — Brand info, locations, shipping countries, and payout details.</li><li><strong>List products</strong> — Variants, prices, media, and compliance — one by one or in bulk.</li><li><strong>Sell &amp; ship</strong> — Accept orders, ship, set tracking — payout follows the process.</li></ol>',
        '<ol><li><strong>Kayıt</strong> — Sellercentral’de satıcı hesabı aç.</li><li><strong>Mağaza hazırlığı</strong> — Marka, lokasyon, kargo ve ödeme.</li><li><strong>Ürün listele</strong> — Varyant, fiyat, medya — tekli veya toplu.</li><li><strong>Sat ve gönder</strong> — Sipariş, kargo, takip — ödeme süreci.</li></ol>',
        '<ol><li><strong>Inscription</strong> — Créez votre compte vendeur dans Sellercentral.</li><li><strong>Préparer la boutique</strong> — Marque, lieux, pays d’expédition, paiements.</li><li><strong>Lister les produits</strong> — Variantes, prix, médias — unitaire ou bulk.</li><li><strong>Vendre &amp; expédier</strong> — Commandes, envoi, suivi — puis paiement.</li></ol>',
        '<ol><li><strong>Registro</strong> — Crea tu cuenta de vendedor en Sellercentral.</li><li><strong>Preparar tienda</strong> — Marca, ubicaciones, envío y pagos.</li><li><strong>Publicar productos</strong> — Variantes, precios, medios — uno a uno o en masa.</li><li><strong>Vender y enviar</strong> — Pedidos, envío, tracking — luego el pago.</li></ol>',
        '<ol><li><strong>Registrazione</strong> — Crea l’account seller in Sellercentral.</li><li><strong>Prepara lo shop</strong> — Brand, sedi, paesi di spedizione e pagamenti.</li><li><strong>Elenca prodotti</strong> — Varianti, prezzi, media — singoli o bulk.</li><li><strong>Vendi e spedisci</strong> — Ordini, spedizione, tracking — poi il pagamento.</li></ol>',
      ),
    }),

    // 6 Deep accordion
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Warum nicht nur einen eigenen Webshop?', 'Why not only my own webshop?', 'Neden sadece kendi mağazam?', 'Pourquoi pas seulement ma boutique?', '¿Por qué no solo mi tienda?', 'Perché non solo il mio shop?'), answer: value('Ein eigener Shop braucht Traffic. Andertal bringt Marketplace-Nachfrage, Kategorie-Sichtbarkeit und gemeinsame Infrastruktur — du konzentrierst dich auf Produkt und Fulfillment.', 'Your own shop needs traffic. Andertal brings marketplace demand, category visibility, and shared infrastructure — you focus on product and fulfillment.', 'Kendi mağaza trafik ister. Andertal talep, kategori görünürlüğü ve ortak altyapı getirir.', 'Votre boutique a besoin de trafic. Andertal apporte demande marketplace, visibilité et infrastructure.', 'Tu tienda necesita tráfico. Andertal aporta demanda, visibilidad e infraestructura.', 'Il tuo shop ha bisogno di traffico. Andertal porta domanda, visibilità e infrastruttura.') }),
        localize({}, { question: value('Behalte ich Kontrolle über Marke und Preise?', 'Do I keep control of brand and prices?', 'Marka ve fiyat kontrolü bende mi?', 'Est-ce que je garde marque et prix?', '¿Mantengo marca y precios?', 'Mantengo brand e prezzi?'), answer: value('Ja. Du steuerst Katalog, Preise, Lager und Versandregeln. Der Marketplace liefert die Bühne und die Bestellpipeline.', 'Yes. You control catalog, prices, stock, and shipping rules. The marketplace provides the stage and order pipeline.', 'Evet. Katalog, fiyat, stok ve kargo kuralları sende. Marketplace sahne ve sipariş hattını sağlar.', 'Oui. Vous pilotez catalogue, prix, stock et règles d’expédition. Le marketplace apporte la scène et le pipeline.', 'Sí. Controlas catálogo, precios, stock y envío. El marketplace da el escenario y el pipeline.', 'Sì. Controlli catalogo, prezzi, stock e spedizione. Il marketplace dà il palco e la pipeline.') }),
        localize({}, { question: value('Für wen ist Andertal geeignet?', 'Who is Andertal for?', 'Andertal kimler için?', 'Pour qui est Andertal?', '¿Para quién es Andertal?', 'Per chi è Andertal?'), answer: value('Für Marken, Händler und Hersteller, die EU-weit verkaufen wollen — vom Nischenprodukt bis zum Sortiment mit Varianten.', 'For brands, merchants, and makers who want to sell EU-wide — from niche SKUs to variant-rich catalogs.', 'AB çapında satmak isteyen marka, satıcı ve üreticiler için.', 'Pour marques, marchands et fabricants qui veulent vendre en UE.', 'Para marcas, comercios y makers que quieren vender en la UE.', 'Per brand, merchant e maker che vogliono vendere in UE.') }),
        localize({}, { question: value('Wie schnell kann ich live gehen?', 'How fast can I go live?', 'Ne kadar hızlı yayına çıkarım?', 'En combien de temps suis-je en ligne?', '¿Qué tan rápido salgo en vivo?', 'Quanto tempo per andare live?'), answer: value('Sobald Konto, Pflichtangaben und erste Produkte freigegeben sind. Viele Seller starten mit einem fokussierten Kernsortiment.', 'Once account, required details, and first products are approved. Many sellers start with a focused core assortment.', 'Hesap, zorunlu alanlar ve ilk ürünler onaylanınca. Çoğu seller odaklanmış çekirdek katalogla başlar.', 'Dès que compte, champs requis et premiers produits sont validés.', 'Cuando la cuenta, datos obligatorios y primeros productos estén listos.', 'Quando account, campi obbligatori e primi prodotti sono pronti.') }),
        localize({}, { question: value('Was passiert nach der Bestellung?', 'What happens after an order?', 'Siparişten sonra ne olur?', 'Que se passe-t-il après une commande?', '¿Qué pasa tras un pedido?', 'Cosa succede dopo un ordine?'), answer: value('Du siehst die Order in Sellercentral, erzeugst Lieferschein/Label-Flows nach Setup und aktualisierst den Versandstatus für den Kunden.', 'You see the order in Sellercentral, create packing/label flows per setup, and update shipping status for the customer.', 'Siparişi Sellercentral’de görür, etiket/sevkiyat akışını kullanır ve takip durumunu güncellersin.', 'Vous voyez la commande dans Sellercentral, générez les flux d’expédition et mettez à jour le statut.', 'Ves el pedido en Sellercentral, generas envío/etiqueta y actualizas el estado.', 'Vedi l’ordine in Sellercentral, generi flussi di spedizione e aggiorni lo stato.') }),
      ],
    }, {
      title: value('Was dich bei Andertal wirklich weiterbringt.', 'What actually moves the needle at Andertal.', 'Andertal’de seni gerçekten ileri taşıyanlar.', 'Ce qui fait vraiment avancer sur Andertal.', 'Lo que realmente impulsa en Andertal.', 'Cosa ti fa davvero avanzare su Andertal.'),
    }),

    // 7 Tabs
    localize({
      id: randomUUID(), type: 'tabs', visible: true, visible_on: visibleOn, padding: pad, style: 'pills',
      tabs: [
        localize({}, { label: value('Marke', 'Brand', 'Marka', 'Marque', 'Marca', 'Brand'), title: value('Marke mit eigener Story', 'Brand with its own story', 'Kendi hikâyesi olan marka', 'Marque avec sa propre histoire', 'Marca con su propia historia', 'Brand con la propria storia'), content: value('Baue Präsenz mit Markenseite, konsistentem Look und direkten Käuferbeziehungen — ohne die Marketplace-Reichweite zu verlieren.', 'Build presence with a brand page, consistent look, and direct buyer relationships — without losing marketplace reach.', 'Marka sayfası, tutarlı görünüm ve doğrudan alıcı ilişkileri — marketplace erişimini kaybetmeden.', 'Construisez une présence marque cohérente sans perdre la portée marketplace.', 'Construye presencia de marca coherente sin perder alcance del marketplace.', 'Costruisci presenza brand coerente senza perdere la portata marketplace.') }),
        localize({}, { label: value('Manufaktur', 'Maker', 'Üretici', 'Atelier', 'Maker', 'Maker'), title: value('Manufaktur & Produzent', 'Maker & producer', 'Üretici & manufaktör', 'Atelier & producteur', 'Maker y productor', 'Maker e produttore'), content: value('Liste handgemachte oder EU-gefertigte Produkte mit klarer Herkunft — Käufer suchen genau das.', 'List handcrafted or EU-made products with clear origin — buyers look for exactly that.', 'El yapımı veya AB menşeli ürünleri net kökenle listele — alıcılar bunu arıyor.', 'Listez des produits fabriqués en UE avec origine claire.', 'Lista productos hechos en la UE con origen claro.', 'Elenca prodotti UE con origine chiara.') }),
        localize({}, { label: value('Händler', 'Retailer', 'Satıcı', 'Revendeur', 'Comercio', 'Retailer'), title: value('Händler mit Sortiment', 'Merchant with assortment', 'Çeşitli satıcı', 'Revendeur avec assortiment', 'Comercio con surtido', 'Retailer con assortimento'), content: value('Skaliere Varianten, Lager und Mehrländer-Versand. Bulk-Uploads und Vorlagen halten Tempo.', 'Scale variants, stock, and multi-country shipping. Bulk uploads and templates keep the pace.', 'Varyant, stok ve çok ülke kargoyu ölçekle. Toplu yükleme ve şablonlar tempo tutar.', 'Scalez variantes, stock et expédition multi-pays avec imports bulk.', 'Escala variantes, stock y envío multi-país con cargas masivas.', 'Scala varianti, stock e spedizione multi-paese con upload bulk.') }),
      ],
    }, {
      title: value('Egal ob Marke, Manufaktur oder Händler.', 'Whether brand, maker, or merchant.', 'İster marka, ister üretici, ister satıcı.', 'Marque, atelier ou revendeur.', 'Marca, maker o comercio.', 'Brand, maker o merchant.'),
    }),

    // 8 Testimonials
    localize({
      id: randomUUID(), type: 'testimonials', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { quote: value('Endlich ein Marketplace, der sich wie ein richtiges Verkaufssystem anfühlt — nicht wie ein Basar.', 'Finally a marketplace that feels like a real sales system — not a bazaar.', 'Sonunda gerçek bir satış sistemi gibi hissettiren bir marketplace — pazar değil.', 'Enfin un marketplace qui ressemble à un vrai système de vente — pas un bazar.', 'Por fin un marketplace que se siente como un sistema de ventas — no un bazar.', 'Finalmente un marketplace che sembra un sistema di vendita — non un bazar.'), name: value('Lena M.', 'Lena M.', 'Lena M.', 'Lena M.', 'Lena M.', 'Lena M.'), role: value('Home & Living', 'Home & Living', 'Home & Living', 'Home & Living', 'Home & Living', 'Home & Living') }),
        localize({}, { quote: value('Sellercentral ist klar aufgebaut. Bestellungen und Versandstatus sind dort, wo sie sein müssen.', 'Sellercentral is clear. Orders and shipping status live where they should.', 'Sellercentral net. Sipariş ve kargo durumu olması gereken yerde.', 'Sellercentral est clair. Commandes et statut d’expédition au bon endroit.', 'Sellercentral es claro. Pedidos y estado de envío donde deben.', 'Sellercentral è chiaro. Ordini e stato spedizione dove devono.'), name: value('Marco R.', 'Marco R.', 'Marco R.', 'Marco R.', 'Marco R.', 'Marco R.'), role: value('Elektronik-Zubehör', 'Electronics accessories', 'Elektronik aksesuar', 'Accessoires électroniques', 'Accesorios electrónicos', 'Accessori elettronica') }),
        localize({}, { quote: value('Wir wollten EU-weit verkaufen, ohne fünf Shops zu pflegen. Andertal war der logische Schritt.', 'We wanted EU reach without five shops. Andertal was the logical step.', 'Beş mağaza yönetmeden AB’de satmak istedik. Andertal mantıklı adımdı.', 'Vendre en UE sans cinq boutiques. Andertal était l’étape logique.', 'Vender en la UE sin cinco tiendas. Andertal fue el paso lógico.', 'Vendere in UE senza cinque shop. Andertal era il passo logico.'), name: value('Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.', 'Sofia K.'), role: value('Beauty & Care', 'Beauty & Care', 'Beauty & Care', 'Beauty & Care', 'Beauty & Care', 'Beauty & Care') }),
      ],
    }, {
      title: value('Seller, die den Kanal ernst nehmen.', 'Sellers who take the channel seriously.', 'Kanalı ciddiye alan satıcılar.', 'Des vendeurs qui prennent le canal au sérieux.', 'Vendedores que se toman el canal en serio.', 'Seller che prendono sul serio il canale.'),
    }),

    // 9 Fees grid
    localize({
      id: randomUUID(), type: 'feature_grid', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({ icon: '0 €' }, { title: value('Shop eröffnen', 'Open a store', 'Mağaza aç', 'Ouvrir une boutique', 'Abrir tienda', 'Apri uno shop'), description: value('Registrierung und Start ohne Eintrittsgebühr.', 'Registration and start with no entry fee.', 'Kayıt ve başlangıç giriş ücreti olmadan.', 'Inscription et démarrage sans frais d’entrée.', 'Registro e inicio sin cuota de entrada.', 'Registrazione e avvio senza fee d’ingresso.') }),
        localize({ icon: 'Anteil' }, { title: value('pro Verkauf', 'per sale', 'satış başına', 'par vente', 'por venta', 'per vendita'), description: value('Marketplace-Gebühr erst, wenn Umsatz entsteht.', 'Marketplace fee only when revenue happens.', 'Marketplace ücreti yalnızca ciro oluşunca.', 'Frais marketplace seulement quand il y a du CA.', 'Comisión solo cuando hay ventas.', 'Fee marketplace solo quando c’è fatturato.') }),
        localize({ icon: 'Rhythmus' }, { title: value('Auszahlung', 'Payout', 'Ödeme', 'Paiement', 'Pago', 'Pagamento'), description: value('Nach Lieferung und klarer Freigabelogik.', 'After delivery and clear release logic.', 'Teslimat ve net serbest bırakma mantığından sonra.', 'Après livraison et logique de libération claire.', 'Tras entrega y lógica de liberación clara.', 'Dopo consegna e logica di sblocco chiara.') }),
      ],
    }, {
      title: value('Du verkaufst. Die Logik bleibt nachvollziehbar.', 'You sell. The logic stays readable.', 'Sen satarsın. Mantık okunabilir kalır.', 'Vous vendez. La logique reste lisible.', 'Tú vendes. La lógica sigue legible.', 'Tu vendi. La logica resta leggibile.'),
      subtitle: value('Keine Startgebühr fürs Eröffnen. Marketplace-Anteil und Auszahlungsrhythmus sind so gedacht, dass du planen kannst.', 'No opening fee. Marketplace share and payout rhythm are built so you can plan.', 'Açılış ücreti yok. Marketplace payı ve ödeme ritmi planlanabilir.', 'Pas de frais d’ouverture. Part et rythme de paiement pensés pour planifier.', 'Sin cuota de apertura. Comisión y ritmo de pago pensados para planificar.', 'Nessun costo di apertura. Quota e ritmo di pagamento pensati per pianificare.'),
    }),

    // 10 FAQ accordion
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Kostet die Registrierung etwas?', 'Does registration cost anything?', 'Kayıt ücretli mi?', 'L’inscription est-elle payante?', '¿Cuesta registrarse?', 'La registrazione costa?'), answer: value('Nein — du eröffnest den Shop ohne Startgebühr. Kosten entstehen im Verkaufskontext über die Marketplace-Logik.', 'No — you open a shop with no start fee. Costs arise in the sales context via marketplace logic.', 'Hayır — açılış ücreti yok. Maliyet satış bağlamında marketplace mantığıyla oluşur.', 'Non — ouverture sans frais de démarrage. Les coûts naissent à la vente.', 'No — sin cuota de inicio. Los costes surgen al vender.', 'No — nessuna fee di avvio. I costi nascono alla vendita.') }),
        localize({}, { question: value('Brauche ich ein Gewerbe?', 'Do I need a registered business?', 'İşletme gerekli mi?', 'Faut-il une entreprise?', '¿Necesito empresa?', 'Serve un’attività?'), answer: value('Für den Verkauf gelten die üblichen rechtlichen Anforderungen deines Landes (Gewerbe, Steuern, Produktsicherheit). Sellercentral führt dich durch die benötigten Angaben.', 'Usual legal requirements of your country apply (business, tax, product safety). Sellercentral guides the required details.', 'Ülkenin yasal gereksinimleri geçerlidir. Sellercentral gerekli alanlarda yol gösterir.', 'Les exigences légales de votre pays s’appliquent. Sellercentral guide les champs requis.', 'Aplican los requisitos legales de tu país. Sellercentral guía los datos necesarios.', 'Valgono i requisiti legali del tuo paese. Sellercentral guida i campi richiesti.') }),
        localize({}, { question: value('Kann ich in mehreren Sprachen verkaufen?', 'Can I sell in multiple languages?', 'Birden fazla dilde satabilir miyim?', 'Puis-je vendre en plusieurs langues?', '¿Puedo vender en varios idiomas?', 'Posso vendere in più lingue?'), answer: value('Ja. Produkte und Inhalte lassen sich mehrsprachig pflegen — der Shop bedient mehrere Locales.', 'Yes. Products and content can be maintained in multiple locales — the shop serves several languages.', 'Evet. Ürün ve içerikleri çok dilli yönetebilirsin.', 'Oui — contenus multilingues; la boutique sert plusieurs locales.', 'Sí — contenidos multilingües; la tienda sirve varios locales.', 'Sì — contenuti multilingue; lo shop serve più locale.') }),
        localize({}, { question: value('Wie funktionieren Auszahlungen?', 'How do payouts work?', 'Ödemeler nasıl?', 'Comment marchent les paiements?', '¿Cómo funcionan los pagos?', 'Come funzionano i pagamenti?'), answer: value('Nach erfolgreicher Lieferung greift die Freigabelogik; Auszahlungen folgen dem festgelegten Rhythmus. Details siehst du in den Seller-Einstellungen.', 'After successful delivery, release logic applies; payouts follow the set rhythm. Details live in seller settings.', 'Başarılı teslimattan sonra serbest bırakma; ödemeler ritme göre. Detaylar satıcı ayarlarında.', 'Après livraison réussie, logique de libération puis rythme de paiement.', 'Tras entrega exitosa, lógica de liberación y ritmo de pago.', 'Dopo consegna riuscita, logica di sblocco e ritmo di pagamento.') }),
        localize({}, { question: value('Gibt es Integrationen?', 'Are there integrations?', 'Entegrasyon var mı?', 'Y a-t-il des intégrations?', '¿Hay integraciones?', 'Ci sono integrazioni?'), answer: value('Sellercentral unterstützt gängige Seller-Workflows (u. a. Versand/ERP-Anbindungen je nach Setup). Starte lean und erweitere später.', 'Sellercentral supports common seller workflows (shipping/ERP per setup). Start lean and expand later.', 'Sellercentral yaygın satıcı akışlarını destekler. Sade başla, sonra genişlet.', 'Sellercentral prend en charge les workflows courants. Commencez lean, élargissez plus tard.', 'Sellercentral admite flujos habituales. Empieza lean y amplía luego.', 'Sellercentral supporta workflow comuni. Parti lean e amplia dopo.') }),
        localize({}, { question: value('Was, wenn ich Hilfe brauche?', 'What if I need help?', 'Yardım lazım olursa?', 'Et si j’ai besoin d’aide?', '¿Y si necesito ayuda?', 'E se mi serve aiuto?'), answer: value('Über Support-Prozesse und Sellercentral-Dokumentation kommst du an die nächsten Schritte — inklusive Fallbearbeitung für Kundenanliegen.', 'Support processes and Sellercentral docs get you to the next steps — including case handling for customer issues.', 'Destek süreçleri ve Sellercentral dokümanları sonraki adımları gösterir.', 'Support et documentation Sellercentral pour les prochaines étapes.', 'Soporte y docs de Sellercentral para los siguientes pasos.', 'Supporto e docs Sellercentral per i prossimi passi.') }),
      ],
    }, {
      title: value('Häufige Fragen vor der Registrierung.', 'Common questions before you register.', 'Kayıt öncesi sık sorulanlar.', 'Questions fréquentes avant inscription.', 'Preguntas frecuentes antes de registrarte.', 'Domande frequenti prima della registrazione.'),
    }),

    // 11 Tools mosaic
    localize({
      id: randomUUID(), type: 'content_mosaic', visible: true, visible_on: visibleOn, padding: pad,
      source: 'images',
      images: [
        { url: MOSAIC1 },
        { url: MOSAIC2 },
        { url: MOSAIC3 },
      ],
      btn_url: ctaUrl,
    }, {
      title: value('Alles, was du täglich brauchst — an einem Ort.', 'Everything you need daily — in one place.', 'Günlük ihtiyacın olan her şey — tek yerde.', 'Tout le quotidien — au même endroit.', 'Todo lo diario — en un solo lugar.', 'Tutto il quotidiano — in un solo posto.'),
      subtitle: value('Katalog, Bestellungen, Analytics, Inhalte und Einstellungen. Weniger Tab-Chaos, mehr Verkaufsflow.', 'Catalog, orders, analytics, content, and settings. Less tab chaos, more sales flow.', 'Katalog, sipariş, analitik, içerik ve ayarlar. Daha az sekme karmaşası, daha çok satış akışı.', 'Catalogue, commandes, analytics, contenu et réglages.', 'Catálogo, pedidos, analítica, contenido y ajustes.', 'Catalogo, ordini, analytics, contenuti e impostazioni.'),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller', 'Satıcı ol', 'Devenir vendeur', 'Hazte vendedor', 'Diventa venditore'),
    }),

    // 12 Ops accordion
    localize({
      id: randomUUID(), type: 'accordion', visible: true, visible_on: visibleOn, padding: pad,
      items: [
        localize({}, { question: value('Welche Produktangaben sind Pflicht?', 'Which product fields are required?', 'Hangi ürün alanları zorunlu?', 'Quels champs produit sont requis?', '¿Qué campos de producto son obligatorios?', 'Quali campi prodotto sono obbligatori?'), answer: value('Je nach Kategorie: Titel, Beschreibung, Preis, Medien, Varianten, EAN wo nötig sowie Compliance-Felder (z. B. Herkunft/Sicherheit). Das Formular zeigt, was fehlt.', 'Depending on category: title, description, price, media, variants, EAN where needed, plus compliance fields. The form shows what’s missing.', 'Kategoriye göre: başlık, açıklama, fiyat, medya, varyant, gerekirse EAN ve uyumluluk alanları.', 'Selon la catégorie: titre, description, prix, médias, variantes, EAN et conformité.', 'Según categoría: título, descripción, precio, medios, variantes, EAN y cumplimiento.', 'Secondo categoria: titolo, descrizione, prezzo, media, varianti, EAN e conformità.') }),
        localize({}, { question: value('Wie richte ich Versandländer ein?', 'How do I set shipping countries?', 'Kargo ülkelerini nasıl ayarlarım?', 'Comment configurer les pays d’expédition?', '¿Cómo configuro países de envío?', 'Come configuro i paesi di spedizione?'), answer: value('Unter Shipping/Locations legst du fest, wohin du lieferst und welche Adressen für Versand, Retoure und Rechnung gelten.', 'Under Shipping/Locations you set where you ship and which addresses apply for shipping, returns, and invoices.', 'Shipping/Locations altında nereye gönderdiğini ve adresleri ayarlarsın.', 'Dans Shipping/Locations vous définissez destinations et adresses.', 'En Shipping/Locations defines destinos y direcciones.', 'In Shipping/Locations imposti destinazioni e indirizzi.') }),
        localize({}, { question: value('Kann ich bestehende Produkte importieren?', 'Can I import existing products?', 'Mevcut ürünleri içe aktarabilir miyim?', 'Puis-je importer des produits existants?', '¿Puedo importar productos existentes?', 'Posso importare prodotti esistenti?'), answer: value('Ja — über Bulk-Upload und Vorlagen. Ideal, wenn du schon ein PIM oder Tabellenkatalog hast.', 'Yes — via bulk upload and templates. Ideal if you already have a PIM or spreadsheet catalog.', 'Evet — toplu yükleme ve şablonlarla. PIM veya tablo kataloğun varsa ideal.', 'Oui — import en masse et modèles.', 'Sí — carga masiva y plantillas.', 'Sì — upload bulk e template.') }),
        localize({}, { question: value('Wie sichtbar werde ich in Kategorien?', 'How visible will I be in categories?', 'Kategorilerde ne kadar görünür olurum?', 'Quelle visibilité dans les catégories?', '¿Qué visibilidad en categorías?', 'Quanto sono visibile nelle categorie?'), answer: value('Sichtbarkeit entsteht über Katalogqualität, Preise, Verfügbarkeit und Performance in der jeweiligen Kategorie — plus kuratierte Flächen im Marketplace.', 'Visibility comes from catalog quality, price, availability, and performance — plus curated marketplace surfaces.', 'Görünürlük katalog kalitesi, fiyat, stok ve performanstan — artı kurateli marketplace alanlarından gelir.', 'La visibilité vient de la qualité catalogue, prix, dispo et performance — plus surfaces curatées.', 'La visibilidad nace de calidad de catálogo, precio, stock y rendimiento — más superficies curadas.', 'La visibilità nasce da qualità catalogo, prezzo, disponibilità e performance — più superfici curate.') }),
        localize({}, { question: value('Was ist mit Retouren?', 'What about returns?', 'İadeler ne olacak?', 'Et les retours?', '¿Y las devoluciones?', 'E i resi?'), answer: value('Retouren laufen über klare Käufer- und Seller-Prozesse. Du hinterlegst Retourenadressen und bearbeitest Fälle im vorgesehenen Flow.', 'Returns run through clear buyer and seller processes. You set return addresses and handle cases in the intended flow.', 'İadeler net alıcı/satıcı süreçleriyle yürür. İade adreslerini girer, vakaları akışta işlersin.', 'Les retours suivent des flux acheteur/vendeur clairs.', 'Las devoluciones siguen flujos claros comprador/vendedor.', 'I resi seguono flussi acquirente/seller chiari.') }),
        localize({}, { question: value('Darf ich Team-Zugänge anlegen?', 'Can I create team access?', 'Takım erişimi açabilir miyim?', 'Puis-je créer des accès équipe?', '¿Puedo crear accesos de equipo?', 'Posso creare accessi team?'), answer: value('Rollen und Berechtigungen im Sellercentral erlauben Zusammenarbeit, ohne alles über ein Login zu teilen.', 'Roles and permissions in Sellercentral allow collaboration without sharing one login.', 'Sellercentral’de roller ve izinler — tek login paylaşmadan işbirliği.', 'Rôles et permissions dans Sellercentral pour collaborer sans un seul login.', 'Roles y permisos en Sellercentral para colaborar sin un solo login.', 'Ruoli e permessi in Sellercentral per collaborare senza un solo login.') }),
      ],
    }, {
      title: value('Noch Fragen zu Start, Versand und Compliance?', 'More questions on start, shipping, and compliance?', 'Başlangıç, kargo ve uyumluluk hakkında sorular?', 'Encore des questions sur démarrage, expédition et conformité?', '¿Más preguntas sobre inicio, envío y cumplimiento?', 'Altre domande su avvio, spedizione e conformità?'),
    }),

    // 13 Final CTA
    localize({
      id: randomUUID(), type: 'banner_cta', visible: true, visible_on: visibleOn,
      padding: pad, bg_color: '#0d1f1a', text_color: '#f4f1ea', btn_url: REGISTER.en,
    }, {
      title: value('Bereit, auf Andertal zu verkaufen?', 'Ready to sell on Andertal?', 'Andertal’de satmaya hazır mısın?', 'Prêt à vendre sur Andertal?', '¿Listo para vender en Andertal?', 'Pronto a vendere su Andertal?'),
      subtitle: value('Registriere dich jetzt. Richte deinen Shop ein. Liste dein erstes Produkt — und starte dort, wo Europa einkauft.', 'Register now. Set up your shop. List your first product — and start where Europe shops.', 'Şimdi kaydol. Mağazanı kur. İlk ürününü listele — Avrupa’nın alışveriş yaptığı yerde başla.', 'Inscrivez-vous. Configurez. Listez votre premier produit.', 'Regístrate. Configura. Publica tu primer producto.', 'Registrati. Configura. Elenca il primo prodotto.'),
      btn_text: value('Jetzt Verkäufer werden', 'Become a seller now', 'Şimdi satıcı ol', 'Devenir vendeur maintenant', 'Hazte vendedor ahora', 'Diventa venditore ora'),
    }),
  ].map((container) => ({
    ...container,
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

/** Full device stack written into admin_hub_landing_pages.containers */
function becomeSellerLandingContainers() {
  return ['desktop', 'tablet', 'mobile'].flatMap((visibleOn) => becomeSellerContainers(visibleOn))
}

/**
 * Ensures page `verkaeufer-werden` + landing containers exist / match layout version.
 * Reseeds when empty, missing, or layout !== LAYOUT_VERSION (v3 template migration).
 *
 * @returns {{ created: boolean, seeded: boolean, added: number, pageId?: string, skipped?: boolean }}
 */
async function ensureBecomeSellerLanding(client, opts = {}) {
  const dryRun = !!opts.dryRun
  const force = !!opts.force
  if (!client || typeof client.query !== 'function') {
    return { created: false, seeded: false, added: 0 }
  }

  await client.query('BEGIN')
  try {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'admin_hub_pages'
         AND column_name IN ('slug', 'handle')`
    )
    const pageColumns = new Set((columns.rows || []).map((row) => row.column_name))
    if (!pageColumns.has('slug')) throw new Error('admin_hub_pages.slug is required')

    const predicates = [`regexp_replace(slug, '^/+', '') = $1`]
    if (pageColumns.has('handle')) predicates.push(`regexp_replace(handle, '^/+', '') = $1`)

    let pageResult = await client.query(
      `SELECT id, slug FROM admin_hub_pages
       WHERE ${predicates.join(' OR ')}
       ORDER BY updated_at DESC LIMIT 1`,
      [PAGE_SLUG]
    )

    if (!pageResult.rows[0] && PAGE_ID) {
      pageResult = await client.query(
        `SELECT id, slug FROM admin_hub_pages WHERE id::text = $1 LIMIT 1`,
        [PAGE_ID]
      )
    }

    let createdPage = false
    if (!pageResult.rows[0]) {
      createdPage = true
      if (dryRun) {
        await client.query('ROLLBACK')
        return {
          created: false,
          seeded: false,
          added: 0,
          wouldCreate: true,
          wouldSeed: true,
        }
      }
      pageResult = await client.query(
        `INSERT INTO admin_hub_pages (title, slug, body, status, page_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, slug`,
        ['Verkäufer werden', PAGE_SLUG, '', 'published', 'page']
      )
    }

    const pageId = String(pageResult.rows[0].id)
    const landingResult = await client.query(
      'SELECT containers, settings FROM admin_hub_landing_pages WHERE page_id = $1 FOR UPDATE',
      [pageId]
    )
    const existing = Array.isArray(landingResult.rows[0]?.containers)
      ? landingResult.rows[0].containers
      : []
    const settings =
      landingResult.rows[0]?.settings && typeof landingResult.rows[0].settings === 'object'
        ? { ...landingResult.rows[0].settings }
        : {}
    const currentLayout = settings.become_seller_layout || ''
    const needsSeed =
      force ||
      createdPage ||
      !landingResult.rows[0] ||
      existing.length === 0 ||
      currentLayout !== LAYOUT_VERSION

    if (dryRun) {
      await client.query('ROLLBACK')
      return {
        created: false,
        seeded: false,
        added: 0,
        pageId,
        wouldCreate: createdPage,
        wouldSeed: needsSeed,
        currentLayout: currentLayout || '(none)',
        targetLayout: LAYOUT_VERSION,
        existingCount: existing.length,
      }
    }

    if (!needsSeed) {
      await client.query('ROLLBACK')
      return {
        created: false,
        seeded: false,
        added: existing.length,
        pageId,
        skipped: true,
        layout: currentLayout || LAYOUT_VERSION,
      }
    }

    const nextContainers = becomeSellerLandingContainers()
    settings.become_seller_layout = LAYOUT_VERSION

    if (landingResult.rows[0]) {
      await client.query(
        `UPDATE admin_hub_landing_pages
            SET containers = $2::jsonb, settings = $3::jsonb, updated_at = NOW()
          WHERE page_id = $1`,
        [pageId, JSON.stringify(nextContainers), JSON.stringify(settings)]
      )
    } else {
      await client.query(
        `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, NOW())`,
        [pageId, JSON.stringify(nextContainers), JSON.stringify(settings)]
      )
    }

    await client.query('COMMIT')
    return {
      created: createdPage,
      seeded: true,
      added: nextContainers.length,
      pageId,
      layout: LAYOUT_VERSION,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

module.exports = {
  LAYOUT_VERSION,
  PAGE_SLUG,
  PAGE_ID,
  becomeSellerContainers,
  becomeSellerLandingContainers,
  ensureBecomeSellerLanding,
  REGISTER,
}
