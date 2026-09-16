"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Banner, Box, Select, Modal, TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { lt, dateLocaleFor } from "@/lib/locale-text";
import { ledgerEntryLabel } from "@/lib/payments-i18n";
import {
  generatePayoutPeriods,
  initialPayoutPeriodKey,
} from "@/lib/payout-periods";
import { LEDGER_FILTER_TYPES, visibleLedgerEntries } from "@/lib/transaction-ledger";

function txT(locale, en, tr, fr, es, it, de) {
  return lt(locale, en, tr, fr, es, it, de);
}

function getTransactionsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => txT(locale, en, tr, fr, es, it, de);
  return {
    loadError: t("Error loading", "Yükleme hatası", "Erreur de chargement", "Error al cargar", "Errore di caricamento", "Fehler beim Laden"),
    loading: t("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    pageTitle: t("Transactions", "İşlemler", "Transactions", "Transacciones", "Transazioni", "Transaktionen"),
    pageSubtitleSeller: t(
      "Compact statement of credits and debits in the selected period.",
      "Seçilen dönemdeki alacak ve borçların kompakt dökümü.",
      "Relevé compact des crédits et débits de la période.",
      "Extracto compacto de abonos y cargos del periodo.",
      "Estratto compatto di accrediti e addebiti nel periodo.",
      "Kompakte Aufstellung der Gutschriften und Belastungen im Zeitraum."
    ),
    pageSubtitleAdmin: t(
      "Seller statement for the selected period.",
      "Seçilen dönem için satıcı ekstresi.",
      "Relevé vendeur pour la période.",
      "Extracto del vendedor para el periodo.",
      "Estratto venditore per il periodo.",
      "Seller-Kontoauszug für den gewählten Zeitraum."
    ),
    pageTitleAdmin: t("Transactions (Admin)", "İşlemler (Admin)", "Transactions (Admin)", "Transacciones (Admin)", "Transazioni (Admin)", "Transaktionen (Admin)"),
    settlementPeriod: t("Settlement period", "Abrechnungszeitraum", "Période de règlement", "Periodo de liquidación", "Periodo di regolamento", "Abrechnungszeitraum"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    exportExcel: t("Excel", "Excel", "Excel", "Excel", "Excel", "Excel"),
    exportPdf: t("PDF", "PDF", "PDF", "PDF", "PDF", "PDF"),
    selectPeriod: t("Select period", "Dönem seç", "Sélectionner la période", "Seleccionar periodo", "Seleziona periodo", "Zeitraum auswählen"),
    overview: t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht"),
    totalRevenue: t("Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert"),
    ordersCount: (n) => t(`${n} orders`, `${n} sipariş`, `${n} commandes`, `${n} pedidos`, `${n} ordini`, `${n} Bestellungen`),
    commission: (pct) => t(`Commission ${pct}%`, `Komisyon ${pct}%`, `Commission ${pct}%`, `Comisión ${pct}%`, `Commissione ${pct}%`, `Provision ${pct}%`),
    commissionPlain: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    eligibleNet: t("Payout (period)", "Ödeme (dönem)", "Versement (période)", "Pago (periodo)", "Pagamento (periodo)", "Auszahlung (Zeitraum)"),
    refunds: t("Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Rückerstattungen"),
    shippingCustomer: t("Shipping (customer)", "Kargo (müşteri)", "Livraison (client)", "Envío (cliente)", "Spedizione (cliente)", "Versand (Kunde)"),
    shippingPlatform: t("Platform labels", "Platform etiketleri", "Étiquettes plateforme", "Etiquetas plataforma", "Etichette piattaforma", "Plattform-Etiketten"),
    returnShipping: t("Return labels", "İade etiketleri", "Étiquettes retour", "Etiquetas de devolución", "Etichette di reso", "Rücksendeetiketten"),
    advertising: t("Advertising", "Reklam", "Publicité", "Publicidad", "Pubblicità", "Werbung"),
    paidOut: t("Paid out", "Ödendi", "Versé", "Pagado", "Pagato", "Ausgezahlt"),
    viaStripe: t("via Stripe", "Stripe ile", "via Stripe", "vía Stripe", "via Stripe", "via Stripe"),
    periodLabel: t("Period", "Dönem", "Période", "Periodo", "Periodo", "Zeitraum"),
    allSellers: t("All sellers", "Tüm satıcılar", "Tous les vendeurs", "Todos los vendedores", "Tutti i venditori", "Alle Seller"),
    seller: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Seller"),
    globalOverview: t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht"),
    platformRevenue: t("Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert"),
    commissionIncome: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    toPayoutTotal: t("To pay out", "Ödenecek", "À verser", "A pagar", "Da pagare", "Auszuzahlen"),
    toAllSellers: t("All sellers, net", "Tüm satıcılar, net", "Tous vendeurs, net", "Todos vendedores, neto", "Tutti venditori, netto", "Alle Seller, netto"),
    sellerOverview: t("Sellers", "Satıcılar", "Vendeurs", "Vendedores", "Venditori", "Seller"),
    revenue: t("Goods", "Mal", "March.", "Merc.", "Merce", "Ware"),
    payout: t("Net", "Net", "Net", "Neto", "Netto", "Netto"),
    status: t("Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    ordersShort: (n) => t(`${n} orders`, `${n} sipariş`, `${n} cmd.`, `${n} ped.`, `${n} ord.`, `${n} Best.`),
    paid: t("Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
    open: t("Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
    paidViaStripe: t("Mark paid", "Ödendi işaretle", "Marquer payé", "Marcar pagado", "Segna pagato", "Als bezahlt markieren"),
    markPaidConfirm: (name, amount) => t(
      `Mark payout for "${name}" as paid? Amount: ${amount}`,
      `"${name}" için ödemeyi ödendi olarak işaretle? Tutar: ${amount}`,
      `Marquer le versement pour « ${name} » comme payé ? Montant : ${amount}`,
      `¿Marcar pago de "${name}" como pagado? Importe: ${amount}`,
      `Segnare pagamento per "${name}" come pagato? Importo: ${amount}`,
      `Auszahlung für „${name}" als bezahlt markieren? Betrag: ${amount}`
    ),
    error: t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler"),
    addAdjustment: t("Adjustment", "Düzeltme", "Ajustement", "Ajuste", "Rettifica", "Anpassung"),
    addAdjustmentModalTitle: t("Manual ledger adjustment", "Manuel bakiye düzeltmesi", "Ajustement manuel du solde", "Ajuste manual del saldo", "Rettifica manuale del saldo", "Manuelle Kontoanpassung"),
    adjustmentSellerLabel: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Verkäufer"),
    adjustmentAmountLabel: t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag"),
    adjustmentAmountHelp: t(
      "Use a positive value to credit the seller, negative to debit (e.g. -12.50).",
      "Satıcıya alacak yazmak için pozitif, borç yazmak için negatif değer girin (örn. -12.50).",
      "Utilisez une valeur positive pour créditer le vendeur, négative pour débiter (ex. -12,50).",
      "Use un valor positivo para abonar al vendedor, negativo para cargar (p. ej. -12,50).",
      "Usa un valore positivo per accreditare il venditore, negativo per addebitare (es. -12,50).",
      "Positiver Wert für Gutschrift, negativer Wert für Belastung (z. B. -12,50)."
    ),
    adjustmentNoteLabel: t("Note", "Not", "Note", "Nota", "Nota", "Notiz"),
    adjustmentSubmit: t("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    cancel: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    adjustmentSellerRequired: t("Please select a seller", "Lütfen bir satıcı seçin", "Veuillez sélectionner un vendeur", "Seleccione un vendedor", "Seleziona un venditore", "Bitte einen Seller auswählen"),
    adjustmentAmountRequired: t("Please enter a non-zero amount", "Lütfen sıfırdan farklı bir tutar girin", "Veuillez saisir un montant différent de zéro", "Introduzca un importe distinto de cero", "Inserisci un importo diverso da zero", "Bitte einen Betrag ungleich null eingeben"),
    removeAdjustmentConfirm: t("Remove this manual adjustment?", "Bu manuel düzeltme kaldırılsın mı?", "Supprimer cet ajustement manuel ?", "¿Eliminar este ajuste manual?", "Rimuovere questa rettifica manuale?", "Diese manuelle Anpassung entfernen?"),
    noTransactions: t("No movements in this period.", "Bu dönemde hareket yok.", "Aucun mouvement sur cette période.", "No hay movimientos en este periodo.", "Nessun movimento in questo periodo.", "Keine Bewegungen in diesem Zeitraum."),
    colDate: t("Date", "Tarih", "Date", "Fecha", "Data", "Datum"),
    colType: t("Type", "Tür", "Type", "Tipo", "Tipo", "Typ"),
    colOrder: t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung"),
    colAmount: t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag"),
    movements: t("Account movements", "Hesap hareketleri", "Mouvements de compte", "Movimientos de cuenta", "Movimenti di conto", "Kontobewegungen"),
    typeAll: t("All types", "Tüm türler", "Tous types", "Todos tipos", "Tutti i tipi", "Alle Typen"),
    searchPlaceholder: t("Order no. or type…", "Sipariş no. veya tür…", "N° commande ou type…", "N.º pedido o tipo…", "N. ordine o tipo…", "Bestellnr. oder Typ…"),
    chargedCard: t("Charged to card", "Karttan çekildi", "Débité de la carte", "Cargado a tarjeta", "Addebitato su carta", "Von Karte abgebucht"),
    remove: t("Remove", "Kaldır", "Supprimer", "Eliminar", "Rimuovi", "Entfernen"),
    sum: t("Payout effect", "Ödeme etkisi", "Effet versement", "Efecto pago", "Effetto pagamento", "Auszahlungswirkung"),
    loginAgain: t("Please login again.", "Lütfen tekrar giriş yapın.", "Veuillez vous reconnecter.", "Inicia sesión de nuevo.", "Accedi di nuovo.", "Bitte erneut einloggen."),
    exportFailed: t("Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione non riuscita", "Export fehlgeschlagen"),
    resetFilters: t("Reset", "Sıfırla", "Réinit.", "Restablecer", "Reimposta", "Zurücksetzen"),
    hintGoods: t(
      "Sum of sold goods in this period (item prices, excluding shipping).",
      "Bu dönemdeki satılan malların tutarı (ürün fiyatları, kargo hariç).",
      "Somme des marchandises vendues sur la période (hors livraison).",
      "Suma de mercancía vendida en el periodo (sin envío).",
      "Somma della merce venduta nel periodo (esclusa spedizione).",
      "Summe der verkauften Ware im Zeitraum (Artikelpreise, ohne Versand)."
    ),
    hintCommission: t(
      "Andertal commission (net). Shown on the commission invoice and deducted from payout. VAT is billed separately and does not reduce this payout.",
      "Andertal komisyonu (net). Komisyon faturasında görünür ve ödemeden düşülür. KDV ayrıca faturalanır, bu ödemeyi azaltmaz.",
      "Commission Andertal (nette). Figurée sur la facture de commission et déduite du versement. La TVA est facturée à part et ne réduit pas ce versement.",
      "Comisión Andertal (neta). En la factura de comisión y se descuenta del pago. El IVA se factura aparte y no reduce este pago.",
      "Commissione Andertal (netta). In fattura commissione e sottratta dal pagamento. L'IVA è fatturata a parte e non riduce questo pagamento.",
      "Andertal-Provision (netto). Steht auf der Provisionsrechnung und wird von der Auszahlung abgezogen. Die USt. wird separat berechnet und mindert diese Auszahlung nicht."
    ),
    hintShipCust: t(
      "Shipping the customer paid on the order. Credited to you with the sale.",
      "Müşterinin siparişte ödediği kargo. Satışla birlikte size alacak yazılır.",
      "Frais de livraison payés par le client. Crédités avec la vente.",
      "Envío pagado por el cliente en el pedido. Se abona con la venta.",
      "Spedizione pagata dal cliente. Accreditata con la vendita.",
      "Vom Kunden in der Bestellung bezahlter Versand. Wird dir mit dem Verkauf gutgeschrieben."
    ),
    hintLabels: t(
      "Shipping labels bought from Andertal (Sendcloud). Deducted from your payout unless they were charged to your card.",
      "Andertal üzerinden satın alınan kargo etiketleri (Sendcloud). Kartınızdan çekilmediyse ödemenizden düşülür.",
      "Étiquettes achetées via Andertal (Sendcloud). Déduites du versement sauf si débitées sur votre carte.",
      "Etiquetas compradas en Andertal (Sendcloud). Se descuentan del pago salvo si se cargaron a su tarjeta.",
      "Etichette acquistate da Andertal (Sendcloud). Sottratte dal pagamento se non addebitate sulla carta.",
      "Über Andertal gekaufte Versandetiketten (Sendcloud). Werden von der Auszahlung abgezogen, sofern nicht per Karte bezahlt."
    ),
    hintReturns: t(
      "Return labels bought from Andertal, charged against payout.",
      "Andertal üzerinden alınan iade etiketleri, ödemeden düşülür.",
      "Étiquettes de retour achetées via Andertal, déduites du versement.",
      "Etiquetas de devolución compradas en Andertal, descontadas del pago.",
      "Etichette di reso acquistate da Andertal, sottratte dal pagamento.",
      "Über Andertal gekaufte Rücksendeetiketten, von der Auszahlung abgezogen."
    ),
    hintRefunds: t(
      "Refunds to customers. Reduce the payout for this period.",
      "Müşteri iadeleri. Bu dönemin ödemesini azaltır.",
      "Remboursements clients. Réduisent le versement de la période.",
      "Reembolsos a clientes. Reducen el pago del periodo.",
      "Rimborsi ai clienti. Riducono il pagamento del periodo.",
      "Erstattungen an Kunden. Mindern die Auszahlung dieses Zeitraums."
    ),
    hintAds: t(
      "Advertising costs booked against your seller balance.",
      "Satıcı bakiyenize işlenen reklam giderleri.",
      "Frais publicitaires imputés à votre solde vendeur.",
      "Costes publicitarios cargados a su saldo de vendedor.",
      "Costi pubblicitari addebitati sul saldo venditore.",
      "Werbekosten, die gegen dein Seller-Guthaben gebucht wurden."
    ),
    hintNet: t(
      "Net effect on payout: goods + customer shipping − commission − platform labels − refunds − ads.",
      "Ödemeye net etki: mal + müşteri kargosu − komisyon − platform etiketleri − iadeler − reklam.",
      "Effet net sur le versement : marchandises + livraison client − commission − étiquettes − remboursements − pub.",
      "Efecto neto en el pago: mercancía + envío cliente − comisión − etiquetas − reembolsos − publicidad.",
      "Effetto netto sul pagamento: merce + spedizione cliente − commissione − etichette − rimborsi − ads.",
      "Netto-Effekt auf die Auszahlung: Ware + Kundenversand − Provision − Plattform-Etiketten − Erstattungen − Werbung."
    ),
    hintPaid: t(
      "Already transferred to the seller IBAN for this period.",
      "Bu dönem için satıcı IBAN'ına zaten aktarıldı.",
      "Déjà viré sur l'IBAN du vendeur pour cette période.",
      "Ya transferido al IBAN del vendedor en este periodo.",
      "Già trasferito sull'IBAN del venditore per questo periodo.",
      "Für diesen Zeitraum bereits auf die Seller-IBAN überwiesen."
    ),
  };
}

function fmtCents(cents, currency = "EUR", locale = "de") {
  return ((cents || 0) / 100).toLocaleString(dateLocaleFor(locale), { style: "currency", currency });
}

function fmtDate(d, locale = "de") {
  return d ? new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function amountColor(cents) {
  if (cents > 0) return "#059669";
  if (cents < 0) return "#dc2626";
  return "#111827";
}

function signedAmount(cents, locale) {
  const n = Number(cents || 0);
  const formatted = fmtCents(Math.abs(n), "EUR", locale);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

const PERIODS = generatePayoutPeriods(18);

const TX_CSS = `
.tx-page { font-size: 12px; color: #111827; }
.tx-page .Polaris-Header-Title { font-size: 18px !important; line-height: 1.25 !important; }
.tx-page .Polaris-Header-Title__SubTitle { font-size: 11px !important; }
.tx-page .Polaris-ShadowBevel:has(.tx-kpis) { overflow: visible !important; }
.tx-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 8px; overflow: visible; }
.tx-kpi { position: relative; background: #fff; border: 1px solid #e8eaed; border-radius: 8px; padding: 10px 12px 9px; box-shadow: 0 1px 2px rgba(16,24,40,.04); min-height: 64px; }
.tx-kpi:hover { border-color: #d0d5dd; box-shadow: 0 4px 12px rgba(16,24,40,.08); z-index: 4; }
.tx-kpi-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
.tx-kpi-label { font-size: 10px; font-weight: 600; letter-spacing: .02em; color: #667085; line-height: 1.25; }
.tx-kpi-i { flex: 0 0 14px; width: 14px; height: 14px; border-radius: 50%; border: 1px solid #d0d5dd; color: #98a2b3; font-size: 9px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; background: #f9fafb; }
.tx-kpi-value { font-size: 15px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.tx-kpi-note { font-size: 10px; color: #98a2b3; margin-top: 3px; }
.tx-kpi-tip { display: none; position: absolute; left: 8px; right: 8px; bottom: calc(100% + 6px); z-index: 30; background: #111827; color: #fff; font-size: 11px; line-height: 1.4; padding: 8px 10px; border-radius: 8px; box-shadow: 0 8px 24px rgba(16,24,40,.18); }
.tx-kpi:hover .tx-kpi-tip { display: block; }
.tx-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
.tx-table { font-variant-numeric: tabular-nums; }
.tx-th, .tx-td { font-size: 11px; }
`;

async function exportTransactionsFile({ periodStart, periodEnd, sellerId, locale, format }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
  if (!token) throw new Error(lt(locale, "Please login again.", "Lütfen tekrar giriş yapın.", "Veuillez vous reconnecter.", "Inicia sesión de nuevo.", "Accedi di nuovo.", "Bitte erneut einloggen."));
  const response = await fetch("/api/analytics/transactions-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sellerToken: token,
      period_start: periodStart,
      period_end: periodEnd,
      seller_id: sellerId || undefined,
      locale,
      format,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `${lt(locale, "Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione non riuscita", "Export fehlgeschlagen")} (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = format === "pdf" ? "pdf" : "xlsx";
  a.download = `andertal-transactions-${locale}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatBox({ label, value, note, color, hint }) {
  return (
    <div className="tx-kpi" title={hint || undefined}>
      <div className="tx-kpi-top">
        <div className="tx-kpi-label">{label}</div>
        {hint ? <span className="tx-kpi-i" aria-hidden>i</span> : null}
      </div>
      <div className="tx-kpi-value" style={{ color: color || "#111827" }}>{value}</div>
      {note ? <div className="tx-kpi-note">{note}</div> : null}
      {hint ? <div className="tx-kpi-tip" role="tooltip">{hint}</div> : null}
    </div>
  );
}

function TotalsBoxes({ totals, copy, locale, isSuperuser, commissionRate }) {
  const fmt = (cents) => fmtCents(cents, "EUR", locale);
  const t = totals || {};
  const merch = Number(t.merchandise_cents || 0);
  const commission = Number(t.commission_cents || 0);
  const shipCust = Number(t.shipping_customer_cents || 0);
  const labels = Number(t.shipping_label_cents || 0);
  const retShip = Number(t.return_shipping_cents || 0);
  const refunds = Number(t.refunds_cents || 0);
  const ads = Number(t.advertising_cents || 0);
  const net = Number(t.net_cents || 0);
  const paid = Number(t.payouts_cents || 0);
  const pct = Number.isFinite(Number(commissionRate)) ? String((Number(commissionRate) * 100).toFixed(1)).replace(/\.0$/, "") : "12";
  const commColor = isSuperuser ? "#059669" : "#dc2626";
  return (
    <div className="tx-kpis">
      <StatBox
        label={isSuperuser ? copy.platformRevenue : copy.totalRevenue}
        value={fmt(merch)}
        note={copy.ordersCount(t.order_count || 0)}
        hint={copy.hintGoods}
      />
      <StatBox
        label={isSuperuser ? copy.commissionIncome : copy.commission(pct)}
        value={isSuperuser ? fmt(commission) : `−${fmt(commission)}`}
        color={commission ? commColor : undefined}
        hint={copy.hintCommission}
      />
      <StatBox
        label={copy.shippingCustomer}
        value={fmt(shipCust)}
        color={shipCust > 0 ? "#059669" : undefined}
        hint={copy.hintShipCust}
      />
      <StatBox
        label={copy.shippingPlatform}
        value={labels > 0 ? `−${fmt(labels)}` : fmt(0)}
        color={labels > 0 ? "#dc2626" : undefined}
        hint={copy.hintLabels}
      />
      {retShip > 0 && (
        <StatBox label={copy.returnShipping} value={`−${fmt(retShip)}`} color="#dc2626" hint={copy.hintReturns} />
      )}
      <StatBox
        label={copy.refunds}
        value={refunds > 0 ? `−${fmt(refunds)}` : fmt(0)}
        color={refunds > 0 ? "#dc2626" : undefined}
        hint={copy.hintRefunds}
      />
      {ads > 0 && (
        <StatBox label={copy.advertising} value={`−${fmt(ads)}`} color="#dc2626" hint={copy.hintAds} />
      )}
      <StatBox
        label={isSuperuser ? copy.toPayoutTotal : copy.eligibleNet}
        value={signedAmount(net, locale)}
        color={amountColor(net)}
        note={isSuperuser ? copy.toAllSellers : undefined}
        hint={copy.hintNet}
      />
      <StatBox
        label={copy.paidOut}
        value={paid > 0 ? fmt(paid) : "—"}
        note={paid > 0 ? copy.viaStripe : undefined}
        hint={copy.hintPaid}
      />
    </div>
  );
}

function PeriodToolbar({ copy, periodKey, setPeriodKey, extraSelect, onExcel, onPdf, onRefresh, exporting, loading, extraActions }) {
  return (
    <div className="tx-toolbar">
      <div style={{ flex: "1 1 220px", maxWidth: 280 }}>
        <Select
          label={copy.periodLabel}
          options={PERIODS.map((p) => ({ label: p.label, value: p.key }))}
          value={periodKey}
          onChange={setPeriodKey}
        />
      </div>
      {extraSelect}
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {extraActions}
        <Button onClick={onExcel} loading={exporting === "xlsx"} size="slim">{copy.exportExcel}</Button>
        <Button onClick={onPdf} loading={exporting === "pdf"} size="slim">{copy.exportPdf}</Button>
        <Button onClick={onRefresh} loading={loading} size="slim">{copy.refresh}</Button>
      </div>
    </div>
  );
}

function LedgerTable({
  entries, loading, isSuperuser, locale, copy, onRemoveAdjustment, removingId,
}) {
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const rows = useMemo(() => {
    let list = visibleLedgerEntries(entries);
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      list = list.filter((e) =>
        String(e.order_number || "").toLowerCase().includes(q) ||
        String(e.store_name || "").toLowerCase().includes(q) ||
        ledgerEntryLabel(e, locale).toLowerCase().includes(q)
      );
    }
    if (filterType !== "all") list = list.filter((e) => e.type === filterType);
    return list;
  }, [entries, filterSearch, filterType, locale]);

  const cols = isSuperuser
    ? "88px 1.5fr 92px 110px 108px"
    : "88px 1.7fr 100px 108px";

  const typeOptions = [
    { label: copy.typeAll, value: "all" },
    ...LEDGER_FILTER_TYPES.map((type) => ({
      label: ledgerEntryLabel({ type, description_params: { rate_pct: 12 } }, locale),
      value: type,
    })),
  ];

  const sumCents = rows
    .filter((e) => e.affects_balance !== false)
    .reduce((s, e) => s + Number(e.amount_cents || 0), 0);

  return (
    <Card padding="0">
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{copy.movements}</div>
        {(filterSearch.trim() || filterType !== "all") && (
          <Button size="slim" variant="plain" onClick={() => { setFilterSearch(""); setFilterType("all"); }}>
            {copy.resetFilters}
          </Button>
        )}
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px", minWidth: 160 }}>
          <TextField
            label={copy.searchPlaceholder}
            labelHidden
            value={filterSearch}
            onChange={setFilterSearch}
            placeholder={copy.searchPlaceholder}
            clearButton
            onClearButtonClick={() => setFilterSearch("")}
            autoComplete="off"
          />
        </div>
        <div style={{ width: 220 }}>
          <Select label={copy.typeAll} labelHidden options={typeOptions} value={filterType} onChange={setFilterType} />
        </div>
      </div>
      {loading ? (
        <Box padding="400"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box>
      ) : rows.length === 0 ? (
        <Box padding="400"><Text tone="subdued" alignment="center">{copy.noTransactions}</Text></Box>
      ) : (
        <div className="tx-table">
          <div style={{
            display: "grid", gridTemplateColumns: cols, gap: 6, padding: "6px 14px",
            borderBottom: "1px solid #e5e7eb", fontSize: 10, fontWeight: 600, color: "#667085",
            background: "#fafafa", letterSpacing: "0.02em", textTransform: "uppercase",
          }}>
            <div>{copy.colDate}</div>
            <div>{copy.colType}</div>
            <div>{copy.colOrder}</div>
            {isSuperuser && <div>{copy.seller}</div>}
            <div style={{ textAlign: "right" }}>{copy.colAmount}</div>
          </div>
          {rows.map((e, i) => {
            const cents = Number(e.amount_cents || 0);
            const isManual = e.type === "manual_adjustment" && String(e.id || "").startsWith("adj-");
            return (
              <div
                key={e.id || i}
                style={{
                  display: "grid", gridTemplateColumns: cols, gap: 6, padding: "5px 14px",
                  borderBottom: "1px solid #f3f4f6", fontSize: 11, alignItems: "center",
                  background: i % 2 === 0 ? "#fff" : "#fbfbfc", minHeight: 28,
                }}
              >
                <div style={{ color: "#4b5563" }}>{fmtDate(e.occurred_at, locale)}</div>
                <div style={{ color: "#111827" }}>
                  {ledgerEntryLabel(e, locale)}
                  {e.charge_method === "card" && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af" }}>{copy.chargedCard}</span>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: "#111827" }}>{e.order_number || "—"}</div>
                {isSuperuser && <div style={{ fontSize: 11, color: "#6b7280" }}>{e.store_name || e.seller_id || "—"}</div>}
                <div style={{ textAlign: "right", fontWeight: 600, color: amountColor(cents) }}>
                  {signedAmount(cents, locale)}
                  {isSuperuser && isManual && (
                    <div>
                      <Button
                        size="micro"
                        tone="critical"
                        variant="plain"
                        loading={removingId === e.id}
                        onClick={() => onRemoveAdjustment?.(e)}
                      >
                        {copy.remove}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{
            display: "grid", gridTemplateColumns: cols, gap: 6, padding: "7px 14px",
            borderTop: "1px solid #e5e7eb", fontSize: 11, fontWeight: 700, background: "#f9fafb",
          }}>
            <div style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{copy.sum}</div>
            <div />
            <div />
            {isSuperuser && <div />}
            <div style={{ textAlign: "right", color: amountColor(sumCents) }}>
              {signedAmount(sumCents, locale)}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function SellerTransactionsView({ sellerId }) {
  const locale = useLocale();
  const copy = getTransactionsCopy(locale);

  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(PERIODS));
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [commissionRate, setCommissionRate] = useState(0.12);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(null);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];
  const periodStart = selectedPeriod.startDate || selectedPeriod.start;
  const periodEnd = selectedPeriod.endDate || selectedPeriod.end;

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await exportTransactionsFile({ periodStart, periodEnd, sellerId, locale, format });
    } catch (e) {
      alert(e?.message || copy.loadError);
    } finally {
      setExporting(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const res = await getMedusaAdminClient().getSellerLedger({
        period_start: periodStart,
        period_end: periodEnd,
      });
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
      setTotals(res?.totals || {});
      setCommissionRate(Number(res?.commission_rate) || 0.12);
    } catch (e) {
      setErr(e?.message || copy.loadError);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, periodStart, periodEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="tx-page">
      <style>{TX_CSS}</style>
      <Page title={copy.pageTitle} subtitle={copy.pageSubtitleSeller}>
        <Layout>
          <Layout.Section>
            {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

            <Card>
              <PeriodToolbar
                copy={copy}
                periodKey={periodKey}
                setPeriodKey={setPeriodKey}
                onExcel={() => handleExport("xlsx")}
                onPdf={() => handleExport("pdf")}
                onRefresh={loadData}
                exporting={exporting}
                loading={loading}
              />
            </Card>

            <Box paddingBlockStart="300">
              <Card>
                <BlockStack gap="200">
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#667085", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {copy.overview} · {selectedPeriod.label}
                  </div>
                  {loading ? <Text tone="subdued">{copy.loading}</Text> : (
                    <TotalsBoxes totals={totals} copy={copy} locale={locale} commissionRate={commissionRate} />
                  )}
                </BlockStack>
              </Card>
            </Box>

            <Box paddingBlockStart="300">
              <LedgerTable entries={entries} loading={loading} locale={locale} copy={copy} />
            </Box>
          </Layout.Section>
        </Layout>
      </Page>
    </div>
  );
}

function AdminTransactionsView() {
  const locale = useLocale();
  const copy = getTransactionsCopy(locale);

  const [periodKey, setPeriodKey] = useState(() => initialPayoutPeriodKey(PERIODS));
  const [filterSeller, setFilterSeller] = useState("");
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({});
  const [sellers, setSellers] = useState([]);
  const [sellerSummaries, setSellerSummaries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [markingPaid, setMarkingPaid] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjSellerId, setAdjSellerId] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState("");
  const [exporting, setExporting] = useState(null);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];
  const periodStart = selectedPeriod.startDate || selectedPeriod.start;
  const periodEnd = selectedPeriod.endDate || selectedPeriod.end;

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await exportTransactionsFile({ periodStart, periodEnd, sellerId: filterSeller, locale, format });
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setExporting(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const params = { period_start: periodStart, period_end: periodEnd };
      if (filterSeller) params.seller_id = filterSeller;
      const res = await getMedusaAdminClient().getSellerLedger(params);
      setEntries(Array.isArray(res?.entries) ? res.entries : []);
      setTotals(res?.totals || {});
      setSellers(Array.isArray(res?.sellers) ? res.sellers : []);
      setSellerSummaries(Array.isArray(res?.seller_summaries) ? res.seller_summaries : (
        res?.totals && res?.seller_id
          ? [{ seller_id: res.seller_id, store_name: res.store_name, totals: res.totals, count: res.count }]
          : []
      ));
    } catch (e) {
      setErr(e?.message || copy.error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [copy.error, periodStart, periodEnd, filterSeller]);

  useEffect(() => { loadData(); }, [loadData]);

  const sellerOptions = [
    { label: copy.allSellers, value: "" },
    ...sellers.map((s) => ({ label: s.store_name || s.seller_id, value: s.seller_id })),
  ];

  const handleMarkPaid = async (s) => {
    const t = s.totals || {};
    const payout = Number(t.net_cents || 0);
    if (!(await confirmDelete(copy.markPaidConfirm(s.store_name, fmtCents(payout, "EUR", locale))))) return;
    setMarkingPaid(s.seller_id);
    try {
      await getMedusaAdminClient().createPayout({
        seller_id: s.seller_id,
        period_start: periodStart,
        period_end: periodEnd,
        total_cents: Number(t.merchandise_cents || 0),
        commission_cents: Number(t.commission_cents || 0),
        payout_cents: Math.max(0, payout),
        notes: `${s.seller_id}-${periodKey}`,
      });
      await loadData();
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setMarkingPaid(null);
    }
  };

  const openAdjModal = () => {
    setAdjSellerId(filterSeller || "");
    setAdjAmount("");
    setAdjNote("");
    setAdjError("");
    setAdjModalOpen(true);
  };

  const submitAdjustment = async () => {
    setAdjError("");
    if (!adjSellerId) { setAdjError(copy.adjustmentSellerRequired); return; }
    const amountCents = Math.round(Number(String(adjAmount).replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents === 0) { setAdjError(copy.adjustmentAmountRequired); return; }
    setAdjSaving(true);
    try {
      await getMedusaAdminClient().createManualAdjustment({ seller_id: adjSellerId, amount_cents: amountCents, note: adjNote.trim() });
      setAdjModalOpen(false);
      await loadData();
    } catch (e) {
      setAdjError(e?.message || copy.error);
    } finally {
      setAdjSaving(false);
    }
  };

  const removeAdjustment = async (entry) => {
    if (!(await confirmDelete(copy.removeAdjustmentConfirm))) return;
    setRemovingId(entry.id);
    try {
      const rawId = String(entry.id || "").replace(/^adj-/, "").replace(/^ledger-/, "");
      await getMedusaAdminClient().deleteManualAdjustment(rawId);
      await loadData();
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setRemovingId(null);
    }
  };

  const overviewSellers = filterSeller
    ? sellerSummaries.filter((s) => s.seller_id === filterSeller)
    : sellerSummaries.filter((s) => Number(s.count || 0) > 0 || Number(s.totals?.net_cents || 0) !== 0);

  return (
    <div className="tx-page">
      <style>{TX_CSS}</style>
      <Page title={copy.pageTitleAdmin} subtitle={copy.pageSubtitleAdmin}>
        <Layout>
          <Layout.Section>
            {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

            <Card>
              <PeriodToolbar
                copy={copy}
                periodKey={periodKey}
                setPeriodKey={setPeriodKey}
                extraSelect={(
                  <div style={{ flex: "1 1 180px", maxWidth: 240 }}>
                    <Select label={copy.seller} options={sellerOptions} value={filterSeller} onChange={setFilterSeller} />
                  </div>
                )}
                extraActions={<Button onClick={openAdjModal} size="slim">{copy.addAdjustment}</Button>}
                onExcel={() => handleExport("xlsx")}
                onPdf={() => handleExport("pdf")}
                onRefresh={loadData}
                exporting={exporting}
                loading={loading}
              />
            </Card>

            <Box paddingBlockStart="300">
              <Card>
                <BlockStack gap="200">
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#667085", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {copy.globalOverview} · {selectedPeriod.label}
                  </div>
                  {loading ? <Text tone="subdued">{copy.loading}</Text> : (
                    <TotalsBoxes totals={totals} copy={copy} locale={locale} isSuperuser />
                  )}
                </BlockStack>
              </Card>
            </Box>

            {!filterSeller && overviewSellers.length > 0 && (
              <Box paddingBlockStart="300">
                <Card padding="0">
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600 }}>
                    {copy.sellerOverview} · {selectedPeriod.label}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 88px 88px 100px 72px auto", gap: 6, padding: "5px 14px", borderBottom: "1px solid #f3f4f6", fontSize: 10, fontWeight: 600, color: "#667085", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    <div>{copy.seller}</div>
                    <div style={{ textAlign: "right" }}>{copy.revenue}</div>
                    <div style={{ textAlign: "right" }}>{copy.commissionPlain}</div>
                    <div style={{ textAlign: "right" }}>{copy.payout}</div>
                    <div style={{ textAlign: "center" }}>{copy.status}</div>
                    <div></div>
                  </div>
                  {overviewSellers.map((s, i) => {
                    const t = s.totals || {};
                    const paid = Number(t.payouts_cents || 0) > 0;
                    const net = Number(t.net_cents || 0);
                    return (
                      <div key={s.seller_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 88px 88px 100px 72px auto", gap: 6, padding: "5px 14px", minHeight: 28, borderBottom: i < overviewSellers.length - 1 ? "1px solid #f9fafb" : "none", alignItems: "center", fontSize: 11 }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.store_name}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>{copy.ordersShort(t.order_count || 0)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>{fmtCents(t.merchandise_cents, "EUR", locale)}</div>
                        <div style={{ textAlign: "right", color: "#059669", fontWeight: 600 }}>+{fmtCents(t.commission_cents, "EUR", locale)}</div>
                        <div style={{ textAlign: "right", fontWeight: 700, color: paid ? "#6b7280" : amountColor(net) }}>{signedAmount(net, locale)}</div>
                        <div style={{ textAlign: "center" }}>
                          <Badge tone={paid ? "success" : net > 0 ? "warning" : "new"}>
                            {paid ? copy.paid : net > 0 ? copy.open : "—"}
                          </Badge>
                        </div>
                        <div>
                          {!paid && net > 0 && (
                            <Button size="slim" variant="primary" loading={markingPaid === s.seller_id}
                              onClick={() => handleMarkPaid(s)}>
                              {copy.paidViaStripe}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </Box>
            )}

            <Box paddingBlockStart="300">
              <LedgerTable
                entries={entries}
                loading={loading}
                isSuperuser
                locale={locale}
                copy={copy}
                onRemoveAdjustment={removeAdjustment}
                removingId={removingId}
              />
            </Box>
          </Layout.Section>
        </Layout>
      </Page>

      <Modal
        open={adjModalOpen}
        onClose={() => setAdjModalOpen(false)}
        title={copy.addAdjustmentModalTitle}
        primaryAction={{ content: copy.adjustmentSubmit, onAction: submitAdjustment, loading: adjSaving }}
        secondaryActions={[{ content: copy.cancel, onAction: () => setAdjModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {adjError && <Banner tone="critical"><Text>{adjError}</Text></Banner>}
            <Select
              label={copy.adjustmentSellerLabel}
              options={sellers.map((s) => ({ label: s.store_name || s.seller_id, value: s.seller_id }))}
              value={adjSellerId}
              onChange={setAdjSellerId}
              placeholder={copy.allSellers}
            />
            <TextField
              label={copy.adjustmentAmountLabel}
              type="text"
              value={adjAmount}
              onChange={setAdjAmount}
              helpText={copy.adjustmentAmountHelp}
              autoComplete="off"
            />
            <TextField
              label={copy.adjustmentNoteLabel}
              value={adjNote}
              onChange={setAdjNote}
              multiline={2}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  );
}

export default function TransactionsPageWrapper() {
  const locale = useLocale();
  const copy = getTransactionsCopy(locale);
  const [isSuperuser, setIsSuperuser] = useState(null);
  const [sellerId, setSellerId] = useState("");

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    const sid = typeof window !== "undefined" ? (localStorage.getItem("sellerId") || "") : "";
    setIsSuperuser(su);
    setSellerId(sid);
  }, []);

  if (isSuperuser === null) {
    return (
      <DashboardLayout>
        <Page title={copy.pageTitle}>
          <Box padding="400"><Text tone="subdued">{copy.loading}</Text></Box>
        </Page>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {isSuperuser
        ? <AdminTransactionsView />
        : <SellerTransactionsView sellerId={sellerId} />}
    </DashboardLayout>
  );
}
