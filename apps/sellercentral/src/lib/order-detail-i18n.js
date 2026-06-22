import { lt } from "@/lib/locale-text";

export function getOrderDetailCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    loadFailed: t("Order could not be loaded", "Siparis yuklenemedi", "La commande n'a pas pu etre chargee", "No se pudo cargar el pedido", "Impossibile caricare l'ordine", "Bestellung konnte nicht geladen werden"),
    saveFailed: t("Save failed", "Kaydetme basarisiz", "Echec de l'enregistrement", "Error al guardar", "Salvataggio non riuscito", "Speichern fehlgeschlagen"),
    deleteFailed: t("Delete failed", "Silme basarisiz", "Echec de la suppression", "Error al eliminar", "Eliminazione non riuscita", "Loschen fehlgeschlagen"),
    deleteConfirm: t("Really delete order?", "Siparis gercekten silinsin mi?", "Supprimer vraiment la commande ?", "¿Eliminar realmente el pedido?", "Eliminare davvero l'ordine?", "Bestellung wirklich loschen?"),
    orderTitle: t("Order", "Siparis", "Commande", "Pedido", "Ordine", "Bestellung"),
    coupon: t("Coupon", "Kupon", "Coupon", "Cupon", "Coupon", "Gutschein"),
    manageStatus: t("Manage status", "Durumu yonet", "Gerer le statut", "Gestionar estado", "Gestisci stato", "Status verwalten"),
    saveStatus: t("Save status", "Durumu kaydet", "Enregistrer le statut", "Guardar estado", "Salva stato", "Status speichern"),
    editShippingOrMark: t(
      "Edit shipping or mark as shipped",
      "Kargoyu duzenle veya kargoya verildi olarak isaretle",
      "Modifier l'expedition ou marquer comme expedie",
      "Editar envio o marcar como enviado",
      "Modifica spedizione o segna come spedito",
      "Versand bearbeiten oder als versendet markieren",
    ),
    editShipping: t("Edit shipping", "Kargoyu duzenle", "Modifier l'expedition", "Editar envio", "Modifica spedizione", "Versand bearbeiten"),
    paymentInfo: t("Payment info", "Odeme bilgisi", "Informations de paiement", "Informacion de pago", "Info pagamento", "Zahlungsinfo"),
    customerInfo: t("Customer info", "Musteri bilgisi", "Infos client", "Info cliente", "Info cliente", "Kundeninfo"),
    registeredCustomer: t("Registered customer", "Kayitli musteri", "Client enregistre", "Cliente registrado", "Cliente registrato", "Registrierter Kunde"),
    firstOrder: t("First order", "Ilk siparis", "Premiere commande", "Primer pedido", "Primo ordine", "Erste Bestellung"),
    newsletter: t("Newsletter", "Bulten", "Newsletter", "Newsletter", "Newsletter", "Newsletter"),
    shippingAddress: t("Shipping address", "Teslimat adresi", "Adresse de livraison", "Direccion de envio", "Indirizzo di spedizione", "Lieferadresse"),
    billingAddress: t("Billing address", "Fatura adresi", "Adresse de facturation", "Direccion de facturacion", "Indirizzo di fatturazione", "Rechnungsadresse"),
    sameAsShipping: t("Same as shipping address", "Teslimat adresiyle ayni", "Identique a l'adresse de livraison", "Igual que la direccion de envio", "Uguale all'indirizzo di spedizione", "gleich wie Lieferadresse"),
    summary: t("Summary", "Ozet", "Resume", "Resumen", "Riepilogo", "Zusammenfassung"),
    dangerText: t("This action cannot be undone.", "Bu islem geri alinamaz.", "Cette action est irreversible.", "Esta accion no se puede deshacer.", "Questa azione non puo essere annullata.", "Diese Aktion kann nicht ruckgangig gemacht werden."),
  };
}
