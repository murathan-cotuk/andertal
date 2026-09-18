import { CONTAINER_TYPE_GROUP } from "@/lib/landing-container-catalog";
import { lt } from "@/lib/locale-text";

/**
 * Named reusable templates. Each maps 1:1 onto an existing container `type`
 * so live JSONB stays backward compatible — no templates DB table.
 */
export const LANDING_TEMPLATES = [
  { id: "hero_full", type: "hero_banner" },
  { id: "editorial_split", type: "image_text" },
  { id: "promo_banner", type: "banner_cta" },
  { id: "product_carousel", type: "collection_carousel" },
  { id: "bestsellers", type: "bestseller_carousel" },
  { id: "deals", type: "bestseller_carousel", defaults: { mode: "sale" } },
  { id: "new_arrivals", type: "bestseller_carousel", defaults: { mode: "newest" } },
  { id: "featured_product", type: "single_product" },
  { id: "category_cards", type: "collections_carousel", defaults: { source: "categories" } },
  { id: "featured_collections", type: "collections_carousel", defaults: { source: "all" } },
  { id: "brand_showcase", type: "brands_directory" },
  { id: "trust_bar", type: "feature_grid", defaults: { card_style: "flat", cols: 4, padding: "48px 24px" } },
  { id: "newsletter", type: "newsletter" },
  { id: "personalized", type: "personalized_product_row" },
];

export function templateBlurb(id, locale) {
  const loc = String(locale || "de").slice(0, 2).toLowerCase();
  const x = (en, tr, fr, es, it, de) => lt(loc, en, tr, fr, es, it, de);
  const map = {
    hero_full: x("Full-width campaign slider. Swap images and CTAs without code.", "Tam genişlik kampanya slider’ı.", "Slider campagne pleine largeur.", "Slider de campaña a ancho completo.", "Slider campagna a tutta larghezza.", "Vollbreite Kampagnen-Slider."),
    editorial_split: x("Image + copy for seasonal or brand stories.", "Mevsimsel / marka hikâyesi için görsel + metin.", "Image + texte éditorial.", "Imagen + texto editorial.", "Immagine + testo editoriale.", "Bild + Text für Editorial."),
    promo_banner: x("Single CTA strip — deals, free shipping, campaign.", "Tek CTA şeridi — fırsat, kargo, kampanya.", "Bandeau CTA unique.", "Franja CTA única.", "Fascia CTA unica.", "Einzelner CTA-Streifen."),
    product_carousel: x("Products from a collection. Pick the collection in settings.", "Bir koleksiyonun ürünleri. Ayarlardan koleksiyon seç.", "Produits d’une collection.", "Productos de una colección.", "Prodotti di una collezione.", "Produkte einer Kollektion."),
    bestsellers: x("Live catalog, ranked by sales. Optional category filter.", "Canlı katalog, satış sırası. Opsiyonel kategori.", "Catalogue live, tri ventes.", "Catálogo en vivo por ventas.", "Catalogo live per vendite.", "Live-Katalog nach Absatz."),
    deals: x("Discounted products from the live catalog (optional category).", "Canlı katalogdan indirimli ürünler.", "Produits en promo.", "Productos en oferta.", "Prodotti in offerta.", "Reduzierte Produkte aus dem Katalog."),
    new_arrivals: x("Newest products from the live catalog. Optional category filter.", "Canlı katalogdan en yeni ürünler. Opsiyonel kategori.", "Nouveautés du catalogue. Catégorie optionnelle.", "Novedades del catálogo. Categoría opcional.", "Novità del catalogo. Categoria opzionale.", "Neuheiten aus dem Live-Katalog. Kategorie optional."),
    featured_product: x("One product card with add-to-cart.", "Tek ürün kartı, sepete ekle.", "Une fiche produit.", "Una ficha de producto.", "Una scheda prodotto.", "Eine Produktkarte."),
    category_cards: x("Top-level shop categories from the live catalog tree.", "Canlı katalog ağacından üst kategoriler.", "Catégories racine du catalogue.", "Categorías raíz del catálogo.", "Categorie radice del catalogo.", "Oberkategorien aus dem Live-Katalog."),
    featured_collections: x("Live collections when none are picked, or the collections you select.", "Seçilmezse canlı koleksiyonlar; yoksa seçtiklerin.", "Collections live, ou celles que vous choisissez.", "Colecciones en vivo, o las que elijas.", "Collection live, o quelle che scegli.", "Live-Kollektionen, oder die von dir gewählten."),
    brand_showcase: x("Brand grid from verified sellers.", "Doğrulanmış satıcı marka ızgarası.", "Grille de marques.", "Cuadrícula de marcas.", "Griglia brand.", "Markenraster."),
    trust_bar: x("EU shipping, returns, verified sellers — no fake boxes of products.", "AB kargo, iade, doğrulanmış satıcı — sahte ürün kutusu yok.", "Confiance marketplace UE.", "Confianza del marketplace.", "Fiducia marketplace.", "Marktplatz-Vertrauen (EU)."),
    newsletter: x("Signup form pointed at your ESP action URL.", "ESP action URL’li kayıt formu.", "Formulaire newsletter.", "Formulario newsletter.", "Modulo newsletter.", "Newsletter-Formular."),
    personalized: x("Recently viewed / trending for the signed-in shopper.", "Giriş yapmış müşteriye özel ürünler.", "Produits personnalisés.", "Productos personalizados.", "Prodotti personalizzati.", "Personalisierte Produkte."),
  };
  return map[id] || "";
}

export function templatesForLibrary(locale) {
  return LANDING_TEMPLATES.map((tpl) => ({
    ...tpl,
    group: CONTAINER_TYPE_GROUP[tpl.type] || "content",
    blurb: templateBlurb(tpl.id, locale),
  }));
}
