import { lt } from "@/lib/locale-text";

export function returnSlipFilename(returnNumber, locale) {
  const n = returnNumber || "—";
  return lt(locale, `return-slip-R${n}.html`, `iade-fisi-R${n}.html`, `bon-retour-R${n}.html`, `albaran-devolucion-R${n}.html`, `bolla-reso-R${n}.html`, `Retoureschein-R${n}.html`);
}

export function productExcelTemplateFilename(locale) {
  return lt(locale, "andertal-products-template.xlsx", "andertal-urun-sablonu.xlsx", "andertal-produits-modele.xlsx", "andertal-productos-plantilla.xlsx", "andertal-prodotti-modello.xlsx", "andertal-produkte-vorlage.xlsx");
}

export function categoryExcelFilename(kind, locale) {
  const k = String(kind || "template").toLowerCase();
  if (k === "export") {
    return lt(
      locale,
      "andertal-categories-export.xlsx",
      "andertal-kategoriler-export.xlsx",
      "andertal-categories-export.xlsx",
      "andertal-categorias-export.xlsx",
      "andertal-categorie-export.xlsx",
      "andertal-kategorien-export.xlsx",
    );
  }
  return lt(
    locale,
    "andertal-categories-template.xlsx",
    "andertal-kategori-sablonu.xlsx",
    "andertal-categories-modele.xlsx",
    "andertal-categorias-plantilla.xlsx",
    "andertal-categorie-modello.xlsx",
    "andertal-kategorien-vorlage.xlsx",
  );
}

export function productCsvTemplateFilename(locale) {
  return lt(locale, "andertal-product-template.csv", "andertal-urun-sablonu.csv", "andertal-produits-modele.csv", "andertal-productos-plantilla.csv", "andertal-prodotti-modello.csv", "andertal-produkt-vorlage.csv");
}

export function productExportFilename(format, locale) {
  const ext = String(format || "xlsx").replace(/^\./, "");
  const base = lt(locale, "andertal-export", "andertal-disa-aktarma", "andertal-export", "andertal-exportacion", "andertal-esportazione", "andertal-export");
  return `${base}.${ext}`;
}

export function inventoryExportFilename(format, locale) {
  const ext = String(format || "xlsx").replace(/^\./, "");
  const base = lt(locale, "inventory-export", "envanter-disa-aktarma", "inventaire-export", "inventario-exportacion", "inventario-esportazione", "bestand-export");
  return `${base}.${ext}`;
}

export function ordersReportFilename(format, locale) {
  const ext = String(format || "csv").replace(/^\./, "");
  const base = lt(locale, "orders-report", "siparis-raporu", "rapport-commandes", "informe-pedidos", "report-ordini", "bestellungen-bericht");
  return `${base}.${ext}`;
}
