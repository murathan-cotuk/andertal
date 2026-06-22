import { lt } from "@/lib/locale-text";

export function getNotificationsPageCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    removeFromList: t("Remove from list", "Listeden kaldir", "Retirer de la liste", "Quitar de la lista", "Rimuovi dall'elenco", "Aus Liste entfernen"),
    unread: t("Unread", "Okunmadi", "Non lu", "No leido", "Non letto", "Ungelesen"),
    allFallback: t("All", "Tumu", "Tous", "Todo", "Tutti", "Alle"),
    pageTitle: t("Notifications", "Bildirimler", "Notifications", "Notificaciones", "Notifiche", "Benachrichtigungen"),
    pageSubtitle: t(
      "Select a category above; only its notifications appear below.",
      "Yukaridan bir kategori secin; yalnizca ilgili bildirimler asagida gorunur.",
      "Selectionnez une categorie ci-dessus; seules ses notifications s'affichent ci-dessous.",
      "Selecciona una categoria arriba; solo aparecen sus notificaciones abajo.",
      "Seleziona una categoria sopra; solo le relative notifiche vengono mostrate sotto.",
      "Kategorie oben auswahlen; unten erscheinen nur die zugehorigen Benachrichtigungen.",
    ),
    infoText: t(
      "Opening this page marks unread notifications as read (the red counter at the top disappears). Orders and other records are never deleted by this action.",
      "Bu sayfayi acmak okunmamis bildirimleri okundu olarak isaretler (ustteki kirmizi sayac kaybolur). Siparisler ve diger kayitlar bu islemle asla silinmez.",
      "Ouvrir cette page marque les notifications non lues comme lues (le compteur rouge disparait). Les commandes et autres donnees ne sont jamais supprimees par cette action.",
      "Abrir esta pagina marca las notificaciones no leidas como leidas (desaparece el contador rojo). Esta accion nunca elimina pedidos ni otros registros.",
      "Aprire questa pagina segna le notifiche non lette come lette (il contatore rosso scompare). Questa azione non elimina mai ordini o altri record.",
      "Beim Offnen dieser Seite werden ungelesene Hinweise als gelesen markiert (roter Zahler oben verschwindet). Bestellungen und andere Stammdaten werden dadurch nie geloscht.",
    ),
    removeSelected: (count) => t(
      `Remove selected from list (${count})`,
      `Secilenleri listeden kaldir (${count})`,
      `Retirer la selection de la liste (${count})`,
      `Quitar seleccionados de la lista (${count})`,
      `Rimuovi selezionati dall'elenco (${count})`,
      `Ausgewahlte aus Liste entfernen (${count})`,
    ),
    removeAll: t("Remove all from list", "Tumunu listeden kaldir", "Tout retirer de la liste", "Quitar todo de la lista", "Rimuovi tutto dall'elenco", "Alle aus Liste entfernen"),
    noInCategory: t("No notifications in this category.", "Bu kategoride bildirim yok.", "Aucune notification dans cette categorie.", "No hay notificaciones en esta categoria.", "Nessuna notifica in questa categoria.", "Keine Benachrichtigungen in dieser Kategorie."),
    removeAllConfirm: t(
      "Remove all entries from this view? The underlying data (orders, sellers, etc.) will remain unchanged — only the display here will be hidden.",
      "Tum girisler bu gorunumden kaldirilsin mi? Asil veriler (siparisler, saticilar vb.) degismeyecek - yalnizca buradaki gorunum gizlenecek.",
      "Retirer toutes les entrees de cette vue ? Les donnees sources resteront inchangees; seul l'affichage ici sera masque.",
      "¿Quitar todas las entradas de esta vista? Los datos de origen no cambiaran; solo se ocultara su visualizacion aqui.",
      "Rimuovere tutte le voci da questa vista? I dati sottostanti non cambieranno; qui verra solo nascosta la visualizzazione.",
      "Alle Eintrage aus dieser Ansicht entfernen? Die zugrunde liegenden Daten bleiben unverandert - nur die Anzeige hier wird ausgeblendet.",
    ),
  };
}
