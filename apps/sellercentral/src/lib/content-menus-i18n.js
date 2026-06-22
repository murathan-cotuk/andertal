import { lt } from "@/lib/locale-text";

export function getContentMenusCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    linkTypeCategory: t("Category", "Kategori", "Catégorie", "Categoría", "Categoria", "Kategorie"),
    linkTypeCollection: t("Collection", "Koleksiyon", "Collection", "Colección", "Collezione", "Kollektion"),
    linkTypeProduct: t("Product", "Ürün", "Produit", "Producto", "Prodotto", "Produkt"),
    linkTypePage: t("Page", "Sayfa", "Page", "Página", "Pagina", "Seite"),
    linkTypeBlog: t("Blog", "Blog", "Blog", "Blog", "Blog", "Blog"),
    linkTypeBlogPost: t("Blog post", "Blog yazısı", "Article de blog", "Entrada de blog", "Articolo blog", "Blog-Beitrag"),
    linkTypePolicy: t("Policy", "Politika", "Politique", "Política", "Policy", "Richtlinie"),
    linkTypeApi: t("API", "API", "API", "API", "API", "API"),
    linkTypeUrl: t("URL", "URL", "URL", "URL", "URL", "URL"),
    apiBrand: t("Brand", "Marka", "Marque", "Marca", "Marca", "Marke"),
    apiSales: t("Sales", "İndirimler", "Soldes", "Ofertas", "Saldi", "Sales"),
    apiNewArrivals: t("New arrivals", "Yenilikler", "Nouveautés", "Novedades", "Novità", "Neuheiten"),
    apiBestsellers: t("Bestsellers", "Çok satanlar", "Meilleures ventes", "Más vendidos", "Bestseller", "Bestsellers"),
    nameSlugRequired: t("Name and slug required", "Ad ve slug zorunlu", "Nom et slug requis", "Nombre y slug obligatorios", "Nome e slug obbligatori", "Name und Slug erforderlich"),
    saveMenuError: t("Failed to save menu", "Menü kaydedilemedi", "Échec de l'enregistrement", "Error al guardar", "Salvataggio non riuscito", "Menü speichern fehlgeschlagen"),
    updateModeError: t("Failed to update categories-with-products mode", "Kategori modu güncellenemedi", "Échec de la mise à jour du mode", "Error al actualizar modo", "Aggiornamento modalità non riuscito", "Kategorien-mit-Produkten-Modus konnte nicht aktualisiert werden"),
    menuName: t("Menu name", "Menü adı", "Nom du menu", "Nombre del menú", "Nome menu", "Menüname"),
    menuNamePh: t("e.g. Main menu", "ör. Ana menü", "ex. Menu principal", "p. ej. Menú principal", "es. Menu principale", "z. B. Hauptmenü"),
    menuSlugPh: t("e.g. main-menu", "ör. ana-menu", "ex. menu-principal", "p. ej. menu-principal", "es. menu-principale", "z. B. main-menu"),
    slugHelp: t("Used in URLs. Auto-filled from name unless you edit it.", "URL'lerde kullanılır. Adından otomatik doldurulur.", "Utilisé dans les URL. Rempli automatiquement depuis le nom.", "Usado en URLs. Se rellena desde el nombre.", "Usato negli URL. Compilato dal nome.", "Wird in URLs verwendet. Automatisch aus dem Namen, sofern nicht manuell geändert."),
    location: t("Location", "Konum", "Emplacement", "Ubicación", "Posizione", "Position"),
    locationSecond: t("→ Shown in shop navbar (grey bar under main nav)", "→ Mağaza navbar'ında (ana menünün altındaki gri çubuk)", "→ Barre grise sous la navigation principale", "→ Barra gris bajo la navegación principal", "→ Barra grigia sotto la nav principale", "→ Graue Leiste unter der Hauptnavigation"),
    locationMain: t("→ Shown in shop as Categories dropdown", "→ Mağazada Kategoriler açılır menüsü", "→ Menu déroulant Catégories", "→ Desplegable Categorías", "→ Menu a tendina Categorie", "→ Im Shop als Kategorien-Dropdown"),
    locationOther: t("→ Other locations (e.g. footer)", "→ Diğer konumlar (ör. footer)", "→ Autres emplacements (ex. pied de page)", "→ Otras ubicaciones (p. ej. pie)", "→ Altre posizioni (es. footer)", "→ Andere Positionen (z. B. Footer)"),
    duplicate: t("Duplicate", "Kopyala", "Dupliquer", "Duplicar", "Duplica", "Duplizieren"),
    delete: t("Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen"),
    edit: t("Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten"),
    deleteMenu: t("Delete menu", "Menüyü sil", "Supprimer le menu", "Eliminar menú", "Elimina menu", "Menü löschen"),
    deleteMenuConfirmMessage: (name) =>
      t(
        `Delete menu "${name}"? All menu items will be removed.`,
        `"${name}" menüsü silinsin mi? Tüm menü öğeleri kaldırılır.`,
        `Supprimer le menu « ${name} » ? Tous les éléments seront supprimés.`,
        `¿Eliminar el menú «${name}»? Se eliminarán todos los elementos.`,
        `Eliminare il menu «${name}»? Tutte le voci verranno rimosse.`,
        `Menü «${name}» löschen? Alle Menüeinträge werden entfernt.`,
      ),
    removeItemConfirmMessage: (label) =>
      t(
        `Remove "${label}" from this menu?`,
        `"${label}" bu menüden kaldırılsın mı?`,
        `Retirer « ${label} » de ce menu ?`,
        `¿Quitar «${label}» de este menú?`,
        `Rimuovere «${label}» da questo menu?`,
        `«${label}» aus diesem Menü entfernen?`,
      ),
    menuItems: t("Menu items", "Menü öğeleri", "Éléments du menu", "Elementos del menú", "Voci menu", "Menüeinträge"),
    autoCategoriesOn: t("Auto-show categories is ON — the shop will display all categories in the dropdown (menu items below are ignored).", "Otomatik kategori gösterimi AÇIK — mağaza tüm kategorileri gösterir (aşağıdaki menü öğeleri yok sayılır).", "Affichage auto des catégories ACTIVÉ — le shop affiche toutes les catégories.", "Mostrar categorías automáticamente ACTIVADO.", "Mostra categorie automaticamente ATTIVO.", "Kategorien automatisch AN — der Shop zeigt alle Kategorien (Menüeinträge unten werden ignoriert)."),
    importCsv: t("Import CSV", "CSV içe aktar", "Importer CSV", "Importar CSV", "Importa CSV", "CSV importieren"),
    addMenuItem: t("Add menu item", "Menü öğesi ekle", "Ajouter un élément", "Añadir elemento", "Aggiungi voce", "Menüeintrag hinzufügen"),
    addSubItem: t("Add sub-item", "Alt öğe ekle", "Ajouter un sous-élément", "Añadir subelemento", "Aggiungi sotto-voce", "Untereintrag hinzufügen"),
    pageTitle: t("Menus", "Menüler", "Menus", "Menús", "Menu", "Menüs"),
    pageSubtitle: t("Navigation menus for your shop", "Mağaza navigasyon menüleri", "Menus de navigation de votre boutique", "Menús de navegación de tu tienda", "Menu di navigazione del negozio", "Navigationsmenüs für deinen Shop"),
    createMenu: t("Create menu", "Menü oluştur", "Créer un menu", "Crear menú", "Crea menu", "Menü erstellen"),
    loading: t("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    noMenus: t("No menus yet", "Henüz menü yok", "Aucun menu pour l'instant", "Sin menús aún", "Nessun menu ancora", "Noch keine Menüs"),
    noMenusBody: t("Create a menu to organize links in your shop header or footer.", "Mağaza üst/alt bilgisinde bağlantılar için bir menü oluşturun.", "Créez un menu pour organiser les liens.", "Crea un menú para organizar enlaces.", "Crea un menu per organizzare i link.", "Erstelle ein Menü für Links in Kopf- oder Fußzeile."),
    selectMenu: t("Select a menu", "Bir menü seçin", "Sélectionnez un menu", "Selecciona un menú", "Seleziona un menu", "Menü auswählen"),
    selectMenuHint: t("Choose a menu from the list or create a new one.", "Listeden bir menü seçin veya yeni oluşturun.", "Choisissez un menu ou créez-en un.", "Elige un menú o crea uno nuevo.", "Scegli un menu o creane uno.", "Wähle ein Menü oder erstelle ein neues."),
    saved: t("Saved", "Kaydedildi", "Enregistré", "Guardado", "Salvato", "Gespeichert"),
    save: t("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern"),
    saving: t("Saving…", "Kaydediliyor…", "Enregistrement…", "Guardando…", "Salvataggio…", "Speichern…"),
    discard: t("Discard", "Vazgeç", "Annuler", "Descartar", "Annulla", "Verwerfen"),
    loadError: t("Failed to load menus", "Menüler yüklenemedi", "Échec du chargement", "Error al cargar", "Caricamento non riuscito", "Menüs konnten nicht geladen werden"),
    deleteMenuConfirm: t("Delete this menu?", "Bu menü silinsin mi?", "Supprimer ce menu ?", "¿Eliminar este menú?", "Eliminare questo menu?", "Dieses Menü löschen?"),
    itemLabel: t("Label", "Etiket", "Libellé", "Etiqueta", "Etichetta", "Bezeichnung"),
    itemSlug: t("Slug", "Slug", "Slug", "Slug", "Slug", "Slug"),
    linkType: t("Link type", "Bağlantı türü", "Type de lien", "Tipo de enlace", "Tipo link", "Link-Typ"),
    linkValue: t("Link target", "Bağlantı hedefi", "Cible du lien", "Destino del enlace", "Destinazione link", "Link-Ziel"),
    parentItem: t("Parent item", "Üst öğe", "Élément parent", "Elemento padre", "Voce padre", "Übergeordneter Eintrag"),
    rootLevel: t("Root level", "Kök seviye", "Niveau racine", "Nivel raíz", "Livello radice", "Oberste Ebene"),
    apiFunction: t("API function", "API işlevi", "Fonction API", "Función API", "Funzione API", "API-Funktion"),
    customSlug: t("Custom slug", "Özel slug", "Slug personnalisé", "Slug personalizado", "Slug personalizzato", "Eigener Slug"),
    editItem: t("Edit item", "Öğeyi düzenle", "Modifier l'élément", "Editar elemento", "Modifica voce", "Eintrag bearbeiten"),
    addItem: t("Add item", "Öğe ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    cancel: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    remove: t("Remove", "Kaldır", "Retirer", "Quitar", "Rimuovi", "Entfernen"),
    categoriesWithProducts: t("Show categories with products", "Ürünlü kategorileri göster", "Afficher catégories avec produits", "Mostrar categorías con productos", "Mostra categorie con prodotti", "Kategorien mit Produkten anzeigen"),
    newMenuTitle: t("New menu", "Yeni menü", "Nouveau menu", "Nuevo menú", "Nuovo menu", "Neues Menü"),
    create: t("Create", "Oluştur", "Créer", "Crear", "Crea", "Erstellen"),
    importCsvTitle: t("Import menu from CSV", "Menüyü CSV'den içe aktar", "Importer le menu depuis CSV", "Importar menú desde CSV", "Importa menu da CSV", "Menü aus CSV importieren"),
    importCsvHelp: t("Paste CSV with columns: label, slug, link_type, link_value, parent_slug", "Sütunlar: label, slug, link_type, link_value, parent_slug", "Colonne : label, slug, link_type, link_value, parent_slug", "Columnas: label, slug, link_type, link_value, parent_slug", "Colonne: label, slug, link_type, link_value, parent_slug", "Spalten: label, slug, link_type, link_value, parent_slug"),
    import: t("Import", "İçe aktar", "Importer", "Importar", "Importa", "Importieren"),
  };
}

export function linkTypesForLocale(locale) {
  const c = getContentMenusCopy(locale);
  return [
    { label: c.linkTypeCategory, value: "category" },
    { label: c.linkTypeCollection, value: "collection" },
    { label: c.linkTypeProduct, value: "product" },
    { label: c.linkTypePage, value: "page" },
    { label: c.linkTypeBlog, value: "blog" },
    { label: c.linkTypeBlogPost, value: "blog_post" },
    { label: c.linkTypePolicy, value: "policy" },
    { label: c.linkTypeApi, value: "api" },
    { label: c.linkTypeUrl, value: "url" },
  ];
}

export function apiFunctionOptionsForLocale(locale) {
  const c = getContentMenusCopy(locale);
  return [
    { label: c.apiBrand, value: "brand" },
    { label: c.apiSales, value: "sales" },
    { label: c.apiNewArrivals, value: "neuheiten" },
    { label: c.apiBestsellers, value: "bestsellers" },
  ];
}
