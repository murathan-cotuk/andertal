import { lt } from "@/lib/locale-text";

/** Localized label for order / payment / delivery / return / refund status codes (DB values). */
export function statusLabel(locale, code) {
  if (!code) return "—";
  const key = String(code).toLowerCase().trim();
  const labels = STATUS_LABELS[key];
  if (labels) return labels(locale);
  return String(code).replace(/_/g, " ");
}

const STATUS_LABELS = {
  // Order
  offen: (loc) => lt(loc, "Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
  open: (loc) => lt(loc, "Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
  pending: (loc) => lt(loc, "Pending", "Beklemede", "En attente", "Pendiente", "In attesa", "Ausstehend"),
  in_bearbeitung: (loc) => lt(loc, "Processing", "İşleniyor", "En cours", "En proceso", "In elaborazione", "In Bearbeitung"),
  processing: (loc) => lt(loc, "Processing", "İşleniyor", "En cours", "En proceso", "In elaborazione", "In Bearbeitung"),
  abgeschlossen: (loc) => lt(loc, "Completed", "Tamamlandı", "Terminé", "Completado", "Completato", "Abgeschlossen"),
  completed: (loc) => lt(loc, "Completed", "Tamamlandı", "Terminé", "Completado", "Completato", "Abgeschlossen"),
  storniert: (loc) => lt(loc, "Cancelled", "İptal edildi", "Annulé", "Cancelado", "Annullato", "Storniert"),
  cancelled: (loc) => lt(loc, "Cancelled", "İptal edildi", "Annulé", "Cancelado", "Annullato", "Storniert"),
  canceled: (loc) => lt(loc, "Cancelled", "İptal edildi", "Annulé", "Cancelado", "Annullato", "Storniert"),
  retoure: (loc) => lt(loc, "Return", "İade", "Retour", "Devolución", "Reso", "Retoure"),
  retoure_anfrage: (loc) => lt(loc, "Return requested", "İade talebi", "Demande de retour", "Solicitud de devolución", "Richiesta di reso", "Retoure angefragt"),

  // Payment
  bezahlt: (loc) => lt(loc, "Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
  paid: (loc) => lt(loc, "Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
  teil_erstattet: (loc) => lt(loc, "Partially refunded", "Kısmi iade", "Partiellement remboursé", "Reembolso parcial", "Rimborsato parzialmente", "Teilweise erstattet"),
  erstattet: (loc) => lt(loc, "Refunded", "İade edildi", "Remboursé", "Reembolsado", "Rimborsato", "Erstattet"),
  refunded: (loc) => lt(loc, "Refunded", "İade edildi", "Remboursé", "Reembolsado", "Rimborsato", "Erstattet"),
  ausstehend: (loc) => lt(loc, "Pending", "Beklemede", "En attente", "Pendiente", "In attesa", "Ausstehend"),

  // Delivery
  versendet: (loc) => lt(loc, "Shipped", "Kargoya verildi", "Expédié", "Enviado", "Spedito", "Versendet"),
  shipped: (loc) => lt(loc, "Shipped", "Kargoya verildi", "Expédié", "Enviado", "Spedito", "Versendet"),
  zugestellt: (loc) => lt(loc, "Delivered", "Teslim edildi", "Livré", "Entregado", "Consegnato", "Zugestellt"),
  delivered: (loc) => lt(loc, "Delivered", "Teslim edildi", "Livré", "Entregado", "Consegnato", "Zugestellt"),

  // Returns
  genehmigt: (loc) => lt(loc, "Approved", "Onaylandı", "Approuvé", "Aprobado", "Approvato", "Genehmigt"),
  approved: (loc) => lt(loc, "Approved", "Onaylandı", "Approuvé", "Aprobado", "Approvato", "Genehmigt"),
  abgelehnt: (loc) => lt(loc, "Rejected", "Reddedildi", "Refusé", "Rechazado", "Rifiutato", "Abgelehnt"),
  rejected: (loc) => lt(loc, "Rejected", "Reddedildi", "Refusé", "Rechazado", "Rifiutato", "Abgelehnt"),
  eingegangen: (loc) => lt(loc, "Received", "Teslim alındı", "Reçu", "Recibido", "Ricevuto", "Eingegangen"),
};
