/**
 * Content for the SellerCentral help center (/help). Each article's body is locale-keyed;
 * DE and EN are the full authored languages — other UI locales fall back to EN, then DE
 * (see helpLocaleContent() in HelpCenterPage.jsx / HelpArticlePage.jsx), so the page never
 * renders empty. Superuser-only articles are hidden from regular sellers by the `superuserOnly`
 * flag, mirroring the same flag used in the main nav (PolarisLayout.jsx).
 */

export const HELP_CATEGORIES = [
  { id: "start", label: { de: "Erste Schritte", en: "Getting Started" }, icon: "🚀" },
  { id: "produkte", label: { de: "Produkte", en: "Products" }, icon: "📦" },
  { id: "verkauf", label: { de: "Verkauf & Kunden", en: "Selling & Customers" }, icon: "🛒" },
  { id: "finanzen", label: { de: "Finanzen & Recht", en: "Finance & Legal" }, icon: "💶" },
  { id: "konto", label: { de: "Konto & Inhalte", en: "Account & Content" }, icon: "⚙️" },
];

export const HELP_ARTICLES = [
  {
    slug: "erste-schritte",
    category: "start",
    icon: "🚀",
    title: { de: "Erste Schritte: Zulassung als Verkäufer", en: "Getting started: seller approval" },
    summary: {
      de: "Was du direkt nach der Registrierung erledigen musst, bevor dein Konto verkaufsbereit ist.",
      en: "What to complete right after registration before your account can start selling.",
    },
    body: {
      de: [
        { type: "p", text: "Nach der Registrierung ist dein Konto zunächst nicht freigeschaltet. Bevor du Produkte verkaufen kannst, müssen mehrere Pflichtangaben vollständig sein — das ist keine Schikane, sondern gesetzlich vorgeschrieben (Marktplatzhaftungsgesetz)." },
        { type: "h2", text: "Pflichtangaben vor Verkaufsstart" },
        { type: "ul", items: [
          "USt-IdNr. (Umsatzsteuer-Identifikationsnummer) — wird geprüft, bevor dein Konto als 'genehmigt' gilt.",
          "EPR-/LUCID-Registrierungsnummer (Verpackungsregister) — Pflicht, wenn du verpackte Ware nach Deutschland verkaufst.",
          "IBAN für Auszahlungen — ohne gültige IBAN kann dir keine Provisionsabrechnung ausgezahlt werden.",
          "Kreditkarte für Plattformgebühren — hierüber werden ggf. Gebühren/Provisionen belastet.",
          "Standorte (Standorte-Seite in den Einstellungen): Versand-, Retouren- und Rechnungsadresse.",
        ]},
        { type: "note", variant: "info", text: "Solange eine dieser Angaben fehlt, siehst du im Dashboard eine To-do-Liste mit den offenen Punkten. Erst wenn alles vollständig ist, wechselt dein Status auf 'aktiv'." },
        { type: "h2", text: "Status deines Kontos" },
        { type: "p", text: "Dein Konto durchläuft die Stadien: registriert → Verifizierung ausstehend → Dokumente eingereicht → geprüft/genehmigt (oder abgelehnt). Den aktuellen Status siehst du oben im Dashboard als Banner." },
        { type: "h2", text: "Danach: die ersten Produkte anlegen" },
        { type: "p", text: "Sobald dein Konto aktiv ist, kannst du unter Produkte → Inventar dein erstes Produkt anlegen. Details dazu findest du im Artikel 'Produkte anlegen & Varianten'." },
      ],
      en: [
        { type: "p", text: "Right after registration your account is not yet live. Before you can sell, several mandatory items must be completed — this isn't bureaucracy for its own sake, it's required by German marketplace-liability law." },
        { type: "h2", text: "Mandatory items before you can sell" },
        { type: "ul", items: [
          "VAT ID (USt-IdNr.) — verified before your account counts as 'approved'.",
          "EPR/LUCID packaging-registration number — required if you ship packaged goods into Germany.",
          "IBAN for payouts — without a valid IBAN, commission settlements can't be paid out to you.",
          "Credit card for platform fees — used to charge fees/commission where applicable.",
          "Locations (Settings → Locations): shipping, returns, and invoice addresses.",
        ]},
        { type: "note", variant: "info", text: "As long as any of these are missing, your dashboard shows a to-do list of open items. Your status only switches to 'active' once everything is complete." },
        { type: "h2", text: "Your account status" },
        { type: "p", text: "Accounts move through: registered → verification pending → documents submitted → reviewed/approved (or rejected). The current status is shown as a banner at the top of your dashboard." },
        { type: "h2", text: "Next: list your first products" },
        { type: "p", text: "Once your account is active, go to Products → Inventory to create your first product. See the 'Creating products & variants' article for details." },
      ],
    },
  },
  {
    slug: "produkte-anlegen",
    category: "produkte",
    icon: "📦",
    title: { de: "Produkte anlegen & Varianten", en: "Creating products & variants" },
    summary: {
      de: "Die 4 Reiter der Produktseite (Allgemein, Spezifikationen, Variante, Rechtlich) und wie Varianten funktionieren.",
      en: "The 4 tabs of the product page (General, Specifications, Variants, Legal) and how variants work.",
    },
    body: {
      de: [
        { type: "p", text: "Jede Produktseite ist in vier Reiter aufgeteilt, damit du nicht durch eine endlose Formularseite scrollen musst." },
        { type: "h2", text: "Allgemein" },
        { type: "p", text: "Status, Produktname, SKU/EAN, Beschreibung, Shop-Zuordnung (Kategorien), Preis (Verkaufspreis, Angebotspreis, UVP), Lagerbestand, Mindestbestellmenge und Bilder." },
        { type: "h2", text: "Spezifikationen" },
        { type: "p", text: "Maße & Verpackung (Breite, Höhe, Länge, Gewicht, Verkaufseinheit, Maßeinheit, Verpackungseinheit) sowie Eigenschaften (früher 'Metadaten' genannt) — das sind wiederverwendbare Attribute wie Material oder Farbe. Über die Suche kannst du bestehende Eigenschaften zuordnen; fehlt eine, kannst du eine neue vorschlagen (der Superuser wird automatisch benachrichtigt)." },
        { type: "h2", text: "Variante" },
        { type: "p", text: "Hier legst du Varianten an (z. B. Farbe/Größe), basierend auf den Eigenschaften aus dem Metaobjects-Bereich. Für jede Variante kannst du Werte einzeln setzen — oder per Schloss-Symbol festlegen, dass ein Feld automatisch den Wert vom Hauptartikel übernimmt und gesperrt bleibt. Entsperrst du es wieder, bleibt der zuletzt übernommene Wert erhalten, wird aber wieder editierbar." },
        { type: "h2", text: "Rechtlich" },
        { type: "p", text: "Alle gesetzlich vorgeschriebenen Angaben an einem Ort: GPSR (Produktsicherheit — Hersteller, Verantwortliche Person in der EU, Sicherheitshinweise), WEEE-Registrierung bei Elektrogeräten, EPREL-Energielabel wo zutreffend." },
        { type: "note", variant: "warning", text: "Ohne vollständige GPSR-Angaben kann ein Produkt nicht veröffentlicht werden, sobald es unter die entsprechende Produktkategorie fällt — das ist eine EU-weite Pflicht seit Dezember 2024." },
        { type: "h2", text: "Länderspezifische Preise" },
        { type: "p", text: "Im Reiter 'Allgemein' kannst du für jedes Land, in das du lieferst, einen eigenen Brutto-Preis hinterlegen. Der Checkout verwendet automatisch den Preis des jeweiligen Ziellandes und berechnet die dort geltende Mehrwertsteuer korrekt heraus — du musst nichts manuell umrechnen. Ohne länderspezifischen Preis wird der DE-Preis verwendet." },
      ],
      en: [
        { type: "p", text: "Every product page is split into four tabs so you don't have to scroll through one endless form." },
        { type: "h2", text: "General" },
        { type: "p", text: "Status, product name, SKU/EAN, description, shop assignment (categories), pricing (sale price, offer price, RRP), stock, minimum order quantity, and images." },
        { type: "h2", text: "Specifications" },
        { type: "p", text: "Dimensions & packaging (width, height, length, weight, sales unit, unit of measure, packaging unit) plus Properties (formerly called 'metadata') — reusable attributes like material or color. Search to attach an existing property; if none fits, you can suggest a new one (the superuser is notified automatically)." },
        { type: "h2", text: "Variants" },
        { type: "p", text: "Create variants (e.g. color/size) based on the properties from the metaobjects area. Each variant's fields can be set individually — or locked with a padlock icon to always mirror the parent product's value. Unlocking keeps the last copied value but makes it editable again." },
        { type: "h2", text: "Legal" },
        { type: "p", text: "All legally required data in one place: GPSR (product safety — manufacturer, EU responsible person, safety warnings), WEEE registration for electronics, EPREL energy labels where applicable." },
        { type: "note", variant: "warning", text: "A product can't be published without complete GPSR data once it falls under the relevant product category — this has been an EU-wide requirement since December 2024." },
        { type: "h2", text: "Per-country pricing" },
        { type: "p", text: "On the 'General' tab you can set a separate gross price for every country you ship to. Checkout automatically uses the price for the customer's destination country and correctly extracts that country's VAT — no manual conversion needed. Without a country-specific price, the DE price is used as fallback." },
      ],
    },
  },
  {
    slug: "preise-rabatte-mwst",
    category: "produkte",
    icon: "💰",
    title: { de: "Preise, Rabatte & Mehrwertsteuer", en: "Pricing, discounts & VAT" },
    summary: {
      de: "Wie Verkaufspreis, UVP und Rabatt zusammenspielen, und wie die Mehrwertsteuer pro Zielland berechnet wird.",
      en: "How sale price, RRP, and discounts interact, and how VAT is calculated per destination country.",
    },
    body: {
      de: [
        { type: "h2", text: "Drei Preisfelder" },
        { type: "ul", items: [
          "Verkaufspreis — der reguläre Preis, den Kunden zahlen.",
          "UVP (unverbindliche Preisempfehlung) — optional, wird durchgestrichen neben dem Verkaufspreis angezeigt.",
          "Angebotspreis — optional, wenn gesetzt und niedriger als der Verkaufspreis, erscheint im Shop ein roter Rabatt-Ballon mit dem Prozentsatz.",
        ]},
        { type: "h2", text: "Mehrwertsteuer ist immer im Preis enthalten" },
        { type: "p", text: "Alle Preise, die du einträgst, sind Bruttopreise (inkl. MwSt.). Auf der Rechnung wird automatisch nach Netto und MwSt. aufgeschlüsselt — mit dem Steuersatz des jeweiligen Ziellandes (z. B. 19 % für Deutschland, 20 % für Frankreich). Du musst diesen Split nicht selbst berechnen." },
        { type: "h2", text: "Kleinunternehmer-Regelung" },
        { type: "p", text: "Hast du keine USt-IdNr. hinterlegt, wird deine Rechnung automatisch als umsatzsteuerbefreit (§19 UStG) ausgestellt." },
        { type: "h2", text: "B2B-Verkäufe innerhalb der EU" },
        { type: "p", text: "Wenn ein Geschäftskunde in einem anderen EU-Land eine gültige USt-IdNr. hinterlegt hat, greift automatisch das Reverse-Charge-Verfahren (0 % MwSt., Steuerschuldnerschaft des Empfängers) — die USt-IdNr. wird dabei live gegen die EU-Datenbank VIES geprüft." },
        { type: "h2", text: "Gutscheine/Rabattcodes" },
        { type: "p", text: "Gutscheine (Coupons) reduzieren den zu versteuernden Betrag tatsächlich — sie erscheinen als eigene Abzugsposition auf der Rechnung und die MwSt. wird auf den rabattierten Betrag berechnet." },
        { type: "note", variant: "info", text: "Bonuspunkte sind KEIN Rabatt in diesem Sinne — siehe eigener Artikel 'Bonuspunkte-Programm'." },
      ],
      en: [
        { type: "h2", text: "Three price fields" },
        { type: "ul", items: [
          "Sale price — the regular price customers pay.",
          "RRP (recommended retail price) — optional, shown struck through next to the sale price.",
          "Offer price — optional; if set and lower than the sale price, the shop shows a red discount badge with the percentage.",
        ]},
        { type: "h2", text: "VAT is always included in the price" },
        { type: "p", text: "Every price you enter is a gross price (VAT included). The invoice automatically splits it into net + VAT using the destination country's rate (e.g. 19% for Germany, 20% for France) — you never compute this split yourself." },
        { type: "h2", text: "Small-business (Kleinunternehmer) rule" },
        { type: "p", text: "If you have no VAT ID on file, your invoices are automatically issued VAT-exempt (§19 UStG)." },
        { type: "h2", text: "B2B sales within the EU" },
        { type: "p", text: "If a business customer in another EU country has a valid VAT ID on file, reverse-charge automatically applies (0% VAT, recipient is liable for the tax) — the VAT ID is checked live against the EU's VIES database." },
        { type: "h2", text: "Coupons / discount codes" },
        { type: "p", text: "Coupons genuinely reduce the taxable amount — they appear as their own deduction line on the invoice, and VAT is computed on the discounted amount." },
        { type: "note", variant: "info", text: "Bonus points are NOT a discount in this sense — see the separate 'Bonus points program' article." },
      ],
    },
  },
  {
    slug: "bestellungen-versand",
    category: "verkauf",
    icon: "📮",
    title: { de: "Bestellungen, Lieferschein & Versand", en: "Orders, delivery notes & shipping" },
    summary: {
      de: "Der Weg einer Bestellung vom Eingang bis zum Versand, und wo du Lieferscheine/Sendungsnummern findest.",
      en: "The lifecycle of an order from arrival to shipment, and where to find delivery notes/tracking numbers.",
    },
    body: {
      de: [
        { type: "h2", text: "Status-Ablauf" },
        { type: "p", text: "offen → in Bearbeitung → versendet → zugestellt. Du findest alle Bestellungen unter Bestellungen → Ansicht, mit Filtern nach Status und Suche nach Bestellnummer/Kunde." },
        { type: "h2", text: "Lieferschein drucken" },
        { type: "p", text: "Jede Bestellung hat einen eigenen Lieferschein zum Drucken (PDF). Varianten-Informationen erscheinen dabei klein und hell neben dem Produktnamen, nicht im Fließtext." },
        { type: "h2", text: "Sendungsnummer eintragen" },
        { type: "p", text: "Sobald du eine Sendungsnummer einträgst, wird die Bestellung automatisch auf 'versendet' gesetzt und der Kunde kann seine Sendung live verfolgen (DHL, DPD, UPS, FedEx, Hermes, GLS und Deutsche Post werden automatisch erkannt und verlinkt)." },
        { type: "h2", text: "Abgebrochene Warenkörbe" },
        { type: "p", text: "Unter Bestellungen → Abandoned Checkouts (nur für Superuser sichtbar) siehst du Warenkörbe, die nicht zu einer Bestellung wurden." },
      ],
      en: [
        { type: "h2", text: "Status flow" },
        { type: "p", text: "open → processing → shipped → delivered. Find all orders under Orders → View, with filters by status and search by order number/customer." },
        { type: "h2", text: "Printing the delivery note" },
        { type: "p", text: "Every order has its own printable delivery note (PDF). Variant details appear as a small, light-colored note next to the product name, not inline in the title." },
        { type: "h2", text: "Adding a tracking number" },
        { type: "p", text: "As soon as you enter a tracking number, the order automatically flips to 'shipped' and the customer can track it live (DHL, DPD, UPS, FedEx, Hermes, GLS, and Deutsche Post are auto-detected and linked)." },
        { type: "h2", text: "Abandoned checkouts" },
        { type: "p", text: "Under Orders → Abandoned Checkouts (superuser-only) you can see carts that never turned into an order." },
      ],
    },
  },
  {
    slug: "retouren",
    category: "verkauf",
    icon: "↩️",
    title: { de: "Retouren & Rücksendungen", en: "Returns" },
    summary: {
      de: "Wie Kunden eine Rücksendung anfragen, was du prüfen musst, und wie das Rücksende-Label funktioniert.",
      en: "How customers request a return, what you need to review, and how the return label works.",
    },
    body: {
      de: [
        { type: "p", text: "Kunden können eine Rücksendung innerhalb von 14 Tagen nach Zustellung über ihr Kundenkonto anfragen. Die Anfrage erscheint bei dir unter Bestellungen → Retouren." },
        { type: "h2", text: "Rücksende-Label" },
        { type: "p", text: "Das DHL-Rücksende-Label wird automatisch erzeugt, sobald der Kunde die Anfrage stellt — du musst nicht manuell genehmigen, damit der Kunde loslegen kann. Du prüfst die Anfrage trotzdem (Grund, angefragte Artikel) und kannst sie im Zweifel ablehnen." },
        { type: "h2", text: "Rückerstattung" },
        { type: "p", text: "Sobald die Retoure abgeschlossen ist, veranlasst du die Erstattung. Der Bestellstatus wechselt entsprechend (retourniert/erstattet) und ist für den Kunden im Bestellverlauf sichtbar." },
        { type: "note", variant: "info", text: "Wurde eine Bestellung ganz oder teilweise mit Bonuspunkten bezahlt, werden bei einer Erstattung die entsprechenden Punkte automatisch wieder gutgeschrieben bzw. storniert — das musst du nicht manuell nachhalten." },
      ],
      en: [
        { type: "p", text: "Customers can request a return within 14 days of delivery from their account. The request appears for you under Orders → Returns." },
        { type: "h2", text: "Return label" },
        { type: "p", text: "The DHL return label is generated automatically as soon as the customer submits the request — you don't have to approve it manually first for the customer to proceed. You still review the request (reason, items) and can reject it if needed." },
        { type: "h2", text: "Refunds" },
        { type: "p", text: "Once the return is complete, you issue the refund. The order status updates accordingly (returned/refunded) and is visible to the customer in their order history." },
        { type: "note", variant: "info", text: "If an order was paid partly or fully with bonus points, a refund automatically re-credits or reverses the corresponding points — you don't need to track this manually." },
      ],
    },
  },
  {
    slug: "bonuspunkte",
    category: "verkauf",
    icon: "⭐",
    title: { de: "Bonuspunkte-Programm", en: "Bonus points program" },
    summary: {
      de: "Wie Bonuspunkte funktionieren, wer sie finanziert, und warum sie nicht als Umsatz versteuert werden.",
      en: "How bonus points work, who funds them, and why they aren't taxed as revenue.",
    },
    body: {
      de: [
        { type: "h2", text: "Das Wichtigste zuerst" },
        { type: "p", text: "Bonuspunkte werden von Andertal finanziert, NICHT von dir als Verkäufer. Wenn ein Kunde mit Punkten bezahlt, bekommst du trotzdem den vollen Warenwert gutgeschrieben — Andertal übernimmt die Differenz aus eigener Tasche." },
        { type: "h2", text: "Wie Kunden Punkte sammeln" },
        { type: "p", text: "Kunden erhalten Punkte auf den tatsächlich gezahlten Betrag (nicht auf den Listenpreis). 50 Punkte entsprechen 1 €, den ein Kunde beim nächsten Einkauf einlösen kann." },
        { type: "h2", text: "Warum das steuerlich sauber getrennt ist" },
        { type: "p", text: "Auf der Verkaufsrechnung erscheint der volle Warenwert als zu versteuernder Betrag — der mit Bonuspunkten bezahlte Anteil wird nur als kleine graue Info-Zeile ('bezahlt mit Andertal-Bonuspunkten') darunter ausgewiesen, NICHT als Rabatt von der Bemessungsgrundlage abgezogen. So wird korrekt der volle Wert der Lieferung versteuert, unabhängig davon, wie der Kunde bezahlt hat." },
        { type: "h2", text: "Auswirkung auf deine Provision" },
        { type: "p", text: "Deine Provision wird immer auf den Warenwert zum Listenpreis berechnet — unabhängig davon, ob und wie viel der Kunde mit Bonuspunkten bezahlt hat. Bonuspunkte schmälern also nie deine Provisionsbasis." },
      ],
      en: [
        { type: "h2", text: "The most important thing first" },
        { type: "p", text: "Bonus points are funded by Andertal, NOT by you as the seller. When a customer pays with points, you're still credited the full merchandise value — Andertal covers the difference out of its own pocket." },
        { type: "h2", text: "How customers earn points" },
        { type: "p", text: "Customers earn points on the amount actually paid (not the list price). 50 points equal €1, redeemable on a future purchase." },
        { type: "h2", text: "Why this is kept cleanly separate for tax purposes" },
        { type: "p", text: "The sales invoice shows the full merchandise value as the taxable amount — the portion paid with bonus points appears only as a small gray info line ('paid with Andertal bonus points') below it, NOT subtracted from the taxable base like a discount. This correctly taxes the full value of what was delivered, regardless of how the customer paid." },
        { type: "h2", text: "Effect on your commission" },
        { type: "p", text: "Your commission is always calculated on the merchandise value at list price — regardless of whether or how much the customer paid with bonus points. Bonus points never shrink your commission basis." },
      ],
    },
  },
  {
    slug: "abrechnung-provision",
    category: "finanzen",
    icon: "🧾",
    title: { de: "Abrechnung, Provision & Auszahlungen", en: "Billing, commission & payouts" },
    summary: {
      de: "Die drei Reiter der Abrechnungsseite und wie du an dein Geld kommst.",
      en: "The three tabs of the billing page, and how you actually get paid.",
    },
    body: {
      de: [
        { type: "p", text: "Unter Einstellungen → Abrechnung findest du drei Reiter." },
        { type: "h2", text: "1. Bestelldokumente" },
        { type: "p", text: "Alle Rechnungen und Lieferscheine einzelner Bestellungen, filterbar nach Zeitraum. Hier lädst du dir z. B. die Verkaufsrechnung eines bestimmten Kunden herunter." },
        { type: "h2", text: "2. Provisionsrechnungen" },
        { type: "p", text: "Einmal pro Monat wird automatisch eine Provisionsrechnung für dich erstellt — auch bei 0 € Umsatz, als Nachweis für den Zeitraum. Du bekommst eine Benachrichtigung und die PDF per E-Mail, kannst sie aber jederzeit auch hier erneut herunterladen." },
        { type: "h2", text: "3. Finanzamt-Übersicht (nur Superuser)" },
        { type: "p", text: "Plattformweite Zusammenfassung aller Umsätze/Steuern nach Zielland, inkl. Excel-Export für die Buchhaltung." },
        { type: "h2", text: "Wie die Provision berechnet wird" },
        { type: "p", text: "Provision = Warenwert (Listenpreis) × dein individueller Provisionssatz. Der Standardsatz ist 12 %, kann aber je nach Vereinbarung abweichen. Bonuspunkte und Kundenrabatte verändern diese Basis nicht (siehe Artikel 'Bonuspunkte-Programm')." },
        { type: "h2", text: "Wie du tatsächlich ausgezahlt wirst" },
        { type: "p", text: "Die Auszahlung deines Guthabens erfolgt aktuell manuell per Banküberweisung durch das Andertal-Team, nicht vollautomatisch. Sobald deine Überweisung eingegangen ist, wird der Zeitraum in deiner Abrechnung als 'bezahlt' markiert. Solltest du eine erwartete Auszahlung vermissen, wende dich über eine Support-Nachricht ans Team." },
      ],
      en: [
        { type: "p", text: "Under Settings → Billing you'll find three tabs." },
        { type: "h2", text: "1. Order documents" },
        { type: "p", text: "All invoices and delivery notes for individual orders, filterable by period. This is where you'd download a specific customer's sales invoice." },
        { type: "h2", text: "2. Commission invoices" },
        { type: "p", text: "Once a month a commission invoice is generated automatically for you — even at €0 revenue, as proof for the period. You get a notification and the PDF by email, and can re-download it here any time." },
        { type: "h2", text: "3. Tax-office overview (superuser only)" },
        { type: "p", text: "Platform-wide summary of all revenue/tax by destination country, including an Excel export for bookkeeping." },
        { type: "h2", text: "How commission is calculated" },
        { type: "p", text: "Commission = merchandise value (list price) × your individual commission rate. The default rate is 12%, but it can differ by agreement. Bonus points and customer discounts never change this basis (see 'Bonus points program')." },
        { type: "h2", text: "How you actually get paid" },
        { type: "p", text: "Payout of your balance is currently done manually by bank transfer from the Andertal team, not fully automated. Once your transfer has arrived, the period is marked 'paid' in your billing overview. If you're missing an expected payout, reach out to the team via a support message." },
      ],
    },
  },
  {
    slug: "rechtliches-compliance",
    category: "finanzen",
    icon: "⚖️",
    title: { de: "Rechtliches & Compliance", en: "Legal & compliance" },
    summary: {
      de: "Kurzüberblick zu Marktplatzhaftung, DAC7, GPSR, WEEE/EPR und was das für dich bedeutet.",
      en: "A quick overview of marketplace liability, DAC7, GPSR, WEEE/EPR, and what it means for you.",
    },
    body: {
      de: [
        { type: "h2", text: "Marktplatzhaftungsgesetz" },
        { type: "p", text: "Deutsche Marktplätze haften gesetzlich dafür, dass ihre Verkäufer eine gültige USt-IdNr. und eine gültige EPR-/LUCID-Verpackungsregistrierung besitzen. Deshalb sind diese beiden Angaben bei dir Pflicht, bevor du verkaufen kannst." },
        { type: "h2", text: "DAC7" },
        { type: "p", text: "Eine EU-Richtlinie verpflichtet Andertal, deine Verkaufsdaten automatisch an das Bundeszentralamt für Steuern zu melden, sobald du innerhalb eines Kalenderjahres mehr als 2.000 € Umsatz ODER mehr als 30 Transaktionen erreichst. Das ist verpflichtend für alle EU-Marktplätze — ein Opt-out gibt es nicht, und du musst dafür nichts extra einreichen." },
        { type: "h2", text: "GPSR (Produktsicherheitsverordnung)" },
        { type: "p", text: "Seit Dezember 2024 EU-weit verpflichtend: Hersteller-/Verantwortliche-Person-Angaben und Sicherheitshinweise müssen bei jedem betroffenen Produkt hinterlegt sein, sonst kann es nicht veröffentlicht werden (siehe Reiter 'Rechtlich' auf der Produktseite)." },
        { type: "h2", text: "WEEE & EPREL" },
        { type: "p", text: "Bei Elektro-/Elektronikgeräten ist eine WEEE-Registrierungsnummer erforderlich; bei energieverbrauchsrelevanten Produkten zusätzlich ein EPREL-Energielabel." },
        { type: "h2", text: "B2B-Reverse-Charge & VIES" },
        { type: "p", text: "Verkäufe an Geschäftskunden in anderen EU-Ländern mit gültiger, live über VIES verifizierter USt-IdNr. werden automatisch mit 0 % MwSt. (Reverse-Charge) abgerechnet." },
        { type: "note", variant: "warning", text: "Diese Seite ersetzt keine Steuerberatung. Bei Unsicherheiten zu deiner individuellen steuerlichen Situation wende dich an deinen Steuerberater." },
      ],
      en: [
        { type: "h2", text: "Marketplace Liability Act (Germany)" },
        { type: "p", text: "German marketplaces are legally liable for verifying their sellers hold a valid VAT ID and a valid EPR/LUCID packaging registration. That's why both are mandatory before you can sell." },
        { type: "h2", text: "DAC7" },
        { type: "p", text: "An EU directive requires Andertal to automatically report your sales data to the German tax authority (BZSt) once you exceed €2,000 in revenue OR 30 transactions within a calendar year. This is mandatory for all EU marketplaces — there's no opt-out, and you don't need to file anything extra yourself." },
        { type: "h2", text: "GPSR (General Product Safety Regulation)" },
        { type: "p", text: "Mandatory EU-wide since December 2024: manufacturer/responsible-person details and safety warnings must be on file for every affected product, or it can't be published (see the 'Legal' tab on the product page)." },
        { type: "h2", text: "WEEE & EPREL" },
        { type: "p", text: "Electrical/electronic products require a WEEE registration number; energy-related products additionally need an EPREL energy label." },
        { type: "h2", text: "B2B reverse-charge & VIES" },
        { type: "p", text: "Sales to business customers in other EU countries with a valid VAT ID, verified live against VIES, are automatically billed at 0% VAT (reverse-charge)." },
        { type: "note", variant: "warning", text: "This page is not tax advice. For questions about your individual tax situation, consult your tax advisor." },
      ],
    },
  },
  {
    slug: "content-marketing",
    category: "konto",
    icon: "🎨",
    title: { de: "Content, Marken & Marketing", en: "Content, brands & marketing" },
    summary: {
      de: "Medien, Marken, Gutscheine und Kampagnen — was du selbst pflegen kannst und was Superuser vorbehalten ist.",
      en: "Media, brands, coupons, and campaigns — what you can manage yourself vs. what's superuser-only.",
    },
    body: {
      de: [
        { type: "h2", text: "Was du als Verkäufer verwalten kannst" },
        { type: "ul", items: [
          "Content → Medien: eigene Bilder/Dateien hochladen und verwalten.",
          "Content → Marken: Markenprofile für deine Produkte.",
          "Marketing → Kampagnen und Attribution: eigene Marketing-Aktivitäten verfolgen.",
          "Rabatte → Gutscheine und Aktionen: eigene Rabattcodes und Promotions anlegen.",
        ]},
        { type: "h2", text: "Was nur Superuser sehen/bearbeiten (in Rot markiert)" },
        { type: "p", text: "Kategorien, Menüs, Metaobjects, Landingpage, Styles, Seiten, Blogbeiträge, Flows sowie SEO- und Automations-Einstellungen im Marketing-Bereich sind zentral gesteuert, damit der Shop-Auftritt konsistent bleibt. Im Menü sind diese Punkte für dich entsprechend nicht sichtbar bzw. rot markiert, falls du sie doch siehst." },
      ],
      en: [
        { type: "h2", text: "What you can manage as a seller" },
        { type: "ul", items: [
          "Content → Media: upload and manage your own images/files.",
          "Content → Brands: brand profiles for your products.",
          "Marketing → Campaigns and Attribution: track your own marketing activity.",
          "Discounts → Coupons and Promotions: create your own discount codes and promotions.",
        ]},
        { type: "h2", text: "What's superuser-only (marked in red)" },
        { type: "p", text: "Categories, menus, metaobjects, landing page, styles, pages, blog posts, flows, and the SEO/automations settings under Marketing are centrally managed to keep the storefront consistent. These are hidden from your nav, or shown in red if you can still see them." },
      ],
    },
  },
  {
    slug: "konto-sicherheit",
    category: "konto",
    icon: "🔒",
    title: { de: "Konto, Sicherheit & Standorte", en: "Account, security & locations" },
    summary: {
      de: "Passwort ändern, wer Zugriff auf was hat, und wie du deine Standorte für Versand, Retoure und Rechnung einrichtest.",
      en: "Changing your password, who has access to what, and setting up your shipping/returns/invoice locations.",
    },
    body: {
      de: [
        { type: "h2", text: "Standorte einrichten" },
        { type: "p", text: "Unter Einstellungen → Standorte legst du Adressen an und weist jeder einen oder mehrere Zwecke zu: Versandadresse (wo deine Pakete abgehen), Retourenadresse (wohin Rücksendungen gehen) und Rechnungsadresse. Du kannst für alle drei dieselbe Adresse nutzen oder für jede eine eigene hinterlegen." },
        { type: "h2", text: "Sicherheit" },
        { type: "p", text: "Unter Einstellungen → Sicherheit siehst du, seit wann dein Konto besteht, und kannst dein Passwort ändern (mit Anzeigen/Verbergen-Umschalter für das neue Passwort)." },
        { type: "h2", text: "Zahlungsdaten" },
        { type: "p", text: "IBAN (für Auszahlungen) und Kreditkarte (für Plattformgebühren) verwaltest du unter Einstellungen → Zahlungen. Beide sind Pflichtfelder für den aktiven Verkaufsstatus." },
        { type: "note", variant: "info", text: "Neu angelegte Unterkonten haben standardmäßig keinen Zugriff auf Stripe/Zahlungseinstellungen — das bleibt dem Hauptkonto vorbehalten." },
      ],
      en: [
        { type: "h2", text: "Setting up locations" },
        { type: "p", text: "Under Settings → Locations you create addresses and assign each one a purpose: shipping address (where your parcels ship from), returns address (where returns go), and invoice address. You can use the same address for all three, or a separate one for each." },
        { type: "h2", text: "Security" },
        { type: "p", text: "Under Settings → Security you can see how long your account has existed and change your password (with a show/hide toggle for the new password)." },
        { type: "h2", text: "Payment details" },
        { type: "p", text: "IBAN (for payouts) and credit card (for platform fees) are managed under Settings → Payments. Both are required for active selling status." },
        { type: "note", variant: "info", text: "Newly created sub-accounts have no access to Stripe/payment settings by default — that stays reserved for the main account." },
      ],
    },
  },
];

export function helpLocaleBody(article, locale) {
  const body = article?.body || {};
  return body[locale] || body.en || body.de || [];
}

export function helpLocaleText(field, locale) {
  if (!field) return "";
  return field[locale] || field.en || field.de || "";
}
