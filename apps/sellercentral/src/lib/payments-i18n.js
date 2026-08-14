import { lt } from "@/lib/locale-text";

export function payoutStatusLabel(locale, s) {
  const map = {
    bezahlt: lt(locale, "Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
    paid: lt(locale, "Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
    ausstehend: lt(locale, "Pending", "Beklemede", "En attente", "Pendiente", "In sospeso", "Ausstehend"),
    pending: lt(locale, "Pending", "Beklemede", "En attente", "Pendiente", "In sospeso", "Ausstehend"),
    processing: lt(locale, "Processing", "İşleniyor", "En cours", "En proceso", "In elaborazione", "In Verarbeitung"),
    verarbeitung: lt(locale, "Processing", "İşleniyor", "En cours", "En proceso", "In elaborazione", "In Verarbeitung"),
    failed: lt(locale, "Failed", "Başarısız", "Échoué", "Fallido", "Fallito", "Fehlgeschlagen"),
    skipped: lt(locale, "Skipped", "Atlandı", "Ignoré", "Omitido", "Saltato", "Übersprungen"),
  };
  return map[s] || s || lt(locale, "Open", "Açık", "Ouvert", "Abierto", "Aperto", "Offen");
}

export function validateIbanMessages(locale) {
  return {
    empty: lt(locale, "IBAN cannot be empty.", "IBAN boş olamaz.", "L'IBAN ne peut pas être vide.", "El IBAN no puede estar vacío.", "L'IBAN non può essere vuoto.", "IBAN darf nicht leer sein."),
    format: lt(locale, "Invalid IBAN format (e.g. DE89 3704 0044 0532 0130 00).", "Geçersiz IBAN formatı (örn. DE89 3704 0044 0532 0130 00).", "Format IBAN invalide (ex. DE89 3704 0044 0532 0130 00).", "Formato IBAN inválido (p. ej. DE89 3704 0044 0532 0130 00).", "Formato IBAN non valido (es. DE89 3704 0044 0532 0130 00).", "Ungültiges IBAN-Format (z.B. DE89 3704 0044 0532 0130 00)."),
    length: lt(locale, "Invalid IBAN length.", "Geçersiz IBAN uzunluğu.", "Longueur IBAN invalide.", "Longitud IBAN inválida.", "Lunghezza IBAN non valida.", "IBAN-Länge ungültig."),
    checksum: lt(locale, "Invalid IBAN checksum.", "Geçersiz IBAN kontrol basamağı.", "Clé de contrôle IBAN invalide.", "Dígito de control IBAN inválido.", "Checksum IBAN non valido.", "IBAN-Prüfziffer ungültig."),
  };
}

export function getPaymentsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    pageTitle: t("Payments & Payouts", "Ödemeler & Ödemeler", "Paiements & Versements", "Pagos y liquidaciones", "Pagamenti e accrediti", "Zahlungen & Auszahlungen"),
    pageSubtitle: t(
      "Marketplace settlement: all amounts in the selected 15-day period by delivery date — without delivery date by order date.",
      "Pazar yeri mutabakatı: seçilen 15 günlük dönemde teslimat tarihine göre tüm tutarlar — teslimat tarihi yoksa sipariş tarihine göre.",
      "Règlement marketplace : tous les montants de la période de 15 jours selon la date de livraison — sinon date de commande.",
      "Liquidación del marketplace: importes del periodo de 15 días por fecha de entrega — sin entrega, por fecha de pedido.",
      "Regolamento marketplace: importi nel periodo di 15 giorni per data consegna — senza consegna per data ordine.",
      "Marktplatz-Abrechnung: Alle Beträge im gewählten 15-Tage-Zeitraum nach Lieferdatum — ohne Lieferdatum nach Bestelldatum."
    ),
    loading: t("Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    loadError: t("Error loading", "Yükleme hatası", "Erreur de chargement", "Error al cargar", "Errore di caricamento", "Fehler beim Laden"),
    holdTitle: t("Hold period:", "Bekleme süresi:", "Délai de rétention :", "Periodo de retención:", "Periodo di attesa:", "Sperrfrist:"),
    holdBody: t(
      "Payout only approx. 14 days after delivery date (status Delivered with date). Until then the list shows Pending — amounts are already visible in revenue.",
      "Ödeme yalnızca teslimat tarihinden yaklaşık 14 gün sonra (Teslim edildi durumu ve tarih). O zamana kadar liste Beklemede — tutarlar gelirde görünür.",
      "Versement env. 14 jours après la date de livraison (statut Livré avec date). Jusque-là liste En attente — montants déjà visibles dans le chiffre d'affaires.",
      "Pago aprox. 14 días después de la fecha de entrega (estado Entregado con fecha). Hasta entonces Pendiente — importes ya visibles en ingresos.",
      "Pagamento ca. 14 giorni dopo la data di consegna (stato Consegnato con data). Fino ad allora In sospeso — importi già visibili nel fatturato.",
      "Auszahlung erst ca. 14 Tage nach Lieferdatum (Status „Zugestellt“ mit Datum). Bis dahin zeigt die Liste „Ausstehend“ — Beträge sind aber bereits im Umsatz sichtbar."
    ),
    periodHint: t(
      "The dropdown period matches half calendar months (like major marketplaces). Default is the period containing today.",
      "Dönem açılır menüsü yarım takvim ayına uyar. Varsayılan bugünün bulunduğu dönemdir.",
      "La période correspond aux demi-mois calendaires. Par défaut : période contenant aujourd'hui.",
      "El periodo coincide con medios meses calendario. Por defecto: periodo con la fecha de hoy.",
      "Il periodo corrisponde a metà mese solare. Predefinito: periodo con la data odierna.",
      "Der Dropdown-Zeitraum entspricht halben Kalendermonaten (wie bei großen Marktplätzen). Standard ist automatisch die Periode, in der sich das heutige Datum befindet."
    ),
    periodTitle: t("Settlement period", "Abrechnungszeitraum", "Période de règlement", "Periodo de liquidación", "Periodo di regolamento", "Abrechnungszeitraum"),
    currentPeriod: t("Current period", "Güncel dönem", "Période actuelle", "Periodo actual", "Periodo corrente", "Aktuelle Periode"),
    pastPeriod: t("Past / preview", "Geçmiş / önizleme", "Passé / aperçu", "Pasado / vista previa", "Passato / anteprima", "Vergangenheit / Vorschau"),
    refresh: t("Refresh", "Yenile", "Actualiser", "Actualizar", "Aggiorna", "Aktualisieren"),
    financeOverview: t("Financial overview", "Finans özeti", "Aperçu financier", "Resumen financiero", "Panoramica finanziaria", "Finanzübersicht"),
    revenue: t("Merchandise revenue (seller basis)", "Ürün cirosu (satıcı bazı)", "Chiffre d'affaires marchandises", "Ingresos por mercancía", "Ricavi merce", "Warenumsatz (Seller-Basis)"),
    commission: t("Commission", "Komisyon", "Commission", "Comisión", "Commissione", "Provision"),
    platformFee: t("Platform fee", "Platform ücreti", "Frais plateforme", "Comisión plataforma", "Commissione piattaforma", "Plattformgebühr"),
    adSpend: t("Advertising costs", "Reklam giderleri", "Coûts publicitaires", "Costes publicitarios", "Costi pubblicitari", "Werbekosten"),
    refunds: t("Refunds", "İadeler", "Remboursements", "Reembolsos", "Rimborsi", "Rückerstattungen"),
    shippingShare: t("Shipping cost share", "Kargo payı", "Part shipping", "Cuota envío", "Quota spedizione", "Versandkostenbeteiligung"),
    netPayout: t("Net payout", "Net ödeme", "Versement net", "Pago neto", "Pagamento netto", "Netto-Auszahlung"),
    afterHold: t("After 14-day hold", "14 gün beklemesi sonrası", "Après 14 jours de rétention", "Tras retención 14 días", "Dopo 14 giorni di attesa", "Nach 14-Tage-Sperrfrist"),
    calcBasis: t("Calculation basis", "Hesaplama temeli", "Base de calcul", "Base de cálculo", "Base di calcolo", "Berechnungsgrundlage"),
    revenueLabel: t("Revenue", "Ciro", "Chiffre d'affaires", "Ingresos", "Ricavi", "Umsatz"),
    netLabel: t("Net", "Net", "Net", "Neto", "Netto", "Netto"),
    noOrdersPeriod: t(
      "No paid orders in this settlement period (by delivery/order date). Try another half-month or check payment status.",
      "Bu dönemde ödenmiş sipariş yok. Başka yarı ay deneyin veya ödeme durumunu kontrol edin.",
      "Aucune commande payée sur cette période. Essayez un autre demi-mois ou vérifiez le statut de paiement.",
      "No hay pedidos pagados en este periodo. Pruebe otro medio mes o el estado de pago.",
      "Nessun ordine pagato in questo periodo. Provare un altro quindicina o lo stato pagamento.",
      "Für diesen Abrechnungszeitraum gibt es keine bezahlten Bestellungen (nach Liefer-/Bestelldatum). Prüfe einen anderen Halbmonat oder ob die Bestellungen auf „bezahlt“ stehen."
    ),
    transactions: t("Transactions", "İşlemler", "Transactions", "Transacciones", "Transazioni", "Transaktionen"),
    entries: t("entries", "kayıt", "entrées", "entradas", "voci", "Einträge"),
    filtered: t("filtered", "filtreli", "filtré", "filtrado", "filtrato", "gefiltert"),
    resetFilters: t("Reset filters", "Filtreleri sıfırla", "Réinitialiser filtres", "Restablecer filtros", "Reimposta filtri", "Filter zurücksetzen"),
    csvExport: t("CSV export", "CSV dışa aktar", "Export CSV", "Exportar CSV", "Esporta CSV", "CSV Export"),
    search: t("Search", "Ara", "Rechercher", "Buscar", "Cerca", "Suche"),
    typeAll: t("All types", "Tüm türler", "Tous types", "Todos tipos", "Tutti i tipi", "Alle Typen"),
    typeSale: t("Sales", "Satışlar", "Ventes", "Ventas", "Vendite", "Verkäufe"),
    typeRefund: t("Refunds", "İadeler", "Remboursements", "Devoluciones", "Resi", "Erstattungen"),
    statusAll: t("All statuses", "Tüm durumlar", "Tous statuts", "Todos estados", "Tutti gli stati", "Alle Status"),
    statusEligible: t("Payout eligible", "Ödemeye uygun", "Éligible au versement", "Elegible para pago", "Idoneo al pagamento", "Auszahlungsreif"),
    statusPending: t("On hold", "Beklemede", "En attente", "Pendiente", "In sospeso", "Sperrfrist"),
    eligible: t("Eligible", "Uygun", "Éligible", "Elegible", "Idoneo", "Freigegeben"),
    pending: t("Pending", "Beklemede", "En attente", "Pendiente", "In sospeso", "Ausstehend"),
    back: t("Back", "Geri", "Retour", "Atrás", "Indietro", "Zurück"),
    next: t("Next", "İleri", "Suivant", "Siguiente", "Avanti", "Weiter"),
    page: t("Page", "Sayfa", "Page", "Página", "Pagina", "Seite"),
    of: t("of", "/", "sur", "de", "di", "von"),
    payoutHistory: t("Payout history", "Ödeme geçmişi", "Historique des versements", "Historial de pagos", "Storico pagamenti", "Auszahlungsverlauf"),
    noPayoutsYet: t("No payouts yet.", "Henüz ödeme yok.", "Aucun versement pour l'instant.", "Aún no hay pagos.", "Ancora nessun pagamento.", "Noch keine Auszahlungen vorhanden."),
    periodCol: t("Period", "Dönem", "Période", "Periodo", "Periodo", "Zeitraum"),
    payoutCol: t("Payout", "Ödeme", "Versement", "Pago", "Pagamento", "Auszahlung"),
    bankDetails: t("Bank details", "Banka bilgileri", "Coordonnées bancaires", "Datos bancarios", "Dati bancari", "Bankverbindung"),
    bankDetailsSub: t("IBAN on file for automatic payouts", "Otomatik ödemeler için kayıtlı IBAN", "IBAN enregistré pour versements automatiques", "IBAN registrado para pagos automáticos", "IBAN registrato per pagamenti automatici", "Hinterlegte IBAN für automatische Auszahlungen"),
    howPayoutsWork: t("How payouts work", "Ödemeler nasıl çalışır", "Comment fonctionnent les versements", "Cómo funcionan los pagos", "Come funzionano i pagamenti", "So funktionieren Auszahlungen"),
    step1Label: t("Customer buys", "Müşteri satın alır", "Le client achète", "El cliente compra", "Il cliente acquista", "Kunde kauft"),
    step1Desc: t("Payment is collected securely via Stripe.", "Ödeme Stripe ile güvenle alınır.", "Le paiement est collecté via Stripe.", "El pago se recibe vía Stripe.", "Il pagamento avviene tramite Stripe.", "Zahlung geht sicher über Stripe ein."),
    step2Label: t("14-day hold", "14 gün bekleme", "Rétention 14 jours", "Retención 14 días", "Attesa 14 giorni", "Sperrfrist 14 Tage"),
    step2Desc: t("After delivery confirmation, the 14-day payout hold begins.", "Teslimat onayından sonra 14 günlük bekleme başlar.", "Après confirmation de livraison, début de la rétention de 14 jours.", "Tras confirmación de entrega, comienza la retención de 14 días.", "Dopo conferma consegna, inizia l'attesa di 14 giorni.", "Nach Lieferbestätigung beginnt die 14-tägige Auszahlungssperrfrist."),
    step3Label: t("Payout", "Ödeme", "Versement", "Pago", "Pagamento", "Auszahlung"),
    step3Desc: t("After the hold, the amount is transferred automatically to your IBAN.", "Bekleme sonrası tutar IBAN'ınıza otomatik aktarılır.", "Après la rétention, le montant est viré sur votre IBAN.", "Tras la retención, se transfiere a su IBAN.", "Dopo l'attesa, l'importo viene trasferito al vostro IBAN.", "Nach Ablauf der Sperrfrist wird der Betrag automatisch auf die hinterlegte IBAN überwiesen."),
    bankAccountTitle: t("Bank account for payouts", "Ödemeler için banka hesabı", "Compte bancaire pour versements", "Cuenta bancaria para pagos", "Conto bancario per pagamenti", "Bankkonto für Auszahlungen"),
    bankAccountSub: t("Your sales revenue is paid to this account.", "Satış gelirleriniz bu hesaba ödenir.", "Vos revenus de vente sont versés sur ce compte.", "Sus ingresos se pagan en esta cuenta.", "I ricavi delle vendite vengono accreditati su questo conto.", "An dieses Konto werden deine Verkaufserlöse überwiesen."),
    edit: t("Edit", "Düzenle", "Modifier", "Editar", "Modifica", "Bearbeiten"),
    add: t("Add", "Ekle", "Ajouter", "Añadir", "Aggiungi", "Hinzufügen"),
    accountHolder: t("Account holder", "Hesap sahibi", "Titulaire du compte", "Titular de la cuenta", "Intestatario conto", "Kontoinhaber"),
    bank: t("Bank", "Banka", "Banque", "Banco", "Banca", "Bank"),
    bankReady: t("Bank account on file — ready for payouts", "Banka hesabı kayıtlı — ödemeye hazır", "Compte enregistré — prêt pour versements", "Cuenta registrada — lista para pagos", "Conto registrato — pronto per pagamenti", "Bankkonto hinterlegt — bereit für Auszahlungen"),
    noBankTitle: t("No bank account on file", "Banka hesabı kayıtlı değil", "Aucun compte bancaire", "Sin cuenta bancaria", "Nessun conto bancario", "Kein Bankkonto hinterlegt"),
    noBankDesc: t("Add your IBAN to receive automatic payouts after the hold period.", "Otomatik ödeme için IBAN ekleyin.", "Ajoutez votre IBAN pour recevoir les versements.", "Añada su IBAN para recibir pagos.", "Aggiungete l'IBAN per i pagamenti automatici.", "Hinterlege deine IBAN, um Auszahlungen nach der Sperrfrist zu erhalten."),
    saveBank: t("Save bank details", "Banka bilgilerini kaydet", "Enregistrer coordonnées", "Guardar datos bancarios", "Salva dati bancari", "Bankdaten speichern"),
    bankSaved: t("Bank details saved.", "Banka bilgileri kaydedildi.", "Coordonnées enregistrées.", "Datos bancarios guardados.", "Dati bancari salvati.", "Bankdaten gespeichert."),
    saveError: t("Error saving.", "Kaydetme hatası.", "Erreur lors de l'enregistrement.", "Error al guardar.", "Errore di salvataggio.", "Fehler beim Speichern."),
    ibanHelp: t("International bank account number — spaces formatted automatically", "Uluslararası banka hesap numarası — boşluklar otomatik", "Numéro de compte international — espaces auto", "Número de cuenta internacional", "Numero conto internazionale", "Internationale Bankkontonummer — Leerzeichen werden automatisch formatiert"),
    searchPlaceholder: t("Order no. or customer name…", "Sipariş no. veya müşteri adı…", "N° commande ou nom client…", "N.º pedido o nombre cliente…", "N. ordine o nome cliente…", "Bestellnr. oder Kundenname…"),
    perPage: t("per page", "sayfa başına", "par page", "por página", "per pagina", "pro Seite"),
    showAll: t("Show all", "Tümünü göster", "Tout afficher", "Mostrar todo", "Mostra tutto", "Alle anzeigen"),
    loadingTransactions: t("Loading transactions…", "İşlemler yükleniyor…", "Chargement des transactions…", "Cargando transacciones…", "Caricamento transazioni…", "Transaktionen werden geladen…"),
    noTransactionsFilter: t("No transactions match the selected filters.", "Seçilen filtrelere uygun işlem yok.", "Aucune transaction pour les filtres sélectionnés.", "Ninguna transacción coincide con los filtros.", "Nessuna transazione per i filtri selezionati.", "Keine Transaktionen für die gewählten Filter."),
    noTransactionsPeriod: t("No transactions in this period.", "Bu dönemde işlem yok.", "Aucune transaction sur cette période.", "No hay transacciones en este periodo.", "Nessuna transazione in questo periodo.", "Keine Transaktionen in diesem Zeitraum."),
    colDeliveryDate: t("Delivery date", "Teslimat tarihi", "Date de livraison", "Fecha de entrega", "Data consegna", "Lieferdatum"),
    csvFilenamePrefix: t("transactions", "islemler", "transactions", "transacciones", "transazioni", "transaktionen"),
    colOrderNo: t("Order no.", "Sipariş no.", "N° commande", "N.º pedido", "N. ordine", "Bestellnr."),
    colCustomer: t("Customer", "Müşteri", "Client", "Cliente", "Cliente", "Kunde"),
    colGross: t("Gross", "Brüt", "Brut", "Bruto", "Lordo", "Brutto"),
    colShipping: t("Shipping", "Kargo", "Expédition", "Envío", "Spedizione", "Versand"),
    colNet: t("Net", "Net", "Net", "Neto", "Netto", "Netto"),
    colStatus: t("Status", "Durum", "Statut", "Estado", "Stato", "Status"),
    deliveryShort: t("Del.", "Tes.", "Liv.", "Ent.", "Cons.", "Lief."),
    sum: t("Total", "Toplam", "Total", "Total", "Totale", "Summe"),
    totalWord: t("total", "toplam", "total", "total", "totale", "gesamt"),
    cancel: t("Cancel", "İptal", "Annuler", "Cancelar", "Annulla", "Abbrechen"),
    calendarDays: t("calendar days", "takvim günü", "jours calendaires", "días naturales", "giorni di calendario", "Kalendertage"),
    ibanRequired: t("IBAN *", "IBAN *", "IBAN *", "IBAN *", "IBAN *", "IBAN *"),
    bicOptional: t("BIC / SWIFT (optional)", "BIC / SWIFT (isteğe bağlı)", "BIC / SWIFT (optionnel)", "BIC / SWIFT (opcional)", "BIC / SWIFT (opzionale)", "BIC / SWIFT (optional)"),
    bankNameOptional: t("Bank name (optional)", "Banka adı (isteğe bağlı)", "Nom de banque (optionnel)", "Nombre del banco (opcional)", "Nome banca (opzionale)", "Bankname (optional)"),
    holderPlaceholder: t("John Doe or Example Ltd", "Ahmet Yılmaz veya Örnek Ltd", "Jean Dupont ou Exemple SARL", "Juan Pérez o Ejemplo SL", "Mario Rossi o Esempio Srl", "Max Mustermann oder Musterfirma GmbH"),
    entriesLabel: t("Entries", "Kayıt", "Entrées", "Entradas", "Voci", "Einträge"),
    typeOrders: t("Orders", "Siparişler", "Commandes", "Pedidos", "Ordini", "Bestellungen"),
    adminPageTitle: t("Payments & Payouts (Admin)", "Ödemeler & Ödemeler (Admin)", "Paiements & Versements (Admin)", "Pagos y liquidaciones (Admin)", "Pagamenti e accrediti (Admin)", "Zahlungen & Auszahlungen (Admin)"),
    adminPeriodSub: t("Platform overview for all sellers", "Tüm satıcılar için platform özeti", "Aperçu plateforme pour tous les vendeurs", "Resumen de plataforma para todos los vendedores", "Panoramica piattaforma per tutti i venditori", "Plattform-Übersicht für alle Seller"),
    platformFinance: t("Platform finances", "Platform finansları", "Finances plateforme", "Finanzas de plataforma", "Finanze piattaforma", "Plattform-Finanzen"),
    platformRevenue: t("Platform revenue (total)", "Platform cirosu (toplam)", "Chiffre d'affaires plateforme (total)", "Ingresos plataforma (total)", "Ricavi piattaforma (totale)", "Plattform-Umsatz (gesamt)"),
    activeSellers: t("active sellers", "aktif satıcı", "vendeurs actifs", "vendedores activos", "venditori attivi", "aktive Seller"),
    commissionEst: t("Commission (estimated)", "Komisyon (tahmini)", "Commission (estimée)", "Comisión (estimada)", "Commissione (stimata)", "Provision (geschätzt)"),
    platformIncome: t("Platform income", "Platform geliri", "Revenus plateforme", "Ingresos plataforma", "Entrate piattaforma", "Einnahmen der Plattform"),
    toPayoutTotal: t("Total to pay out", "Toplam ödenecek", "Total à verser", "Total a pagar", "Totale da pagare", "Auszuzahlen (gesamt)"),
    alreadyPaid: t("Already paid", "Ödendi", "Déjà payé", "Ya pagado", "Già pagato", "Bereits bezahlt"),
    stillPending: t("Still pending", "Hâlâ beklemede", "Encore en attente", "Aún pendiente", "Ancora in sospeso", "Noch ausstehend"),
    markPaid: t("Mark as paid", "Ödendi işaretle", "Marquer payé", "Marcar como pagado", "Segna come pagato", "Als bezahlt markieren"),
    paidLabel: t("Paid", "Ödendi", "Payé", "Pagado", "Pagato", "Bezahlt"),
    monitorHint: t("Showing max. 200 entries. Use filters for specific results.", "En fazla 200 kayıt gösteriliyor. Belirli sonuçlar için filtre kullanın.", "200 entrées max. Utilisez les filtres pour des résultats précis.", "Máx. 200 entradas. Use filtros para resultados específicos.", "Max 200 voci. Usa i filtri per risultati specifici.", "Maximal 200 Einträge angezeigt. Nutze die Filter um spezifische Ergebnisse zu sehen."),
    adminSellerPayouts: (n) => t(`Seller payouts (${n})`, `Satıcı ödemeleri (${n})`, `Versements vendeurs (${n})`, `Pagos vendedores (${n})`, `Pagamenti venditori (${n})`, `Seller-Auszahlungen (${n})`),
    noDataPeriod: t("No data for this period.", "Bu dönem için veri yok.", "Aucune donnée pour cette période.", "Sin datos en este periodo.", "Nessun dato per questo periodo.", "Für diesen Zeitraum liegen keine Daten vor."),
    sellerCol: t("Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Seller"),
    referenceCol: t("Payment reference", "Ödeme referansı", "Référence de paiement", "Referencia de pago", "Riferimento pagamento", "Verwendungszweck"),
    ordersCount: (n) => t(`${n} orders`, `${n} sipariş`, `${n} commandes`, `${n} pedidos`, `${n} ordini`, `${n} Bestellungen`),
    noAmount: t("No amount", "Tutar yok", "Aucun montant", "Sin importe", "Nessun importo", "Kein Betrag"),
    ibanMonitorTitle: t("IBAN payout monitor", "IBAN ödeme monitörü", "Moniteur de versements IBAN", "Monitor de pagos IBAN", "Monitor pagamenti IBAN", "IBAN Auszahlungsmonitor"),
    ibanMonitorSub: t("Automatic payout status for all orders", "Tüm siparişler için otomatik ödeme durumu", "Statut de versement automatique pour toutes les commandes", "Estado de pago automático de todos los pedidos", "Stato pagamento automatico di tutti gli ordini", "Automatische Auszahlungsstatus aller Bestellungen"),
    adminSearchPlaceholder: t("Order no. or seller…", "Sipariş no. veya satıcı…", "N° commande ou vendeur…", "N.º pedido o vendedor…", "N. ordine o venditore…", "Bestellnr. oder Seller…"),
    orderCol: t("Order", "Sipariş", "Commande", "Pedido", "Ordine", "Bestellung"),
    payoutIdCol: t("Payout ID", "Ödeme ID", "ID versement", "ID pago", "ID pagamento", "Payout-ID"),
    noDataInPeriod: t("No data in this period.", "Bu dönemde veri yok.", "Aucune donnée sur cette période.", "Sin datos en el periodo.", "Nessun dato nel periodo.", "Keine Daten im Zeitraum."),
    markPaidConfirm: (name) => t(
      `Mark payout for "${name}" as transferred?\n\nEnsure the actual transfer has already been completed.`,
      `"${name}" için ödemeyi transfer edildi olarak işaretle?\n\nGerçek transferin tamamlandığından emin olun.`,
      `Marquer le versement pour « ${name} » comme viré ?\n\nAssurez-vous que le virement a bien été effectué.`,
      `¿Marcar pago de "${name}" como transferido?\n\nConfirme que la transferencia ya se realizó.`,
      `Segnare il pagamento per "${name}" come trasferito?\n\nAssicurarsi che il bonifico sia già stato effettuato.`,
      `Auszahlung für „${name}" als überwiesen markieren?\n\nBitte stelle sicher, dass die tatsächliche Überweisung bereits erfolgt ist.`
    ),
    genericError: t("Error", "Hata", "Erreur", "Error", "Errore", "Fehler"),
    paymentsTitle: t("Payments", "Ödemeler", "Paiements", "Pagos", "Pagamenti", "Zahlungen"),
    balance: t("Balance", "Bakiye", "Solde", "Saldo", "Saldo", "Guthaben"),
    periodMovement: t("This period", "Bu dönem", "Cette période", "Este período", "Questo periodo", "Dieser Zeitraum"),
    allPeriods: t("All periods", "Tüm dönemler", "Toutes les périodes", "Todos los períodos", "Tutti i periodi", "Alle Zeiträume"),
    colDescription: t("Description", "Açıklama", "Description", "Descripción", "Descrizione", "Beschreibung"),
    colAmount: t("Amount", "Tutar", "Montant", "Importe", "Importo", "Betrag"),
    noLedger: t("No movements in this period.", "Bu dönemde hareket yok.", "Aucun mouvement sur cette période.", "Sin movimientos en este período.", "Nessun movimento in questo periodo.", "Keine Bewegungen in diesem Zeitraum."),
    chargedCard: t("Card", "Kart", "Carte", "Tarjeta", "Carta", "Karte"),
    csvLedgerPrefix: t("account-movements", "hesap-hareketleri", "mouvements-compte", "movimientos-cuenta", "movimenti-conto", "kontobewegungen"),
    statusLabel: (s) => payoutStatusLabel(locale, s),
    ibanErrors: validateIbanMessages(locale),
  };
}

export function ledgerEntryLabel(entry, locale) {
  const p = entry?.description_params || {};
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  const type = entry?.type;
  if (type === "order_received") {
    return t("Order received", "Sipariş alındı", "Commande reçue", "Pedido recibido", "Ordine ricevuto", "Bestellung eingegangen");
  }
  if (type === "commission") {
    const rate = p.rate_pct != null ? String(p.rate_pct).replace(/\.0$/, "") : "12";
    return t(
      `Commission ${rate} % incl. VAT`,
      `Komisyon ${rate} % KDV dahil`,
      `Commission ${rate} % TTC`,
      `Comisión ${rate} % IVA incl.`,
      `Commissione ${rate} % IVA incl.`,
      `Provision ${rate} % inkl. MwSt.`,
    );
  }
  if (type === "commission_refund") {
    return t("Commission refunded", "Komisyon iade edildi", "Commission remboursée", "Comisión reembolsada", "Commissione rimborsata", "Provision erstattet");
  }
  if (type === "refund") {
    return t("Refund", "İade", "Remboursement", "Reembolso", "Rimborso", "Erstattung");
  }
  if (type === "shipping_label" || entry?.description_key === "shipping_label_for_order") {
    return t("Shipping label (Andertal)", "Kargo etiketi (Andertal)", "Étiquette d'expédition (Andertal)", "Etiqueta de envío (Andertal)", "Etichetta di spedizione (Andertal)", "Versandetikett (Andertal)");
  }
  if (type === "payout") {
    return t("Payout", "Ödeme", "Versement", "Pago", "Pagamento", "Auszahlung");
  }
  if (type === "advertising") {
    return t("Advertising", "Reklam", "Publicité", "Publicidad", "Pubblicità", "Werbung");
  }
  if (entry?.description_key === "manual_note" && p.note) return String(p.note);
  if (type === "manual_adjustment") {
    return t("Adjustment", "Düzeltme", "Ajustement", "Ajuste", "Rettifica", "Anpassung");
  }
  return type || "—";
}
