"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Modal, Spinner, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useUnsavedChanges } from "@/context/UnsavedChangesContext";
import SellerCreditCardSection from "@/components/SellerCreditCardSection";

const PHONE_CODES = [
  { code: "DE", dial: "+49" },
  { code: "AT", dial: "+43" },
  { code: "CH", dial: "+41" },
  { code: "TR", dial: "+90" },
  { code: "FR", dial: "+33" },
  { code: "NL", dial: "+31" },
  { code: "BE", dial: "+32" },
  { code: "PL", dial: "+48" },
  { code: "IT", dial: "+39" },
  { code: "ES", dial: "+34" },
  { code: "GB", dial: "+44" },
  { code: "US", dial: "+1" },
];

const tByLocale = (l) => {
  if (l === "tr") {
    return {
      title: "Satıcı Doğrulama",
      subtitle: "Satışa başlayabilmek için yasal onay ve şirket evraklarını tamamlayın.",
      docsSent: "Evraklar gönderildi. İnceleme tamamlanınca burada statünüz güncellenecek.",
      agreementTitle: "Hukuki onay",
      agreementText: "Satıcı ile platform arasındaki {link} okudum ve onaylıyorum.",
      agreementLink: "hukuki sözleşmeleri",
      contractModalTitle: "Satıcı-Platform Sözleşmesi",
      companyTitle: "Şirket bilgileri",
      contactTitle: "İletişim ve adres",
      docsTitle: "Evraklar",
      companyName: "Şirket adı",
      authorizedPerson: "Yetkili kişi adı soyadı",
      taxId: "Vergi numarası",
      taxIdHelp: "Örn. 1234567890 — Vergi dairesinden alınan 10 haneli vergi numarası (KDV numarasından farklıdır).",
      vatId: "KDV numarası",
      vatIdHelp: "Örn. DE123456789 — KDV mükellefleri için. Uluslararası satış yapıyorsanız zorunludur.",
      iban: "IBAN",
      phone: "Telefon numarası",
      phoneCountry: "Ülke kodu",
      street: "Adres (sokak, bina no)",
      city: "Şehir",
      postalCode: "Posta kodu",
      country: "Ülke",
      docTypes: {
        trade_register: "Ticaret sicil belgesi",
        id_passport: "Kimlik / Pasaport",
        tax_document: "Vergi levhası (opsiyonel)",
      },
      docHints: {
        trade_register: "Ticaret sicil gazetesi veya ticaret odası faaliyet belgesi. Son 3 ay içinde alınmış olmalı. PDF tercih edilir.",
        id_passport: "Kimlik kartı veya pasaport ön yüz (kimlik için arka yüz de eklenebilir). PDF veya JPG formatında yükleyin.",
        tax_document: "Vergi levhası veya vergi beyan belgesi. PDF olarak yükleyin. Opsiyonel ama önerilir.",
      },
      uploadBtn: "Dosya seç",
      uploaded: "Yüklendi",
      notUploaded: "Henüz yüklenmedi",
      required: "Zorunlu",
      optional: "Opsiyonel",
      submit: "Doğrulama için gönder",
      saving: "Kaydediliyor...",
      needAgreement: "Devam etmek için sözleşme onayı gerekli.",
      needDocs: "Ticaret sicil belgesi ve kimlik/pasaport yüklemelisiniz.",
      saveOk: "Bilgiler kaydedildi ve doğrulama süreci başlatıldı.",
      reviewingTitle: "Doğrulama inceleniyor",
      reviewingDetail: "Evraklarınız ve bilgileriniz ekibimiz tarafından inceleniyor. Bu süreç genellikle 1-3 iş günü sürer. Sonuç e-posta ile bildirilecektir.",
      statusLabel: "Hesap durumu",
      status: {
        registered: "Kayıt oldu - satış öncesi doğrulama gerekli",
        documents_submitted: "Evraklar gönderildi - inceleme bekleniyor",
        pending_approval: "Onay bekliyor",
        pending: "Onay bekliyor",
        approved: "Hesap onaylandı - satış yapabilirsiniz",
        active: "Hesap onaylandı - satış yapabilirsiniz",
        rejected: "Başvuru reddedildi - destek ile iletişime geçin",
        suspended: "Hesap askıya alındı - destek ile iletişime geçin",
      },
    };
  }
  if (l === "de") {
    return {
      title: "Verifizierung",
      subtitle: "Schließe rechtliche Bestätigung und Unternehmensdokumente ab, um mit dem Verkauf zu starten.",
      docsSent: "Dokumente wurden gesendet. Der Status wird nach der Prüfung hier aktualisiert.",
      agreementTitle: "Rechtliche Bestätigung",
      agreementText: "Ich habe die {link} zwischen Verkäufer und Plattform gelesen und akzeptiere sie.",
      agreementLink: "rechtlichen Vereinbarungen",
      contractModalTitle: "Verkäufer-Plattform-Vereinbarung",
      companyTitle: "Firmendaten",
      contactTitle: "Kontakt & Adresse",
      docsTitle: "Dokumente",
      companyName: "Firmenname",
      authorizedPerson: "Bevollmächtigte Person (Vor- und Nachname)",
      taxId: "Steuernummer",
      taxIdHelp: "Z.B. 12/345/67890 — die vom Finanzamt zugeteilte Steuernummer (nicht die USt-IdNr.). Format je nach Bundesland unterschiedlich.",
      vatId: "USt-IdNr.",
      vatIdHelp: "Z.B. DE123456789 — Umsatzsteuer-Identifikationsnummer, beginnt mit Ländercode + 9 Ziffern. Nur für USt-pflichtige Unternehmen.",
      iban: "IBAN",
      phone: "Telefonnummer",
      phoneCountry: "Vorwahl",
      street: "Straße und Hausnummer",
      city: "Stadt",
      postalCode: "Postleitzahl",
      country: "Land",
      docTypes: {
        trade_register: "Handelsregisterauszug",
        id_passport: "Ausweis / Reisepass",
        tax_document: "Steuerdokument (optional)",
      },
      docHints: {
        trade_register: "Offizieller Handelsregisterauszug (HRB/HRA), nicht älter als 3 Monate. PDF bevorzugt.",
        id_passport: "Vorder- und Rückseite des Personalausweises oder Reisepasses als PDF oder JPG.",
        tax_document: "Steuerbescheid oder Umsatzsteuervoranmeldung als PDF. Optional, aber empfohlen.",
      },
      uploadBtn: "Datei auswählen",
      uploaded: "Hochgeladen",
      notUploaded: "Noch nicht hochgeladen",
      required: "Pflichtfeld",
      optional: "Optional",
      submit: "Zur Verifizierung senden",
      saving: "Wird gespeichert...",
      needAgreement: "Bitte bestätige zuerst die rechtliche Vereinbarung.",
      needDocs: "Bitte lade Handelsregisterauszug und Ausweis/Reisepass hoch.",
      saveOk: "Daten gespeichert und zur Verifizierung eingereicht.",
      reviewingTitle: "Verifizierung wird geprüft",
      reviewingDetail: "Deine Dokumente und Angaben werden von unserem Team geprüft. Dies dauert in der Regel 1–3 Werktage. Das Ergebnis wird per E-Mail mitgeteilt.",
      statusLabel: "Kontostatus",
      status: {
        registered: "Registriert - Verifizierung vor dem Verkauf erforderlich",
        documents_submitted: "Dokumente eingereicht - Prüfung läuft",
        pending_approval: "Wartet auf Freigabe",
        pending: "Wartet auf Freigabe",
        approved: "Konto bestätigt - Verkauf ist möglich",
        active: "Konto bestätigt - Verkauf ist möglich",
        rejected: "Abgelehnt - bitte Support kontaktieren",
        suspended: "Gesperrt - bitte Support kontaktieren",
      },
    };
  }
  if (l === "fr") {
    return {
      title: "Vérification du vendeur",
      subtitle: "Complétez la confirmation légale et les documents d'entreprise avant de commencer à vendre.",
      docsSent: "Documents soumis. Votre statut sera mis à jour ici après examen.",
      agreementTitle: "Confirmation légale",
      agreementText: "J'ai lu et j'accepte les {link} entre le vendeur et la plateforme.",
      agreementLink: "Accords légaux",
      contractModalTitle: "Accord Vendeur–Plateforme",
      companyTitle: "Données de l'entreprise",
      contactTitle: "Contact et adresse",
      docsTitle: "Documents",
      companyName: "Nom de l'entreprise",
      authorizedPerson: "Personne autorisée (nom complet)",
      taxId: "Numéro fiscal",
      taxIdHelp: "Ex. 12345678901 — numéro attribué par l'administration fiscale.",
      vatId: "Numéro de TVA",
      vatIdHelp: "Ex. FR12345678901 — requis pour les entreprises assujetties à la TVA.",
      iban: "IBAN",
      phone: "Numéro de téléphone",
      phoneCountry: "Indicatif",
      street: "Adresse (rue, numéro)",
      city: "Ville",
      postalCode: "Code postal",
      country: "Pays",
      docTypes: {
        trade_register: "Extrait du registre du commerce",
        id_passport: "Carte d'identité / Passeport",
        tax_document: "Document fiscal (optionnel)",
      },
      docHints: {
        trade_register: "Extrait Kbis ou équivalent, datant de moins de 3 mois. PDF de préférence.",
        id_passport: "Recto-verso de la carte d'identité ou passeport en PDF ou JPG.",
        tax_document: "Avis d'imposition ou déclaration de TVA en PDF. Optionnel mais recommandé.",
      },
      uploadBtn: "Choisir un fichier",
      uploaded: "Téléchargé",
      notUploaded: "Pas encore téléchargé",
      required: "Obligatoire",
      optional: "Optionnel",
      submit: "Soumettre pour vérification",
      saving: "Enregistrement...",
      needAgreement: "Veuillez accepter l'accord légal pour continuer.",
      needDocs: "Veuillez télécharger l'extrait du registre du commerce et la pièce d'identité.",
      saveOk: "Enregistré avec succès et soumis pour vérification.",
      reviewingTitle: "Vérification en cours",
      reviewingDetail: "Vos documents et informations sont en cours d'examen par notre équipe. Cela prend généralement 1 à 3 jours ouvrables. Vous serez informé par e-mail.",
      statusLabel: "Statut du compte",
      status: {
        registered: "Inscrit - vérification requise avant la vente",
        documents_submitted: "Documents soumis - en cours d'examen",
        pending_approval: "En attente d'approbation",
        pending: "En attente d'approbation",
        approved: "Compte approuvé - vous pouvez vendre",
        active: "Compte approuvé - vous pouvez vendre",
        rejected: "Refusé - veuillez contacter le support",
        suspended: "Suspendu - veuillez contacter le support",
      },
    };
  }
  if (l === "es") {
    return {
      title: "Verificación del vendedor",
      subtitle: "Complete la confirmación legal y los documentos de empresa antes de comenzar a vender.",
      docsSent: "Documentos enviados. Su estado se actualizará aquí tras la revisión.",
      agreementTitle: "Confirmación legal",
      agreementText: "He leído y acepto los {link} entre el vendedor y la plataforma.",
      agreementLink: "Acuerdos legales",
      contractModalTitle: "Acuerdo Vendedor–Plataforma",
      companyTitle: "Datos de la empresa",
      contactTitle: "Contacto y dirección",
      docsTitle: "Documentos",
      companyName: "Nombre de la empresa",
      authorizedPerson: "Persona autorizada (nombre completo)",
      taxId: "NIF / CIF",
      taxIdHelp: "Ej. A12345678 — número de identificación fiscal asignado por la administración.",
      vatId: "NIF-IVA",
      vatIdHelp: "Ej. ES12345678A — requerido para empresas registradas a efectos del IVA.",
      iban: "IBAN",
      phone: "Número de teléfono",
      phoneCountry: "Prefijo",
      street: "Dirección (calle, número)",
      city: "Ciudad",
      postalCode: "Código postal",
      country: "País",
      docTypes: {
        trade_register: "Extracto del registro mercantil",
        id_passport: "DNI / Pasaporte",
        tax_document: "Documento fiscal (opcional)",
      },
      docHints: {
        trade_register: "Certificado de inscripción en el Registro Mercantil, no anterior a 3 meses. Se prefiere PDF.",
        id_passport: "Anverso y reverso del DNI o pasaporte en PDF o JPG.",
        tax_document: "Liquidación de IVA o resolución fiscal en PDF. Opcional pero recomendado.",
      },
      uploadBtn: "Seleccionar archivo",
      uploaded: "Cargado",
      notUploaded: "Aún no cargado",
      required: "Obligatorio",
      optional: "Opcional",
      submit: "Enviar para verificación",
      saving: "Guardando...",
      needAgreement: "Por favor, acepte el acuerdo legal para continuar.",
      needDocs: "Por favor, cargue el extracto del registro mercantil y el DNI/Pasaporte.",
      saveOk: "Guardado correctamente y enviado para verificación.",
      reviewingTitle: "Verificación en curso",
      reviewingDetail: "Nuestro equipo está revisando sus documentos e información. Esto suele tardar entre 1 y 3 días hábiles. Se le notificará por correo electrónico.",
      statusLabel: "Estado de la cuenta",
      status: {
        registered: "Registrado - verificación requerida antes de vender",
        documents_submitted: "Documentos enviados - en revisión",
        pending_approval: "Pendiente de aprobación",
        pending: "Pendiente de aprobación",
        approved: "Cuenta aprobada - puede vender ahora",
        active: "Cuenta aprobada - puede vender ahora",
        rejected: "Rechazado - contacte con soporte",
        suspended: "Suspendido - contacte con soporte",
      },
    };
  }
  if (l === "it") {
    return {
      title: "Verifica del venditore",
      subtitle: "Completa la conferma legale e i documenti aziendali prima di iniziare a vendere.",
      docsSent: "Documenti inviati. Il tuo stato verrà aggiornato qui dopo la revisione.",
      agreementTitle: "Conferma legale",
      agreementText: "Ho letto e accetto gli {link} tra il venditore e la piattaforma.",
      agreementLink: "Accordi legali",
      contractModalTitle: "Accordo Venditore–Piattaforma",
      companyTitle: "Dati aziendali",
      contactTitle: "Contatto e indirizzo",
      docsTitle: "Documenti",
      companyName: "Nome dell'azienda",
      authorizedPerson: "Persona autorizzata (nome e cognome)",
      taxId: "Codice fiscale / P.IVA",
      taxIdHelp: "Es. IT12345678901 — codice fiscale o partita IVA assegnata dall'amministrazione.",
      vatId: "Partita IVA",
      vatIdHelp: "Es. IT12345678901 — richiesta per le imprese registrate ai fini IVA.",
      iban: "IBAN",
      phone: "Numero di telefono",
      phoneCountry: "Prefisso",
      street: "Indirizzo (via, numero civico)",
      city: "Città",
      postalCode: "CAP",
      country: "Paese",
      docTypes: {
        trade_register: "Visura camerale",
        id_passport: "Carta d'identità / Passaporto",
        tax_document: "Documento fiscale (opzionale)",
      },
      docHints: {
        trade_register: "Visura camerale aggiornata, non anteriore a 3 mesi. Si preferisce PDF.",
        id_passport: "Fronte e retro della carta d'identità o passaporto in PDF o JPG.",
        tax_document: "Dichiarazione IVA o certificato fiscale in PDF. Opzionale ma consigliato.",
      },
      uploadBtn: "Scegli file",
      uploaded: "Caricato",
      notUploaded: "Non ancora caricato",
      required: "Obbligatorio",
      optional: "Opzionale",
      submit: "Invia per la verifica",
      saving: "Salvataggio in corso...",
      needAgreement: "Per favore, accetta l'accordo legale per continuare.",
      needDocs: "Per favore, carica la visura camerale e il documento d'identità.",
      saveOk: "Salvato con successo e inviato per la verifica.",
      reviewingTitle: "Verifica in corso",
      reviewingDetail: "Il nostro team sta esaminando i tuoi documenti e le tue informazioni. Questa operazione richiede in genere 1-3 giorni lavorativi. Sarai notificato via e-mail.",
      statusLabel: "Stato dell'account",
      status: {
        registered: "Registrato - verifica richiesta prima di vendere",
        documents_submitted: "Documenti inviati - in revisione",
        pending_approval: "In attesa di approvazione",
        pending: "In attesa di approvazione",
        approved: "Account approvato - puoi vendere ora",
        active: "Account approvato - puoi vendere ora",
        rejected: "Rifiutato - contatta il supporto",
        suspended: "Sospeso - contatta il supporto",
      },
    };
  }
  return {
    title: "Seller Verification",
    subtitle: "Complete legal confirmation and company documents before you can start selling.",
    docsSent: "Documents submitted. Your status will be updated here after review.",
    agreementTitle: "Legal confirmation",
    agreementText: "I have read and agree to the {link} between seller and platform.",
    agreementLink: "Legal Agreements",
    contractModalTitle: "Seller–Platform Agreement",
    companyTitle: "Company details",
    contactTitle: "Contact & address",
    docsTitle: "Documents",
    companyName: "Company name",
    authorizedPerson: "Authorized person (full name)",
    taxId: "Tax ID",
    taxIdHelp: "e.g. 12/345/67890 — Tax number issued by your local tax office (not the VAT ID).",
    vatId: "VAT ID",
    vatIdHelp: "e.g. DE123456789 — Required for VAT-registered businesses. Starts with country code + digits.",
    iban: "IBAN",
    phone: "Phone number",
    phoneCountry: "Country code",
    street: "Street address",
    city: "City",
    postalCode: "Postal code",
    country: "Country",
    docTypes: {
      trade_register: "Trade register extract",
      id_passport: "ID / Passport",
      tax_document: "Tax document (optional)",
    },
    docHints: {
      trade_register: "Official trade register extract, not older than 3 months. PDF preferred.",
      id_passport: "Front and back of your ID card or passport as PDF or JPG.",
      tax_document: "Tax assessment or VAT return document as PDF. Optional but recommended.",
    },
    uploadBtn: "Choose file",
    uploaded: "Uploaded",
    notUploaded: "Not uploaded yet",
    required: "Required",
    optional: "Optional",
    submit: "Submit for verification",
    saving: "Saving...",
    needAgreement: "Please accept the legal agreement to continue.",
    needDocs: "Please upload trade register extract and ID/Passport.",
    saveOk: "Saved successfully and submitted for verification.",
    reviewingTitle: "Verification under review",
    reviewingDetail: "Your documents and details are being reviewed by our team. This typically takes 1–3 business days. You will be notified by email once complete.",
    statusLabel: "Account status",
    status: {
      registered: "Registered - verification required before selling",
      documents_submitted: "Documents submitted - under review",
      pending_approval: "Pending approval",
      pending: "Pending approval",
      approved: "Approved account - you can sell now",
      active: "Approved account - you can sell now",
      rejected: "Rejected - please contact support",
      suspended: "Suspended - please contact support",
    },
  };
};

const statusTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "approved" || s === "active") return "success";
  if (s === "rejected" || s === "suspended") return "critical";
  if (s === "documents_submitted" || s === "pending_approval" || s === "pending") return "warning";
  return "info";
};

const DOC_TYPES = ["trade_register", "id_passport", "tax_document"];
const DOC_REQUIRED = { trade_register: true, id_passport: true, tax_document: false };

// ── EU-compliant Seller-Platform Contract ────────────────────────────────────
const CONTRACT_SECTIONS = {
  de: [
    {
      heading: "Präambel",
      body: `Diese Vereinbarung regelt die Rechtsbeziehung zwischen dem Betreiber der Plattform Andertal (nachfolgend „Plattform") und dem registrierten Verkäufer (nachfolgend „Verkäufer"). Mit Abschluss der Verifizierung erklärt sich der Verkäufer mit allen nachfolgenden Bedingungen einverstanden. Die Vereinbarung entspricht den Anforderungen der Verordnung (EU) 2022/2065 (Digital Services Act), der Verordnung (EU) 2019/1150 (P2B-Verordnung), der DSGVO sowie dem deutschen Bürgerlichen Gesetzbuch (BGB).`,
    },
    {
      heading: "§ 1 – Vertragsgegenstand",
      body: `Die Plattform stellt dem Verkäufer eine technische Infrastruktur zum Anbieten, Verwalten und Verkaufen von Waren gegenüber Endverbrauchern zur Verfügung. Der Verkäufer tritt als eigenverantwortlicher Händler im eigenen Namen und auf eigene Rechnung auf. Die Plattform ist kein Vertragspartner der Kaufverträge zwischen Verkäufer und Endkunden.`,
    },
    {
      heading: "§ 2 – Pflichten des Verkäufers",
      body: `Der Verkäufer verpflichtet sich:\n• Ausschließlich legale Waren anzubieten und geltende Produktsicherheits-, Kennzeichnungs- und Verbraucherschutzvorschriften einzuhalten.\n• Vollständige und korrekte Geschäftsdaten (Impressum, Steuernummer, IBAN) bereitzustellen und aktuell zu halten.\n• Bestellungen innerhalb der angegebenen Lieferfristen zu erfüllen und Kunden bei Verzögerungen unverzüglich zu benachrichtigen.\n• Gesetzliche Gewährleistungsrechte (§§ 434 ff. BGB) zu beachten und ein 14-tägiges Widerrufsrecht gemäß § 312g BGB i.V.m. Art. 246a EGBGB zu gewähren.\n• Keine Preisabsprachen, Marktmanipulation oder unlauteren Wettbewerb zu betreiben (UWG).`,
    },
    {
      heading: "§ 3 – Datenschutz (DSGVO)",
      body: `Der Verkäufer verarbeitet personenbezogene Daten von Endkunden (Name, Adresse, Bestelldaten) ausschließlich zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Eine Weitergabe an Dritte ohne Rechtsgrundlage ist untersagt. Auf Verlangen hat der Verkäufer Betroffenenanfragen (Auskunft, Löschung, Berichtigung) innerhalb von 30 Tagen zu beantworten. Zwischen Plattform und Verkäufer wird soweit erforderlich ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO abgeschlossen.`,
    },
    {
      heading: "§ 4 – Provisionen und Zahlungsbedingungen",
      body: `Die Plattform erhebt eine Transaktionsgebühr gemäß der zum Zeitpunkt des Verkaufs gültigen Preisliste. Auszahlungen an den Verkäufer erfolgen nach Auftragsabschluss und Ablauf einer eventuellen Rückgabefrist. Die Plattform ist berechtigt, Beträge bei begründeten Rückforderungen (Chargebacks, Retouren, Betrug) einzubehalten. Bei Verzug mit Gebührenzahlungen werden Verzugszinsen gemäß § 288 BGB fällig.`,
    },
    {
      heading: "§ 5 – Ranking und Sichtbarkeit (P2B-Verordnung)",
      body: `Gemäß Art. 5 der EU-Verordnung 2019/1150 informiert die Plattform über die wesentlichen Parameter des Ranking-Algorithmus: Produktqualität, Kundenbewertungen, Bestellabwicklungsrate, Preisgestaltung, Aktualität des Sortiments und Konto-Compliance. Der Verkäufer kann das Ranking durch Verbesserung dieser Faktoren beeinflussen. Bezahltes Ranking wird als solches gekennzeichnet.`,
    },
    {
      heading: "§ 6 – Kontosperrung und Kündigung",
      body: `Die Plattform kann das Konto bei schwerwiegenden oder wiederholten Verstößen gegen diese Vereinbarung, bei rechtlich bedenklichen Inhalten oder auf behördliche Anordnung hin sperren oder kündigen. Vor einer Sperrung wird dem Verkäufer, sofern möglich, eine angemessene Frist zur Stellungnahme eingeräumt (Art. 4 P2B-VO). Der Verkäufer kann das Konto jederzeit mit einer Frist von 30 Tagen kündigen. Laufende Bestellungen sind auch nach Kündigung abzuwickeln.`,
    },
    {
      heading: "§ 7 – Haftungsbeschränkung",
      body: `Die Plattform haftet nicht für Schäden, die durch fehlerhafte Produktangaben des Verkäufers, Lieferverzögerungen, Produktmängel oder sonstige Pflichtverletzungen des Verkäufers entstehen. Die Haftung der Plattform für mittelbare Schäden und entgangenen Gewinn ist – außer bei Vorsatz und grober Fahrlässigkeit – ausgeschlossen (§ 276 BGB).`,
    },
    {
      heading: "§ 8 – Streitbeilegung",
      body: `Streitigkeiten zwischen Plattform und Verkäufer werden zunächst intern über den Support-Kanal behandelt. Die Plattform benennt gemäß Art. 11 P2B-VO als interne Beschwerdeführer: info@andertal.com. Als externe Streitbeilegungsstelle steht das Online-Streitbeilegungsportal der EU (https://ec.europa.eu/consumers/odr/) zur Verfügung. Es gilt deutsches Recht, Gerichtsstand ist Berlin.`,
    },
    {
      heading: "§ 9 – Schlussbestimmungen",
      body: `Änderungen dieser Vereinbarung werden dem Verkäufer mindestens 15 Tage vor Inkrafttreten in schriftlicher Form (E-Mail) mitgeteilt (Art. 3 P2B-VO). Sollten einzelne Bestimmungen unwirksam sein, bleiben die übrigen Bestimmungen wirksam (salvatorische Klausel, § 306 BGB). Letzte Aktualisierung: April 2026.`,
    },
  ],
  tr: [
    {
      heading: "Önsöz",
      body: `Bu sözleşme, Andertal platformunun işletmecisi (bundan böyle "Platform") ile kayıtlı satıcı (bundan böyle "Satıcı") arasındaki hukuki ilişkiyi düzenler. AB Dijital Hizmetler Yasası (DSA - (EU) 2022/2065), P2B Tüzüğü ((EU) 2019/1150), GDPR ve Türk Ticaret Kanunu çerçevesinde hazırlanmıştır.`,
    },
    {
      heading: "Madde 1 – Sözleşmenin Konusu",
      body: `Platform, Satıcıya son tüketicilere ürün sunma, yönetme ve satma amacıyla teknik bir altyapı sağlar. Satıcı, kendi adına ve kendi hesabına bağımsız bir satıcı olarak hareket eder. Platform, Satıcı ile son müşteri arasındaki satış sözleşmelerinin tarafı değildir.`,
    },
    {
      heading: "Madde 2 – Satıcının Yükümlülükleri",
      body: `Satıcı şunları taahhüt eder:\n• Yalnızca yasal ürünler sunmak ve geçerli ürün güvenliği, etiketleme ve tüketici koruma mevzuatına uymak.\n• Eksiksiz ve doğru ticari bilgiler (vergi numarası, IBAN, adres) sağlamak ve güncel tutmak.\n• Belirtilen teslimat sürelerinde siparişleri yerine getirmek; gecikme halinde müşteriyi derhal bilgilendirmek.\n• Yasal garanti haklarına ve 14 günlük cayma hakkına uymak.\n• Fiyat anlaşmaları, piyasa manipülasyonu veya haksız rekabet yapmamak.`,
    },
    {
      heading: "Madde 3 – Kişisel Verilerin Korunması (KVKK / GDPR)",
      body: `Satıcı, son müşterilere ait kişisel verileri (isim, adres, sipariş bilgileri) yalnızca sözleşmenin ifası amacıyla işler. Hukuki dayanak olmaksızın üçüncü taraflara veri aktarımı yasaktır. Veri sahibi talepleri (erişim, silme, düzeltme) 30 gün içinde yanıtlanmalıdır. Gerekli hallerde taraflar arasında Veri İşleme Sözleşmesi akdedilir.`,
    },
    {
      heading: "Madde 4 – Komisyonlar ve Ödeme Koşulları",
      body: `Platform, satış anında geçerli fiyat listesine göre işlem ücreti alır. Satıcıya ödemeler, sipariş tamamlandıktan ve olası iade süresi dolduktan sonra yapılır. İade, ters ibraz veya dolandırıcılık durumlarında Platform tutarları alıkoyma hakkını saklı tutar. Komisyon gecikmelerinde yasal gecikme faizi uygulanır.`,
    },
    {
      heading: "Madde 5 – Sıralama ve Görünürlük (P2B Tüzüğü)",
      body: `AB P2B Tüzüğü Madde 5 uyarınca Platform, sıralama algoritmasının temel parametrelerini şeffaf biçimde açıklar: ürün kalitesi, müşteri değerlendirmeleri, sipariş karşılama oranı, fiyatlandırma, güncel katalog ve hesap uyumluluğu. Ücretli sıralama ayrıca belirtilir.`,
    },
    {
      heading: "Madde 6 – Hesap Askıya Alma ve Fesih",
      body: `Platform; ağır veya tekrarlayan ihlaller, hukuka aykırı içerik veya yetkili makam kararı durumunda hesabı askıya alabilir ya da feshedebilir. Askıya almadan önce mümkün olan durumlarda Satıcıya savunma hakkı tanınır. Satıcı hesabını 30 gün önceden bildirerek istediği zaman feshedebilir. Devam eden siparişler fesih sonrasında da tamamlanmalıdır.`,
    },
    {
      heading: "Madde 7 – Sorumluluk Sınırlaması",
      body: `Platform; Satıcının hatalı ürün bilgilerinden, teslimat gecikmelerinden, ürün kusurlarından veya diğer yükümlülük ihlallerinden kaynaklanan zararlardan sorumlu değildir. Kasıt ve ağır ihmal dışında Platform'un dolaylı zararlar ve yoksun kalınan kar için sorumluluğu sınırlıdır.`,
    },
    {
      heading: "Madde 8 – Uyuşmazlık Çözümü",
      body: `Uyuşmazlıklar önce info@andertal.com üzerinden dahili destek kanalıyla çözülmeye çalışılır. Çözüme kavuşturulamazsa AB Çevrimiçi Uyuşmazlık Çözüm Platformu (https://ec.europa.eu/consumers/odr/) başvuru için kullanılabilir. Türk mevzuatı ve Almanya hukuku birlikte uygulanır; yetki mahkemesi Berlin'dir.`,
    },
    {
      heading: "Madde 9 – Son Hükümler",
      body: `Bu sözleşmedeki değişiklikler yürürlüğe girmeden en az 15 gün önce Satıcıya e-posta ile bildirilir. Herhangi bir hükmün geçersizliği diğer hükümlerin geçerliliğini etkilemez. Son güncelleme: Nisan 2026.`,
    },
  ],
  en: [
    {
      heading: "Preamble",
      body: `This Agreement governs the legal relationship between the operator of the Andertal platform (hereinafter "Platform") and the registered seller (hereinafter "Seller"). It is prepared in compliance with Regulation (EU) 2022/2065 (Digital Services Act), Regulation (EU) 2019/1150 (P2B Regulation), the GDPR, and applicable national law.`,
    },
    {
      heading: "Article 1 – Subject Matter",
      body: `The Platform provides the Seller with technical infrastructure to list, manage, and sell goods to end consumers. The Seller acts as an independent trader in their own name and on their own account. The Platform is not a party to sales contracts concluded between the Seller and end customers.`,
    },
    {
      heading: "Article 2 – Seller Obligations",
      body: `The Seller undertakes to:\n• Offer only lawful goods and comply with applicable product safety, labeling, and consumer protection regulations.\n• Provide complete and accurate business information (tax ID, IBAN, address) and keep it up to date.\n• Fulfill orders within stated delivery times and notify customers promptly in case of delay.\n• Respect statutory warranty rights and grant a 14-day right of withdrawal.\n• Refrain from price-fixing, market manipulation, or unfair competition.`,
    },
    {
      heading: "Article 3 – Data Protection (GDPR)",
      body: `The Seller processes personal data of end customers (name, address, order data) solely for the purpose of contract performance (Art. 6(1)(b) GDPR). Transfer to third parties without a legal basis is prohibited. Data subject requests (access, erasure, rectification) must be answered within 30 days. A Data Processing Agreement (DPA) pursuant to Art. 28 GDPR will be concluded where required.`,
    },
    {
      heading: "Article 4 – Fees and Payment Terms",
      body: `The Platform charges a transaction fee in accordance with the price list valid at the time of sale. Payouts to the Seller are made after order completion and expiry of any applicable return period. The Platform reserves the right to withhold amounts in justified cases of chargebacks, returns, or fraud. Late payment of fees incurs statutory default interest.`,
    },
    {
      heading: "Article 5 – Ranking and Visibility (P2B Regulation)",
      body: `Pursuant to Art. 5 of EU Regulation 2019/1150, the Platform discloses the main parameters of its ranking algorithm: product quality, customer reviews, order fulfillment rate, pricing, catalog freshness, and account compliance. Paid ranking is labeled as such.`,
    },
    {
      heading: "Article 6 – Account Suspension and Termination",
      body: `The Platform may suspend or terminate the account for serious or repeated violations of this Agreement, for unlawful content, or on governmental order. Where possible, the Seller is given reasonable opportunity to respond before suspension (Art. 4 P2B Regulation). The Seller may terminate the account at any time with 30 days' notice. Pending orders must be fulfilled even after termination.`,
    },
    {
      heading: "Article 7 – Limitation of Liability",
      body: `The Platform is not liable for damages arising from incorrect product information provided by the Seller, delivery delays, product defects, or other breaches of duty by the Seller. The Platform's liability for indirect damages and lost profits is excluded — except in cases of intent or gross negligence.`,
    },
    {
      heading: "Article 8 – Dispute Resolution",
      body: `Disputes between the Platform and the Seller are first addressed via the internal support channel at info@andertal.com. The EU Online Dispute Resolution platform (https://ec.europa.eu/consumers/odr/) is available for unresolved disputes. German law applies; the place of jurisdiction is Berlin.`,
    },
    {
      heading: "Article 9 – Final Provisions",
      body: `Changes to this Agreement will be communicated to the Seller in writing (email) at least 15 days before taking effect (Art. 3 P2B Regulation). If any provision is found invalid, the remaining provisions remain in force (severability). Last updated: April 2026.`,
    },
  ],
};

function ContractModal({ locale, title, onClose }) {
  const sections = CONTRACT_SECTIONS[locale] || CONTRACT_SECTIONS.en;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      primaryAction={{ content: locale === "tr" ? "Kapat" : locale === "de" ? "Schließen" : "Close", onAction: onClose }}
      large
    >
      <Modal.Section>
        <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
          <BlockStack gap="400">
            {sections.map((sec) => (
              <BlockStack gap="100" key={sec.heading}>
                <Text as="h3" variant="headingSm" fontWeight="bold">{sec.heading}</Text>
                <div style={{ whiteSpace: "pre-line" }}>
                  <Text as="p" variant="bodySm" tone="subdued">{sec.body}</Text>
                </div>
              </BlockStack>
            ))}
          </BlockStack>
        </div>
      </Modal.Section>
    </Modal>
  );
}

/** Extracts dial code from a stored phone string. Returns { dialCode, number }. */
function parseStoredPhone(phone) {
  if (!phone) return { dialCode: "+49", number: "" };
  const str = String(phone).trim();
  for (const entry of PHONE_CODES) {
    if (str.startsWith(entry.dial)) {
      return { dialCode: entry.dial, number: str.slice(entry.dial.length).trim() };
    }
  }
  // If starts with + but unknown, keep as-is in number field
  return { dialCode: "+49", number: str };
}

function DocUploadRow({ label, hint, docType, doc, onUpload, uploading, t }) {
  const inputId = `doc-upload-${docType}`;
  const isRequired = DOC_REQUIRED[docType];
  return (
    <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center" wrap gap="200">
          <BlockStack gap="100">
            <InlineStack gap="150" blockAlign="center">
              <Text as="span" variant="bodyMd" fontWeight="semibold">{label}</Text>
              <Text as="span" variant="bodySm" tone="subdued">({isRequired ? t.required : t.optional})</Text>
            </InlineStack>
            {doc ? (
              <InlineStack gap="150" blockAlign="center">
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                <Text as="span" variant="bodySm" tone="success">{t.uploaded}: {doc.name || doc.url?.split("/").pop() || "file"}</Text>
              </InlineStack>
            ) : (
              <InlineStack gap="150" blockAlign="center">
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#9ca3af", flexShrink: 0 }} />
                <Text as="span" variant="bodySm" tone="subdued">{t.notUploaded}</Text>
              </InlineStack>
            )}
          </BlockStack>
          <div>
            <input
              id={inputId}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && onUpload(docType, e.target.files[0])}
            />
            <Button size="slim" onClick={() => document.getElementById(inputId)?.click()} loading={uploading}>
              {t.uploadBtn}
            </Button>
          </div>
        </InlineStack>
        {hint && (
          <Text as="p" variant="bodySm" tone="subdued">{hint}</Text>
        )}
      </BlockStack>
    </Box>
  );
}

export default function VerificationSettingsPage() {
  const unsaved = useUnsavedChanges();
  const locale = useLocale();
  const t = useMemo(() => tByLocale(locale), [locale]);
  const client = getMedusaAdminClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState("registered");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [uploadingDocType, setUploadingDocType] = useState(null);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [phoneDialCode, setPhoneDialCode] = useState("+49");
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureAt, setSignatureAt] = useState(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const pollRef = useRef(null);
  const [form, setForm] = useState({
    companyName: "",
    authorizedPersonName: "",
    taxId: "",
    vatId: "",
    iban: "",
    phone: "",
    street: "",
    city: "",
    postalCode: "",
    country: "",
    docs: { trade_register: null, id_passport: null, tax_document: null },
  });

  const snapshotFrom = useCallback((nextForm, nextAgreement, nextDialCode) => {
    return JSON.stringify({
      agreementAccepted: !!nextAgreement,
      phoneDialCode: nextDialCode || "+49",
      companyName: nextForm.companyName || "",
      authorizedPersonName: nextForm.authorizedPersonName || "",
      taxId: nextForm.taxId || "",
      vatId: nextForm.vatId || "",
      iban: nextForm.iban || "",
      phone: nextForm.phone || "",
      street: nextForm.street || "",
      city: nextForm.city || "",
      postalCode: nextForm.postalCode || "",
      country: nextForm.country || "",
      docs: DOC_TYPES.map((dt) => ({
        doc_type: dt,
        url: nextForm.docs?.[dt]?.url || null,
        name: nextForm.docs?.[dt]?.name || null,
      })),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, account] = await Promise.all([
          client.getSellerSettings(),
          client.getSellerAccount(),
        ]);
        if (cancelled) return;
        const seller = account?.sellerUser || account?.user || {};
        const s = String(seller?.approval_status || "registered").toLowerCase();
        setStatus(s);
        if (typeof window !== "undefined") localStorage.setItem("sellerApprovalStatus", s);
        const addr = seller?.business_address || {};
        const storedDocs = Array.isArray(seller?.documents) ? seller.documents : [];
        const docs = { trade_register: null, id_passport: null, tax_document: null };
        storedDocs.forEach((d) => {
          if (d?.doc_type && docs.hasOwnProperty(d.doc_type)) docs[d.doc_type] = d;
        });
        const { dialCode, number } = parseStoredPhone(seller?.phone);
        setPhoneDialCode(dialCode);
        const nextForm = {
          companyName: seller?.company_name || "",
          authorizedPersonName: seller?.authorized_person_name || "",
          taxId: seller?.tax_id || "",
          vatId: seller?.vat_id || "",
          iban: seller?.iban || "",
          phone: number,
          street: addr?.street || "",
          city: addr?.city || "",
          postalCode: addr?.postal_code || "",
          country: addr?.country || "",
          docs,
        };
        setForm((p) => ({ ...p, ...nextForm }));
        const nextAgreement = s !== "registered";

        // Load signature status BEFORE setting agreementAccepted to avoid QR creation race
        let alreadySigned = false;
        let alreadySignedAt = null;
        try {
          const signStatus = await client.getSignStatus();
          if (signStatus?.signed) {
            alreadySigned = true;
            alreadySignedAt = signStatus.signature_at || null;
          }
        } catch (_) {}

        if (!cancelled) {
          if (alreadySigned) {
            setSigned(true);
            setSignatureAt(alreadySignedAt);
          }
          setAgreementAccepted(nextAgreement);
          setInitialSnapshot(snapshotFrom(nextForm, nextAgreement, dialCode));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load verification data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, snapshotFrom]);

  // Create QR code when checkbox is checked and not yet signed
  useEffect(() => {
    if (!agreementAccepted || signed || qrDataUrl) return;
    let cancelled = false;
    setQrLoading(true);
    client.createSignToken(locale).then((res) => {
      if (!cancelled) {
        setQrDataUrl(res.qr_data_url);
        setQrLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setQrLoading(false);
    });
    return () => { cancelled = true; };
  }, [agreementAccepted]); // intentionally omits client/locale/signed/qrDataUrl to run only on checkbox toggle

  // Clear QR code when checkbox is unchecked
  useEffect(() => {
    if (!agreementAccepted && qrDataUrl) {
      setQrDataUrl(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [agreementAccepted, qrDataUrl]);

  // Poll for signature completion when QR code is displayed
  useEffect(() => {
    if (!qrDataUrl || signed) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await client.getSignStatus();
        if (res?.signed) {
          setSigned(true);
          setSignatureAt(res.signature_at || null);
          setQrDataUrl(null);
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (_) {}
    }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [qrDataUrl, signed]); // intentionally omits client to avoid polling restart on re-render

  const handleDocUpload = async (docType, file) => {
    setUploadingDocType(docType);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await client.uploadMedia(fd);
      if (result?.url) {
        setForm((p) => ({
          ...p,
          docs: {
            ...p.docs,
            [docType]: { doc_type: docType, name: file.name, url: result.url, mime_type: file.type || "", size: file.size || 0, uploaded_at: new Date().toISOString() },
          },
        }));
      }
    } catch (e) {
      setError(e?.message || "Upload failed.");
    } finally {
      setUploadingDocType(null);
    }
  };

  const saveVerification = async () => {
    setError("");
    setSuccess("");
    if (!agreementAccepted) { setError(t.needAgreement); return; }
    if (!form.docs.trade_register || !form.docs.id_passport) { setError(t.needDocs); return; }
    setSaving(true);
    try {
      const documents = DOC_TYPES.map((dt) => form.docs[dt]).filter(Boolean);
      const fullPhone = form.phone.trim() ? `${phoneDialCode}${form.phone.trim()}` : "";
      await client.updateSellerCompanyInfo({
        company_name: form.companyName.trim() || null,
        authorized_person_name: form.authorizedPersonName.trim() || null,
        tax_id: form.taxId.trim() || null,
        vat_id: form.vatId.trim() || null,
        phone: fullPhone || null,
        business_address: {
          street: form.street.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        },
        documents,
      });
      await client.updateSellerIban(form.iban.trim() || null);
      let pipelineResult = null;
      try { pipelineResult = await client.startVerification(); } catch (_) {}
      const account = await client.getSellerAccount();
      const s = String(
        pipelineResult?.approval_status ||
        account?.sellerUser?.approval_status ||
        account?.user?.approval_status ||
        "documents_submitted"
      ).toLowerCase();
      setStatus(s);
      if (typeof window !== "undefined") localStorage.setItem("sellerApprovalStatus", s);
      setSuccess(t.saveOk);
      setInitialSnapshot(snapshotFrom(form, agreementAccepted, phoneDialCode));
    } catch (e) {
      const rawMsg = String(e?.message || "");
      if (rawMsg.toLowerCase().includes("invalid input syntax for type json")) {
        setError(locale === "tr"
          ? "Doğrulama verileri hatalı formatta gönderildi. Lütfen adres ve belge alanlarını kontrol edip tekrar deneyin."
          : locale === "de"
            ? "Ungültiges Datenformat für die Verifizierung. Bitte Adress- und Dokumentfelder prüfen und erneut senden."
            : "Invalid verification data format. Please review address and document fields and try again.");
      } else {
        setError(e?.message || "Save failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const normalizedStatus = String(status || "registered").toLowerCase();
  const isDocsSubmittedOrBeyond = ["documents_submitted", "pending_approval", "pending", "approved", "active", "rejected", "suspended"].includes(normalizedStatus);
  const isDirty = !loading && initialSnapshot !== null && snapshotFrom(form, agreementAccepted, phoneDialCode) !== initialSnapshot;

  const downloadPdf = async () => {
    setPdfDownloading(true);
    try {
      const blob = await client.downloadAgreementPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "andertal-agreement.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || "PDF download failed.");
    } finally {
      setPdfDownloading(false);
    }
  };

  const discardVerification = useCallback(() => {
    if (!initialSnapshot) return;
    try {
      const snap = JSON.parse(initialSnapshot);
      setAgreementAccepted(!!snap.agreementAccepted);
      setPhoneDialCode(snap.phoneDialCode || "+49");
      setForm((p) => ({
        ...p,
        companyName: snap.companyName || "",
        authorizedPersonName: snap.authorizedPersonName || "",
        taxId: snap.taxId || "",
        vatId: snap.vatId || "",
        iban: snap.iban || "",
        phone: snap.phone || "",
        street: snap.street || "",
        city: snap.city || "",
        postalCode: snap.postalCode || "",
        country: snap.country || "",
        docs: DOC_TYPES.reduce((acc, dt) => {
          const hit = (snap.docs || []).find((d) => d?.doc_type === dt);
          acc[dt] = hit?.url ? { doc_type: dt, name: hit?.name || "", url: hit.url } : null;
          return acc;
        }, {}),
      }));
      setError("");
      setSuccess("");
    } catch (_) {}
  }, [initialSnapshot]);

  const saveRef = useRef(saveVerification);
  const discardRef = useRef(discardVerification);
  saveRef.current = saveVerification;
  discardRef.current = discardVerification;

  useEffect(() => {
    if (!unsaved) return;
    unsaved.setDirty(isDirty);
    unsaved.setHandlers({
      onSave: () => saveRef.current?.(),
      onDiscard: () => discardRef.current?.(),
    });
    return () => {
      unsaved.clearHandlers();
    };
  }, [unsaved, isDirty]);

  if (loading) {
    return (
      <Card>
        <Text as="p" tone="subdued">Loading...</Text>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">{t.title}</Text>
          <Text as="p" tone="subdued">{t.subtitle}</Text>
        </BlockStack>
      </Card>

      {(normalizedStatus === "documents_submitted" || normalizedStatus === "pending_approval" || normalizedStatus === "pending") ? (
        <div style={{
          background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
          border: "1.5px solid #f59e0b",
          borderRadius: 10,
          padding: "16px 20px",
        }}>
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            <div style={{ paddingTop: 2, flexShrink: 0 }}>
              <Spinner size="small" />
            </div>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="bold" tone="caution">{t.reviewingTitle}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{t.reviewingDetail}</Text>
            </BlockStack>
          </InlineStack>
        </div>
      ) : (
        <Banner tone={statusTone(normalizedStatus)}>
          <Text as="p"><strong>{t.statusLabel}:</strong> {t.status[normalizedStatus] || normalizedStatus}</Text>
        </Banner>
      )}

      {success && (
        <Banner tone="success" onDismiss={() => setSuccess("")}>{success}</Banner>
      )}
      {error && (
        <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
      )}

      {isDocsSubmittedOrBeyond ? (
        <Card>
          <Text as="p" tone="subdued">{t.docsSent}</Text>
        </Card>
      ) : (
        <>
          {/* Agreement */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.agreementTitle}</Text>
              <Checkbox
                label={
                  <span>
                    {t.agreementText.split("{link}")[0]}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setContractOpen(true); }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "#2563eb",
                        textDecoration: "underline",
                        cursor: "pointer",
                        fontSize: "inherit",
                        fontFamily: "inherit",
                      }}
                    >
                      {t.agreementLink}
                    </button>
                    {t.agreementText.split("{link}")[1] || ""}
                  </span>
                }
                checked={agreementAccepted}
                onChange={setAgreementAccepted}
              />

              {/* QR code signing section */}
              {agreementAccepted && !signed && (
                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 4 }}>
                  {qrLoading ? (
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" />
                      <Text as="p" variant="bodySm" tone="subdued">
                        {locale === "de" ? "QR-Code wird generiert..." : locale === "tr" ? "QR kod oluşturuluyor..." : "Generating QR code..."}
                      </Text>
                    </InlineStack>
                  ) : qrDataUrl ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {locale === "de"
                          ? "Bitte scanne den QR-Code mit deinem Mobilgerät, um die Vereinbarung zu unterzeichnen."
                          : locale === "tr"
                          ? "Sözleşmeyi imzalamak için lütfen QR kodu mobil cihazınla tara."
                          : "Please scan the QR code with your mobile device to sign the agreement."}
                      </Text>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <img src={qrDataUrl} alt="QR Code" style={{ width: 180, height: 180, border: "1px solid #e5e7eb", borderRadius: 8 }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                          <Spinner size="small" />
                          <Text as="p" variant="bodySm" tone="subdued">
                            {locale === "de" ? "Warte auf Unterschrift..." : locale === "tr" ? "İmza bekleniyor..." : "Waiting for signature..."}
                          </Text>
                        </div>
                      </div>
                    </BlockStack>
                  ) : null}
                </div>
              )}

              {/* Signed + PDF section */}
              {signed && (
                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 16, marginTop: 4 }}>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{ color: "#10b981", fontSize: 18 }}>✓</span>
                      <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">
                        {locale === "de"
                          ? `Vereinbarung unterzeichnet${signatureAt ? " am " + new Date(signatureAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : ""}`
                          : locale === "tr"
                          ? `Sözleşme imzalandı${signatureAt ? " — " + new Date(signatureAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : ""}`
                          : `Agreement signed${signatureAt ? " on " + new Date(signatureAt).toLocaleDateString("en-GB") : ""}`}
                      </Text>
                    </InlineStack>
                    <Button size="slim" onClick={downloadPdf} loading={pdfDownloading}>
                      {locale === "de" ? "Unterzeichnetes PDF herunterladen" : locale === "tr" ? "İmzalı PDF'i indir" : "Download signed PDF"}
                    </Button>
                  </BlockStack>
                </div>
              )}
            </BlockStack>
          </Card>

          {contractOpen && (
            <ContractModal
              locale={locale}
              title={t.contractModalTitle}
              onClose={() => setContractOpen(false)}
            />
          )}

          {/* Company details */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.companyTitle}</Text>
              <TextField label={t.companyName} value={form.companyName} onChange={(v) => setForm((p) => ({ ...p, companyName: v }))} autoComplete="off" />
              <TextField label={t.authorizedPerson} value={form.authorizedPersonName} onChange={(v) => setForm((p) => ({ ...p, authorizedPersonName: v }))} autoComplete="off" />
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <TextField
                    label={t.taxId}
                    value={form.taxId}
                    onChange={(v) => setForm((p) => ({ ...p, taxId: v }))}
                    autoComplete="off"
                    helpText={t.taxIdHelp}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField
                    label={t.vatId}
                    value={form.vatId}
                    onChange={(v) => setForm((p) => ({ ...p, vatId: v }))}
                    autoComplete="off"
                    helpText={t.vatIdHelp}
                  />
                </div>
              </InlineStack>
              <TextField label={t.iban} value={form.iban} onChange={(v) => setForm((p) => ({ ...p, iban: v }))} autoComplete="off" />
            </BlockStack>
          </Card>

          {/* Contact & address */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.contactTitle}</Text>
              {/* Phone with country code selector */}
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd">{t.phone}</Text>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <select
                    value={phoneDialCode}
                    onChange={(e) => setPhoneDialCode(e.target.value)}
                    style={{
                      height: 36,
                      border: "1px solid #8c9196",
                      borderRadius: 6,
                      padding: "0 8px",
                      fontSize: 14,
                      background: "#fff",
                      color: "#202223",
                      cursor: "pointer",
                      flexShrink: 0,
                      minWidth: 88,
                    }}
                  >
                    {PHONE_CODES.map((c) => (
                      <option key={c.code} value={c.dial}>{c.code} {c.dial}</option>
                    ))}
                  </select>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      labelHidden
                      value={form.phone}
                      onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                      autoComplete="off"
                      type="tel"
                      placeholder="123 456 7890"
                    />
                  </div>
                </div>
              </BlockStack>
              <TextField label={t.street} value={form.street} onChange={(v) => setForm((p) => ({ ...p, street: v }))} autoComplete="off" />
              <InlineStack gap="300">
                <div style={{ flex: 1 }}>
                  <TextField label={t.city} value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} autoComplete="off" />
                </div>
                <div style={{ flex: 1 }}>
                  <TextField label={t.postalCode} value={form.postalCode} onChange={(v) => setForm((p) => ({ ...p, postalCode: v }))} autoComplete="off" />
                </div>
              </InlineStack>
              <TextField label={t.country} value={form.country} onChange={(v) => setForm((p) => ({ ...p, country: v }))} autoComplete="off" />
            </BlockStack>
          </Card>

          {/* Documents */}
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">{t.docsTitle}</Text>
              {DOC_TYPES.map((dt) => (
                <DocUploadRow
                  key={dt}
                  label={t.docTypes[dt]}
                  hint={t.docHints[dt]}
                  docType={dt}
                  doc={form.docs[dt]}
                  onUpload={handleDocUpload}
                  uploading={uploadingDocType === dt}
                  t={t}
                />
              ))}
            </BlockStack>
          </Card>

          {/* Credit Card */}
          <Card>
            <SellerCreditCardSection
              title={
                locale === "de" ? "Kreditkarte für Gebühren" :
                locale === "tr" ? "Ücretler için Kredi Kartı" :
                "Credit Card for Fees"
              }
              subtitle={
                locale === "de" ? "Diese Karte wird belastet, wenn dein Guthaben für Plattformgebühren oder Rückbuchungen nicht ausreicht." :
                locale === "tr" ? "Platform ücretleri veya iade durumunda bakiyeniz yetersiz kaldığında bu kart kullanılır." :
                "This card is charged when your balance is insufficient for platform fees or chargebacks."
              }
            />
          </Card>

          {/* Submit */}
          <InlineStack align="end">
            <Button variant="primary" onClick={saveVerification} loading={saving}>
              {saving ? t.saving : t.submit}
            </Button>
          </InlineStack>
        </>
      )}
    </BlockStack>
  );
}
