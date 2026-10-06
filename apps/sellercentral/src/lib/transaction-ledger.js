import { lt } from "@/lib/locale-text";
import { ledgerEntryLabel } from "@/lib/payments-i18n";

export const HIDDEN_LEDGER_TYPES = new Set(["commission_vat", "commission_vat_refund"]);

export const LEDGER_FILTER_TYPES = [
  "order_received",
  "shipping_customer",
  "commission",
  "commission_vat",
  "shipping_label",
  "return_shipping",
  "refund",
  "commission_refund",
  "advertising",
  "manual_adjustment",
  "chargeback",
  "stripe_fee",
  "payout",
];

// Commission VAT is a real deduction in the settlement ledger (withheld with the commission);
// only legacy (pre-settlement, informational) VAT rows stay hidden.
export function isVisibleLedgerEntry(entry) {
  if (!HIDDEN_LEDGER_TYPES.has(entry?.type)) return true;
  return entry?.affects_balance !== false && !entry?.legacy;
}

export function visibleLedgerEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(isVisibleLedgerEntry);
}

export function getLedgerExportCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    sheetName: t("Movements", "Hareketler", "Mouvements", "Movimientos", "Movimenti", "Bewegungen"),
    title: t("Andertal transactions", "Andertal işlemler", "Transactions Andertal", "Transacciones Andertal", "Transazioni Andertal", "Andertal Transaktionen"),
    date: t("Date", "Tarih", "Date", "Fecha", "Data", "Datum"),
    type: t("Type", "Tür", "Type", "Tipo", "Tipo", "Typ"),
    order: t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung"),
    seller: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Verkäufer"),
    amount: t("Amount EUR", "Tutar EUR", "Montant EUR", "Importe EUR", "Importo EUR", "Betrag EUR"),
    chargedCard: t("card", "kart", "carte", "tarjeta", "carta", "Karte"),
  };
}

export function ledgerExportTypeLabel(entry, locale) {
  const copy = getLedgerExportCopy(locale);
  let label = ledgerEntryLabel(entry, locale);
  if (entry?.charge_method === "card") label = `${label} (${copy.chargedCard})`;
  return label;
}
