import { lt } from "@/lib/locale-text";

export const PM_LABELS = {
  card: { en: "Credit / debit card", tr: "Kredi / banka kartı", fr: "Carte bancaire", es: "Tarjeta de crédito/débito", it: "Carta di credito/debito", de: "Kredit- / Debitkarte" },
  paypal: { en: "PayPal", tr: "PayPal", fr: "PayPal", es: "PayPal", it: "PayPal", de: "PayPal" },
  klarna: { en: "Klarna", tr: "Klarna", fr: "Klarna", es: "Klarna", it: "Klarna", de: "Klarna" },
  sepa_debit: { en: "SEPA Direct Debit", tr: "SEPA Otomatik Ödeme", fr: "Prélèvement SEPA", es: "Débito directo SEPA", it: "Addebito diretto SEPA", de: "SEPA-Lastschrift" },
  ideal: { en: "iDEAL", tr: "iDEAL", fr: "iDEAL", es: "iDEAL", it: "iDEAL", de: "iDEAL" },
  bancontact: { en: "Bancontact", tr: "Bancontact", fr: "Bancontact", es: "Bancontact", it: "Bancontact", de: "Bancontact" },
  eps: { en: "EPS", tr: "EPS", fr: "EPS", es: "EPS", it: "EPS", de: "EPS" },
  p24: { en: "Przelewy24", tr: "Przelewy24", fr: "Przelewy24", es: "Przelewy24", it: "Przelewy24", de: "Przelewy24" },
  giropay: { en: "Giropay", tr: "Giropay", fr: "Giropay", es: "Giropay", it: "Giropay", de: "Giropay" },
  sofort: { en: "Sofort", tr: "Sofort", fr: "Sofort", es: "Sofort", it: "Sofort", de: "Sofort" },
  link: { en: "Link (Stripe)", tr: "Link (Stripe)", fr: "Link (Stripe)", es: "Link (Stripe)", it: "Link (Stripe)", de: "Link (Stripe)" },
  affirm: { en: "Affirm", tr: "Affirm", fr: "Affirm", es: "Affirm", it: "Affirm", de: "Affirm" },
  afterpay_clearpay: { en: "Afterpay / Clearpay", tr: "Afterpay / Clearpay", fr: "Afterpay / Clearpay", es: "Afterpay / Clearpay", it: "Afterpay / Clearpay", de: "Afterpay / Clearpay" },
  blik: { en: "BLIK", tr: "BLIK", fr: "BLIK", es: "BLIK", it: "BLIK", de: "BLIK" },
  cashapp: { en: "Cash App Pay", tr: "Cash App Pay", fr: "Cash App Pay", es: "Cash App Pay", it: "Cash App Pay", de: "Cash App Pay" },
  mobilepay: { en: "MobilePay", tr: "MobilePay", fr: "MobilePay", es: "MobilePay", it: "MobilePay", de: "MobilePay" },
  multibanco: { en: "Multibanco", tr: "Multibanco", fr: "Multibanco", es: "Multibanco", it: "Multibanco", de: "Multibanco" },
  oxxo: { en: "OXXO", tr: "OXXO", fr: "OXXO", es: "OXXO", it: "OXXO", de: "OXXO" },
  paynow: { en: "PayNow", tr: "PayNow", fr: "PayNow", es: "PayNow", it: "PayNow", de: "PayNow" },
  pix: { en: "Pix", tr: "Pix", fr: "Pix", es: "Pix", it: "Pix", de: "Pix" },
  promptpay: { en: "PromptPay", tr: "PromptPay", fr: "PromptPay", es: "PromptPay", it: "PromptPay", de: "PromptPay" },
  revolut_pay: { en: "Revolut Pay", tr: "Revolut Pay", fr: "Revolut Pay", es: "Revolut Pay", it: "Revolut Pay", de: "Revolut Pay" },
  swish: { en: "Swish", tr: "Swish", fr: "Swish", es: "Swish", it: "Swish", de: "Swish" },
  twint: { en: "TWINT", tr: "TWINT", fr: "TWINT", es: "TWINT", it: "TWINT", de: "TWINT" },
  us_bank_account: { en: "US Bank Account (ACH)", tr: "ABD Banka Hesabı (ACH)", fr: "Compte bancaire US (ACH)", es: "Cuenta bancaria US (ACH)", it: "Conto bancario US (ACH)", de: "US Bank Account (ACH)" },
  wechat_pay: { en: "WeChat Pay", tr: "WeChat Pay", fr: "WeChat Pay", es: "WeChat Pay", it: "WeChat Pay", de: "WeChat Pay" },
  zip: { en: "Zip", tr: "Zip", fr: "Zip", es: "Zip", it: "Zip", de: "Zip" },
  amazon_pay: { en: "Amazon Pay", tr: "Amazon Pay", fr: "Amazon Pay", es: "Amazon Pay", it: "Amazon Pay", de: "Amazon Pay" },
  au_becs_debit: { en: "AU BECS Debit", tr: "AU BECS Debit", fr: "AU BECS Debit", es: "AU BECS Debit", it: "AU BECS Debit", de: "AU BECS Debit" },
  bacs_debit: { en: "BACS Debit", tr: "BACS Debit", fr: "BACS Debit", es: "BACS Debit", it: "BACS Debit", de: "BACS Debit" },
  boleto: { en: "Boleto", tr: "Boleto", fr: "Boleto", es: "Boleto", it: "Boleto", de: "Boleto" },
  fpx: { en: "FPX", tr: "FPX", fr: "FPX", es: "FPX", it: "FPX", de: "FPX" },
  konbini: { en: "Konbini", tr: "Konbini", fr: "Konbini", es: "Konbini", it: "Konbini", de: "Konbini" },
  acss_debit: { en: "ACSS Debit", tr: "ACSS Debit", fr: "ACSS Debit", es: "ACSS Debit", it: "ACSS Debit", de: "ACSS Debit" },
};

export function paymentMethodLabel(locale, pmType) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const entry = PM_LABELS[pmType];
  if (!entry) return pmType;
  return entry[loc] || entry.en || pmType;
}

export function getCheckoutCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    pageTitle: t("Checkout & Payments (Shop)", "Ödeme & Ödemeler (Mağaza)", "Paiement & Paiements (Boutique)", "Pago y pagos (Tienda)", "Checkout e pagamenti (Negozio)", "Checkout & Zahlungen (Shop)"),
    pageIntro: t("Stripe keys and enabled payment methods for shop checkout. Superusers only.", "Mağaza ödemesi için Stripe anahtarları ve etkin ödeme yöntemleri. Yalnızca süper kullanıcılar.", "Clés Stripe et moyens de paiement pour le checkout boutique. Superusers uniquement.", "Claves Stripe y métodos de pago para el checkout de la tienda. Solo superusuarios.", "Chiavi Stripe e metodi di pagamento per il checkout del negozio. Solo superuser.", "Stripe-Schlüssel und aktivierte Zahlarten für den Shop-Checkout. Nur Superuser."),
    envBanner: t("STRIPE_* environment variables on Render/Vercel are not used for shop checkout. Only keys saved in Sellercentral (database) apply.", "Render/Vercel'deki STRIPE_* ortam değişkenleri mağaza ödemesinde kullanılmaz. Yalnızca Sellercentral'da kayıtlı anahtarlar (veritabanı) geçerlidir.", "Les variables STRIPE_* sur Render/Vercel ne sont pas utilisées pour le checkout boutique. Seules les clés enregistrées dans Sellercentral (base de données) s'appliquent.", "Las variables STRIPE_* en Render/Vercel no se usan para el checkout de la tienda. Solo aplican las claves guardadas en Sellercentral (base de datos).", "Le variabili STRIPE_* su Render/Vercel non vengono usate per il checkout del negozio. Valgono solo le chiavi salvate in Sellercentral (database).", "Auf Render/Vercel gesetzte STRIPE_* Umgebungsvariablen werden für den Shop-Checkout nicht verwendet. Maßgeblich sind ausschließlich die in Sellercentral gespeicherten Schlüssel (Datenbank)."),
    stripeTitle: t("Stripe", "Stripe", "Stripe", "Stripe", "Stripe", "Stripe"),
    stripeHelp: t("Publishable (pk_…) and Secret (sk_…) must belong to the same Stripe account. Leaving Secret empty when saving keeps the previous secret key unchanged.", "Publishable (pk_…) ve Secret (sk_…) aynı Stripe hesabına ait olmalıdır. Kaydederken Secret boş bırakılırsa önceki secret key değişmez.", "Publishable (pk_…) et Secret (sk_…) doivent appartenir au même compte Stripe. Laisser Secret vide conserve l'ancienne clé secrète.", "Publishable (pk_…) y Secret (sk_…) deben pertenecer a la misma cuenta Stripe. Dejar Secret vacío mantiene la clave secreta anterior.", "Publishable (pk_…) e Secret (sk_…) devono appartenere allo stesso account Stripe. Lasciare Secret vuoto mantiene la chiave segreta precedente.", "Publishable (pk_…) und Secret (sk_…) müssen zum selben Stripe-Konto gehören. Leeres Secret-Feld beim Speichern lässt den bisherigen Secret Key unverändert."),
    stripePk: t("Stripe Publishable Key", "Stripe Publishable Key", "Clé publique Stripe", "Clave publicable Stripe", "Chiave pubblicabile Stripe", "Stripe Publishable Key"),
    stripeSk: t("Stripe Secret Key (set new)", "Stripe Secret Key (yeni ayarla)", "Clé secrète Stripe (nouvelle)", "Clave secreta Stripe (nueva)", "Chiave segreta Stripe (nuova)", "Stripe Secret Key (neu setzen)"),
    secretInDb: (hint) => t(`Saved in DB (${hint || "****"})`, `DB'de kayıtlı (${hint || "****"})`, `Enregistré en BDD (${hint || "****"})`, `Guardado en BD (${hint || "****"})`, `Salvato nel DB (${hint || "****"})`, `In DB gespeichert (${hint || "****"})`),
    noSecretInDb: t("No secret in database yet", "Henüz veritabanında secret yok", "Pas encore de secret en base", "Aún no hay secret en la base de datos", "Nessun secret nel database", "Noch kein Secret in der Datenbank"),
    methodsTitle: t("Payment methods at checkout", "Ödeme yöntemleri", "Moyens de paiement au checkout", "Métodos de pago en checkout", "Metodi di pagamento al checkout", "Zahlarten im Checkout"),
    methodsHelp: t("Payment methods enabled in your Stripe Dashboard are listed here. Only checked methods appear in shop checkout.", "Stripe Dashboard'unuzda etkin ödeme yöntemleri burada listelenir. Yalnızca işaretli yöntemler mağaza ödemesinde görünür.", "Les moyens de paiement activés dans Stripe Dashboard sont listés ici. Seuls les moyens cochés apparaissent au checkout.", "Los métodos activados en Stripe Dashboard se listan aquí. Solo los marcados aparecen en el checkout.", "I metodi abilitati in Stripe Dashboard sono elencati qui. Solo quelli selezionati appaiono al checkout.", "Im Stripe-Dashboard aktivierte Zahlmethoden werden hier aufgelistet. Nur angehakte Methoden erscheinen im Shop-Checkout."),
    methodsLoadError: t("Could not load Stripe payment methods.", "Stripe ödeme yöntemleri yüklenemedi.", "Impossible de charger les moyens de paiement Stripe.", "No se pudieron cargar los métodos de pago Stripe.", "Impossibile caricare i metodi di pagamento Stripe.", "Stripe-Zahlmethoden konnten nicht geladen werden."),
    noMethods: t("No payment methods found. Ensure the Stripe Secret Key is saved and test the connection.", "Ödeme yöntemi bulunamadı. Stripe Secret Key kayıtlı olduğundan emin olun ve bağlantıyı test edin.", "Aucun moyen de paiement trouvé. Assurez-vous que la clé secrète Stripe est enregistrée et testez la connexion.", "No se encontraron métodos de pago. Asegúrese de que la clave secreta Stripe esté guardada y pruebe la conexión.", "Nessun metodo di pagamento trovato. Assicurarsi che la chiave segreta Stripe sia salvata e testare la connessione.", "Keine Zahlmethoden gefunden. Stellen Sie sicher, dass der Stripe Secret Key gespeichert ist, und testen Sie die Verbindung."),
    displayTitle: t("Display in shop", "Mağazada görünüm", "Affichage dans la boutique", "Visualización en tienda", "Visualizzazione nel negozio", "Darstellung im Shop"),
    layoutTabs: t("Tabs (side by side)", "Sekmeler (yan yana)", "Onglets (côte à côte)", "Pestañas (lado a lado)", "Schede (affiancate)", "Tabs (nebeneinander)"),
    layoutTabsHelp: t("Show payment methods as horizontal tabs.", "Ödeme yöntemlerini yatay sekmeler olarak göster.", "Afficher les moyens de paiement en onglets horizontaux.", "Mostrar métodos de pago como pestañas horizontales.", "Mostrare i metodi come schede orizzontali.", "Zahlmethoden als horizontale Tabs anzeigen."),
    layoutList: t("List (stacked)", "Liste (alt alta)", "Liste (empilée)", "Lista (apilada)", "Lista (impilata)", "Liste (untereinander)"),
    layoutListHelp: t("Show payment methods as a vertical accordion list.", "Ödeme yöntemlerini dikey accordion listesi olarak göster.", "Afficher les moyens de paiement en liste accordéon verticale.", "Mostrar métodos como lista acordeón vertical.", "Mostrare i metodi come lista accordion verticale.", "Zahlmethoden als vertikale Accordion-Liste anzeigen."),
    paypalTitle: t("PayPal API (optional)", "PayPal API (isteğe bağlı)", "API PayPal (optionnel)", "API PayPal (opcional)", "API PayPal (opzionale)", "PayPal API (optional)"),
    paypalHelp: t("Additional storage for future integrations; live payment primarily runs via Stripe PaymentElement.", "Gelecekteki entegrasyonlar için ek kayıt; canlı ödeme öncelikle Stripe PaymentElement üzerinden.", "Stockage supplémentaire pour futures intégrations ; le paiement live passe surtout par Stripe PaymentElement.", "Almacenamiento adicional para integraciones futuras; el pago en vivo usa principalmente Stripe PaymentElement.", "Archiviazione aggiuntiva per integrazioni future; il pagamento live passa principalmente via Stripe PaymentElement.", "Zusätzliche Hinterlegung für spätere Integrationen; Live-Zahlung läuft primär über Stripe PaymentElement."),
    paypalClientId: t("PayPal Client ID", "PayPal Client ID", "PayPal Client ID", "PayPal Client ID", "PayPal Client ID", "PayPal Client ID"),
    paypalSecret: t("PayPal Client Secret (set new)", "PayPal Client Secret (yeni ayarla)", "PayPal Client Secret (nouveau)", "PayPal Client Secret (nuevo)", "PayPal Client Secret (nuovo)", "PayPal Client Secret (neu setzen)"),
    optional: t("Optional", "İsteğe bağlı", "Optionnel", "Opcional", "Opzionale", "Optional"),
    testStripe: t("Test Stripe connection", "Stripe bağlantısını test et", "Tester la connexion Stripe", "Probar conexión Stripe", "Test connessione Stripe", "Stripe-Verbindung testen"),
    testStripeHint: t('"Test Stripe connection" calls balance.retrieve and then reloads available payment methods.', '"Stripe bağlantısını test et" balance.retrieve çağırır ve ardından mevcut ödeme yöntemlerini yeniden yükler.', "« Tester la connexion Stripe » appelle balance.retrieve puis recharge les moyens de paiement.", '"Probar conexión Stripe" llama a balance.retrieve y recarga los métodos de pago.', '"Test connessione Stripe" chiama balance.retrieve e ricarica i metodi di pagamento.', '„Stripe-Verbindung testen" ruft balance.retrieve auf und lädt danach die verfügbaren Zahlmethoden neu.'),
    loadError: t("Loading failed", "Yükleme başarısız", "Échec du chargement", "Error al cargar", "Caricamento fallito", "Laden fehlgeschlagen"),
    saveError: t("Saving failed", "Kaydetme başarısız", "Échec de l'enregistrement", "Error al guardar", "Salvataggio fallito", "Speichern fehlgeschlagen"),
    saved: t("Saved.", "Kaydedildi.", "Enregistré.", "Guardado.", "Salvato.", "Gespeichert."),
    pkChangedNoSk: t("Publishable Key was changed but the Secret field is empty — the old secret key in the database remains active. Enter the new Secret Key (sk_…) and save again.", "Publishable Key değiştirildi ancak Secret alanı boş — veritabanındaki eski secret key aktif kalır. Yeni Secret Key (sk_…) girin ve tekrar kaydedin.", "La clé publique a été modifiée mais Secret est vide — l'ancienne clé secrète reste active. Entrez la nouvelle clé secrète (sk_…) et enregistrez.", "Se cambió la Publishable Key pero Secret está vacío — la clave secreta anterior sigue activa. Introduzca la nueva Secret Key (sk_…) y guarde.", "Publishable Key modificata ma Secret vuoto — la chiave segreta precedente resta attiva. Inserire la nuova Secret Key (sk_…) e salvare.", "Publishable Key wurde geändert, aber das Secret-Feld ist leer — der alte Secret Key in der Datenbank bleibt aktiv. Tragen Sie das neue Secret Key (sk_…) ein und speichern Sie erneut."),
    connectionOk: t("Connection successful.", "Bağlantı başarılı.", "Connexion réussie.", "Conexión exitosa.", "Connessione riuscita.", "Verbindung erfolgreich."),
    connectionFailed: t("Stripe connection failed.", "Stripe bağlantısı başarısız.", "Échec de la connexion Stripe.", "Conexión Stripe fallida.", "Connessione Stripe fallita.", "Stripe-Verbindung fehlgeschlagen."),
    requestFailed: t("Request failed.", "İstek başarısız.", "Requête échouée.", "Solicitud fallida.", "Richiesta fallita.", "Anfrage fehlgeschlagen."),
    testMode: t("Test mode", "Test modu", "Mode test", "Modo prueba", "Modalità test", "Testmodus"),
    liveMode: t("Live", "Canlı", "Live", "Live", "Live", "Live"),
  };
}
