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
    productChanges: t("Product changes", "Ürün değişiklikleri", "Modifications produit", "Cambios de producto", "Modifiche prodotto", "Produktänderungen"),
    productChangePending: t("Product change pending", "Ürün değişikliği bekliyor", "Modification produit en attente", "Cambio de producto pendiente", "Modifica prodotto in sospeso", "Produktänderung ausstehend"),
    productFallback: t("Product", "Ürün", "Produit", "Producto", "Prodotto", "Produkt"),
    orders: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"),
    newOrder: (n) => t(`New order #${n}`, `Yeni sipariş #${n}`, `Nouvelle commande #${n}`, `Nuevo pedido #${n}`, `Nuovo ordine #${n}`, `Neue Bestellung #${n}`),
    returns: t("Returns", "İadeler", "Retours", "Devoluciones", "Resi", "Rückgaben"),
    returnRequest: (n) => t(`Return request R-${n}`, `İade talebi R-${n}`, `Demande de retour R-${n}`, `Solicitud de devolución R-${n}`, `Richiesta di reso R-${n}`, `Rückgabeanfrage R-${n}`),
    orderRef: (n) => t(`Order #${n}`, `Sipariş #${n}`, `Commande #${n}`, `Pedido #${n}`, `Ordine #${n}`, `Bestellung #${n}`),
    sellerErrors: t("Seller issues", "Satıcı sorunları", "Problèmes vendeurs", "Problemas de vendedores", "Problemi venditori", "Seller-Fehler"),
    sellerErrorTitle: (name) => t(`Issue: ${name}`, `Sorun: ${name}`, `Problème : ${name}`, `Problema: ${name}`, `Problema: ${name}`, `Fehler: ${name}`),
  };
}
