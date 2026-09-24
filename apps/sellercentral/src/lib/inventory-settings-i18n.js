import { lt } from "@/lib/locale-text";

export function getInventorySettingsCopy(locale) {
  const t = (en, tr, de) => lt(locale, en, tr, en, en, en, de);
  return {
    pageTitle: t("Inventory settings", "Envanter ayarları", "Bestand-Einstellungen"),
    pageIntro: t(
      "Rules that decide which catalog badges (New, Bestseller, Sale) appear on the shop, platform-wide. These don't affect any single product directly — they're thresholds applied automatically across the whole catalog.",
      "Katalog rozetlerinin (Yeni, Bestseller, İndirim) shop'ta ne zaman görüneceğini belirleyen, platform geneli kurallar. Tek bir ürünü doğrudan etkilemezler — tüm katalog için otomatik uygulanan eşiklerdir.",
      "Regeln, die plattformweit festlegen, wann die Katalog-Badges (Neu, Bestseller, Sale) im Shop erscheinen. Sie betreffen kein einzelnes Produkt direkt — es sind Schwellenwerte, die automatisch auf den gesamten Katalog angewendet werden."
    ),
    saved: t("Saved", "Kaydedildi", "Gespeichert"),
    save: t("Save", "Kaydet", "Speichern"),
    loadError: t("Could not load settings.", "Ayarlar yüklenemedi.", "Einstellungen konnten nicht geladen werden."),
    saveError: t("Could not save settings.", "Ayarlar kaydedilemedi.", "Einstellungen konnten nicht gespeichert werden."),

    newSectionTitle: t("\"New\" badge", "\"Yeni\" rozeti", "„Neu“-Badge"),
    newSectionHelp: t(
      "A product counts as New for this many days after its publish date (or creation date if never published). While New, it gets the badge, shows in Neuheiten, and matches the category's New filter.",
      "Bir ürün, yayın tarihinden (hiç yayınlanmadıysa oluşturulma tarihinden) itibaren bu kadar gün boyunca Yeni sayılır. Yeni olduğu sürece rozeti alır, Yenilikler'de gösterilir ve kategori Yeni filtresiyle eşleşir.",
      "Ein Produkt gilt ab seinem Veröffentlichungsdatum (oder Erstellungsdatum, falls nie veröffentlicht) für so viele Tage als Neu. Solange es Neu ist, erhält es das Badge, erscheint bei Neuheiten und passt zum Neu-Filter der Kategorie."
    ),
    newWindowDaysLabel: t("New window (days)", "Yeni süresi (gün)", "Neu-Dauer (Tage)"),
    newWindowDaysHelp: t(
      "Typical range: 7–30 days. Longer windows keep more products tagged New for longer, which can dilute the badge's meaning.",
      "Tipik aralık: 7–30 gün. Daha uzun süreler daha fazla ürünü daha uzun süre Yeni olarak işaretler, bu da rozetin anlamını zayıflatabilir.",
      "Typischer Bereich: 7–30 Tage. Längere Zeiträume markieren mehr Produkte länger als Neu, was die Aussagekraft des Badges verwässern kann."
    ),

    bestsellerSectionTitle: t("\"Bestseller\" badge", "\"Bestseller\" rozeti", "„Bestseller“-Badge"),
    bestsellerSectionHelp: t(
      "Bestseller ranking is based on paid units sold. These two settings control how selective the badge is.",
      "Bestseller sıralaması, ödenmiş satılan adet sayısına dayanır. Bu iki ayar, rozetin ne kadar seçici olacağını belirler.",
      "Das Bestseller-Ranking basiert auf verkauften, bezahlten Einheiten. Diese zwei Einstellungen bestimmen, wie selektiv das Badge vergeben wird."
    ),
    bestsellerMinSoldLabel: t("Minimum sales", "Minimum satış", "Mindestverkäufe"),
    bestsellerMinSoldHelp: t(
      "A product needs at least this many paid units sold before it can ever get the Bestseller badge — regardless of its rank within a category.",
      "Bir ürünün Bestseller rozeti alabilmesi için, kategorideki sırasından bağımsız olarak en az bu kadar ödenmiş adet satması gerekir.",
      "Ein Produkt braucht mindestens so viele bezahlte verkaufte Einheiten, bevor es überhaupt das Bestseller-Badge erhalten kann — unabhängig von seinem Rang innerhalb einer Kategorie."
    ),
    bestsellerTopPerCategoryLabel: t("Top N per category", "Kategori başına ilk N", "Top N je Kategorie"),
    bestsellerTopPerCategoryHelp: t(
      "The N best-selling products within each category get the badge (still subject to the minimum sales rule above). Set to 1 for only the single best seller per category.",
      "Her kategorideki en çok satan ilk N ürün rozeti alır (yukarıdaki minimum satış kuralına tabidir). Kategori başına sadece tek bir en çok satanı istiyorsanız 1 olarak ayarlayın.",
      "Die N meistverkauften Produkte jeder Kategorie erhalten das Badge (weiterhin abhängig von der Mindestverkäufe-Regel oben). Auf 1 setzen für nur den einen Top-Seller je Kategorie."
    ),

    saleSectionTitle: t("\"Sale\" badge", "\"İndirim\" rozeti", "„Sale“-Badge"),
    saleSectionHelp: t(
      "Controls when a discounted price is worth flagging to shoppers.",
      "İndirimli bir fiyatın alıcılara ne zaman vurgulanmaya değer olduğunu kontrol eder.",
      "Steuert, ab wann ein reduzierter Preis für Käufer hervorgehoben werden soll."
    ),
    saleMinDiscountPercentLabel: t("Minimum discount %", "Minimum indirim %", "Mindest-Rabatt %"),
    saleMinDiscountPercentHelp: t(
      "The Sale badge only appears when the discount off the regular price is at least this percentage. 0 = any discount at all, however small, qualifies.",
      "İndirim rozeti, normal fiyata göre indirim en az bu yüzdeyse görünür. 0 = ne kadar küçük olursa olsun her indirim yeterlidir.",
      "Das Sale-Badge erscheint nur, wenn der Rabatt auf den Normalpreis mindestens diesem Prozentsatz entspricht. 0 = jeder noch so kleine Rabatt zählt."
    ),
  };
}
