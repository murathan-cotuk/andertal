import { lt } from "@/lib/locale-text";

const makeT = (locale) => (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

export function getNotificationSettingsCopy(locale) {
  const t = makeT(locale);
  return {
    pageTitle: t("Notification Settings", "Bildirim Ayarları", "Paramètres de notification", "Configuración de notificaciones", "Impostazioni notifiche", "Benachrichtigungseinstellungen"),
    emailTitle: t("Email Notifications", "E-posta Bildirimleri", "Notifications par e-mail", "Notificaciones por correo", "Notifiche email", "E-Mail-Benachrichtigungen"),
    emailSubtitle: t(
      "Choose which notifications you want to receive via email",
      "E-posta ile hangi bildirimleri almak istediğinizi seçin",
      "Choisissez les notifications que vous souhaitez recevoir par e-mail",
      "Elija qué notificaciones desea recibir por correo",
      "Scegli quali notifiche vuoi ricevere via email",
      "Wählen Sie aus, welche Benachrichtigungen Sie per E-Mail erhalten möchten",
    ),
    savePreferences: t("Save Preferences", "Tercihleri Kaydet", "Enregistrer les préférences", "Guardar preferencias", "Salva preferenze", "Einstellungen speichern"),
    items: [
      {
        key: "orderUpdates",
        title: t("Order Updates", "Sipariş Güncellemeleri", "Mises à jour des commandes", "Actualizaciones de pedidos", "Aggiornamenti ordine", "Bestellaktualisierungen"),
        description: t(
          "Get notified about new orders and order status changes",
          "Yeni siparişler ve sipariş durumu değişiklikleri hakkında bildirim alın",
          "Recevez des notifications sur les nouvelles commandes et les changements de statut",
          "Reciba notificaciones sobre nuevos pedidos y cambios de estado",
          "Ricevi notifiche su nuovi ordini e cambi di stato",
          "Erhalten Sie Benachrichtigungen über neue Bestellungen und Statusänderungen",
        ),
      },
      {
        key: "paymentNotifications",
        title: t("Payment Notifications", "Ödeme Bildirimleri", "Notifications de paiement", "Notificaciones de pago", "Notifiche di pagamento", "Zahlungsbenachrichtigungen"),
        description: t(
          "Receive notifications about payments and payouts",
          "Ödemeler ve para transferleri hakkında bildirim alın",
          "Recevez des notifications sur les paiements et les versements",
          "Reciba notificaciones sobre pagos y liquidaciones",
          "Ricevi notifiche su pagamenti e accrediti",
          "Erhalten Sie Benachrichtigungen zu Zahlungen und Auszahlungen",
        ),
      },
      {
        key: "productAlerts",
        title: t("Product Alerts", "Ürün Uyarıları", "Alertes produit", "Alertas de producto", "Avvisi prodotto", "Produktwarnungen"),
        description: t(
          "Get alerts when products are low in stock or need attention",
          "Stok azaldığında veya ürünler ilgi gerektirdiğinde uyarı alın",
          "Recevez des alertes lorsque le stock est faible ou qu'une action est requise",
          "Reciba alertas cuando haya poco stock o se requiera atención",
          "Ricevi avvisi quando i prodotti sono in esaurimento o richiedono attenzione",
          "Erhalten Sie Warnungen bei niedrigem Bestand oder wenn Handlungsbedarf besteht",
        ),
      },
      {
        key: "marketingEmails",
        title: t("Marketing Emails", "Pazarlama E-postaları", "E-mails marketing", "Correos de marketing", "Email marketing", "Marketing-E-Mails"),
        description: t(
          "Receive tips, updates, and promotional emails",
          "İpuçları, güncellemeler ve promosyon e-postaları alın",
          "Recevez des conseils, des mises à jour et des e-mails promotionnels",
          "Reciba consejos, novedades y correos promocionales",
          "Ricevi suggerimenti, aggiornamenti e email promozionali",
          "Erhalten Sie Tipps, Updates und Werbe-E-Mails",
        ),
      },
      {
        key: "weeklyReports",
        title: t("Weekly Reports", "Haftalık Raporlar", "Rapports hebdomadaires", "Informes semanales", "Report settimanali", "Wöchentliche Berichte"),
        description: t(
          "Get weekly summary reports of your store performance",
          "Mağaza performansınızın haftalık özet raporlarını alın",
          "Recevez un rapport hebdomadaire sur les performances de votre boutique",
          "Reciba resúmenes semanales del rendimiento de su tienda",
          "Ricevi report settimanali sulle prestazioni del negozio",
          "Erhalten Sie wöchentliche Zusammenfassungen Ihrer Shop-Performance",
        ),
      },
      {
        key: "securityAlerts",
        title: t("Security Alerts", "Güvenlik Uyarıları", "Alertes de sécurité", "Alertas de seguridad", "Avvisi di sicurezza", "Sicherheitswarnungen"),
        description: t(
          "Important security notifications and account changes",
          "Önemli güvenlik bildirimleri ve hesap değişiklikleri",
          "Notifications de sécurité importantes et modifications du compte",
          "Notificaciones de seguridad importantes y cambios de cuenta",
          "Notifiche di sicurezza importanti e modifiche account",
          "Wichtige Sicherheitshinweise und Kontoänderungen",
        ),
      },
    ],
  };
}

export function getCategoriesSettingsCopy(locale) {
  const t = makeT(locale);
  return {
    title: t("Category Management", "Kategori Yönetimi", "Gestion des catégories", "Gestión de categorías", "Gestione categorie", "Kategorienverwaltung"),
    subtitle: t(
      "Manage platform categories - Single source of truth",
      "Platform kategorilerini yönetin - Tek doğruluk kaynağı",
      "Gérez les catégories de la plateforme - Source unique de vérité",
      "Gestione las categorías de la plataforma - Fuente única de verdad",
      "Gestisci le categorie della piattaforma - Fonte unica di verità",
      "Plattformkategorien verwalten - Single Source of Truth",
    ),
    addSingle: t("Add Single Category", "Tek Kategori Ekle", "Ajouter une catégorie", "Agregar categoría única", "Aggiungi categoria singola", "Einzelne Kategorie hinzufügen"),
    addBulk: t("Bulk Add Categories (JSON)", "Toplu Kategori Ekle (JSON)", "Ajout en masse (JSON)", "Agregar categorías en lote (JSON)", "Aggiunta massiva categorie (JSON)", "Kategorien im Bulk hinzufügen (JSON)"),
    categoryName: t("Category Name *", "Kategori Adı *", "Nom de catégorie *", "Nombre de categoría *", "Nome categoria *", "Kategoriename *"),
    categorySlug: t("Category Slug *", "Kategori Slug *", "Slug catégorie *", "Slug de categoría *", "Slug categoria *", "Kategorie-Slug *"),
    description: t("Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung"),
    slugHelp: t(
      "URL-friendly slug (e.g., electronics, clothing)",
      "URL dostu slug (ör. electronics, clothing)",
      "Slug compatible URL (ex. electronics, clothing)",
      "Slug compatible con URL (ej. electronics, clothing)",
      "Slug compatibile URL (es. electronics, clothing)",
      "URL-freundlicher Slug (z. B. electronics, clothing)",
    ),
    descriptionPlaceholder: t("Category description...", "Kategori açıklaması...", "Description de la catégorie...", "Descripción de la categoría...", "Descrizione categoria...", "Kategoriebeschreibung..."),
    visibleInNav: t("Visible in navigation", "Navigasyonda görünür", "Visible dans la navigation", "Visible en navegación", "Visibile nella navigazione", "In Navigation sichtbar"),
    hasCollectionPage: t("Has collection page (/collections/slug)", "Koleksiyon sayfası var (/collections/slug)", "A une page collection (/collections/slug)", "Tiene página de colección (/collections/slug)", "Ha pagina collezione (/collections/slug)", "Hat Kollektionsseite (/collections/slug)"),
    addCategory: t("Add Category", "Kategori Ekle", "Ajouter une catégorie", "Agregar categoría", "Aggiungi categoria", "Kategorie hinzufügen"),
    addingCategory: t("Adding Category...", "Kategori ekleniyor...", "Ajout de la catégorie...", "Agregando categoría...", "Aggiunta categoria...", "Kategorie wird hinzugefügt..."),
    categoriesJson: t("Categories JSON", "Kategoriler JSON", "JSON des catégories", "JSON de categorías", "JSON categorie", "Kategorien JSON"),
    bulkJsonHelp: t("JSON array format for bulk category creation.", "Toplu kategori oluşturma için JSON dizi formatı.", "Format tableau JSON pour la création en masse.", "Formato de arreglo JSON para creación masiva.", "Formato array JSON per creazione massiva.", "JSON-Array-Format für Bulk-Erstellung."),
    addCategoriesBulk: t("Add Categories (Bulk)", "Kategorileri Ekle (Toplu)", "Ajouter des catégories (lot)", "Agregar categorías (lote)", "Aggiungi categorie (massivo)", "Kategorien hinzufügen (Bulk)"),
    addingCategories: t("Adding Categories...", "Kategoriler ekleniyor...", "Ajout des catégories...", "Agregando categorías...", "Aggiunta categorie...", "Kategorien werden hinzugefügt..."),
    categoriesHeader: (count) => t(`Categories (${count})`, `Kategoriler (${count})`, `Catégories (${count})`, `Categorías (${count})`, `Categorie (${count})`, `Kategorien (${count})`),
    expandAll: t("Expand all", "Tümünü Aç", "Tout développer", "Expandir todo", "Espandi tutto", "Alle öffnen"),
    collapseAll: t("Collapse all", "Tümünü Kapat", "Tout réduire", "Contraer todo", "Comprimi tutto", "Alle schließen"),
    loading: t("Loading...", "Yükleniyor...", "Chargement...", "Cargando...", "Caricamento...", "Wird geladen..."),
    noCategories: t("No categories yet. Add one using the form above.", "Henüz kategori yok. Yukarıdaki formdan ekleyin.", "Aucune catégorie pour le moment. Ajoutez-en une via le formulaire.", "Aún no hay categorías. Añada una con el formulario superior.", "Nessuna categoria al momento. Aggiungila con il modulo sopra.", "Noch keine Kategorien. Fügen Sie oben eine hinzu."),
    navBadge: t("Nav", "Menü", "Nav", "Nav", "Nav", "Nav"),
    collectionBadge: t("Collection", "Koleksiyon", "Collection", "Colección", "Collezione", "Kollektion"),
    inactiveBadge: t("Inactive", "Pasif", "Inactif", "Inactivo", "Inattivo", "Inaktiv"),
    childrenCount: (count) => t(`${count} sub`, `${count} alt`, `${count} sous`, `${count} sub`, `${count} sotto`, `${count} Unter`),
    deleteTitle: t("Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen"),
    deleteConfirm: (name) =>
      t(
        `Are you sure you want to delete "${name}"?`,
        `"${name}" kategorisini silmek istediğinize emin misiniz?`,
        `Voulez-vous vraiment supprimer "${name}" ?`,
        `¿Seguro que desea eliminar "${name}"?`,
        `Sei sicuro di voler eliminare "${name}"?`,
        `Möchten Sie "${name}" wirklich löschen?`,
      ),
    errors: {
      load: t("Categories could not be loaded", "Kategoriler yüklenemedi", "Impossible de charger les catégories", "No se pudieron cargar las categorías", "Impossibile caricare le categorie", "Kategorien konnten nicht geladen werden"),
      delete: t("Delete operation failed", "Silme işlemi başarısız", "Échec de la suppression", "Error al eliminar", "Eliminazione non riuscita", "Löschen fehlgeschlagen"),
      create: t("An error occurred while adding category", "Kategori eklenirken hata oluştu", "Erreur lors de l'ajout de la catégorie", "Error al agregar la categoría", "Errore durante l'aggiunta categoria", "Fehler beim Hinzufügen der Kategorie"),
      requiredNameSlug: t("Name and slug are required", "Ad ve slug zorunludur", "Le nom et le slug sont obligatoires", "Nombre y slug son obligatorios", "Nome e slug sono obbligatori", "Name und Slug sind erforderlich"),
      jsonArray: t("JSON must be an array", "JSON bir dizi olmalı", "Le JSON doit être un tableau", "El JSON debe ser un arreglo", "Il JSON deve essere un array", "JSON muss ein Array sein"),
    },
    success: {
      created: t("Category added successfully!", "Kategori başarıyla eklendi!", "Catégorie ajoutée avec succès !", "¡Categoría agregada con éxito!", "Categoria aggiunta con successo!", "Kategorie erfolgreich hinzugefügt!"),
      bulkCreated: (okCount, errCount) =>
        t(
          `${okCount} categories added successfully${errCount > 0 ? `, ${errCount} errors` : ""}`,
          `${okCount} kategori başarıyla eklendi${errCount > 0 ? `, ${errCount} hata` : ""}`,
          `${okCount} catégories ajoutées${errCount > 0 ? `, ${errCount} erreurs` : ""}`,
          `${okCount} categorías agregadas${errCount > 0 ? `, ${errCount} errores` : ""}`,
          `${okCount} categorie aggiunte${errCount > 0 ? `, ${errCount} errori` : ""}`,
          `${okCount} Kategorien hinzugefügt${errCount > 0 ? `, ${errCount} Fehler` : ""}`,
        ),
    },
  };
}

