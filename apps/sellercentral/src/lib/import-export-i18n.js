import { lt } from "@/lib/locale-text";

/** Resolve locale from API request: query ?locale=, Accept-Language, default en. */
export function resolveRequestLocale(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("locale");
    if (q) return String(q).slice(0, 2).toLowerCase();
  } catch {
    /* ignore */
  }
  const al = request.headers.get("accept-language") || "";
  const first = al.split(",")[0]?.trim().slice(0, 2).toLowerCase();
  if (["en", "tr", "fr", "es", "it", "de"].includes(first)) return first;
  return "de";
}

export function getImportApiMessages(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    noFile: t("No file provided", "Dosya sağlanmadı", "Aucun fichier fourni", "No se proporcionó archivo", "Nessun file fornito", "Keine Datei übermittelt"),
    sheetNotFound: t("Sheet 'Products' not found", "'Products' sayfası bulunamadı", "Feuille 'Products' introuvable", "Hoja 'Products' no encontrada", "Foglio 'Products' non trovato", "Blatt 'Products' nicht gefunden"),
    noDataRows: t(
      "No data rows found (rows must start from row 4)",
      "Veri satırı bulunamadı (satırlar 4. satırdan başlamalı)",
      "Aucune ligne de données (les lignes doivent commencer à la ligne 4)",
      "No se encontraron filas de datos (las filas deben empezar en la fila 4)",
      "Nessuna riga dati (le righe devono iniziare dalla riga 4)",
      "Keine Datenzeilen gefunden (Zeilen müssen ab Zeile 4 beginnen)"
    ),
    noParentRows: t(
      "No parent rows found. Add rows with product_type='parent'.",
      "Parent satırı bulunamadı. product_type='parent' olan satırlar ekleyin.",
      "Aucune ligne parent. Ajoutez des lignes avec product_type='parent'.",
      "No se encontraron filas parent. Añada filas con product_type='parent'.",
      "Nessuna riga parent. Aggiungi righe con product_type='parent'.",
      "Keine Parent-Zeilen gefunden. Zeilen mit product_type='parent' hinzufügen."
    ),
    validationFailed: t("Excel validation failed", "Excel doğrulaması başarısız", "Échec de validation Excel", "Validación de Excel fallida", "Validazione Excel fallita", "Excel-Validierung fehlgeschlagen"),
    importFailed: t("Import failed", "İçe aktarma başarısız", "Échec de l'import", "Importación fallida", "Importazione fallita", "Import fehlgeschlagen"),
    unknownBrandChild: (name) =>
      t(`Unknown brand (child row): "${name}"`, `Bilinmeyen marka (child satır): "${name}"`, `Marque inconnue (ligne enfant) : « ${name} »`, `Marca desconocida (fila child): "${name}"`, `Marca sconosciuta (riga child): "${name}"`, `Unbekannte Marke (child row): "${name}"`),
    unknownCategoryChild: (slug) =>
      t(`Unknown category (child row): "${slug}"`, `Bilinmeyen kategori (child satır): "${slug}"`, `Catégorie inconnue (ligne enfant) : « ${slug} »`, `Categoría desconocida (fila child): "${slug}"`, `Categoria sconosciuta (riga child): "${slug}"`, `Unbekannte Kategorie (child row): "${slug}"`),
    unknownShippingChild: (name) =>
      t(`Unknown shipping group (child row): "${name}"`, `Bilinmeyen kargo grubu (child satır): "${name}"`, `Groupe d'expédition inconnu (ligne enfant) : « ${name} »`, `Grupo de envío desconocido (fila child): "${name}"`, `Gruppo spedizione sconosciuto (riga child): "${name}"`, `Unbekannte Versandgruppe (child row): "${name}"`),
    unknownBrand: (name) =>
      t(`Unknown brand (not in system): "${name}"`, `Bilinmeyen marka (sistemde yok): "${name}"`, `Marque inconnue (pas dans le système) : « ${name} »`, `Marca desconocida (no en el sistema): "${name}"`, `Marca sconosciuta (non nel sistema): "${name}"`, `Unbekannte Marke (nicht im System): "${name}"`),
    unknownCategory: (slug) =>
      t(`Unknown category (slug): "${slug}"`, `Bilinmeyen kategori (slug): "${slug}"`, `Catégorie inconnue (slug) : « ${slug} »`, `Categoría desconocida (slug): "${slug}"`, `Categoria sconosciuta (slug): "${slug}"`, `Unbekannte Kategorie (slug): "${slug}"`),
    unknownShipping: (name) =>
      t(`Unknown shipping group: "${name}"`, `Bilinmeyen kargo grubu: "${name}"`, `Groupe d'expédition inconnu : « ${name} »`, `Grupo de envío desconocido: "${name}"`, `Gruppo spedizione sconosciuto: "${name}"`, `Unbekannte Versandgruppe: "${name}"`),
    gpsrWarning: (msg) =>
      t(`Warning: variants updated, but GPSR fields still missing: ${msg}`, `Uyarı: varyantlar güncellendi ancak GPSR alanları eksik: ${msg}`, `Avertissement : variantes mises à jour, champs GPSR manquants : ${msg}`, `Aviso: variantes actualizadas, faltan campos GPSR: ${msg}`, `Avviso: varianti aggiornate, campi GPSR mancanti: ${msg}`, `Warnung: Varianten aktualisiert, aber GPSR-Felder fehlen noch: ${msg}`),
    missingTitle: t("Missing title (or title_de/title_en)", "Başlık eksik (veya title_de/title_en)", "Titre manquant (ou title_de/title_en)", "Falta título (o title_de/title_en)", "Titolo mancante (o title_de/title_en)", "Titel fehlt (oder title_de/title_en)"),
    templateSelectCategory: t(
      "Please select at least one category before downloading the template.",
      "Şablonu indirmeden önce en az bir kategori seçin.",
      "Veuillez sélectionner au moins une catégorie avant de télécharger le modèle.",
      "Seleccione al menos una categoría antes de descargar la plantilla.",
      "Seleziona almeno una categoria prima di scaricare il modello.",
      "Bitte mindestens eine Kategorie wählen, bevor Sie die Vorlage laden."
    ),
    templateCategoriesNotFound: t(
      "None of the selected categories were found in the system. Please reselect or check slugs.",
      "Seçilen kategorilerin hiçbiri sistemde bulunamadı. Yeniden seçin veya slug'ları kontrol edin.",
      "Aucune des catégories sélectionnées n'a été trouvée. Resélectionnez ou vérifiez les slugs.",
      "Ninguna de las categorías seleccionadas se encontró en el sistema.",
      "Nessuna delle categorie selezionate trovata nel sistema.",
      "Keine der gewählten Kategorien wurde im System gefunden. Bitte erneut auswählen oder Slugs prüfen."
    ),
    templateFailed: t("Template failed", "Şablon başarısız", "Échec du modèle", "Plantilla fallida", "Modello fallito", "Vorlage fehlgeschlagen"),
    templateGetHint: t(
      "Please download the template via the Import/Export page (POST with category selection and login).",
      "Lütfen şablonu İçe/Dışa Aktar sayfasından indirin (kategori seçimi ve giriş ile POST).",
      "Téléchargez le modèle via la page Import/Export (POST avec sélection de catégories).",
      "Descargue la plantilla desde la página Importar/Exportar (POST con categorías y login).",
      "Scarica il modello dalla pagina Import/Export (POST con categorie e login).",
      "Bitte die Vorlage über die Import/Export-Seite herunterladen (POST mit Kategorieauswahl und Anmeldung)."
    ),
    exportFailed: t("Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione fallita", "Export fehlgeschlagen"),
    missingSellerToken: t("Missing seller token", "Satıcı token'ı eksik", "Jeton vendeur manquant", "Falta token de vendedor", "Token venditore mancante", "Seller-Token fehlt"),
  };
}

export function getImportExportCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const api = getImportApiMessages(locale);
  return {
    ...api,
    pageTitle: t("Import / Export", "İçe / Dışa Aktar", "Import / Export", "Importar / Exportar", "Importa / Esporta", "Import / Export"),
    pageSubtitle: t(
      "Import and export products, orders and customers in bulk",
      "Ürünleri, siparişleri ve müşterileri toplu içe/dışa aktarın",
      "Importer et exporter produits, commandes et clients en masse",
      "Importar y exportar productos, pedidos y clientes en masa",
      "Importa ed esporta prodotti, ordini e clienti in blocco",
      "Produkte, Bestellungen und Kunden in großen Mengen importieren und exportieren"
    ),
    tabImport: t("Import", "İçe aktar", "Import", "Importar", "Importa", "Import"),
    tabExport: t("Export", "Dışa aktar", "Export", "Exportar", "Esporta", "Export"),
    allSelected: t("✓ all", "✓ tümü", "✓ tout", "✓ todo", "✓ tutto", "✓ alle"),
    partialSelected: t("partial", "kısmi", "partiel", "parcial", "parziale", "teilweise"),
    noSubcategories: t("No subcategories.", "Alt kategori yok.", "Aucune sous-catégorie.", "Sin subcategorías.", "Nessuna sottocategoria.", "Keine Unterkategorien."),
    templatesTitle: t("Download templates", "Şablonları indir", "Télécharger les modèles", "Descargar plantillas", "Scarica modelli", "Templates herunterladen"),
    templatesSubtitle: t(
      "Select categories, then load the template. The second sheet explains all columns in your shop language.",
      "Kategorileri seçin, ardından şablonu yükleyin. İkinci sayfa tüm sütunları mağaza dilinizde açıklar.",
      "Choisissez les catégories, puis chargez le modèle. La deuxième feuille explique toutes les colonnes.",
      "Seleccione categorías y cargue la plantilla. La segunda hoja explica todas las columnas.",
      "Seleziona le categorie, poi carica il modello. Il secondo foglio spiega tutte le colonne.",
      "Kategorien wählen, dann die Vorlage laden. Das zweite Blatt erklärt alle Spalten in Ihrer Shopsprache."
    ),
    categoriesLoading: t("Loading categories…", "Kategoriler yükleniyor…", "Chargement des catégories…", "Cargando categorías…", "Caricamento categorie…", "Kategorien werden geladen…"),
    categoriesLoadError: t("Could not load categories.", "Kategoriler yüklenemedi.", "Impossible de charger les catégories.", "No se pudieron cargar las categorías.", "Impossibile caricare le categorie.", "Kategorien konnten nicht geladen werden."),
    categorySelectLabel: t("Select category (required for download)", "Kategori seçin (indirme için zorunlu)", "Sélectionner une catégorie (obligatoire)", "Seleccionar categoría (obligatorio)", "Seleziona categoria (obbligatorio)", "Kategorie auswählen (Pflicht für Download)"),
    selectedCount: (n) => t(`${n} selected`, `${n} seçildi`, `${n} sélectionné(s)`, `${n} seleccionado(s)`, `${n} selezionato/i`, `${n} ausgewählt`),
    reset: t("Reset", "Sıfırla", "Réinitialiser", "Restablecer", "Reimposta", "Zurücksetzen"),
    selectedCategories: t("Selected categories", "Seçilen kategoriler", "Catégories sélectionnées", "Categorías seleccionadas", "Categorie selezionate", "Ausgewählte Kategorien"),
    noCategorySelected: t("No category selected yet.", "Henüz kategori seçilmedi.", "Aucune catégorie sélectionnée.", "Aún no hay categoría seleccionada.", "Nessuna categoria selezionata.", "Noch keine Kategorie ausgewählt."),
    parent: t("Parent", "Üst", "Parent", "Padre", "Genitore", "Parent"),
    templateProducts: t("Products", "Ürünler", "Produits", "Productos", "Prodotti", "Produkte"),
    templateProductsDesc: t("Parent/Child, variants, dropdowns, guide", "Parent/Child, varyantlar, açılır listeler, kılavuz", "Parent/Child, variantes, listes, guide", "Parent/Child, variantes, desplegables, guía", "Parent/Child, varianti, dropdown, guida", "Parent/Child, Varianten, Dropdowns, Kılavuz"),
    templateCollections: t("Collections", "Koleksiyonlar", "Collections", "Colecciones", "Collezioni", "Kollektionen"),
    templateCollectionsDesc: t("Collection titles and descriptions", "Koleksiyon başlıkları ve açıklamaları", "Titres et descriptions de collections", "Títulos y descripciones de colecciones", "Titoli e descrizioni collezioni", "Kollektion-Titel und Beschreibungen"),
    templateCustomers: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Kunden"),
    templateCustomersDesc: t("Customer data & addresses", "Müşteri verileri ve adresler", "Données clients et adresses", "Datos de clientes y direcciones", "Dati clienti e indirizzi", "Kundendaten & Adressen"),
    templateInventory: t("Inventory", "Envanter", "Stock", "Inventario", "Inventario", "Lagerbestand"),
    templateInventoryDesc: t("Quick update: SKU + quantity", "Hızlı güncelleme: SKU + miktar", "Mise à jour rapide : SKU + quantité", "Actualización rápida: SKU + cantidad", "Aggiornamento rapido: SKU + quantità", "Schnell-Update: SKU + Menge"),
    downloadXlsx: t("Download .xlsx", ".xlsx indir", "Télécharger .xlsx", "Descargar .xlsx", "Scarica .xlsx", ".xlsx herunterladen"),
    comingSoon: t("Coming soon", "Yakında", "Bientôt disponible", "Próximamente", "Prossimamente", "Demnächst verfügbar"),
    productTemplateInfo: t("Product template", "Ürün şablonu", "Modèle produit", "Plantilla de producto", "Modello prodotto", "Produkt-Template"),
    productTemplateBody: t(
      "Each row uses product_type parent or child. Dropdowns (category, brand, shipping group, status, …) refer to lists in the hidden Excel sheet. URL handles are generated automatically. Collections cannot be set via Excel import.",
      "Her satır product_type parent veya child kullanır. Açılır listeler gizli Excel sayfasındaki listelere referans verir. URL handle'lar otomatik oluşturulur. Koleksiyonlar Excel ile ayarlanamaz.",
      "Chaque ligne utilise product_type parent ou child. Les listes déroulantes renvoient à la feuille Excel cachée. Les handles URL sont générés automatiquement.",
      "Cada fila usa product_type parent o child. Los desplegables referencian la hoja oculta. Los handles URL se generan automáticamente.",
      "Ogni riga usa product_type parent o child. I dropdown fanno riferimento al foglio nascosto. Gli handle URL sono generati automaticamente.",
      "Jede Zeile nutzt product_type parent oder child. Dropdowns beziehen sich auf die Listen im versteckten Excel-Blatt. URL-Handles werden automatisch erzeugt. Kollektionen sind im Excel-Import nicht setzbar."
    ),
    importProductsTitle: t("Import products", "Ürünleri içe aktar", "Importer des produits", "Importar productos", "Importa prodotti", "Produkte importieren"),
    importProductsSubtitle: t(
      "Upload a completed .xlsx file to create products in bulk.",
      "Toplu ürün oluşturmak için doldurulmuş bir .xlsx dosyası yükleyin.",
      "Téléchargez un fichier .xlsx rempli pour créer des produits en masse.",
      "Sube un archivo .xlsx completado para crear productos en masa.",
      "Carica un file .xlsx compilato per creare prodotti in blocco.",
      "Lade eine ausgefüllte .xlsx-Datei hoch, um Produkte in großen Mengen anzulegen."
    ),
    dropLabel: t("Drop Excel file here or click", "Excel dosyasını buraya bırakın veya tıklayın", "Déposez le fichier Excel ici ou cliquez", "Suelta el archivo Excel aquí o haz clic", "Trascina il file Excel qui o clicca", "Excel-Datei hier ablegen oder klicken"),
    dropHint: t(".xlsx • max. 10 MB • UTF-8 with special characters", ".xlsx • maks. 10 MB • UTF-8 özel karakterler", ".xlsx • max. 10 Mo • UTF-8 caractères spéciaux", ".xlsx • máx. 10 MB • UTF-8 con caracteres especiales", ".xlsx • max. 10 MB • UTF-8 caratteri speciali", ".xlsx • max. 10 MB • UTF-8 mit Sonderzeichen"),
    importing: t("Importing…", "İçe aktarılıyor…", "Importation…", "Importando…", "Importazione…", "Importiere…"),
    importProducts: t("Import products", "Ürünleri içe aktar", "Importer des produits", "Importar productos", "Importa prodotti", "Produkte importieren"),
    removeFile: t("Remove file", "Dosyayı kaldır", "Supprimer le fichier", "Eliminar archivo", "Rimuovi file", "Datei entfernen"),
    importRules: t("Import rules", "İçe aktarma kuralları", "Règles d'import", "Reglas de importación", "Regole di importazione", "Import-Regeln"),
    importRulesList: [
      t("Rows 1–3: group headers & column identifiers (do not delete)", "Satır 1–3: grup başlıkları ve sütun tanımlayıcıları (silmeyin)", "Lignes 1–3 : en-têtes de groupe et identifiants de colonnes (ne pas supprimer)", "Filas 1–3: encabezados de grupo e identificadores (no eliminar)", "Righe 1–3: intestazioni di gruppo e identificatori colonne (non eliminare)", "Zeile 1–3: Gruppenüberschriften & Spaltenbezeichner (nicht löschen)"),
      t("From row 4: data rows. Empty rows are skipped.", "4. satırdan itibaren: veri satırları. Boş satırlar atlanır.", "À partir de la ligne 4 : lignes de données. Les lignes vides sont ignorées.", "Desde la fila 4: filas de datos. Las filas vacías se omiten.", "Dalla riga 4: righe dati. Le righe vuote vengono saltate.", "Ab Zeile 4: Datenzeilen. Leere Zeilen werden übersprungen."),
      t("Rows with SKU starting with # are ignored as comments.", "SKU'si # ile başlayan satırlar yorum olarak yok sayılır.", "Les lignes dont le SKU commence par # sont ignorées comme commentaires.", "Las filas con SKU que empieza por # se ignoran como comentarios.", "Le righe con SKU che inizia con # sono ignorate come commenti.", "Zeilen mit SKU beginnend mit # werden als Kommentar ignoriert."),
      t("Parent rows must contain title_de (or title_en).", "Parent satırları title_de (veya title_en) içermelidir.", "Les lignes parent doivent contenir title_de (ou title_en).", "Las filas parent deben contener title_de (o title_en).", "Le righe parent devono contenere title_de (o title_en).", "Parent-Zeilen müssen title_de (oder title_en) enthalten."),
      t("Child rows need parent_sku = SKU of the related parent row.", "Child satırları parent_sku = ilgili parent satırının SKU'su gerektirir.", "Les lignes enfant nécessitent parent_sku = SKU de la ligne parent.", "Las filas child necesitan parent_sku = SKU de la fila parent.", "Le righe child richiedono parent_sku = SKU della riga parent.", "Child-Zeilen benötigen parent_sku = SKU der zugehörigen Parent-Zeile."),
      t("Brand and shipping group must exactly match system names — otherwise an error.", "Marka ve kargo grubu sistem adlarıyla tam eşleşmeli — aksi halde hata.", "Marque et groupe d'expédition doivent correspondre exactement — sinon erreur.", "Marca y grupo de envío deben coincidir exactamente — si no, error.", "Marca e gruppo spedizione devono corrispondere esattamente — altrimenti errore.", "Marke und Versandgruppe müssen exakt den Namen aus dem System haben — sonst Fehlermeldung."),
      t("Category: slug must exist; best to use the same template with category selection.", "Kategori: slug mevcut olmalı; kategori seçimli aynı şablonu kullanın.", "Catégorie : le slug doit exister ; utilisez le même modèle avec sélection.", "Categoría: el slug debe existir; use la misma plantilla con categorías.", "Categoria: lo slug deve esistere; usare lo stesso modello con selezione.", "Kategorie: slug muss existieren; am besten dieselbe Vorlage mit Kategorieauswahl verwenden."),
      t("Collections: cannot be set via Excel.", "Koleksiyonlar: Excel ile ayarlanamaz.", "Collections : non configurables via Excel.", "Colecciones: no se pueden definir por Excel.", "Collezioni: non impostabili via Excel.", "Kollektionen: nicht per Excel setzen."),
      t("Handles (URLs) are assigned automatically — no handle_* columns needed.", "Handle'lar (URL) otomatik atanır — handle_* sütunları gerekmez.", "Les handles (URL) sont attribués automatiquement.", "Los handles (URL) se asignan automáticamente.", "Gli handle (URL) vengono assegnati automaticamente.", "Handles (URL) werden automatisch vergeben — keine handle_*-Spalten nötig."),
      t("Metafields: pairs metafield_N_key / metafield_N_value; add more numbers as columns.", "Metafields: metafield_N_key / metafield_N_value çiftleri; daha fazla sütun ekleyin.", "Metafields : paires metafield_N_key / metafield_N_value.", "Metafields: pares metafield_N_key / metafield_N_value.", "Metafields: coppie metafield_N_key / metafield_N_value.", "Metafelder: Paare metafield_N_key / metafield_N_value; weitere Nummern als Spalten ergänzbar."),
      t("Variants: at least option1/2; more optionN columns possible in Excel.", "Varyantlar: en az option1/2; Excel'de daha fazla optionN sütunu mümkün.", "Variantes : au moins option1/2 ; plus de colonnes optionN possibles.", "Variantes: al menos option1/2; más columnas optionN en Excel.", "Varianti: almeno option1/2; altre colonne optionN in Excel.", "Varianten: mindestens option1/2; option3… in der Vorlage — weitere optionN-Spalten in Excel möglich."),
      t("Prices as decimal: e.g. 29.99 (comma as separator allowed).", "Fiyatlar ondalık: örn. 29,99 (virgül ayırıcı).", "Prix en décimal : ex. 29,99 (virgule acceptée).", "Precios decimales: p. ej. 29,99 (coma como separador).", "Prezzi decimali: es. 29,99 (virgola come separatore).", "Preise als Dezimalzahl: z.B. 29,99 (Komma als Trennzeichen)."),
      t("HTML in description_*: <p>, <b>, <ul>, <li> etc. are preserved.", "description_* içinde HTML: <p>, <b>, <ul>, <li> vb. korunur.", "HTML dans description_* : <p>, <b>, <ul>, <li> etc. conservé.", "HTML en description_*: <p>, <b>, <ul>, <li> etc. se conservan.", "HTML in description_*: <p>, <b>, <ul>, <li> ecc. conservati.", "HTML in description_*: <p>, <b>, <ul>, <li> usw. werden übernommen."),
    ],
    exportTitle: t("Export data", "Veri dışa aktar", "Exporter des données", "Exportar datos", "Esporta dati", "Daten exportieren"),
    exportSubtitle: t("Choose data type, set filters, review columns and export as file.", "Veri türünü seçin, filtreleri ayarlayın, sütunları kontrol edin ve dışa aktarın.", "Choisissez le type, les filtres, les colonnes et exportez.", "Elija tipo, filtros, columnas y exporte.", "Scegli tipo, filtri, colonne ed esporta.", "Datentyp wählen, Filter setzen, Spalten prüfen und als Datei exportieren."),
    exportScope: t("1) Data scope", "1) Veri kapsamı", "1) Périmètre des données", "1) Alcance de datos", "1) Ambito dati", "1) Datenumfang"),
    presetCustom: t("Custom", "Özel", "Personnalisé", "Personalizado", "Personalizzato", "Custom"),
    presetBasicProducts: t("Preset: Basic products", "Ön ayar: Temel ürünler", "Préréglage : Produits de base", "Preajuste: Productos básicos", "Preset: Prodotti base", "Preset: Ürün temel"),
    presetSalesReport: t("Preset: Sales report", "Ön ayar: Satış raporu", "Préréglage : Rapport de ventes", "Preajuste: Informe de ventas", "Preset: Report vendite", "Preset: Satış raporu"),
    presetFullExport: t("Preset: Full export", "Ön ayar: Tam dışa aktarma", "Préréglage : Export complet", "Preajuste: Exportación completa", "Preset: Esportazione completa", "Preset: Tam export"),
    datasetProducts: t("Products (price, image, metadata)", "Ürünler (fiyat, görsel, metadata)", "Produits (prix, image, métadonnées)", "Productos (precio, imagen, metadatos)", "Prodotti (prezzo, immagine, metadata)", "Ürünler (fiyat, görsel, metadata)"),
    datasetOrders: t("Orders / sales", "Siparişler / satışlar", "Commandes / ventes", "Pedidos / ventas", "Ordini / vendite", "Siparişler / satışlar"),
    datasetCustomers: t("Customers", "Müşteriler", "Clients", "Clientes", "Clienti", "Müşteriler"),
    datasetTransactions: t("Transactions / payment activity", "İşlemler / ödeme hareketleri", "Transactions / paiements", "Transacciones / pagos", "Transazioni / pagamenti", "Transactions / ödeme hareketleri"),
    datasetRanking: t("Views / clicks / performance (ranking)", "Görüntülenme / tıklama / performans", "Vues / clics / performance", "Vistas / clics / rendimiento", "Visualizzazioni / clic / performance", "Görüntülenme / tıklama / performans (ranking)"),
    exportFilters: t("2) Filters", "2) Filtreler", "2) Filtres", "2) Filtros", "2) Filtri", "2) Filter"),
    filterSearch: t("Search (SKU, name, email…)", "Arama (SKU, ad, e-posta…)", "Recherche (SKU, nom, e-mail…)", "Búsqueda (SKU, nombre, email…)", "Cerca (SKU, nome, email…)", "Arama (SKU, ad, email...)"),
    filterStatus: t("Status (optional)", "Durum (isteğe bağlı)", "Statut (optionnel)", "Estado (opcional)", "Stato (opzionale)", "Status (optional)"),
    includeAllSellers: t("Superuser: include all seller data", "Süper kullanıcı: tüm satıcı verileri dahil", "Superuser : inclure toutes les données vendeurs", "Superusuario: incluir todos los vendedores", "Superuser: includi tutti i venditori", "Superuser: tüm seller verileri dahil"),
    groupBySeller: t("Split into seller sheets in XLSX export", "XLSX dışa aktarmada satıcı sayfalarına ayır", "Séparer par vendeur dans l'export XLSX", "Separar por vendedor en exportación XLSX", "Separa per venditore nell'export XLSX", "XLSX exportta seller bazlı sheetlere ayır"),
    exportColumns: t("3) Columns", "3) Sütunlar", "3) Colonnes", "3) Columnas", "3) Colonne", "3) Spalten"),
    loadColumns: t("Load columns", "Sütunları yükle", "Charger les colonnes", "Cargar columnas", "Carica colonne", "Spalten laden"),
    selectAll: t("Select all", "Tümünü seç", "Tout sélectionner", "Seleccionar todo", "Seleziona tutto", "Tümünü seç"),
    clear: t("Clear", "Temizle", "Effacer", "Limpiar", "Cancella", "Temizle"),
    rowsMatched: (n) => t(`${n} rows matched`, `${n} satır eşleşti`, `${n} lignes correspondantes`, `${n} filas coincidentes`, `${n} righe corrispondenti`, `${n} satır eşleşti`),
    columnsSelected: (n) => t(`${n} columns selected`, `${n} sütun seçili`, `${n} colonnes sélectionnées`, `${n} columnas seleccionadas`, `${n} colonne selezionate`, `${n} sütun seçili`),
    columnsLoadError: t("Could not load columns.", "Sütunlar yüklenemedi.", "Impossible de charger les colonnes.", "No se pudieron cargar las columnas.", "Impossibile caricare le colonne.", "Spalten konnten nicht geladen werden."),
    exportFormat: t("4) Format & download", "4) Format ve indirme", "4) Format et téléchargement", "4) Formato y descarga", "4) Formato e download", "4) Format & Download"),
    exportRunning: t("Export running…", "Dışa aktarma çalışıyor…", "Export en cours…", "Exportación en curso…", "Esportazione in corso…", "Export läuft..."),
    startExport: t("Start export", "Dışa aktarmayı başlat", "Lancer l'export", "Iniciar exportación", "Avvia esportazione", "Export starten"),
    downloadFailed: (status) => t(`Download failed (${status})`, `İndirme başarısız (${status})`, `Échec du téléchargement (${status})`, `Descarga fallida (${status})`, `Download fallito (${status})`, `Download fehlgeschlagen (${status})`),
    importResultCreatedSuffix: t("product(s) created", "ürün oluşturuldu", "produit(s) créé(s)", "producto(s) creado(s)", "prodotto/i creato/i", "ürün oluşturuldu"),
    importResultUpdatedSuffix: t("updated", "güncellendi", "mis à jour", "actualizado(s)", "aggiornato/i", "güncellendi"),
    importResultFailedSuffix: t("failed", "başarısız", "échoué(s)", "fallido(s)", "fallito/i", "başarısız"),
    importResultTotal: (n) => t(`(Total: ${n})`, `(Toplam: ${n})`, `(Total : ${n})`, `(Total: ${n})`, `(Totale: ${n})`, `(Toplam: ${n})`),
    mediaRegistered: (n) => t(`${n} image(s) added to media library`, `${n} görsel medya kütüphanesine eklendi`, `${n} image(s) ajoutée(s) à la bibliothèque`, `${n} imagen(es) añadida(s) a la biblioteca`, `${n} immagine/i aggiunta/e alla libreria`, `${n} görsel medya kütüphanesine eklendi`),
    mediaFolder: (name) => t(`in folder "${name}"`, `"${name}" klasörüne`, `dans le dossier « ${name} »`, `en carpeta "${name}"`, `nella cartella "${name}"`, `— "${name}" klasörüne`),
    mediaSkipped: (n) => t(`${n} already existed`, `${n} zaten mevcut`, `${n} déjà existant(s)`, `${n} ya existían`, `${n} già esistenti`, `${n} zaten mevcut`),
    selectCategoryError: t("Please select at least one category.", "Lütfen en az bir kategori seçin.", "Veuillez sélectionner au moins une catégorie.", "Seleccione al menos una categoría.", "Seleziona almeno una categoria.", "Bitte mindestens eine Kategorie auswählen."),
  };
}
