import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";

export const metadata = {
  title: "AGB – Andertal Marktplatz",
  description: "Allgemeine Geschäftsbedingungen des Andertal Marktplatzes",
};

export default function AgbPage() {
  return (
    <>
      <ShopHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "inherit", color: "#111827", lineHeight: 1.7 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: 8 }}>Allgemeine Geschäftsbedingungen (AGB)</h1>
        <p style={{ color: "#6b7280", marginBottom: 40 }}>Stand: Juni 2025</p>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 1 Geltungsbereich und Vertragsparteien</h2>
          <p>
            Diese Allgemeinen Geschäftsbedingungen gelten für die Nutzung des Online-Marktplatzes Andertal (nachfolgend „Plattform"),
            betrieben von Andertal (nachfolgend „Plattformbetreiber"). Der Plattformbetreiber vermittelt Kaufverträge zwischen
            unabhängigen Verkäufern (nachfolgend „Verkäufer") und Käufern (nachfolgend „Käufer").
          </p>
          <p style={{ marginTop: 12 }}>
            <strong>Der Plattformbetreiber ist nicht Vertragspartei des Kaufvertrags.</strong> Kaufverträge kommen ausschließlich
            zwischen dem jeweiligen Käufer und dem jeweiligen Verkäufer zustande.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 2 Leistungen der Plattform</h2>
          <p>
            Andertal stellt eine technische Infrastruktur zur Verfügung, über die Verkäufer ihre Produkte anbieten und Käufer
            diese erwerben können. Die Plattform übernimmt die Zahlungsabwicklung im Namen und auf Rechnung der Verkäufer.
            Für diese Vermittlungsleistung erhebt der Plattformbetreiber eine Provision von den Verkäufern.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 3 Vertragsschluss</h2>
          <p>
            Mit dem Absenden einer Bestellung gibt der Käufer ein verbindliches Angebot zum Kauf ab. Der Kaufvertrag kommt
            mit der Auftragsbestätigung des Verkäufers zustande. Die Auftragsbestätigung wird per E-Mail übermittelt.
          </p>
          <p style={{ marginTop: 12 }}>
            Vertragspartner des Käufers ist ausschließlich der auf der Produktseite und im Checkout ausgewiesene Verkäufer,
            nicht Andertal als Plattformbetreiber.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 4 Preise und Zahlung</h2>
          <p>
            Alle auf der Plattform angezeigten Preise sind Endpreise in Euro inklusive der gesetzlichen Mehrwertsteuer (sofern
            anwendbar) und zuzüglich etwaiger Versandkosten. Die Preise werden ausschließlich vom jeweiligen Verkäufer festgelegt.
          </p>
          <p style={{ marginTop: 12 }}>
            Die Zahlung erfolgt über die von der Plattform bereitgestellten Zahlungsmethoden (u. a. Kreditkarte, SEPA-Lastschrift).
            Die Zahlungsabwicklung wird von Stripe Inc. als Zahlungsdienstleister verarbeitet.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 5 Lieferung</h2>
          <p>
            Lieferung und Versand obliegen dem jeweiligen Verkäufer. Lieferzeiten und -bedingungen werden auf den Produktseiten
            angegeben. Risiko und Gefahr gehen mit Übergabe der Ware an den Beförderer auf den Käufer über.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 6 Widerrufsrecht</h2>
          <p>
            Verbrauchern steht ein gesetzliches Widerrufsrecht von 14 Tagen zu. Widerrufsansprüche sind gegenüber dem
            jeweiligen Verkäufer, nicht gegenüber Andertal, geltend zu machen. Die Einzelheiten entnehmen Sie bitte der
            Widerrufsbelehrung des jeweiligen Verkäufers, die auf dessen Produktseiten oder im Bestellprozess zugänglich ist.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 7 Gewährleistung und Haftung</h2>
          <p>
            Gewährleistungsansprüche sind ausschließlich gegenüber dem jeweiligen Verkäufer geltend zu machen. Der
            Plattformbetreiber haftet nicht für die Qualität, Beschaffenheit oder Rechtmäßigkeit der angebotenen Produkte,
            soweit er nicht selbst als Verkäufer auftritt.
          </p>
          <p style={{ marginTop: 12 }}>
            Andertal haftet für Schäden, die durch die Plattformnutzung entstehen, nur bei Vorsatz oder grober Fahrlässigkeit
            sowie bei der Verletzung wesentlicher Vertragspflichten.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 8 Datenschutz</h2>
          <p>
            Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer Datenschutzerklärung und den Vorgaben der
            Datenschutz-Grundverordnung (DSGVO). Zur Abwicklung von Zahlungen werden erforderliche Daten an Stripe Inc.
            weitergegeben.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 9 Streitbeilegung</h2>
          <p>
            Die Europäische Kommission stellt unter{" "}
            <a href="https://ec.europa.eu/consumers/odr" style={{ color: "#2563eb" }} target="_blank" rel="noreferrer">
              https://ec.europa.eu/consumers/odr
            </a>{" "}
            eine Plattform zur Online-Streitbeilegung (OS) bereit. Wir sind nicht verpflichtet und nicht bereit, an
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 10 Anwendbares Recht und Gerichtsstand</h2>
          <p>
            Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand für alle Streitigkeiten aus der Nutzung der
            Plattform ist, soweit gesetzlich zulässig, der Sitz des Plattformbetreibers.
          </p>
        </section>

        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: 12 }}>§ 11 Änderungen der AGB</h2>
          <p>
            Der Plattformbetreiber behält sich vor, diese AGB jederzeit zu ändern. Änderungen werden den registrierten
            Nutzern per E-Mail mitgeteilt. Die weitere Nutzung der Plattform nach Mitteilung gilt als Zustimmung zu den
            geänderten AGB.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
