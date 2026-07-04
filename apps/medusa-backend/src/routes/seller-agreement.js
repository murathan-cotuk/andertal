'use strict'
const { Router } = require('express')

module.exports = function createSellerAgreementRouter({ verifySellerPassword, getProductsDbClient }) {
      const CONTRACT_SECTIONS_SIGN = {
        de: [
          { heading: 'Praeambel', body: 'Diese Haendler-Plattform-Vereinbarung (nachfolgend "Vereinbarung") regelt die Rechtsbeziehung zwischen der Andertal GmbH (nachfolgend "Plattform") und dem registrierten gewerblichen Verkaeufer (nachfolgend "Verkaeufer"). Mit elektronischer Unterzeichnung erklaert sich der Verkaeufer mit allen nachfolgenden Bedingungen einverstanden. Die Vereinbarung entspricht den Anforderungen der Verordnung (EU) 2022/2065 (Digital Services Act, "DSA"), der Verordnung (EU) 2019/1150 ueber die Foerderung von Fairness und Transparenz fuer gewerbliche Nutzer von Online-Vermittlungsdiensten (P2B-Verordnung), der Verordnung (EU) 2016/679 (Datenschutz-Grundverordnung, "DSGVO"), dem Gesetz gegen den unlauteren Wettbewerb (UWG), dem deutschen Buergerlichen Gesetzbuch (BGB) sowie allen weiteren anwendbaren nationalen und europaeischen Rechtsakten.' },
          { heading: 'SS 1 - Vertragsgegenstand und Plattformleistungen', body: 'Die Plattform stellt dem Verkaeufer eine technische Online-Infrastruktur zur Verfuegung, die es ermoeglicht, Waren gegenueber Endverbrauchern anzubieten, zu verwalten und zu verkaufen. Zu den Plattformleistungen gehoeren insbesondere: Bereitstellung einer Produktlistungs- und Katalogverwaltung, Abwicklung des Zahlungsverkehrs ueber zertifizierte Zahlungsdienstleister, Logistikunterstuetzung und Versandverfolgung, Bereitstellung von Verkaeufer-Analysewerkzeugen sowie Kundensupport-Schnittstellen. Der Verkaeufer tritt als eigenverantwortlicher gewerblicher Haendler im eigenen Namen und auf eigene Rechnung auf. Die Plattform ist kein Vertragspartner der Kaufvertraege zwischen Verkaeufer und Endkunden und tritt nicht als Kommissionaer auf. Die Plattform behaelt sich das Recht vor, den Leistungsumfang bei angemessener Vorabkuendigung (mindestens 30 Tage) zu aendern, sofern keine wesentliche Beeintraechtigung des Verkaeufers entsteht.' },
          { heading: 'SS 2 - Registrierung und Verifizierung', body: 'Der Zugang zur Plattform setzt eine vollstaendige Registrierung und erfolgreiche Identitaets- und Unternehmensverifizierung voraus. Der Verkaeufer ist verpflichtet: (a) wahrheitsgemaesse, vollstaendige und aktuelle Angaben zu Person, Unternehmen, Steuernummer (USt-IdNr.), Bankverbindung (IBAN/BIC) und Handelsregisternummer zu machen; (b) unverzueglich, spaetestens binnen 7 Werktagen, Aktualisierungen bei wesentlichen Aenderungen dieser Daten vorzunehmen; (c) Pruefungsunterlagen (Personalausweis, Handelsregisterauszug, Nachweis der Steuernummer) auf Anforderung der Plattform innerhalb von 10 Werktagen einzureichen. Falsche Angaben bei der Registrierung berechtigen die Plattform zur sofortigen Kontosperrung und ggf. zur Strafanzeige. Die Plattform erhebt und verarbeitet Registrierungsdaten gemaess ihrer Datenschutzerklaerung.' },
          { heading: 'SS 3 - Produktlistung und Inhaltspflichten', body: 'Der Verkaeufer ist fuer alle von ihm eingestellten Produkte und Inhalte allein verantwortlich. Er verpflichtet sich: (a) ausschliesslich Waren anzubieten, die den geltenden Produktsicherheitsvorschriften (EU-Produktsicherheitsverordnung 2023/988), CE-Kennzeichnungspflichten, Verpackungsgesetz (VerpackG) und sonstigen Kennzeichnungsvorschriften entsprechen; (b) Produktbeschreibungen, Bilder, Preisangaben und technische Daten vollstaendig, korrekt und nicht irrefuehrend bereitzustellen gemaess SS 5 UWG und Preisangabenverordnung (PAngV); (c) verbotene Waren (Waffen, Betaeubungsmittel, gefaelschte Markenartikel, urheberrechtsverletzendes Material, Waren mit Exportbeschraenkungen) unter keinen Umstaenden anzubieten; (d) alle erforderlichen Lizenzen, Zulassungen und Genehmigungen fuer die angebotenen Waren zu besitzen und der Plattform auf Anfrage nachzuweisen; (e) Preisauszeichnungen gemaess PAngV vorzunehmen, einschliesslich Grundpreisangabe bei mengenabhaengiger Preisgestaltung.' },
          { heading: 'SS 4 - Bestellabwicklung und Lieferpflichten', body: 'Der Verkaeufer verpflichtet sich zu einer zuverlaessigen und termingerechten Bestellabwicklung. Konkret gilt: (a) Bestellungen sind innerhalb der im Angebot angegebenen Lieferzeit zu erfuellen; eine maximale Lieferzeit von 14 Werktagen innerhalb der EU darf grundsaetzlich nicht ueberschritten werden; (b) bei Lieferverzoegerungen oder Nichtverfuegbarkeit ist der Kunde unverzueglich, spaetestens innerhalb von 24 Stunden nach Bekanntwerden der Verzoegerung, zu benachrichtigen; (c) Verbrauchern ist ein gesetzliches 14-taegiges Widerrufsrecht gemaess SS 355 ff. BGB in Verbindung mit der EU-Verbraucherrechterichtlinie 2011/83/EU zu gewaehren; (d) der Verkaeufer stellt dem Kaeufer eine ordentliche Rechnung gemaess SS 14 UStG aus und bewahrt Kopien fuer mindestens 10 Jahre auf; (e) die Verpackungsvorschriften des VerpackG sind einzuhalten, insbesondere die Pflicht zur Registrierung im LUCID-Register.' },
          { heading: 'SS 5 - Gewaehrleistung und Retouren', body: 'Der Verkaeufer gewaehrt Endkunden alle gesetzlichen Gewaehrleistungsrechte gemaess SS 434 ff. BGB. Dies umfasst: (a) eine Gewaehrleistungsfrist von 2 Jahren ab Lieferung fuer Neuware und 1 Jahr fuer gebrauchte Ware (bei entsprechender Kennzeichnung); (b) das Recht des Kaeufern auf Nacherfuellung (Reparatur oder Ersatzlieferung), Minderung oder Ruecktritt bei mangelhafter Ware; (c) ein Retourenmanagement, das eine unkomplizierte Ruecksendung gewaehrleistet; Retourenkosten innerhalb der EU traegt der Verkaeufer, sofern keine abweichende gesetzliche Regelung gilt; (d) Gutschriften oder Erstattungen sind innerhalb von 14 Tagen nach Eingang der Retoure abzuwickeln; (e) bei Warenmaengeln, die ein Sicherheitsrisiko darstellen, ist die Plattform unverzueglich zu benachrichtigen und ggf. ein Produktrueckruf einzuleiten.' },
          { heading: 'SS 6 - Datenschutz und Vertraulichkeit (DSGVO)', body: 'Der Verkaeufer verarbeitet personenbezogene Daten von Endkunden (Name, Anschrift, E-Mail, Bestelldaten, Zahlungsdaten) ausschliesslich zum Zweck der Vertragserfuellung (Art. 6 Abs. 1 lit. b DSGVO) und darf diese Daten nicht fuer andere Zwecke, insbesondere nicht fuer Werbung, verwenden, sofern keine gesonderte Einwilligung vorliegt. Folgende Pflichten gelten: (a) Einrichtung und Aufrechterhaltung angemessener technischer und organisatorischer Massnahmen (TOMs) zum Schutz personenbezogener Daten gemaess Art. 32 DSGVO; (b) Meldung von Datenpannen, die Kundendaten betreffen, gegenueber der Plattform innerhalb von 24 Stunden und gegenueber der zust. Aufsichtsbehoerde binnen 72 Stunden gemaess Art. 33 DSGVO; (c) Abschluss eines Auftragsverarbeitungsvertrags (AVV) mit der Plattform gemaess Art. 28 DSGVO, soweit eine Auftragsverarbeitung stattfindet; (d) Beantwortung von Betroffenenanfragen (Auskunft, Loeschung, Berichtigung, Einschraenkung) innerhalb von 30 Kalendertagen; (e) keine Datenuebertragung in Drittlaender ohne angemessenes Schutzniveau gemaess Art. 44 ff. DSGVO.' },
          { heading: 'SS 7 - Provisionen und Abrechnungsmodalitaeten', body: 'Fuer die Nutzung der Plattform erhebt die Plattform eine Transaktionsgebuehr gemaess der zum Zeitpunkt des Vertragsschlusses gueltigen Preisliste, die dem Verkaeufer im Seller-Dashboard zugaenglich ist. Es gelten folgende Regelungen: (a) Provisionen werden automatisch bei Auftragsabschluss (Zahlungseingang) vom Transaktionsbetrag abgezogen; (b) Auszahlungen an den Verkaeufer erfolgen nach einer Sicherheitshaltefrist von 7 bis 14 Werktagen nach Lieferbesraetigung, um Retouren und Chargebacks abzufedern; (c) die Plattform ist berechtigt, Betraege bei begruendeten Rueckforderungen (Chargebacks, Retouren, Betrug, Produktmaengeln) einzubehalten oder zu verrechnen; (d) bei Verzug mit etwaigen Gebuehrenzahlungen werden Verzugszinsen in Hoehe von 9 Prozentpunkten ueber dem Basiszinssatz gemaess SS 288 Abs. 2 BGB faellig; (e) Abrechnungen und Kontoauszuege werden dem Verkaeufer monatlich im Seller-Dashboard bereitgestellt und gelten als anerkannt, wenn keine Beanstandung innerhalb von 30 Tagen erhoben wird.' },
          { heading: 'SS 7a - Zahlungsermaechtigung und Zahlungsfluss', body: 'Der Verkaeufer bevollmaechtigt die Plattform und deren Zahlungsdienstleister (insbesondere Stripe Connect), Zahlungen von Endkunden in seinem Namen und auf seine Rechnung entgegenzunehmen. Der Zahlungseingang beim Zahlungsdienstleister oder der Plattform gilt als Zahlungseingang beim Verkaeufer. Zahlungen werden ueber Stripe Connect oder gleichwertige zertifizierte Zahlungsdienstleister abgewickelt. Der Verkaeufer nimmt zur Kenntnis, dass Gelder zunaechst auf einem von der Plattform verwalteten Treuhandkonto eingehen, bevor sie nach Ablauf der Sicherheitshaltefrist an den Verkaeufer ausgezahlt werden.' },
          { heading: 'SS 7b - Provisionserstattung bei Retouren', body: 'Nimmt ein Kaeufer sein Widerrufsrecht wahr oder wird eine Retoure verarbeitet, wird der zugehoerige Bestellbetrag einschliesslich der einbehaltenen Provision storniert. Die Provision wird dem Verkaeufer erstattet, sofern der volle Kaufpreis zurueckgebucht wurde. Bei Teilretouren wird die Provision anteilig erstattet. Chargebacks (Rueckbuchungen durch den Zahlungsdienstleister) fuehren zum vollstaendigen Einbehalt des Transaktionsbetrags; die Plattform leitet das Chargeback-Verfahren ein und informiert den Verkaeufer.' },
          { heading: 'SS 8 - Geistiges Eigentum und Markenrechte', body: 'Der Verkaeufer sichert zu, dass die von ihm eingestellten Inhalte (Texte, Bilder, Logos, Produktbeschreibungen) keine Rechte Dritter verletzen. Im Einzelnen gilt: (a) der Verkaeufer raeumt der Plattform eine nicht-exklusive, weltweite, kostenfreie Lizenz zur Nutzung der eingestellten Inhalte fuer Marketingzwecke der Plattform ein, soweit dies zur Darstellung der Produkte erforderlich ist; (b) der Verkaeufer haftet fuer alle Ansprueche, die aus der Verletzung von Urheber-, Marken-, Patent- oder sonstigen Schutzrechten Dritter entstehen, und stellt die Plattform von derartigen Anspruechen frei; (c) die Plattform behaelt sich das Recht vor, Listings, die Hinweise auf Rechtsverletzungen enthalten, ohne Vorankuendigung zu entfernen; (d) der Verkaeufer darf ohne ausdrueckliche schriftliche Genehmigung der Plattform keine Marken, Logos oder andere Schutzrechte der Plattform verwenden.' },
          { heading: 'SS 9 - Ranking und Sichtbarkeit (P2B-Verordnung)', body: 'Gemaess Art. 5 der EU-Verordnung 2019/1150 legt die Plattform die wesentlichen Parameter ihres Ranking-Algorithmus transparent offen. Die Sichtbarkeit eines Verkaeufers und seiner Produkte wird durch folgende Faktoren beeinflusst: (a) Produktqualitaet und Vollstaendigkeit der Produktdaten (Beschreibung, Bilder, Attribute); (b) Kundenbewertungen und -rezensionen (Durchschnittsnote, Anzahl, Aktualitaet); (c) Bestellabwicklungsrate und durchschnittliche Lieferzeit; (d) Preiswettbewerbsfaehigkeit im Vergleich zu aehnlichen Produkten; (e) Konto-Compliance (keine offenen Vertragsverletzungen, vollstaendige Verifizierung); (f) Konversionsdaten und Klickrate. Bezahlte Rankingfoerderungen werden als "Gesponsert" oder "Werbeanzeige" deutlich gekennzeichnet und beeinflussen das organische Ranking nicht. Die Plattform verpflichtet sich, keine Ungleichbehandlung eigener Angebote gegenueber Drittanbietern vorzunehmen.' },
          { heading: 'SS 10 - Verhaltenskodex und Verbotene Praktiken', body: 'Der Verkaeufer verpflichtet sich zur Einhaltung eines fairen und rechtskonformen Verhaltens. Verboten sind insbesondere: (a) Preisabsprachen oder sonstige wettbewerbswidrige Absprachen mit anderen Verkaeufeern (Kartellrecht); (b) das Einstellen gefaelschter, irrefuehrender oder manipulierter Kundenbewertungen; (c) der Einsatz von Methoden zur kuenstlichen Beeinflussung des Rankings, z.B. durch Klickfarmen oder automatisierte Skripte; (d) das Abwerben von Kunden der Plattform auf andere Verkaufskanaele ausserhalb der Plattform (Direktabschluss); (e) die Nutzung von Kundendaten der Plattform fuer eigene Marketingzwecke ausserhalb der Plattform; (f) jegliche Form von Betrug, Identitaetstaeusching, Geldwaescheverdacht oder Finanzierung illegaler Aktivitaeten; (g) das Einstellen von Produkten, die gegen Exportkontrollvorschriften, Sanktionslisten oder UN-Embargos verstossen.' },
          { heading: 'SS 11 - Kontosperrung, Massnahmen und Kuendigung', body: 'Die Plattform kann bei Verstoessen gegen diese Vereinbarung folgende Massnahmen ergreifen: (a) Verwarnung mit Fristsetzung zur Abhilfe; (b) vorlaeufige Einschraenkung oder Sperrung einzelner Listings; (c) vorlaeufige Kontoeinfrierung (Escrow der ausstehenden Auszahlungen); (d) dauerhafte Kontosperrung bei schwerwiegenden oder wiederholten Verstoessen. Vor einer dauerhaften Sperrung erhaelt der Verkaeufer, sofern kein Notfall vorliegt, eine schriftliche Begruendung und eine Frist von 7 Werktagen zur Stellungnahme. Der Verkaeufer kann das Konto jederzeit mit einer Kuendigungsfrist von 30 Tagen schriftlich kuendigen. Die Plattform kann die Vereinbarung mit 30 Tagen Frist ordentlich kuendigen; eine ausserordentliche Kuendigung aus wichtigem Grund ist jederzeit moeglich. Nach Beendigung werden noch ausstehende Auszahlungen nach Abzug offener Forderungen ausgezahlt, sofern keine Sperr- oder Einbehaltungsgruende bestehen.' },
          { heading: 'SS 12 - Haftung des Verkaefers und Freistellung', body: 'Der Verkaeufer haftet gegenueber der Plattform fuer alle Schaeden, die der Plattform durch schuldhafte Verletzung dieser Vereinbarung entstehen. Insbesondere gilt: (a) der Verkaeufer stellt die Plattform vollstaendig von Anspruechen Dritter frei, die aus Produktmaengeln, Rechtsverletzungen oder sonstigen Pflichtverletzungen des Verkaefers resultieren, einschliesslich Anwalts- und Gerichtskosten; (b) fuer Schaeden durch Datenschutzverletzungen, die in den Verantwortungsbereich des Verkaefers fallen, haftet der Verkaeufer unbegrenzt gemaess DSGVO Art. 82; (c) die Haftung fuer reine Vermoegensschaeden, die nicht auf Vorsatz oder grober Fahrlaessigkeit beruhen, ist auf den Wert der betreffenden Transaktionen der letzten 12 Monate beschraenkt.' },
          { heading: 'SS 13 - Haftungsbeschraenkung der Plattform', body: 'Die Haftung der Plattform gegenueber dem Verkaeufer ist wie folgt beschraenkt: (a) die Plattform haftet unbegrenzt fuer Schaeden aus der Verletzung des Lebens, des Koerpers oder der Gesundheit sowie fuer vorsaetzlich oder grob fahrlaessig verursachte Schaeden; (b) fuer leicht fahrlaessig verursachte Schaeden haftet die Plattform nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und auch nur in Hoehe des fuer die Plattform vorhersehbaren und vertragsty pischen Schadens; (c) eine Haftung fuer mittelbare Schaeden, entgangenen Gewinn, Datenverlust oder Folgeschaeden ist - ausser in den Faellen der lit. a - ausgeschlossen; (d) die Plattform haftet nicht fuer Ausfaelle oder Stoerungen, die auf hoehere Gewalt, Angriffe Dritter (z.B. DDoS), Stoerungen des Internets oder externe Dienstleister zurueckzufuehren sind.' },
          { heading: 'SS 14 - Aenderungen der Plattformbedingungen (DSA-Konformitaet)', body: 'Aenderungen dieser Vereinbarung werden dem Verkaeufer gemaess Art. 3 Abs. 3 der P2B-Verordnung und Art. 14 DSA wie folgt mitgeteilt: (a) per E-Mail an die hinterlegte Adresse sowie per In-App-Benachrichtigung mindestens 15 Tage vor Inkrafttreten; (b) bei Aenderungen aufgrund rechtlicher Anforderungen (neue Gesetze, Gerichtsurteile, Aufsichtsbehoerdenentscheidungen) kann die Frist auf 3 Tage verkuerzt werden; (c) der Verkaeufer kann der Aenderung durch schriftliche Kuendigung des Vertrages innerhalb der Ankuendigungsfrist widersprechen; verbleibt der Verkaeufer nach Ablauf der Frist auf der Plattform, gilt die Zustimmung als erteilt; (d) die jeweils aktuelle Vereinbarung ist jederzeit im Seller-Dashboard abrufbar.' },
          { heading: 'SS 15 - Schlichtung und Streitbeilegung (DSA / P2B)', body: 'Streitigkeiten zwischen Plattform und Verkaeufer werden durch folgendes mehrstufiges Verfahren geloest: (a) Interne Beschwerdebehandlung: Der Verkaeufer kann jede Entscheidung der Plattform innerhalb von 14 Tagen schriftlich anfechten (info@andertal.com); die Plattform bearbeitet Beschwerden kostenlos und zuegig gemaess Art. 11 P2B-Verordnung; (b) Externe Schlichtung: Als anerkannte Schlichtungsstelle steht der Centre for Effective Dispute Resolution (CEDR) sowie das Online-Streitbeilegungsportal der EU-Kommission (https://ec.europa.eu/consumers/odr/) zur Verfuegung; (c) Gerichtlicher Rechtsweg: Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG). Gerichtsstand fuer alle Streitigkeiten aus oder im Zusammenhang mit dieser Vereinbarung ist Berlin, sofern der Verkaeufer Kaufmann ist.' },
          { heading: 'SS 16 - Compliance und regulatorische Anforderungen', body: 'Der Verkaeufer verpflichtet sich zur Einhaltung aller anwendbaren regulatorischen und gesetzlichen Anforderungen. Hierzu gehoeren: (a) Einhaltung der EU-Taxiverordnung (DAC7) und automatischer Informationsaustausch mit Steuerbhoerden; der Verkaeufer nimmt zur Kenntnis, dass die Plattform zur Meldung von Umsaetzen an Finanzbehoerden verpflichtet sein kann; (b) Einhaltung der Geldwaesche-Richtlinie (EU) 2015/849 und Bereitstellung entsprechender KYC-Dokumente (Know Your Customer) auf Anforderung; (c) Einhaltung des Lieferkettensorgfaltspflichtengesetzes (LkSG), soweit anwendbar, und Vorlage entsprechender Selbsterklaerungen; (d) Einhaltung der Batterieverordnung (EU) 2023/1542 und des Elektro- und Elektronikgeraetegesetzes (ElektroG) fuer einschlaegige Produkte; (e) Compliance mit dem Marktueberw achungsrecht gemaess Verordnung (EU) 2019/1020.' },
          { heading: 'SS 17 - Schlussbestimmungen', body: 'Diese Vereinbarung stellt die vollstaendige Einigung zwischen den Parteien hinsichtlich des Gegenstandes dar und ersetzt alle vorherigen muendlichen oder schriftlichen Vereinbarungen. Salvatorische Klausel: Sollten einzelne Bestimmungen dieser Vereinbarung unwirksam oder undurchfuehrbar sein oder werden, bleibt die Wirksamkeit der uebrigen Bestimmungen hiervon ungberuehrt. Die Parteien verpflichten sich, die unwirksame Bestimmung durch eine wirksame Regelung zu ersetzen, die dem wirtschaftlichen Zweck der unwirksamen Bestimmung am naechsten kommt. Schriftformerfordernis: Aenderungen und Ergaenzungen dieser Vereinbarung beduerfen zu ihrer Wirksamkeit der Schriftform (einschliesslich E-Mail mit Lesebestaetigung). Abtretungsverbot: Rechte und Pflichten aus dieser Vereinbarung sind ohne vorherige schriftliche Zustimmung der jeweils anderen Partei nicht abtretbar. Diese Vereinbarung unterliegt deutschem Recht. Letzte Aktualisierung: April 2026.' },
        ],
        tr: [
          { heading: 'Oensoz', body: 'Bu Satici-Platform Sozlesmesi (bundan boyle "Sozlesme"), Andertal platformunun isletmecisi (bundan boyle "Platform") ile kayitli ticari satici (bundan boyle "Satici") arasindaki hukuki iliskiyi duzenler. Sozlesme; AB Dijital Hizmetler Yasasi (DSA) (AB) 2022/2065, Cevrimici Aracilik Hizmetleri Tuzugu (P2B) (AB) 2019/1150, Genel Veri Koruma Tuzugu (GDPR) (AB) 2016/679, Turk Ticaret Kanunu (TTK), Tuketiciyi Koruma Kanunu (TKHK) ve diger gecerli ulusal ve uluslararasi mevzuat hukumleri cercevesinde hazirlanmistir. Sozlesmenin elektronik olarak imzalanmasi, Saticinin tum sart ve kosullari kabul ettigini ifade eder.' },
          { heading: 'Madde 1 - Sozlesmenin Konusu ve Platform Hizmetleri', body: 'Platform, Saticiya son tuketicilere urun listeleme, yonetme ve satma amacıyla teknik bir cevrimici altyapi saglar. Platform hizmetleri sunlari kapsar: urun listeleme ve katalog yonetimi, sertifikali odeme servis saglayicilari araciligiyla odeme isleme, lojistik destegi ve kargo takibi, satis analiz araclari ve muster destek arayuzleri. Satici, kendi adina ve kendi hesabina bagimsiz bir ticari satici olarak hareket eder; Platform, Satici ile son musteri arasindaki satis sozlesmelerinin tarafi degildir. Platform, Saticiya en az 30 gun onceden bildirimde bulunarak hizmet kapsamini degistirme hakkini sakli tutar.' },
          { heading: 'Madde 2 - Kayit ve Dogrulama', body: 'Platforma erisim, eksiksiz kayit ve basarili kimlik ile isletme dogrulamasini gerektirir. Satici su yukuklulukleri ustlenir: (a) gercekci, eksiksiz ve guncel kisisel, isletme, vergi numarasi (TICARI UNVAN, vergi kimlik numarasi), IBAN ve ticaret sicil bilgileri sunmak; (b) bu bilgilerde onemli degisiklikleri 7 is gunu icinde guncellemek; (c) talep uzerine 10 is gunu icinde dogrulama belgelerini (kimlik belgesi, ticaret sicil gazetesi, vergi levhasi) ibraz etmek. Yanlis beyan, Platformun hesabi aninda askiya alma ve yasal islem baslat ma hakkini verir.' },
          { heading: 'Madde 3 - Urun Listeleme ve Icerik Yukumlulukler', body: 'Satici, listelenen tum urunler ve iceriklerin hukuki uygunlugundan tek basina sorumludur. Satici su yukumlulukler kabul eder: (a) yalnizca AB Urun Guvenligi Yonetmeligi 2023/988, CE isareti zorunlulugu ve diger etiketleme mevzuatına uygun urunler listelemek; (b) urun aciklamalarini, gorsellerini, fiyatlarini ve teknik bilgilerini dogru ve yaniltici olmayan sekilde sunmak; (c) silah, uyusturucu, sahte markalı urunler, telif hakkı ihlali iceren materyaller veya ihracat kisitlamasi olan mallari kesinlikle listelememe; (d) listelenen urunler icin gerekli tum lisans, izin ve sertifikalara sahip olmak ve talep uzerine Platforma ibraz etmek; (e) adet bazli fiyatlandirmada birim fiyat gosterimine iliskin Turk mevzuatına ve AB PAngV duzenlemelerine uymak.' },
          { heading: 'Madde 4 - Siparis Karsilama ve Teslimat Yukumlulukler', body: 'Satici, guvenilir ve zamaninda siparis karsilamayı taahhut eder: (a) siparisler listede belirtilen teslimat suresi icinde karsilanmalidir; AB icinde en fazla 14 is gunluk teslimat suresine uyulmalidir; (b) gecikme veya stok yoklugu durumunda musteriye aninda, en gec gecikmenin ogrenilmesinden itibaren 24 saat icinde bildirim yapilmalidir; (c) tuketicilere AB Tuketici Haklari Direktifi 2011/83/AB ve TKHK kapsaminda 14 gunluk cayma hakki taninmalidir; (d) alicilara Turk Vergi Usul Kanunu uyarinca usulune uygun fatura duzenlenmeli ve kopyalar en az 10 yil saklanmalidir; (e) ambalaj duzenlemeleri ile varsa ulusal geri donusum ve atik yonetimi yukumlulukleri yerine getirilmelidir.' },
          { heading: 'Madde 5 - Garanti ve Iade', body: 'Satici, son musterilere TKHK ve ilgili AB mevzuati kapsamindaki tum yasal garanti haklarini saglar: (a) yeni urunler icin teslimattan itibaren 2 yil, ikinci el urunler icin 1 yil garanti (acikca belirtilmis olmasi sartiyla); (b) kusurlu mallarda alicinin ayni ifaya (tamir veya degisim), bedel indirimine veya sozlesmeden donmeye hakki; (c) kolay iade imkani saglayan bir iade yonetimi; AB icinde iade giderleri aksi yasal zorunluluk olmadikca Satici tarafindan karsilanir; (d) iade alinan urunler icin geri odeme, iadeye girisinden itibaren 14 gun icinde tamamlanmalidir; (e) guvenlik riski olusturan urun kusurlarinda Platform derhal bilgilendirilmeli ve gerekirse urun geri cagrilmalidir.' },
          { heading: 'Madde 6 - Kisisel Verilerin Korunmasi (KVKK / GDPR)', body: 'Satici, son musterilere ait kisisel verileri (ad, adres, e-posta, siparis ve odeme bilgileri) yalnizca sozlesmenin ifasi amaciyla isler (GDPR Madde 6(1)(b)). Su yukumlulukler gecerlidir: (a) GDPR Madde 32 uyarinca kisisel verilerin korunmasi icin uygun teknik ve idari onlemler almak; (b) musteri verilerini etkileyen veri ihlallerini Platforma 24 saat, yetkili denetim otoritesine 72 saat icinde bildirmek (GDPR Madde 33); (c) gerekli hallerde GDPR Madde 28 uyarinca Platform ile veri isleme sozlesmesi imzalamak; (d) ilgili kisi taleplerine (erisim, silme, duzeltme, itiraz) 30 takvim gunu icinde yanit vermek; (e) uygun koruma duzeyi olmaksizin ucuncu ulkelere veri aktarimi yapmamak (GDPR Madde 44 vd).' },
          { heading: 'Madde 7 - Komisyonlar ve Odeme Kosullari', body: 'Platform, Satici Dashboard\'inda yayimlanan gecerli fiyat listesine gore islem komisyonu alir: (a) komisyonlar, odeme alimindan (siparis tamamlanmasindan) itibaren otomatik olarak kesilirir; (b) Saticiya odemeler, iadeleri ve itirazlari karsilamak uzere teslimat onayindan sonra 7-14 is gunluk guvenlik suresinin ardından yapilir; (c) Platform, itiraz, iade, dolandiricilik veya urun kusuru durumlarinda tutarlari askiya alma veya mahsup etme hakkini sakli tutar; (d) vadesi gecmis odemelerde BGB SS 288(2) uyarinca temerrut faizi uygulanir; (e) aylik hesap ozetleri Satici Dashboard\'inda sunulur; 30 gun icerisinde itiraz edilmemesi halinde onaylanmis sayilir.' },
          { heading: 'Madde 7a - Odeme Yetkisi ve Odeme Akisi', body: 'Satici, Platformu ve odeme servis saglayicilarini (ozellikle Stripe Connect) kendi adina ve hesabina musterilerden odeme tahsil etmek uzere yetkilendirir. Odeme servis saglayicisina veya Platforma yapilan odeme, Saticiya yapilmis odeme olarak kabul edilir. Odemeler Stripe Connect veya esdeger sertifikali odeme servis saglayicilari araciligiyla islenir. Fonlar once Platform tarafindan yonetilen bir emanet hesabina alinir; guvenlik suresinin dolmasinin ardindan Saticiya odenir.' },
          { heading: 'Madde 7b - Iadelerde Komisyon Iadesi', body: 'Bir alici cayma hakkini kullanir veya iade islenir ise ilgili siparis tutari ve kesilen komisyon iptal edilir. Tam satis fiyati iade edildiyse komisyon Saticiya iade edilir; kismi iadelerde komisyon orantili olarak iade edilir. Platform tarafindan baslatilan chargeback (odeme iptali) islemlerinde islem tutarinin tamami alikoy ulur; Platform Saticiya bildirimde bulunur.' },
          { heading: 'Madde 8 - Fikri Mulkiyet ve Marka Haklari', body: 'Satici, yuklenen iceriklerin (metin, gorsel, logo, urun aciklamalari) ucuncu sahis haklarini ihlal etmedigini beyan ve taahhut eder: (a) Satici, Platforma listelenen icerikleri urunlerin sergilenmesi amaciyla kullanmak uzere dunya genelinde, bedelsiz, ozel olmayan bir lisans tanimlar; (b) Satici, urun kusurlari, hak ihlalleri veya diger sozlesme ihlallerinden kaynaklanan tum ucuncu sahis taleplerinden Platformu tazmin eder ve muaf tutar (avukatlik ucretleri dahil); (c) Platform, hak ihlali icerdigi anlasilan listeleri onceden haber vermeksizin kaldirma hakkini sakli tutar; (d) Satici, Platformun onceden yazili izni olmaksizin Platform markalarini, logolarini veya fikirdi mulkiyet unsurlarini kullanamaz.' },
          { heading: 'Madde 9 - Siralama ve Gorunurluk (P2B Tuzugu)', body: 'AB P2B Tuzugu Madde 5 uyarinca Platform, siralama algoritmasinin temel parametrelerini seffaf bicimde aciklar: (a) urun kalitesi ve veri eksiksizligi (aciklama, gorsel, ozellikler); (b) musteri degerlendirmeleri (ortalama puan, sayi, guncellik); (c) siparis karsilama orani ve ortalama teslimat suresi; (d) benzer urunlerle kiyaslandığında fiyat rekabetciligii; (e) hesap uyumlulugu (acik sozlesme ihlali yok, tam dogrulama); (f) donusum verileri ve tiklanma orani. Odeme karsiligi siralama artirimi "Sponsorlu" veya "Reklam" olarak acikca etiketlenir; organik siralamayı etkilemez. Platform, kendi urunlerini ucuncu taraf saticilardan farkli muameleye tabi tutmamayı taahhut eder.' },
          { heading: 'Madde 10 - Davranis Kurallari ve Yasakli Uygulamalar', body: 'Satici, adil ve hukuka uygun davrananis ilkelerine baglidir. Su uygulamalar kesinlikle yasaktir: (a) rekabet hukukuna aykiri fiyat anlasmalari veya diger kartellesmeler; (b) sahte, yaniltici veya manipule edilmis musteri degerlendirmeleri; (c) tiklanma cerceveleri veya otomatik komut dosyalariyla siralama manipulasyonu; (d) musteri iletisim bilgilerini Platform disinda dogrudan satis icin kullanmak (Platform dis satin alim yonlendirmesi); (e) Platform musteri verilerini Platform disindaki pazarlama amaclarinda kullanmak; (f) dolandiricilik, kimlik sahteciligi, kara para aklama veya yasadisi faaliyetlerin finansmani; (g) ihracat kontrol duzenleme lerine, yaptirimlara veya BM ambargosu kapsamindaki mallari listelemek.' },
          { heading: 'Madde 11 - Hesap Askiya Alma, Onlemler ve Fesih', body: 'Platform, sozlesme ihlallerinde su onlemleri alabilir: (a) duzeltme icin sure iceren uyari; (b) bireysel listelemelerin gecici kisitlanmasi veya askiya alinmasi; (c) bekleyen odemelerin donduruldugu gecici hesap aski (emanet hesap); (d) agir veya tekrarlayan ihlallerde kalici hesap kapatma. Kalici kapatmadan once, acil bir durum olmadigi surece Saticiya yazili gerekceli bildirim ve 7 is gunu icerisinde yanit hakki verilir. Satici, 30 gun onceden yazili bildiriimle herhangi bir zamanda feshedebilir; Platform de 30 gun onceden bildirimle olagan fesih hakkina sahiptir. Sozlesme sona erdikten sonra acik alacaklar dusuldukten sonra bekleyen odemeler yapilir.' },
          { heading: 'Madde 12 - Saticinin Sorumlulugu ve Tazminat', body: 'Satici, sozlesme ihlallerinden kaynaklanan tum zararlari tazmin eder: (a) urun kusurlari, hak ihlalleri veya diger ihlallerden dogan avukatlik ucretleri dahil tum ucuncu sahis taleplerinden Platformu tamamen muaf tutar; (b) veri ihlalleri icin Saticinin sorumluluk alanina giren kisimda GDPR Madde 82 uyarinca sinirsiz sorumluluk; (c) kast veya agir ihmal temel olusturmayan saf mali zararlar icin sorumluluk, son 12 ayin ilgili islem degerlerindeki zararla sinirlidir.' },
          { heading: 'Madde 13 - Platformun Sorumluluk Sinirlamasi', body: 'Platformun sorumlulugu sunlarla sinirlidir: (a) Platform, can, vucut butunlugu veya saglik zararlari ile kasitli veya agir ihmalden kaynaklanan zararlarda sinirsiz sorumludur; (b) hafif ihmalle olusan zararlarda Platform, yalnizca temel sozlesme yukumluluklerinin (kardinal yukumlulukler) ihlali halinde ve yalnizca ongoreelebilir ve tipik sozlesme zarariyla orantili bigimde sorumludur; (c) lit. a durumlarinin disinda dolayli zararlar, kazanc kayiplari, veri kayiplari ve sonucsal zararlar kapsami disindadir; (d) Platform, mucbir sebepler, ucuncu sahis saldirilari (orn. DDoS), internet kesintileri veya harici servis saglayicilarindan kaynaklanan kesinti ve bozulmalarda sorumlu degildir.' },
          { heading: 'Madde 14 - Degisiklikler (DSA Uyumlulugu)', body: 'Sozlesme degisiklikleri P2B Tuzugu Madde 3(3) ve DSA Madde 14 uyarinca bildirilir: (a) yururluge girmeden en az 15 gun once kayitli e-posta adresine ve uygulama icin bildirimle; (b) yasal gerekliliklerden (yeni mevzuat, mahkeme kararlari, duzenleyici kararlar) kaynaklanan degisikliklerde sure 3 gune indirilebilir; (c) Satici, bildirim suresi icinde yazili fesih yoluyla degisikliklere itiraz edebilir; sure dolduktan sonra Platformda kalmak devam eden kullanim olarak kabul gorur; (d) guncel sozlesme her zaman Satici Panelinde erisime aciktir.' },
          { heading: 'Madde 15 - Uzlasma ve Uyusmazlik Cozumu (DSA / P2B)', body: 'Uyusmazliklar asagidaki cok asamali prosedurle cozulur: (a) Dahili sikayet islemleri: Satici, P2B Tuzugu Madde 11 uyarinca herhangi bir Platform kararini 14 gun icinde yazili olarak (info@andertal.com) itiraz edebilir; Platform sikayetleri ucretsiz ve hizli biimde ele alir; (b) Harici tahkim: Taninmis tahkim kurumu olarak CEDR ve AB Komisyonunun cevrimici uyusmazlik cozum portali (https://ec.europa.eu/consumers/odr/) mevcuttur; (c) Yargı yolu: Sozlesme Alman hukukuna tabidir (CISG haric). Saticinin tacir olmasi durumunda tum uyusmazliklar icin Berlin mahkemeleri yetkilidir.' },
          { heading: 'Madde 16 - Uyum ve Duzenleyici Gereklilikler', body: 'Satici, tum gecerli duzenleyici ve yasal gerekliliklere uymayı kabul eder: (a) DAC7 AB Vergi Tuzugu uyarinca Platform, ilgili makamlara gelir raporlamasi yapma yukumluluguine tabi olabilir; (b) AB Kara Para Aklamayla Mucadele Direktifi 2015/849 ve FATF standartlari uyarinca KYC belgelerinin saglanmasi; (c) uygulanabilir oldugu durumlarda AB Kurum Durum Tespiti Direktifi kapsaminda tedarik zinciri oz bildirimlerinin sunulmasi; (d) ilgili urunler icin AB Batarya Yonetmeligi 2023/1542 ve elektrik/elektronik atik direktifi gerekliliklerine uymak; (e) Urun Guvenligi Yonetmeligi (AB) 2023/988 ve piyasa gozetim mevzuatına uyumun saglanmasi.' },
          { heading: 'Madde 17 - Son Hukumler', body: 'Bu Sozlesme, konusu bakimindan taraflar arasindaki tam mutabakati olusturur ve onceki tum mutabakatlarin yerini alir. Bolunebilirlik: Herhangi bir hukmun gecersiz veya uygulanamaz olmasi durumunda, geri kalan hukumler gecerliliGini korur; taraflar gecersiz hukmun ekonomik amacina en yakin gecerli duzenlemeyi koymayi taahhut eder. Yazili sekil sart: Bu sozlesmedeki degisiklikler ve ekler yazili sekil sartina tabidir (okuma bildirimi istenen e-posta dahil). Temlik yasagi: Taraflarin haklarini veya yukumlulukleri, diger tarafin onceden yazili izni olmaksizin devredemez. Sozlesme, Alman hukukuna tabidir. Son guncelleme: Nisan 2026.' },
        ],
        en: [
          { heading: 'Preamble', body: 'This Seller-Platform Agreement (hereinafter "Agreement") governs the legal relationship between Andertal GmbH (hereinafter "Platform") and the registered commercial seller (hereinafter "Seller"). By electronically signing this Agreement, the Seller accepts all terms and conditions set forth herein. This Agreement is prepared in compliance with the Digital Services Act (EU) 2022/2065 ("DSA"), the P2B Regulation (EU) 2019/1150 on promoting fairness and transparency for business users of online intermediation services, the General Data Protection Regulation (EU) 2016/679 ("GDPR"), and all applicable national and European legislation.' },
          { heading: 'Article 1 - Subject Matter and Platform Services', body: 'The Platform provides the Seller with technical online infrastructure to list, manage, and sell goods to end consumers. Platform services include: product listing and catalog management, payment processing via certified payment service providers, logistics support and shipment tracking, seller analytics tools, and customer support interfaces. The Seller acts as an independent commercial trader in their own name and on their own account. The Platform is not a party to sales contracts concluded between the Seller and end customers and does not act as a commission agent. The Platform reserves the right to amend the scope of services with at least 30 days prior notice, provided no material detriment to the Seller results.' },
          { heading: 'Article 2 - Registration and Verification', body: 'Access to the Platform requires complete registration and successful identity and business verification. The Seller undertakes to: (a) provide truthful, complete and current personal, business, tax ID (VAT number), IBAN and commercial register information; (b) update this information within 7 business days of any material change; (c) submit verification documents (identity card, commercial register extract, tax certificate) within 10 business days upon Platform request. False statements entitle the Platform to immediately suspend the account and, if applicable, initiate legal proceedings.' },
          { heading: 'Article 3 - Product Listing and Content Obligations', body: 'The Seller is solely responsible for all products and content listed. The Seller undertakes to: (a) list only products complying with EU Product Safety Regulation 2023/988, CE marking requirements, and all applicable labeling regulations; (b) provide product descriptions, images, prices, and technical data accurately and without misleading content; (c) under no circumstances list prohibited goods (weapons, narcotics, counterfeit branded goods, copyright-infringing material, goods subject to export restrictions); (d) hold all required licenses, approvals, and certifications for listed products and present them to the Platform upon request; (e) comply with unit pricing disclosure requirements under applicable consumer protection law.' },
          { heading: 'Article 4 - Order Fulfillment and Delivery Obligations', body: 'The Seller commits to reliable and timely order fulfillment: (a) orders must be fulfilled within the delivery time stated in the listing; a maximum delivery time of 14 business days within the EU generally applies; (b) in the event of delay or unavailability, customers must be notified immediately, at most within 24 hours of learning of the delay; (c) consumers must be granted a 14-day right of withdrawal under EU Consumer Rights Directive 2011/83/EU; (d) buyers must receive proper invoices in accordance with applicable tax law, with copies retained for at least 10 years; (e) applicable packaging regulations and national recycling/waste management obligations must be observed.' },
          { heading: 'Article 5 - Warranty and Returns', body: 'The Seller provides end customers with all statutory warranty rights under applicable law: (a) a warranty period of 2 years from delivery for new goods and 1 year for used goods (provided clearly indicated); (b) the buyer\'s right to remedy (repair or replacement), price reduction, or withdrawal in the event of defective goods; (c) a return management system ensuring easy returns; within the EU, return costs are borne by the Seller unless otherwise required by law; (d) refunds for returned goods must be processed within 14 days of receipt of the return; (e) product defects posing a safety risk must be reported to the Platform immediately and a product recall initiated if necessary.' },
          { heading: 'Article 6 - Data Protection (GDPR)', body: 'The Seller processes personal data of end customers (name, address, email, order and payment data) solely for the purpose of contract performance (Art. 6(1)(b) GDPR). The following obligations apply: (a) implement appropriate technical and organizational measures (TOMs) to protect personal data pursuant to Art. 32 GDPR; (b) report data breaches affecting customer data to the Platform within 24 hours and to the competent supervisory authority within 72 hours per Art. 33 GDPR; (c) conclude a data processing agreement (DPA) with the Platform pursuant to Art. 28 GDPR where applicable; (d) respond to data subject requests (access, erasure, rectification, restriction) within 30 calendar days; (e) refrain from transferring data to third countries without an adequate level of protection pursuant to Art. 44 et seq. GDPR.' },
          { heading: 'Article 7 - Fees and Payment Terms', body: 'The Platform charges a transaction fee pursuant to the price list current at the time of the transaction, accessible in the Seller Dashboard: (a) commissions are automatically deducted at order completion (payment receipt); (b) payouts to the Seller are made after a security holding period of 7-14 business days following delivery confirmation to absorb returns and chargebacks; (c) the Platform reserves the right to withhold or offset amounts in cases of chargebacks, returns, fraud, or product defects; (d) overdue payments attract default interest at 9 percentage points above the base rate per Sec. 288(2) BGB; (e) monthly account statements are provided in the Seller Dashboard and are deemed approved unless disputed within 30 days.' },
          { heading: 'Article 7a - Payment Authorization and Payment Flow', body: 'The Seller authorizes the Platform and its payment service providers (in particular Stripe Connect) to collect payments from customers on the Seller\'s behalf and for the Seller\'s account. Receipt of payment by the payment service provider or the Platform shall be deemed receipt of payment by the Seller. Payments are processed via Stripe Connect or equivalent certified payment service providers. Funds are first received into an escrow account managed by the Platform and disbursed to the Seller after the applicable security holding period.' },
          { heading: 'Article 7b - Commission Refund on Returns', body: 'If a buyer exercises their right of withdrawal or a return is processed, the corresponding order amount including the deducted commission is cancelled. The commission is refunded to the Seller if the full purchase price has been reversed; for partial returns, the commission is refunded proportionally. Chargebacks initiated by the payment service provider result in full withholding of the transaction amount; the Platform initiates the chargeback procedure and notifies the Seller.' },
          { heading: 'Article 8 - Intellectual Property and Trademark Rights', body: 'The Seller warrants that uploaded content (texts, images, logos, product descriptions) does not infringe third-party rights: (a) the Seller grants the Platform a non-exclusive, worldwide, royalty-free license to use listed content for the purpose of displaying the products; (b) the Seller fully indemnifies the Platform against all third-party claims arising from product defects, IP infringements, or other breaches, including attorney and court costs; (c) the Platform reserves the right to remove listings containing indications of rights violations without prior notice; (d) the Seller may not use the Platform\'s trademarks, logos, or other IP without prior written authorization.' },
          { heading: 'Article 9 - Ranking and Visibility (P2B Regulation)', body: 'Pursuant to Art. 5 of EU Regulation 2019/1150, the Platform transparently discloses the main parameters of its ranking algorithm: (a) product quality and data completeness (description, images, attributes); (b) customer ratings and reviews (average score, volume, recency); (c) order fulfillment rate and average delivery time; (d) price competitiveness compared to similar products; (e) account compliance (no open contract violations, complete verification); (f) conversion data and click-through rate. Paid ranking promotion is clearly labeled as "Sponsored" or "Advertisement" and does not affect organic ranking. The Platform commits to not treating its own products differently from third-party sellers.' },
          { heading: 'Article 10 - Code of Conduct and Prohibited Practices', body: 'The Seller is committed to fair and lawful conduct. The following practices are strictly prohibited: (a) price-fixing or other anti-competitive agreements with other sellers (competition law); (b) posting fake, misleading, or manipulated customer reviews; (c) manipulating rankings through click farms or automated scripts; (d) using customer contact data to solicit off-platform purchases; (e) using Platform customer data for own marketing purposes outside the Platform; (f) any form of fraud, identity deception, money laundering, or financing of illegal activities; (g) listing products subject to export control regulations, sanctions lists, or UN embargoes.' },
          { heading: 'Article 11 - Account Suspension, Measures, and Termination', body: 'In the event of violations, the Platform may take the following measures: (a) warning with a deadline for remedy; (b) temporary restriction or suspension of individual listings; (c) temporary account freeze (escrow of outstanding payouts); (d) permanent account closure for serious or repeated violations. Prior to permanent closure, the Seller receives, unless an emergency exists, a written statement of reasons and a 7-business-day response period. The Seller may terminate the account at any time with 30 days\' written notice; the Platform may also terminate with 30 days\' notice. After termination, outstanding payouts are remitted after deduction of open claims.' },
          { heading: 'Article 12 - Seller Liability and Indemnification', body: 'The Seller is liable for all damages arising from breaches of this Agreement: (a) the Seller fully indemnifies the Platform against all third-party claims arising from product defects, IP infringements, or other breaches, including attorney and court costs; (b) for data protection violations within the Seller\'s sphere of responsibility, the Seller bears unlimited liability pursuant to GDPR Art. 82; (c) liability for pure financial losses not based on intent or gross negligence is limited to the value of the relevant transactions over the preceding 12 months.' },
          { heading: 'Article 13 - Platform Limitation of Liability', body: 'The Platform\'s liability is limited as follows: (a) the Platform bears unlimited liability for damages arising from injury to life, limb, or health, and for intentional or grossly negligent conduct; (b) for lightly negligent causation of damage, the Platform is liable only for breaches of material contractual obligations (cardinal obligations) and only to the extent of foreseeable and typical contractual damages; (c) liability for indirect damages, lost profits, data loss, and consequential damages is excluded except in the cases of lit. a; (d) the Platform is not liable for outages or disruptions attributable to force majeure, third-party attacks (e.g. DDoS), internet disruptions, or external service providers.' },
          { heading: 'Article 14 - Amendments (DSA Compliance)', body: 'Amendments to this Agreement are communicated pursuant to P2B Regulation Art. 3(3) and DSA Art. 14: (a) by email to the registered address and by in-app notification at least 15 days before entry into force; (b) for amendments required by law (new legislation, court decisions, regulatory orders), the notice period may be reduced to 3 days; (c) the Seller may object to amendments by written termination of the contract within the notice period; remaining on the Platform after expiry of the period constitutes acceptance; (d) the current Agreement is always accessible in the Seller Dashboard.' },
          { heading: 'Article 15 - Dispute Resolution (DSA / P2B)', body: 'Disputes are resolved through the following multi-stage procedure: (a) Internal complaint handling: the Seller may contest any Platform decision in writing within 14 days (info@andertal.com); the Platform handles complaints free of charge and promptly pursuant to P2B Regulation Art. 11; (b) External mediation: recognized mediation bodies include the Centre for Effective Dispute Resolution (CEDR) and the EU Commission\'s Online Dispute Resolution portal (https://ec.europa.eu/consumers/odr/); (c) Judicial recourse: this Agreement is governed by German law excluding the UN Convention on Contracts for the International Sale of Goods (CISG). Berlin courts have exclusive jurisdiction for all disputes arising from or in connection with this Agreement where the Seller is a merchant.' },
          { heading: 'Article 16 - Compliance and Regulatory Requirements', body: 'The Seller agrees to comply with all applicable regulatory and legal requirements: (a) under DAC7 EU Tax Regulation, the Platform may be required to report revenues to tax authorities; (b) provision of KYC documents pursuant to EU Anti-Money Laundering Directive 2015/849 and FATF standards; (c) supply chain due diligence self-declarations under applicable EU corporate sustainability directives; (d) compliance with EU Battery Regulation 2023/1542 and WEEE Directive requirements for relevant products; (e) compliance with the Product Safety Regulation (EU) 2023/988 and market surveillance law.' },
          { heading: 'Article 17 - Final Provisions', body: 'This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior oral or written agreements. Severability: Should any provision prove invalid or unenforceable, the remaining provisions remain in full force; the parties undertake to replace the invalid provision with a valid arrangement that most closely achieves the economic purpose of the invalid provision. Written form requirement: Amendments and supplements to this Agreement require written form to be effective (including email with read receipt). Assignment prohibition: Rights and obligations under this Agreement may not be assigned without prior written consent of the respective other party. This Agreement is governed by German law. Last updated: April 2026.' },
        ],
      }

      const signPdfDeLatin = (s) => {
        if (s == null) return ''
        return String(s)
          .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
          .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
          .replace(/ß/g, 'ss')
          .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ç/g, 'C')
          .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e').replace(/ë/g, 'e')
          .replace(/à/g, 'a').replace(/â/g, 'a').replace(/á/g, 'a')
          .replace(/ù/g, 'u').replace(/û/g, 'u').replace(/ú/g, 'u')
          .replace(/ô/g, 'o').replace(/ò/g, 'o').replace(/ó/g, 'o')
          .replace(/î/g, 'i').replace(/ï/g, 'i').replace(/í/g, 'i')
          .replace(/ñ/g, 'n').replace(/ã/g, 'a').replace(/õ/g, 'o')
      }

      const buildAgreementPdf = async (seller, locale, signatureDataUrl, signedAt, signedIp, platformInfo) => {
        const PDFDocument = require('pdfkit')
        const sections = CONTRACT_SECTIONS_SIGN[locale] || CONTRACT_SECTIONS_SIGN.en
        const signedDate = signedAt ? new Date(signedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' }) : new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' })
        const pi = platformInfo || {}
        const platName = pi.legal_company_name || 'Andertal GmbH'
        const platRep = pi.legal_representative || ''
        const platAddr = [pi.legal_street, pi.legal_city].filter(Boolean).join(', ')
        const platReg = [pi.legal_trade_register, pi.legal_register_court ? `(${pi.legal_register_court})` : ''].filter(Boolean).join(' ')
        const platVat = pi.legal_vat_id || ''
        const platTax = pi.legal_tax_id || ''
        const platEmail = pi.legal_email || 'info@andertal.com'

        return new Promise((resolve, reject) => {
          try {
            const doc = new PDFDocument({ margin: 48, size: 'A4', compress: false, pdfVersion: '1.7' })
            const chunks = []
            doc.on('data', (c) => chunks.push(c))
            doc.on('end', () => resolve(Buffer.concat(chunks)))
            doc.on('error', reject)

            // Header
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(
              locale === 'de' ? 'Haendler-Plattform-Vereinbarung' : locale === 'tr' ? 'Satici-Platform Sozlesmesi' : 'Seller-Platform Agreement',
              { align: 'center' }
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#666').text(
              `${signPdfDeLatin(platName)} | ` + (locale === 'de' ? 'Unterzeichnetes Exemplar' : locale === 'tr' ? 'Imzali Kopya' : 'Signed Copy'),
              { align: 'center' }
            )
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.4)

            // Platform operator block
            const platOpLabel = locale === 'de' ? 'Plattformbetreiber' : locale === 'tr' ? 'Platform Isletmecisi' : 'Platform Operator'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platOpLabel) + ':')
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin((locale === 'de' ? 'Vertreten durch: ' : locale === 'tr' ? 'Temsilen: ' : 'Represented by: ') + platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin((locale === 'de' ? 'Handelsregister: ' : locale === 'tr' ? 'Ticaret Sicil: ' : 'Commercial Register: ') + platReg))
            if (platVat) doc.text(signPdfDeLatin((locale === 'de' ? 'USt-IdNr.: ' : locale === 'tr' ? 'KDV No: ' : 'VAT ID: ') + platVat))
            if (platTax) doc.text(signPdfDeLatin((locale === 'de' ? 'Steuernummer: ' : locale === 'tr' ? 'Vergi No: ' : 'Tax ID: ') + platTax))
            doc.text(signPdfDeLatin((locale === 'de' ? 'E-Mail: ' : 'Email: ') + platEmail))
            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Contract sections
            for (const sec of sections) {
              doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(signPdfDeLatin(sec.heading))
              doc.moveDown(0.15)
              doc.fontSize(9).font('Helvetica').fillColor('#333').text(signPdfDeLatin(sec.body), { lineGap: 2 })
              doc.moveDown(0.5)
            }

            doc.moveDown(0.5)
            doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke()
            doc.moveDown(0.5)

            // Seller signature block (left) + platform block (right)
            const sigLabel = locale === 'de' ? 'Unterschrift des Verkaeufers' : locale === 'tr' ? 'Satici Imzasi' : 'Seller Signature'
            const dateLabel = locale === 'de' ? 'Datum & Uhrzeit' : locale === 'tr' ? 'Tarih & Saat' : 'Date & Time'
            const ipLabel = locale === 'de' ? 'IP-Adresse' : locale === 'tr' ? 'IP Adresi' : 'IP Address'
            const nameLabel = locale === 'de' ? 'Name / Unternehmen' : locale === 'tr' ? 'Ad / Firma' : 'Name / Company'
            const usernameLabel = locale === 'de' ? 'Benutzername' : locale === 'tr' ? 'Kullanici Adi' : 'Username'

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(
              locale === 'de' ? 'Unterschriftsblock' : locale === 'tr' ? 'Imza Blogu' : 'Signature Block'
            )
            doc.moveDown(0.3)
            doc.fontSize(9).font('Helvetica').fillColor('#333')
            doc.text(`${dateLabel}: ${signPdfDeLatin(signedDate)}`)
            doc.text(`${ipLabel}: ${signPdfDeLatin(signedIp || '—')}`)
            doc.text(`${nameLabel}: ${signPdfDeLatin([seller.authorized_person_name, seller.company_name].filter(Boolean).join(' / ') || '—')}`)
            doc.text(`${usernameLabel}: ${signPdfDeLatin(seller.seller_name || seller.email || '—')}`)
            doc.moveDown(0.5)
            doc.text(`${sigLabel}:`)
            doc.moveDown(0.3)

            if (signatureDataUrl && signatureDataUrl.startsWith('data:image/png;base64,')) {
              const imgBuf = Buffer.from(signatureDataUrl.split(',')[1], 'base64')
              doc.image(imgBuf, { fit: [200, 80], align: 'left' })
              doc.moveDown(0.3)
            }

            doc.moveTo(48, doc.y).lineTo(248, doc.y).strokeColor('#999').lineWidth(0.5).stroke()
            doc.moveDown(0.2)
            doc.fontSize(8).fillColor('#666').text(signPdfDeLatin(`${seller.authorized_person_name || seller.seller_name || ''}, ${seller.company_name || ''}`), { width: 200 })

            // Platform representative block below signature
            doc.moveDown(0.8)
            const platSigLabel = locale === 'de' ? 'Plattformbetreiber (Andertal)' : locale === 'tr' ? 'Platform Isletmecisi (Andertal)' : 'Platform Operator (Andertal)'
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(signPdfDeLatin(platSigLabel))
            doc.fontSize(8).font('Helvetica').fillColor('#555')
            doc.text(signPdfDeLatin(platName))
            if (platRep) doc.text(signPdfDeLatin(platRep))
            if (platAddr) doc.text(signPdfDeLatin(platAddr))
            if (platReg) doc.text(signPdfDeLatin(platReg))
            if (platVat) doc.text(signPdfDeLatin(platVat))

            doc.end()
          } catch (e) {
            reject(e)
          }
        })
      }

      // POST /admin-hub/v1/seller/sign-token — create a signing session token + QR code
  const router = Router()

  router.post('/admin-hub/v1/seller/sign-token', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const crypto = require('crypto')
          const QRCode = require('qrcode')
          const { Client } = require('pg')
          const token = crypto.randomBytes(32).toString('hex')
          const locale = String(req.body?.locale || sellerUser.locale || 'de').slice(0, 10)
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          await client.query(
            `INSERT INTO seller_sign_tokens (token, seller_id, locale, ip) VALUES ($1, $2, $3, $4)`,
            [token, String(sellerUser.id), locale, req.ip || null]
          )
          await client.end()
          const sellercentralUrl = (process.env.NEXT_PUBLIC_SELLERCENTRAL_URL || process.env.SELLERCENTRAL_PUBLIC_URL || 'https://sellercentral.andertal.com').replace(/\/$/, '')
          const signUrl = `${sellercentralUrl}/${locale}/sign/${token}`
          const qrDataUrl = await QRCode.toDataURL(signUrl, { width: 256, margin: 2 })
          res.json({ token, sign_url: signUrl, qr_data_url: qrDataUrl })
        } catch (e) {
          console.error('sign-token:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /public/sign/:token — info endpoint, called from sellercentral sign page (no auth)
  router.get('/public/sign/:token', async (req, res) => {
        const token = String(req.params.token || '').trim()
        if (!token) return res.status(400).json({ message: 'Token required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.locale, st.used_at, st.expires_at, su.store_name, su.company_name, su.authorized_person_name
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1`,
            [token]
          )
          await client.end()
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) return res.status(404).json({ message: 'Token not found or expired' })
          const row = tr.rows[0]
          if (row.used_at) return res.status(410).json({ message: 'Already signed', signed: true })
          res.json({ valid: true, locale: row.locale, seller_name: row.store_name || null, company_name: row.company_name || null, authorized_person_name: row.authorized_person_name || null })
        } catch (e) {
          console.error('public-sign-get:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })


      // POST /seller/sign/:token/auth — validate seller credentials, return sign_session
  router.post('/seller/sign/:token/auth', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { email, password } = req.body || {}
        if (!token || !email || !password) return res.status(400).json({ message: 'Token, email and password required' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const crypto = require('crypto')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.seller_id, st.used_at, st.expires_at FROM seller_sign_tokens st WHERE st.token = $1`,
            [token]
          )
          if (!tr.rows.length || new Date(tr.rows[0].expires_at) < new Date()) {
            await client.end()
            return res.status(404).json({ message: 'Token not found or expired' })
          }
          if (tr.rows[0].used_at) {
            await client.end()
            return res.status(410).json({ message: 'Already signed' })
          }
          const sellerId = tr.rows[0].seller_id
          const sr = await client.query(
            `SELECT id, email, password_hash FROM seller_users WHERE id::text = $1 AND LOWER(TRIM(email)) = LOWER(TRIM($2))`,
            [sellerId, email]
          )
          if (!sr.rows.length || !verifySellerPassword(password, sr.rows[0].password_hash)) {
            await client.end()
            return res.status(401).json({ message: 'Invalid email or password' })
          }
          const signSession = crypto.randomBytes(32).toString('hex')
          await client.query(`UPDATE seller_sign_tokens SET sign_session = $1 WHERE token = $2`, [signSession, token])
          await client.end()
          res.json({ sign_session: signSession })
        } catch (e) {
          console.error('sign-auth:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // POST /seller/sign/:token/submit — save signature (requires sign_session)
  router.post('/seller/sign/:token/submit', async (req, res) => {
        const token = String(req.params.token || '').trim()
        const { sign_session, signature_data } = req.body || {}
        if (!token || !sign_session) return res.status(400).json({ message: 'Token and sign_session required' })
        if (!signature_data || typeof signature_data !== 'string' || !signature_data.startsWith('data:image/png;base64,')) {
          return res.status(400).json({ message: 'Valid signature_data (PNG base64 data URL) required' })
        }
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Service unavailable' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const tr = await client.query(
            `SELECT st.*, su.company_name, su.authorized_person_name, su.store_name, su.email
             FROM seller_sign_tokens st
             JOIN seller_users su ON su.id::text = st.seller_id
             WHERE st.token = $1 AND st.sign_session = $2 AND st.expires_at > now() AND st.used_at IS NULL`,
            [token, sign_session]
          )
          if (!tr.rows.length) {
            await client.end()
            return res.status(403).json({ message: 'Invalid session, token expired or already signed' })
          }
          const row = tr.rows[0]
          const signedAt = new Date()
          const signedIp = req.ip || null
          // Fetch platform legal info for PDF
          let platformInfo = {}
          try {
            const pc = getProductsDbClient()
            if (pc) {
              await pc.connect()
              const pr = await pc.query(
                `SELECT legal_company_name, legal_representative, legal_street, legal_city, legal_trade_register, legal_register_court, legal_vat_id, legal_tax_id, legal_email FROM admin_hub_seller_settings WHERE seller_id = 'default'`
              )
              await pc.end()
              platformInfo = pr.rows[0] || {}
            }
          } catch (_) {}
          const pdfBuf = await buildAgreementPdf(
            { company_name: row.company_name, authorized_person_name: row.authorized_person_name, seller_name: row.store_name, email: row.email },
            row.locale,
            signature_data,
            signedAt,
            signedIp,
            platformInfo
          )
          const pdfBase64 = 'data:application/pdf;base64,' + pdfBuf.toString('base64')
          await client.query(
            `UPDATE seller_users SET signature_data = $1, signature_at = $2, signature_ip = $3, agreement_pdf_url = $4 WHERE id::text = $5`,
            [signature_data, signedAt, signedIp, pdfBase64, row.seller_id]
          )
          await client.query(`UPDATE seller_sign_tokens SET used_at = $1, ip = $2 WHERE token = $3`, [signedAt, signedIp, token])
          await client.end()
          res.json({ success: true })
        } catch (e) {
          console.error('sign-submit:', e)
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/sign-status — poll for signature completion
  router.get('/admin-hub/v1/seller/sign-status', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT signature_at, agreement_pdf_url FROM seller_users WHERE id = $1`, [String(sellerUser.id)])
          await client.end()
          const row = r.rows[0] || {}
          res.json({ signed: !!row.signature_at, signature_at: row.signature_at || null, has_pdf: !!row.agreement_pdf_url })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

      // GET /admin-hub/v1/seller/agreement-pdf — download signed PDF (seller or superuser)
  router.get('/admin-hub/v1/seller/agreement-pdf', async (req, res) => {
        const sellerUser = req.sellerUser
        if (!sellerUser) return res.status(401).json({ message: 'Unauthorized' })
        const targetSellerId = req.query.seller_id && sellerUser.is_superuser ? String(req.query.seller_id) : String(sellerUser.id)
        const dbUrl = (process.env.DATABASE_URL || '').replace(/^postgresql:\/\//, 'postgres://')
        if (!dbUrl) return res.status(503).json({ message: 'Database not configured' })
        try {
          const { Client } = require('pg')
          const client = new Client({ connectionString: dbUrl, ssl: dbUrl.includes('render.com') ? { rejectUnauthorized: false } : false })
          await client.connect()
          const r = await client.query(`SELECT agreement_pdf_url FROM seller_users WHERE id = $1`, [targetSellerId])
          await client.end()
          const pdfData = r.rows[0]?.agreement_pdf_url
          if (!pdfData) return res.status(404).json({ message: 'No signed agreement found' })
          if (pdfData.startsWith('data:application/pdf;base64,')) {
            const buf = Buffer.from(pdfData.split(',')[1], 'base64')
            res.set('Content-Type', 'application/pdf')
            res.set('Content-Disposition', 'attachment; filename="andertal-agreement.pdf"')
            return res.send(buf)
          }
          res.status(500).json({ message: 'Invalid PDF data' })
        } catch (e) {
          res.status(500).json({ message: e?.message || 'Error' })
        }
      })

  return router
}
