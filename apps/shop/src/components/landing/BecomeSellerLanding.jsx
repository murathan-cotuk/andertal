"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import styles from "./BecomeSellerLanding.module.css";

const REGISTER_BASE = "https://sellercentral.andertal.com";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700;800&display=swap";

const IMG = {
  hero: "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=2000&q=80",
  eu: "https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1400&q=80",
  mosaic1: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
  mosaic2: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80",
  mosaic3: "https://images.unsplash.com/photo-1607083206869-4c797ed044a8?auto=format&fit=crop&w=900&q=80",
};

function pick(dict, locale) {
  return dict[locale] || dict.en || dict.de;
}

function registerUrl(locale) {
  const loc = ["en", "de", "tr", "fr", "es", "it"].includes(locale) ? locale : "en";
  return `${REGISTER_BASE}/${loc}/register`;
}

function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const nodes = root.querySelectorAll(`.${styles.reveal}`);
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add(styles.in));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.in);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return ref;
}

function Accordion({ items, dark }) {
  const [open, setOpen] = useState(0);
  return (
    <div className={styles.accList}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`${styles.accItem}${isOpen ? ` ${styles.open}` : ""}`}>
            <button
              type="button"
              className={styles.accBtn}
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={dark ? { color: "#f4f1ea" } : undefined}
            >
              <span>{item.q}</span>
              <span className={styles.accIcon} aria-hidden>
                +
              </span>
            </button>
            <div className={styles.accPanel}>
              <div className={styles.accPanelInner}>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function copyFor(locale) {
  const de = {
    brand: "Andertal",
    heroTitle: "Verkaufe dort, wo Europa einkauft.",
    heroLead:
      "Eröffne deinen Shop auf dem Andertal Marketplace — klare Tools, EU-weite Reichweite und ein Sellercentral, das mitwächst.",
    ctaPrimary: "Jetzt Verkäufer werden",
    ctaSecondary: "So funktioniert’s",
    stats: [
      { n: "EU", l: "Märkte mit einer Registrierung" },
      { n: "0 €", l: "Startgebühr für deinen Shop" },
      { n: "14 Tage", l: "Auszahlungslogik nach Lieferung" },
      { n: "24/7", l: "Sellercentral & Bestellfluss" },
    ],
    whyEyebrow: "Warum Andertal",
    whyTitle: "Mehr als ein Shop. Ein europäischer Verkaufskanal.",
    whyLead: "Wir bauen den Marketplace, damit du Produkte listen, bestellen und auszahlen kannst — ohne Technik-Chaos.",
    features: [
      { icon: "1", t: "Eigene Storefront", d: "Dein Markenauftritt im Marketplace — Produkte, Marke und Bewertungen an einem Ort." },
      { icon: "2", t: "EU-weite Kunden", d: "Erreiche Käufer in mehreren Ländern, ohne für jedes Land einen eigenen Shop zu bauen." },
      { icon: "3", t: "Sellercentral", d: "Bestellungen, Lager, Versand, Inhalte und Analytics in einem ruhigen Arbeitsbereich." },
      { icon: "4", t: "Klare Gebühren", d: "Transparente Marketplace-Logik — du weißt, was nach Verkauf und Lieferung übrig bleibt." },
      { icon: "5", t: "Wachstumswerkzeuge", d: "Kategorien, Collections, Badges und Marketingflächen, die Sichtbarkeit schaffen." },
      { icon: "6", t: "Support-Struktur", d: "Prozesse für Retouren, Fälle und Kommunikation — damit du nicht allein stehst." },
    ],
    reachEyebrow: "Reichweite",
    reachTitle: "Europa ist dein Lagerregal — und dein Schaufenster.",
    reachLead:
      "Andertal verbindet unabhängige Verkäufer mit Käufern, die Qualität und Herkunft schätzen. Du listest einmal und verkaufst in einem kuratierten Marketplace.",
    stepsEyebrow: "In 4 Schritten",
    stepsTitle: "Vom Konto zum ersten Verkauf.",
    steps: [
      { t: "Registrieren", d: "Lege dein Verkäuferkonto in Sellercentral an — wenige Minuten, klare Angaben." },
      { t: "Shop vorbereiten", d: "Markeninfos, Standorte, Versandländer und Zahlungsdaten hinterlegen." },
      { t: "Produkte listen", d: "Varianten, Preise, Medien und Compliance-Felder pflegen — einzeln oder im Bulk." },
      { t: "Verkaufen & ausliefern", d: "Bestellungen annehmen, versenden, Trackings setzen — Auszahlung folgt dem Prozess." },
    ],
    deepEyebrow: "Im Detail",
    deepTitle: "Was dich bei Andertal wirklich weiterbringt.",
    deepItems: [
      { q: "Warum nicht nur einen eigenen Webshop?", a: "Ein eigener Shop braucht Traffic. Andertal bringt Marketplace-Nachfrage, Kategorie-Sichtbarkeit und gemeinsame Infrastruktur — du konzentrierst dich auf Produkt und Fulfillment." },
      { q: "Behalte ich Kontrolle über Marke und Preise?", a: "Ja. Du steuerst Katalog, Preise, Lager und Versandregeln. Der Marketplace liefert die Bühne und die Bestellpipeline." },
      { q: "Für wen ist Andertal geeignet?", a: "Für Marken, Händler und Hersteller, die EU-weit verkaufen wollen — vom Nischenprodukt bis zum Sortiment mit Varianten." },
      { q: "Wie schnell kann ich live gehen?", a: "Sobald Konto, Pflichtangaben und erste Produkte freigegeben sind. Viele Seller starten mit einem fokussierten Kernsortiment." },
      { q: "Was passiert nach der Bestellung?", a: "Du siehst die Order in Sellercentral, erzeugst Lieferschein/Label-Flows nach Setup und aktualisierst den Versandstatus für den Kunden." },
    ],
    typesEyebrow: "Seller-Profile",
    typesTitle: "Egal ob Marke, Manufaktur oder Händler.",
    types: [
      { id: "brand", label: "Marke", t: "Marke mit eigener Story", d: "Baue Präsenz mit Markenseite, konsistentem Look und direkten Käuferbeziehungen — ohne die Marketplace-Reichweite zu verlieren." },
      { id: "maker", label: "Manufaktur", t: "Manufaktur & Produzent", d: "Liste handgemachte oder EU-gefertigte Produkte mit klarer Herkunft — Käufer suchen genau das." },
      { id: "retail", label: "Händler", t: "Händler mit Sortiment", d: "Skaliere Varianten, Lager und Mehrländer-Versand. Bulk-Uploads und Vorlagen halten Tempo." },
    ],
    socialEyebrow: "Stimmen",
    socialTitle: "Seller, die den Kanal ernst nehmen.",
    quotes: [
      { q: "Endlich ein Marketplace, der sich wie ein richtiges Verkaufssystem anfühlt — nicht wie ein Basar.", n: "Lena M.", r: "Home & Living" },
      { q: "Sellercentral ist klar aufgebaut. Bestellungen und Versandstatus sind dort, wo sie sein müssen.", n: "Marco R.", r: "Elektronik-Zubehör" },
      { q: "Wir wollten EU-weit verkaufen, ohne fünf Shops zu pflegen. Andertal war der logische Schritt.", n: "Sofia K.", r: "Beauty & Care" },
    ],
    feesEyebrow: "Transparenz",
    feesTitle: "Du verkaufst. Die Logik bleibt nachvollziehbar.",
    feesLead: "Keine Startgebühr fürs Eröffnen. Marketplace-Anteil und Auszahlungsrhythmus sind so gedacht, dass du planen kannst.",
    fees: [
      { n: "0 €", t: "Shop eröffnen", d: "Registrierung und Start ohne Eintrittsgebühr." },
      { n: "Anteil", t: "pro Verkauf", d: "Marketplace-Gebühr erst, wenn Umsatz entsteht." },
      { n: "Rhythmus", t: "Auszahlung", d: "Nach Lieferung und klarer Freigabelogik." },
    ],
    faqEyebrow: "FAQ",
    faqTitle: "Häufige Fragen vor der Registrierung.",
    faq: [
      { q: "Kostet die Registrierung etwas?", a: "Nein — du eröffnest den Shop ohne Startgebühr. Kosten entstehen im Verkaufskontext über die Marketplace-Logik." },
      { q: "Brauche ich ein Gewerbe?", a: "Für den Verkauf gelten die üblichen rechtlichen Anforderungen deines Landes (Gewerbe, Steuern, Produktsicherheit). Sellercentral führt dich durch die benötigten Angaben." },
      { q: "Kann ich in mehreren Sprachen verkaufen?", a: "Ja. Produkte und Inhalte lassen sich mehrsprachig pflegen — der Shop bedient mehrere Locales." },
      { q: "Wie funktionieren Auszahlungen?", a: "Nach erfolgreicher Lieferung greift die Freigabelogik; Auszahlungen folgen dem festgelegten Rhythmus. Details siehst du in den Seller-Einstellungen." },
      { q: "Gibt es Integrationen?", a: "Sellercentral unterstützt gängige Seller-Workflows (u. a. Versand/ERP-Anbindungen je nach Setup). Starte lean und erweitere später." },
      { q: "Was, wenn ich Hilfe brauche?", a: "Über Support-Prozesse und Sellercentral-Dokumentation kommst du an die nächsten Schritte — inklusive Fallbearbeitung für Kundenanliegen." },
    ],
    toolsEyebrow: "Werkzeuge",
    toolsTitle: "Alles, was du täglich brauchst — an einem Ort.",
    toolsLead: "Katalog, Bestellungen, Analytics, Inhalte und Einstellungen. Weniger Tab-Chaos, mehr Verkaufsflow.",
    moreEyebrow: "Onboarding & Betrieb",
    moreTitle: "Noch Fragen zu Start, Versand und Compliance?",
    moreItems: [
      { q: "Welche Produktangaben sind Pflicht?", a: "Je nach Kategorie: Titel, Beschreibung, Preis, Medien, Varianten, EAN wo nötig sowie Compliance-Felder (z. B. Herkunft/Sicherheit). Das Formular zeigt, was fehlt." },
      { q: "Wie richte ich Versandländer ein?", a: "Unter Shipping/Locations legst du fest, wohin du lieferst und welche Adressen für Versand, Retoure und Rechnung gelten." },
      { q: "Kann ich bestehende Produkte importieren?", a: "Ja — über Bulk-Upload und Vorlagen. Ideal, wenn du schon ein PIM oder Tabellenkatalog hast." },
      { q: "Wie sichtbar werde ich in Kategorien?", a: "Sichtbarkeit entsteht über Katalogqualität, Preise, Verfügbarkeit und Performance in der jeweiligen Kategorie — plus kuratierte Flächen im Marketplace." },
      { q: "Was ist mit Retouren?", a: "Retouren laufen über klare Käufer- und Seller-Prozesse. Du hinterlegst Retourenadressen und bearbeitest Fälle im vorgesehenen Flow." },
      { q: "Darf ich Team-Zugänge anlegen?", a: "Rollen und Berechtigungen im Sellercentral erlauben Zusammenarbeit, ohne alles über ein Login zu teilen." },
    ],
    finalTitle: "Bereit, auf Andertal zu verkaufen?",
    finalLead: "Registriere dich jetzt. Richte deinen Shop ein. Liste dein erstes Produkt — und starte dort, wo Europa einkauft.",
    finalNote: "Weiter zur Registrierung in Sellercentral",
  };

  const en = {
    brand: "Andertal",
    heroTitle: "Sell where Europe shops.",
    heroLead:
      "Open your store on the Andertal Marketplace — clear tools, EU-wide reach, and a Sellercentral that scales with you.",
    ctaPrimary: "Become a seller",
    ctaSecondary: "See how it works",
    stats: [
      { n: "EU", l: "Markets with one registration" },
      { n: "€0", l: "Store opening fee" },
      { n: "14 days", l: "Payout logic after delivery" },
      { n: "24/7", l: "Sellercentral & order flow" },
    ],
    whyEyebrow: "Why Andertal",
    whyTitle: "More than a shop. A European sales channel.",
    whyLead: "We run the marketplace so you can list, fulfill, and get paid — without rebuilding commerce from scratch.",
    features: [
      { icon: "1", t: "Your storefront", d: "Brand presence inside the marketplace — products, brand page, and reviews in one place." },
      { icon: "2", t: "EU customers", d: "Reach buyers across countries without running a separate shop for each market." },
      { icon: "3", t: "Sellercentral", d: "Orders, inventory, shipping, content, and analytics in one calm workspace." },
      { icon: "4", t: "Clear fees", d: "Transparent marketplace economics — you know what remains after sale and delivery." },
      { icon: "5", t: "Growth surfaces", d: "Categories, collections, badges, and marketing placements that create visibility." },
      { icon: "6", t: "Support structure", d: "Returns and case flows so customer issues don’t live only in your inbox." },
    ],
    reachEyebrow: "Reach",
    reachTitle: "Europe is your shelf — and your storefront.",
    reachLead:
      "Andertal connects independent sellers with buyers who care about quality and origin. List once, sell in a curated marketplace.",
    stepsEyebrow: "4 steps",
    stepsTitle: "From account to first sale.",
    steps: [
      { t: "Register", d: "Create your seller account in Sellercentral — minutes, not months." },
      { t: "Prepare the shop", d: "Add brand details, locations, shipping countries, and payout data." },
      { t: "List products", d: "Variants, prices, media, and compliance fields — one by one or in bulk." },
      { t: "Sell & ship", d: "Accept orders, ship, add tracking — payouts follow the delivery logic." },
    ],
    deepEyebrow: "In depth",
    deepTitle: "What actually moves the needle on Andertal.",
    deepItems: [
      { q: "Why not only run my own webshop?", a: "Your own shop needs traffic. Andertal brings marketplace demand, category visibility, and shared infrastructure — you focus on product and fulfillment." },
      { q: "Do I keep control of brand and pricing?", a: "Yes. You control catalog, prices, stock, and shipping rules. The marketplace provides the stage and the order pipeline." },
      { q: "Who is Andertal for?", a: "Brands, makers, and merchants who want to sell across the EU — from niche products to large variant catalogs." },
      { q: "How fast can I go live?", a: "Once your account, required details, and first products are ready. Many sellers start with a focused core assortment." },
      { q: "What happens after an order?", a: "You see it in Sellercentral, fulfill, and update shipping status so the customer stays informed." },
    ],
    typesEyebrow: "Seller profiles",
    typesTitle: "Brand, atelier, or retailer — fit the channel.",
    types: [
      { id: "brand", label: "Brand", t: "Brand with a story", d: "Build presence with a brand page and consistent merchandising — without giving up marketplace reach." },
      { id: "maker", label: "Maker", t: "Atelier & producer", d: "List handcrafted or EU-made goods with clear origin — buyers come looking for that." },
      { id: "retail", label: "Retailer", t: "Assortment merchant", d: "Scale variants, stock, and multi-country shipping. Bulk uploads keep the pace." },
    ],
    socialEyebrow: "Voices",
    socialTitle: "Sellers who treat this as a real channel.",
    quotes: [
      { q: "Finally a marketplace that feels like a sales system — not a flea market.", n: "Lena M.", r: "Home & Living" },
      { q: "Sellercentral is clear. Orders and shipping status live where they should.", n: "Marco R.", r: "Electronics accessories" },
      { q: "We wanted EU reach without five separate shops. Andertal was the logical move.", n: "Sofia K.", r: "Beauty & Care" },
    ],
    feesEyebrow: "Transparency",
    feesTitle: "You sell. The economics stay readable.",
    feesLead: "No opening fee. Marketplace share and payout rhythm are designed so you can plan.",
    fees: [
      { n: "€0", t: "Open a shop", d: "Register and start without an entry fee." },
      { n: "Share", t: "per sale", d: "Marketplace fee when revenue happens." },
      { n: "Cadence", t: "Payouts", d: "After delivery and clear release logic." },
    ],
    faqEyebrow: "FAQ",
    faqTitle: "Common questions before you register.",
    faq: [
      { q: "Does registration cost anything?", a: "No — opening the shop has no start fee. Costs appear in the sales context via marketplace logic." },
      { q: "Do I need a registered business?", a: "Usual legal requirements of your country apply (trade registration, tax, product safety). Sellercentral guides the required fields." },
      { q: "Can I sell in multiple languages?", a: "Yes. Product and content fields support multiple locales across the shop." },
      { q: "How do payouts work?", a: "After successful delivery, release logic applies; payouts follow the defined rhythm. Details live in seller settings." },
      { q: "Are there integrations?", a: "Sellercentral supports common seller workflows (shipping/ERP depending on setup). Start lean, extend later." },
      { q: "What if I need help?", a: "Support processes and Sellercentral docs cover next steps — including case handling for customer issues." },
    ],
    toolsEyebrow: "Tools",
    toolsTitle: "Everything you need daily — in one place.",
    toolsLead: "Catalog, orders, analytics, content, and settings. Less tab chaos, more selling flow.",
    moreEyebrow: "Onboarding & ops",
    moreTitle: "More on start, shipping, and compliance.",
    moreItems: [
      { q: "Which product fields are required?", a: "Depending on category: title, description, price, media, variants, EAN where needed, plus compliance fields. The form shows what’s missing." },
      { q: "How do I set shipping countries?", a: "Under Shipping/Locations you choose where you deliver and which addresses cover ship-from, returns, and billing." },
      { q: "Can I import existing products?", a: "Yes — bulk upload and templates help if you already have a PIM or spreadsheet catalog." },
      { q: "How do I get visible in categories?", a: "Visibility comes from catalog quality, price, availability, and performance — plus curated marketplace placements." },
      { q: "What about returns?", a: "Returns follow clear buyer/seller flows. You set return addresses and handle cases in the intended process." },
      { q: "Can I add team access?", a: "Roles and permissions in Sellercentral let your team collaborate without sharing one login." },
    ],
    finalTitle: "Ready to sell on Andertal?",
    finalLead: "Register now. Set up your shop. List your first product — and start where Europe shops.",
    finalNote: "Continue to Sellercentral registration",
  };

  const tr = {
    ...en,
    heroTitle: "Avrupa’nın alışveriş yaptığı yerde sat.",
    heroLead: "Andertal Marketplace’te mağazanı aç — net araçlar, AB erişimi ve seninle büyüyen Sellercentral.",
    ctaPrimary: "Satıcı ol",
    ctaSecondary: "Nasıl çalışır?",
    whyTitle: "Sadece bir mağaza değil. Avrupa satış kanalı.",
    stepsTitle: "Hesaptan ilk satışa.",
    faqTitle: "Kayıttan önce sık sorulanlar.",
    finalTitle: "Andertal’de satmaya hazır mısın?",
    finalLead: "Şimdi kaydol. Mağazanı kur. İlk ürününü listele.",
  };

  const fr = {
    ...en,
    heroTitle: "Vendez là où l’Europe achète.",
    heroLead: "Ouvrez votre boutique sur Andertal — outils clairs, portée UE et Sellercentral évolutif.",
    ctaPrimary: "Devenir vendeur",
    ctaSecondary: "Voir le fonctionnement",
    whyTitle: "Plus qu’une boutique. Un canal européen.",
    stepsTitle: "Du compte à la première vente.",
    faqTitle: "Questions avant l’inscription.",
    finalTitle: "Prêt à vendre sur Andertal ?",
    finalLead: "Inscrivez-vous, configurez la boutique, listez votre premier produit.",
  };

  const es = {
    ...en,
    heroTitle: "Vende donde compra Europa.",
    heroLead: "Abre tu tienda en Andertal — herramientas claras, alcance UE y Sellercentral que escala contigo.",
    ctaPrimary: "Hazte vendedor",
    ctaSecondary: "Cómo funciona",
    whyTitle: "Más que una tienda. Un canal europeo.",
    stepsTitle: "De la cuenta a la primera venta.",
    faqTitle: "Preguntas antes de registrarte.",
    finalTitle: "¿Listo para vender en Andertal?",
    finalLead: "Regístrate, configura tu tienda y publica tu primer producto.",
  };

  const it = {
    ...en,
    heroTitle: "Vendi dove compra l’Europa.",
    heroLead: "Apri il tuo shop su Andertal — strumenti chiari, portata UE e Sellercentral che cresce con te.",
    ctaPrimary: "Diventa venditore",
    ctaSecondary: "Come funziona",
    whyTitle: "Più di uno shop. Un canale europeo.",
    stepsTitle: "Dall’account alla prima vendita.",
    faqTitle: "Domande prima della registrazione.",
    finalTitle: "Pronto a vendere su Andertal?",
    finalLead: "Registrati, configura lo shop e pubblica il primo prodotto.",
  };

  return pick({ de, en, tr, fr, es, it }, locale);
}

function ltField(obj, field, locale) {
  if (!obj) return "";
  if (!locale || locale === "de") return obj?.[field] ?? "";
  return obj?._i18n?.[locale]?.[field] ?? obj?.[field] ?? "";
}

function assetField(obj, field, locale) {
  return String(ltField(obj, field, locale) || obj?.[field] || "").trim();
}

function ofType(list, type) {
  return list.filter((c) => c?.type === type);
}

/** Overlay CMS landing containers onto the visual template defaults (1:1 section layout). */
function mergeBecomeSellerFromContainers(base, containers, locale) {
  const out = {
    ...base,
    stats: [...base.stats],
    features: [...base.features],
    steps: [...base.steps],
    deepItems: [...base.deepItems],
    types: [...base.types],
    quotes: [...base.quotes],
    fees: [...base.fees],
    faq: [...base.faq],
    moreItems: [...base.moreItems],
  };
  if (!Array.isArray(containers) || containers.length === 0) return out;

  const list = containers.filter((c) => c && c.visible !== false);
  const heroes = ofType(list, "hero_banner");
  const grids = ofType(list, "feature_grid");
  const imageTexts = ofType(list, "image_text");
  const textBlocks = ofType(list, "text_block");
  const accordions = ofType(list, "accordion");
  const tabsBlocks = ofType(list, "tabs");
  const testimonials = ofType(list, "testimonials");
  const banners = ofType(list, "banner_cta");
  const mosaics = ofType(list, "content_mosaic");

  const hero = heroes[0];
  if (hero) {
    const slide = Array.isArray(hero.slides) && hero.slides[0] ? hero.slides[0] : hero;
    const title = ltField(slide, "title", locale) || ltField(hero, "title", locale);
    const lead = ltField(slide, "subtitle", locale) || ltField(hero, "subtitle", locale) || ltField(hero, "body", locale);
    const cta = ltField(slide, "btn_text", locale) || ltField(hero, "btn_text", locale);
    const img = assetField(slide, "image", locale) || assetField(slide, "image_url", locale) || assetField(hero, "image", locale);
    const url = ltField(slide, "btn_url", locale) || ltField(hero, "btn_url", locale) || slide.btn_url || hero.btn_url;
    if (title) out.heroTitle = title;
    if (lead) out.heroLead = lead;
    if (cta) out.ctaPrimary = cta;
    if (img) out.heroImage = img;
    if (url) out.registerUrl = url;
  }

  // grids[0]=stats, grids[1]=why, grids[2]=fees (seed v3)
  const statsGrid = grids[0];
  if (statsGrid?.items?.length) {
    out.stats = statsGrid.items.map((it) => ({
      n: ltField(it, "title", locale) || it.icon || "",
      l: ltField(it, "description", locale) || "",
    })).filter((s) => s.n || s.l);
    if (!out.stats.length) out.stats = base.stats;
  }

  const whyGrid = grids[1];
  if (whyGrid) {
    const t = ltField(whyGrid, "title", locale);
    const sub = ltField(whyGrid, "subtitle", locale);
    if (t) out.whyEyebrow = t;
    if (sub) out.whyTitle = sub;
    if (whyGrid.items?.length) {
      out.features = whyGrid.items.map((it, i) => ({
        icon: String(it.icon || i + 1),
        t: ltField(it, "title", locale) || "",
        d: ltField(it, "description", locale) || "",
      })).filter((f) => f.t);
      if (!out.features.length) out.features = base.features;
    }
  }

  const reach = imageTexts[0];
  if (reach) {
    const t = ltField(reach, "title", locale);
    const body = ltField(reach, "body", locale) || ltField(reach, "subtitle", locale);
    const img = assetField(reach, "image", locale) || assetField(reach, "image_url", locale);
    if (t) out.reachTitle = t;
    if (body) out.reachLead = body;
    if (img) out.reachImage = img;
    const cta = ltField(reach, "btn_text", locale);
    if (cta) out.ctaPrimary = cta;
    const url = ltField(reach, "btn_url", locale) || reach.btn_url;
    if (url) out.registerUrl = url;
  }

  const stepsBlock = textBlocks[0];
  if (stepsBlock) {
    const t = ltField(stepsBlock, "title", locale);
    if (t) out.stepsTitle = t;
    const body = ltField(stepsBlock, "body", locale);
    if (body && /<li[\s>]/i.test(body)) {
      const parts = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
      const parsed = parts.map((html) => {
        const strong = html.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
        const title = strong ? strong[1].replace(/<[^>]+>/g, "").trim() : "";
        const rest = html.replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, "").replace(/<[^>]+>/g, " ").replace(/^[\s—\-–:]+/, "").trim();
        return { t: title || rest.slice(0, 40), d: rest || title };
      }).filter((s) => s.t);
      if (parsed.length) out.steps = parsed;
    }
  }

  if (accordions[0]?.items?.length) {
    const t = ltField(accordions[0], "title", locale);
    if (t) out.deepTitle = t;
    out.deepItems = accordions[0].items.map((it) => ({
      q: ltField(it, "question", locale) || ltField(it, "title", locale) || "",
      a: ltField(it, "answer", locale) || ltField(it, "body", locale) || "",
    })).filter((x) => x.q);
    if (!out.deepItems.length) out.deepItems = base.deepItems;
  }

  const tabsC = tabsBlocks[0];
  if (tabsC?.tabs?.length) {
    const t = ltField(tabsC, "title", locale);
    if (t) out.typesTitle = t;
    out.types = tabsC.tabs.map((tab, i) => {
      const label = ltField(tab, "label", locale) || `Tab ${i + 1}`;
      const content = ltField(tab, "content", locale) || "";
      return {
        id: tab.id || `t${i}`,
        label,
        t: ltField(tab, "title", locale) || label,
        d: content,
      };
    });
  }

  const social = testimonials[0];
  if (social?.items?.length) {
    const t = ltField(social, "title", locale);
    if (t) out.socialTitle = t;
    out.quotes = social.items.map((it) => ({
      q: ltField(it, "quote", locale) || "",
      n: ltField(it, "name", locale) || "",
      r: ltField(it, "role", locale) || "",
    })).filter((q) => q.q);
    if (!out.quotes.length) out.quotes = base.quotes;
  }

  const feesGrid = grids[2];
  if (feesGrid) {
    const t = ltField(feesGrid, "title", locale);
    const lead = ltField(feesGrid, "subtitle", locale);
    if (t) out.feesTitle = t;
    if (lead) out.feesLead = lead;
    if (feesGrid.items?.length) {
      out.fees = feesGrid.items.map((it) => ({
        n: String(it.icon || ltField(it, "title", locale) || ""),
        t: ltField(it, "title", locale) || "",
        d: ltField(it, "description", locale) || "",
      })).filter((f) => f.t || f.n);
      if (!out.fees.length) out.fees = base.fees;
    }
  } else if (banners[0] && banners.length > 1) {
    // legacy mid/fees banner
    const feesBanner = banners[banners.length > 2 ? 1 : 0];
    const t = ltField(feesBanner, "title", locale);
    const lead = ltField(feesBanner, "subtitle", locale);
    if (t) out.feesTitle = t;
    if (lead) out.feesLead = lead;
  }

  if (accordions[1]?.items?.length) {
    const t = ltField(accordions[1], "title", locale);
    if (t) out.faqTitle = t;
    out.faq = accordions[1].items.map((it) => ({
      q: ltField(it, "question", locale) || "",
      a: ltField(it, "answer", locale) || "",
    })).filter((x) => x.q);
    if (!out.faq.length) out.faq = base.faq;
  }

  const toolsMosaic = mosaics[0];
  const toolsImg = imageTexts[1];
  if (toolsMosaic) {
    const t = ltField(toolsMosaic, "title", locale);
    const lead = ltField(toolsMosaic, "subtitle", locale) || ltField(toolsMosaic, "body", locale);
    if (t) out.toolsTitle = t;
    if (lead) out.toolsLead = lead;
    const imgs = (toolsMosaic.images || [])
      .map((im) => assetField(im, "url", locale) || assetField(im, "image", locale))
      .filter(Boolean);
    if (imgs.length) out.mosaicImages = imgs;
  } else if (toolsImg) {
    const t = ltField(toolsImg, "title", locale);
    const body = ltField(toolsImg, "body", locale);
    if (t) out.toolsTitle = t;
    if (body) out.toolsLead = body;
    const img = assetField(toolsImg, "image", locale);
    if (img) out.mosaicImages = [img, IMG.mosaic2, IMG.mosaic3];
  }

  if (accordions[2]?.items?.length) {
    const t = ltField(accordions[2], "title", locale);
    if (t) out.moreTitle = t;
    out.moreItems = accordions[2].items.map((it) => ({
      q: ltField(it, "question", locale) || "",
      a: ltField(it, "answer", locale) || "",
    })).filter((x) => x.q);
    if (!out.moreItems.length) out.moreItems = base.moreItems;
  }

  const finalCta = banners[banners.length - 1];
  if (finalCta) {
    const t = ltField(finalCta, "title", locale);
    const lead = ltField(finalCta, "subtitle", locale);
    const cta = ltField(finalCta, "btn_text", locale);
    const url = ltField(finalCta, "btn_url", locale) || finalCta.btn_url;
    if (t) out.finalTitle = t;
    if (lead) out.finalLead = lead;
    if (cta) out.ctaPrimary = cta;
    if (url) out.registerUrl = url;
  }

  return out;
}

export default function BecomeSellerLanding({ containers } = {}) {
  const locale = useLocale();
  const base = copyFor(locale);
  const c = mergeBecomeSellerFromContainers(base, containers, locale);
  const register = registerUrl(locale);
  const rootRef = useReveal();
  const [typeIdx, setTypeIdx] = useState(0);
  const activeType = c.types[typeIdx] || c.types[0];
  const heroImg = c.heroImage || IMG.hero;
  const reachImg = c.reachImage || IMG.eu;
  const mosaicImgs = c.mosaicImages?.length >= 3 ? c.mosaicImages : [IMG.mosaic1, IMG.mosaic2, IMG.mosaic3];

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const existing = document.querySelector(`link[data-become-seller-fonts="1"]`);
    if (existing) return undefined;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    link.setAttribute("data-become-seller-fonts", "1");
    document.head.appendChild(link);
    return undefined;
  }, []);

  return (
    <div className={styles.root} ref={rootRef} data-become-seller-landing="1">
      {/* 1 Hero */}
      <section className={styles.hero} aria-label={c.brand}>
        <div className={styles.heroMedia} aria-hidden>
          <img src={heroImg} alt="" />
        </div>
        <div className={styles.heroShade} />
        <div className={styles.heroGrain} />
        <div className={styles.heroInner}>
          <p className={styles.brandMark}>{c.brand}</p>
          <h1 className={styles.heroTitle}>{c.heroTitle}</h1>
          <p className={styles.heroLead}>{c.heroLead}</p>
          <div className={styles.ctaRow}>
            <a className={styles.btnPrimary} href={c.registerUrl || register}>
              {c.ctaPrimary}
            </a>
            <a className={styles.btnGhost} href="#how">
              {c.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      {/* 2 Stats — side-by-side infographics */}
      <section className={styles.stats} aria-label="Highlights">
        <div className={`${styles.statsGrid} ${styles.reveal}`}>
          {c.stats.map((s) => (
            <div key={s.l} className={styles.statItem}>
              <strong>{s.n}</strong>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Why / features */}
      <section className={`${styles.section} ${styles.features}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.whyEyebrow}</p>
          <h2 className={styles.h2}>{c.whyTitle}</h2>
          <p className={styles.lead}>{c.whyLead}</p>
          <div className={styles.featGrid}>
            {c.features.map((f) => (
              <article key={f.t} className={styles.featCard}>
                <div className={styles.featIcon}>{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4 Reach split */}
      <section className={styles.section}>
        <div className={`${styles.inner} ${styles.split} ${styles.reveal}`}>
          <div className={styles.splitCopy}>
            <p className={styles.eyebrow}>{c.reachEyebrow}</p>
            <h2 className={styles.h2}>{c.reachTitle}</h2>
            <p className={styles.lead}>{c.reachLead}</p>
            <div className={styles.ctaRow}>
              <a className={styles.btnPrimary} href={c.registerUrl || register}>
                {c.ctaPrimary}
              </a>
            </div>
          </div>
          <div className={styles.splitMedia}>
            <img src={reachImg} alt="" />
            <span className={styles.splitAccent} />
          </div>
        </div>
      </section>

      {/* 5 Steps */}
      <section className={`${styles.section} ${styles.steps}`} id="how">
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.stepsEyebrow}</p>
          <h2 className={styles.h2}>{c.stepsTitle}</h2>
          <div className={styles.stepList}>
            {c.steps.map((s, i) => (
              <div key={s.t} className={styles.stepRow}>
                <div className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6 Deep accordion */}
      <section className={`${styles.section} ${styles.darkBand}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.deepEyebrow}</p>
          <h2 className={styles.h2}>{c.deepTitle}</h2>
          <Accordion items={c.deepItems} dark />
        </div>
      </section>

      {/* 7 Seller types */}
      <section className={styles.section}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.typesEyebrow}</p>
          <h2 className={styles.h2}>{c.typesTitle}</h2>
          <div className={styles.tabs} role="tablist">
            {c.types.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={i === typeIdx}
                className={`${styles.tabBtn}${i === typeIdx ? ` ${styles.active}` : ""}`}
                onClick={() => setTypeIdx(i)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.tabBody} role="tabpanel">
            <h3>{activeType.t}</h3>
            <p>{activeType.d}</p>
            <div className={styles.ctaRow}>
              <a className={styles.btnPrimary} href={c.registerUrl || register}>
                {c.ctaPrimary}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 8 Testimonials */}
      <section className={`${styles.section} ${styles.features}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.socialEyebrow}</p>
          <h2 className={styles.h2}>{c.socialTitle}</h2>
          <div className={styles.quoteGrid}>
            {c.quotes.map((q) => (
              <blockquote key={q.n} className={styles.quote}>
                <p>“{q.q}”</p>
                <footer>
                  <strong>{q.n}</strong>
                  {q.r}
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* 9 Fees */}
      <section className={`${styles.section} ${styles.darkBand}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.feesEyebrow}</p>
          <h2 className={styles.h2}>{c.feesTitle}</h2>
          <p className={styles.lead}>{c.feesLead}</p>
          <div className={styles.priceGrid}>
            {c.fees.map((f) => (
              <article key={f.t} className={styles.priceCard}>
                <strong>{f.n}</strong>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
          <div className={styles.ctaRow}>
            <a className={styles.btnPrimary} href={c.registerUrl || register}>
              {c.ctaPrimary}
            </a>
          </div>
        </div>
      </section>

      {/* 10 FAQ accordion */}
      <section className={styles.section}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.faqEyebrow}</p>
          <h2 className={styles.h2}>{c.faqTitle}</h2>
          <Accordion items={c.faq} />
        </div>
      </section>

      {/* 11 Tools mosaic */}
      <section className={`${styles.section} ${styles.steps}`}>
        <div className={`${styles.inner} ${styles.split} ${styles.reverse} ${styles.reveal}`}>
          <div className={styles.mosaic} aria-hidden>
            <figure>
              <img src={mosaicImgs[0]} alt="" />
            </figure>
            <figure>
              <img src={mosaicImgs[1]} alt="" />
            </figure>
            <figure>
              <img src={mosaicImgs[2]} alt="" />
            </figure>
          </div>
          <div className={styles.splitCopy}>
            <p className={styles.eyebrow}>{c.toolsEyebrow}</p>
            <h2 className={styles.h2}>{c.toolsTitle}</h2>
            <p className={styles.lead}>{c.toolsLead}</p>
            <div className={styles.ctaRow}>
              <a className={styles.btnPrimary} href={c.registerUrl || register}>
                {c.ctaPrimary}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 12 More accordion */}
      <section className={`${styles.section} ${styles.darkBand}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.moreEyebrow}</p>
          <h2 className={styles.h2}>{c.moreTitle}</h2>
          <Accordion items={c.moreItems} dark />
          <div className={styles.ctaRow}>
            <a className={styles.btnPrimary} href={c.registerUrl || register}>
              {c.ctaPrimary}
            </a>
          </div>
        </div>
      </section>

      {/* 13 Final CTA */}
      <section className={`${styles.section} ${styles.final}`}>
        <div className={`${styles.inner} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{c.finalNote}</p>
          <h2 className={styles.h2}>{c.finalTitle}</h2>
          <p className={styles.lead}>{c.finalLead}</p>
          <div className={styles.ctaRow}>
            <a className={styles.btnPrimary} href={c.registerUrl || register}>
              {c.ctaPrimary}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export const BECOME_SELLER_PAGE_SLUGS = new Set(["verkaeufer-werden", "become-a-seller"]);
export const BECOME_SELLER_LAYOUT_PREFIX = "become_seller";

