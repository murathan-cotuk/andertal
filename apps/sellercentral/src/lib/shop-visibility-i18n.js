/** Localized labels for product.shop_visibility.reasons[].code from the backend. */

import { lt } from "@/lib/locale-text";

export function isShopLiveStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "published" || s === "active";
}

export function shopVisibilityReasonLabel(code, locale) {
  switch (String(code || "")) {
    case "status_not_live":
      return lt(
        locale,
        "Status is not Active/Published (draft, archived, merged, or inactive products stay hidden).",
        "Durum Aktif/Yayında değil (taslak, arşiv, birleştirilmiş veya pasif ürünler shop’ta görünmez).",
        "Le statut n’est pas Actif/Publié (brouillon, archivé, fusionné ou inactif restent masqués).",
        "El estado no es Activo/Publicado (borrador, archivado, fusionado o inactivo permanecen ocultos).",
        "Lo stato non è Attivo/Pubblicato (bozza, archiviato, unito o inattivo restano nascosti).",
        "Status ist nicht Aktiv/Veröffentlicht (Entwurf, archiviert, zusammengeführt oder inaktiv bleiben ausgeblendet).",
      );
    case "pending_catalog_metafields":
      return lt(
        locale,
        "Catalog attribute values are waiting for platform approval.",
        "Katalog özellik değerleri platform onayını bekliyor.",
        "Des valeurs d’attributs catalogue attendent l’approbation de la plateforme.",
        "Hay valores de atributos de catálogo pendientes de aprobación de la plataforma.",
        "Valori di attributi catalogo in attesa di approvazione della piattaforma.",
        "Katalog-Attributwerte warten auf die Freigabe der Plattform.",
      );
    case "seller_not_approved":
      return lt(
        locale,
        "Seller account is rejected or suspended — products stay hidden from the shop.",
        "Satıcı hesabı reddedilmiş veya askıya alınmış — ürünler shop’ta görünmez.",
        "Compte vendeur rejeté ou suspendu — les produits restent masqués dans la boutique.",
        "Cuenta de vendedor rechazada o suspendida — los productos no aparecen en la tienda.",
        "Account venditore rifiutato o sospeso — i prodotti restano nascosti nel negozio.",
        "Verkäuferkonto abgelehnt oder gesperrt — Produkte bleiben im Shop ausgeblendet.",
      );
    case "family_shell":
      return lt(
        locale,
        "This is a family roof (shell) product and is excluded from shop catalog listings.",
        "Bu bir aile çatı (shell) ürünü; shop katalogunda listelenmez.",
        "Ceci est un produit toit de famille (shell) exclu du catalogue boutique.",
        "Este es un producto techo de familia (shell) y no aparece en el catálogo.",
        "Questo è un prodotto tetto famiglia (shell) ed è escluso dal catalogo negozio.",
        "Dies ist ein Familien-Dachprodukt (Shell) und erscheint nicht im Shop-Katalog.",
      );
    default:
      return String(code || "");
  }
}

export function shopVisibilityBannerTitle(locale) {
  return lt(
    locale,
    "Active in Sellercentral, but not shown in the shop",
    "Sellercentral’da aktif, ancak shop’ta görünmüyor",
    "Actif dans Sellercentral, mais non affiché dans la boutique",
    "Activo en Sellercentral, pero no se muestra en la tienda",
    "Attivo in Sellercentral, ma non mostrato nel negozio",
    "In Sellercentral aktiv, aber im Shop nicht sichtbar",
  );
}

/** Reasons to show when Sellercentral status is Active/Published but shop hides the product. */
export function shopVisibilityHiddenReasons(product) {
  if (!isShopLiveStatus(product?.status)) return [];
  const vis = product?.shop_visibility;
  if (!vis || vis.visible === true) return [];
  return Array.isArray(vis.reasons) ? vis.reasons : [];
}
