import { lt } from "@/lib/locale-text";

export function getOrdersReportsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    loginAgain: t("Please log in again.", "Lutfen tekrar giris yapin.", "Veuillez vous reconnecter.", "Vuelve a iniciar sesion.", "Accedi di nuovo.", "Bitte erneut einloggen."),
    exportFailed: t("Export failed", "Disa aktarma basarisiz", "Export echoue", "La exportacion fallo", "Esportazione non riuscita", "Export fehlgeschlagen"),
    title: t("Order Reports", "Siparis Raporlari", "Rapports de commandes", "Informes de pedidos", "Report ordini", "Bestellberichte"),
    salesOverview: t("Sales Overview", "Satis Ozeti", "Apercu des ventes", "Resumen de ventas", "Panoramica vendite", "Umsatzubersicht"),
    totalRevenue: t("Total Revenue", "Toplam Gelir", "Chiffre d'affaires total", "Ingresos totales", "Ricavi totali", "Gesamtumsatz"),
    totalOrders: t("Total Orders", "Toplam Siparis", "Total des commandes", "Total de pedidos", "Ordini totali", "Bestellungen gesamt"),
    averageOrderValue: t("Average Order Value", "Ortalama Siparis Degeri", "Valeur moyenne de commande", "Valor medio de pedido", "Valore medio ordine", "Durchschnittlicher Bestellwert"),
    pendingOrders: t("Pending Orders", "Bekleyen Siparisler", "Commandes en attente", "Pedidos pendientes", "Ordini in attesa", "Ausstehende Bestellungen"),
    exportReports: t("Export Reports", "Raporlari Disa Aktar", "Exporter des rapports", "Exportar informes", "Esporta report", "Berichte exportieren"),
    exportDescription: t(
      "Generate and download detailed order reports for your records",
      "Kayitlariniz icin ayrintili siparis raporlari olusturun ve indirin",
      "Generez et telechargez des rapports de commande detailles",
      "Genera y descarga informes detallados de pedidos",
      "Genera e scarica report ordini dettagliati",
      "Erstellen und laden Sie detaillierte Bestellberichte herunter",
    ),
    exporting: t("Exporting...", "Disa aktariliyor...", "Export en cours...", "Exportando...", "Esportazione...", "Exportiere..."),
    exportXlsx: t("Export to XLSX", "XLSX olarak disa aktar", "Exporter en XLSX", "Exportar a XLSX", "Esporta in XLSX", "Als XLSX exportieren"),
    exportCsv: t("Export to CSV", "CSV olarak disa aktar", "Exporter en CSV", "Exportar a CSV", "Esporta in CSV", "Als CSV exportieren"),
  };
}
