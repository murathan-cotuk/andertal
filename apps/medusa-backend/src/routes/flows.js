'use strict'
const { Router } = require('express')
const { resolveSmtpSenderIdentity } = require('../smtp-sender-resolve')

const getDbClient = () => {
  const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
  if (!dbUrl || !dbUrl.startsWith('postgres')) return null
  const { Client } = require('pg')
  const isRender = dbUrl.includes('render.com')
  return new Client({ connectionString: dbUrl, ssl: isRender ? { rejectUnauthorized: false } : false })
}

module.exports = function createFlowsRouter({ requireSuperuser, getSmtpTransport }) {
    // ── Automation flows (Content → Flows; superuser) ───────────────────────────
    /** Dokumentation + Testdaten für Flow-E-Mails; Platzhalter {KEY} (Groß/Klein egal) */
    const FLOW_MERGE_CATEGORY_LABELS = {
      en: {
        customer: 'Customer',
        order: 'Order & amounts',
        shipping: 'Shipping address',
        product_cart: 'Product & cart',
        shop: 'Shop & links',
        engagement: 'Reviews & loyalty',
      },
      de: {
        customer: 'Kunde',
        order: 'Bestellung & Beträge',
        shipping: 'Lieferadresse',
        product_cart: 'Produkt & Warenkorb',
        shop: 'Shop & Links',
        engagement: 'Bewertung & Bonus',
      },
      tr: {
        customer: 'Müşteri',
        order: 'Sipariş ve tutarlar',
        shipping: 'Teslimat adresi',
        product_cart: 'Ürün ve sepet',
        shop: 'Mağaza ve bağlantılar',
        engagement: 'Yorum ve sadakat',
      },
      fr: {
        customer: 'Client',
        order: 'Commande & montants',
        shipping: 'Adresse de livraison',
        product_cart: 'Produit & panier',
        shop: 'Boutique & liens',
        engagement: 'Avis & fidélité',
      },
      it: {
        customer: 'Cliente',
        order: 'Ordine & importi',
        shipping: 'Indirizzo di spedizione',
        product_cart: 'Prodotto & carrello',
        shop: 'Negozio & link',
        engagement: 'Recensioni & punti',
      },
      es: {
        customer: 'Cliente',
        order: 'Pedido e importes',
        shipping: 'Dirección de envío',
        product_cart: 'Producto y carrito',
        shop: 'Tienda y enlaces',
        engagement: 'Reseñas y puntos',
      },
    }
    const FLOW_MERGE_SYNTAX = {
      en: 'Use curly braces. Names are not case-sensitive — {FIRST_NAME}, {first_name}, and {Customer_Name} all work.',
      de: 'Geschweifte Klammern verwenden; Groß-/Kleinschreibung ist egal ({FIRST_NAME} = {first_name}).',
      tr: 'Süslü parantez kullanın; büyük/küçük harf duyarlı değildir ({FIRST_NAME} = {first_name}).',
      fr: 'Accolades ; la casse est ignorée ({FIRST_NAME} = {first_name}).',
      it: 'Parentesi graffe ; maiuscole/minuscole equivalenti ({FIRST_NAME} = {first_name}).',
      es: 'Llaves ; mayúsculas/minúsculas equivalen ({FIRST_NAME} = {first_name}).',
    }
    const FLOW_MERGE_FIELDS = [
      {
        key: 'CUSTOMER_NAME',
        sample: 'Jane Doe',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Full name (first + last)',
          de: 'Vollständiger Name',
          tr: 'Ad soyad',
          fr: 'Nom complet',
          it: 'Nome completo',
          es: 'Nombre completo',
        },
      },
      {
        key: 'CUSTOMER',
        sample: 'Jane Doe',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Alias for customer display name',
          de: 'Alias für Anzeigename',
          tr: 'Müşteri görünen adı (alias)',
          fr: 'Alias du nom affiché',
          it: 'Alias nome visualizzato',
          es: 'Alias del nombre mostrado',
        },
      },
      {
        key: 'FIRST_NAME',
        sample: 'Jane',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'First name', de: 'Vorname', tr: 'Ad', fr: 'Prénom', it: 'Nome', es: 'Nombre' },
      },
      {
        key: 'LAST_NAME',
        sample: 'Doe',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Last name', de: 'Nachname', tr: 'Soyad', fr: 'Nom', it: 'Cognome', es: 'Apellido' },
      },
      {
        key: 'EMAIL',
        sample: 'customer@example.com',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Email address', de: 'E-Mail-Adresse', tr: 'E-posta', fr: 'E-mail', it: 'Email', es: 'Correo' },
      },
      {
        key: 'PHONE',
        sample: '+49 30 1234567',
        category: 'customer',
        triggers: ['*'],
        desc: { en: 'Phone if known', de: 'Telefon falls bekannt', tr: 'Telefon (varsa)', fr: 'Téléphone', it: 'Telefono', es: 'Teléfono' },
      },
      {
        key: 'GENDER',
        sample: 'female',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Raw gender from profile (if set)',
          de: 'Geschlecht aus dem Profil (falls gesetzt)',
          tr: 'Profildeki cinsiyet (varsa)',
          fr: 'Genre du profil',
          it: 'Genere dal profilo',
          es: 'Género del perfil',
        },
      },
      {
        key: 'GREETING_DE',
        sample: 'Sehr geehrte Frau',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Formal German greeting line (from gender when set)',
          de: 'Deutsche Anrede nach Geschlecht',
          tr: 'Almanca hitap satırı (cinsiyete göre)',
          fr: 'Formule allemande selon le genre',
          it: 'Formula tedesca in base al genere',
          es: 'Saludo formal DE según género',
        },
      },
      {
        key: 'GREETING_EN',
        sample: 'Dear Ms.',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'English greeting prefix from gender',
          de: 'Englische Anrede nach Geschlecht',
          tr: 'İngilizce hitap (cinsiyete göre)',
          fr: 'Formule anglaise selon le genre',
          it: 'Formula inglese',
          es: 'Saludo EN según género',
        },
      },
      {
        key: 'GREETING_TR',
        sample: 'Sayın Bayan',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'Turkish greeting from gender',
          de: 'Türkische Anrede nach Geschlecht',
          tr: 'Türkçe hitap (cinsiyete göre)',
          fr: 'Formule turque selon le genre',
          it: 'Formula turca',
          es: 'Saludo TR según género',
        },
      },
      {
        key: 'SALUTATION_DE',
        sample: 'Frau',
        category: 'customer',
        triggers: ['*'],
        desc: {
          en: 'German title only (Herr/Frau)',
          de: 'Anrede Kurzform',
          tr: 'Almanca unvan (Bay/Bayan)',
          fr: 'Civilité courte DE',
          it: 'Titolo DE',
          es: 'Tratamiento DE',
        },
      },
      {
        key: 'SHIP_DATE',
        sample: '24.07.2026',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Date the order was marked as shipped',
          de: 'Versanddatum',
          tr: 'Kargoya verilme tarihi',
          fr: 'Date d\'expédition',
          it: 'Data di spedizione',
          es: 'Fecha de envío',
        },
      },
      {
        key: 'TRACKING_NUMBER',
        sample: '1Z999AA10123456784',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Carrier tracking number when shipped',
          de: 'Sendungsnummer (Versand)',
          tr: 'Kargo takip numarası',
          fr: 'Numéro de suivi',
          it: 'Numero di tracking',
          es: 'Número de seguimiento',
        },
      },
      {
        key: 'CARRIER_NAME',
        sample: 'DHL',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Shipping carrier name',
          de: 'Versanddienst',
          tr: 'Kargo firması',
          fr: 'Transporteur',
          it: 'Corriere',
          es: 'Transportista',
        },
      },
      {
        key: 'TRACKING_URL',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Carrier tracking web URL when number + carrier are known',
          de: 'Tracking-Link (bekannte Carrier)',
          tr: 'Kargo takip linki',
          fr: 'Lien de suivi transporteur',
          it: 'URL tracking corriere',
          es: 'URL seguimiento del transportista',
        },
      },
      {
        key: 'TRACKING_LINK',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered'],
        desc: {
          en: 'Alias of TRACKING_URL',
          de: 'Alias für TRACKING_URL',
          tr: 'TRACKING_URL ile aynı',
          fr: 'Alias de TRACKING_URL',
          it: 'Alias di TRACKING_URL',
          es: 'Alias de TRACKING_URL',
        },
      },
      {
        key: 'SENDUNGSVERFOLGUNG_URL',
        sample: 'https://www.dhl.de/…',
        category: 'shipping',
        triggers: ['order_shipped', 'order_delivered', 'order_placed'],
        desc: {
          en: 'Tracking URL if known; otherwise falls back to ORDER_DETAIL_URL',
          de: 'Sendungsverfolgung; sonst Link zur Bestellung',
          tr: 'Takip varsa takip linki, yoksa sipariş detayı',
          fr: 'Suivi ou page commande',
          it: 'Tracking o dettaglio ordine',
          es: 'Seguimiento o detalle del pedido',
        },
      },
      {
        key: 'MY_ORDERS_URL',
        sample: 'https://shop.example.com/de/de/orders',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Orders page with market/language prefix (/country/lang/orders). Override links via STOREFRONT_EMAIL_MARKET / STOREFRONT_EMAIL_LANG if needed.',
          de: 'Bestellübersicht mit Markt-/Sprachpräfix. Optional Env STOREFRONT_EMAIL_MARKET / STOREFRONT_EMAIL_LANG.',
          tr: 'Siparişler sayfası (ülke/dil önekli). Env ile özelleştirilebilir.',
          fr: 'Page commandes avec préfixe marché/langue.',
          it: 'Pagina ordini con prefisso paese/lingua.',
          es: 'Pedidos con prefijo mercado/idioma.',
        },
      },
      {
        key: 'ORDER_DETAIL_URL',
        sample: 'https://shop.example.com/de/de/order/550e8400-e29b-41d4-a716-446655440000',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Direct link to this order’s detail page (uses ORDER_UUID)',
          de: 'Direktlink zur Bestellansicht (UUID in der URL)',
          tr: 'Bu siparişin detay sayfası',
          fr: 'Lien direct vers le détail de la commande',
          it: 'Link diretto al dettaglio ordine',
          es: 'Enlace al detalle del pedido',
        },
      },
      {
        key: 'ACCOUNT_URL',
        sample: 'https://shop.example.com/de/de/account',
        category: 'shop',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Customer account / profile page',
          de: 'Kundenkonto / Profil',
          tr: 'Müşteri hesabı',
          fr: 'Page compte client',
          it: 'Pagina account cliente',
          es: 'Cuenta del cliente',
        },
      },
      {
        key: 'SHOP_HOME_URL',
        sample: 'https://shop.example.com/de/de/',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Storefront home with market & language prefix (use instead of SITE_URL + manual /de)',
          de: 'Shop-Startseite mit Markt-/Sprachpräfix',
          tr: 'Mağaza ana sayfası (ülke/dil önekli)',
          fr: 'Accueil boutique avec préfixe',
          it: 'Home negozio con prefisso',
          es: 'Inicio de la tienda con prefijo',
        },
      },
      {
        key: 'UNSUBSCRIBE_URL',
        sample: 'https://shop.example.com/de/newsletter/unsubscribe?token=…',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'One-click newsletter unsubscribe link (tokenized; marks subscriber unsubscribed)',
          de: 'Ein-Klick Newsletter-Abmeldung (Token; setzt Status auf abgemeldet)',
          tr: 'Tek tıkla bülten abonelik iptali (token; status=unsubscribed)',
          fr: 'Lien de désabonnement newsletter (token)',
          it: 'Link disiscrizione newsletter (token)',
          es: 'Enlace de baja del boletín (token)',
        },
      },
      {
        key: 'LOGIN_URL',
        sample: 'https://shop.example.com/de/de/login',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Shop login page (/market/lang/login)',
          de: 'Shop-Login',
          tr: 'Mağaza giriş sayfası',
          fr: 'Connexion boutique',
          it: 'Login negozio',
          es: 'Inicio de sesión tienda',
        },
      },
      {
        key: 'REGISTER_URL',
        sample: 'https://shop.example.com/de/de/register',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Shop registration page',
          de: 'Shop-Registrierung',
          tr: 'Kayıt sayfası',
          fr: 'Inscription boutique',
          it: 'Registrazione',
          es: 'Registro tienda',
        },
      },
      {
        key: 'IMPRESSUM_URL',
        sample: 'https://shop.example.com/de/de/impressum',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Legal imprint page URL',
          de: 'Impressum-URL',
          tr: 'Künye sayfası',
          fr: 'Page mentions légales',
          it: 'Pagina imprint',
          es: 'Aviso legal',
        },
      },
      {
        key: 'DATENSCHUTZ_URL',
        sample: 'https://shop.example.com/de/de/datenschutz',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Privacy policy page URL',
          de: 'Datenschutz-URL',
          tr: 'Gizlilik sayfası',
          fr: 'Politique de confidentialité',
          it: 'Privacy',
          es: 'Privacidad',
        },
      },
      {
        key: 'MARKET_COUNTRY',
        sample: 'DE',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Market segment used in storefront URLs (from shipping country, ISO2)',
          de: 'Marktsegment in der URL (aus Lieferland)',
          tr: 'URL pazar ülkesi (ISO2)',
          fr: 'Code pays marché (URL)',
          it: 'Paese mercato negli URL',
          es: 'País de mercado en URL',
        },
      },
      {
        key: 'STOREFRONT_LOCALE',
        sample: 'de',
        category: 'shop',
        triggers: ['*'],
        desc: {
          en: 'Language segment in storefront URLs (de/en/tr/fr/it/es)',
          de: 'Sprachsegment in Shop-URLs',
          tr: 'URL dil kodu',
          fr: 'Langue dans l’URL',
          it: 'Lingua nell’URL',
          es: 'Idioma en la URL',
        },
      },
      {
        key: 'ORDER_UUID',
        sample: '550e8400-e29b-41d4-a716-446655440000',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'Internal order UUID (not the display order number)',
          de: 'Interne Bestell-UUID',
          tr: 'Sipariş UUID',
          fr: 'UUID commande interne',
          it: 'UUID ordine',
          es: 'UUID interno del pedido',
        },
      },
      {
        key: 'ORDER_NUMBER',
        sample: '10042',
        category: 'order',
        triggers: ['order_placed', 'order_delivered', 'order_shipped', 'review_request', 'win_back'],
        desc: {
          en: 'Human-readable order number',
          de: 'Bestellnummer (anzeige)',
          tr: 'Sipariş numarası',
          fr: 'Numéro de commande',
          it: 'Numero ordine',
          es: 'Número de pedido',
        },
      },
      {
        key: 'ORDER_ID',
        sample: '10042',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Same as order number in most cases', de: 'Meist wie Bestellnummer', tr: 'Genelde sipariş no ile aynı', fr: 'Souvent = numéro', it: 'Spesso = numero', es: 'A menudo = número' },
      },
      {
        key: 'ORDER_DATE',
        sample: '29.04.2026',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Order date (localized)', de: 'Bestelldatum', tr: 'Sipariş tarihi', fr: 'Date', it: 'Data', es: 'Fecha' },
      },
      {
        key: 'ORDER_TOTAL',
        sample: '89,99 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Grand total formatted', de: 'Gesamtbetrag formatiert', tr: 'Toplam (biçimli)', fr: 'Total formaté', it: 'Totale formattato', es: 'Total formateado' },
      },
      {
        key: 'ORDER_SUBTOTAL',
        sample: '79,99 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Subtotal before shipping', de: 'Zwischensumme', tr: 'Ara toplam', fr: 'Sous-total', it: 'Subtotale', es: 'Subtotal' },
      },
      {
        key: 'ORDER_SHIPPING',
        sample: '5,00 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Shipping cost', de: 'Versandkosten', tr: 'Kargo ücreti', fr: 'Frais de port', it: 'Spedizione', es: 'Envío' },
      },
      {
        key: 'ORDER_DISCOUNT',
        sample: '10,00 €',
        category: 'order',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Discount amount if any', de: 'Rabattbetrag', tr: 'İndirim tutarı', fr: 'Remise', it: 'Sconto', es: 'Descuento' },
      },
      {
        key: 'ORDER_CURRENCY',
        sample: 'EUR',
        category: 'order',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back', 'abandoned_cart'],
        desc: { en: 'Currency code', de: 'Währungscode', tr: 'Para birimi', fr: 'Devise', it: 'Valuta', es: 'Moneda' },
      },
      {
        key: 'PAYMENT_METHOD',
        sample: 'Card',
        category: 'order',
        triggers: ['order_placed', 'order_delivered'],
        desc: { en: 'Payment method label', de: 'Zahlungsart', tr: 'Ödeme yöntemi', fr: 'Paiement', it: 'Pagamento', es: 'Pago' },
      },
      {
        key: 'SHIPPING_FULL_NAME',
        sample: 'Jane Doe',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Recipient name on shipping', de: 'Empfängername', tr: 'Teslimat adı', fr: 'Destinataire', it: 'Destinatario', es: 'Destinatario' },
      },
      {
        key: 'ADDRESS_LINE1',
        sample: 'Musterstraße 1',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Street line 1', de: 'Straße Zeile 1', tr: 'Adres satırı 1', fr: 'Ligne 1', it: 'Riga 1', es: 'Línea 1' },
      },
      {
        key: 'ADDRESS_LINE2',
        sample: '—',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Street line 2 / apt', de: 'Adresszusatz', tr: 'Adres 2', fr: 'Ligne 2', it: 'Riga 2', es: 'Línea 2' },
      },
      {
        key: 'CITY',
        sample: 'Berlin',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'City', de: 'Stadt', tr: 'Şehir', fr: 'Ville', it: 'Città', es: 'Ciudad' },
      },
      {
        key: 'POSTAL_CODE',
        sample: '10115',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'ZIP / postal code', de: 'PLZ', tr: 'Posta kodu', fr: 'Code postal', it: 'CAP', es: 'CP' },
      },
      {
        key: 'ZIP_CODE',
        sample: '10115',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Alias for POSTAL_CODE', de: 'Alias für PLZ', tr: 'POSTAL_CODE ile aynı', fr: '= code postal', it: '= CAP', es: '= CP' },
      },
      {
        key: 'COUNTRY',
        sample: 'DE',
        category: 'shipping',
        triggers: ['order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'Country code', de: 'Land', tr: 'Ülke kodu', fr: 'Pays', it: 'Paese', es: 'País' },
      },
      {
        key: 'PRODUCT',
        sample: 'Sample Product',
        category: 'product_cart',
        triggers: ['*'],
        desc: { en: 'Primary product title', de: 'Produkttitel', tr: 'Ürün adı', fr: 'Produit', it: 'Prodotto', es: 'Producto' },
      },
      {
        key: 'PRODUCT_NAME',
        sample: 'Sample Product',
        category: 'product_cart',
        triggers: ['*'],
        desc: { en: 'Alias of PRODUCT', de: 'Alias für Produktname', tr: 'PRODUCT ile aynı', fr: '= produit', it: '= nome', es: '= nombre' },
      },
      {
        key: 'PRODUCT_SKU',
        sample: 'SKU-DEMO-1',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: { en: 'SKU when available', de: 'SKU falls vorhanden', tr: 'SKU', fr: 'SKU', it: 'SKU', es: 'SKU' },
      },
      {
        key: 'PRODUCT_URL',
        sample: 'https://shop.example.com/de/de/produkt/sample-product',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_delivered', 'review_request', 'win_back'],
        desc: {
          en: 'First order line / cart primary product page (/produkt/{handle})',
          de: 'Produktlink erste Position (/produkt/{handle})',
          tr: 'İlk ürün satırının ürün sayfası',
          fr: 'Lien produit (1ère ligne)',
          it: 'Link primo articolo',
          es: 'URL del primer artículo',
        },
      },
      {
        key: 'CART_URL',
        sample: 'https://shop.example/checkout?cart=…',
        category: 'product_cart',
        triggers: ['abandoned_cart'],
        desc: {
          en: 'Recovery link to cart / checkout',
          de: 'Link zurück zum Warenkorb',
          tr: 'Sepete dönüş bağlantısı',
          fr: 'Lien panier',
          it: 'Link carrello',
          es: 'Enlace carrito',
        },
      },
      {
        key: 'CHECKOUT_URL',
        sample: 'https://shop.example/checkout',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed'],
        desc: { en: 'Checkout URL', de: 'Checkout-URL', tr: 'Ödeme URL', fr: 'URL paiement', it: 'Checkout', es: 'Checkout' },
      },
      {
        key: 'LINE_ITEMS_SUMMARY',
        sample: '2 Artikel · 79,99 €',
        category: 'product_cart',
        triggers: ['abandoned_cart', 'order_placed', 'order_shipped', 'order_delivered'],
        desc: {
          en: 'Short cart/order lines summary',
          de: 'Kurze Positionsübersicht',
          tr: 'Satır özeti',
          fr: 'Résumé lignes',
          it: 'Riepilogo righe',
          es: 'Resumen líneas',
        },
      },
      {
        key: 'PRODUCT_IMAGE',
        sample: 'https://shop.example/uploads/media/product.jpg',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'abandoned_cart'],
        desc: {
          en: 'Thumbnail URL of the first ordered product',
          de: 'Bild-URL des ersten Produkts',
          tr: 'İlk ürünün görseli (URL)',
          fr: 'Image du premier produit',
          it: 'Immagine primo prodotto',
          es: 'Imagen primer producto',
        },
      },
      {
        key: 'PRODUCT_IMAGE_HTML',
        sample: '<img src="https://shop.example/uploads/media/product.jpg" alt="Produkt" style="max-width:200px;width:100%;height:auto;display:block;border-radius:6px;" />',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request', 'abandoned_cart'],
        desc: {
          en: 'Ready-to-use <img> tag of the first ordered product (embed directly in email body)',
          de: 'Fertiges <img>-Tag des ersten Produktbilds (direkt in E-Mail-Text einfügen)',
          tr: 'İlk ürünün görseli – e-posta gövdesine doğrudan eklenebilen <img> etiketi',
          fr: 'Balise <img> prête à l\'emploi de la première image produit',
          it: 'Tag <img> pronto per il corpo e-mail del primo prodotto',
          es: 'Etiqueta <img> lista para insertar en el cuerpo del email del primer producto',
        },
      },
      {
        key: 'ORDER_ITEMS_HTML',
        sample: '<table>…</table>',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered', 'review_request'],
        desc: {
          en: 'HTML table of all ordered items (image, name, qty, price)',
          de: 'HTML-Tabelle aller Bestellpositionen (Bild, Name, Menge, Preis)',
          tr: 'Tüm sipariş kalemlerinin HTML tablosu (görsel, isim, miktar, fiyat)',
          fr: 'Tableau HTML des articles commandés',
          it: 'Tabella HTML degli articoli ordinati',
          es: 'Tabla HTML de artículos del pedido',
        },
      },
      {
        key: 'ITEM_1_NAME',
        sample: 'Produkt A',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Name of order item 1', de: 'Name von Artikel 1', tr: '1. ürün adı', fr: 'Nom article 1', it: 'Nome articolo 1', es: 'Nombre artículo 1' },
      },
      {
        key: 'ITEM_1_IMAGE',
        sample: 'https://shop.example/uploads/media/a.jpg',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Thumbnail URL of item 1', de: 'Bild-URL Artikel 1', tr: '1. ürün görseli', fr: 'Image article 1', it: 'Immagine articolo 1', es: 'Imagen artículo 1' },
      },
      {
        key: 'ITEM_1_QUANTITY',
        sample: '2',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Quantity of item 1', de: 'Menge Artikel 1', tr: '1. ürün adedi', fr: 'Quantité article 1', it: 'Quantità articolo 1', es: 'Cantidad artículo 1' },
      },
      {
        key: 'ITEM_1_PRICE',
        sample: '29,99 €',
        category: 'product_cart',
        triggers: ['order_placed', 'order_shipped', 'order_delivered'],
        desc: { en: 'Unit price of item 1', de: 'Einzelpreis Artikel 1', tr: '1. ürün birim fiyatı', fr: 'Prix unitaire article 1', it: 'Prezzo unitario articolo 1', es: 'Precio unitario artículo 1' },
      },
      {
        key: 'STORE_NAME',
        sample: 'Your Store',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Shop / seller display name', de: 'Shop-Name', tr: 'Mağaza adı', fr: 'Nom boutique', it: 'Nome negozio', es: 'Nombre tienda' },
      },
      {
        key: 'SHOP_NAME',
        sample: 'Your Store',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Alias for STORE_NAME', de: 'Alias Shop-Name', tr: 'STORE_NAME ile aynı', fr: '= boutique', it: '= negozio', es: '= tienda' },
      },
      {
        key: 'SITE_URL',
        sample: 'https://shop.example',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Storefront base URL', de: 'Shop-Basis-URL', tr: 'Mağaza ana URL', fr: 'URL boutique', it: 'URL sito', es: 'URL tienda' },
      },
      {
        key: 'SUPPORT_EMAIL',
        sample: 'support@example.com',
        category: 'shop',
        triggers: ['*'],
        desc: { en: 'Support / contact email', de: 'Support-E-Mail', tr: 'Destek e-postası', fr: 'E-mail support', it: 'Supporto', es: 'Soporte' },
      },
      {
        key: 'REVIEW_LINK',
        sample: 'https://shop.example/review?token=…',
        category: 'engagement',
        triggers: ['review_request', 'order_delivered'],
        desc: { en: 'Link to leave a review', de: 'Link zur Bewertung', tr: 'Yorum linki', fr: 'Lien avis', it: 'Link recensione', es: 'Enlace reseña' },
      },
      {
        key: 'BONUS_POINTS_BALANCE',
        sample: '120',
        category: 'engagement',
        triggers: ['*'],
        desc: {
          en: 'Bonus points balance if known',
          de: 'Bonuspunkte-Stand',
          tr: 'Bonus puan bakiyesi',
          fr: 'Points fidélité',
          it: 'Punti bonus',
          es: 'Puntos bonus',
        },
      },
      {
        key: 'MESSAGE_BODY',
        sample: 'Hello, when will my order ship?',
        category: 'messaging',
        triggers: ['customer_message_sent', 'seller_new_customer_message', 'customer_message_replied', 'seller_support_ticket_sent', 'seller_support_ticket_replied'],
        desc: {
          en: 'The message text (HTML, line breaks preserved)',
          de: 'Nachrichtentext (HTML, Zeilenumbrüche erhalten)',
          tr: 'Mesaj metni (HTML, satır sonları korunur)',
          fr: 'Texte du message (HTML, sauts de ligne conservés)',
          it: 'Testo del messaggio (HTML, a capo mantenuti)',
          es: 'Texto del mensaje (HTML, saltos de línea conservados)',
        },
      },
      {
        key: 'MESSAGE_SUBJECT',
        sample: 'Question about my order',
        category: 'messaging',
        triggers: ['customer_message_sent', 'seller_new_customer_message', 'customer_message_replied', 'seller_support_ticket_sent', 'seller_support_ticket_replied'],
        desc: {
          en: 'The message subject, if one was given',
          de: 'Nachrichtenbetreff, falls angegeben',
          tr: 'Mesaj konusu (varsa)',
          fr: 'Objet du message, si renseigné',
          it: 'Oggetto del messaggio, se indicato',
          es: 'Asunto del mensaje, si se indicó',
        },
      },
      {
        key: 'SELLER_NAME',
        sample: 'Andertal Shop',
        category: 'messaging',
        triggers: ['customer_message_sent', 'seller_new_customer_message', 'customer_message_replied'],
        desc: {
          en: "The seller's store name",
          de: 'Shop-Name des Sellers',
          tr: 'Satıcının mağaza adı',
          fr: 'Nom de la boutique du vendeur',
          it: 'Nome del negozio del seller',
          es: 'Nombre de la tienda del vendedor',
        },
      },
      {
        key: 'CUSTOMER_EMAIL',
        sample: 'jane@example.com',
        category: 'messaging',
        triggers: ['customer_message_sent', 'seller_new_customer_message'],
        desc: {
          en: "The customer's email address",
          de: 'E-Mail-Adresse des Kunden',
          tr: 'Müşterinin e-posta adresi',
          fr: "Adresse e-mail du client",
          it: "Indirizzo email del cliente",
          es: 'Correo electrónico del cliente',
        },
      },
      {
        key: 'SHOP_MESSAGES_URL',
        sample: 'https://www.andertal.com/nachrichten',
        category: 'messaging',
        triggers: ['customer_message_sent', 'customer_message_replied'],
        desc: {
          en: 'Link to the customer\'s messages page in the shop',
          de: 'Link zur Nachrichtenseite des Kunden im Shop',
          tr: 'Müşterinin mağazadaki mesajlar sayfasına link',
          fr: 'Lien vers la page messages du client dans la boutique',
          it: 'Link alla pagina messaggi del cliente nel negozio',
          es: 'Enlace a la página de mensajes del cliente en la tienda',
        },
      },
      {
        key: 'SELLERCENTRAL_INBOX_URL',
        sample: 'https://sellercentral.andertal.com/de/inbox',
        category: 'messaging',
        triggers: ['seller_new_customer_message', 'seller_support_ticket_sent', 'seller_support_ticket_replied'],
        desc: {
          en: "Link to the seller's Sellercentral inbox",
          de: 'Link zum Sellercentral-Posteingang',
          tr: 'Sellercentral gelen kutusuna link',
          fr: 'Lien vers la boîte de réception Sellercentral',
          it: 'Link alla posta in arrivo di Sellercentral',
          es: 'Enlace a la bandeja de entrada de Sellercentral',
        },
      },
      {
        key: 'RETURN_NUMBER',
        sample: '200042',
        category: 'order',
        triggers: ['return_requested'],
        desc: {
          en: 'Return request number',
          de: 'Retouren-Nummer',
          tr: 'İade talep numarası',
          fr: 'Numéro de retour',
          it: 'Numero di reso',
          es: 'Número de devolución',
        },
      },
      {
        key: 'RETURN_REASON',
        sample: 'Größe passt nicht',
        category: 'order',
        triggers: ['return_requested'],
        desc: {
          en: 'Reason the customer gave for the return',
          de: 'Vom Kunden angegebener Retourengrund',
          tr: 'Müşterinin belirttiği iade nedeni',
          fr: 'Motif de retour indiqué par le client',
          it: 'Motivo del reso indicato dal cliente',
          es: 'Motivo de la devolución indicado por el cliente',
        },
      },
      {
        key: 'RETURN_LABEL_URL',
        sample: 'https://panel.sendcloud.sc/…/label.pdf',
        category: 'order',
        triggers: ['return_requested'],
        desc: {
          en: 'Direct link to the auto-generated DHL return label PDF (also available as the return_label_pdf attachment)',
          de: 'Direktlink zum automatisch erstellten DHL-Retourenetikett (auch als Anhang return_label_pdf verfügbar)',
          tr: 'Otomatik oluşturulan DHL iade etiketi PDF linki (return_label_pdf eki olarak da mevcut)',
          fr: 'Lien direct vers l\'étiquette de retour DHL générée automatiquement (aussi disponible en pièce jointe return_label_pdf)',
          it: 'Link diretto all\'etichetta di reso DHL generata automaticamente (disponibile anche come allegato return_label_pdf)',
          es: 'Enlace directo a la etiqueta de devolución DHL generada automáticamente (también disponible como adjunto return_label_pdf)',
        },
      },
      {
        key: 'RETURN_TRACKING_NUMBER',
        sample: '00340001234567890123',
        category: 'order',
        triggers: ['return_requested'],
        desc: {
          en: 'DHL tracking number for the return shipment',
          de: 'DHL-Sendungsnummer der Rücksendung',
          tr: 'İade kargosu için DHL takip numarası',
          fr: 'Numéro de suivi DHL du retour',
          it: 'Numero di tracciamento DHL del reso',
          es: 'Número de seguimiento DHL de la devolución',
        },
      },
    ]
    const FLOW_EMAIL_SAMPLE_PLACEHOLDERS = (() => {
      const o = {}
      for (const f of FLOW_MERGE_FIELDS) {
        const k = String(f.key)
        const sample = f.sample != null && f.sample !== '' ? String(f.sample) : '—'
        o[k] = sample
        o[k.toUpperCase()] = sample
        o[k.toLowerCase()] = sample
      }
      return o
    })()
    const applyFlowEmailPlaceholders = (template, extra = {}) => {
      if (template == null) return ''
      return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, rawKey) => {
        const keyUp = String(rawKey).toUpperCase()
        // Prefer a real value from `extra` (customer/order data) — even when it's an empty
        // string (e.g. SHIP_DATE/TRACKING_NUMBER before an order has shipped), that IS the
        // authoritative "what a real send would show" (blank), so it must win over the sample.
        // Previously an empty real value fell through to the raw-token branch below, which made
        // known tokens like {SHIP_DATE}/{TRACKING_NUMBER} render as literal text in test emails
        // for any customer whose latest order hadn't shipped yet.
        const fromExtra = extra[keyUp] ?? extra[String(rawKey)] ?? extra[rawKey]
        if (fromExtra != null) return String(fromExtra).trim()
        // No real data available (no customer picked, or field not part of order/customer data) —
        // fall back to a representative sample, or leave the raw {TOKEN} visible as a hint when
        // even the sample map doesn't recognize it.
        const sample =
          FLOW_EMAIL_SAMPLE_PLACEHOLDERS[keyUp] ??
          FLOW_EMAIL_SAMPLE_PLACEHOLDERS[String(rawKey)] ??
          FLOW_EMAIL_SAMPLE_PLACEHOLDERS[rawKey]
        return sample != null ? String(sample).trim() : `{${rawKey}}`
      })
    }
    const flowEmailHtmlToPlainText = (html) =>
      String(html || '')
        .replace(/\r\n/g, '\n')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    const FLOW_TRIGGER_KEYS = new Set([
      'new_subscriber',
      'customer_signup',
      'seller_signup',
      'seller_docs_submitted',
      'seller_verification_approved',
      'seller_verification_rejected',
      'seller_documents_required',
      'abandoned_cart',
      'order_placed',
      'order_processing',
      'order_shipped',
      'order_delivered',
      'return_requested',
      'return_requested_customer_ships',
      'review_request',
      'win_back',
      'customer_birthday',
      'favorite_low_stock',
      'favorite_price_drop',
      'customer_message_sent',
      'seller_new_customer_message',
      'customer_message_replied',
      'seller_support_ticket_sent',
      'seller_support_ticket_replied',
    ])
    const mapFlowRow = (row) =>
      row
        ? {
            id: row.id,
            name: row.name,
            trigger: row.trigger_key,
            audience: row.audience || 'customer',
            status: row.status,
            sent_count: row.sent_count != null ? Number(row.sent_count) : 0,
            step_count: row.step_count != null ? Number(row.step_count) : undefined,
            created_at: row.created_at,
            updated_at: row.updated_at,
          }
        : null
    const mapStepRow = (row) => ({
      id: row.id,
      step_order: row.step_order != null ? Number(row.step_order) : 0,
      step_type: row.step_type,
      wait_hours: row.wait_hours != null ? Number(row.wait_hours) : null,
      email_subject: row.email_subject || '',
      email_body: row.email_body || '',
      email_i18n: row.email_i18n && typeof row.email_i18n === 'object' ? row.email_i18n : null,
      email_attachments: Array.isArray(row.email_attachments) ? row.email_attachments : [],
      smtp_sender_id: row.smtp_sender_id || null,
    })

    const adminHubFlowsListGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      try {
        await client.connect()
        const r = await client.query(`
          SELECT f.*, (
            SELECT COUNT(*)::int FROM admin_hub_flow_steps s WHERE s.flow_id = f.id
          ) AS step_count
          FROM admin_hub_flows f
          ORDER BY f.updated_at DESC
        `)
        await client.end()
        res.json({ flows: (r.rows || []).map(mapFlowRow), count: r.rows?.length || 0 })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowsPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const body = req.body || {}
      const name = String(body.name || '').trim()
      const triggerKey = String(body.trigger || body.trigger_key || '').trim()
      const status = ['draft', 'active', 'paused'].includes(String(body.status || '').toLowerCase())
        ? String(body.status).toLowerCase()
        : 'draft'
      const audienceRaw = String(body.audience || 'customer').toLowerCase()
      const audience = audienceRaw === 'seller' ? 'seller' : 'customer'
      if (!name) return res.status(400).json({ message: 'name is required' })
      if (!FLOW_TRIGGER_KEYS.has(triggerKey)) return res.status(400).json({ message: 'invalid trigger' })
      try {
        await client.connect()
        const ins = await client.query(
          `INSERT INTO admin_hub_flows (name, trigger_key, status, audience) VALUES ($1, $2, $3, $4)
           RETURNING id, name, trigger_key, status, audience, sent_count, created_at, updated_at`,
          [name, triggerKey, status, audience],
        )
        await client.end()
        const flow = mapFlowRow({ ...ins.rows[0], step_count: 0 })
        res.status(201).json({ flow })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const fr = await client.query(`SELECT * FROM admin_hub_flows WHERE id = $1`, [id])
        if (!fr.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }
        const sr = await client.query(
          `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1 ORDER BY step_order ASC`,
          [id],
        )
        await client.end()
        const flow = mapFlowRow({ ...fr.rows[0], step_count: sr.rows?.length || 0 })
        res.json({ flow, steps: (sr.rows || []).map(mapStepRow) })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowSnapshotsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const flowId = String(req.params.id || '').trim()
      const full = String(req.query.full || '').trim() === '1'
      const lim = Math.min(80, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24))
      if (!flowId) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1::uuid`, [flowId])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }
        const cols = full
          ? 'version_num, created_at, flow_snapshot, steps_snapshot'
          : 'version_num, created_at'
        const r = await client.query(
          `SELECT ${cols} FROM admin_hub_flow_snapshots WHERE flow_id = $1::uuid ORDER BY version_num DESC LIMIT $2`,
          [flowId, lim],
        )
        await client.end()
        res.json({ snapshots: r.rows || [], count: r.rows?.length || 0 })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowPATCH = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const body = req.body || {}
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1`, [id])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }

        const sets = []
        const vals = []
        let vi = 1
        if (body.name !== undefined) {
          const n = String(body.name || '').trim()
          if (!n) {
            await client.end()
            return res.status(400).json({ message: 'name cannot be empty' })
          }
          sets.push(`name = $${vi++}`)
          vals.push(n)
        }
        if (body.trigger !== undefined || body.trigger_key !== undefined) {
          const tk = String(body.trigger || body.trigger_key || '').trim()
          if (!FLOW_TRIGGER_KEYS.has(tk)) {
            await client.end()
            return res.status(400).json({ message: 'invalid trigger' })
          }
          sets.push(`trigger_key = $${vi++}`)
          vals.push(tk)
        }
        if (body.status !== undefined) {
          const st = String(body.status || '').toLowerCase()
          if (!['draft', 'active', 'paused'].includes(st)) {
            await client.end()
            return res.status(400).json({ message: 'invalid status' })
          }
          sets.push(`status = $${vi++}`)
          vals.push(st)
        }
        if (body.audience !== undefined) {
          const au = String(body.audience || 'customer').toLowerCase() === 'seller' ? 'seller' : 'customer'
          sets.push(`audience = $${vi++}`)
          vals.push(au)
        }

        if (sets.length) {
          sets.push(`updated_at = now()`)
          vals.push(id)
          await client.query(`UPDATE admin_hub_flows SET ${sets.join(', ')} WHERE id = $${vi}`, vals)
        }

        if (Array.isArray(body.steps)) {
          const FLOW_SAVE_LOCALES = ['de', 'en', 'tr', 'fr', 'it', 'es']
          const FLOW_ATTACH_KEYS = new Set(['invoice_pdf', 'lieferschein_pdf', 'return_label_pdf'])
          const SMTP_SENDER_UUID_RE =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          /** Clone for PG jsonb — strips undefined / non-JSON types (avoids invalid json syntax). */
          const flowStepJsonbOrNull = (v) => {
            if (v === undefined || v === null) return null
            try {
              return JSON.parse(JSON.stringify(v))
            } catch {
              return null
            }
          }
          /** Client may send email_i18n as double-encoded JSON string. */
          const coerceFlowEmailI18nInput = (raw) => {
            if (raw === undefined || raw === null) return null
            let x = raw
            if (typeof x === 'string') {
              const t = String(x).trim()
              if (!t) return null
              try {
                x = JSON.parse(t)
              } catch {
                return null
              }
            }
            if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
            return x
          }
          const normalized = []
          for (let i = 0; i < body.steps.length; i++) {
            const s = body.steps[i] || {}
            const stepType = String(s.step_type || '').trim()
            if (stepType !== 'wait_hours' && stepType !== 'send_email') {
              await client.end()
              return res.status(400).json({ message: `Invalid step_type at index ${i}` })
            }
            if (stepType === 'wait_hours') {
              normalized.push({
                order: i,
                step_type: stepType,
                wait_hours: Math.max(0, parseInt(s.wait_hours, 10) || 0),
                email_subject: null,
                email_body: null,
                email_i18n: null,
                email_attachments: null,
                smtp_sender_id: null,
              })
            } else {
              let emailI18nObj = null
              const i18nSrc = coerceFlowEmailI18nInput(s.email_i18n)
              if (i18nSrc) {
                emailI18nObj = {}
                for (const loc of FLOW_SAVE_LOCALES) {
                  const b = i18nSrc[loc]
                  if (!b || typeof b !== 'object') continue
                  const sj = String(b.subject || '').trim()
                  const bd = String(b.body || '').trim()
                  if (sj && bd) {
                    const bundle = { subject: sj, body: bd }
                    const s2 = String(b.subject_b || '').trim()
                    if (s2) bundle.subject_b = s2
                    emailI18nObj[loc] = bundle
                  }
                }
                if (!Object.keys(emailI18nObj).length) emailI18nObj = null
              }
              let subj = String(s.email_subject || '').trim()
              let emBody = String(s.email_body || '').trim()
              if (emailI18nObj) {
                const pri = ['de', 'en', 'tr', 'fr', 'it', 'es']
                let picked = null
                for (const loc of pri) {
                  if (emailI18nObj[loc]) {
                    picked = emailI18nObj[loc]
                    break
                  }
                }
                if (!picked) {
                  const fk = Object.keys(emailI18nObj)[0]
                  picked = emailI18nObj[fk]
                }
                subj = String(picked.subject || '').trim()
                emBody = String(picked.body || '').trim()
              }
              if (!subj || !emBody) {
                await client.end()
                return res.status(400).json({
                  message: `Email step at index ${i} needs subject and body (use locale tabs or legacy fields)`,
                })
              }
              let attachList = []
              if (Array.isArray(s.email_attachments)) {
                attachList = [...new Set(s.email_attachments.map(String).filter((k) => FLOW_ATTACH_KEYS.has(k)))]
              }
              let smtpSenderId = null
              const rawSid = s.smtp_sender_id
              if (rawSid != null && String(rawSid).trim() !== '') {
                const sid = String(rawSid).trim()
                if (!SMTP_SENDER_UUID_RE.test(sid)) {
                  await client.end()
                  return res.status(400).json({ message: `Invalid smtp_sender_id at index ${i}` })
                }
                const okSid = await client.query(
                  `SELECT 1 FROM store_smtp_sender_profiles WHERE id = $1::uuid AND seller_id = 'default'`,
                  [sid],
                )
                if (!okSid.rows[0]) {
                  await client.end()
                  return res.status(400).json({ message: `Unknown smtp_sender_id at index ${i}` })
                }
                smtpSenderId = sid
              }
              normalized.push({
                order: i,
                step_type: stepType,
                wait_hours: null,
                email_subject: subj,
                email_body: emBody,
                email_i18n: emailI18nObj,
                email_attachments: attachList.length ? attachList : null,
                smtp_sender_id: smtpSenderId,
              })
            }
          }
          await client.query('BEGIN')
          await client.query(`DELETE FROM admin_hub_flow_steps WHERE flow_id = $1`, [id])
          for (const row of normalized) {
            const jI18n = flowStepJsonbOrNull(row.email_i18n)
            const jAtt = flowStepJsonbOrNull(row.email_attachments)
            const uuidSender =
              row.smtp_sender_id != null && String(row.smtp_sender_id).trim() !== ''
                ? String(row.smtp_sender_id).trim()
                : null
            await client.query(
              `INSERT INTO admin_hub_flow_steps (flow_id, step_order, step_type, wait_hours, email_subject, email_body, email_i18n, email_attachments, smtp_sender_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::uuid)`,
              [
                id,
                row.order,
                row.step_type,
                row.wait_hours,
                row.email_subject,
                row.email_body,
                jI18n !== null ? JSON.stringify(jI18n) : null,
                jAtt !== null ? JSON.stringify(jAtt) : null,
                uuidSender,
              ],
            )
          }
          await client.query('COMMIT')
          try {
            const frSnap = await client.query(
              `SELECT id, name, trigger_key, status, audience, sent_count, created_at, updated_at FROM admin_hub_flows WHERE id = $1::uuid`,
              [id],
            )
            const srSnap = await client.query(
              `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1::uuid ORDER BY step_order ASC`,
              [id],
            )
            const vq = await client.query(
              `SELECT COALESCE(MAX(version_num), 0) + 1 AS v FROM admin_hub_flow_snapshots WHERE flow_id = $1::uuid`,
              [id],
            )
            const vn = Math.max(1, parseInt(String(vq.rows[0]?.v || '1'), 10) || 1)
            await client.query(
              `INSERT INTO admin_hub_flow_snapshots (flow_id, version_num, flow_snapshot, steps_snapshot)
               VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb)`,
              [id, vn, JSON.stringify(frSnap.rows[0] || {}), JSON.stringify(srSnap.rows || [])],
            )
          } catch (snapErr) {
            console.warn('[flow-snapshot]', snapErr?.message || snapErr)
          }
        }

        const fr = await client.query(`SELECT * FROM admin_hub_flows WHERE id = $1`, [id])
        const sr = await client.query(
          `SELECT * FROM admin_hub_flow_steps WHERE flow_id = $1 ORDER BY step_order ASC`,
          [id],
        )
        await client.end()
        const flow = mapFlowRow({ ...fr.rows[0], step_count: sr.rows?.length || 0 })
        res.json({ flow, steps: (sr.rows || []).map(mapStepRow) })
      } catch (e) {
        try { await client.query('ROLLBACK') } catch (_) {}
        try { await client.end() } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowDELETE = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      try {
        await client.connect()
        const r = await client.query(`DELETE FROM admin_hub_flows WHERE id = $1 RETURNING id`, [id])
        await client.end()
        if (!r.rowCount) return res.status(404).json({ message: 'Flow not found' })
        res.json({ deleted: true })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowTestEmailPOST = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      const body = req.body || {}
      const toRaw = String(body.to || '').trim()
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!id) return res.status(400).json({ message: 'id required' })
      if (!toRaw || !emailRe.test(toRaw)) return res.status(400).json({ message: 'valid to email required' })
      try {
        await client.connect()
        const ex = await client.query(`SELECT id FROM admin_hub_flows WHERE id = $1`, [id])
        if (!ex.rows[0]) {
          await client.end()
          return res.status(404).json({ message: 'Flow not found' })
        }

        let subject
        let htmlBody
        let stepSmtpSenderId = null
        const stepOrderArg = body.step_order
        const hasStepOrder = stepOrderArg != null && stepOrderArg !== ''
        if (hasStepOrder) {
          const so = parseInt(stepOrderArg, 10)
          if (Number.isNaN(so) || so < 0) {
            await client.end()
            return res.status(400).json({ message: 'invalid step_order' })
          }
          const sr = await client.query(
            `SELECT email_subject, email_body, email_i18n, smtp_sender_id FROM admin_hub_flow_steps
             WHERE flow_id = $1 AND step_order = $2 AND step_type = 'send_email'`,
            [id, so],
          )
          if (!sr.rows[0]) {
            await client.end()
            return res.status(404).json({ message: 'send_email step not found for step_order' })
          }
          const tl = String(body.template_locale || body.locale || '')
            .toLowerCase()
            .slice(0, 5)
          const i18n = sr.rows[0].email_i18n
          let pickedSubj = sr.rows[0].email_subject
          let pickedBody = sr.rows[0].email_body
          const tryPick = (loc) => {
            if (!i18n || typeof i18n !== 'object') return false
            const b = i18n[loc]
            const sj = String(b?.subject || '').trim()
            const bd = String(b?.body || '').trim()
            if (sj && bd) {
              pickedSubj = sj
              pickedBody = bd
              return true
            }
            return false
          }
          if (tl && tryPick(tl)) {
            /* use locale tab */
          } else if (i18n && typeof i18n === 'object') {
            for (const loc of ['de', 'en', 'tr', 'fr', 'it', 'es']) tryPick(loc)
          }
          subject = pickedSubj
          htmlBody = pickedBody
          stepSmtpSenderId = sr.rows[0].smtp_sender_id || null
        } else {
          subject = String(body.email_subject || '').trim()
          htmlBody = String(body.email_body || '').trim()
          if (!subject || !htmlBody) {
            await client.end()
            return res.status(400).json({ message: 'email_subject and email_body required (or step_order)' })
          }
        }

        const customerIdRaw = String(body.customer_id || '').trim()
        let customerDerived = {}
        if (customerIdRaw) {
          const flowAutomation = require('../flow-automation')
          const built = await flowAutomation.buildFlowEmailPlaceholderVarsForCustomer(client, customerIdRaw)
          if (!built) {
            await client.end()
            return res.status(404).json({ message: 'Customer not found' })
          }
          customerDerived = built
        }

        let pdfAttachments = []
        const attachReq = Array.isArray(body.attachments) ? body.attachments : []
        const ALLOW_FLOW_TEST_ATTACH = new Set(['invoice_pdf', 'lieferschein_pdf', 'return_label_pdf'])
        const filteredAttach = [...new Set(attachReq.map(String).filter((k) => ALLOW_FLOW_TEST_ATTACH.has(k)))]
        if (filteredAttach.length && customerIdRaw) {
          try {
            const ordPick = await client.query(
              `SELECT id FROM store_orders WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
              [customerIdRaw],
            )
            if (ordPick.rows[0]?.id) {
              const { buildFlowEmailPdfAttachments } = require('../order-pdf-buffers')
              pdfAttachments = await buildFlowEmailPdfAttachments(client, ordPick.rows[0].id, filteredAttach)
            }
          } catch (attErr) {
            console.error('[flow-test-email] pdf attachments', attErr?.message || attErr)
          }
        }

        const { resolveFlowMailProvider, sendFlowOutboundEmail } = require('../email-providers')
        const useResend = (await resolveFlowMailProvider(client)) === 'resend'
        let transport = null
        if (!useResend) {
          transport = await getSmtpTransport(client)
          if (!transport) {
            await client.end()
            return res.status(400).json({ message: 'SMTP not configured' })
          }
        }
        const bodySenderRaw = body.smtp_sender_id
        const bodySender =
          bodySenderRaw != null && String(bodySenderRaw).trim() !== '' ? String(bodySenderRaw).trim() : null
        const profileForSend = bodySender || (stepSmtpSenderId ? String(stepSmtpSenderId) : null)
        const { fromEmail, fromName } = await resolveSmtpSenderIdentity(client, profileForSend)

        const fromEmailTrim = String(fromEmail || '').trim()
        if (!fromEmailTrim) { await client.end(); return res.status(400).json({ message: 'SMTP From email not set' }) }

        const extraVars =
          body.placeholders && typeof body.placeholders === 'object' && !Array.isArray(body.placeholders)
            ? body.placeholders
            : {}
        const mergedVars = { ...customerDerived, ...extraVars }
        const finalSubject = applyFlowEmailPlaceholders(subject, mergedVars)
        const finalHtml = applyFlowEmailPlaceholders(htmlBody, mergedVars)
        const plain = flowEmailHtmlToPlainText(finalHtml)

        await sendFlowOutboundEmail({
          client,
          transport,
          from: `"${String(fromName).replace(/"/g, '')}" <${fromEmailTrim}>`,
          to: toRaw,
          subject: finalSubject,
          html: finalHtml,
          text: plain || finalSubject,
          attachments: pdfAttachments.length ? pdfAttachments : undefined,
        })
        await client.end()
        res.json({ success: true, message: 'Test email sent' })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(400).json({ message: e?.message || 'Send failed' })
      }
    }

    const adminHubFlowEmailMergeFieldsGET = async (req, res) => {
      const rawLoc = String(req.query.locale || 'en')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .slice(0, 2)
      const lang = ['de', 'tr', 'fr', 'it', 'es'].includes(rawLoc) ? rawLoc : 'en'
      const trig = String(req.query.trigger || '').trim()
      const categoryLabels = FLOW_MERGE_CATEGORY_LABELS[lang] || FLOW_MERGE_CATEGORY_LABELS.en
      const matchesTrigger = (field, triggerKey) => {
        if (!triggerKey) return true
        const tr = field.triggers
        if (!tr || tr.includes('*')) return true
        return tr.includes(triggerKey)
      }
      const fields = FLOW_MERGE_FIELDS.filter((f) => matchesTrigger(f, trig)).map((f) => ({
        key: f.key,
        token: `{${f.key}}`,
        sample: f.sample != null && f.sample !== '' ? String(f.sample) : null,
        category: f.category,
        category_label: categoryLabels[f.category] || f.category,
        triggers: f.triggers,
        description: (f.desc && (f.desc[lang] || f.desc.en)) || '',
      }))
      res.json({
        syntax: FLOW_MERGE_SYNTAX[lang] || FLOW_MERGE_SYNTAX.en,
        locale: lang,
        categories: categoryLabels,
        fields,
      })
    }

  const router = Router()

  router.get(
      '/admin-hub/v1/flows/email-merge-fields',
      requireSuperuser,
      adminHubFlowEmailMergeFieldsGET,
    )

    const adminHubFlowTranslatePOST = async (req, res) => {
      const body = req.body || {}
      const sourceLocale = String(body.source_locale || 'de').toLowerCase().slice(0, 2)
      const targets = Array.isArray(body.target_locales) ? body.target_locales : []
      const subject = String(body.subject || '').trim()
      const html = String(body.html || '').trim()
      const key = String(process.env.DEEPL_AUTH_KEY || '').trim()
      if (!subject || !html)
        return res.status(400).json({ message: 'subject and html required' })
      if (!key) return res.status(400).json({ message: 'Set DEEPL_AUTH_KEY for automatic translation' })
      const deepLang = (loc) => {
        const u = String(loc || 'en').toUpperCase()
        const m = { EN: 'EN', DE: 'DE', TR: 'TR', FR: 'FR', IT: 'IT', ES: 'ES' }
        return m[u.slice(0, 2)] || 'EN'
      }
      const baseUrl =
        String(process.env.DEEPL_API_URL || '').trim() ||
        (key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate')
      const translateChunk = async (text, tgt) => {
        const params = new URLSearchParams({ auth_key: key, text, target_lang: deepLang(tgt) })
        if (sourceLocale && sourceLocale.length === 2) params.set('source_lang', deepLang(sourceLocale))
        const r = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.message || `DeepL HTTP ${r.status}`)
        return String(j.translations?.[0]?.text || '').trim()
      }
      try {
        const out = {}
        const allowed = new Set(['en', 'de', 'tr', 'fr', 'it', 'es'])
        for (const tgt of targets) {
          const lo = String(tgt).toLowerCase().slice(0, 2)
          if (!allowed.has(lo) || lo === sourceLocale) continue
          const sj = await translateChunk(subject, lo)
          const bd = await translateChunk(html, lo)
          out[lo] = { subject: sj, body: bd }
        }
        res.json({ translations: out })
      } catch (e) {
        res.status(400).json({ message: e?.message || 'translate failed' })
      }
    }

  router.get('/admin-hub/v1/flows', requireSuperuser, adminHubFlowsListGET)
  router.post('/admin-hub/v1/flows/translate', requireSuperuser, adminHubFlowTranslatePOST)
  router.post('/admin-hub/v1/flows', requireSuperuser, adminHubFlowsPOST)
  router.post('/admin-hub/v1/flows/:id/test-email', requireSuperuser, adminHubFlowTestEmailPOST)
  router.get('/admin-hub/v1/flows/:id/snapshots', requireSuperuser, adminHubFlowSnapshotsGET)
  router.get('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowGET)
  router.patch('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowPATCH)
  router.delete('/admin-hub/v1/flows/:id', requireSuperuser, adminHubFlowDELETE)

    const adminHubFlowExecutionLogsStatsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30))
      const params = []
      const conds = [`l.created_at >= now() - ($${1}::int * interval '1 day')`]
      params.push(days)
      let n = 2
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser) {
        if (!callerSellerId) return res.status(403).json({ message: 'Seller context required' })
        conds.push(`EXISTS (SELECT 1 FROM store_orders o WHERE o.id = l.order_id AND o.seller_id = $${n++})`)
        params.push(callerSellerId)
      }
      const where = `WHERE ${conds.join(' AND ')}`
      try {
        await client.connect()
        const [st, tr, tot, prov] = await Promise.all([
          client.query(
            `SELECT l.status, COUNT(*)::int AS c FROM store_flow_execution_logs l ${where} GROUP BY l.status ORDER BY c DESC`,
            params,
          ),
          client.query(
            `SELECT l.trigger_key, COUNT(*)::int AS c FROM store_flow_execution_logs l ${where} GROUP BY l.trigger_key ORDER BY c DESC LIMIT 40`,
            params,
          ),
          client.query(`SELECT COUNT(*)::int AS c FROM store_flow_execution_logs l ${where}`, params),
          client.query(
            `SELECT COALESCE(l.metadata->>'mail_provider', 'smtp') AS provider, COUNT(*)::int AS c
             FROM store_flow_execution_logs l ${where} AND l.status = 'sent'
             GROUP BY 1 ORDER BY c DESC`,
            params,
          ),
        ])
        await client.end()
        res.json({
          days,
          total_in_window: tot.rows[0]?.c ?? 0,
          by_status: st.rows || [],
          by_trigger: tr.rows || [],
          by_mail_provider: prov.rows || [],
        })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowExecutionLogsGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const lim = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50))
      const off = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0)
      const statusRaw = String(req.query.status || '').trim().toLowerCase()
      const triggerKey = String(req.query.trigger_key || '').trim().toLowerCase()
      const flowId = String(req.query.flow_id || '').trim()
      const allowedStatus = new Set(['pending', 'sent', 'skipped', 'failed'])
      const params = []
      const conds = []
      let n = 1
      if (statusRaw && allowedStatus.has(statusRaw)) {
        conds.push(`l.status = $${n++}`)
        params.push(statusRaw)
      }
      if (triggerKey) {
        conds.push(`LOWER(TRIM(l.trigger_key)) = $${n++}`)
        params.push(triggerKey)
      }
      if (flowId) {
        conds.push(`l.flow_id = $${n++}::uuid`)
        params.push(flowId)
      }
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser) {
        if (!callerSellerId) {
          return res.status(403).json({ message: 'Seller context required' })
        }
        conds.push(`EXISTS (SELECT 1 FROM store_orders o WHERE o.id = l.order_id AND o.seller_id = $${n++})`)
        params.push(callerSellerId)
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
      try {
        await client.connect()
        const countR = await client.query(`SELECT COUNT(*)::int AS c FROM store_flow_execution_logs l ${where}`, params)
        const total = countR.rows[0]?.c ?? 0
        const listParams = [...params, lim, off]
        const limP = n
        const offP = n + 1
        const dataR = await client.query(
          `SELECT l.id, l.trigger_key, l.flow_id, l.step_order, l.audience, l.recipient_email,
                  l.order_id, l.customer_id, l.status, l.attempts, l.error_message,
                  l.sent_at, l.created_at, l.updated_at, l.metadata,
                  f.name AS flow_name
           FROM store_flow_execution_logs l
           LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
           ${where}
           ORDER BY l.created_at DESC
           LIMIT $${limP} OFFSET $${offP}`,
          listParams,
        )
        await client.end()
        res.json({
          logs: dataR.rows || [],
          count: dataR.rows?.length || 0,
          total,
          limit: lim,
          offset: off,
        })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

    const adminHubFlowExecutionLogGET = async (req, res) => {
      const client = getDbClient()
      if (!client) return res.status(503).json({ message: 'DB not configured' })
      const id = String(req.params.id || '').trim()
      if (!id) return res.status(400).json({ message: 'id required' })
      const isSuperuser = !!(req.sellerUser?.is_superuser === true || req.sellerUser?.is_superuser === 'true')
      const callerSellerId = String(req.sellerUser?.seller_id || '').trim()
      if (!isSuperuser && !callerSellerId) return res.status(403).json({ message: 'Seller context required' })
      try {
        await client.connect()
        const r = isSuperuser
          ? await client.query(
              `SELECT l.*, f.name AS flow_name
               FROM store_flow_execution_logs l
               LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
               WHERE l.id = $1::uuid`,
              [id],
            )
          : await client.query(
              `SELECT l.*, f.name AS flow_name
               FROM store_flow_execution_logs l
               LEFT JOIN admin_hub_flows f ON f.id = l.flow_id
               INNER JOIN store_orders o ON o.id = l.order_id
               WHERE l.id = $1::uuid AND o.seller_id = $2`,
              [id, callerSellerId],
            )
        await client.end()
        if (!r.rows[0]) return res.status(404).json({ message: 'Log not found' })
        res.json({ log: r.rows[0] })
      } catch (e) {
        try {
          await client.end()
        } catch (_) {}
        res.status(500).json({ message: e?.message || 'Error' })
      }
    }

  router.get('/admin-hub/v1/flow-execution-logs/stats', adminHubFlowExecutionLogsStatsGET)
  router.get('/admin-hub/v1/flow-execution-logs', adminHubFlowExecutionLogsGET)
  router.get('/admin-hub/v1/flow-execution-logs/:id', adminHubFlowExecutionLogGET)

  return router
}
