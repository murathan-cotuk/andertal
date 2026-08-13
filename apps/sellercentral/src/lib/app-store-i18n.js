import { lt } from "@/lib/locale-text";

export const APP_STORE_CATEGORIES = [
  "all",
  "shipping-fulfillment",
  "accounting",
  "marketing",
  "analytics",
  "inventory",
  "reviews",
  "storefront",
  "other",
];

export function getAppStoreCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    tabStore: t("App Store", "App Store", "App Store", "App Store", "App Store", "App Store"),
    tabInstalled: t("Installed apps", "Yüklü uygulamalar", "Applications installées", "Apps instaladas", "App installate", "Installierte Apps"),
    searchPlaceholder: t("Search apps…", "Uygulama ara…", "Rechercher des apps…", "Buscar apps…", "Cerca app…", "Apps suchen…"),
    search: t("Search", "Ara", "Rechercher", "Buscar", "Cerca", "Suchen"),
    emptyStore: t("No published apps match your search.", "Aramanıza uyan yayınlanmış uygulama yok.", "Aucune app publiée ne correspond à votre recherche.", "Ninguna app publicada coincide con tu búsqueda.", "Nessuna app pubblicata corrisponde alla ricerca.", "Keine veröffentlichten Apps passen zur Suche."),
    emptyInstalled: t("No apps installed yet.", "Henüz yüklü uygulama yok.", "Aucune app installée.", "Aún no hay apps instaladas.", "Nessuna app installata.", "Noch keine Apps installiert."),
    browseStore: t("Browse App Store", "App Store’a git", "Parcourir l’App Store", "Ver App Store", "Apri App Store", "App Store öffnen"),
    add: t("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    added: t("Added", "Eklendi", "Ajoutée", "Añadida", "Aggiunta", "Hinzugefügt"),
    configure: t("Configure", "Yapılandır", "Configurer", "Configurar", "Configura", "Konfigurieren"),
    uninstall: t("Uninstall", "Kaldır", "Désinstaller", "Desinstalar", "Disinstalla", "Deinstallieren"),
    uninstallConfirm: (name) => t(
      `Uninstall ${name}? Connection tokens will be revoked.`,
      `${name} kaldırılsın mı? Bağlantı jetonları iptal edilir.`,
      `Désinstaller ${name} ? Les jetons de connexion seront révoqués.`,
      `¿Desinstalar ${name}? Se revocarán los tokens de conexión.`,
      `Disinstallare ${name}? I token di connessione verranno revocati.`,
      `${name} deinstallieren? Verbindungstokens werden widerrufen.`,
    ),
    installOk: t("App added. Configure the connection to finish setup.", "Uygulama eklendi. Kurulumu bitirmek için bağlantıyı yapılandırın.", "App ajoutée. Configurez la connexion pour terminer.", "App añadida. Configura la conexión para terminar.", "App aggiunta. Configura la connessione per completare.", "App hinzugefügt. Verbindung konfigurieren, um die Einrichtung abzuschließen."),
    installFail: t("Could not add this app.", "Bu uygulama eklenemedi.", "Impossible d’ajouter cette app.", "No se pudo añadir esta app.", "Impossibile aggiungere questa app.", "App konnte nicht hinzugefügt werden."),
    needsCard: t("Paid apps require a credit card on file. Add a card in Billing, then try again.", "Ücretli uygulamalar için kayıtlı bir kredi kartı gerekir. Faturalandırmadan kart ekleyip tekrar deneyin.", "Les apps payantes nécessitent une carte enregistrée. Ajoutez-en une dans Facturation, puis réessayez.", "Las apps de pago requieren una tarjeta. Añádela en Facturación e inténtalo de nuevo.", "Le app a pagamento richiedono una carta. Aggiungila in Fatturazione e riprova.", "Kostenpflichtige Apps benötigen eine hinterlegte Karte. Karte unter Abrechnung hinterlegen und erneut versuchen."),
    goBilling: t("Add credit card", "Kredi kartı ekle", "Ajouter une carte", "Añadir tarjeta", "Aggiungi carta", "Kreditkarte hinterlegen"),
    free: t("Free", "Ücretsiz", "Gratuit", "Gratis", "Gratuita", "Kostenlos"),
    perMonth: t("/ month", "/ ay", " / mois", " / mes", " / mese", " / Monat"),
    byDeveloper: (name) => t(`by ${name}`, `${name}`, `par ${name}`, `por ${name}`, `di ${name}`, `von ${name}`),
    installs: (n) => t(`${n} installs`, `${n} kurulum`, `${n} installations`, `${n} instalaciones`, `${n} installazioni`, `${n} Installationen`),
    connectionOk: t("Connected", "Başarılı", "Connectée", "Conectada", "Connessa", "Verbunden"),
    connectionFail: t("Not connected", "Bağlantı yok", "Non connectée", "Sin conexión", "Non connessa", "Nicht verbunden"),
    connect: t("Connect", "Bağlan", "Connecter", "Conectar", "Collega", "Verbinden"),
    connectExternal: t("Continue to provider", "Sağlayıcıya git", "Continuer chez le fournisseur", "Continuar al proveedor", "Continua sul provider", "Zum Anbieter weiterleiten"),
    clientId: t("Client ID", "İstemci kimliği", "ID client", "ID de cliente", "Client ID", "Client-ID"),
    apiKey: t("API key", "API anahtarı", "Clé API", "Clave API", "Chiave API", "API-Schlüssel"),
    apiSecret: t("API secret", "API gizli anahtarı", "Secret API", "Secreto API", "Secret API", "API-Geheimnis"),
    apiUrl: t("System URL", "Sistem URL’si", "URL du système", "URL del sistema", "URL del sistema", "System-URL"),
    configureTitle: t("Configure connection", "Bağlantıyı yapılandır", "Configurer la connexion", "Configurar conexión", "Configura connessione", "Verbindung konfigurieren"),
    configureHelp: t("Enter the credentials from your external system, or continue to the provider if they handle the login.", "Harici sisteminizdeki bilgileri girin veya girişi sağlayıcı yönetiyorsa oraya gidin.", "Saisissez les identifiants de votre système, ou continuez chez le fournisseur s’il gère la connexion.", "Introduce las credenciales de tu sistema, o continúa en el proveedor si él gestiona el acceso.", "Inserisci le credenziali del tuo sistema, oppure continua sul provider se gestisce l’accesso.", "Zugangsdaten aus deinem System eingeben — oder zum Anbieter weiterleiten, wenn dieser die Anmeldung übernimmt."),
    saveConnection: t("Save connection", "Bağlantıyı kaydet", "Enregistrer la connexion", "Guardar conexión", "Salva connessione", "Verbindung speichern"),
    connectionSaved: t("Connection saved.", "Bağlantı kaydedildi.", "Connexion enregistrée.", "Conexión guardada.", "Connessione salvata.", "Verbindung gespeichert."),
    details: t("Details", "Ayrıntılar", "Détails", "Detalles", "Dettagli", "Details"),
    close: t("Close", "Kapat", "Fermer", "Cerrar", "Chiudi", "Schließen"),
    shopApp: t("Shop app", "Mağaza uygulaması", "App boutique", "App de tienda", "App negozio", "Shop-App"),
    integrationApp: t("Integration", "Entegrasyon", "Intégration", "Integración", "Integrazione", "Integration"),
    categories: {
      all: t("All", "Tümü", "Tout", "Todas", "Tutte", "Alle"),
      "shipping-fulfillment": t("Shipping & fulfillment", "Kargo ve teslimat", "Livraison", "Envío y fulfillment", "Spedizione", "Versand & Fulfillment"),
      accounting: t("Accounting", "Muhasebe", "Comptabilité", "Contabilidad", "Contabilità", "Buchhaltung"),
      marketing: t("Marketing", "Pazarlama", "Marketing", "Marketing", "Marketing", "Marketing"),
      analytics: t("Analytics", "Analitik", "Analytique", "Analítica", "Analisi", "Analysen"),
      inventory: t("Inventory", "Stok", "Stock", "Inventario", "Inventario", "Bestand"),
      reviews: t("Reviews", "Yorumlar", "Avis", "Reseñas", "Recensioni", "Bewertungen"),
      storefront: t("Storefront", "Vitrin", "Vitrine", "Escaparate", "Vetrina", "Storefront"),
      other: t("Other", "Diğer", "Autre", "Otra", "Altro", "Sonstiges"),
    },
  };
}

export function appDisplayName(app) {
  const manifest = app?.manifest || {};
  return manifest.name || app?.handle || "";
}

export function appDescription(manifest, locale) {
  const d = manifest?.description;
  if (!d) return "";
  if (typeof d === "string") return d;
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  return d[loc] || d.en || d.de || Object.values(d).find((v) => typeof v === "string") || "";
}

export function appPricingLabel(manifest, copy) {
  const pricing = manifest?.pricing && typeof manifest.pricing === "object" ? manifest.pricing : { model: "free" };
  if (!pricing.model || pricing.model === "free") return copy.free;
  const amount = Number(pricing.amount_eur);
  const money = Number.isFinite(amount) ? `${amount.toFixed(amount % 1 === 0 ? 0 : 2)} €` : "";
  return `${money}${copy.perMonth}`.trim();
}
