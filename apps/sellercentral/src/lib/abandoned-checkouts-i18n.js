import { lt } from "@/lib/locale-text";

export function getAbandonedCheckoutsCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    product: t("Product", "Urun", "Produit", "Producto", "Prodotto", "Produkt"),
    qty: t("Qty", "Adet", "Qté", "Cant.", "Qta", "Menge"),
    unitPrice: t("Unit price", "Birim fiyat", "Prix unitaire", "Precio unitario", "Prezzo unitario", "Einzelpreis"),
    total: t("Total", "Toplam", "Total", "Total", "Totale", "Gesamt"),
    noItems: t("No items", "Urun yok", "Aucun article", "Sin articulos", "Nessun articolo", "Keine Artikel"),
    pageTitle: t("Abandoned Checkouts", "Yarim Kalan Siparisler", "Paniers abandonnes", "Carritos abandonados", "Checkout abbandonati", "Abgebrochene Checkouts"),
    pageSubtitle: t(
      "Carts that were not completed",
      "Tamamlanmayan alisveris sepetleri",
      "Paniers non finalises",
      "Carritos no finalizados",
      "Carrelli non completati",
      "Warenkorbe, die nicht abgeschlossen wurden",
    ),
    carts: t("carts", "sepet", "paniers", "carritos", "carrelli", "Warenkorbe"),
    customer: t("Customer", "Musteri", "Client", "Cliente", "Cliente", "Kunde"),
    items: t("Items", "Urunler", "Articles", "Articulos", "Articoli", "Artikel"),
    value: t("Value", "Deger", "Valeur", "Valor", "Valore", "Wert"),
    created: t("Created", "Olusturuldu", "Cree", "Creado", "Creato", "Erstellt"),
    lastActive: t("Last active", "Son aktiflik", "Derniere activite", "Ultima actividad", "Ultima attivita", "Zuletzt aktiv"),
    noCheckouts: t("No abandoned checkouts", "Yarim kalan siparis yok", "Aucun checkout abandonne", "No hay checkouts abandonados", "Nessun checkout abbandonato", "Keine abgebrochenen Checkouts"),
    itemCount: (count) => t(`${count} items`, `${count} urun`, `${count} articles`, `${count} articulos`, `${count} articoli`, `${count} Artikel`),
    email: t("Email", "E-posta", "E-mail", "Correo", "E-mail", "E-Mail"),
  };
}
