import { lt } from "@/lib/locale-text";
import { resolveSellerFacingError, readSellerIsSuperuser } from "@/lib/seller-system-errors";

/** Read UI locale from URL path (sellercentral /en/... routes). */
export function getClientLocale() {
  if (typeof window === "undefined") return "de";
  const m = window.location.pathname.match(/^\/(en|de|tr|fr|es|it)(\/|$)/);
  if (m?.[1]) return m[1];
  try {
    const stored = localStorage.getItem("sellerUiLocale");
    if (stored) return String(stored).slice(0, 2).toLowerCase();
  } catch {
    /* ignore */
  }
  return "de";
}

/** Exact backend / API message → localized UI string. Keys are lowercase trimmed source text. */
const MESSAGE_MAP = {
  "unauthorized": { en: "Unauthorized", tr: "Yetkisiz", fr: "Non autorisé", es: "No autorizado", it: "Non autorizzato", de: "Nicht autorisiert" },
  "order not found": { en: "Order not found", tr: "Sipariş bulunamadı", fr: "Commande introuvable", es: "Pedido no encontrado", it: "Ordine non trovato", de: "Bestellung nicht gefunden" },
  "category not found": { en: "Category not found", tr: "Kategori bulunamadı", fr: "Catégorie introuvable", es: "Categoría no encontrada", it: "Categoria non trovata", de: "Kategorie nicht gefunden" },
  "database not configured": { en: "Database not configured", tr: "Veritabanı yapılandırılmadı", fr: "Base de données non configurée", es: "Base de datos no configurada", it: "Database non configurato", de: "Datenbank nicht konfiguriert" },
  "id required": { en: "ID required", tr: "ID gerekli", fr: "ID requis", es: "Se requiere ID", it: "ID richiesto", de: "ID erforderlich" },
  "import failed": { en: "Import failed", tr: "İçe aktarma başarısız", fr: "Échec de l'import", es: "Importación fallida", it: "Importazione fallita", de: "Import fehlgeschlagen" },
  "internal server error": { en: "Internal server error", tr: "Sunucu hatası", fr: "Erreur interne du serveur", es: "Error interno del servidor", it: "Errore interno del server", de: "Interner Serverfehler" },
  "request failed": { en: "Request failed", tr: "İstek başarısız", fr: "Échec de la requête", es: "Solicitud fallida", it: "Richiesta fallita", de: "Anfrage fehlgeschlagen" },
  "pdf error": { en: "PDF error", tr: "PDF hatası", fr: "Erreur PDF", es: "Error de PDF", it: "Errore PDF", de: "PDF-Fehler" },
  "your account must be verified before performing this action.": {
    en: "Your account must be verified before performing this action.",
    tr: "Bu işlem için hesabınızın doğrulanması gerekir.",
    fr: "Votre compte doit être vérifié avant cette action.",
    es: "Su cuenta debe verificarse antes de realizar esta acción.",
    it: "Il tuo account deve essere verificato prima di eseguire questa azione.",
    de: "Ihr Konto muss verifiziert sein, bevor diese Aktion ausgeführt werden kann.",
  },
  "please complete verification before accessing this area.": {
    en: "Please complete verification before accessing this area.",
    tr: "Bu alana erişmeden önce doğrulamayı tamamlayın.",
    fr: "Veuillez terminer la vérification avant d'accéder à cette zone.",
    es: "Complete la verificación antes de acceder a esta área.",
    it: "Completa la verifica prima di accedere a quest'area.",
    de: "Bitte schließen Sie die Verifizierung ab, bevor Sie auf diesen Bereich zugreifen.",
  },
  "your account has been suspended. please contact support.": {
    en: "Your account has been suspended. Please contact support.",
    tr: "Hesabınız askıya alındı. Lütfen destek ile iletişime geçin.",
    fr: "Votre compte a été suspendu. Veuillez contacter le support.",
    es: "Su cuenta ha sido suspendida. Contacte con soporte.",
    it: "Il tuo account è stato sospeso. Contatta il supporto.",
    de: "Ihr Konto wurde gesperrt. Bitte kontaktieren Sie den Support.",
  },
  "account flagged for elevated risk. please contact support.": {
    en: "Account flagged for elevated risk. Please contact support.",
    tr: "Hesap yüksek risk olarak işaretlendi. Lütfen destek ile iletişime geçin.",
    fr: "Compte signalé à risque élevé. Veuillez contacter le support.",
    es: "Cuenta marcada con riesgo elevado. Contacte con soporte.",
    it: "Account segnalato ad alto rischio. Contatta il supporto.",
    de: "Konto wegen erhöhtem Risiko markiert. Bitte kontaktieren Sie den Support.",
  },
  "name ve slug zorunludur": { en: "Name and slug are required", tr: "Ad ve slug zorunludur", fr: "Nom et slug requis", es: "Nombre y slug obligatorios", it: "Nome e slug obbligatori", de: "Name und Slug sind erforderlich" },
  "bu slug zaten kullanılıyor": { en: "This slug is already in use", tr: "Bu slug zaten kullanılıyor", fr: "Ce slug est déjà utilisé", es: "Este slug ya está en uso", it: "Questo slug è già in uso", de: "Dieser Slug wird bereits verwendet" },
  "alt kategoriler varken silinemez. önce alt kategorileri taşıyın veya silin.": {
    en: "Cannot delete while subcategories exist. Move or delete subcategories first.",
    tr: "Alt kategoriler varken silinemez. Önce alt kategorileri taşıyın veya silin.",
    fr: "Impossible de supprimer tant que des sous-catégories existent.",
    es: "No se puede eliminar mientras existan subcategorías.",
    it: "Impossibile eliminare finché esistono sottocategorie.",
    de: "Löschen nicht möglich, solange Unterkategorien existieren.",
  },
  "fehler beim laden": { en: "Error loading", tr: "Yükleme hatası", fr: "Erreur de chargement", es: "Error al cargar", it: "Errore di caricamento", de: "Fehler beim Laden" },
  "fehler beim speichern": { en: "Error saving", tr: "Kaydetme hatası", fr: "Erreur lors de l'enregistrement", es: "Error al guardar", it: "Errore durante il salvataggio", de: "Fehler beim Speichern" },
  "fehler beim löschen": { en: "Error deleting", tr: "Silme hatası", fr: "Erreur lors de la suppression", es: "Error al eliminar", it: "Errore durante l'eliminazione", de: "Fehler beim Löschen" },
  "upload fehlgeschlagen": { en: "Upload failed", tr: "Yükleme başarısız", fr: "Échec du téléchargement", es: "Error al subir", it: "Caricamento fallito", de: "Upload fehlgeschlagen" },
  "speichern fehlgeschlagen": { en: "Save failed", tr: "Kaydetme başarısız", fr: "Échec de l'enregistrement", es: "Error al guardar", it: "Salvataggio non riuscito", de: "Speichern fehlgeschlagen" },
  "löschen fehlgeschlagen": { en: "Delete failed", tr: "Silme başarısız", fr: "Échec de la suppression", es: "Error al eliminar", it: "Eliminazione non riuscita", de: "Löschen fehlgeschlagen" },
  "import fehlgeschlagen": { en: "Import failed", tr: "İçe aktarma başarısız", fr: "Échec de l'import", es: "Importación fallida", it: "Importazione fallita", de: "Import fehlgeschlagen" },
  "keine datei übermittelt": { en: "No file provided", tr: "Dosya sağlanmadı", fr: "Aucun fichier fourni", es: "No se proporcionó archivo", it: "Nessun file fornito", de: "Keine Datei übermittelt" },
  "blatt 'products' nicht gefunden": { en: "Sheet 'Products' not found", tr: "'Products' sayfası bulunamadı", fr: "Feuille 'Products' introuvable", es: "Hoja 'Products' no encontrada", it: "Foglio 'Products' non trovato", de: "Blatt 'Products' nicht gefunden" },
  "failed to save category": { en: "Failed to save category", tr: "Kategori kaydedilemedi", fr: "Échec de l'enregistrement de la catégorie", es: "Error al guardar la categoría", it: "Salvataggio categoria non riuscito", de: "Kategorie konnte nicht gespeichert werden" },
  "failed to add product": { en: "Failed to add product", tr: "Ürün eklenemedi", fr: "Échec de l'ajout du produit", es: "Error al añadir el producto", it: "Impossibile aggiungere il prodotto", de: "Produkt konnte nicht hinzugefügt werden" },
  "failed to remove product": { en: "Failed to remove product", tr: "Ürün kaldırılamadı", fr: "Échec de la suppression du produit", es: "Error al quitar el producto", it: "Impossibile rimuovere il prodotto", de: "Produkt konnte nicht entfernt werden" },
  "failed to load category": { en: "Failed to load category", tr: "Kategori yüklenemedi", fr: "Échec du chargement de la catégorie", es: "Error al cargar la categoría", it: "Impossibile caricare la categoria", de: "Kategorie konnte nicht geladen werden" },
  "failed to save settings.": { en: "Failed to save settings.", tr: "Ayarlar kaydedilemedi.", fr: "Échec de l'enregistrement des paramètres.", es: "Error al guardar la configuración.", it: "Impossibile salvare le impostazioni.", de: "Einstellungen konnten nicht gespeichert werden." },
  "document upload failed.": { en: "Document upload failed.", tr: "Belge yüklemesi başarısız.", fr: "Échec du téléchargement du document.", es: "Error al subir el documento.", it: "Caricamento documento non riuscito.", de: "Dokument-Upload fehlgeschlagen." },
  "failed to load collection": { en: "Failed to load collection", tr: "Koleksiyon yüklenemedi", fr: "Échec du chargement de la collection", es: "Error al cargar la colección", it: "Impossibile caricare la collezione", de: "Kollektion konnte nicht geladen werden" },
  "failed to add product to collection": { en: "Failed to add product to collection", tr: "Ürün koleksiyona eklenemedi", fr: "Échec de l'ajout du produit à la collection", es: "Error al añadir el producto a la colección", it: "Impossibile aggiungere il prodotto alla collezione", de: "Produkt konnte nicht zur Kollektion hinzugefügt werden" },
  "failed to remove product from collection": { en: "Failed to remove product from collection", tr: "Ürün koleksiyondan kaldırılamadı", fr: "Échec de la suppression du produit de la collection", es: "Error al quitar el producto de la colección", it: "Impossibile rimuovere il prodotto dalla collezione", de: "Produkt konnte nicht aus der Kollektion entfernt werden" },
  "failed to create collection": { en: "Failed to create collection", tr: "Koleksiyon oluşturulamadı", fr: "Échec de la création de la collection", es: "Error al crear la colección", it: "Impossibile creare la collezione", de: "Kollektion konnte nicht erstellt werden" },
  "failed to update collection": { en: "Failed to update collection", tr: "Koleksiyon güncellenemedi", fr: "Échec de la mise à jour de la collection", es: "Error al actualizar la colección", it: "Impossibile aggiornare la collezione", de: "Kollektion konnte nicht aktualisiert werden" },
  "failed to load product": { en: "Failed to load product", tr: "Ürün yüklenemedi", fr: "Échec du chargement du produit", es: "Error al cargar el producto", it: "Impossibile caricare il prodotto", de: "Produkt konnte nicht geladen werden" },
  "failed to load products": { en: "Failed to load products", tr: "Ürünler yüklenemedi", fr: "Échec du chargement des produits", es: "Error al cargar los productos", it: "Impossibile caricare i prodotti", de: "Produkte konnten nicht geladen werden" },
  "failed to load media": { en: "Failed to load media", tr: "Medya yüklenemedi", fr: "Échec du chargement des médias", es: "Error al cargar los medios", it: "Impossibile caricare i media", de: "Medien konnten nicht geladen werden" },
  "failed to save brand.": { en: "Failed to save brand.", tr: "Marka kaydedilemedi.", fr: "Échec de l'enregistrement de la marque.", es: "Error al guardar la marca.", it: "Impossibile salvare il marchio.", de: "Marke konnte nicht gespeichert werden." },
  "failed to delete.": { en: "Failed to delete.", tr: "Silinemedi.", fr: "Échec de la suppression.", es: "Error al eliminar.", it: "Eliminazione non riuscita.", de: "Löschen fehlgeschlagen." },
  "failed to load stripe connect status.": { en: "Failed to load Stripe Connect status.", tr: "Stripe Connect durumu yüklenemedi.", fr: "Échec du chargement du statut Stripe Connect.", es: "Error al cargar el estado de Stripe Connect.", it: "Impossibile caricare lo stato Stripe Connect.", de: "Stripe-Connect-Status konnte nicht geladen werden." },
  "failed to start stripe connect onboarding.": { en: "Failed to start Stripe Connect onboarding.", tr: "Stripe Connect onboarding başlatılamadı.", fr: "Échec du démarrage de l'onboarding Stripe Connect.", es: "Error al iniciar el onboarding de Stripe Connect.", it: "Impossibile avviare l'onboarding Stripe Connect.", de: "Stripe-Connect-Onboarding konnte nicht gestartet werden." },
  "failed to get dashboard link.": { en: "Failed to get dashboard link.", tr: "Dashboard bağlantısı alınamadı.", fr: "Échec de l'obtention du lien tableau de bord.", es: "Error al obtener el enlace del panel.", it: "Impossibile ottenere il link della dashboard.", de: "Dashboard-Link konnte nicht abgerufen werden." },
  "failed to load verification data.": { en: "Failed to load verification data.", tr: "Doğrulama verileri yüklenemedi.", fr: "Échec du chargement des données de vérification.", es: "Error al cargar los datos de verificación.", it: "Impossibile caricare i dati di verifica.", de: "Verifizierungsdaten konnten nicht geladen werden." },
  "pdf download failed.": { en: "PDF download failed.", tr: "PDF indirme başarısız.", fr: "Échec du téléchargement PDF.", es: "Error al descargar el PDF.", it: "Download PDF non riuscito.", de: "PDF-Download fehlgeschlagen." },
  "error": { en: "Error", tr: "Hata", fr: "Erreur", es: "Error", it: "Errore", de: "Fehler" },
  "save failed": { en: "Save failed", tr: "Kaydetme başarısız", fr: "Échec de l'enregistrement", es: "Error al guardar", it: "Salvataggio non riuscito", de: "Speichern fehlgeschlagen" },
  "failed to load collections": { en: "Failed to load collections", tr: "Koleksiyonlar yüklenemedi", fr: "Échec du chargement des collections", es: "Error al cargar las colecciones", it: "Impossibile caricare le collezioni", de: "Kollektionen konnten nicht geladen werden" },
  "failed to delete collection": { en: "Failed to delete collection", tr: "Koleksiyon silinemedi", fr: "Échec de la suppression de la collection", es: "Error al eliminar la colección", it: "Impossibile eliminare la collezione", de: "Kollektion konnte nicht gelöscht werden" },
  "failed to load categories": { en: "Failed to load categories", tr: "Kategoriler yüklenemedi", fr: "Échec du chargement des catégories", es: "Error al cargar las categorías", it: "Impossibile caricare le categorie", de: "Kategorien konnten nicht geladen werden" },
  "failed to load media": { en: "Failed to load media", tr: "Medya yüklenemedi", fr: "Échec du chargement des médias", es: "Error al cargar los medios", it: "Impossibile caricare i media", de: "Medien konnten nicht geladen werden" },
  "failed to add urls": { en: "Failed to add URLs", tr: "URL'ler eklenemedi", fr: "Échec de l'ajout des URL", es: "Error al añadir URLs", it: "Impossibile aggiungere URL", de: "URLs konnten nicht hinzugefügt werden" },
  "failed to create folder": { en: "Failed to create folder", tr: "Klasör oluşturulamadı", fr: "Échec de la création du dossier", es: "Error al crear la carpeta", it: "Impossibile creare la cartella", de: "Ordner konnte nicht erstellt werden" },
  "failed to delete folder": { en: "Failed to delete folder", tr: "Klasör silinemedi", fr: "Échec de la suppression du dossier", es: "Error al eliminar la carpeta", it: "Impossibile eliminare la cartella", de: "Ordner konnte nicht gelöscht werden" },
  "failed to load users": { en: "Failed to load users", tr: "Kullanıcılar yüklenemedi", fr: "Échec du chargement des utilisateurs", es: "Error al cargar usuarios", it: "Impossibile caricare gli utenti", de: "Benutzer konnten nicht geladen werden" },
  "export failed": { en: "Export failed", tr: "Dışa aktarma başarısız", fr: "Échec de l'export", es: "Error al exportar", it: "Esportazione non riuscita", de: "Export fehlgeschlagen" },
};

const PREFIX_RULES = [
  { re: /^backend unreachable/i, en: "Backend unreachable", de: "Backend nicht erreichbar", tr: "Backend'e ulaşılamıyor" },
  { re: /^pdf download failed/i, en: "PDF download failed", de: "PDF-Download fehlgeschlagen", tr: "PDF indirme başarısız" },
  { re: /^export failed/i, en: "Export failed", de: "Export fehlgeschlagen", tr: "Dışa aktarma başarısız" },
  { re: /^unknown brand/i, en: "Unknown brand", de: "Unbekannte Marke", tr: "Bilinmeyen marka" },
  { re: /^unknown category/i, en: "Unknown category", de: "Unbekannte Kategorie", tr: "Bilinmeyen kategori" },
  { re: /^unknown shipping group/i, en: "Unknown shipping group", de: "Unbekannte Versandgruppe", tr: "Bilinmeyen kargo grubu" },
];

function pickLocalized(entry, locale) {
  if (!entry) return null;
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  return entry[loc] || entry.en || entry.de || null;
}

/** Translate a raw API error string for display in the UI. */
export function translateApiError(message, locale) {
  const raw = String(message || "").trim();
  if (!raw) return raw;
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const key = raw.toLowerCase();
  const exact = pickLocalized(MESSAGE_MAP[key], loc);
  if (exact) return exact;

  for (const rule of PREFIX_RULES) {
    if (rule.re.test(raw)) {
      return rule[loc] || rule.en || raw;
    }
  }

  // If UI is English but message looks German-only, return generic fallback for unknown German
  if (loc === "en" && /[äöüß]|fehlgeschlagen|nicht gefunden|erforderlich|unbekannt/i.test(raw)) {
    return lt(loc, "An error occurred. Please try again.", "Bir hata oluştu. Lütfen tekrar deneyin.", "Une erreur s'est produite.", "Ocurrió un error.", "Si è verificato un errore.", "Ein Fehler ist aufgetreten.");
  }

  // If UI is German but message is untranslated English, use generic German fallback
  if (loc === "de" && /\b(failed|error|not found|required|invalid|unauthorized)\b/i.test(raw) && !/[äöüß]/i.test(raw)) {
    const mapped = pickLocalized(MESSAGE_MAP[key], "de");
    if (!mapped || mapped === raw) {
      return lt(loc, "An error occurred. Please try again.", "Bir hata oluştu. Lütfen tekrar deneyin.", "Une erreur s'est produite.", "Ocurrió un error.", "Si è verificato un errore.", "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
    }
  }

  return raw;
}

/** User-facing error from catch blocks: API message + locale + optional English fallback key. */
export function userError(err, locale, fallback) {
  const loc = locale || getClientLocale();
  const msg = err?.message ?? (typeof err === "string" ? err : "");
  const translated = translateApiError(String(msg || "").trim(), loc);
  if (translated) return translated;
  if (fallback) return translateApiError(String(fallback).trim(), loc);
  return lt(loc, "An error occurred. Please try again.", "Bir hata oluştu. Lütfen tekrar deneyin.", "Une erreur s'est produite.", "Ocurrió un error.", "Si è verificato un errore.", "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
}

/** Format an error for end users: seller-facing rules + locale translation. */
export function formatApiError(err, locale, { isSuperuser } = {}) {
  const loc = locale || getClientLocale();
  const su = isSuperuser ?? readSellerIsSuperuser();
  const resolved = resolveSellerFacingError(err, loc, su);
  return translateApiError(resolved, loc);
}
