import { lt } from "@/lib/locale-text";

const t = (locale, en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);

export function getBrandPageCopy(locale, isSuperuser) {
  return {
    title: t(locale, "Brands", "Markalar", "Marques", "Marcas", "Brand", "Marken"),
    addBrand: t(locale, "Add Brand", "Marka Ekle", "Ajouter une marque", "Agregar marca", "Aggiungi brand", "Marke hinzufügen"),
    edit: t(locale, "Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten"),
    logoBanner: t(locale, "Logo / Banner", "Logo / Banner", "Logo / Bannière", "Logo / Banner", "Logo / Banner", "Logo / Banner"),
    updated: t(locale, "Brand updated.", "Marka güncellendi.", "Marque mise à jour.", "Marca actualizada.", "Brand aggiornato.", "Marke aktualisiert."),
    created: t(locale, "Brand created.", "Marka oluşturuldu.", "Marque créée.", "Marca creada.", "Brand creato.", "Marke erstellt."),
    saveError: t(locale, "Failed to save brand.", "Marka kaydedilemedi.", "Impossible d'enregistrer la marque.", "No se pudo guardar la marca.", "Impossibile salvare il brand.", "Marke konnte nicht gespeichert werden."),
    deleteError: t(locale, "Failed to delete.", "Silme başarısız.", "Échec de la suppression.", "Error al eliminar.", "Eliminazione non riuscita.", "Löschen fehlgeschlagen."),
    nameRequired: t(locale, "Brand name is required.", "Marka adı zorunludur.", "Le nom de la marque est obligatoire.", "El nombre de marca es obligatorio.", "Il nome del brand è obbligatorio.", "Markenname ist erforderlich."),
    loading: t(locale, "Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    myBrands: t(locale, "My Brands", "Markalarım", "Mes marques", "Mis marcas", "I miei brand", "Meine Marken"),
    allBrands: isSuperuser
      ? t(locale, "All Brands", "Tüm Markalar", "Toutes les marques", "Todas las marcas", "Tutti i brand", "Alle Marken")
      : t(locale, "All Other Brands", "Diğer Tüm Markalar", "Toutes les autres marques", "Todas las demás marcas", "Tutti gli altri brand", "Alle anderen Marken"),
    noBrandsYet: t(locale, "No brands yet", "Henüz marka yok", "Aucune marque pour le moment", "Aún no hay marcas", "Nessun brand ancora", "Noch keine Marken"),
    noBrandsHelp: t(locale, "Add a brand to appear in product form (Brand dropdown).", "Ürün formunda görünmesi için bir marka ekleyin (Marka açılır listesi).", "Ajoutez une marque pour qu'elle apparaisse dans le formulaire produit (liste déroulante Marque).", "Agrega una marca para que aparezca en el formulario de producto (desplegable Marca).", "Aggiungi un brand per farlo apparire nel modulo prodotto (menu a tendina Brand).", "Fügen Sie eine Marke hinzu, damit sie im Produktformular erscheint (Marken-Dropdown)."),
    noOtherBrands: t(locale, "No other brands found.", "Başka marka bulunamadı.", "Aucune autre marque trouvée.", "No se encontraron otras marcas.", "Nessun altro brand trovato.", "Keine weiteren Marken gefunden."),
    othersReadonly: t(locale, "These brands belong to other sellers. You can view but not edit them.", "Bu markalar diğer satıcılara aittir. Görüntüleyebilirsiniz ancak düzenleyemezsiniz.", "Ces marques appartiennent à d'autres vendeurs. Vous pouvez les voir mais pas les modifier.", "Estas marcas pertenecen a otros vendedores. Puedes verlas pero no editarlas.", "Questi brand appartengono ad altri venditori. Puoi visualizzarli ma non modificarli.", "Diese Marken gehören anderen Verkäufern. Sie können sie ansehen, aber nicht bearbeiten."),
    editModal: t(locale, "Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten"),
    addModal: t(locale, "Add Brand", "Marka Ekle", "Ajouter une marque", "Agregar marca", "Aggiungi brand", "Marke hinzufügen"),
    save: t(locale, "Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern"),
    create: t(locale, "Create", "Oluştur", "Créer", "Crear", "Crea", "Erstellen"),
    delete: t(locale, "Delete", "Sil", "Supprimer", "Eliminar", "Elimina", "Löschen"),
    cancel: t(locale, "Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    name: t(locale, "Name", "Ad", "Nom", "Nombre", "Nome", "Name"),
    namePlaceholder: t(locale, "e.g. My Brand", "örn. Benim Markam", "ex. Ma marque", "p. ej. Mi marca", "es. Il mio brand", "z. B. Meine Marke"),
    nameLocked: t(locale, "Brand name cannot be changed after creation.", "Marka adı oluşturulduktan sonra değiştirilemez.", "Le nom de la marque ne peut pas être modifié après création.", "El nombre de marca no se puede cambiar después de crearla.", "Il nome del brand non può essere modificato dopo la creazione.", "Der Markenname kann nach der Erstellung nicht geändert werden."),
    handle: t(locale, "Handle", "Handle", "Handle", "Handle", "Handle", "Handle"),
    handlePlaceholder: t(locale, "e.g. my-brand", "örn. benim-markam", "ex. ma-marque", "p. ej. mi-marca", "es. mio-brand", "z. B. meine-marke"),
    handleHelp: t(locale, "URL-friendly key. Auto-filled from name unless edited.", "URL dostu anahtar. Düzenlenmedikçe isimden otomatik doldurulur.", "Clé URL conviviale. Remplie automatiquement depuis le nom sauf modification.", "Clave compatible con URL. Se completa automáticamente desde el nombre salvo edición.", "Chiave URL-friendly. Compilata automaticamente dal nome salvo modifica.", "URL-freundlicher Schlüssel. Wird automatisch aus dem Namen befüllt, sofern nicht bearbeitet."),
    logo: t(locale, "Logo", "Logo", "Logo", "Logo", "Logo", "Logo"),
    banner: t(locale, "Banner", "Banner", "Bannière", "Banner", "Banner", "Banner"),
    remove: t(locale, "Remove", "Kaldır", "Retirer", "Quitar", "Rimuovi", "Entfernen"),
    changeLogo: t(locale, "Change logo", "Logoyu değiştir", "Changer le logo", "Cambiar logo", "Cambia logo", "Logo ändern"),
    selectLogo: t(locale, "Select logo", "Logo seç", "Sélectionner un logo", "Seleccionar logo", "Seleziona logo", "Logo auswählen"),
    changeBanner: t(locale, "Change banner", "Bannerı değiştir", "Changer la bannière", "Cambiar banner", "Cambia banner", "Banner ändern"),
    selectBanner: t(locale, "Select banner", "Banner seç", "Sélectionner une bannière", "Seleccionar banner", "Seleziona banner", "Banner auswählen"),
    address: t(locale, "Address", "Adres", "Adresse", "Dirección", "Indirizzo", "Adresse"),
    optional: t(locale, "Optional", "İsteğe bağlı", "Optionnel", "Opcional", "Opzionale", "Optional"),
    deleteConfirm: (name) => t(locale, `Delete "${name}"?`, `"${name}" silinsin mi?`, `Supprimer "${name}" ?`, `¿Eliminar "${name}"?`, `Eliminare "${name}"?`, `"${name}" löschen?`),
  };
}
