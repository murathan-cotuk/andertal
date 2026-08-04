'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') })

const { randomUUID } = require('crypto')
const { Client } = require('pg')

const dryRun = process.argv.includes('--dry-run')
const databaseUrl = process.env.DATABASE_URL

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
const issue = (label, order) => localize({ order }, { label })
const category = (key, runtimeCategory, order, orderRelated, platform, label, subtopics) => localize({
  key, runtime_category: runtimeCategory, order, order_related: orderRelated, platform,
  subtopics: subtopics.map((entry, index) => issue(entry, index)),
}, { label })
const topic = (icon, categoryKey, order, title, description) => localize({ icon, category: categoryKey, order }, { title, description })
const faq = (order, question, answer, actionLabel, actionUrl) => localize({
  order, action_url: actionUrl || '',
}, { question, answer, action_label: actionLabel || value('', '', '', '', '', '') })
const faqCategory = (order, title, item) => localize({ order, items: [item] }, { title })

const openOrders = value('Bestellungen öffnen', 'Open orders', 'Siparişleri aç', 'Ouvrir les commandes', 'Abrir pedidos', 'Apri ordini')
const openCases = value('Meine Anfragen', 'My requests', 'Taleplerim', 'Mes demandes', 'Mis solicitudes', 'Le mie richieste')

const baseSupportContainers = () => [
  localize({
    id: randomUUID(), type: 'support_hero', visible: true,
    open_case_count_enabled: true,
    primary_action_url: '#support-wizard', secondary_action_url: '/nachrichten',
    bg_color: '#f5f7ff', text_color: '#17213c', accent_color: '#ff971c', image: '', layout: 'split',
    padding: '64px 24px', content_layout: 'contained', content_max_width: '1200px',
  }, {
    title: value('Wie können wir Ihnen helfen?', 'How can we help?', 'Size nasıl yardımcı olabiliriz?', 'Comment pouvons-nous vous aider ?', '¿Cómo podemos ayudarte?', 'Come possiamo aiutarti?'),
    description: value('Finden Sie schnell Antworten oder starten Sie eine geführte Support-Anfrage.', 'Find answers quickly or start a guided support request.', 'Yanıtları hızla bulun veya yönlendirmeli destek talebi başlatın.', 'Trouvez rapidement une réponse ou lancez une demande guidée.', 'Encuentra respuestas o inicia una solicitud guiada.', 'Trova una risposta o avvia una richiesta guidata.'),
    trust_text: value('Sichere Hilfe rund um Bestellung, Rückgabe, Zahlung und Konto', 'Secure help with orders, returns, payments and your account', 'Sipariş, iade, ödeme ve hesap için güvenli yardım', 'Aide sécurisée pour commandes, retours, paiements et compte', 'Ayuda segura con pedidos, devoluciones, pagos y cuenta', 'Assistenza sicura per ordini, resi, pagamenti e account'),
    search_placeholder: value('Wie können wir Ihnen helfen?', 'How can we help?', 'Size nasıl yardımcı olabiliriz?', 'Comment pouvons-nous vous aider ?', '¿Cómo podemos ayudarte?', 'Come possiamo aiutarti?'),
    open_case_count_text: value('{count} offene Support-Anfragen', '{count} open support requests', '{count} açık destek talebi', '{count} demandes ouvertes', '{count} solicitudes abiertas', '{count} richieste aperte'),
    primary_action_label: value('Neue Support-Anfrage', 'New support request', 'Yeni destek talebi', 'Nouvelle demande', 'Nueva solicitud', 'Nuova richiesta'),
    secondary_action_label: value('Meine Anfragen ansehen', 'View my requests', 'Taleplerimi görüntüle', 'Voir mes demandes', 'Ver mis solicitudes', 'Vedi le mie richieste'),
  }),
  localize({
    id: randomUUID(), type: 'support_case_wizard', visible: true,
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
        value('Konto nicht zugänglich', 'Account inaccessible', 'Hesaba erişilemiyor', 'Compte inaccessible', 'Cuenta inaccesible', 'Account non accessibile'),
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
    padding: '48px 24px', content_layout: 'contained', content_max_width: '1000px',
  }, {
    title: value('Worum geht es?', 'What do you need help with?', 'Hangi konuda yardıma ihtiyacınız var?', 'Comment pouvons-nous vous aider ?', '¿Con qué necesitas ayuda?', 'Come possiamo aiutarti?'),
    description: value('Wählen Sie zuerst einen Bereich und anschließend das passende Thema.', 'Choose an area, then the matching topic.', 'Önce alanı, ardından uygun konuyu seçin.', 'Choisissez un domaine puis le thème.', 'Elige un área y el tema.', "Scegli un'area e l'argomento."),
    category_heading: value('Bereich auswählen', 'Choose an area', 'Alan seçin', 'Choisir un domaine', 'Elegir área', "Scegli un'area"),
    subtopic_heading: value('Thema auswählen', 'Choose a topic', 'Konu seçin', 'Choisir un thème', 'Elegir tema', 'Scegli un argomento'),
    order_heading: value('Welche Bestellung betrifft Ihre Anfrage?', 'Which order is this about?', 'Hangi siparişle ilgili?', 'Quelle commande est concernée ?', '¿Qué pedido está relacionado?', 'Quale ordine riguarda?'),
    continue_label: value('Weiter', 'Continue', 'Devam', 'Continuer', 'Continuar', 'Continua'),
    back_label: value('Zurück', 'Back', 'Geri', 'Retour', 'Atrás', 'Indietro'),
  }),
  localize({
    id: randomUUID(), type: 'support_topic_grid', visible: true, columns: 3,
    topics: [
      topic('📦', 'order', 0, value('Bestellung & Lieferung', 'Orders & delivery', 'Sipariş ve teslimat', 'Commandes et livraison', 'Pedidos y entrega', 'Ordini e consegna'), value('Status, fehlende Pakete und unvollständige Bestellungen.', 'Status, missing parcels and incomplete orders.', 'Durum, eksik paketler ve siparişler.', 'Statut, colis manquants et commandes incomplètes.', 'Estado, paquetes y pedidos incompletos.', 'Stato, pacchi mancanti e ordini incompleti.')),
      topic('↩️', 'return', 1, value('Rückgabe & Erstattung', 'Returns & refunds', 'İade ve para iadesi', 'Retours et remboursements', 'Devoluciones y reembolsos', 'Resi e rimborsi'), value('Rückgabe starten oder fehlende Erstattung melden.', 'Start a return or report a missing refund.', 'İade başlatın veya geri ödemeyi bildirin.', 'Lancer un retour ou signaler un remboursement.', 'Inicia una devolución o reclama un reembolso.', 'Avvia un reso o segnala un rimborso.')),
      topic('💳', 'payment', 2, value('Zahlung', 'Payment', 'Ödeme', 'Paiement', 'Pago', 'Pagamento'), value('Fehlgeschlagene Zahlungen klären.', 'Resolve failed payments.', 'Başarısız ödemeleri çözün.', 'Résoudre les paiements échoués.', 'Resuelve pagos fallidos.', 'Risolvi pagamenti non riusciti.')),
      topic('🧾', 'invoice', 3, value('Rechnung', 'Invoice', 'Fatura', 'Facture', 'Factura', 'Fattura'), value('Rechnung finden oder Fehler melden.', 'Find an invoice or report an error.', 'Fatura bulun veya hata bildirin.', 'Trouver une facture ou signaler une erreur.', 'Encuentra una factura o informa un error.', 'Trova una fattura o segnala un errore.')),
      topic('🔐', 'account', 4, value('Konto', 'Account', 'Hesap', 'Compte', 'Cuenta', 'Account'), value('Zugang und persönliche Daten verwalten.', 'Manage access and personal data.', 'Erişim ve kişisel verileri yönetin.', "Gérer l'accès et les données.", 'Gestiona acceso y datos.', 'Gestisci accesso e dati.')),
      topic('🎁', 'bonus', 5, value('Bonus & Gutschein', 'Bonus & coupon', 'Bonus ve kupon', 'Bonus et coupon', 'Bono y cupón', 'Bonus e coupon'), value('Punkte und Gutscheine prüfen.', 'Check points and coupons.', 'Puanları ve kuponları kontrol edin.', 'Vérifier points et coupons.', 'Comprueba puntos y cupones.', 'Controlla punti e coupon.')),
      topic('🛍️', 'product', 6, value('Produkt & Verkäufer', 'Product & seller', 'Ürün ve satıcı', 'Produit et vendeur', 'Producto y vendedor', 'Prodotto e venditore'), value('Produktproblem oder Verkäuferbeschwerde melden.', 'Report a product issue or seller complaint.', 'Ürün sorununu veya satıcıyı bildirin.', 'Signaler un problème ou un vendeur.', 'Informa un problema o vendedor.', 'Segnala un problema o venditore.')),
      topic('🛠️', 'technical', 7, value('Technisches Problem', 'Technical issue', 'Teknik sorun', 'Problème technique', 'Problema técnico', 'Problema tecnico'), value('Fehler bei Website oder Funktion melden.', 'Report a website or feature error.', 'Site veya özellik hatasını bildirin.', 'Signaler une erreur du site.', 'Informa un error del sitio.', 'Segnala un errore del sito.')),
      topic('🛡️', 'privacy', 8, value('Datenschutz', 'Privacy', 'Gizlilik', 'Confidentialité', 'Privacidad', 'Privacy'), value('Auskunft, Löschung und Datenschutzfragen.', 'Access, deletion and privacy questions.', 'Erişim, silme ve gizlilik soruları.', 'Accès, suppression et confidentialité.', 'Acceso, eliminación y privacidad.', 'Accesso, cancellazione e privacy.')),
      topic('❓', 'other', 9, value('Sonstiges', 'Other', 'Diğer', 'Autre', 'Otro', 'Altro'), value('Ein anderes Anliegen beschreiben.', 'Describe another issue.', 'Başka bir konuyu açıklayın.', 'Décrire une autre demande.', 'Describe otro asunto.', 'Descrivi un altro problema.')),
    ],
    padding: '48px 24px', content_layout: 'contained', content_max_width: '1200px',
  }, {
    title: value('Beliebte Hilfethemen', 'Popular help topics', 'Popüler yardım konuları', "Thèmes d'aide populaires", 'Temas de ayuda populares', 'Argomenti di assistenza popolari'),
    description: value('Direkt zu den am häufigsten gesuchten Antworten.', 'Go straight to the most searched answers.', 'En sık aranan yanıtlara ulaşın.', 'Accédez aux réponses les plus recherchées.', 'Accede a las respuestas más buscadas.', 'Vai alle risposte più cercate.'),
  }),
  localize({
    id: randomUUID(), type: 'support_faq', visible: true,
    categories: [
      faqCategory(0, value('Bestellungen', 'Orders', 'Siparişler', 'Commandes', 'Pedidos', 'Ordini'), faq(0, value('Wie prüfe ich meine Bestellung?', 'How do I check my order?', 'Siparişimi nasıl kontrol ederim?', 'Comment vérifier ma commande ?', '¿Cómo consulto mi pedido?', 'Come controllo il mio ordine?'), value('Status und Details finden Sie in Ihren Bestellungen.', 'Find status and details in your orders.', 'Durum ve ayrıntılar siparişlerinizdedir.', 'Le statut se trouve dans vos commandes.', 'El estado está en tus pedidos.', 'Stato e dettagli sono nei tuoi ordini.'), openOrders, '/account/orders')),
      faqCategory(1, value('Versand', 'Shipping', 'Teslimat', 'Livraison', 'Envío', 'Spedizione'), faq(0, value('Wo ist mein Paket?', 'Where is my parcel?', 'Paketim nerede?', 'Où est mon colis ?', '¿Dónde está mi paquete?', "Dov'è il mio pacco?"), value('Öffnen Sie die Bestellung, um die Sendungsverfolgung zu sehen.', 'Open the order to view tracking.', 'Takibi görmek için siparişi açın.', 'Ouvrez la commande pour le suivi.', 'Abre el pedido para ver el seguimiento.', "Apri l'ordine per il tracking."), openOrders, '/account/orders')),
      faqCategory(2, value('Rückgabe & Erstattung', 'Returns & refunds', 'İade ve geri ödeme', 'Retours et remboursements', 'Devoluciones y reembolsos', 'Resi e rimborsi'), faq(0, value('Wie starte ich eine Rückgabe?', 'How do I start a return?', 'İade nasıl başlatılır?', 'Comment commencer un retour ?', '¿Cómo inicio una devolución?', 'Come avvio un reso?'), value('Öffnen Sie die Bestellung und wählen Sie die Rückgabeoption.', 'Open the order and choose the return option.', 'Siparişi açıp iade seçeneğini seçin.', 'Ouvrez la commande et choisissez le retour.', 'Abre el pedido y elige devolución.', "Apri l'ordine e scegli il reso."), openOrders, '/account/orders')),
      faqCategory(3, value('Zahlung', 'Payment', 'Ödeme', 'Paiement', 'Pago', 'Pagamento'), faq(0, value('Was tun bei fehlgeschlagener Zahlung?', 'What if payment fails?', 'Ödeme başarısız olursa ne yapmalıyım?', 'Que faire si le paiement échoue ?', '¿Qué hago si falla el pago?', 'Cosa fare se il pagamento fallisce?'), value('Prüfen Sie Ihre Zahlungsdaten; bei Abbuchung kontaktieren Sie den Support.', 'Check payment details; contact support if charged.', 'Bilgileri kontrol edin; ücret alındıysa desteğe yazın.', 'Vérifiez les données; contactez-nous si débité.', 'Comprueba los datos; contáctanos si hubo cargo.', 'Controlla i dati; contattaci se addebitato.'), openCases, '/nachrichten')),
      faqCategory(4, value('Rechnung', 'Invoice', 'Fatura', 'Facture', 'Factura', 'Fattura'), faq(0, value('Meine Rechnung ist falsch – was nun?', 'My invoice is wrong — what now?', 'Faturam yanlış, ne yapmalıyım?', 'Ma facture est incorrecte, que faire ?', 'Mi factura es incorrecta, ¿qué hago?', 'La fattura è errata, cosa faccio?'), value('Öffnen Sie eine Anfrage und nennen Sie die Bestellung.', 'Open a request and include the order.', 'Talep açıp siparişi belirtin.', 'Ouvrez une demande avec la commande.', 'Abre una solicitud con el pedido.', "Apri una richiesta con l'ordine."), openCases, '/nachrichten')),
      faqCategory(5, value('Konto', 'Account', 'Hesap', 'Compte', 'Cuenta', 'Account'), faq(0, value('Ich kann nicht auf mein Konto zugreifen.', 'I cannot access my account.', 'Hesabıma erişemiyorum.', 'Je ne peux pas accéder à mon compte.', 'No puedo acceder a mi cuenta.', "Non riesco ad accedere all'account."), value('Prüfen Sie Ihre E-Mail-Adresse und setzen Sie das Passwort zurück.', 'Check your email and reset the password.', 'E-postanızı kontrol edip parolayı sıfırlayın.', "Vérifiez l'e-mail et réinitialisez le mot de passe.", 'Comprueba el correo y restablece la contraseña.', "Controlla l'email e reimposta la password."), openCases, '/nachrichten')),
      faqCategory(6, value('Bonus & Gutschein', 'Bonus & coupon', 'Bonus ve kupon', 'Bonus et coupon', 'Bono y cupón', 'Bonus e coupon'), faq(0, value('Warum funktioniert mein Gutschein nicht?', 'Why does my coupon not work?', 'Kuponum neden çalışmıyor?', 'Pourquoi mon coupon ne fonctionne-t-il pas ?', '¿Por qué no funciona mi cupón?', 'Perché il coupon non funziona?'), value('Prüfen Sie Gültigkeit, Mindestwert und teilnehmende Produkte.', 'Check validity, minimum spend and eligible products.', 'Geçerlilik, alt limit ve ürünleri kontrol edin.', 'Vérifiez validité, minimum et produits.', 'Comprueba vigencia, mínimo y productos.', 'Controlla validità, minimo e prodotti.'), openCases, '/nachrichten')),
      faqCategory(7, value('Verkäufer', 'Sellers', 'Satıcılar', 'Vendeurs', 'Vendedores', 'Venditori'), faq(0, value('Wie melde ich ein Verkäuferproblem?', 'How do I report a seller issue?', 'Satıcı sorununu nasıl bildiririm?', 'Comment signaler un vendeur ?', '¿Cómo informo un problema con un vendedor?', 'Come segnalo un problema con un venditore?'), value('Starten Sie eine Anfrage und wählen Sie Verkäufer.', 'Start a request and choose Seller.', 'Talep başlatıp Satıcı seçin.', 'Lancez une demande et choisissez Vendeur.', 'Inicia una solicitud y elige Vendedor.', 'Avvia una richiesta e scegli Venditore.'), openCases, '/nachrichten')),
      faqCategory(8, value('Datenschutz', 'Privacy', 'Gizlilik', 'Confidentialité', 'Privacidad', 'Privacy'), faq(0, value('Wie stelle ich eine Datenschutzanfrage?', 'How do I make a privacy request?', 'Gizlilik talebi nasıl oluşturulur?', 'Comment faire une demande de confidentialité ?', '¿Cómo hago una solicitud de privacidad?', 'Come invio una richiesta privacy?'), value('Starten Sie eine Anfrage und wählen Sie Datenschutz.', 'Start a request and choose Privacy.', 'Talep başlatıp Gizlilik seçin.', 'Lancez une demande et choisissez Confidentialité.', 'Inicia una solicitud y elige Privacidad.', 'Avvia una richiesta e scegli Privacy.'), openCases, '/nachrichten')),
    ],
    padding: '48px 24px', content_layout: 'contained', content_max_width: '1000px',
  }, {
    title: value('Häufig gestellte Fragen', 'Frequently asked questions', 'Sık sorulan sorular', 'Questions fréquentes', 'Preguntas frecuentes', 'Domande frequenti'),
    description: value('Klare Antworten auf die wichtigsten Fragen rund um Ihren Einkauf.', 'Clear answers to important shopping questions.', 'Önemli alışveriş sorularına net yanıtlar.', 'Des réponses claires aux questions essentielles.', 'Respuestas claras a preguntas importantes.', 'Risposte chiare alle domande più importanti.'),
    section_label: value('Alle Hilfethemen', 'All help topics', 'Tüm yardım konuları', 'Tous les thèmes', 'Todos los temas', 'Tutti gli argomenti'),
    no_results_text: value('Keine passende Antwort gefunden. Versuchen Sie einen anderen Suchbegriff.', 'No matching answer found. Try another search.', 'Uygun yanıt bulunamadı. Başka bir arama deneyin.', 'Aucune réponse trouvée. Essayez une autre recherche.', 'No encontramos una respuesta. Prueba otra búsqueda.', "Nessuna risposta trovata. Prova un'altra ricerca."),
  }),
]

const supportContainers = () => ['desktop', 'tablet', 'mobile'].flatMap((visibleOn) => (
  baseSupportContainers().map((container) => ({ ...container, id: randomUUID(), visible_on: visibleOn }))
))

async function main() {
  if (!databaseUrl || !databaseUrl.startsWith('postgres')) throw new Error('DATABASE_URL is required.')
  const client = new Client({
    connectionString: databaseUrl.replace(/^postgresql:\/\//, 'postgres://'),
    ssl: databaseUrl.includes('render.com') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  try {
    await client.query('BEGIN')
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
        console.log('[dry-run] Would create customer-support and add 12 support container variants.')
        await client.query('ROLLBACK')
        return
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
    const variantKey = (container) => `${container?.type || ''}:${container?.visible_on || 'desktop'}`
    const existingVariants = new Set(existing.map(variantKey))
    const missing = supportContainers().filter((container) => !existingVariants.has(variantKey(container)))

    console.log(`${dryRun ? '[dry-run] ' : ''}Page: ${pageResult.rows[0].slug} (${pageId})`)
    console.log(`${dryRun ? 'Would add' : 'Adding'}: ${missing.map(variantKey).join(', ') || 'nothing'}`)
    if (dryRun || missing.length === 0) {
      await client.query('ROLLBACK')
      return
    }

    const merged = [...existing, ...missing]
    if (landingResult.rows[0]) {
      await client.query(
        'UPDATE admin_hub_landing_pages SET containers = $2, updated_at = NOW() WHERE page_id = $1',
        [pageId, JSON.stringify(merged)]
      )
    } else {
      await client.query(
        `INSERT INTO admin_hub_landing_pages (page_id, containers, settings, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [pageId, JSON.stringify(merged), JSON.stringify({})]
      )
    }
    await client.query('COMMIT')
    console.log(`${createdPage ? 'Created page and seeded' : 'Seeded'} ${missing.length} missing support variant(s).`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { supportContainers }
