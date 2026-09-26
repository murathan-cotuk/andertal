'use strict'

/**
 * Canonical Seller–Platform Agreement (single source of truth).
 * Used by: PDF signing, public API, Sellercentral verification modal & sign page.
 *
 * Governing text: German (de). Other locales are courtesy translations.
 * Version bumps must change AGREEMENT_VERSION so existing sellers can be re-prompted.
 */

const AGREEMENT_VERSION = '2026.09.26'
const AGREEMENT_UPDATED = '2026-09-26'
const DEFAULT_PLATFORM_NAME = 'Andertal GmbH'

const TITLES = {
  de: 'Händler-Plattform-Vereinbarung',
  tr: 'Satıcı–Platform Sözleşmesi',
  en: 'Seller–Platform Agreement',
  fr: 'Accord Vendeur–Plateforme',
  es: 'Acuerdo Vendedor–Plataforma',
  it: 'Accordo Venditore–Piattaforma',
}

const GOVERNING_NOTES = {
  de: 'Maßgebliche Fassung: Deutsch. Es gilt deutsches Recht.',
  tr: 'Esas metin: Almanca. Uygulanacak hukuk: Alman hukuku.',
  en: 'Authoritative version: German. German law applies.',
  fr: 'Version faisant foi : allemand. Droit allemand applicable.',
  es: 'Versión vinculante: alemán. Se aplica el derecho alemán.',
  it: 'Versione vincolante: tedesco. Si applica il diritto tedesco.',
}

/** @type {Record<string, Array<{ heading: string, body: string }>>} */
const SECTIONS = {
  de: [
    {
      heading: 'Präambel – Parteien und Geltung',
      body: `Diese Händler-Plattform-Vereinbarung (nachfolgend „Vereinbarung") regelt die Rechtsbeziehung zwischen ${DEFAULT_PLATFORM_NAME} (nachfolgend „Plattform") und dem registrierten gewerblichen Verkäufer (nachfolgend „Verkäufer").\n\nMit dem Setzen des Zustimmungs-Hakens im Sellercentral und/oder der elektronischen Unterzeichnung erklärt der Verkäufer, den vollständigen Text dieser Vereinbarung gelesen und verstanden zu haben und an alle nachfolgenden Bestimmungen gebunden zu sein.\n\nDie Vereinbarung berücksichtigt insbesondere: Verordnung (EU) 2022/2065 (Digital Services Act – DSA), Verordnung (EU) 2019/1150 (P2B-Verordnung), Verordnung (EU) 2016/679 (DSGVO), Verordnung (EU) 2023/988 (GPSR), das BGB, das UWG sowie sonstiges anwendbares Unions- und deutsches Recht.\n\nDiese Vereinbarung steht in mehreren Sprachen zur Verfügung. Bei Widersprüchen zwischen Sprachfassungen ist ausschließlich die deutsche Fassung maßgeblich.`,
    },
    {
      heading: '§ 1 – Begriffsbestimmungen',
      body: `„Plattform" bezeichnet die von ${DEFAULT_PLATFORM_NAME} betriebene Marktplatz-Infrastruktur (Website, Apps, APIs, Sellercentral und zugehörige Dienste) sowie die rechtliche Person der Plattformbetreiberin.\n„Verkäufer" bezeichnet jede natürliche oder juristische Person, die sich registriert, um Waren über die Plattform anzubieten.\n„Endkunde" / „Verbraucher" bezeichnet den Käufer eines vom Verkäufer angebotenen Produkts.\n„Angebot" / „Listing" bezeichnet jeden auf der Plattform veröffentlichten Produktlistungs-Eintrag.\n„Sellercentral" bezeichnet die Verwaltungsoberfläche des Verkäufers.\n„Transaktion" bezeichnet einen abgeschlossenen Kaufvertrag zwischen Verkäufer und Endkunde, der über die Plattform vermittelt wurde.\n„Preisliste" bezeichnet die im Sellercentral veröffentlichte, jeweils aktuelle Übersicht der Plattformgebühren und Provisionen.\nSingular und Plural sowie geschlechtsbezogene Formulierungen gelten wechselseitig, soweit der Kontext nichts anderes verlangt.`,
    },
    {
      heading: '§ 2 – Vertragsgegenstand und Rolle der Plattform',
      body: `Die Plattform stellt dem Verkäufer eine technische Infrastruktur zum Anbieten, Verwalten und Verkaufen von Waren gegenüber Endkunden zur Verfügung. Dazu können insbesondere gehören: Katalog- und Angebotsverwaltung, Zahlungsabwicklung über zertifizierte Zahlungsdienstleister, Versand- und Etikettenhilfen, Analysewerkzeuge, Kundensupport-Schnittstellen sowie Marketingfunktionen.\n\nDer Verkäufer handelt stets als eigenverantwortlicher Händler im eigenen Namen und auf eigene Rechnung. Die Plattform ist nicht Vertragspartner der Kaufverträge zwischen Verkäufer und Endkunde und tritt nicht als Kommissionär auf. Sie handelt als „Online-Vermittlungsdienst" i. S. v. Art. 2 Nr. 2 P2B-VO und als „Online-Marktplatz" i. S. v. Art. 3 lit. j DSA.\n\nZusatzleistungen (z. B. Zahlungsabwicklung, Versandetiketten) erbringt die Plattform bzw. ihre Dienstleister als technische Unterstützung für den Verkäufer, ohne dadurch Partei des Kaufvertrags zu werden.`,
    },
    {
      heading: '§ 3 – Registrierung, Konto und Verifizierung',
      body: `Die Nutzung setzt erfolgreiche Registrierung und – je nach Kategorie und Herkunftsland – Identitäts- und Geschäftsverifizierung voraus. Der Verkäufer verpflichtet sich:\n(a) wahrheitsgemäße, vollständige und aktuelle Angaben zu Person/Unternehmen, Steuernummer bzw. USt-IdNr., Bankverbindung (IBAN/BIC), Handelsregister- bzw. Gewerbedaten und Anschrift zu machen;\n(b) wesentliche Änderungen dieser Daten unverzüglich, spätestens binnen sieben (7) Werktagen, mitzuteilen und im Sellercentral zu aktualisieren;\n(c) auf Anforderung Prüfunterlagen (z. B. Ausweis der vertretungsberechtigten Person, Handelsregister-/Gewerbeauszug, Steuer-/LUCID-Nachweise) innerhalb von zehn (10) Werktagen einzureichen.\n\nFalsche oder irreführende Angaben berechtigen die Plattform zur Verweigerung, erneuten Anforderung oder Sperrung sowie – bei Verdacht auf Straftaten – zur Anzeige bei Behörden. Zugangsdaten sind vertraulich; der Verkäufer haftet für unter seinen Zugangsdaten vorgenommene Handlungen, soweit er deren missbräuchliche Nutzung zu vertreten hat.`,
    },
    {
      heading: '§ 4 – Pflichten des Verkäufers (Angebote, Erfüllung, Gewährleistung)',
      body: `Der Verkäufer verpflichtet sich insbesondere:\n1. Ausschließlich legale Waren anzubieten und Produktsicherheits-, Kennzeichnungs- und Verbraucherschutzvorschriften einzuhalten, einschließlich GPSR sowie kategorie-/länderspezifischer Vorgaben (z. B. WEEE/ElektroG, EPREL, Batterieverordnung, VerpackG/LUCID) – siehe Compliance-Bereich im Sellercentral.\n2. Vollständige und korrekte Geschäftsdaten (Impressum-relevante Angaben, Steuerdaten, IBAN) bereitzustellen und aktuell zu halten.\n3. Bestellungen innerhalb der im Angebot angegebenen Lieferfristen zu erfüllen; innerhalb der EU soll die Lieferzeit in der Regel 14 Werktage nicht überschreiten, sofern nicht ausdrücklich anders angegeben und gesetzlich zulässig.\n4. Bei Verzögerung oder Nichtverfügbarkeit den Endkunden unverzüglich, spätestens binnen 24 Stunden nach Kenntnis, zu informieren.\n5. Gesetzliche Gewährleistungsrechte (§§ 434 ff. BGB) zu wahren (regelmäßig 2 Jahre für Neuware; bei Gebrauchtware ggf. verkürzt, sofern zulässig und klar gekennzeichnet) und das 14-tägige Widerrufsrecht für Verbraucher (§§ 355 ff. BGB / Verbraucherrechterichtlinie) zu gewähren.\n6. Retouren unkompliziert abzuwickeln und Erstattungen binnen 14 Tagen nach Eingang der Retoure vorzunehmen; Retourenkosten innerhalb der EU trägt der Verkäufer, soweit gesetzlich nichts anderes gilt.\n7. Ordnungsgemäße Rechnungen auszustellen und gesetzliche Aufbewahrungsfristen einzuhalten.\n8. Produktinformationen (EAN, Titel, Beschreibung, Bilder, Preise inkl. gesetzlicher Pflichtangaben) wahrheitsgemäß und nicht irreführend darzustellen und gemeinsame Katalogeinträge nicht ohne Berechtigung zu verändern.\n9. Kundenanfragen über die Plattformkanäle innerhalb angemessener Frist zu beantworten.\n10. Keine Preisabsprachen, Marktmanipulation oder unlauteren Wettbewerb (UWG) zu betreiben.`,
    },
    {
      heading: '§ 5 – Verbotene und eingeschränkte Artikel',
      body: `Untersagt ist das Anbieten von Waren, die gegen geltendes Recht verstoßen oder deren Verkauf über die Plattform ausgeschlossen ist, einschließlich – ohne Beschränkung –: Markenfälschungen; Waffen und munitionsähnliche Gegenstände; verschreibungspflichtige Arzneimittel ohne Zulassung; gestohlene Ware; Tabak-/Nikotinprodukte ohne gesetzlich erforderliche Altersverifikation; Waren, die gegen Exportkontroll- oder Sanktionsvorschriften verstoßen; Betäubungsmittel und sonstige gesetzlich verbotene Güter.\n\nDie Plattform kann im Sellercentral eine aktuelle, nicht abschließende Liste verbotener/eingeschränkter Kategorien veröffentlichen und aus regulatorischen Gründen anpassen. Wesentliche Änderungen werden gemäß § 21 mitgeteilt. Verstöße können zur sofortigen Entfernung von Angeboten und zu Maßnahmen nach § 19 führen.`,
    },
    {
      heading: '§ 6 – Geistiges Eigentum und Markenrechte',
      body: `Der Verkäufer sichert zu, über alle erforderlichen Rechte an hochgeladenen Inhalten (Bilder, Texte, Markenzeichen, Videos) zu verfügen oder zur Nutzung berechtigt zu sein.\n\nFür die Nutzung fremder, registrierter Marken gilt der Markenautorisierungsprozess der Plattform (Sellercentral → Marken). Angebote unter einer registrierten Marke ohne nachgewiesene Berechtigung sind untersagt und können ohne Vorankündigung entfernt werden. Rechteinhaber können mutmaßliche Verletzungen über das Meldeverfahren (§ 13) anzeigen.\n\nMit dem Hochladen räumt der Verkäufer der Plattform ein einfaches, nicht ausschließliches, weltweites, zeitlich auf die Vertragsdauer (und angemessene Abwicklungszeiträume danach) beschränktes, kostenfreies Nutzungsrecht ein, die Inhalte auf der Plattform darzustellen und in damit verbundenen Marketingmaßnahmen der Plattform zu verwenden, soweit dies zur Präsentation der Angebote erforderlich ist. Plattform-Marken und -Logos darf der Verkäufer nur mit vorheriger schriftlicher Zustimmung der Plattform nutzen.`,
    },
    {
      heading: '§ 7 – Datenschutz (DSGVO)',
      body: `Der Verkäufer verarbeitet personenbezogene Daten von Endkunden (Name, Anschrift, Kontaktdaten, Bestelldaten) ausschließlich zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und nur im erforderlichen Umfang. Weitergabe an Dritte ohne Rechtsgrundlage ist untersagt; werbliche Nutzung außerhalb der Plattform ohne gesonderte Einwilligung des Kunden ist unzulässig.\n\nDer Verkäufer:\n(a) trifft angemessene technische und organisatorische Maßnahmen (Art. 32 DSGVO);\n(b) meldet relevante Datenschutzvorfälle der Plattform unverzüglich (Ziel: binnen 24 Stunden) und unterstützt behördliche Meldepflichten;\n(c) beantwortet Betroffenenanfragen binnen 30 Tagen und unterstützt die Plattform bei deren Pflichten;\n(d) schließt, soweit erforderlich, einen AVV nach Art. 28 DSGVO mit der Plattform;\n(e) übermittelt Daten nicht ohne angemessenes Schutzniveau in Drittländer (Art. 44 ff. DSGVO).\n\nEinzelheiten ergeben sich aus der Datenschutzerklärung der Plattform und etwaigen AVV-Dokumenten.`,
    },
    {
      heading: '§ 8 – Zahlungsabwicklung, Treuhand und Auszahlungen',
      body: `Zahlungen von Endkunden werden über den von der Plattform eingesetzten Zahlungsdienstleister (insbesondere Stripe Connect oder gleichwertige zertifizierte Anbieter) abgewickelt. Der Verkäufer bevollmächtigt die Plattform und den Zahlungsdienstleister, Zahlungen namens und für Rechnung des Verkäufers entgegenzunehmen. Zahlungseingang beim Dienstleister/der Plattform gilt als Zahlungseingang beim Verkäufer.\n\nGelder können zunächst auf einem von der Plattform bzw. dem Zahlungsdienstleister verwalteten Konto eingehen. Auszahlungen an den Verkäufer erfolgen nach Auftragsabschluss und – soweit vorgesehen – nach Ablauf einer Sicherheitshaltefrist (in der Regel 7 bis 14 Werktage nach Lieferbestätigung), gemäß dem im Sellercentral einsehbaren Auszahlungsrhythmus. Zweck der Haltefrist ist die Abfederung von Retouren, Widerrufen und Chargebacks.\n\nDie Plattform darf Beträge bei begründeten Rückforderungen (Chargebacks, Retouren, Betrugsverdacht, offene Gebühren) vorübergehend einbehalten oder verrechnen, bis der Vorgang geklärt ist. Der Verkäufer ist für die Richtigkeit seiner Bankdaten verantwortlich; Verzögerungen durch fehlerhafte Angaben gehen zu seinen Lasten. Monatliche Abrechnungsübersichten im Sellercentral gelten als anerkannt, wenn binnen 30 Tagen keine begründete Beanstandung erhoben wird.`,
    },
    {
      heading: '§ 9 – Provisionen, Gebühren und Preise',
      body: `Die Plattform erhebt Transaktionsgebühren/Provisionen gemäß der zum Zeitpunkt der jeweiligen Transaktion gültigen, im Sellercentral einsehbaren Preisliste. Provisionen werden in der Regel bei Zahlungseingang vom Transaktionsbetrag einbehalten.\n\nÄnderungen der Gebührenstruktur werden dem Verkäufer gemäß § 21 vorab mitgeteilt. Der Verkäufer bestimmt die Verkaufspreise seiner Angebote eigenverantwortlich; die Plattform nimmt darauf keinen Einfluss, außer im Rahmen vom Verkäufer aktivierter, zulässiger Rabatt-/Kampagnenfunktionen.\n\nBei Verzug mit Gebühren werden Verzugszinsen nach § 288 BGB (bei beiderseitigem Handelsgeschäft regelmäßig 9 Prozentpunkte über dem Basiszinssatz) fällig. Die Plattform darf fällige Gebühren mit Auszahlungsansprüchen verrechnen.`,
    },
    {
      heading: '§ 10 – Retouren, Widerruf und Chargebacks (Auswirkung auf Provision)',
      body: `Übt ein Verbraucher sein Widerrufsrecht aus oder wird eine berechtigte Retoure vollständig rückabgewickelt, wird der zugehörige Bestellbetrag einschließlich der einbehaltenen Provision storniert bzw. die Provision dem Verkäufer erstattet, sofern der Kaufpreis vollständig zurückgebucht wurde. Bei Teilretouren erfolgt die Provisionserstattung anteilig.\n\nChargebacks durch den Zahlungsdienstleister können zum Einbehalt des Transaktionsbetrags führen; die Plattform informiert den Verkäufer und leitet das Verfahren nach den Regeln des Zahlungsdienstleisters. Der Verkäufer wirkt bei der Klärung mit und stellt erforderliche Nachweise bereit.`,
    },
    {
      heading: '§ 11 – Steuerliche Pflichten',
      body: `Der Verkäufer ist allein verantwortlich für die zutreffende umsatzsteuerliche Behandlung seiner Verkäufe (einschließlich OSS oder Registrierungen in einzelnen Mitgliedstaaten) sowie für Erklärung und Abführung aller auf seine Umsätze entfallenden Steuern.\n\nDie Plattform kann, soweit gesetzlich vorgeschrieben, Transaktionsdaten an Behörden übermitteln (z. B. § 22f UStG, DAC7). Der Verkäufer stellt auf Anforderung die hierfür erforderlichen Angaben und Nachweise bereit und nimmt zur Kenntnis, dass die Plattform zur Meldung bestimmter Umsätze verpflichtet sein kann.`,
    },
    {
      heading: '§ 12 – Ranking, Sichtbarkeit und Werbung (P2B Art. 5)',
      body: `Wesentliche Parameter des Rankings sind insbesondere: Produktqualität und Vollständigkeit der Produktdaten; Kundenbewertungen (Note, Anzahl, Aktualität); Bestellabwicklungsrate und Lieferzeiten; Preisgestaltung; Aktualität des Sortiments; Konto-Compliance; sowie relevante Konversions-/Interaktionssignale.\n\nDer Verkäufer kann das Ranking durch Verbesserung dieser Faktoren beeinflussen. Bezahlte Platzierungen (Marketing/Kampagnen) werden als Werbung gekennzeichnet und beeinflussen das organische Ranking anderer Angebote nicht. Die Plattform verpflichtet sich, eigene Angebote nicht unbillig gegenüber Drittverkäufern zu bevorzugen.`,
    },
    {
      heading: '§ 13 – Content-Moderation und Meldeverfahren (DSA)',
      body: `Die Plattform betreibt gemäß Art. 16 DSA ein Melde- und Abhilfeverfahren für mutmaßlich rechtswidrige Angebote oder Inhalte. Begründete Meldungen können zur Entfernung, Zugriffsbeschränkung oder – bei schwerwiegenden/wiederholten Verstößen – zu Maßnahmen nach § 19 führen.\n\nDer Verkäufer wird über entfernte Inhalte grundsätzlich informiert und erhält Gelegenheit zur Stellungnahme, sofern dem nicht zwingende rechtliche oder sicherheitsrelevante Gründe entgegenstehen (Art. 17, 20 DSA). Offensichtlich unbegründete, wiederholte Meldungen Dritter können zurückgewiesen werden.`,
    },
    {
      heading: '§ 14 – Transparenz gegenüber Verbrauchern (P2B Art. 6a)',
      body: `Die Plattform stellt Endkunden vor Kaufabschluss erkennbar dar, dass das Angebot von einem gewerblichen Dritten stammt, und weist auf die Verteilung von Rechten und Pflichten (insbesondere Gewährleistung und Widerruf) zwischen Verkäufer und Plattform hin. Der Verkäufer liefert alle dafür erforderlichen Angaben vollständig und wahrheitsgemäß und bestätigt, dass die Hauptverantwortung für die Erfüllung der Kaufverträge – vorbehaltlich dieser Vereinbarung – bei ihm liegt.`,
    },
    {
      heading: '§ 15 – Verhaltenskodex und verbotene Praktiken',
      body: `Untersagt sind insbesondere:\n(a) kartellrechtswidrige Absprachen;\n(b) gefälschte, irreführende oder manipulierte Bewertungen;\n(c) künstliche Ranking-Manipulation (z. B. Klickfarmen, Bots);\n(d) Abwerbung von Plattformkunden auf externe Kanäle unter missbräuchlicher Nutzung von Plattformdaten;\n(e) Nutzung von Kundendaten der Plattform für Eigenwerbung außerhalb der Plattform ohne Rechtsgrundlage;\n(f) Betrug, Identitätsäuschung, Geldwäsche oder Finanzierung illegaler Aktivitäten;\n(g) Angebote unter Verstoß gegen Exportkontroll-/Sanktionsrecht.`,
    },
    {
      heading: '§ 16 – Haftung des Verkäufers und Freistellung',
      body: `Der Verkäufer haftet für Schäden, die der Plattform durch schuldhafte Verletzung dieser Vereinbarung, geltender Gesetze oder Rechte Dritter entstehen. Er stellt die Plattform von Ansprüchen Dritter frei, die auf Produktmängeln, Rechtsverletzungen oder sonstigen Pflichtverletzungen des Verkäufers beruhen, einschließlich angemessener Rechtsverteidigungskosten.\n\nFür Datenschutzverletzungen im Verantwortungsbereich des Verkäufers bleibt die Haftung nach Art. 82 DSGVO unberührt. Für reine Vermögensschäden ohne Vorsatz oder grobe Fahrlässigkeit kann die Haftung des Verkäufers gegenüber der Plattform auf den Wert der betreffenden Transaktionen der letzten zwölf (12) Monate begrenzt sein, soweit gesetzlich zulässig.`,
    },
    {
      heading: '§ 17 – Haftungsbeschränkung der Plattform',
      body: `Die Plattform haftet unbeschränkt für Schäden aus der Verletzung von Leben, Körper oder Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden.\n\nBei leichter Fahrlässigkeit haftet die Plattform nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und nur in Höhe des vertragstypisch vorhersehbaren Schadens. Haftung für mittelbare Schäden, entgangenen Gewinn, Datenverlust und Folgeschäden ist – außer in den vorgenannten Fällen unbeschränkter Haftung – ausgeschlossen, soweit gesetzlich zulässig.\n\nFür die Verfügbarkeit der Infrastruktur wird ein handelsüblicher Standard angestrebt; ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht. Keine Haftung besteht für Ausfälle durch höhere Gewalt, Angriffe Dritter (z. B. DDoS), allgemeine Internetstörungen oder Störungen externer Dienstleister, soweit die Plattform diese nicht zu vertreten hat.`,
    },
    {
      heading: '§ 18 – Höhere Gewalt',
      body: `Keine Partei haftet für die Nichterfüllung ihrer Pflichten, soweit diese auf Umständen höherer Gewalt beruht (z. B. Naturkatastrophen, Epidemien, behördliche Anordnungen, Krieg, großflächige Netz-/Energieausfälle), die außerhalb ihrer zumutbaren Kontrolle liegen. Die betroffene Partei informiert die andere Partei unverzüglich über Art und voraussichtliche Dauer und bemüht sich um Wiederaufnahme.`,
    },
    {
      heading: '§ 19 – Kontosperrung, Aussetzung und Kündigung',
      body: `Bei Verstößen kann die Plattform abgestufte Maßnahmen ergreifen: Verwarnung mit Abhilfefrist; Einschränkung/Entfernung einzelner Listings; vorläufige Einfrierung ausstehender Auszahlungen; bei schwerwiegenden oder wiederholten Verstößen oder behördlicher Anordnung Sperrung oder Kündigung.\n\nVor einer dauerhaften Sperrung bzw. Kündigung erhält der Verkäufer – außer in Notfällen oder soweit rechtlich unzulässig – eine Begründung und angemessene Frist zur Stellungnahme (Art. 4 P2B-VO; Ziel: mindestens 7 Werktage).\n\nDer Verkäufer kann jederzeit mit einer Frist von 30 Tagen kündigen. Die Plattform kann ordentlich mit 30 Tagen Frist kündigen; außerordentliche Kündigung aus wichtigem Grund bleibt vorbehalten. Laufende Bestellungen sind auch nach Beendigung ordnungsgemäß abzuwickeln. Fällige Auszahlungen werden nach Abzug offener Forderungen ausgezahlt, vorbehaltlich Einbehalten nach § 8.`,
    },
    {
      heading: '§ 20 – Vertragsübertragung',
      body: `Der Verkäufer darf Rechte und Pflichten aus dieser Vereinbarung nicht ohne vorherige schriftliche Zustimmung der Plattform auf Dritte übertragen. Die Plattform kann die Vereinbarung im Rahmen einer Umstrukturierung, Verschmelzung oder eines Betriebsübergangs auf ein verbundenes Unternehmen übertragen, sofern dies die Rechtsposition des Verkäufers nicht wesentlich verschlechtert.`,
    },
    {
      heading: '§ 21 – Änderungen dieser Vereinbarung',
      body: `Änderungen werden dem Verkäufer mindestens fünfzehn (15) Tage vor Inkrafttreten per E-Mail und/oder Benachrichtigung im Sellercentral mitgeteilt (Art. 3 P2B-VO), außer soweit eine kürzere Frist aufgrund gesetzlicher Verpflichtungen, zur Abwehr unvorhergesehener Gefahren oder zugunsten des Verkäufers erforderlich ist (in gesetzlich zwingenden Fällen ggf. bis zu 3 Tage).\n\nWiderspricht der Verkäufer nicht innerhalb der Ankündigungsfrist und nutzt die Plattform weiter, gelten die Änderungen als angenommen. Bei Widerspruch kann der Verkäufer die Vereinbarung gemäß § 19 kündigen. Die jeweils aktuelle Fassung und Versionsnummer sind im Sellercentral einsehbar.`,
    },
    {
      heading: '§ 22 – Streitbeilegung',
      body: `Streitigkeiten werden zunächst intern behandelt. Interne Beschwerdestelle gemäß Art. 11 P2B-VO: info@andertal.com. Beschwerden werden kostenfrei und zügig bearbeitet; der Verkäufer kann Entscheidungen der Plattform in der Regel binnen 14 Tagen schriftlich anfechten.\n\nExterne Möglichkeiten: Online-Streitbeilegungsportal der EU (https://ec.europa.eu/consumers/odr/) sowie Mediation nach Art. 12 P2B-VO (u. a. anerkannte Stellen wie CEDR, soweit einschlägig).\n\nEs gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand ist, soweit der Verkäufer Kaufmann ist und gesetzlich zulässig, Berlin.`,
    },
    {
      heading: '§ 23 – Weitere Compliance-Anforderungen',
      body: `Soweit einschlägig, beachtet der Verkäufer insbesondere: KYC-/Geldwäschevorgaben auf Anforderung der Plattform; DAC7-bezogene Mitwirkungspflichten; Batterieverordnung und ElektroG für betroffene Produkte; Marktüberwachungsrecht (Verordnung (EU) 2019/1020); sowie – soweit gesetzlich anwendbar – Lieferketten-Sorgfaltspflichten. Produktsicherheitsrisiken und erforderliche Rückrufe sind der Plattform unverzüglich zu melden.`,
    },
    {
      heading: '§ 24 – Schlussbestimmungen und Kontakt',
      body: `Sollten einzelne Bestimmungen unwirksam sein, bleiben die übrigen wirksam (salvatorische Klausel). Die Parteien ersetzen eine unwirksame Bestimmung durch eine wirksame Regelung, die dem wirtschaftlichen Zweck möglichst nahekommt.\n\nDiese Vereinbarung bildet zusammen mit den im Sellercentral veröffentlichten Richtlinien (u. a. verbotene Artikel, Compliance-Vorgaben, Preisliste) die vollständige Vereinbarung zum Vertragsgegenstand und ersetzt frühere Absprachen hierzu. Änderungen bedürfen der Textform i. S. d. § 21 (einschließlich elektronischer Mitteilung).\n\nKontakt Plattform: info@andertal.com.\nVersion: ${AGREEMENT_VERSION} · Stand: ${AGREEMENT_UPDATED}.`,
    },
  ],

  tr: [
    {
      heading: 'Önsöz – Taraflar ve Yürürlük',
      body: `Bu Satıcı–Platform Sözleşmesi (bundan böyle „Sözleşme"), ${DEFAULT_PLATFORM_NAME} (bundan böyle „Platform") ile kayıtlı ticari satıcı (bundan böyle „Satıcı") arasındaki hukuki ilişkiyi düzenler.\n\nSellercentral'da onay kutusunun işaretlenmesi ve/veya elektronik imza ile Satıcı, bu Sözleşmenin tamamını okuyup anladığını ve aşağıdaki tüm hükümlere bağlı olduğunu kabul eder.\n\nSözleşme özellikle şu düzenlemeleri dikkate alır: (AB) 2022/2065 DSA, (AB) 2019/1150 P2B Tüzüğü, (AB) 2016/679 GDPR, (AB) 2023/988 GPSR, Alman Medeni Kanunu (BGB) ve diğer uygulanabilir AB / Alman hukuku.\n\nSözleşme birden fazla dilde sunulur. Dil sürümleri arasında çelişki halinde yalnızca Almanca metin esas alınır.`,
    },
    {
      heading: 'Madde 1 – Tanımlar',
      body: `„Platform": ${DEFAULT_PLATFORM_NAME} tarafından işletilen pazar yeri altyapısı (web sitesi, uygulamalar, API'ler, Sellercentral ve ilgili hizmetler) ile platform işletmecisi tüzel kişiyi ifade eder.\n„Satıcı": Platform üzerinden mal sunmak üzere kayıt olan gerçek veya tüzel kişiyi ifade eder.\n„Son müşteri" / „Tüketici": Satıcının sunduğu ürünü satın alan kişiyi ifade eder.\n„İlan": Platformda yayımlanan ürün listeleme kaydını ifade eder.\n„Sellercentral": Satıcının yönetim arayüzünü ifade eder.\n„İşlem": Platform üzerinden aracılık edilen, Satıcı ile son müşteri arasındaki tamamlanmış satış sözleşmesini ifade eder.\n„Fiyat listesi": Sellercentral'da yayımlanan güncel platform ücretleri ve komisyon özetini ifade eder.`,
    },
    {
      heading: 'Madde 2 – Konu ve Platformun Rolü',
      body: `Platform, Satıcıya son müşterilere mal sunma, yönetme ve satma için teknik altyapı sağlar (katalog yönetimi, ödeme işleme, kargo yardımları, analitik, destek ve pazarlama işlevleri vb.).\n\nSatıcı her zaman kendi adına ve hesabına bağımsız satıcı olarak hareket eder. Platform, Satıcı ile son müşteri arasındaki satış sözleşmesinin tarafı değildir ve komisyoncu sıfatıyla hareket etmez; P2B Md. 2/2 ve DSA Md. 3(j) anlamında çevrimiçi aracılık / çevrimiçi pazar yeridir.\n\nÖdeme işleme ve kargo etiketi gibi ek hizmetler, Platformu satış sözleşmesinin tarafı yapmaz.`,
    },
    {
      heading: 'Madde 3 – Kayıt, Hesap ve Doğrulama',
      body: `Kullanım; başarılı kayıt ve — kategoriye / menşe ülkeye bağlı olarak — kimlik ve işletme doğrulamasını gerektirir. Satıcı:\n(a) kişi/şirket, vergi no / KDV kimlik no, IBAN/BIC, ticaret sicili / işyeri ve adres bilgilerini doğru, eksiksiz ve güncel tutar;\n(b) esaslı değişiklikleri en geç yedi (7) iş günü içinde bildirir ve Sellercentral'da günceller;\n(c) talep üzerine kimlik, sicil/işyeri belgesi, vergi/LUCID kanıtlarını on (10) iş günü içinde sunar.\n\nYanlış veya yanıltıcı beyan; reddetme, yeniden talep, askıya alma ve gerektiğinde yetkili makamlara bildirimi haklı kılar. Giriş bilgileri gizlidir; Satıcı, kendi erişim bilgileriyle yapılan işlemlerden, kötüye kullanımdan sorumlu olduğu ölçüde sorumludur.`,
    },
    {
      heading: 'Madde 4 – Satıcının Yükümlülükleri (İlan, Teslimat, Garanti)',
      body: `Satıcı özellikle şunları taahhüt eder:\n1. Yalnızca yasal ürünler sunmak; GPSR ve kategori/ülke kurallarına (WEEE/ElektroG, EPREL, Batarya, VerpackG/LUCID vb.) uymak — Sellercentral Compliance.\n2. Ticari bilgileri (kimlik/adres, vergi, IBAN) eksiksiz ve güncel tutmak.\n3. İlanda belirtilen sürelerde siparişleri karşılamak; AB içinde kural olarak 14 iş gününü aşmamak (yasal olarak aksi belirtilmedikçe).\n4. Gecikme veya stok yokluğunda müşteriyi en geç 24 saat içinde bilgilendirmek.\n5. Yasal garanti haklarını (yeni ürünlerde kural olarak 2 yıl) ve tüketicinin 14 günlük cayma hakkını sağlamak.\n6. İadeleri kolay yürütmek; iade girişinden itibaren 14 gün içinde ödemeyi iade etmek; AB içi iade maliyetini — yasal zorunluluk yoksa — Satıcının karşılaması.\n7. Usulüne uygun fatura kesmek ve saklama sürelerine uymak.\n8. Ürün bilgilerini doğru ve yanıltıcı olmadan sunmak; yetkisiz katalog değişikliği yapmamak.\n9. Platform kanallarından gelen müşteri taleplerine makul sürede yanıt vermek.\n10. Fiyat anlaşması, manipülasyon veya haksız rekabet yapmamak.`,
    },
    {
      heading: 'Madde 5 – Yasak ve Kısıtlı Ürünler',
      body: `Yürürlükteki hukuka aykırı veya Platformda satışı yasak ürünler sunulamaz; bunlar arasında — sınırlı olmamak üzere — sahte marka, silah ve benzeri, ruhsatsız reçeteli ilaç, çalıntı mal, yaş doğrulamasız tütün/nikotin, yaptırım/ihracat kontrolüne aykırı ürünler ve yasal olarak yasaklı maddeler yer alır.\n\nPlatform, Sellercentral'da güncel (kapsamı sınırlayıcı olmayan) bir yasaklı/kısıtlı liste yayımlayıp düzenleyici nedenlerle güncelleyebilir. Önemli değişiklikler Madde 21 uyarınca bildirilir. İhlaller ilanın derhal kaldırılması ve Madde 19 kapsamındaki önlemlere yol açabilir.`,
    },
    {
      heading: 'Madde 6 – Fikri Mülkiyet ve Marka',
      body: `Satıcı, yüklediği içerikler üzerinde gerekli haklara sahip olduğunu veya kullanım yetkisi bulunduğunu taahhüt eder.\n\nBaşkasına ait tescilli markalar için Sellercentral → Markalar yetkilendirme süreci zorunludur; kanıt yoksa ilan yasaktır ve önceden haber verilmeden kaldırılabilir. Hak sahipleri Madde 13 üzerinden bildirimde bulunabilir.\n\nYükleme ile Satıcı, Platforma içerikleri Platformda göstermek ve ürünlerin tanıtımı için gerekli pazarlama faaliyetlerinde kullanmak üzere, sözleşme süresiyle (ve makul tasfiye süresiyle) sınırlı, basit, münhasır olmayan, dünya çapında, bedelsiz bir kullanım hakkı tanır. Platform marka/logoları yalnızca yazılı onayla kullanılabilir.`,
    },
    {
      heading: 'Madde 7 – Kişisel Verilerin Korunması (GDPR)',
      body: `Satıcı, müşteri kişisel verilerini yalnızca sözleşmenin ifası için ve gerekli ölçüde işler (GDPR Md. 6/1-b). Hukuki dayanak olmadan üçüncü kişilere aktarım ve Platform dışında, ayrı onay olmadan pazarlama kullanımı yasaktır.\n\nSatıcı: (a) uygun teknik/organizasyonel önlemleri alır (Md. 32); (b) ilgili ihlalleri Platforma ivedilikle bildirir (hedef: 24 saat); (c) ilgili kişi taleplerini 30 gün içinde yanıtlar; (d) gerektiğinde Md. 28 AVV imzalar; (e) yeterli koruma olmadan üçüncü ülkelere aktarım yapmaz.\n\nAyrıntılar Platform gizlilik politikası ve AVV belgelerinde yer alır.`,
    },
    {
      heading: 'Madde 8 – Ödeme, Emanet ve Ödemelerin Satıcıya Aktarımı',
      body: `Son müşteri ödemeleri, Platformun ödeme hizmet sağlayıcısı (özellikle Stripe Connect veya eşdeğer sertifikalı sağlayıcı) üzerinden işlenir. Satıcı, Platformu ve sağlayıcıyı kendi adına/hesabına tahsilat için yetkilendirir; sağlayıcıya/Platforma yapılan ödeme Satıcıya yapılmış sayılır.\n\nFonlar önce emanet/yönetilen hesapta tutulabilir. Satıcıya ödemeler sipariş tamamlandıktan ve — öngörülmüşse — güvenlik tutma süresinden sonra (kural olarak teslimat onayından 7–14 iş günü) Sellercentral'daki takvime göre yapılır. Amaç: iade, cayma ve chargeback riskini dengelemektir.\n\nPlatform; chargeback, iade, dolandırıcılık şüphesi veya açık ücretlerde tutarları geçici alıkoyabilir veya mahsup edebilir. Banka bilgilerinin doğruluğu Satıcıya aittir. Sellercentral aylık özetleri, 30 gün içinde gerekçeli itiraz yoksa kabul edilmiş sayılır.`,
    },
    {
      heading: 'Madde 9 – Komisyonlar, Ücretler ve Fiyatlar',
      body: `Platform, işlem anında geçerli ve Sellercentral'da görünen fiyat listesine göre komisyon/ücret alır. Komisyonlar kural olarak ödeme alındığında kesilir.\n\nÜcret değişiklikleri Madde 21 uyarınca önceden bildirilir. Satış fiyatlarını Satıcı belirler; Platform, Satıcının etkinleştirdiği izinli kampanyalar dışında fiyata müdahale etmez.\n\nTemerrütte yasal gecikme faizi uygulanır; vadesi gelen ücretler ödemelerle mahsup edilebilir.`,
    },
    {
      heading: 'Madde 10 – İade, Cayma ve Chargeback (Komisyona Etki)',
      body: `Tüketici cayma hakkını kullanır veya haklı iade tamamen geri alınırsa, ilgili tutar ve kesilen komisyon iptal edilir / satın alma bedeli tam iade edildiyse komisyon Satıcıya iade edilir. Kısmi iadelerde komisyon orantılı iade edilir.\n\nChargeback durumunda işlem tutarı alıkonabilir; Platform Satıcıyı bilgilendirir. Satıcı delil sunarak işbirliği yapar.`,
    },
    {
      heading: 'Madde 11 – Vergi Yükümlülükleri',
      body: `Satışların KDV açısından doğru ele alınması (OSS veya üye ülke kayıtları dahil) ve vergilerin beyan/ödenmesi yalnızca Satıcının sorumluluğundadır.\n\nPlatform yasal zorunluluk halinde işlem verilerini makamlara iletebilir (örn. UStG § 22f, DAC7). Satıcı gerekli bilgileri sağlar ve Platformun belirli ciroları bildirmek zorunda olabileceğini kabul eder.`,
    },
    {
      heading: 'Madde 12 – Sıralama, Görünürlük ve Reklam (P2B Md. 5)',
      body: `Sıralamanın temel parametreleri: ürün kalitesi ve veri eksiksizliği; müşteri değerlendirmeleri; sipariş karşılama ve teslimat süreleri; fiyatlandırma; katalog güncelliği; hesap uyumu; dönüşüm/etkileşim sinyalleridir.\n\nÜcretli yerleşimler reklam olarak etiketlenir ve organik sıralamayı etkilemez. Platform, kendi ürünlerini üçüncü satıcılara karşı haksız şekilde kayırmaz.`,
    },
    {
      heading: 'Madde 13 – İçerik Denetimi ve Bildirim (DSA)',
      body: `Platform, DSA Md. 16 uyarınca hukuka aykırı olduğu iddia edilen içerikler için bildirim/düzeltme mekanizması işletir. Gerekçeli bildirimler kaldırma, erişim kısıtı veya Madde 19 önlemlerine yol açabilir.\n\nSatıcı kural olarak bilgilendirilir ve — zorunlu hukuki/güvenlik engeli yoksa — görüş bildirir (DSA Md. 17, 20). Açıkça asılsız tekrarlayan bildirimler reddedilebilir.`,
    },
    {
      heading: 'Madde 14 – Tüketiciye Şeffaflık (P2B Md. 6a)',
      body: `Platform, satın alma öncesi ilanın ticari üçüncü taraftan geldiğini ve garanti/cayma bakımından hak-yükümlülük dağılımını gösterir. Satıcı gerekli bilgileri doğru sağlar ve satış sözleşmelerinin ifasında asıl sorumluluğun — bu Sözleşmedeki istisnalar saklı — kendisinde olduğunu kabul eder.`,
    },
    {
      heading: 'Madde 15 – Davranış Kuralları ve Yasak Uygulamalar',
      body: `Yasaklar özellikle: (a) rekabet hukuku ihlali anlaşmalar; (b) sahte/manipüle değerlendirme; (c) sıralama manipülasyonu; (d) Platform verilerini kötüye kullanarak Platform dışı satışa yönlendirme; (e) hukuki dayanak olmadan Platform müşteri verisiyle Platform dışı pazarlama; (f) dolandırıcılık, kimlik sahteciliği, kara para aklama; (g) yaptırım/ihracat kontrolüne aykırı ürünler.`,
    },
    {
      heading: 'Madde 16 – Satıcının Sorumluluğu ve Tazminat',
      body: `Satıcı, bu Sözleşmenin, kanunların veya üçüncü kişi haklarının kusurlu ihlalinden doğan zararlardan sorumludur ve ürün kusuru, hak ihlali vb. üçüncü kişi taleplerine karşı — makul savunma giderleri dahil — Platformu tazmin eder.\n\nGDPR Md. 82 saklıdır. Kast/ağır ihmal yoksa salt mali zararda Platforma karşı sorumluluk, yasal olarak mümkün olduğu ölçüde son 12 aydaki ilgili işlem değeriyle sınırlanabilir.`,
    },
    {
      heading: 'Madde 17 – Platformun Sorumluluk Sınırı',
      body: `Platform; can, vücut, sağlık zararları ile kast veya ağır ihmalde sınırsız sorumludur.\n\nHafif ihmalde yalnızca esaslı (kardinal) yükümlülük ihlalinde ve öngörülebilir tipik zarar ölçüsünde sorumludur. Dolaylı zarar, kâr kaybı, veri kaybı — sınırsız sorumluluk halleri hariç — yasal sınırlar içinde hariç tutulur.\n\nKesintisiz erişilebilirlik garanti edilmez. Mücbir sebep, üçüncü taraf saldırıları, genel internet veya harici sağlayıcı kesintilerinden — Platformun kusuru yoksa — sorumluluk doğmaz.`,
    },
    {
      heading: 'Madde 18 – Mücbir Sebep',
      body: `Makul kontrol dışındaki mücbir sebeplerden (doğal afet, salgın, resmi emir, savaş, geniş çaplı şebeke/enerji kesintisi vb.) kaynaklanan ifa engellerinden taraflar sorumlu tutulmaz. Etkilenen taraf diğerini derhal bilgilendirir ve ifaya dönmeye çalışır.`,
    },
    {
      heading: 'Madde 19 – Askıya Alma, Kısıtlama ve Fesih',
      body: `Platform kademeli önlem alabilir: uyarı; ilan kısıtı/kaldırma; ödemeleri geçici dondurma; ağır/tekrarlayan ihlal veya makam emrinde askı/fesih.\n\nKalıcı askı/fesih öncesi — acil durum veya hukuki engel yoksa — gerekçe ve makul görüş süresi verilir (P2B Md. 4; hedef: en az 7 iş günü).\n\nSatıcı 30 gün önceden feshedebilir. Platform olağan 30 gün; haklı nedenle olağanüstü fesih saklıdır. Devam eden siparişler tamamlanır. Vadesi gelen ödemeler, Madde 8 alıkoymaları saklı, açık borçlar düşülerek ödenir.`,
    },
    {
      heading: 'Madde 20 – Devir',
      body: `Satıcı, Platformun yazılı onayı olmadan hak ve yükümlülüklerini devredemez. Platform, Satıcının hukuki durumunu esaslı biçimde kötüleştirmemek kaydıyla, yeniden yapılandırma/birleşme/işletme devrinde bağlı şirkete devredebilir.`,
    },
    {
      heading: 'Madde 21 – Değişiklikler',
      body: `Değişiklikler yürürlükten en az on beş (15) gün önce e-posta ve/veya Sellercentral bildirimi ile duyurulur (P2B Md. 3); yasal zorunluluk, öngörülemeyen tehlike veya Satıcı yararına daha kısa süre (zorunlu hallerde 3 güne kadar) uygulanabilir.\n\nSüre içinde itiraz edilmez ve kullanım sürerse değişiklikler kabul edilmiş sayılır; itirazda Madde 19 feshi mümkündür. Güncel metin ve sürüm Sellercentral'da görülebilir.`,
    },
    {
      heading: 'Madde 22 – Uyuşmazlık Çözümü',
      body: `Önce dahili çözüm. P2B Md. 11 iç şikayet: info@andertal.com. Kararlara kural olarak 14 gün içinde yazılı itiraz edilebilir.\n\nHarici: AB ODR (https://ec.europa.eu/consumers/odr/) ve P2B Md. 12 arabuluculuk.\n\nAlman hukuku uygulanır (CISG hariç). Satıcı tacir ise ve yasal olarak mümkünse yetkili mahkeme Berlin'dir.`,
    },
    {
      heading: 'Madde 23 – Ek Uyum Gereklilikleri',
      body: `Uygulanabilir olduğu ölçüde Satıcı: KYC/kara para aklama taleplerine; DAC7 işbirliğine; ilgili ürünlerde Batarya ve ElektroG kurallarına; piyasa gözetimine; yasal olarak zorunluysa tedarik zinciri özen yükümlülüklerine uyar. Ürün güvenliği riskleri ve geri çağırmalar Platforma derhal bildirilir.`,
    },
    {
      heading: 'Madde 24 – Son Hükümler ve İletişim',
      body: `Bir hükmün geçersizliği diğerlerini etkilemez. Taraflar geçersiz hükmü ekonomik amaca en yakın geçerli düzenlemeyle değiştirir.\n\nBu Sözleşme, Sellercentral politikaları (yasaklı ürünler, uyum, fiyat listesi) ile birlikte konuya ilişkin tam anlaşmayı oluşturur.\n\nİletişim: info@andertal.com.\nSürüm: ${AGREEMENT_VERSION} · Tarih: ${AGREEMENT_UPDATED}.`,
    },
  ],

  en: [
    {
      heading: 'Preamble – Parties and Binding Effect',
      body: `This Seller–Platform Agreement (the „Agreement") governs the legal relationship between ${DEFAULT_PLATFORM_NAME} (the „Platform") and the registered commercial seller (the „Seller").\n\nBy ticking the acceptance box in Sellercentral and/or by electronic signature, the Seller confirms that they have read and understood this Agreement in full and agree to be bound by all of the following terms.\n\nThis Agreement takes into account in particular: Regulation (EU) 2022/2065 (DSA), Regulation (EU) 2019/1150 (P2B Regulation), Regulation (EU) 2016/679 (GDPR), Regulation (EU) 2023/988 (GPSR), the German Civil Code (BGB) and other applicable EU and German law.\n\nThis Agreement is available in several languages. In case of conflict, the German version alone prevails.`,
    },
    {
      heading: 'Article 1 – Definitions',
      body: `„Platform" means the marketplace infrastructure operated by ${DEFAULT_PLATFORM_NAME} (website, apps, APIs, Sellercentral and related services) and the legal entity operating it.\n„Seller" means any natural or legal person who registers to offer goods via the Platform.\n„End Customer" / „Consumer" means the buyer of a product offered by the Seller.\n„Listing" means each product listing published on the Platform.\n„Sellercentral" means the Seller's management interface.\n„Transaction" means a completed sales contract between Seller and End Customer intermediated via the Platform.\n„Price List" means the current schedule of Platform fees and commissions published in Sellercentral.`,
    },
    {
      heading: 'Article 2 – Subject Matter and Role of the Platform',
      body: `The Platform provides the Seller with technical infrastructure to list, manage and sell goods to End Customers (including catalog tools, payment processing via certified providers, shipping aids, analytics, support interfaces and marketing features).\n\nThe Seller always acts as an independent trader in their own name and for their own account. The Platform is not a party to sales contracts between Seller and End Customer and does not act as a commission agent. It acts as an „online intermediation service" under Art. 2(2) P2B and an „online marketplace" under Art. 3(j) DSA.\n\nAncillary services (e.g. payments, shipping labels) do not make the Platform a party to the underlying sales contract.`,
    },
    {
      heading: 'Article 3 – Registration, Account and Verification',
      body: `Use requires successful registration and, depending on category and country of origin, identity and business verification. The Seller shall:\n(a) provide truthful, complete and current personal/company, tax/VAT ID, IBAN/BIC, commercial register/trade and address data;\n(b) report material changes without delay and update Sellercentral within seven (7) business days;\n(c) submit verification documents (ID of authorized representative, register/trade extract, tax/LUCID evidence) within ten (10) business days upon request.\n\nFalse or misleading information entitles the Platform to refuse, re-request or suspend access and, where criminal activity is suspected, to notify authorities. Credentials must be kept confidential; the Seller is liable for actions under their credentials to the extent they are responsible for misuse.`,
    },
    {
      heading: 'Article 4 – Seller Obligations (Listings, Fulfilment, Warranty)',
      body: `The Seller undertakes in particular to:\n1. Offer only lawful goods and comply with product safety, labelling and consumer law, including GPSR and category/country rules (e.g. WEEE/ElektroG, EPREL, Battery Regulation, VerpackG/LUCID) — see Sellercentral Compliance.\n2. Keep business data (imprint-relevant data, tax data, IBAN) complete and current.\n3. Fulfil orders within stated delivery times; within the EU delivery should generally not exceed 14 business days unless expressly stated and legally permitted.\n4. Inform the End Customer of delay or unavailability immediately, at latest within 24 hours of becoming aware.\n5. Honour statutory warranties (generally 2 years for new goods; used goods may be shorter if permitted and clearly labelled) and the consumer 14-day right of withdrawal.\n6. Handle returns smoothly and refund within 14 days of receiving the return; within the EU return shipping is borne by the Seller unless law provides otherwise.\n7. Issue proper invoices and observe retention periods.\n8. Present product information truthfully and not misleadingly; not alter shared catalog entries without authorization.\n9. Answer customer inquiries via Platform channels within a reasonable time.\n10. Refrain from price-fixing, market manipulation or unfair competition.`,
    },
    {
      heading: 'Article 5 – Prohibited and Restricted Items',
      body: `It is prohibited to offer goods that violate applicable law or whose sale on the Platform is excluded, including without limitation: counterfeits; weapons and weapon-like items; prescription medicines without authorization; stolen goods; tobacco/nicotine without required age verification; goods violating export control or sanctions; narcotics and other legally banned goods.\n\nThe Platform may publish a current non-exhaustive prohibited/restricted list in Sellercentral and update it for regulatory reasons. Material changes are notified under Article 21. Breaches may lead to immediate removal and measures under Article 19.`,
    },
    {
      heading: 'Article 6 – Intellectual Property and Brands',
      body: `The Seller warrants that they hold all rights needed for uploaded content or are authorized to use it.\n\nUse of third-party registered brands requires the Platform brand authorization process (Sellercentral → Brands). Listings under a registered brand without proven authorization are prohibited and may be removed without prior notice. Rights holders may report alleged infringements under Article 13.\n\nBy uploading, the Seller grants the Platform a simple, non-exclusive, worldwide, royalty-free licence, limited to the term of this Agreement (plus reasonable wind-down), to display the content on the Platform and in related Platform marketing as needed to present the offers. Platform trademarks/logos may be used only with prior written consent.`,
    },
    {
      heading: 'Article 7 – Data Protection (GDPR)',
      body: `The Seller processes End Customer personal data solely for contract performance (Art. 6(1)(b) GDPR) and only as necessary. Disclosure to third parties without a legal basis is prohibited; marketing use outside the Platform without separate consent is not allowed.\n\nThe Seller shall: (a) implement appropriate TOMs (Art. 32); (b) notify the Platform of relevant breaches promptly (target: within 24 hours); (c) answer data-subject requests within 30 days; (d) conclude a DPA under Art. 28 where required; (e) not transfer data to third countries without adequate protection.\n\nDetails appear in the Platform privacy notice and any DPA.`,
    },
    {
      heading: 'Article 8 – Payments, Escrow and Payouts',
      body: `End Customer payments are processed via the Platform's payment provider (in particular Stripe Connect or equivalent certified providers). The Seller authorizes the Platform and provider to collect payments on the Seller's behalf. Receipt by the provider/Platform counts as receipt by the Seller.\n\nFunds may first be held in an account managed by the Platform or provider. Payouts follow order completion and — where applicable — a security holding period (generally 7–14 business days after delivery confirmation), per the schedule in Sellercentral, to absorb returns, withdrawals and chargebacks.\n\nThe Platform may temporarily withhold or set off amounts for justified chargebacks, returns, fraud suspicion or open fees. The Seller is responsible for correct bank details. Monthly statements in Sellercentral are deemed accepted unless disputed with reasons within 30 days.`,
    },
    {
      heading: 'Article 9 – Commissions, Fees and Pricing',
      body: `The Platform charges transaction fees/commissions according to the Price List current at the time of the Transaction and visible in Sellercentral. Commissions are generally deducted upon payment receipt.\n\nFee changes are notified under Article 21. The Seller sets listing prices independently; the Platform does not influence prices except via Seller-activated permitted campaigns.\n\nDefault interest under § 288 BGB may apply to overdue fees. The Platform may set off due fees against payouts.`,
    },
    {
      heading: 'Article 10 – Returns, Withdrawal and Chargebacks (Effect on Commission)',
      body: `If a consumer withdraws or a justified return is fully reversed, the related amount including the retained commission is cancelled / the commission is refunded to the Seller if the purchase price was fully reversed. Partial returns lead to a proportional commission refund.\n\nChargebacks may result in withholding the transaction amount; the Platform notifies the Seller. The Seller cooperates and provides evidence.`,
    },
    {
      heading: 'Article 11 – Tax Obligations',
      body: `The Seller alone is responsible for correct VAT treatment of sales (including OSS or Member State registrations) and for declaring and paying all taxes on their turnover.\n\nWhere legally required, the Platform may transmit transaction data to authorities (e.g. § 22f German VAT Act, DAC7). The Seller provides required information and acknowledges that the Platform may be obliged to report certain revenues.`,
    },
    {
      heading: 'Article 12 – Ranking, Visibility and Advertising (P2B Art. 5)',
      body: `Main ranking parameters include: product quality and data completeness; customer reviews; fulfilment rate and delivery times; pricing; catalogue freshness; account compliance; and relevant conversion/engagement signals.\n\nPaid placements are labelled as advertising and do not affect organic ranking of other offers. The Platform will not unfairly prefer its own offers over third-party sellers.`,
    },
    {
      heading: 'Article 13 – Content Moderation and Notice Procedure (DSA)',
      body: `Under Art. 16 DSA the Platform operates a notice-and-action procedure for allegedly illegal listings or content. Justified notices may lead to removal, access restriction or measures under Article 19.\n\nThe Seller is generally informed and given an opportunity to comment unless mandatory legal or safety reasons prevent this (Arts. 17, 20 DSA). Manifestly unfounded repeated notices may be rejected.`,
    },
    {
      heading: 'Article 14 – Consumer Transparency (P2B Art. 6a)',
      body: `Before purchase the Platform makes clear that the offer comes from a commercial third party and indicates the allocation of rights and obligations (especially warranty and withdrawal) between Seller and Platform. The Seller provides all necessary data truthfully and confirms that primary responsibility for performing sales contracts rests with the Seller, subject to this Agreement.`,
    },
    {
      heading: 'Article 15 – Code of Conduct and Prohibited Practices',
      body: `Prohibited in particular: (a) anti-competitive agreements; (b) fake or manipulated reviews; (c) artificial ranking manipulation; (d) soliciting Platform customers off-platform by misuse of Platform data; (e) using Platform customer data for off-platform marketing without legal basis; (f) fraud, identity deception, money laundering; (g) offers violating export control/sanctions law.`,
    },
    {
      heading: 'Article 16 – Seller Liability and Indemnity',
      body: `The Seller is liable for damage caused to the Platform by culpable breach of this Agreement, applicable law or third-party rights, and indemnifies the Platform against third-party claims arising from product defects, IP infringements or other Seller breaches, including reasonable defence costs.\n\nGDPR Art. 82 remains unaffected. For pure financial loss without intent or gross negligence, Seller liability to the Platform may be limited to the value of the relevant Transactions over the preceding twelve (12) months, where legally permitted.`,
    },
    {
      heading: 'Article 17 – Platform Limitation of Liability',
      body: `The Platform has unlimited liability for injury to life, body or health and for intentional or grossly negligent damage.\n\nFor slight negligence the Platform is liable only for breach of material contractual duties (cardinal duties) and only for typical foreseeable damage. Liability for indirect damage, lost profit and data loss is excluded except in cases of unlimited liability, where legally permitted.\n\nContinuous availability is not guaranteed. No liability arises for force majeure, third-party attacks, general internet outages or external providers unless the Platform is at fault.`,
    },
    {
      heading: 'Article 18 – Force Majeure',
      body: `Neither party is liable for non-performance caused by force majeure outside reasonable control (e.g. natural disasters, epidemics, official orders, war, large-scale network/energy outages). The affected party notifies the other promptly and seeks to resume performance.`,
    },
    {
      heading: 'Article 19 – Suspension, Restriction and Termination',
      body: `The Platform may take graduated measures: warning with cure period; restrict/remove listings; temporarily freeze payouts; for serious/repeated breaches or official orders, suspend or terminate.\n\nBefore permanent suspension/termination the Seller receives — except in emergencies or where legally barred — reasons and a reasonable opportunity to comment (Art. 4 P2B; target: at least 7 business days).\n\nThe Seller may terminate with 30 days' notice. The Platform may terminate ordinarily with 30 days' notice; extraordinary termination for cause remains reserved. Open orders must still be fulfilled. Due payouts are remitted after deducting open claims, subject to Article 8 withholds.`,
    },
    {
      heading: 'Article 20 – Assignment',
      body: `The Seller may not assign rights or obligations without the Platform's prior written consent. The Platform may assign to an affiliate in a restructuring, merger or business transfer if this does not materially worsen the Seller's legal position.`,
    },
    {
      heading: 'Article 21 – Amendments',
      body: `Amendments are notified at least fifteen (15) days before they take effect by email and/or Sellercentral notice (Art. 3 P2B), unless a shorter period is required by law, to avert unforeseen risks or for the Seller's benefit (in mandatory cases down to 3 days).\n\nIf the Seller does not object within the notice period and continues use, amendments are deemed accepted; objection allows termination under Article 19. The current text and version are available in Sellercentral.`,
    },
    {
      heading: 'Article 22 – Dispute Resolution',
      body: `Disputes are first handled internally. Internal complaint contact under Art. 11 P2B: info@andertal.com. Platform decisions may generally be contested in writing within 14 days.\n\nExternal options: EU ODR portal (https://ec.europa.eu/consumers/odr/) and mediation under Art. 12 P2B.\n\nGerman law applies excluding CISG. If the Seller is a merchant and law permits, venue is Berlin.`,
    },
    {
      heading: 'Article 23 – Further Compliance',
      body: `Where applicable the Seller observes: KYC/AML requests; DAC7 cooperation; Battery Regulation and ElektroG for relevant products; market surveillance law; and supply-chain diligence where legally required. Product safety risks and recalls must be reported to the Platform without delay.`,
    },
    {
      heading: 'Article 24 – Final Provisions and Contact',
      body: `If any provision is invalid, the remainder stays in force. The parties replace an invalid provision with a valid one closest to its economic purpose.\n\nTogether with Sellercentral policies (prohibited items, compliance, Price List), this Agreement is the entire agreement on its subject matter.\n\nContact: info@andertal.com.\nVersion: ${AGREEMENT_VERSION} · Effective: ${AGREEMENT_UPDATED}.`,
    },
  ],
}

// FR / ES / IT: courtesy translations aligned to EN structure (German remains authoritative).
function mirrorFromEn(localePrefix) {
  const en = SECTIONS.en
  const mapHeading = {
    fr: {
      'Preamble – Parties and Binding Effect': 'Préambule – Parties et effet obligatoire',
      'Article 1 – Definitions': 'Article 1 – Définitions',
      'Article 2 – Subject Matter and Role of the Platform': 'Article 2 – Objet et rôle de la Plateforme',
      'Article 3 – Registration, Account and Verification': 'Article 3 – Inscription, compte et vérification',
      'Article 4 – Seller Obligations (Listings, Fulfilment, Warranty)': 'Article 4 – Obligations du Vendeur (annonces, exécution, garantie)',
      'Article 5 – Prohibited and Restricted Items': 'Article 5 – Articles interdits et restreints',
      'Article 6 – Intellectual Property and Brands': 'Article 6 – Propriété intellectuelle et marques',
      'Article 7 – Data Protection (GDPR)': 'Article 7 – Protection des données (RGPD)',
      'Article 8 – Payments, Escrow and Payouts': 'Article 8 – Paiements, séquestre et versements',
      'Article 9 – Commissions, Fees and Pricing': 'Article 9 – Commissions, frais et prix',
      'Article 10 – Returns, Withdrawal and Chargebacks (Effect on Commission)': 'Article 10 – Retours, rétractation et chargebacks',
      'Article 11 – Tax Obligations': 'Article 11 – Obligations fiscales',
      'Article 12 – Ranking, Visibility and Advertising (P2B Art. 5)': 'Article 12 – Classement, visibilité et publicité (P2B art. 5)',
      'Article 13 – Content Moderation and Notice Procedure (DSA)': 'Article 13 – Modération et procédure de signalement (DSA)',
      'Article 14 – Consumer Transparency (P2B Art. 6a)': 'Article 14 – Transparence envers les consommateurs (P2B art. 6a)',
      'Article 15 – Code of Conduct and Prohibited Practices': 'Article 15 – Code de conduite et pratiques interdites',
      'Article 16 – Seller Liability and Indemnity': 'Article 16 – Responsabilité du Vendeur et indemnisation',
      'Article 17 – Platform Limitation of Liability': 'Article 17 – Limitation de responsabilité de la Plateforme',
      'Article 18 – Force Majeure': 'Article 18 – Force majeure',
      'Article 19 – Suspension, Restriction and Termination': 'Article 19 – Suspension, restriction et résiliation',
      'Article 20 – Assignment': 'Article 20 – Cession',
      'Article 21 – Amendments': 'Article 21 – Modifications',
      'Article 22 – Dispute Resolution': 'Article 22 – Règlement des litiges',
      'Article 23 – Further Compliance': 'Article 23 – Conformité complémentaire',
      'Article 24 – Final Provisions and Contact': 'Article 24 – Dispositions finales et contact',
    },
    es: {
      'Preamble – Parties and Binding Effect': 'Preámbulo – Partes y efecto vinculante',
      'Article 1 – Definitions': 'Artículo 1 – Definiciones',
      'Article 2 – Subject Matter and Role of the Platform': 'Artículo 2 – Objeto y función de la Plataforma',
      'Article 3 – Registration, Account and Verification': 'Artículo 3 – Registro, cuenta y verificación',
      'Article 4 – Seller Obligations (Listings, Fulfilment, Warranty)': 'Artículo 4 – Obligaciones del Vendedor (anuncios, cumplimiento, garantía)',
      'Article 5 – Prohibited and Restricted Items': 'Artículo 5 – Artículos prohibidos y restringidos',
      'Article 6 – Intellectual Property and Brands': 'Artículo 6 – Propiedad intelectual y marcas',
      'Article 7 – Data Protection (GDPR)': 'Artículo 7 – Protección de datos (RGPD)',
      'Article 8 – Payments, Escrow and Payouts': 'Artículo 8 – Pagos, depósito y desembolsos',
      'Article 9 – Commissions, Fees and Pricing': 'Artículo 9 – Comisiones, tarifas y precios',
      'Article 10 – Returns, Withdrawal and Chargebacks (Effect on Commission)': 'Artículo 10 – Devoluciones, desistimiento y chargebacks',
      'Article 11 – Tax Obligations': 'Artículo 11 – Obligaciones fiscales',
      'Article 12 – Ranking, Visibility and Advertising (P2B Art. 5)': 'Artículo 12 – Clasificación, visibilidad y publicidad (P2B art. 5)',
      'Article 13 – Content Moderation and Notice Procedure (DSA)': 'Artículo 13 – Moderación y procedimiento de aviso (DSA)',
      'Article 14 – Consumer Transparency (P2B Art. 6a)': 'Artículo 14 – Transparencia hacia el consumidor (P2B art. 6a)',
      'Article 15 – Code of Conduct and Prohibited Practices': 'Artículo 15 – Código de conducta y prácticas prohibidas',
      'Article 16 – Seller Liability and Indemnity': 'Artículo 16 – Responsabilidad del Vendedor e indemnización',
      'Article 17 – Platform Limitation of Liability': 'Artículo 17 – Limitación de responsabilidad de la Plataforma',
      'Article 18 – Force Majeure': 'Artículo 18 – Fuerza mayor',
      'Article 19 – Suspension, Restriction and Termination': 'Artículo 19 – Suspensión, restricción y terminación',
      'Article 20 – Assignment': 'Artículo 20 – Cesión',
      'Article 21 – Amendments': 'Artículo 21 – Modificaciones',
      'Article 22 – Dispute Resolution': 'Artículo 22 – Resolución de controversias',
      'Article 23 – Further Compliance': 'Artículo 23 – Cumplimiento adicional',
      'Article 24 – Final Provisions and Contact': 'Artículo 24 – Disposiciones finales y contacto',
    },
    it: {
      'Preamble – Parties and Binding Effect': 'Preambolo – Parti ed efficacia vincolante',
      'Article 1 – Definitions': 'Articolo 1 – Definizioni',
      'Article 2 – Subject Matter and Role of the Platform': 'Articolo 2 – Oggetto e ruolo della Piattaforma',
      'Article 3 – Registration, Account and Verification': 'Articolo 3 – Registrazione, account e verifica',
      'Article 4 – Seller Obligations (Listings, Fulfilment, Warranty)': 'Articolo 4 – Obblighi del Venditore (inserzioni, adempimento, garanzia)',
      'Article 5 – Prohibited and Restricted Items': 'Articolo 5 – Articoli vietati e soggetti a restrizioni',
      'Article 6 – Intellectual Property and Brands': 'Articolo 6 – Proprietà intellettuale e marchi',
      'Article 7 – Data Protection (GDPR)': 'Articolo 7 – Protezione dei dati (GDPR)',
      'Article 8 – Payments, Escrow and Payouts': 'Articolo 8 – Pagamenti, escrow e versamenti',
      'Article 9 – Commissions, Fees and Pricing': 'Articolo 9 – Commissioni, costi e prezzi',
      'Article 10 – Returns, Withdrawal and Chargebacks (Effect on Commission)': 'Articolo 10 – Resi, recesso e chargeback',
      'Article 11 – Tax Obligations': 'Articolo 11 – Obblighi fiscali',
      'Article 12 – Ranking, Visibility and Advertising (P2B Art. 5)': 'Articolo 12 – Ranking, visibilità e pubblicità (P2B art. 5)',
      'Article 13 – Content Moderation and Notice Procedure (DSA)': 'Articolo 13 – Moderazione e procedura di segnalazione (DSA)',
      'Article 14 – Consumer Transparency (P2B Art. 6a)': 'Articolo 14 – Trasparenza verso i consumatori (P2B art. 6a)',
      'Article 15 – Code of Conduct and Prohibited Practices': 'Articolo 15 – Codice di condotta e pratiche vietate',
      'Article 16 – Seller Liability and Indemnity': 'Articolo 16 – Responsabilità del Venditore e manleva',
      'Article 17 – Platform Limitation of Liability': 'Articolo 17 – Limitazione di responsabilità della Piattaforma',
      'Article 18 – Force Majeure': 'Articolo 18 – Forza maggiore',
      'Article 19 – Suspension, Restriction and Termination': 'Articolo 19 – Sospensione, limitazione e cessazione',
      'Article 20 – Assignment': 'Articolo 20 – Cessione',
      'Article 21 – Amendments': 'Articolo 21 – Modifiche',
      'Article 22 – Dispute Resolution': 'Articolo 22 – Risoluzione delle controversie',
      'Article 23 – Further Compliance': 'Articolo 23 – Ulteriori obblighi di conformità',
      'Article 24 – Final Provisions and Contact': 'Articolo 24 – Disposizioni finali e contatti',
    },
  }
  const headings = mapHeading[localePrefix] || {}
  // Body: EN text + short governing notice at top for non-DE readers who need clarity
  const note =
    localePrefix === 'fr'
      ? 'Traduction de courtoisie. En cas de divergence, seule la version allemande fait foi.\n\n'
      : localePrefix === 'es'
        ? 'Traducción de cortesía. En caso de discrepancia, prevalece únicamente la versión alemana.\n\n'
        : 'Traduzione di cortesia. In caso di contrasto prevale esclusivamente la versione tedesca.\n\n'
  return en.map((sec) => ({
    heading: headings[sec.heading] || sec.heading,
    body: note + sec.body,
  }))
}

SECTIONS.fr = mirrorFromEn('fr')
SECTIONS.es = mirrorFromEn('es')
SECTIONS.it = mirrorFromEn('it')

function normalizeAgreementLocale(locale) {
  const loc = String(locale || 'de').slice(0, 2).toLowerCase()
  if (SECTIONS[loc]) return loc
  return 'en'
}

/**
 * @param {string} [locale]
 * @returns {{ version: string, updated: string, locale: string, title: string, governing_note: string, sections: Array<{heading:string,body:string}> }}
 */
function getSellerAgreement(locale) {
  const loc = normalizeAgreementLocale(locale)
  return {
    version: AGREEMENT_VERSION,
    updated: AGREEMENT_UPDATED,
    locale: loc,
    title: TITLES[loc] || TITLES.en,
    governing_note: GOVERNING_NOTES[loc] || GOVERNING_NOTES.en,
    sections: SECTIONS[loc] || SECTIONS.en,
  }
}

module.exports = {
  AGREEMENT_VERSION,
  AGREEMENT_UPDATED,
  DEFAULT_PLATFORM_NAME,
  getSellerAgreement,
  normalizeAgreementLocale,
}
