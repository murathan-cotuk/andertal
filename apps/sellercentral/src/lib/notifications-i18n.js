import { lt } from "@/lib/locale-text";

export function getNotificationsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    title: t("Notifications", "Bildirimler", "Notifications", "Notificaciones", "Notifiche", "Benachrichtigungen"),
    empty: t("No new notifications", "Yeni bildirim yok", "Aucune nouvelle notification", "No hay notificaciones nuevas", "Nessuna nuova notifica", "Keine neuen Benachrichtigungen"),
    viewAll: t("View all notifications", "Tüm bildirimleri gör", "Voir toutes les notifications", "Ver todas las notificaciones", "Vedi tutte le notifiche", "Alle Benachrichtigungen anzeigen"),
    messagesTitle: t("Messages", "Mesajlar", "Messages", "Mensajes", "Messaggi", "Nachrichten"),
    campaigns: t("Ad campaigns", "Reklam kampanyaları", "Campagnes publicitaires", "Campañas publicitarias", "Campagne pubblicitarie", "Werbekampagnen"),
    newCampaign: t("New ad campaign", "Yeni reklam kampanyası", "Nouvelle campagne", "Nueva campaña publicitaria", "Nuova campagna pubblicitaria", "Neue Werbekampagne"),
    verifications: t("Verifications", "Doğrulamalar", "Vérifications", "Verificaciones", "Verifiche", "Verifizierungen"),
    docSubmitted: t("Documents submitted", "Evrak gönderildi", "Documents envoyés", "Documentos enviados", "Documenti inviati", "Evrak Gönderildi"),
    docSubmittedBody: t("Seller submitted verification documents.", "Satıcı doğrulama evraklarını gönderdi.", "Le vendeur a envoyé les documents de vérification.", "El vendedor envió documentos de verificación.", "Il venditore ha inviato i documenti di verifica.", "Satıcı doğrulama evraklarını gönderdi."),
    sellerRegistered: t("New seller registered", "Yeni satıcı kaydı", "Nouveau vendeur inscrit", "Nuevo vendedor registrado", "Nuovo venditore registrato", "Neuer Seller registriert"),
    euOrigin: t("EU origin / badge", "AB kökeni / rozet", "Origine UE / badge", "Origen UE / badge", "Origine UE / badge", "EU-Herkunft / Badge"),
    euOriginPending: t("EU origin / badge pending", "AB kökeni / rozet bekliyor", "Origine UE / badge en attente", "Origen UE / badge pendiente", "Origine UE / badge in sospeso", "EU-Herkunft / Badge ausstehend"),
    productChanges: t("Product changes", "Ürün değişiklikleri", "Modifications produit", "Cambios de producto", "Modifiche prodotto", "Produktänderungen"),
    productChangePending: t("Product change pending", "Ürün değişikliği bekliyor", "Modification produit en attente", "Cambio de producto pendiente", "Modifica prodotto in sospeso", "Produktänderung ausstehend"),
    productFallback: t("Product", "Ürün", "Produit", "Producto", "Prodotto", "Produkt"),
    orders: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"),
    newOrder: (n) => t(`New order #${n}`, `Yeni sipariş #${n}`, `Nouvelle commande #${n}`, `Nuevo pedido #${n}`, `Nuovo ordine #${n}`, `Neue Bestellung #${n}`),
    newOrdersToast: (n) => t(
      n === 1 ? "1 new order arrived" : `${n} new orders arrived`,
      n === 1 ? "1 yeni sipariş geldi" : `${n} yeni sipariş geldi`,
      n === 1 ? "1 nouvelle commande reçue" : `${n} nouvelles commandes reçues`,
      n === 1 ? "1 pedido nuevo recibido" : `${n} pedidos nuevos recibidos`,
      n === 1 ? "1 nuovo ordine ricevuto" : `${n} nuovi ordini ricevuti`,
      n === 1 ? "1 neue Bestellung eingegangen" : `${n} neue Bestellungen eingegangen`,
    ),
    returns: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Rückgaben"),
    returnRequest: (n) => t(`Return request R-${n}`, `İade talebi R-${n}`, `Demande de retour R-${n}`, `Solicitud de devolución R-${n}`, `Richiesta di reso R-${n}`, `Rückgabeanfrage R-${n}`),
    orderRef: (n) => t(`Order #${n}`, `Sipariş #${n}`, `Commande #${n}`, `Pedido #${n}`, `Ordine #${n}`, `Bestellung #${n}`),
    sellerErrors: t("Seller issues", "Satıcı sorunları", "Problèmes vendeurs", "Problemas de vendedores", "Problemi venditori", "Seller-Fehler"),
    sellerErrorTitle: (name) => t(`Issue: ${name}`, `Sorun: ${name}`, `Problème : ${name}`, `Problema: ${name}`, `Problema: ${name}`, `Fehler: ${name}`),
    supportCases: t("Support tickets", "Destek talepleri", "Tickets de support", "Tickets de soporte", "Ticket di supporto", "Support-Tickets"),
    newSupportCase: t("New support message", "Yeni destek mesajı", "Nouveau message de support", "Nuevo mensaje de soporte", "Nuovo messaggio di supporto", "Neue Support-Nachricht"),
  };
}
