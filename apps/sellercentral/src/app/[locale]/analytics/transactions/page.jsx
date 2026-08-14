"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Banner, Box, Select, Modal, TextField,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { confirmDelete } from "@/lib/confirm-delete";
import { lt, dateLocaleFor } from "@/lib/locale-text";
import { payoutStatusLabel } from "@/lib/payments-i18n";

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
      "Your revenue, commissions and payouts",
      "Cirolarınız, komisyonlar ve ödemeler",
      "Vos revenus, commissions et versements",
      "Sus ingresos, comisiones y pagos",
      "I vostri ricavi, commissioni e pagamenti",
      "Ihre Umsätze, Provisionen und Auszahlungen"
    ),
    pageSubtitleAdmin: t(
      "Seller revenue, commissions and payout management",
      "Satıcı cirosu, komisyonlar ve ödeme yönetimi",
      "Revenus vendeurs, commissions et gestion des versements",
      "Ingresos de vendedores, comisiones y gestión de pagos",
      "Ricavi venditori, commissioni e gestione pagamenti",
      "Seller-Umsätze, Provisionen und Auszahlungsverwaltung"
    ),
    pageTitleAdmin: t("Transactions (Admin)", "İşlemler (Admin)", "Transactions (Admin)", "Transacciones (Admin)", "Transazioni (Admin)", "Transaktionen (Admin)"),
    settlementPeriod: t("Settlement period", "Abrechnungszeitraum", "Période de règlement", "Periodo de liquidación", "Periodo di regolamento", "Abrechnungszeitraum"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    exportExcel: t("Export Excel", "Excel'e aktar", "Exporter Excel", "Exportar Excel", "Esporta Excel", "Excel exportieren"),
    selectPeriod: t("Select period", "Dönem seç", "Sélectionner la période", "Seleccionar periodo", "Seleziona periodo", "Zeitraum auswählen"),
    overview: t("Overview", "Özet", "Aperçu", "Resumen", "Panoramica", "Übersicht"),
    totalRevenue: t("Total revenue", "Toplam ciro", "Chiffre d'affaires total", "Ingresos totales", "Ricavi totali", "Gesamtumsatz"),
    ordersCount: (n) => t(`${n} orders`, `${n} sipariş`, `${n} commandes`, `${n} pedidos`, `${n} ordini`, `${n} Bestellungen`),
    commission: (pct) => t(`Commission (${pct}%)`, `Komisyon (${pct}%)`, `Commission (${pct}%)`, `Comisión (${pct}%)`, `Commissione (${pct}%)`, `Provision (${pct}%)`),
    commissionNote: t("Eligible only", "Yalnızca uygun olanlar", "Éligibles uniquement", "Solo elegibles", "Solo idonei", "Nur freigegebene"),
    refunds: t("Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Rückerstattungen"),
    bonusFunding: t("Andertal bonus", "Andertal bonusu", "Bonus Andertal", "Bono Andertal", "Bonus Andertal", "Andertal-Bonus"),
    customerPaid: t("Customer paid", "Müşteri ödedi", "Payé par le client", "Pagado por el cliente", "Pagato dal cliente", "Kunde gezahlt"),
    commissionVat: t("Commission VAT", "Komisyon KDV", "TVA commission", "IVA comisión", "IVA commissione", "Provision USt"),
    shippingShare: t("Shipping (share)", "Kargo (pay)", "Expédition (part)", "Envío (cuota)", "Spedizione (quota)", "Versand (Beteiligung)"),
    eligibleNet: t("Eligible (net)", "Uygun (net)", "Éligible (net)", "Elegible (neto)", "Idoneo (netto)", "Freigegeben (netto)"),
    eligibleNote: (n) => t(
      `${n} orders (14 days after delivery)`,
      `${n} sipariş (teslimattan 14 gün sonra)`,
      `${n} commandes (14 jours après livraison)`,
      `${n} pedidos (14 días tras entrega)`,
      `${n} ordini (14 giorni dopo consegna)`,
      `${n} Bestellungen (14 Tage nach Lieferung)`
    ),
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
    tabEligible: t("Eligible", "Uygun", "Éligible", "Elegible", "Idoneo", "Freigegeben"),
    tabPending: t("Pending", "Beklemede", "En attente", "Pendiente", "In sospeso", "Ausstehend"),
    tabPayouts: t("Payouts", "Ödemeler", "Versements", "Pagos", "Pagamenti", "Auszahlungen"),
    tabPayoutHistory: t("Payout history", "Ödeme geçmişi", "Historique versements", "Historial pagos", "Storico pagamenti", "Auszahlungshistorie"),
    eligibleBannerSeller: t(
      "These orders were delivered more than 14 days ago — they qualify for payout.",
      "Bu siparişler teslim edildi ve 14 günden eski — ödemeye uygundur.",
      "Ces commandes ont été livrées il y a plus de 14 jours — éligibles au versement.",
      "Estos pedidos se entregaron hace más de 14 días — aptos para pago.",
      "Questi ordini sono stati consegnati da più di 14 giorni — idonei al pagamento.",
      "Diese Bestellungen wurden geliefert und sind älter als 14 Tage — sie kommen für die Auszahlung infrage."
    ),
    pendingBannerSeller: t(
      "These orders are not yet eligible for payout (delivered less than 14 days ago or not yet delivered).",
      "Bu siparişler henüz ödemeye uygun değil (teslimattan 14 günden az veya henüz teslim edilmedi).",
      "Ces commandes ne sont pas encore éligibles (livraison < 14 jours ou pas encore livrées).",
      "Estos pedidos aún no son elegibles (entrega < 14 días o aún no entregados).",
      "Questi ordini non sono ancora idonei (consegna < 14 giorni o non ancora consegnati).",
      "Diese Bestellungen sind noch nicht für eine Auszahlung freigegeben (Lieferung vor weniger als 14 Tagen oder noch nicht geliefert)."
    ),
    periodLabel: t("Period", "Dönem", "Période", "Periodo", "Periodo", "Zeitraum"),
    allSellers: t("All sellers", "Tüm satıcılar", "Tous les vendeurs", "Todos los vendedores", "Tutti i venditori", "Alle Seller"),
    seller: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Seller"),
    globalOverview: t("Global overview", "Genel özet", "Aperçu global", "Resumen global", "Panoramica globale", "Gesamtübersicht"),
    platformRevenue: t("Platform revenue", "Platform cirosu", "Chiffre d'affaires plateforme", "Ingresos plataforma", "Ricavi piattaforma", "Plattform-Umsatz"),
    totalOrders: (n) => t(`${n} orders total`, `${n} sipariş toplam`, `${n} commandes au total`, `${n} pedidos en total`, `${n} ordini totali`, `${n} Bestellungen gesamt`),
    commissionIncome: t("Commission (income)", "Komisyon (gelir)", "Commission (revenus)", "Comisión (ingresos)", "Commissione (ricavi)", "Provision (Einnahmen)"),
    qualified: (n) => t(`${n} qualified`, `${n} uygun`, `${n} qualifiés`, `${n} calificados`, `${n} qualificati`, `${n} qualifiziert`),
    toPayoutTotal: t("To pay out (total)", "Ödenecek (toplam)", "À verser (total)", "A pagar (total)", "Da pagare (totale)", "Auszuzahlen (gesamt)"),
    toAllSellers: t("To all sellers", "Tüm satıcılara", "À tous les vendeurs", "A todos los vendedores", "A tutti i venditori", "An alle Seller"),
    stillPendingAmount: t("Still pending", "Hâlâ bekliyor", "Toujours en attente", "Aún pendiente", "Ancora in sospeso", "Noch ausstehend"),
    sellerOverview: t("Seller overview", "Satıcı özeti", "Aperçu vendeurs", "Resumen vendedores", "Panoramica venditori", "Seller-Übersicht"),
    revenue: t("Revenue", "Ciro", "Chiffre d'affaires", "Ingresos", "Ricavi", "Umsatz"),
    colCustomerPaid: t("Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde"),
    payout: t("Payout", "Ödeme", "Versement", "Pago", "Pagamento", "Auszahlung"),
    status: t("Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    ordersShort: (total, eligible) => t(
      `${total} ord. · ${eligible} eligible`,
      `${total} sip. · ${eligible} uygun`,
      `${total} cmd. · ${eligible} éligibles`,
      `${total} ped. · ${eligible} elegibles`,
      `${total} ord. · ${eligible} idonei`,
      `${total} Best. · ${eligible} freigegeben`
    ),
    paid: t("Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
    open: t("Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen"),
    paidViaStripe: t("Paid via Stripe", "Stripe ile ödendi", "Payé via Stripe", "Pagado vía Stripe", "Pagato via Stripe", "Bezahlt via Stripe"),
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
    eligibleBannerAdmin: t(
      "Orders delivered more than 14 days ago — ready for payout.",
      "14 günden eski teslim edilmiş siparişler — ödemeye hazır.",
      "Commandes livrées il y a plus de 14 jours — prêtes pour versement.",
      "Pedidos entregados hace más de 14 días — listos para pago.",
      "Ordini consegnati da più di 14 giorni — pronti per pagamento.",
      "Bestellungen, die geliefert und älter als 14 Tage sind — auszahlungsbereit."
    ),
    pendingBannerAdmin: t(
      "Not yet eligible for payout (delivery < 14 days or not yet delivered).",
      "Henüz ödemeye uygun değil (teslim < 14 gün veya henüz teslim edilmedi).",
      "Pas encore éligible (livraison < 14 jours ou pas encore livrée).",
      "Aún no elegible (entrega < 14 días o aún no entregado).",
      "Non ancora idoneo (consegna < 14 giorni o non ancora consegnato).",
      "Noch nicht auszahlungsbereit (Lieferung < 14 Tage oder noch nicht geliefert)."
    ),
    noTransactions: t("No transactions in this period.", "Bu dönemde işlem yok.", "Aucune transaction sur cette période.", "No hay transacciones en este periodo.", "Nessuna transazione in questo periodo.", "Keine Transaktionen in diesem Zeitraum."),
    colOrder: t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung"),
    colShipping: t("Shipping", "Kargo", "Expédition", "Envío", "Spedizione", "Versand"),
    colBonus: t("Bonus", "Bonus", "Bonus", "Bono", "Bonus", "Bonus"),
    colCommissionVat: t("Comm. VAT", "Kom. KDV", "TVA comm.", "IVA com.", "IVA comm.", "Prov. USt"),
    colCommission: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    colNet: t("Net", "Net", "Net", "Neto", "Netto", "Netto"),
    colDelivery: t("Delivery", "Teslimat", "Livraison", "Entrega", "Consegna", "Lieferung"),
    periodReference: t("Period / reference", "Dönem / referans", "Période / référence", "Periodo / referencia", "Periodo / riferimento", "Zeitraum / Referenz"),
    paidOn: t("Paid on", "Ödeme tarihi", "Payé le", "Pagado el", "Pagato il", "Bezahlt am"),
    noPayoutsYet: t("No payouts yet.", "Henüz ödeme yok.", "Aucun versement pour l'instant.", "Aún no hay pagos.", "Ancora nessun pagamento.", "Noch keine Auszahlungen vorhanden."),
    markTransferredConfirm: t(
      "Mark this entry as externally transferred? (This does not send an actual payment)",
      "Bu kaydı harici olarak aktarıldı olarak işaretle? (Gerçek ödeme göndermez)",
      "Marquer cette entrée comme virée externement ? (N'envoie pas de paiement réel)",
      "¿Marcar esta entrada como transferida externamente? (No envía un pago real)",
      "Segnare questa voce come trasferita esternamente? (Non invia un pagamento reale)",
      "Diesen Eintrag als extern überwiesen markieren? (Bu işlem gerçek ödeme göndermez)"
    ),
    markTransferred: t("Mark as transferred", "Aktarıldı olarak işaretle", "Marquer comme viré", "Marcar como transferido", "Segna come trasferito", "Als überwiesen markieren"),
  };
}

function fmtCents(cents, currency = "EUR", locale = "de") {
  return ((cents || 0) / 100).toLocaleString(dateLocaleFor(locale), { style: "currency", currency });
}

function fmtDate(d, locale = "de") {
  return d ? new Date(d).toLocaleDateString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
}

function generatePeriods(count = 14) {
  const periods = [];
  let year = new Date().getFullYear();
  let month = new Date().getMonth();
  for (let i = 0; i < count; i++) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    periods.push({
      label: `16.${String(month + 1).padStart(2, "0")}.${year} – ${daysInMonth}.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 16).toISOString(),
      end: new Date(year, month, daysInMonth, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-H2`,
    });
    periods.push({
      label: `01.${String(month + 1).padStart(2, "0")}.${year} – 15.${String(month + 1).padStart(2, "0")}.${year}`,
      start: new Date(year, month, 1).toISOString(),
      end: new Date(year, month, 15, 23, 59, 59).toISOString(),
      key: `${year}-${String(month + 1).padStart(2, "0")}-H1`,
    });
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return periods;
}

const PERIODS = generatePeriods(14);

/** BonusPunkte.md §3.9: "işlem listesi" export — not a copy of the Billing Finanzamt PDF. */
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

function SellerTransactionsView({ sellerId }) {
  const locale = useLocale();
  const copy = getTransactionsCopy(locale);
  const fmt = (cents, currency) => fmtCents(cents, currency, locale);

  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [tab, setTab] = useState("eligible");
  const [allTx, setAllTx] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);

  const selectedPeriod = PERIODS.find((p) => p.key === periodKey) || PERIODS[0];

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTransactionsExcel({ periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, sellerId, locale });
    } catch (e) {
      alert(e?.message || copy.loadError);
    } finally {
      setExporting(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const [txRes, poRes] = await Promise.allSettled([
        client.getTransactions({ include_pending: "true" }),
        client.getPayouts(),
      ]);
      if (txRes.status === "fulfilled") setAllTx(txRes.value?.transactions || []);
      if (poRes.status === "fulfilled") setPayouts(poRes.value?.payouts || []);
    } catch (e) {
      setErr(e?.message || copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => { loadData(); }, [loadData]);

  const inPeriod = (tx) => {
    const d = new Date(tx.created_at);
    return d >= new Date(selectedPeriod.start) && d <= new Date(selectedPeriod.end);
  };

  const periodTx = allTx.filter(inPeriod);
  const eligible = periodTx.filter((tx) => tx.payout_eligible);
  const pending = periodTx.filter((tx) => !tx.payout_eligible);

  const totalRevenue = periodTx.reduce((s, t) => s + (t.total_cents || 0), 0);
  const totalCommission = eligible.reduce((s, t) => s + (t.commission_cents || 0), 0);
  const totalRefunds = periodTx.reduce((s, t) => s + (t.refund_cents || 0), 0);
  const totalShipping = periodTx.reduce((s, t) => s + (t.shipping_cents || 0), 0);
  const netPayout = eligible.reduce((s, t) => s + (t.payout_cents || 0), 0);
  // BonusPunkte.md §3.9: COMMISSION_RATE was a hardcoded 12% label even though sellers can have a
  // different rate — show the period's real blended rate (Σcommission/Σrevenue), and surface the
  // bonus funding / customer-paid split that was previously invisible on this page.
  const blendedCommissionPct = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 12;
  const totalBonusFunding = periodTx.reduce((s, t) => s + (t.platform_bonus_funding_cents || t.settlement_breakdown?.platform_bonus_funding_cents || 0), 0);
  const totalCustomerPaid = periodTx.reduce((s, t) => s + (t.customer_paid_cents || 0), 0);
  const totalCommissionVat = eligible.reduce((s, t) => s + (t.commission_vat_cents || 0), 0);

  const periodPayouts = payouts.filter((p) => {
    const s = new Date(p.period_start), e = new Date(p.period_end);
    const ps = new Date(selectedPeriod.start), pe = new Date(selectedPeriod.end);
    return s >= ps && e <= pe || (s <= pe && e >= ps);
  });
  const paidAmount = periodPayouts.filter((p) => p.status === "bezahlt" || p.status === "paid")
    .reduce((s, p) => s + (p.payout_cents || 0), 0);

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  const tabBtn = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: "8px 18px", fontSize: 13, fontWeight: 600,
        border: "1px solid #e5e7eb",
        background: tab === key ? "#111827" : "#fff",
        color: tab === key ? "#fff" : "#374151",
        cursor: "pointer",
        borderRadius: key === "eligible" ? "8px 0 0 8px" : key === "payouts" ? "0 8px 8px 0" : "0",
        marginRight: -1,
      }}
    >{label}{count != null ? ` (${count})` : ""}</button>
  );

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
                  options={periodOptions}
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
                {loading ? (
                  <Text tone="subdued">{copy.loading}</Text>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <StatBox label={copy.totalRevenue} value={fmt(totalRevenue)} note={copy.ordersCount(periodTx.length)} />
                    <StatBox label={copy.customerPaid} value={fmt(totalCustomerPaid)} />
                    <StatBox label={copy.bonusFunding} value={fmt(totalBonusFunding)} color="#2563eb" />
                    <StatBox label={copy.commission(blendedCommissionPct.toFixed(1))} value={`– ${fmt(totalCommission)}`} color="#dc2626" note={copy.commissionNote} />
                    {totalCommissionVat > 0 && <StatBox label={copy.commissionVat} value={`– ${fmt(totalCommissionVat)}`} color="#dc2626" />}
                    <StatBox label={copy.refunds} value={totalRefunds > 0 ? `– ${fmt(totalRefunds)}` : fmt(0)} color={totalRefunds > 0 ? "#dc2626" : undefined} />
                    <StatBox label={copy.shippingShare} value={fmt(totalShipping)} />
                    <StatBox label={copy.eligibleNet} value={fmt(netPayout)} color="#059669"
                      note={copy.eligibleNote(eligible.length)} />
                    <StatBox
                      label={copy.paidOut}
                      value={paidAmount > 0 ? fmt(paidAmount) : "—"}
                      color="#059669"
                      note={paidAmount > 0 ? copy.viaStripe : copy.stillPending}
                    />
                  </div>
                )}

                {!loading && netPayout > paidAmount && (
                  <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                    <Text variant="bodySm">
                      <strong>{copy.pendingPayout}</strong> {fmt(netPayout - paidAmount)} — {copy.pendingPayoutBody}{" "}
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
            <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
              {tabBtn("eligible", copy.tabEligible, eligible.length)}
              {tabBtn("pending", copy.tabPending, pending.length)}
              {tabBtn("payouts", copy.tabPayouts, payouts.length)}
            </div>

            {tab === "eligible" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#f0fdf4" }}>
                  <Text variant="bodySm" tone="success">{copy.eligibleBannerSeller}</Text>
                </div>
                <TxTable rows={eligible} loading={loading} isSuperuser={false} locale={locale} copy={copy} />
              </Card>
            )}

            {tab === "pending" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#fefce8" }}>
                  <Text variant="bodySm" tone="caution">{copy.pendingBannerSeller}</Text>
                </div>
                <TxTable rows={pending} loading={loading} isSuperuser={false} locale={locale} copy={copy} />
              </Card>
            )}

            {tab === "payouts" && (
              <Card padding="0">
                <PayoutsTable payouts={payouts} loading={loading} isSuperuser={false} locale={locale} copy={copy} />
              </Card>
            )}
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function AdminTransactionsView() {
  const locale = useLocale();
  const copy = getTransactionsCopy(locale);
  const fmt = (cents, currency) => fmtCents(cents, currency, locale);

  const [periodKey, setPeriodKey] = useState(PERIODS[0].key);
  const [tab, setTab] = useState("eligible");
  const [filterSeller, setFilterSeller] = useState("");
  const [allTx, setAllTx] = useState([]);
  const [summary, setSummary] = useState([]);
  const [payouts, setPayouts] = useState([]);
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

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTransactionsExcel({ periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, sellerId: filterSeller, locale });
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setExporting(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const [txRes, poRes] = await Promise.allSettled([
        client.getTransactions({ include_pending: "true" }),
        client.getPayouts(),
      ]);
      if (txRes.status === "fulfilled") {
        setAllTx(txRes.value?.transactions || []);
        setSummary(txRes.value?.summary || []);
      }
      if (poRes.status === "fulfilled") setPayouts(poRes.value?.payouts || []);
    } catch (e) {
      setErr(e?.message || copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error]);

  useEffect(() => { loadData(); }, [loadData]);

  const inPeriod = (tx) => {
    const d = new Date(tx.created_at);
    return d >= new Date(selectedPeriod.start) && d <= new Date(selectedPeriod.end);
  };

  const periodTx = allTx.filter(inPeriod).filter((tx) => !filterSeller || tx.seller_id === filterSeller);
  const eligible = periodTx.filter((tx) => tx.payout_eligible);
  const pending = periodTx.filter((tx) => !tx.payout_eligible);

  const totalRevenue = periodTx.reduce((s, t) => s + (t.total_cents || 0), 0);
  const totalCommission = eligible.reduce((s, t) => s + (t.commission_cents || 0), 0);
  const totalPayout = eligible.reduce((s, t) => s + (t.payout_cents || 0), 0);
  const totalBonusFunding = periodTx.reduce((s, t) => s + (t.platform_bonus_funding_cents || t.settlement_breakdown?.platform_bonus_funding_cents || 0), 0);
  const totalCustomerPaid = periodTx.reduce((s, t) => s + (t.customer_paid_cents || 0), 0);
  const totalCommissionVat = eligible.reduce((s, t) => s + (t.commission_vat_cents || 0), 0);

  const perSeller = {};
  periodTx.forEach((tx) => {
    if (!perSeller[tx.seller_id]) {
      perSeller[tx.seller_id] = { seller_id: tx.seller_id, store_name: tx.store_name || tx.seller_id, total: 0, commission: 0, payout: 0, orders: 0, eligibleOrders: 0 };
    }
    perSeller[tx.seller_id].total += tx.total_cents || 0;
    perSeller[tx.seller_id].orders += 1;
    if (tx.payout_eligible) {
      perSeller[tx.seller_id].commission += tx.commission_cents || 0;
      perSeller[tx.seller_id].payout += tx.payout_cents || 0;
      perSeller[tx.seller_id].eligibleOrders += 1;
    }
  });

  const sellerList = Object.values(perSeller);

  const sellerOptions = [
    { label: copy.allSellers, value: "" },
    ...summary.map((s) => ({ label: s.store_name || s.seller_id, value: s.seller_id })),
  ];

  const periodOptions = PERIODS.map((p) => ({ label: p.label, value: p.key }));

  const handleMarkPaid = async (s) => {
    if (!(await confirmDelete(copy.markPaidConfirm(s.store_name, fmt(s.payout))))) return;
    setMarkingPaid(s.seller_id);
    try {
      await getMedusaAdminClient().createPayout({
        seller_id: s.seller_id,
        period_start: selectedPeriod.start,
        period_end: selectedPeriod.end,
        total_cents: s.total,
        commission_cents: s.commission,
        payout_cents: s.payout,
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

  const removeAdjustment = async (tx) => {
    if (!(await confirmDelete(copy.removeAdjustmentConfirm))) return;
    setRemovingId(tx.id);
    try {
      const rawId = String(tx.id || "").replace(/^ledger-/, "");
      await getMedusaAdminClient().deleteManualAdjustment(rawId);
      await loadData();
    } catch (e) {
      alert(e?.message || copy.error);
    } finally {
      setRemovingId(null);
    }
  };

  const isPaidForPeriod = (sellerId) =>
    payouts.some((p) => {
      const matches = p.seller_id === sellerId && (p.status === "bezahlt" || p.status === "paid");
      const ps = new Date(p.period_start), pe = new Date(p.period_end);
      const overlapStart = new Date(selectedPeriod.start), overlapEnd = new Date(selectedPeriod.end);
      return matches && ps <= overlapEnd && pe >= overlapStart;
    });

  const tabBtn = (key, label, count) => (
    <button
      onClick={() => setTab(key)}
      style={{
        padding: "8px 18px", fontSize: 13, fontWeight: 600,
        border: "1px solid #e5e7eb",
        background: tab === key ? "#111827" : "#fff",
        color: tab === key ? "#fff" : "#374151",
        cursor: "pointer",
        borderRadius: key === "eligible" ? "8px 0 0 8px" : key === "payouts" ? "0 8px 8px 0" : "0",
        marginRight: -1,
      }}
    >{label}{count != null ? ` (${count})` : ""}</button>
  );

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
                  <Select label={copy.periodLabel} options={periodOptions} value={periodKey} onChange={setPeriodKey} />
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
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <StatBox label={copy.platformRevenue} value={fmt(totalRevenue)} note={copy.totalOrders(periodTx.length)} />
                    <StatBox label={copy.customerPaid} value={fmt(totalCustomerPaid)} />
                    <StatBox label={copy.bonusFunding} value={fmt(totalBonusFunding)} color="#2563eb" />
                    <StatBox label={copy.commissionIncome} value={fmt(totalCommission)} color="#059669" note={copy.qualified(eligible.length)} />
                    {totalCommissionVat > 0 && <StatBox label={copy.commissionVat} value={fmt(totalCommissionVat)} color="#059669" />}
                    <StatBox label={copy.toPayoutTotal} value={fmt(totalPayout)} color="#dc2626" note={copy.toAllSellers} />
                    <StatBox label={copy.stillPendingAmount} value={fmt(pending.reduce((s, t) => s + (t.total_cents || 0), 0))} note={copy.ordersCount(pending.length)} />
                  </div>
                )}
              </BlockStack>
            </Card>
          </Box>

          {!filterSeller && sellerList.length > 0 && (
            <Box paddingBlockStart="400">
              <Card padding="0">
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f3f4f6" }}>
                  <Text variant="headingMd" as="h2">{copy.sellerOverview} — {selectedPeriod.label}</Text>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                  <div>{copy.seller}</div>
                  <div style={{ textAlign: "right" }}>{copy.revenue}</div>
                  <div style={{ textAlign: "right" }}>{copy.colCommission}</div>
                  <div style={{ textAlign: "right" }}>{copy.payout}</div>
                  <div style={{ textAlign: "center" }}>{copy.status}</div>
                  <div></div>
                </div>
                {sellerList.map((s, i) => {
                  const paid = isPaidForPeriod(s.seller_id);
                  return (
                    <div key={s.seller_id} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 100px 110px 80px auto", gap: 8, padding: "11px 16px", borderBottom: i < sellerList.length - 1 ? "1px solid #f9fafb" : "none", alignItems: "center" }}>
                      <div>
                        <Text variant="bodyMd" fontWeight="semibold">{s.store_name}</Text>
                        <Text variant="bodySm" tone="subdued">{copy.ordersShort(s.orders, s.eligibleOrders)}</Text>
                        <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.seller_id}-{periodKey}</div>
                      </div>
                      <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(s.total)}</div>
                      <div style={{ textAlign: "right", fontSize: 13, color: "#059669", fontWeight: 600 }}>+{fmt(s.commission)}</div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: paid ? "#6b7280" : "#dc2626" }}>{fmt(s.payout)}</div>
                      <div style={{ textAlign: "center" }}>
                        <Badge tone={paid ? "success" : s.payout > 0 ? "warning" : "new"}>
                          {paid ? copy.paid : s.payout > 0 ? copy.open : "—"}
                        </Badge>
                      </div>
                      <div>
                        {!paid && s.payout > 0 && (
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
            <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
              {tabBtn("eligible", copy.tabEligible, eligible.length)}
              {tabBtn("pending", copy.tabPending, pending.length)}
              {tabBtn("payouts", copy.tabPayoutHistory, payouts.length)}
            </div>

            {tab === "eligible" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#f0fdf4" }}>
                  <Text variant="bodySm" tone="success">{copy.eligibleBannerAdmin}</Text>
                </div>
                <TxTable rows={eligible} loading={loading} isSuperuser locale={locale} copy={copy} onRemoveAdjustment={removeAdjustment} removingId={removingId} />
              </Card>
            )}
            {tab === "pending" && (
              <Card padding="0">
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", background: "#fefce8" }}>
                  <Text variant="bodySm" tone="caution">{copy.pendingBannerAdmin}</Text>
                </div>
                <TxTable rows={pending} loading={loading} isSuperuser locale={locale} copy={copy} onRemoveAdjustment={removeAdjustment} removingId={removingId} />
              </Card>
            )}
            {tab === "payouts" && (
              <Card padding="0">
                <PayoutsTable payouts={payouts} loading={loading} isSuperuser onRefresh={loadData} locale={locale} copy={copy} />
              </Card>
            )}
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
              options={summary.map((s) => ({ label: s.store_name || s.seller_id, value: s.seller_id }))}
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

/** Renders a seller_ledger_adjustments row's stored description_key/description_params localized. */
function ledgerAdjustmentLabel(tx, locale) {
  const params = tx.description_params || {};
  if (tx.description_key === "shipping_label_for_order") {
    return lt(
      locale,
      `Shipping label for order #${params.order_number || tx.order_number || ""}`,
      `Sipariş #${params.order_number || tx.order_number || ""} için kargo etiketi`,
      `Étiquette d'expédition pour la commande #${params.order_number || tx.order_number || ""}`,
      `Etiqueta de envío para el pedido #${params.order_number || tx.order_number || ""}`,
      `Etichetta di spedizione per l'ordine #${params.order_number || tx.order_number || ""}`,
      `Versandetikett für Bestellung #${params.order_number || tx.order_number || ""}`,
    );
  }
  if (tx.description_key === "manual_note") {
    return params.note
      ? params.note
      : lt(locale, "Manual adjustment", "Manuel düzeltme", "Ajustement manuel", "Ajuste manual", "Rettifica manuale", "Manuelle Anpassung");
  }
  return tx.description_key || tx.adjustment_type || "";
}

function TxTable({ rows, loading, isSuperuser, locale, copy, onRemoveAdjustment, removingId }) {
  const fmt = (cents, currency) => fmtCents(cents, currency, locale);
  const fmtD = (d) => fmtDate(d, locale);

  if (loading) return <Box padding="500"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box>;
  if (!rows.length) return (
    <Box padding="500">
      <Text tone="subdued" alignment="center">{copy.noTransactions}</Text>
    </Box>
  );

  const cols = isSuperuser
    ? "1.2fr 100px 90px 90px 90px 75px 75px 90px 90px 90px"
    : "1.5fr 90px 90px 90px 75px 75px 90px 90px";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
        <div>{copy.colOrder}</div>
        {isSuperuser && <div>{copy.seller}</div>}
        <div style={{ textAlign: "right" }}>{copy.revenue}</div>
        <div style={{ textAlign: "right" }}>{copy.colCustomerPaid}</div>
        <div style={{ textAlign: "right" }}>{copy.colShipping}</div>
        <div style={{ textAlign: "right" }}>{copy.colBonus}</div>
        <div style={{ textAlign: "right" }}>{copy.colCommissionVat}</div>
        <div style={{ textAlign: "right" }}>{copy.colCommission}</div>
        <div style={{ textAlign: "right" }}>{copy.colNet}</div>
        <div style={{ textAlign: "right" }}>{copy.colDelivery}</div>
      </div>
      {rows.map((tx) => tx.type === "ledger_adjustment" ? (
        <div key={tx.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center", background: "#fafafa" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{ledgerAdjustmentLabel(tx, locale)}</div>
            {tx.adjustment_type !== "manual_adjustment" && (
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {tx.charge_method === "card"
                  ? lt(locale, "Charged to card", "Karttan çekildi", "Débité de la carte", "Cargado a tarjeta", "Addebitato su carta", "Von Karte abgebucht")
                  : lt(locale, "Deducted from balance", "Bakiyeden düşüldü", "Déduit du solde", "Deducido del saldo", "Detratto dal saldo", "Vom Guthaben abgezogen")}
              </div>
            )}
          </div>
          {isSuperuser && <div style={{ fontSize: 12, color: "#6b7280" }}>{tx.store_name || "—"}</div>}
          <div style={{ textAlign: "right" }}>—</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>—</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>—</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>—</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>—</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>—</div>
          <div style={{ textAlign: "right", color: tx.payout_cents < 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>{fmt(tx.payout_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            {fmtD(tx.created_at)}
            {isSuperuser && tx.adjustment_type === "manual_adjustment" && (
              <Button
                size="micro"
                tone="critical"
                variant="plain"
                loading={removingId === tx.id}
                onClick={() => onRemoveAdjustment?.(tx)}
              >
                {lt(locale, "Remove", "Kaldır", "Supprimer", "Eliminar", "Rimuovi", "Entfernen")}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div key={tx.id} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 16px", borderBottom: "1px solid #f9fafb", fontSize: 13, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#111827" }}>#{tx.order_number}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              {tx.first_name} {tx.last_name}
              {tx.destination_country && <span style={{ marginLeft: 6, color: "#6b7280" }}>· {tx.destination_country}</span>}
            </div>
          </div>
          {isSuperuser && <div style={{ fontSize: 12, color: "#6b7280" }}>{tx.store_name || "—"}</div>}
          <div style={{ textAlign: "right" }}>{fmt(tx.total_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>{fmt(tx.customer_paid_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>{fmt(tx.shipping_cents || 0, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#2563eb" }}>{tx.bonus_redeemed_cents > 0 ? fmt(tx.bonus_redeemed_cents, tx.currency) : "—"}</div>
          <div style={{ textAlign: "right", color: "#6b7280", fontSize: 12 }}>{tx.commission_vat_cents > 0 ? fmt(tx.commission_vat_cents, tx.currency) : "—"}</div>
          <div style={{ textAlign: "right", color: "#ef4444" }}>−{fmt(tx.commission_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#10b981", fontWeight: 600 }}>{fmt(tx.payout_cents, tx.currency)}</div>
          <div style={{ textAlign: "right", color: "#6b7280", fontSize: 12 }}>{fmtD(tx.delivery_date)}</div>
        </div>
      ))}
    </div>
  );
}

function PayoutsTable({ payouts, loading, isSuperuser, onRefresh, locale, copy }) {
  const fmt = (cents, currency) => fmtCents(cents, currency, locale);
  const fmtD = (d) => fmtDate(d, locale);
  const [markingPaid, setMarkingPaid] = useState(null);

  const doMarkPaid = async (p) => {
    if (!(await confirmDelete(copy.markTransferredConfirm))) return;
    setMarkingPaid(p.id);
    try {
      await getMedusaAdminClient().updatePayout(p.id, { status: "bezahlt" });
      onRefresh?.();
    } catch (e) { alert(e?.message || copy.error); }
    finally { setMarkingPaid(null); }
  };

  const tone = (s) => {
    if (s === "bezahlt" || s === "paid") return "success";
    if (s === "offen" || s === "pending") return "warning";
    return "info";
  };

  if (loading) return <Box padding="500"><Text tone="subdued" alignment="center">{copy.loading}</Text></Box>;
  if (!payouts.length) return (
    <Box padding="500">
      <Text tone="subdued" alignment="center">{copy.noPayoutsYet}</Text>
    </Box>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isSuperuser ? "1.4fr 100px 110px 110px 80px 90px auto" : "1.4fr 110px 110px 80px", gap: 8, padding: "9px 16px", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
        <div>{copy.periodReference}</div>
        {isSuperuser && <div>{copy.seller}</div>}
        <div style={{ textAlign: "right" }}>{copy.revenue}</div>
        <div style={{ textAlign: "right" }}>{copy.payout}</div>
        <div style={{ textAlign: "center" }}>{copy.status}</div>
        {isSuperuser && <div style={{ textAlign: "right" }}>{copy.paidOn}</div>}
        {isSuperuser && <div></div>}
      </div>
      {payouts.map((p, i) => (
        <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: isSuperuser ? "1.4fr 100px 110px 110px 80px 90px auto" : "1.4fr 110px 110px 80px", gap: 8, padding: "11px 16px", borderBottom: "1px solid #f9fafb", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#374151" }}>{fmtD(p.period_start)} – {fmtD(p.period_end)}</div>
            {p.notes && <code style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{p.notes}</code>}
          </div>
          {isSuperuser && <div style={{ fontSize: 12, color: "#374151" }}>{p.store_name || p.seller_id || "—"}</div>}
          <div style={{ textAlign: "right", fontSize: 13 }}>{fmt(p.total_cents)}</div>
          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#059669" }}>{fmt(p.payout_cents)}</div>
          <div style={{ textAlign: "center" }}><Badge tone={tone(p.status)}>{payoutStatusLabel(locale, p.status)}</Badge></div>
          {isSuperuser && <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>{p.paid_at ? fmtD(p.paid_at) : "—"}</div>}
          {isSuperuser && (
            <div>
              {(p.status !== "bezahlt" && p.status !== "paid") && (
                <Button size="slim" variant="primary" loading={markingPaid === p.id} onClick={() => doMarkPaid(p)}>
                  {copy.markTransferred}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
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
