import { lt } from "@/lib/locale-text";

export function getMediaPageCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    allMedia: t("All media", "Tum medya", "Tous les medias", "Todos los medios", "Tutti i media", "Alle Medien"),
    withoutFolder: t("Without folder", "Klasorsuz", "Sans dossier", "Sin carpeta", "Senza cartella", "Ohne Ordner"),
    folder: t("Folder", "Klasor", "Dossier", "Carpeta", "Cartella", "Ordner"),
    dropImages: t("Drop images here", "Gorselleri buraya birakin", "Deposez les images ici", "Suelta imagenes aqui", "Rilascia le immagini qui", "Bilder hier ablegen"),
    releaseToUpload: t("Release to upload", "Yuklemek icin birakin", "Relacher pour televerser", "Suelta para subir", "Rilascia per caricare", "Loslassen zum Hochladen"),
    mediaLibrary: t("Media library", "Medya kutuphanesi", "Bibliotheque media", "Biblioteca de medios", "Libreria media", "Mediathek"),
    folders: t("Folders", "Klasorler", "Dossiers", "Carpetas", "Cartelle", "Ordner"),
    deleteFolder: t("Delete folder", "Klasoru sil", "Supprimer le dossier", "Eliminar carpeta", "Elimina cartella", "Ordner loschen"),
    deleteFolderConfirm: (name) =>
      t(
        `Delete folder "${name}"?`,
        `"${name}" klasorunu sil?`,
        `Supprimer le dossier "${name}" ?`,
        `Eliminar la carpeta "${name}"?`,
        `Eliminare la cartella "${name}"?`,
        `Ordner "${name}" loschen?`
      ),
    newFolder: t("+ New folder", "+ Yeni klasor", "+ Nouveau dossier", "+ Nueva carpeta", "+ Nuova cartella", "+ Neuer Ordner"),
  };
}
