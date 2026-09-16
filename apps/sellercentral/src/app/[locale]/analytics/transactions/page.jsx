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
      "Statement of every credit and debit in the selected period",
      "Seçilen dönemdeki her alacak ve borcun dökümü",
      "Relevé de chaque crédit et débit sur la période",
      "Extracto de cada abono y cargo del periodo",
      "Estratto di ogni accredito e addebito nel periodo",
      "Aufstellung jeder Gutschrift und Belastung im gewählten Zeitraum"
    ),
    pageSubtitleAdmin: t(
      "Seller statement: every credit and debit in the selected period",
      "Satıcı ekstresi: seçilen dönemdeki her alacak ve borç",
      "Relevé vendeur : chaque crédit et débit sur la période",
      "Extracto del vendedor: cada abono y cargo del periodo",
      "Estratto venditore: ogni accredito e addebito nel periodo",
      "Seller-Kontoauszug: jede Gutschrift und Belastung im Zeitraum"
    ),
    pageTitleAdmin: t("Transactions (Admin)", "İşlemler (Admin)", "Transactions (Admin)", "Transacciones (Admin)", "Transazioni (Admin)", "Transaktionen (Admin)"),
    settlementPeriod: t("Settlement period", "Abrechnungszeitraum", "Période de règlement", "Periodo de liquidación", "Periodo di regolamento", "Abrechnungszeitraum"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    exportExcel: t("Export Excel", "Excel'e aktar", "Exporter Excel", "Exportar Excel", "Esporta Excel", "Excel exportieren"),
    selectPeriod: t("Select period", "Dönem seç", "Sélectionner la période", "Seleccionar periodo", "Seleziona periodo", "Zeitraum auswählen"),
    overview: t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht"),
    totalRevenue: t("Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert"),
    ordersCount: (n) => t(`${n} orders`, `${n} sipariş`, `${n} commandes`, `${n} pedidos`, `${n} ordini`, `${n} Bestellungen`),
    commission: (pct) => t(`Commission (${pct}%)`, `Komisyon (${pct}%)`, `Commission (${pct}%)`, `Comisión (${pct}%)`, `Commissione (${pct}%)`, `Provision (${pct}%)`),
    commissionPlain: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    commissionNote: t("Same as Billing invoice", "Billing faturasıyla aynı", "Identique à la facture Billing", "Igual que la factura Billing", "Come la fattura Billing", "Wie auf der Provisionsrechnung"),
    commissionVat: t("Commission VAT", "Komisyon KDV", "TVA commission", "IVA comisión", "IVA commissione", "Provision USt"),
    commissionVatNote: t("On the invoice, not deducted from payout", "Faturada, ödemeden düşülmez", "Sur la facture, pas déduit du versement", "En la factura, no se descuenta del pago", "In fattura, non sottratto dal pagamento", "Auf der Rechnung, nicht von der Auszahlung"),
    eligibleNet: t("Payout (period)", "Ödeme (dönem)", "Versement (période)", "Pago (periodo)", "Pagamento (periodo)", "Auszahlung (Zeitraum)"),
    refunds: t("Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Rückerstattungen"),
    shippingCustomer: t("Shipping (customer)", "Kargo (müşteri)", "Livraison (client)", "Envío (cliente)", "Spedizione (cliente)", "Versand (Kunde)"),
    shippingPlatform: t("Shipping labels", "Kargo etiketleri", "Étiquettes d'expédition", "Etiquetas de envío", "Etichette di spedizione", "Versandetiketten"),
    returnShipping: t("Return shipping", "İade kargosu", "Retour", "Devolución", "Reso", "Rücksendung"),
    advertising: t("Advertising", "Reklam", "Publicité", "Publicidad", "Pubblicità", "Werbung"),
    paidOut: t("Paid out", "Ödendi", "Versé", "Pagado", "Pagato", "Ausgezahlt"),
    viaStripe: t("via Stripe", "Stripe ile", "via Stripe", "vía Stripe", "via Stripe", "via Stripe"),
    stillPending: t("Still pending", "Hâlâ bekliyor", "Toujours en attente", "Aún pendiente", "Ancora in sospeso", "Noch ausstehend"),
    pendingPayout: t("Pending payout:", "Bekleyen ödeme:", "Versement en attente :", "Pago pendiente:", "Pagamento in sospeso:", "Ausstehende Auszahlung:"),
    pendingPayoutBody: t(
      "will be transferred via Stripe. Reference:",
      "Stripe ile aktarılacak. Referans:",
      "sera viré via Stripe. Référence :",
      "se transferirá vía Stripe. Referencia:",
      "verrà trasferito via Stripe. Riferimento:",
      "wird über Stripe überwiesen. Verwendungszweck:"
    ),
    periodLabel: t("Period", "Dönem", "Période", "Periodo", "Periodo", "Zeitraum"),
    allSellers: t("All sellers", "Tüm satıcılar", "Tous les vendeurs", "Todos los vendedores", "Tutti i venditori", "Alle Seller"),
    seller: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Seller"),
    globalOverview: t("Global overview", "Genel özet", "Aperçu global", "Resumen global", "Panoramica globale", "Gesamtübersicht"),
    platformRevenue: t("Goods value (seller GMV)", "Mal tutarı (satıcı GMV)", "Valeur marchandises (GMV vendeur)", "Valor mercancía (GMV vendedor)", "Valore merce (GMV venditore)", "Warenwert (Verkäufer-GMV)"),
    commissionIncome: t("Commission (income)", "Komisyon (gelir)", "Commission (revenus)", "Comisión (ingresos)", "Commissione (ricavi)", "Provision (Einnahmen)"),
    toPayoutTotal: t("To pay out (net)", "Ödenecek (net)", "À verser (net)", "A pagar (neto)", "Da pagare (netto)", "Auszuzahlen (netto)"),
    toAllSellers: t("To all sellers", "Tüm satıcılara", "À tous les vendeurs", "A todos los vendedores", "A tutti i venditori", "An alle Seller"),
    sellerOverview: t("Seller overview", "Satıcı özeti", "Aperçu vendeurs", "Resumen vendedores", "Panoramica venditori", "Seller-Übersicht"),
    revenue: t("Goods value", "Mal tutarı", "Valeur marchandises", "Valor mercancía", "Valore merce", "Warenwert"),
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
    addAdjustment: t("Add adjustment", "Manuel düzeltme ekle", "Ajouter un ajustement", "Añadir ajuste", "Aggiungi rettifica", "Anpassung hinzufügen"),
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
    adjustmentSellerRequired: t(
      "Please select a seller",
      "Lütfen bir satıcı seçin",
      "Veuillez sélectionner un vendeur",
      "Seleccione un vendedor",
      "Seleziona un venditore",
      "Bitte einen Seller auswählen"
    ),
    adjustmentAmountRequired: t(
      "Please enter a non-zero amount",
      "Lütfen sıfırdan farklı bir tutar girin",
      "Veuillez saisir un montant différent de zéro",
      "Introduzca un importe distinto de cero",
      "Inserisci un importo diverso da zero",
      "Bitte einen Betrag ungleich null eingeben"
    ),
    removeAdjustmentConfirm: t(
      "Remove this manual adjustment?",
      "Bu manuel düzeltme kaldırılsın mı?",
      "Supprimer cet ajustement manuel ?",
      "¿Eliminar este ajuste manual?",
      "Rimuovere questa rettifica manuale?",
      "Diese manuelle Anpassung entfernen?"
    ),
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

const LEDGER_TYPES = [
  "order_received",
  "shipping_customer",
  "commission",
  "commission_vat",
  "shipping_label",
  "return_shipping",
  "refund",
  "commission_refund",
  "commission_vat_refund",
  "advertising",
  "manual_adjustment",
  "payout",
];

async function exportTransactionsExcel({ periodStart, periodEnd, sellerId, locale }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sellerToken") : null;
  if (!token) throw new Error(lt(locale, "Please login again.", "Lütfen tekrar giriş yapın.", "Veuillez vous reconnecter.", "Inicia sesión de nuevo.", "Accedi di nuovo.", "Bitte erneut einloggen."));
  const response = await fetch("/api/analytics/transactions-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sellerToken: token, period_start: periodStart, period_end: periodEnd, seller_id: sellerId || undefined }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `${lt(locale, "Export failed", "Dışa aktarma başarısız", "Échec de l'export", "Exportación fallida", "Esportazione non riuscita", "Export fehlgeschlagen")} (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `andertal-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatBox({ label, value, note, color }) {
  return (
    <div style={{
      flex: "1 1 140px", minWidth: 130,
      background: "#f9fafb", borderRadius: 10,
      padding: "13px 16px", border: "1px solid #f0f0f0",
    }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || "#111827" }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function TotalsBoxes({ totals, copy, locale, isSuperuser, commissionRate }) {
  const fmt = (cents) => fmtCents(cents, "EUR", locale);
  const t = totals || {};
  const merch = Number(t.merchandise_cents || 0);
  const commission = Number(t.commission_cents || 0);
  const commissionVat = Number(t.commission_vat_cents || 0);
  const shipCust = Number(t.shipping_customer_cents || 0);
  const labels = Number(t.shipping_label_cents || 0);
  const retShip = Number(t.return_shipping_cents || 0);
  const refunds = Number(t.refunds_cents || 0);
  const ads = Number(t.advertising_cents || 0);
  const net = Number(t.net_cents || 0);
  const paid = Number(t.payouts_cents || 0);
  const pct = Number.isFinite(Number(commissionRate)) ? (Number(commissionRate) * 100).toFixed(1) : "12.0";
  const commColor = isSuperuser ? "#059669" : "#dc2626";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <StatBox label={isSuperuser ? copy.platformRevenue : copy.totalRevenue} value={fmt(merch)} note={copy.ordersCount(t.order_count || 0)} />
      <StatBox
        label={isSuperuser ? copy.commissionIncome : copy.commission(pct)}
        value={isSuperuser ? fmt(commission) : `− ${fmt(commission)}`}
        color={commission ? commColor : undefined}
        note={copy.commissionNote}
      />
      {commissionVat > 0 && (
        <StatBox
          label={copy.commissionVat}
          value={isSuperuser ? fmt(commissionVat) : `− ${fmt(commissionVat)}`}
          color={commColor}
          note={copy.commissionVatNote}
        />
      )}
      <StatBox label={copy.shippingCustomer} value={fmt(shipCust)} color={shipCust > 0 ? "#059669" : undefined} />
      <StatBox
        label={copy.shippingPlatform}
        value={labels > 0 ? `− ${fmt(labels)}` : fmt(0)}
        color={labels > 0 ? "#dc2626" : undefined}
      />
      {retShip > 0 && (
        <StatBox label={copy.returnShipping} value={`− ${fmt(retShip)}`} color="#dc2626" />
      )}
      <StatBox
        label={copy.refunds}
        value={refunds > 0 ? `− ${fmt(refunds)}` : fmt(0)}
        color={refunds > 0 ? "#dc2626" : undefined}
      />
      {ads > 0 && (
        <StatBox label={copy.advertising} value={`− ${fmt(ads)}`} color="#dc2626" />
      )}
      <StatBox
        label={isSuperuser ? copy.toPayoutTotal : copy.eligibleNet}
        value={signedAmount(net, locale)}
        color={amountColor(net)}
        note={isSuperuser ? copy.toAllSellers : undefined}
      />
      <StatBox
        label={copy.paidOut}
        value={paid > 0 ? fmt(paid) : "—"}
        note={paid > 0 ? copy.viaStripe : copy.stillPending}
      />
    </div>
  );
}

function LedgerTable({
  entries, loading, isSuperuser, locale, copy, onRemoveAdjustment, removingId,
}) {
  const [filterSearch, setFilterSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const rows = useMemo(() => {
    let list = entries || [];
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
    ? "110px 1.4fr 110px 110px 130px"
    : "110px 1.6fr 120px 130px";

  const typeOptions = [
    { label: copy.typeAll, value: "all" },
    ...LEDGER_TYPES.map((type) => ({
      label: ledgerEntryLabel({ type, description_params: { rate_pct: 12 } }, locale),
      value: type,
    })),
  ];

  const sumCents = rows
    .filter((e) => e.affects_balance !== false)
    .reduce((s, e) => s + Number(e.amount_cents || 0), 0);

  return (
    <Card padding="0">
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingMd" as="h2">{copy.movements}</Text>
          {(filterSearch.trim() || filterType !== "all") && (
            <Button size="slim" variant="plain" onClick={() => { setFilterSearch(""); setFilterType("all"); }}>
              {lt(locale, "Reset filters", "Filtreleri sıfırla", "Réinitialiser", "Restablecer", "Reimposta", "Filter zurücksetzen")}
            </Button>
          )}
        </InlineStack>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6", background: "#fafafa", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
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
        <div style={{ width: 240 }}>
          <Select label={copy.typeAll} labelHidden options={typeOptions} value={filterType} onChange={setFilterType} />
        </div>
      </div>
      {loading ? (
        <Box padding="500"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box>
      ) : rows.length === 0 ? (
        <Box padding="500"><Text tone="subdued" alignment="center">{copy.noTransactions}</Text></Box>
      ) : (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 20px",
            borderBottom: "1px solid #e5e7eb", fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#fafafa",
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
                  display: "grid", gridTemplateColumns: cols, gap: 8, padding: "11px 20px",
                  borderBottom: "1px solid #f3f4f6", fontSize: 13, alignItems: "center",
                  background: i % 2 === 0 ? "#fff" : "#fafafa",
                }}
              >
                <div style={{ color: "#374151" }}>{fmtDate(e.occurred_at, locale)}</div>
                <div style={{ color: "#111827" }}>
                  {ledgerEntryLabel(e, locale)}
                  {e.charge_method === "card" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>{copy.chargedCard}</span>
                  )}
                </div>
                <div style={{ fontWeight: 600, color: "#111827" }}>{e.order_number || "—"}</div>
                {isSuperuser && <div style={{ fontSize: 12, color: "#6b7280" }}>{e.store_name || e.seller_id || "—"}</div>}
                <div style={{ textAlign: "right", fontWeight: 700, color: amountColor(cents), fontVariantNumeric: "tabular-nums" }}>
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
            display: "grid", gridTemplateColumns: cols, gap: 8, padding: "11px 20px",
            borderTop: "2px solid #e5e7eb", fontSize: 13, fontWeight: 700, background: "#f9fafb",
          }}>
            <div style={{ color: "#6b7280", fontSize: 11 }}>{copy.sum}</div>
            <div />
            <div />
            {isSuperuser && <div />}
            <div style={{ textAlign: "right", color: amountColor(sumCents), fontVariantNumeric: "tabular-nums" }}>
              {signedAmount(sumCents, locale)}
            </div>
          </div>
        </>
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
  const [exporting, setExporting] = useState(false);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];
  const periodStart = selectedPeriod.startDate || selectedPeriod.start;
  const periodEnd = selectedPeriod.endDate || selectedPeriod.end;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTransactionsExcel({ periodStart, periodEnd, sellerId, locale });
    } catch (e) {
      alert(e?.message || copy.loadError);
    } finally {
      setExporting(false);
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

  const net = Number(totals.net_cents || 0);
  const paid = Number(totals.payouts_cents || 0);
  const pending = net - paid;

  return (
    <Page title={copy.pageTitle} subtitle={copy.pageSubtitleSeller}>
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">{copy.settlementPeriod}</Text>
                <InlineStack gap="200">
                  <Button onClick={handleExport} loading={exporting} size="slim">{copy.exportExcel}</Button>
                  <Button onClick={loadData} loading={loading} size="slim">{copy.refresh}</Button>
                </InlineStack>
              </InlineStack>
              <div style={{ maxWidth: 340 }}>
                <Select
                  label={copy.selectPeriod}
                  options={PERIODS.map((p) => ({ label: p.label, value: p.key }))}
                  value={periodKey}
                  onChange={setPeriodKey}
                />
              </div>
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">{copy.overview} — {selectedPeriod.label}</Text>
                {loading ? <Text tone="subdued">{copy.loading}</Text> : (
                  <TotalsBoxes totals={totals} copy={copy} locale={locale} commissionRate={commissionRate} />
                )}
                {!loading && pending > 0 && (
                  <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                    <Text variant="bodySm">
                      <strong>{copy.pendingPayout}</strong> {fmtCents(pending, "EUR", locale)} — {copy.pendingPayoutBody}{" "}
                      <code style={{ background: "#fef9c3", padding: "1px 5px", borderRadius: 3, fontSize: 11 }}>
                        {sellerId}-{periodKey}
                      </code>
                    </Text>
                  </div>
                )}
              </BlockStack>
            </Card>
          </Box>

          <Box paddingBlockStart="400">
            <LedgerTable entries={entries} loading={loading} locale={locale} copy={copy} />
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
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
  const [exporting, setExporting] = useState(false);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];
  const periodStart = selectedPeriod.startDate || selectedPeriod.start;
  const periodEnd = selectedPeriod.endDate || selectedPeriod.end;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTransactionsExcel({ periodStart, periodEnd, sellerId: filterSeller, locale });
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setExporting(false);
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
    <Page title={copy.pageTitleAdmin} subtitle={copy.pageSubtitleAdmin}>
      <Layout>
        <Layout.Section>
          {err && <Banner tone="critical" onDismiss={() => setErr("")}><Text>{err}</Text></Banner>}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">{copy.settlementPeriod}</Text>
                <InlineStack gap="200">
                  <Button onClick={openAdjModal} size="slim">{copy.addAdjustment}</Button>
                  <Button onClick={handleExport} loading={exporting} size="slim">{copy.exportExcel}</Button>
                  <Button onClick={loadData} loading={loading} size="slim">{copy.refresh}</Button>
                </InlineStack>
              </InlineStack>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", maxWidth: 340 }}>
                  <Select
                    label={copy.periodLabel}
                    options={PERIODS.map((p) => ({ label: p.label, value: p.key }))}
                    value={periodKey}
                    onChange={setPeriodKey}
                  />
                </div>
                <div style={{ flex: "1 1 200px", maxWidth: 280 }}>
                  <Select label={copy.seller} options={sellerOptions} value={filterSeller} onChange={setFilterSeller} />
                </div>
              </div>
            </BlockStack>
          </Card>

          <Box paddingBlockStart="400">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">{copy.globalOverview} — {selectedPeriod.label}</Text>
                {loading ? <Text tone="subdued">{copy.loading}</Text> : (
                  <TotalsBoxes totals={totals} copy={copy} locale={locale} isSuperuser />
                )}
              </BlockStack>
            </Card>
          </Box>

          {!filterSeller && overviewSellers.length > 0 && (
            <Box paddingBlockStart="400">
              <Card padding="0">
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                  <Text variant="headingMd" as="h2">{copy.sellerOverview} — {selectedPeriod.label}</Text>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "7px 14px", borderBottom: "1px solid #f3f4f6", fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
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
                    <div key={s.seller_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "7px 14px", minHeight: 32, borderBottom: i < overviewSellers.length - 1 ? "1px solid #f9fafb" : "none", alignItems: "center" }}>
                      <div>
                        <Text variant="bodySm" fontWeight="semibold">{s.store_name}</Text>
                        <Text variant="bodyXs" tone="subdued">{copy.ordersShort(t.order_count || 0)}</Text>
                        <div style={{ fontSize: 10.5, color: "#9ca3af", fontFamily: "monospace" }}>{s.seller_id}-{periodKey}</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12 }}>{fmtCents(t.merchandise_cents, "EUR", locale)}</div>
                      <div style={{ textAlign: "right", fontSize: 12, color: "#059669", fontWeight: 600 }}>+{fmtCents(t.commission_cents, "EUR", locale)}</div>
                      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: paid ? "#6b7280" : amountColor(net) }}>{signedAmount(net, locale)}</div>
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

          <Box paddingBlockStart="400">
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
    </Page>
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
