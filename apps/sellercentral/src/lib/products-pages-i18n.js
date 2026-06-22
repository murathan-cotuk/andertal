import { lt } from "@/lib/locale-text";

const t = (locale, en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

export function getProductCollectionsCopy(locale) {
  return {
    loadError: t(locale, "Failed to load collections", "Koleksiyonlar yüklenemedi", "Impossible de charger les collections", "No se pudieron cargar las colecciones", "Impossibile caricare le collezioni", "Kollektionen konnten nicht geladen werden"),
    deleteError: t(locale, "Failed to delete collection", "Koleksiyon silinemedi", "Impossible de supprimer la collection", "No se pudo eliminar la colección", "Impossibile eliminare la collezione", "Kollektion konnte nicht gelöscht werden"),
    pageTitle: t(locale, "Collections", "Koleksiyonlar", "Collections", "Colecciones", "Collezioni", "Kollektionen"),
    pageSubtitle: t(locale, "Add or edit a collection to open its full form in a new page.", "Yeni bir sayfada tam formunu açmak için koleksiyon ekleyin veya düzenleyin.", "Ajoutez ou modifiez une collection pour ouvrir son formulaire complet dans une nouvelle page.", "Agrega o edita una colección para abrir su formulario completo en una nueva página.", "Aggiungi o modifica una collezione per aprire il modulo completo in una nuova pagina.", "Fügen Sie eine Kollektion hinzu oder bearbeiten Sie sie, um das vollständige Formular auf einer neuen Seite zu öffnen."),
    addCollection: t(locale, "Add collection", "Koleksiyon ekle", "Ajouter une collection", "Agregar colección", "Aggiungi collezione", "Kollektion hinzufügen"),
    loading: t(locale, "Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    emptyTitle: t(locale, "No collections yet", "Henüz koleksiyon yok", "Aucune collection pour le moment", "Aún no hay colecciones", "Nessuna collezione ancora", "Noch keine Kollektionen"),
    emptyBody: t(locale, 'Click "Add collection" to create a new collection. It will appear in this list.', '"Koleksiyon ekle"ye tıklayarak yeni koleksiyon oluşturun. Bu listede görünecektir.', 'Cliquez sur "Ajouter une collection" pour en créer une nouvelle. Elle apparaîtra dans cette liste.', 'Haz clic en "Agregar colección" para crear una nueva. Aparecerá en esta lista.', 'Fai clic su "Aggiungi collezione" per crearne una nuova. Apparirà in questo elenco.', 'Klicken Sie auf "Kollektion hinzufügen", um eine neue Kollektion zu erstellen. Sie erscheint in dieser Liste.'),
    singular: t(locale, "collection", "koleksiyon", "collection", "colección", "collezione", "Kollektion"),
    plural: t(locale, "collections", "koleksiyonlar", "collections", "colecciones", "collezioni", "Kollektionen"),
    titleCol: t(locale, "Title", "Başlık", "Titre", "Título", "Titolo", "Titel"),
    handleCol: t(locale, "Handle", "Handle", "Handle", "Handle", "Handle", "Handle"),
    edit: t(locale, "Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten"),
    del: t(locale, "Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen"),
    deleteTitle: t(locale, "Delete collection", "Koleksiyonu sil", "Supprimer la collection", "Eliminar colección", "Elimina collezione", "Kollektion löschen"),
    deleting: t(locale, "Deleting…", "Siliniyor…", "Suppression…", "Eliminando…", "Eliminazione…", "Löschen…"),
    cancel: t(locale, "Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    deleteConfirmPrefix: t(locale, "Are you sure you want to delete", "Silmek istediğinize emin misiniz", "Voulez-vous vraiment supprimer", "¿Seguro que quieres eliminar", "Sei sicuro di voler eliminare", "Möchten Sie wirklich löschen"),
    thisCollection: t(locale, "this collection", "bu koleksiyon", "cette collection", "esta colección", "questa collezione", "diese Kollektion"),
  };
}

export function getUploadTemplatesCopy(locale) {
  return {
    title: t(locale, "Upload Templates", "Yükleme Şablonları", "Modèles d'import", "Plantillas de carga", "Modelli di caricamento", "Upload-Vorlagen"),
    available: t(locale, "Available Templates", "Mevcut Şablonlar", "Modèles disponibles", "Plantillas disponibles", "Modelli disponibili", "Verfügbare Vorlagen"),
    subtitle: t(locale, "Download templates to ensure your data is formatted correctly for bulk uploads", "Toplu yükleme için verilerin doğru formatta olması adına şablonları indirin", "Téléchargez des modèles pour garantir le bon format des données pour l'import en masse", "Descarga plantillas para asegurar que los datos estén correctamente formateados para cargas masivas", "Scarica i modelli per assicurarti che i dati siano formattati correttamente per i caricamenti in blocco", "Laden Sie Vorlagen herunter, um sicherzustellen, dass Ihre Daten für den Massenimport korrekt formatiert sind"),
    productTemplateTitle: t(locale, "Product Upload Template", "Ürün Yükleme Şablonu", "Modèle d'import produit", "Plantilla de carga de productos", "Modello caricamento prodotti", "Produkt-Upload-Vorlage"),
    productTemplateDesc: t(locale, "Use this template for bulk product uploads. Includes all required fields and formatting guidelines.", "Bu şablonu toplu ürün yükleme için kullanın. Gerekli tüm alanları ve format kurallarını içerir.", "Utilisez ce modèle pour les imports produits en masse. Il inclut tous les champs requis et les règles de format.", "Usa esta plantilla para cargas masivas de productos. Incluye todos los campos requeridos y las pautas de formato.", "Usa questo modello per caricamenti massivi di prodotti. Include tutti i campi richiesti e le regole di formattazione.", "Verwenden Sie diese Vorlage für den Massenimport von Produkten. Sie enthält alle erforderlichen Felder und Formatregeln."),
    imageTemplateTitle: t(locale, "Bulk Images Template", "Toplu Görsel Şablonu", "Modèle images en masse", "Plantilla de imágenes masivas", "Modello immagini in blocco", "Vorlage für Massenbilder"),
    imageTemplateDesc: t(locale, "Template for uploading multiple product images at once. Link images to products by SKU.", "Birden fazla ürün görselini aynı anda yükleme şablonu. Görselleri SKU ile ürünlere bağlayın.", "Modèle pour importer plusieurs images produit en une fois. Liez les images aux produits via SKU.", "Plantilla para subir varias imágenes de producto a la vez. Vincula las imágenes con productos por SKU.", "Modello per caricare più immagini prodotto in una volta. Collega le immagini ai prodotti tramite SKU.", "Vorlage zum gleichzeitigen Hochladen mehrerer Produktbilder. Verknüpfen Sie Bilder per SKU mit Produkten."),
    videoTemplateTitle: t(locale, "Bulk Videos Template", "Toplu Video Şablonu", "Modèle vidéos en masse", "Plantilla de videos masivos", "Modello video in blocco", "Vorlage für Massenvideos"),
    videoTemplateDesc: t(locale, "Template for uploading product videos. Include video URLs and thumbnail images.", "Ürün videoları yükleme şablonu. Video URL'leri ve küçük görselleri ekleyin.", "Modèle pour importer des vidéos produit. Incluez les URL vidéo et les miniatures.", "Plantilla para subir videos de productos. Incluye URLs de video e imágenes miniatura.", "Modello per caricare video prodotto. Includi URL video e miniature.", "Vorlage zum Hochladen von Produktvideos. Fügen Sie Video-URLs und Vorschaubilder hinzu."),
    download: t(locale, "Download Template", "Şablonu indir", "Télécharger le modèle", "Descargar plantilla", "Scarica modello", "Vorlage herunterladen"),
  };
}

export function getBulkMediaCopy(locale, type) {
  const isVideo = type === "video";
  return {
    title: isVideo
      ? t(locale, "Bulk Video Upload", "Toplu Video Yükleme", "Import vidéo en masse", "Carga masiva de videos", "Caricamento video in blocco", "Massen-Video-Upload")
      : t(locale, "Bulk Image Upload", "Toplu Görsel Yükleme", "Import image en masse", "Carga masiva de imágenes", "Caricamento immagini in blocco", "Massenbild-Upload"),
    sectionTitle: isVideo
      ? t(locale, "Upload Multiple Videos", "Birden Fazla Video Yükle", "Importer plusieurs vidéos", "Subir varios videos", "Carica più video", "Mehrere Videos hochladen")
      : t(locale, "Upload Multiple Images", "Birden Fazla Görsel Yükle", "Importer plusieurs images", "Subir varias imágenes", "Carica più immagini", "Mehrere Bilder hochladen"),
    downloadTemplate: t(locale, "Download Template", "Şablonu indir", "Télécharger le modèle", "Descargar plantilla", "Scarica modello", "Vorlage herunterladen"),
    dropText: isVideo
      ? t(locale, "Click to select videos or drag and drop", "Videoları seçmek için tıklayın veya sürükleyip bırakın", "Cliquez pour sélectionner des vidéos ou glissez-déposez", "Haz clic para seleccionar videos o arrastra y suelta", "Fai clic per selezionare video o trascina e rilascia", "Zum Auswählen von Videos klicken oder per Drag-and-drop ziehen")
      : t(locale, "Click to select images or drag and drop", "Görselleri seçmek için tıklayın veya sürükleyip bırakın", "Cliquez pour sélectionner des images ou glissez-déposez", "Haz clic para seleccionar imágenes o arrastra y suelta", "Fai clic per selezionare immagini o trascina e rilascia", "Zum Auswählen von Bildern klicken oder per Drag-and-drop ziehen"),
    supportText: isVideo
      ? t(locale, "Supports MP4, MOV, AVI. Maximum 100MB per file", "MP4, MOV, AVI desteklenir. Dosya başına en fazla 100MB", "Prend en charge MP4, MOV, AVI. 100 Mo maximum par fichier", "Admite MP4, MOV, AVI. Máximo 100 MB por archivo", "Supporta MP4, MOV, AVI. Massimo 100 MB per file", "Unterstützt MP4, MOV, AVI. Maximal 100 MB pro Datei")
      : t(locale, "Supports JPG, PNG, GIF. Maximum 10MB per file", "JPG, PNG, GIF desteklenir. Dosya başına en fazla 10MB", "Prend en charge JPG, PNG, GIF. 10 Mo maximum par fichier", "Admite JPG, PNG, GIF. Máximo 10 MB por archivo", "Supporta JPG, PNG, GIF. Massimo 10 MB per file", "Unterstützt JPG, PNG, GIF. Maximal 10 MB pro Datei"),
    selectedLabel: isVideo
      ? t(locale, "Selected Videos", "Seçilen Videolar", "Vidéos sélectionnées", "Videos seleccionados", "Video selezionati", "Ausgewählte Videos")
      : t(locale, "Selected Images", "Seçilen Görseller", "Images sélectionnées", "Imágenes seleccionadas", "Immagini selezionate", "Ausgewählte Bilder"),
    uploadButtonPrefix: isVideo
      ? t(locale, "Upload", "Yükle", "Importer", "Subir", "Carica", "Hochladen")
      : t(locale, "Upload", "Yükle", "Importer", "Subir", "Carica", "Hochladen"),
    uploadButtonSuffix: isVideo
      ? t(locale, "Videos", "Video", "vidéos", "videos", "video", "Videos")
      : t(locale, "Images", "Görsel", "images", "imágenes", "immagini", "Bilder"),
  };
}

export function getSingleUploadCopy(locale) {
  return {
    uncategorized: t(locale, "Uncategorized", "Kategorisiz", "Sans catégorie", "Sin categoría", "Senza categoria", "Ohne Kategorie"),
    sellerRequired: t(locale, "Seller ID is required. Please log in again.", "Satıcı ID zorunludur. Lütfen tekrar giriş yapın.", "L'identifiant vendeur est requis. Veuillez vous reconnecter.", "Se requiere ID de vendedor. Inicia sesión de nuevo.", "L'ID venditore è obbligatorio. Accedi di nuovo.", "Verkäufer-ID ist erforderlich. Bitte erneut anmelden."),
    created: t(locale, "Product created successfully!", "Ürün başarıyla oluşturuldu!", "Produit créé avec succès !", "¡Producto creado correctamente!", "Prodotto creato con successo!", "Produkt erfolgreich erstellt!"),
    creatingError: t(locale, "An error occurred while creating the product.", "Ürün oluşturulurken bir hata oluştu.", "Une erreur s'est produite lors de la création du produit.", "Ocurrió un error al crear el producto.", "Si è verificato un errore durante la creazione del prodotto.", "Beim Erstellen des Produkts ist ein Fehler aufgetreten."),
    pageTitle: t(locale, "Add product", "Ürün ekle", "Ajouter un produit", "Agregar producto", "Aggiungi prodotto", "Produkt hinzufügen"),
    inventoryBack: t(locale, "Inventory", "Envanter", "Inventaire", "Inventario", "Inventario", "Bestand"),
    creating: t(locale, "Creating…", "Oluşturuluyor…", "Création…", "Creando…", "Creazione…", "Erstellen…"),
    createProduct: t(locale, "Create product", "Ürün oluştur", "Créer un produit", "Crear producto", "Crea prodotto", "Produkt erstellen"),
    categoriesFallback: t(locale, "Categories could not be loaded from the backend (check NEXT_PUBLIC_MEDUSA_BACKEND_URL on Vercel, e.g. https://api.andertal.com). Using default category for now.", "Kategoriler backend'den yüklenemedi (Vercel'de NEXT_PUBLIC_MEDUSA_BACKEND_URL ayarını kontrol edin, ör. https://api.andertal.com). Şimdilik varsayılan kategori kullanılıyor.", "Les catégories n'ont pas pu être chargées depuis le backend (vérifiez NEXT_PUBLIC_MEDUSA_BACKEND_URL sur Vercel, p. ex. https://api.andertal.com). Catégorie par défaut utilisée pour le moment.", "No se pudieron cargar las categorías desde el backend (revisa NEXT_PUBLIC_MEDUSA_BACKEND_URL en Vercel, p. ej. https://api.andertal.com). Se usará la categoría predeterminada por ahora.", "Impossibile caricare le categorie dal backend (controlla NEXT_PUBLIC_MEDUSA_BACKEND_URL su Vercel, es. https://api.andertal.com). Per ora viene usata la categoria predefinita.", "Kategorien konnten nicht aus dem Backend geladen werden (NEXT_PUBLIC_MEDUSA_BACKEND_URL in Vercel prüfen, z. B. https://api.andertal.com). Vorerst wird die Standardkategorie verwendet."),
    newProduct: t(locale, "New product", "Yeni ürün", "Nouveau produit", "Nuevo producto", "Nuovo prodotto", "Neues Produkt"),
    productTitle: t(locale, "Product title", "Ürün başlığı", "Titre du produit", "Título del producto", "Titolo prodotto", "Produkttitel"),
    skuHelp: t(locale, "SKU (optional, auto-generated from title if empty)", "SKU (isteğe bağlı, boşsa başlıktan otomatik üretilir)", "SKU (optionnel, généré automatiquement depuis le titre si vide)", "SKU (opcional, se genera automáticamente desde el título si está vacío)", "SKU (opzionale, generato automaticamente dal titolo se vuoto)", "SKU (optional, wird bei leerem Feld automatisch aus dem Titel erzeugt)"),
    description: t(locale, "Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung"),
    descriptionPlaceholder: t(locale, "Product description…", "Ürün açıklaması…", "Description du produit…", "Descripción del producto…", "Descrizione prodotto…", "Produktbeschreibung…"),
    category: t(locale, "Category", "Kategori", "Catégorie", "Categoría", "Categoria", "Kategorie"),
    loadingCategories: t(locale, "Loading categories…", "Kategoriler yükleniyor…", "Chargement des catégories…", "Cargando categorías…", "Caricamento categorie…", "Kategorien werden geladen…"),
    selectCategory: t(locale, "Select category", "Kategori seçin", "Sélectionner une catégorie", "Seleccionar categoría", "Seleziona categoria", "Kategorie auswählen"),
    price: t(locale, "Price (€)", "Fiyat (€)", "Prix (€)", "Precio (€)", "Prezzo (€)", "Preis (€)"),
    inventory: t(locale, "Inventory", "Stok", "Stock", "Inventario", "Inventario", "Bestand"),
    status: t(locale, "Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    sellerId: t(locale, "Seller ID", "Satıcı ID", "ID vendeur", "ID de vendedor", "ID venditore", "Verkäufer-ID"),
    fromLogin: t(locale, "From login", "Girişten", "Depuis la connexion", "Desde inicio de sesión", "Dal login", "Vom Login"),
    variantsHeading: t(locale, "Variants (e.g. Color, Size)", "Varyantlar (örn. Renk, Beden)", "Variantes (ex. Couleur, Taille)", "Variantes (p. ej. Color, Talla)", "Varianti (es. Colore, Taglia)", "Varianten (z. B. Farbe, Größe)"),
    addVariant: t(locale, "Add variant", "Varyant ekle", "Ajouter une variante", "Agregar variante", "Aggiungi variante", "Variante hinzufügen"),
    variantName: t(locale, "Variant name", "Varyant adı", "Nom de variante", "Nombre de variante", "Nome variante", "Variantenname"),
    variantNamePlaceholder: t(locale, "e.g. Color, Size", "örn. Renk, Beden", "ex. Couleur, Taille", "p. ej. Color, Talla", "es. Colore, Taglia", "z. B. Farbe, Größe"),
    preset: t(locale, "Preset", "Hazır seçenek", "Préréglage", "Preajuste", "Preset", "Voreinstellung"),
    useCommonOptions: t(locale, "Use common options…", "Sık kullanılan seçenekleri kullan…", "Utiliser des options courantes…", "Usar opciones comunes…", "Usa opzioni comuni…", "Häufige Optionen verwenden…"),
    removeVariant: t(locale, "Remove variant", "Varyantı kaldır", "Supprimer la variante", "Eliminar variante", "Rimuovi variante", "Variante entfernen"),
    value: t(locale, "Value", "Değer", "Valeur", "Valor", "Valore", "Wert"),
    qty: t(locale, "Qty", "Adet", "Qté", "Cant.", "Qtà", "Menge"),
    remove: t(locale, "Remove", "Kaldır", "Supprimer", "Eliminar", "Rimuovi", "Entfernen"),
    addOption: t(locale, "Add option", "Seçenek ekle", "Ajouter une option", "Agregar opción", "Aggiungi opzione", "Option hinzufügen"),
    statusDraft: t(locale, "Draft", "Taslak", "Brouillon", "Borrador", "Bozza", "Entwurf"),
    statusPublished: t(locale, "Published", "Yayında", "Publié", "Publicado", "Pubblicato", "Veröffentlicht"),
    statusArchived: t(locale, "Archived", "Arşivlendi", "Archivé", "Archivado", "Archiviato", "Archiviert"),
  };
}
