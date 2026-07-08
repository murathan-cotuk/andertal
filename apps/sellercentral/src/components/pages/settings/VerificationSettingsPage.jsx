"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banner, BlockStack, Box, Button, Card, Checkbox, InlineStack, Modal, Spinner, Text, TextField } from "@shopify/polaris";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
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
      qrGenerating: "QR kod oluşturuluyor...",
      qrScanPrompt: "Sözleşmeyi imzalamak için lütfen QR kodu mobil cihazınla tara.",
      waitingSignature: "İmza bekleniyor...",
      agreementSigned: (at) => `Sözleşme imzalandı${at ? " — " + new Date(at).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : ""}`,
      downloadSignedPdf: "İmzalı PDF'i indir",
      creditCardTitle: "Ücretler için Kredi Kartı",
      creditCardSubtitle: "Platform ücretleri veya iade durumunda bakiyeniz yetersiz kaldığında bu kart kullanılır.",
      invalidFormatError: "Doğrulama verileri hatalı formatta gönderildi. Lütfen adres ve belge alanlarını kontrol edip tekrar deneyin.",
      closeModal: "Kapat",
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
      qrGenerating: "QR-Code wird generiert...",
      qrScanPrompt: "Bitte scanne den QR-Code mit deinem Mobilgerät, um die Vereinbarung zu unterzeichnen.",
      waitingSignature: "Warte auf Unterschrift...",
      agreementSigned: (at) => `Vereinbarung unterzeichnet${at ? " am " + new Date(at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : ""}`,
      downloadSignedPdf: "Unterzeichnetes PDF herunterladen",
      creditCardTitle: "Kreditkarte für Gebühren",
      creditCardSubtitle: "Diese Karte wird belastet, wenn dein Guthaben für Plattformgebühren oder Rückbuchungen nicht ausreicht.",
      invalidFormatError: "Ungültiges Datenformat für die Verifizierung. Bitte Adress- und Dokumentfelder prüfen und erneut senden.",
      closeModal: "Schließen",
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
      qrGenerating: "Génération du QR code...",
      qrScanPrompt: "Veuillez scanner le QR code avec votre appareil mobile pour signer l'accord.",
      waitingSignature: "En attente de signature...",
      agreementSigned: (at) => `Accord signé${at ? " le " + new Date(at).toLocaleDateString("fr-FR") : ""}`,
      downloadSignedPdf: "Télécharger le PDF signé",
      creditCardTitle: "Carte de crédit pour les frais",
      creditCardSubtitle: "Cette carte est débitée lorsque votre solde est insuffisant pour les frais de plateforme ou les rétrofacturations.",
      invalidFormatError: "Format de données de vérification invalide. Veuillez vérifier les champs d'adresse et de documents et réessayer.",
      closeModal: "Fermer",
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
      qrGenerating: "Generando código QR...",
      qrScanPrompt: "Por favor, escanee el código QR con su dispositivo móvil para firmar el acuerdo.",
      waitingSignature: "Esperando firma...",
      agreementSigned: (at) => `Acuerdo firmado${at ? " el " + new Date(at).toLocaleDateString("es-ES") : ""}`,
      downloadSignedPdf: "Descargar PDF firmado",
      creditCardTitle: "Tarjeta de crédito para comisiones",
      creditCardSubtitle: "Esta tarjeta se carga cuando su saldo es insuficiente para las comisiones de la plataforma o las devoluciones de cargo.",
      invalidFormatError: "Formato de datos de verificación no válido. Revise los campos de dirección y documentos e inténtelo de nuevo.",
      closeModal: "Cerrar",
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
      qrGenerating: "Generazione QR code...",
      qrScanPrompt: "Scansiona il QR code con il tuo dispositivo mobile per firmare l'accordo.",
      waitingSignature: "In attesa di firma...",
      agreementSigned: (at) => `Accordo firmato${at ? " il " + new Date(at).toLocaleDateString("it-IT") : ""}`,
      downloadSignedPdf: "Scarica PDF firmato",
      creditCardTitle: "Carta di credito per le commissioni",
      creditCardSubtitle: "Questa carta viene addebitata quando il saldo è insufficiente per le commissioni della piattaforma o i chargeback.",
      invalidFormatError: "Formato dati di verifica non valido. Controlla i campi indirizzo e documenti e riprova.",
      closeModal: "Chiudi",
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
    qrGenerating: "Generating QR code...",
    qrScanPrompt: "Please scan the QR code with your mobile device to sign the agreement.",
    waitingSignature: "Waiting for signature...",
    agreementSigned: (at) => `Agreement signed${at ? " on " + new Date(at).toLocaleDateString("en-GB") : ""}`,
    downloadSignedPdf: "Download signed PDF",
    creditCardTitle: "Credit Card for Fees",
    creditCardSubtitle: "This card is charged when your balance is insufficient for platform fees or chargebacks.",
    invalidFormatError: "Invalid verification data format. Please review address and document fields and try again.",
    closeModal: "Close",
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
// NOTE: This is boilerplate legal-style text, not legal advice. It must be
// reviewed by a qualified lawyer / compliance advisor before being relied on
// in production (docs/HUKUKI.md carries the same disclaimer for the related
// compliance-profile system).
const CONTRACT_SECTIONS = {
  de: [
    {
      heading: "Präambel",
      body: `Diese Vereinbarung regelt die Rechtsbeziehung zwischen dem Betreiber der Plattform Andertal (nachfolgend „Plattform") und dem registrierten Verkäufer (nachfolgend „Verkäufer"). Mit Abschluss der Verifizierung erklärt sich der Verkäufer mit allen nachfolgenden Bedingungen einverstanden. Die Vereinbarung entspricht den Anforderungen der Verordnung (EU) 2022/2065 (Digital Services Act), der Verordnung (EU) 2019/1150 (P2B-Verordnung), der DSGVO sowie dem deutschen Bürgerlichen Gesetzbuch (BGB). Sie ist in mehreren Sprachfassungen verfügbar; im Falle von Widersprüchen ist die deutsche Fassung maßgeblich, da deutsches Recht Anwendung findet.`,
    },
    {
      heading: "§ 1 – Begriffsbestimmungen",
      body: `„Plattform" bezeichnet die von Andertal betriebene Marktplatz-Infrastruktur (Website, mobile Anwendungen, APIs und zugehörige Dienste). „Verkäufer" bezeichnet jede natürliche oder juristische Person, die sich registriert, um Waren über die Plattform anzubieten. „Endkunde" bezeichnet den Käufer eines vom Verkäufer angebotenen Produkts. „Angebot" bezeichnet jeden auf der Plattform veröffentlichten Produktlisting-Eintrag. „Sellercentral" bezeichnet die Verwaltungsoberfläche, über die der Verkäufer sein Konto steuert. Sofern der Kontext nichts anderes verlangt, gelten Singular- und Pluralformen wechselseitig.`,
    },
    {
      heading: "§ 2 – Vertragsgegenstand und Rolle der Plattform",
      body: `Die Plattform stellt dem Verkäufer eine technische Infrastruktur zum Anbieten, Verwalten und Verkaufen von Waren gegenüber Endverbrauchern zur Verfügung. Der Verkäufer tritt als eigenverantwortlicher Händler im eigenen Namen und auf eigene Rechnung auf. Die Plattform ist kein Vertragspartner der Kaufverträge zwischen Verkäufer und Endkunden, sondern vermittelt als „Online-Vermittlungsdienst" im Sinne von Art. 2 Nr. 2 P2B-VO sowie als „Online-Marktplatz" im Sinne von Art. 3 lit. j DSA. Bestimmte Zusatzfunktionen (z. B. Zahlungsabwicklung, Versandetikettenkauf) werden von der Plattform als technischer Dienstleister für den Verkäufer erbracht, ohne dass hierdurch eine eigene Vertragspartei-Stellung im Kaufvertrag begründet wird.`,
    },
    {
      heading: "§ 3 – Registrierung, Konto und Verifizierung",
      body: `Die Nutzung der Plattform setzt eine erfolgreiche Registrierung und – je nach Kategorie und Herkunftsland – eine Identitäts- und Geschäftsverifizierung voraus (Gewerbeanmeldung/Handelsregisterauszug, Ausweisdokument der vertretungsberechtigten Person, ggf. Steuerdokument). Der Verkäufer sichert zu, dass alle im Rahmen der Verifizierung eingereichten Angaben und Dokumente wahr, vollständig und aktuell sind, und verpflichtet sich, Änderungen unverzüglich mitzuteilen. Die Plattform behält sich vor, die Verifizierung zu verweigern oder erneut anzufordern, wenn begründete Zweifel an der Richtigkeit der Angaben bestehen. Zugangsdaten sind vertraulich zu behandeln; der Verkäufer haftet für Handlungen, die unter Verwendung seiner Zugangsdaten vorgenommen werden, sofern er deren missbräuchliche Nutzung zu vertreten hat.`,
    },
    {
      heading: "§ 4 – Pflichten des Verkäufers",
      body: `Der Verkäufer verpflichtet sich:\n• Ausschließlich legale Waren anzubieten und geltende Produktsicherheits-, Kennzeichnungs- und Verbraucherschutzvorschriften einzuhalten, einschließlich der Verordnung (EU) 2023/988 (GPSR) sowie kategorie- und länderspezifischer Vorgaben (z. B. WEEE, EPREL, Batterieverordnung – siehe Compliance-Bereich im Sellercentral).\n• Vollständige und korrekte Geschäftsdaten (Impressum, Steuernummer, IBAN) bereitzustellen und aktuell zu halten.\n• Bestellungen innerhalb der angegebenen Lieferfristen zu erfüllen und Kunden bei Verzögerungen unverzüglich zu benachrichtigen.\n• Gesetzliche Gewährleistungsrechte (§§ 434 ff. BGB) zu beachten und ein 14-tägiges Widerrufsrecht gemäß § 312g BGB i.V.m. Art. 246a EGBGB zu gewähren.\n• Keine Preisabsprachen, Marktmanipulation oder unlauteren Wettbewerb zu betreiben (UWG).\n• Produktinformationen (EAN, Titel, Beschreibung, Bilder) wahrheitsgemäß und nicht irreführend darzustellen und keine gemeinsamen Katalogeinträge ohne Berechtigung zu verändern.\n• Kundenanfragen über die auf der Plattform bereitgestellten Kommunikationskanäle innerhalb angemessener Frist zu beantworten.`,
    },
    {
      heading: "§ 5 – Verbotene und eingeschränkte Artikel",
      body: `Der Verkäufer darf keine Artikel anbieten, die gegen geltendes Recht verstoßen oder deren Verkauf über die Plattform ausdrücklich ausgeschlossen ist, einschließlich – ohne Beschränkung hierauf – gefälschte Markenware, Waffen und munitionsähnliche Gegenstände, verschreibungspflichtige Arzneimittel ohne entsprechende Zulassung, gestohlene Ware, Tabak- und Nikotinprodukte ohne Altersverifikation, sowie Artikel, die gegen Exportkontroll- oder Sanktionsvorschriften verstoßen. Die Plattform kann eine aktuelle, nicht abschließende Liste verbotener und eingeschränkter Kategorien im Sellercentral veröffentlichen und einseitig anpassen, wenn dies aus regulatorischen Gründen erforderlich wird; wesentliche Änderungen werden gemäß § 23 mitgeteilt.`,
    },
    {
      heading: "§ 6 – Geistiges Eigentum und Markenrechte",
      body: `Der Verkäufer sichert zu, dass er über alle erforderlichen Rechte an den von ihm hochgeladenen Inhalten (Produktbilder, Texte, Markenzeichen) verfügt oder zu deren Nutzung berechtigt ist. Für die Nutzung fremder, registrierter Markennamen gilt der separate Markenautorisierungsprozess der Plattform (Sellercentral → Marken); ein Angebot unter einer registrierten Marke ohne nachgewiesene Berechtigung ist untersagt und kann ohne vorherige Ankündigung entfernt werden. Rechteinhaber können mutmaßliche Rechtsverletzungen über das Melde- und Abhilfeverfahren gemäß § 12 anzeigen. Mit dem Hochladen räumt der Verkäufer der Plattform ein einfaches, zeitlich auf die Vertragsdauer beschränktes Nutzungsrecht zur Darstellung der Inhalte auf der Plattform sowie in damit verbundenen Marketingmaßnahmen ein.`,
    },
    {
      heading: "§ 7 – Datenschutz (DSGVO)",
      body: `Der Verkäufer verarbeitet personenbezogene Daten von Endkunden (Name, Adresse, Bestelldaten) ausschließlich zur Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und ausschließlich in dem Umfang, der zur Abwicklung der jeweiligen Bestellung erforderlich ist. Eine Weitergabe an Dritte ohne Rechtsgrundlage ist untersagt; insbesondere ist die Nutzung von Kundendaten für werbliche Zwecke außerhalb der Plattform ohne gesonderte Einwilligung des Kunden unzulässig. Auf Verlangen hat der Verkäufer Betroffenenanfragen (Auskunft, Löschung, Berichtigung) innerhalb von 30 Tagen zu beantworten und die Plattform bei der Erfüllung ihrer eigenen datenschutzrechtlichen Pflichten zu unterstützen. Zwischen Plattform und Verkäufer wird, soweit erforderlich, ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO abgeschlossen. Der Verkäufer trifft angemessene technische und organisatorische Maßnahmen (Art. 32 DSGVO) zum Schutz der ihm zugänglichen Kundendaten.`,
    },
    {
      heading: "§ 8 – Zahlungsabwicklung und Auszahlungen",
      body: `Zahlungen von Endkunden werden über den von der Plattform eingesetzten Zahlungsdienstleister abgewickelt. Auszahlungen an den Verkäufer erfolgen nach Auftragsabschluss und Ablauf einer eventuellen Rückgabefrist, gemäß dem im Sellercentral einsehbaren Auszahlungsrhythmus. Die Plattform ist berechtigt, Beträge bei begründeten Rückforderungen (Chargebacks, Retouren, Betrugsverdacht) vorübergehend einzubehalten, bis der zugrunde liegende Vorgang geklärt ist. Der Verkäufer ist für die Richtigkeit der von ihm hinterlegten Bankverbindung verantwortlich; Verzögerungen aufgrund fehlerhafter Angaben gehen zu seinen Lasten.`,
    },
    {
      heading: "§ 9 – Provisionen, Gebühren und Preisgestaltung",
      body: `Die Plattform erhebt eine Transaktionsgebühr gemäß der zum Zeitpunkt des Verkaufs gültigen, im Sellercentral einsehbaren Preisliste. Änderungen der Gebührenstruktur werden dem Verkäufer gemäß § 23 vorab mitgeteilt. Der Verkäufer bestimmt die Verkaufspreise seiner Angebote eigenverantwortlich; die Plattform nimmt hierauf keinen Einfluss, außer im Rahmen zulässiger, vom Verkäufer aktivierter Rabatt- und Kampagnenfunktionen. Bei Verzug mit Gebührenzahlungen werden Verzugszinsen gemäß § 288 BGB fällig; die Plattform kann fällige Gebühren mit ausstehenden Auszahlungsansprüchen verrechnen.`,
    },
    {
      heading: "§ 10 – Steuerliche Pflichten",
      body: `Der Verkäufer ist allein verantwortlich für die zutreffende umsatzsteuerliche Behandlung seiner Verkäufe, einschließlich etwaiger Registrierungspflichten im One-Stop-Shop-Verfahren (OSS) oder in einzelnen EU-Mitgliedstaaten, sowie für die ordnungsgemäße Erklärung und Abführung sämtlicher auf seine Umsätze entfallenden Steuern. Die Plattform kann, soweit gesetzlich vorgeschrieben, Transaktionsdaten an zuständige Steuerbehörden übermitteln (z. B. gemäß § 22f UStG bzw. der DAC7-Meldepflichten). Der Verkäufer stellt der Plattform auf Anforderung die hierfür erforderlichen Nachweise zur Verfügung.`,
    },
    {
      heading: "§ 11 – Ranking, Sichtbarkeit und Werbung (P2B-Verordnung)",
      body: `Gemäß Art. 5 der EU-Verordnung 2019/1150 informiert die Plattform über die wesentlichen Parameter des Ranking-Algorithmus: Produktqualität, Kundenbewertungen, Bestellabwicklungsrate, Preisgestaltung, Aktualität des Sortiments und Konto-Compliance. Der Verkäufer kann das Ranking durch Verbesserung dieser Faktoren beeinflussen. Bezahlte Werbeplatzierungen (z. B. über die Marketing-/Kampagnenfunktion) werden gesondert als solche gekennzeichnet und wirken sich nicht auf das organische Ranking anderer Angebote aus.`,
    },
    {
      heading: "§ 12 – Content-Moderation und Melde-/Abhilfeverfahren (DSA)",
      body: `Die Plattform betreibt gemäß Art. 16 DSA ein Melde- und Abhilfeverfahren, über das Nutzer, Rechteinhaber und Behörden mutmaßlich rechtswidrige Angebote oder Inhalte anzeigen können. Eingehende Meldungen werden zeitnah geprüft; bei begründeten Meldungen kann die Plattform das betroffene Angebot entfernen, den Zugriff darauf beschränken oder – bei schwerwiegenden bzw. wiederholten Verstößen – das Verkäuferkonto gemäß § 16 sperren. Der Verkäufer wird über entfernte Inhalte grundsätzlich informiert und erhält Gelegenheit zur Stellungnahme, sofern dem nicht zwingende rechtliche oder sicherheitsrelevante Gründe entgegenstehen (Art. 17, 20 DSA). Wiederholte, offensichtlich unbegründete Meldungen Dritter können von der Plattform zurückgewiesen werden.`,
    },
    {
      heading: "§ 13 – Marktplatzhaftung gegenüber Verbrauchern (P2B Art. 6a)",
      body: `Die Plattform stellt Endkunden vor Kaufabschluss klar erkennbar dar, ob ein Angebot von einem gewerblichen Dritten stammt, und weist auf die sich hieraus ergebende Verteilung von Rechten und Pflichten (insbesondere Gewährleistung und Widerruf) zwischen Verkäufer und Plattform hin. Der Verkäufer verpflichtet sich, alle für diese Kennzeichnung notwendigen Angaben vollständig und wahrheitsgemäß bereitzustellen und bestätigt, dass die Hauptverantwortung für die Erfüllung der Kaufverträge – vorbehaltlich der in dieser Vereinbarung geregelten Ausnahmen – bei ihm liegt.`,
    },
    {
      heading: "§ 14 – Haftungsbeschränkung",
      body: `Die Plattform haftet nicht für Schäden, die durch fehlerhafte Produktangaben des Verkäufers, Lieferverzögerungen, Produktmängel oder sonstige Pflichtverletzungen des Verkäufers entstehen. Die Haftung der Plattform für mittelbare Schäden und entgangenen Gewinn ist – außer bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder Gesundheit – ausgeschlossen (§ 276 BGB). Für die Verfügbarkeit der technischen Infrastruktur wird ein handelsüblicher Standard angestrebt; ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.`,
    },
    {
      heading: "§ 15 – Freistellung und höhere Gewalt",
      body: `Der Verkäufer stellt die Plattform von sämtlichen Ansprüchen Dritter frei, die auf einer schuldhaften Verletzung dieser Vereinbarung, geltender Gesetze oder Rechte Dritter durch den Verkäufer beruhen, einschließlich angemessener Rechtsverteidigungskosten. Keine Partei haftet für die Nichterfüllung ihrer Pflichten, soweit diese auf Umständen höherer Gewalt beruht (z. B. Naturkatastrophen, behördliche Anordnungen, großflächige Netzwerkausfälle), die außerhalb ihrer zumutbaren Kontrolle liegen; die betroffene Partei informiert die andere Partei unverzüglich über Art und voraussichtliche Dauer des Ereignisses.`,
    },
    {
      heading: "§ 16 – Kontosperrung, Aussetzung und Kündigung",
      body: `Die Plattform kann das Konto bei schwerwiegenden oder wiederholten Verstößen gegen diese Vereinbarung, bei rechtlich bedenklichen Inhalten oder auf behördliche Anordnung hin sperren, aussetzen oder kündigen. Vor einer Sperrung wird dem Verkäufer, sofern möglich und rechtlich zulässig, eine angemessene Frist zur Stellungnahme eingeräumt (Art. 4 P2B-VO). Der Verkäufer kann das Konto jederzeit mit einer Frist von 30 Tagen kündigen. Laufende Bestellungen sind auch nach Kündigung ordnungsgemäß abzuwickeln; bereits fällige Auszahlungsansprüche bleiben hiervon unberührt, vorbehaltlich eines Einbehalts gemäß § 8.`,
    },
    {
      heading: "§ 17 – Vertragsübertragung",
      body: `Der Verkäufer darf Rechte und Pflichten aus dieser Vereinbarung nicht ohne vorherige schriftliche Zustimmung der Plattform auf Dritte übertragen. Die Plattform kann diese Vereinbarung im Rahmen einer Umstrukturierung, Verschmelzung oder eines Geschäftsübergangs auf ein verbundenes Unternehmen übertragen, sofern hierdurch keine wesentliche Verschlechterung der Rechtsposition des Verkäufers eintritt.`,
    },
    {
      heading: "§ 18 – Änderungen dieser Vereinbarung",
      body: `Änderungen dieser Vereinbarung werden dem Verkäufer mindestens 15 Tage vor Inkrafttreten in schriftlicher Form (E-Mail oder Benachrichtigung im Sellercentral) mitgeteilt (Art. 3 P2B-VO), außer soweit eine kürzere Frist aufgrund gesetzlicher Verpflichtungen, zur Abwehr unvorhergesehener Gefahren oder zugunsten des Verkäufers erforderlich ist. Widerspricht der Verkäufer nicht innerhalb der Frist und nutzt die Plattform weiter, gelten die Änderungen als angenommen; der Verkäufer kann im Falle eines Widerspruchs das Konto gemäß § 16 kündigen.`,
    },
    {
      heading: "§ 19 – Streitbeilegung",
      body: `Streitigkeiten zwischen Plattform und Verkäufer werden zunächst intern über den Support-Kanal behandelt. Die Plattform benennt gemäß Art. 11 P2B-VO als interne Beschwerdeführer: info@andertal.com. Als externe Streitbeilegungsstelle steht das Online-Streitbeilegungsportal der EU (https://ec.europa.eu/consumers/odr/) zur Verfügung; für Streitigkeiten mit P2B-Bezug kann zudem ein Mediator gemäß Art. 12 P2B-VO hinzugezogen werden. Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts; Gerichtsstand ist, soweit gesetzlich zulässig, Berlin.`,
    },
    {
      heading: "§ 20 – Schlussbestimmungen und Kontakt",
      body: `Sollten einzelne Bestimmungen unwirksam sein, bleiben die übrigen Bestimmungen wirksam (salvatorische Klausel, § 306 BGB); die Parteien verpflichten sich, die unwirksame Bestimmung durch eine ihr wirtschaftlich möglichst nahekommende wirksame Regelung zu ersetzen. Diese Vereinbarung stellt zusammen mit den im Sellercentral veröffentlichten Richtlinien (u. a. verbotene Artikel, Compliance-Vorgaben) die vollständige Vereinbarung zwischen den Parteien dar. Kontakt: info@andertal.com. Letzte Aktualisierung: Juli 2026. Hinweis: Dieser Text ist eine Vertragsvorlage und stellt keine Rechtsberatung dar; er wurde vor Inkraftsetzung noch nicht von einem Rechtsanwalt geprüft.`,
    },
  ],
  tr: [
    {
      heading: "Önsöz",
      body: `Bu sözleşme, Andertal platformunun işletmecisi (bundan böyle "Platform") ile kayıtlı satıcı (bundan böyle "Satıcı") arasındaki hukuki ilişkiyi düzenler. Verifikasyonun tamamlanmasıyla Satıcı, aşağıdaki tüm koşulları kabul etmiş sayılır. Sözleşme; AB Dijital Hizmetler Yasası (DSA – (EU) 2022/2065), P2B Tüzüğü ((EU) 2019/1150), GDPR ve Alman Medeni Kanunu (BGB) çerçevesinde hazırlanmıştır. Sözleşme birden fazla dilde sunulmaktadır; diller arasında çelişki olması halinde, Alman hukuku uygulandığından Almanca metin esas alınır.`,
    },
    {
      heading: "Madde 1 – Tanımlar",
      body: `"Platform", Andertal tarafından işletilen pazar yeri altyapısını (web sitesi, mobil uygulamalar, API'ler ve ilgili hizmetler) ifade eder. "Satıcı", ürün sunmak amacıyla kaydolan gerçek veya tüzel kişiyi ifade eder. "Son Müşteri", Satıcının sunduğu bir ürünü satın alan kişiyi ifade eder. "İlan", Platformda yayınlanan her bir ürün listeleme kaydını ifade eder. "Sellercentral", Satıcının hesabını yönettiği yönetim arayüzünü ifade eder.`,
    },
    {
      heading: "Madde 2 – Sözleşmenin Konusu ve Platformun Rolü",
      body: `Platform, Satıcıya son tüketicilere ürün sunma, yönetme ve satma amacıyla teknik bir altyapı sağlar. Satıcı, kendi adına ve kendi hesabına bağımsız bir satıcı olarak hareket eder. Platform, Satıcı ile son müşteri arasındaki satış sözleşmelerinin tarafı değildir; P2B Tüzüğü Madde 2/2 ve DSA Madde 3(j) anlamında bir "çevrimiçi aracılık hizmeti" / "çevrimiçi pazar yeri" olarak faaliyet gösterir. Ödeme işleme, kargo etiketi satın alma gibi bazı ek işlevler Platform tarafından Satıcı adına teknik hizmet sağlayıcı sıfatıyla yürütülür; bu durum Platformu satış sözleşmesinin tarafı haline getirmez.`,
    },
    {
      heading: "Madde 3 – Kayıt, Hesap ve Doğrulama",
      body: `Platformun kullanımı, başarılı bir kayıt ve — kategoriye ve menşe ülkeye bağlı olarak — kimlik ve işletme doğrulamasını (ticaret sicili kaydı, yetkili temsilcinin kimlik belgesi, gerekirse vergi belgesi) gerektirir. Satıcı, doğrulama sürecinde sunduğu tüm bilgi ve belgelerin doğru, eksiksiz ve güncel olduğunu taahhüt eder ve değişiklikleri derhal bildirmekle yükümlüdür. Platform, bilgilerin doğruluğuna dair makul şüphe bulunması halinde doğrulamayı reddetme veya yeniden talep etme hakkını saklı tutar. Giriş bilgileri gizli tutulmalıdır; Satıcı, kendi giriş bilgileri kullanılarak yapılan işlemlerden, bu kullanımın kötüye kullanımından sorumlu olduğu ölçüde sorumludur.`,
    },
    {
      heading: "Madde 4 – Satıcının Yükümlülükleri",
      body: `Satıcı şunları taahhüt eder:\n• Yalnızca yasal ürünler sunmak ve geçerli ürün güvenliği, etiketleme ve tüketici koruma mevzuatına uymak; bu kapsamda AB Genel Ürün Güvenliği Tüzüğü (GPSR – (EU) 2023/988) ile kategoriye/ülkeye özgü gereklilikler (WEEE, EPREL, Batarya Yönetmeliği vb. — bkz. Sellercentral Compliance bölümü) dahildir.\n• Eksiksiz ve doğru ticari bilgiler (vergi numarası, IBAN, adres) sağlamak ve güncel tutmak.\n• Belirtilen teslimat sürelerinde siparişleri yerine getirmek; gecikme halinde müşteriyi derhal bilgilendirmek.\n• Yasal garanti haklarına ve 14 günlük cayma hakkına uymak.\n• Fiyat anlaşmaları, piyasa manipülasyonu veya haksız rekabet yapmamak.\n• Ürün bilgilerini (EAN, başlık, açıklama, görseller) doğru ve yanıltıcı olmayan şekilde sunmak, yetkisiz şekilde ortak katalog kayıtlarını değiştirmemek.\n• Müşteri taleplerine Platform üzerinden sağlanan iletişim kanalları aracılığıyla makul sürede yanıt vermek.`,
    },
    {
      heading: "Madde 5 – Yasak ve Kısıtlı Ürünler",
      body: `Satıcı; yürürlükteki mevzuata aykırı olan veya Platform üzerinden satışı açıkça yasaklanmış ürünleri sunamaz. Bu kapsamda — bunlarla sınırlı olmamak üzere — taklit markalı ürünler, silah ve mühimmat benzeri nesneler, uygun ruhsat olmaksızın reçeteli ilaçlar, çalıntı mal, yaş doğrulaması olmaksızın tütün/nikotin ürünleri ve ihracat kontrolü veya yaptırım mevzuatına aykırı ürünler sayılabilir. Platform, Sellercentral üzerinde güncel, kapsamı sınırlayıcı olmayan bir yasaklı/kısıtlı kategori listesi yayınlayabilir ve düzenleyici nedenlerle gerektiğinde tek taraflı olarak güncelleyebilir; önemli değişiklikler Madde 18 uyarınca bildirilir.`,
    },
    {
      heading: "Madde 6 – Fikri Mülkiyet ve Marka Hakları",
      body: `Satıcı, yüklediği içerikler (ürün görselleri, metinler, marka işaretleri) üzerinde gerekli tüm haklara sahip olduğunu veya bunları kullanma yetkisine sahip olduğunu taahhüt eder. Başkasına ait tescilli marka adlarının kullanımı için Platformun ayrı marka yetkilendirme sürecine (Sellercentral → Markalar) tabidir; kanıtlanmış yetki olmaksızın tescilli bir marka altında ilan verilmesi yasaktır ve önceden bildirim yapılmaksızın kaldırılabilir. Hak sahipleri, olası ihlalleri Madde 12'de belirtilen bildirim ve düzeltme mekanizması üzerinden bildirebilir. Yükleme yapılmasıyla Satıcı, içeriklerin Platformda ve ilgili pazarlama faaliyetlerinde gösterilmesi için sözleşme süresiyle sınırlı, basit bir kullanım hakkını Platforma tanır.`,
    },
    {
      heading: "Madde 7 – Kişisel Verilerin Korunması (GDPR/KVKK)",
      body: `Satıcı, son müşterilere ait kişisel verileri (isim, adres, sipariş bilgileri) yalnızca sözleşmenin ifası amacıyla ve ilgili siparişin yürütülmesi için gereken ölçüde işler (GDPR Md. 6/1-b). Hukuki dayanak olmaksızın üçüncü taraflara veri aktarımı yasaktır; özellikle müşteri verilerinin Platform dışında pazarlama amacıyla, müşterinin ayrı onayı olmaksızın kullanılması yasaktır. Veri sahibi talepleri (erişim, silme, düzeltme) 30 gün içinde yanıtlanmalı ve Satıcı, Platformun kendi veri koruma yükümlülüklerini yerine getirmesinde işbirliği yapmalıdır. Gerekli hallerde taraflar arasında GDPR Madde 28 uyarınca bir Veri İşleme Sözleşmesi akdedilir. Satıcı, erişebildiği müşteri verilerinin korunması için uygun teknik ve organizasyonel önlemleri (GDPR Md. 32) alır.`,
    },
    {
      heading: "Madde 8 – Ödeme İşleme ve Ödemeler",
      body: `Son müşterilerden alınan ödemeler, Platformun kullandığı ödeme hizmet sağlayıcısı üzerinden işlenir. Satıcıya ödemeler, sipariş tamamlandıktan ve olası iade süresi dolduktan sonra, Sellercentral'da görüntülenen ödeme takvimine göre yapılır. İade, ters ibraz veya dolandırıcılık şüphesi durumlarında Platform, ilgili işlem netleşene kadar tutarları geçici olarak alıkoyma hakkını saklı tutar. Satıcı, kaydettiği banka bilgilerinin doğruluğundan sorumludur; hatalı bilgilerden kaynaklanan gecikmeler Satıcının sorumluluğundadır.`,
    },
    {
      heading: "Madde 9 – Komisyonlar, Ücretler ve Fiyatlandırma",
      body: `Platform, satış anında geçerli olan ve Sellercentral'da görüntülenebilen fiyat listesine göre işlem ücreti alır. Ücret yapısındaki değişiklikler Satıcıya Madde 18 uyarınca önceden bildirilir. Satıcı, ilanlarının satış fiyatlarını kendi sorumluluğunda belirler; Platform, Satıcının etkinleştirdiği izin verilen indirim/kampanya işlevleri dışında bu fiyatlara müdahale etmez. Ücret ödemelerinde temerrüt halinde yasal gecikme faizi uygulanır; Platform, vadesi gelen ücretleri bekleyen ödeme alacaklarıyla mahsup edebilir.`,
    },
    {
      heading: "Madde 10 – Vergisel Yükümlülükler",
      body: `Satıcı, satışlarının katma değer vergisi açısından doğru şekilde ele alınmasından — gerekiyorsa Tek Durak Sistemi (OSS) kaydı veya belirli AB üye ülkelerindeki kayıt yükümlülükleri dahil — ve satışlarına ilişkin tüm vergilerin usulüne uygun şekilde beyan edilip ödenmesinden tek başına sorumludur. Platform, yasal olarak zorunlu olduğu ölçüde işlem verilerini yetkili vergi makamlarına iletebilir (örn. Almanya'da UStG § 22f veya DAC7 bildirim yükümlülükleri kapsamında). Satıcı, talep üzerine gerekli kanıtları Platforma sunar.`,
    },
    {
      heading: "Madde 11 – Sıralama, Görünürlük ve Reklam (P2B Tüzüğü)",
      body: `AB P2B Tüzüğü Madde 5 uyarınca Platform, sıralama algoritmasının temel parametrelerini şeffaf biçimde açıklar: ürün kalitesi, müşteri değerlendirmeleri, sipariş karşılama oranı, fiyatlandırma, güncel katalog ve hesap uyumluluğu. Satıcı, bu faktörleri iyileştirerek sıralamayı etkileyebilir. Ücretli reklam yerleşimleri (örn. pazarlama/kampanya işlevi üzerinden) ayrıca bu şekilde etiketlenir ve diğer ilanların organik sıralamasını etkilemez.`,
    },
    {
      heading: "Madde 12 – İçerik Denetimi ile Bildirim ve Düzeltme Mekanizması (DSA)",
      body: `Platform, DSA Madde 16 uyarınca, kullanıcıların, hak sahiplerinin ve makamların hukuka aykırı olduğu iddia edilen ilan veya içerikleri bildirebileceği bir bildirim ve düzeltme mekanizması işletir. Gelen bildirimler zamanında incelenir; gerekçeli bildirimlerde Platform, ilgili ilanı kaldırabilir, erişimi kısıtlayabilir veya — ciddi ya da tekrarlanan ihlallerde — Satıcı hesabını Madde 16 uyarınca askıya alabilir. Satıcı, kaldırılan içerikler hakkında kural olarak bilgilendirilir ve zorunlu hukuki veya güvenlik nedenleri engel olmadıkça görüş bildirme fırsatı bulur (DSA Md. 17, 20). Üçüncü tarafların tekrarlanan, açıkça asılsız bildirimleri Platform tarafından reddedilebilir.`,
    },
    {
      heading: "Madde 13 – Tüketicilere Karşı Pazar Yeri Sorumluluğu (P2B Md. 6a)",
      body: `Platform, satın alma öncesinde son müşterilere bir ilanın ticari bir üçüncü taraftan gelip gelmediğini açıkça gösterir ve bundan doğan hak ve yükümlülük dağılımını (özellikle garanti ve cayma hakkı bakımından) Satıcı ile Platform arasında belirtir. Satıcı, bu etiketleme için gerekli tüm bilgileri eksiksiz ve doğru şekilde sağlamayı taahhüt eder ve bu sözleşmede düzenlenen istisnalar saklı kalmak kaydıyla, satış sözleşmelerinin yerine getirilmesinden asıl sorumluluğun kendisinde olduğunu kabul eder.`,
    },
    {
      heading: "Madde 14 – Sorumluluk Sınırlaması",
      body: `Platform; Satıcının hatalı ürün bilgilerinden, teslimat gecikmelerinden, ürün kusurlarından veya diğer yükümlülük ihlallerinden kaynaklanan zararlardan sorumlu değildir. Kasıt, ağır ihmal ve yaşam/beden/sağlık ihlalleri hariç olmak üzere, Platform'un dolaylı zararlar ve yoksun kalınan kar için sorumluluğu sınırlıdır. Teknik altyapının kullanılabilirliği için piyasa standardı bir hizmet seviyesi hedeflenir; kesintisiz kullanılabilirlik garantisi verilmez.`,
    },
    {
      heading: "Madde 15 – Tazminat ve Mücbir Sebep",
      body: `Satıcı, bu sözleşmenin, yürürlükteki mevzuatın veya üçüncü taraf haklarının kusurlu ihlalinden doğan tüm üçüncü taraf taleplerine karşı — makul hukuki savunma masrafları dahil — Platformu tazmin eder. Hiçbir taraf, makul kontrolü dışındaki mücbir sebep hallerinden (doğal afetler, resmi makam kararları, geniş çaplı ağ kesintileri vb.) kaynaklanan yükümlülük ihlallerinden sorumlu tutulamaz; etkilenen taraf, olayın niteliği ve tahmini süresi hakkında diğer tarafı derhal bilgilendirir.`,
    },
    {
      heading: "Madde 16 – Hesap Askıya Alma, Kısıtlama ve Fesih",
      body: `Platform; ağır veya tekrarlayan ihlaller, hukuka aykırı içerik veya yetkili makam kararı durumunda hesabı askıya alabilir, kısıtlayabilir veya feshedebilir. Askıya almadan önce, mümkün ve hukuken uygun olduğu ölçüde, Satıcıya görüş bildirme hakkı tanınır (P2B Md. 4). Satıcı hesabını 30 gün önceden bildirerek istediği zaman feshedebilir. Devam eden siparişler fesih sonrasında da usulüne uygun şekilde tamamlanmalıdır; Madde 8 uyarınca yapılan alıkoymalar saklı kalmak kaydıyla, vadesi gelmiş ödeme alacakları bundan etkilenmez.`,
    },
    {
      heading: "Madde 17 – Sözleşmenin Devri",
      body: `Satıcı, bu sözleşmeden doğan hak ve yükümlülüklerini Platformun önceden yazılı onayı olmaksızın üçüncü taraflara devredemez. Platform, bu sözleşmeyi yeniden yapılandırma, birleşme veya işletme devri kapsamında, Satıcının hukuki durumunda önemli bir kötüleşmeye yol açmaması kaydıyla, bağlı bir şirkete devredebilir.`,
    },
    {
      heading: "Madde 18 – Bu Sözleşmedeki Değişiklikler",
      body: `Bu sözleşmedeki değişiklikler, yürürlüğe girmeden en az 15 gün önce Satıcıya yazılı olarak (e-posta veya Sellercentral üzerinden bildirim ile) iletilir (P2B Md. 3); yasal yükümlülükler, öngörülemeyen tehlikelerin önlenmesi veya Satıcı lehine gereken durumlarda daha kısa bir süre uygulanabilir. Satıcı, süre içinde itiraz etmez ve Platformu kullanmaya devam ederse değişiklikler kabul edilmiş sayılır; itiraz halinde Satıcı hesabını Madde 16 uyarınca feshedebilir.`,
    },
    {
      heading: "Madde 19 – Uyuşmazlık Çözümü",
      body: `Uyuşmazlıklar önce info@andertal.com üzerinden dahili destek kanalıyla çözülmeye çalışılır. Platform, P2B Tüzüğü Madde 11 uyarınca iç şikayet mercii olarak info@andertal.com adresini belirler. Çözüme kavuşturulamazsa AB Çevrimiçi Uyuşmazlık Çözüm Platformu (https://ec.europa.eu/consumers/odr/) başvuru için kullanılabilir; P2B ile ilgili uyuşmazlıklarda ayrıca P2B Tüzüğü Madde 12 uyarınca bir arabulucuya başvurulabilir. Alman hukuku, Birleşmiş Milletler Satış Sözleşmesi hariç olmak üzere uygulanır; yasal olarak mümkün olduğu ölçüde yetkili mahkeme Berlin'dir.`,
    },
    {
      heading: "Madde 20 – Son Hükümler ve İletişim",
      body: `Herhangi bir hükmün geçersiz olması, diğer hükümlerin geçerliliğini etkilemez (bölünebilirlik ilkesi); taraflar, geçersiz hükmü ekonomik açıdan en yakın geçerli düzenlemeyle değiştirmeyi taahhüt eder. Bu sözleşme, Sellercentral'da yayınlanan politikalarla (yasaklı ürünler, uyumluluk gereksinimleri vb. dahil) birlikte taraflar arasındaki eksiksiz anlaşmayı oluşturur. İletişim: info@andertal.com. Son güncelleme: Temmuz 2026. Not: Bu metin bir sözleşme şablonudur ve hukuki tavsiye niteliği taşımaz; yürürlüğe girmeden önce bir avukat tarafından incelenmemiştir.`,
    },
  ],
  en: [
    {
      heading: "Preamble",
      body: `This Agreement governs the legal relationship between the operator of the Andertal platform (hereinafter "Platform") and the registered seller (hereinafter "Seller"). By completing verification, the Seller agrees to all of the following terms. It is prepared in compliance with Regulation (EU) 2022/2065 (Digital Services Act), Regulation (EU) 2019/1150 (P2B Regulation), the GDPR, and the German Civil Code (BGB). This Agreement is available in several languages; in case of conflict, the German version prevails, as German law governs.`,
    },
    {
      heading: "Article 1 – Definitions",
      body: `"Platform" means the marketplace infrastructure operated by Andertal (website, mobile applications, APIs, and related services). "Seller" means any natural or legal person who registers to offer goods via the Platform. "End Customer" means the buyer of a product offered by the Seller. "Listing" means each product listing entry published on the Platform. "Sellercentral" means the management interface through which the Seller administers their account.`,
    },
    {
      heading: "Article 2 – Subject Matter and Role of the Platform",
      body: `The Platform provides the Seller with technical infrastructure to list, manage, and sell goods to end consumers. The Seller acts as an independent trader in their own name and on their own account. The Platform is not a party to sales contracts concluded between the Seller and end customers, but acts as an "online intermediation service" within the meaning of Art. 2(2) P2B Regulation and an "online marketplace" within the meaning of Art. 3(j) DSA. Certain additional functions (e.g. payment processing, shipping label purchase) are provided by the Platform as a technical service provider on the Seller's behalf, without thereby making the Platform a party to the underlying sales contract.`,
    },
    {
      heading: "Article 3 – Registration, Account, and Verification",
      body: `Use of the Platform requires successful registration and, depending on category and country of origin, identity and business verification (trade register extract, ID document of the authorized representative, and, where applicable, a tax document). The Seller warrants that all information and documents submitted during verification are true, complete, and current, and undertakes to promptly report any changes. The Platform reserves the right to refuse or re-request verification where there is reasonable doubt as to the accuracy of the information provided. Login credentials must be kept confidential; the Seller is liable for actions taken using their credentials to the extent they are responsible for their misuse.`,
    },
    {
      heading: "Article 4 – Seller Obligations",
      body: `The Seller undertakes to:\n• Offer only lawful goods and comply with applicable product safety, labeling, and consumer protection regulations, including Regulation (EU) 2023/988 (GPSR) and category/country-specific requirements (e.g. WEEE, EPREL, Battery Regulation — see the Compliance section in Sellercentral).\n• Provide complete and accurate business information (tax ID, IBAN, address) and keep it up to date.\n• Fulfill orders within stated delivery times and notify customers promptly in case of delay.\n• Respect statutory warranty rights and grant a 14-day right of withdrawal.\n• Refrain from price-fixing, market manipulation, or unfair competition.\n• Present product information (EAN, title, description, images) truthfully and not misleadingly, and not alter shared catalog entries without authorization.\n• Respond to customer inquiries via the communication channels provided on the Platform within a reasonable time.`,
    },
    {
      heading: "Article 5 – Prohibited and Restricted Items",
      body: `The Seller may not offer items that violate applicable law or whose sale via the Platform is expressly excluded, including without limitation counterfeit branded goods, weapons and weapon-like items, prescription medicines without appropriate authorization, stolen goods, tobacco and nicotine products without age verification, and items that violate export control or sanctions law. The Platform may publish a current, non-exhaustive list of prohibited and restricted categories in Sellercentral and unilaterally amend it where required for regulatory reasons; material changes are communicated pursuant to Article 18.`,
    },
    {
      heading: "Article 6 – Intellectual Property and Trademarks",
      body: `The Seller warrants that it holds, or is authorized to use, all rights necessary in the content it uploads (product images, texts, trademarks). Use of a third party's registered brand name is subject to the Platform's separate brand authorization process (Sellercentral → Brands); listing under a registered brand without demonstrated authorization is prohibited and may be removed without prior notice. Rights holders may report suspected infringements via the notice-and-action mechanism under Article 12. By uploading content, the Seller grants the Platform a simple, non-exclusive right, limited to the term of this Agreement, to display such content on the Platform and in related marketing activities.`,
    },
    {
      heading: "Article 7 – Data Protection (GDPR)",
      body: `The Seller processes personal data of end customers (name, address, order data) solely for the purpose of contract performance (Art. 6(1)(b) GDPR) and only to the extent necessary to fulfil the relevant order. Transfer to third parties without a legal basis is prohibited; in particular, use of customer data for marketing purposes outside the Platform without the customer's separate consent is not permitted. Data subject requests (access, erasure, rectification) must be answered within 30 days, and the Seller must support the Platform in fulfilling its own data protection obligations. A Data Processing Agreement (DPA) pursuant to Art. 28 GDPR will be concluded where required. The Seller implements appropriate technical and organizational measures (Art. 32 GDPR) to protect customer data it can access.`,
    },
    {
      heading: "Article 8 – Payment Processing and Payouts",
      body: `Payments from end customers are processed via the payment service provider used by the Platform. Payouts to the Seller are made after order completion and expiry of any applicable return period, according to the payout schedule visible in Sellercentral. The Platform is entitled to temporarily withhold amounts in justified cases of chargebacks, returns, or suspected fraud, until the underlying matter is resolved. The Seller is responsible for the accuracy of the bank details it provides; delays caused by incorrect details are at the Seller's expense.`,
    },
    {
      heading: "Article 9 – Fees, Charges, and Pricing",
      body: `The Platform charges a transaction fee in accordance with the price list valid at the time of sale, visible in Sellercentral. Changes to the fee structure are communicated to the Seller in advance pursuant to Article 18. The Seller determines the sale prices of its listings at its own discretion; the Platform does not influence pricing except through permitted, Seller-activated discount and campaign features. Late payment of fees incurs statutory default interest; the Platform may offset due fees against outstanding payout claims.`,
    },
    {
      heading: "Article 10 – Tax Obligations",
      body: `The Seller is solely responsible for the correct VAT treatment of its sales, including any registration obligations under the One-Stop-Shop (OSS) scheme or in individual EU member states, and for the proper declaration and remittance of all taxes attributable to its sales. Where legally required, the Platform may transmit transaction data to competent tax authorities (e.g. under Section 22f of the German VAT Act or DAC7 reporting obligations). The Seller shall provide the Platform with the necessary evidence upon request.`,
    },
    {
      heading: "Article 11 – Ranking, Visibility, and Advertising (P2B Regulation)",
      body: `Pursuant to Art. 5 of EU Regulation 2019/1150, the Platform discloses the main parameters of its ranking algorithm: product quality, customer reviews, order fulfillment rate, pricing, catalog freshness, and account compliance. The Seller can influence ranking by improving these factors. Paid advertising placements (e.g. via the marketing/campaign feature) are separately labeled as such and do not affect the organic ranking of other listings.`,
    },
    {
      heading: "Article 12 – Content Moderation and Notice-and-Action Mechanism (DSA)",
      body: `Pursuant to Art. 16 DSA, the Platform operates a notice-and-action mechanism through which users, rights holders, and authorities may report allegedly unlawful listings or content. Incoming reports are reviewed promptly; where a report is well-founded, the Platform may remove the affected listing, restrict access to it, or — in cases of serious or repeated violations — suspend the Seller's account pursuant to Article 16. The Seller is generally informed of removed content and given an opportunity to respond, unless mandatory legal or safety reasons preclude this (Art. 17, 20 DSA). Repeated, manifestly unfounded reports by third parties may be dismissed by the Platform.`,
    },
    {
      heading: "Article 13 – Marketplace Liability Towards Consumers (P2B Art. 6a)",
      body: `Prior to purchase, the Platform clearly discloses to end customers whether a listing originates from a commercial third party, and indicates the resulting allocation of rights and obligations (in particular warranty and withdrawal) between the Seller and the Platform. The Seller undertakes to provide all information necessary for this labeling completely and truthfully, and acknowledges that, subject to the exceptions set out in this Agreement, primary responsibility for fulfilling the sales contracts rests with the Seller.`,
    },
    {
      heading: "Article 14 – Limitation of Liability",
      body: `The Platform is not liable for damages arising from incorrect product information provided by the Seller, delivery delays, product defects, or other breaches of duty by the Seller. The Platform's liability for indirect damages and lost profits is excluded — except in cases of intent, gross negligence, or injury to life, body, or health. The Platform aims for a commercially reasonable standard of availability of its technical infrastructure; no entitlement to uninterrupted availability exists.`,
    },
    {
      heading: "Article 15 – Indemnification and Force Majeure",
      body: `The Seller indemnifies the Platform against all third-party claims arising from a culpable breach of this Agreement, applicable law, or third-party rights by the Seller, including reasonable legal defense costs. Neither party is liable for failure to perform its obligations to the extent such failure results from force majeure (e.g. natural disasters, governmental orders, large-scale network outages) beyond its reasonable control; the affected party shall promptly inform the other party of the nature and expected duration of the event.`,
    },
    {
      heading: "Article 16 – Account Suspension, Restriction, and Termination",
      body: `The Platform may suspend, restrict, or terminate the account for serious or repeated violations of this Agreement, for unlawful content, or on governmental order. Where possible and legally permissible, the Seller is given reasonable opportunity to respond before suspension (Art. 4 P2B Regulation). The Seller may terminate the account at any time with 30 days' notice. Pending orders must be properly fulfilled even after termination; already-due payout claims remain unaffected, subject to any withholding under Article 8.`,
    },
    {
      heading: "Article 17 – Assignment",
      body: `The Seller may not assign rights and obligations under this Agreement to third parties without the Platform's prior written consent. The Platform may assign this Agreement to an affiliated company as part of a restructuring, merger, or business transfer, provided this does not materially worsen the Seller's legal position.`,
    },
    {
      heading: "Article 18 – Changes to this Agreement",
      body: `Changes to this Agreement will be communicated to the Seller in writing (email or Sellercentral notification) at least 15 days before taking effect (Art. 3 P2B Regulation), except where a shorter period is required due to legal obligations, to avert unforeseen risks, or for the Seller's benefit. If the Seller does not object within the period and continues to use the Platform, the changes are deemed accepted; in the event of an objection, the Seller may terminate the account pursuant to Article 16.`,
    },
    {
      heading: "Article 19 – Dispute Resolution",
      body: `Disputes between the Platform and the Seller are first addressed via the internal support channel. Pursuant to Art. 11 P2B Regulation, the Platform designates info@andertal.com as its internal complaint-handling contact. The EU Online Dispute Resolution platform (https://ec.europa.eu/consumers/odr/) is available for unresolved disputes; for P2B-related disputes, a mediator may also be engaged pursuant to Art. 12 P2B Regulation. German law applies, excluding the UN Convention on Contracts for the International Sale of Goods; to the extent legally permissible, the place of jurisdiction is Berlin.`,
    },
    {
      heading: "Article 20 – Final Provisions and Contact",
      body: `If any provision is found invalid, the remaining provisions remain in force (severability); the parties undertake to replace the invalid provision with a valid one that comes as close as possible to its economic intent. Together with the policies published in Sellercentral (including prohibited items and compliance requirements), this Agreement constitutes the entire agreement between the parties. Contact: info@andertal.com. Last updated: July 2026. Note: this text is a contract template and does not constitute legal advice; it has not yet been reviewed by a lawyer prior to going into effect.`,
    },
  ],
  fr: [
    {
      heading: "Préambule",
      body: `Le présent accord régit la relation juridique entre l'exploitant de la plateforme Andertal (ci-après « Plateforme ») et le vendeur enregistré (ci-après « Vendeur »). En achevant la vérification, le Vendeur accepte l'ensemble des conditions suivantes. Il est établi conformément au règlement (UE) 2022/2065 (Digital Services Act), au règlement (UE) 2019/1150 (règlement P2B), au RGPD et au Code civil allemand (BGB). Cet accord est disponible en plusieurs langues ; en cas de contradiction, la version allemande prévaut, le droit allemand étant applicable.`,
    },
    {
      heading: "Article 1 – Définitions",
      body: `« Plateforme » désigne l'infrastructure de marketplace exploitée par Andertal (site web, applications mobiles, API et services associés). « Vendeur » désigne toute personne physique ou morale qui s'enregistre pour proposer des biens via la Plateforme. « Client final » désigne l'acheteur d'un produit proposé par le Vendeur. « Annonce » désigne chaque fiche produit publiée sur la Plateforme. « Sellercentral » désigne l'interface de gestion par laquelle le Vendeur administre son compte.`,
    },
    {
      heading: "Article 2 – Objet du contrat et rôle de la Plateforme",
      body: `La Plateforme fournit au Vendeur une infrastructure technique pour proposer, gérer et vendre des biens aux consommateurs finaux. Le Vendeur agit en tant que commerçant indépendant, en son nom propre et pour son propre compte. La Plateforme n'est pas partie aux contrats de vente conclus entre le Vendeur et les clients finaux ; elle agit en tant que « service d'intermédiation en ligne » au sens de l'art. 2, § 2 du règlement P2B et de « place de marché en ligne » au sens de l'art. 3, point j) du DSA. Certaines fonctions additionnelles (traitement des paiements, achat d'étiquettes d'expédition) sont fournies par la Plateforme en tant que prestataire technique pour le compte du Vendeur, sans faire de la Plateforme une partie au contrat de vente sous-jacent.`,
    },
    {
      heading: "Article 3 – Inscription, compte et vérification",
      body: `L'utilisation de la Plateforme suppose une inscription réussie et, selon la catégorie et le pays d'origine, une vérification d'identité et d'entreprise (extrait de registre du commerce, pièce d'identité du représentant habilité, le cas échéant document fiscal). Le Vendeur garantit que toutes les informations et tous les documents fournis lors de la vérification sont exacts, complets et à jour, et s'engage à signaler immédiatement toute modification. La Plateforme se réserve le droit de refuser ou de redemander la vérification en cas de doute raisonnable quant à l'exactitude des informations. Les identifiants de connexion doivent rester confidentiels ; le Vendeur est responsable des actions effectuées avec ses identifiants dans la mesure où il est responsable de leur usage abusif.`,
    },
    {
      heading: "Article 4 – Obligations du Vendeur",
      body: `Le Vendeur s'engage à :\n• Proposer uniquement des biens licites et respecter les réglementations applicables en matière de sécurité des produits, d'étiquetage et de protection des consommateurs, y compris le règlement (UE) 2023/988 (GPSR) et les exigences spécifiques par catégorie/pays (WEEE, EPREL, règlement sur les batteries — voir la section Conformité de Sellercentral).\n• Fournir des informations commerciales complètes et exactes (numéro fiscal, IBAN, adresse) et les tenir à jour.\n• Exécuter les commandes dans les délais de livraison indiqués et informer rapidement les clients en cas de retard.\n• Respecter les droits de garantie légaux et accorder un droit de rétractation de 14 jours.\n• S'abstenir de toute entente sur les prix, manipulation du marché ou concurrence déloyale.\n• Présenter les informations produit (EAN, titre, description, images) de manière véridique et non trompeuse, et ne pas modifier sans autorisation les fiches de catalogue partagées.\n• Répondre aux demandes des clients via les canaux de communication fournis par la Plateforme dans un délai raisonnable.`,
    },
    {
      heading: "Article 5 – Articles interdits et restreints",
      body: `Le Vendeur ne peut pas proposer d'articles contraires à la législation applicable ou dont la vente via la Plateforme est expressément exclue, y compris, sans s'y limiter, les produits de marque contrefaits, les armes et objets assimilés, les médicaments sur ordonnance sans autorisation appropriée, les biens volés, les produits du tabac et de la nicotine sans vérification de l'âge, et les articles contraires au droit du contrôle des exportations ou aux sanctions. La Plateforme peut publier dans Sellercentral une liste actualisée et non exhaustive des catégories interdites et restreintes, et la modifier unilatéralement lorsque cela est requis pour des raisons réglementaires ; les modifications substantielles sont communiquées conformément à l'article 18.`,
    },
    {
      heading: "Article 6 – Propriété intellectuelle et marques",
      body: `Le Vendeur garantit qu'il détient, ou est autorisé à utiliser, tous les droits nécessaires sur le contenu qu'il télécharge (images produit, textes, marques). L'utilisation d'une marque déposée appartenant à un tiers est soumise à la procédure distincte d'autorisation de marque de la Plateforme (Sellercentral → Marques) ; toute annonce sous une marque déposée sans autorisation démontrée est interdite et peut être retirée sans préavis. Les titulaires de droits peuvent signaler une atteinte présumée via le mécanisme de notification et action prévu à l'article 12. En téléchargeant du contenu, le Vendeur accorde à la Plateforme un droit d'utilisation simple, limité à la durée du présent accord, pour afficher ce contenu sur la Plateforme et dans les actions marketing associées.`,
    },
    {
      heading: "Article 7 – Protection des données (RGPD)",
      body: `Le Vendeur traite les données personnelles des clients finaux (nom, adresse, données de commande) exclusivement aux fins de l'exécution du contrat (art. 6, § 1, point b) du RGPD) et uniquement dans la mesure nécessaire à l'exécution de la commande concernée. Le transfert à des tiers sans base juridique est interdit ; l'utilisation des données clients à des fins marketing en dehors de la Plateforme sans le consentement distinct du client est notamment interdite. Les demandes des personnes concernées (accès, effacement, rectification) doivent recevoir une réponse dans un délai de 30 jours, et le Vendeur doit assister la Plateforme dans l'exécution de ses propres obligations en matière de protection des données. Un accord de traitement des données (DPA) conforme à l'art. 28 du RGPD sera conclu si nécessaire. Le Vendeur met en œuvre des mesures techniques et organisationnelles appropriées (art. 32 RGPD) pour protéger les données clients auxquelles il a accès.`,
    },
    {
      heading: "Article 8 – Traitement des paiements et versements",
      body: `Les paiements des clients finaux sont traités via le prestataire de services de paiement utilisé par la Plateforme. Les versements au Vendeur sont effectués après finalisation de la commande et expiration de tout délai de retour applicable, selon le calendrier de versement visible dans Sellercentral. La Plateforme est en droit de retenir temporairement des montants dans des cas justifiés de rétrofacturation, de retours ou de soupçon de fraude, jusqu'à résolution de l'affaire concernée. Le Vendeur est responsable de l'exactitude des coordonnées bancaires qu'il fournit ; les retards dus à des informations incorrectes sont à sa charge.`,
    },
    {
      heading: "Article 9 – Commissions, frais et tarification",
      body: `La Plateforme perçoit des frais de transaction conformément à la grille tarifaire en vigueur au moment de la vente, consultable dans Sellercentral. Les modifications de la structure tarifaire sont communiquées au Vendeur au préalable conformément à l'article 18. Le Vendeur fixe librement les prix de vente de ses annonces ; la Plateforme n'intervient pas sur ces prix, sauf via les fonctions de remise/campagne autorisées et activées par le Vendeur. Tout retard de paiement des frais entraîne des intérêts moratoires légaux ; la Plateforme peut compenser les frais dus avec les créances de versement en attente.`,
    },
    {
      heading: "Article 10 – Obligations fiscales",
      body: `Le Vendeur est seul responsable du traitement correct de la TVA sur ses ventes, y compris toute obligation d'immatriculation dans le cadre du guichet unique (OSS) ou dans certains États membres de l'UE, ainsi que de la déclaration et du paiement corrects de tous les impôts afférents à ses ventes. Dans la mesure requise par la loi, la Plateforme peut transmettre les données de transaction aux autorités fiscales compétentes (par exemple au titre de l'article 22f de la loi allemande sur la TVA ou des obligations de déclaration DAC7). Le Vendeur fournit à la Plateforme les justificatifs nécessaires sur demande.`,
    },
    {
      heading: "Article 11 – Classement, visibilité et publicité (règlement P2B)",
      body: `Conformément à l'art. 5 du règlement (UE) 2019/1150, la Plateforme communique les principaux paramètres de son algorithme de classement : qualité du produit, avis clients, taux d'exécution des commandes, tarification, fraîcheur du catalogue et conformité du compte. Le Vendeur peut influencer le classement en améliorant ces facteurs. Les placements publicitaires payants (par exemple via la fonction marketing/campagnes) sont signalés comme tels séparément et n'affectent pas le classement organique des autres annonces.`,
    },
    {
      heading: "Article 12 – Modération de contenu et mécanisme de notification et action (DSA)",
      body: `Conformément à l'art. 16 du DSA, la Plateforme exploite un mécanisme de notification et action permettant aux utilisateurs, titulaires de droits et autorités de signaler des annonces ou contenus prétendument illicites. Les signalements reçus sont examinés rapidement ; en cas de signalement fondé, la Plateforme peut retirer l'annonce concernée, en restreindre l'accès ou, en cas de violations graves ou répétées, suspendre le compte du Vendeur conformément à l'article 16. Le Vendeur est en principe informé des contenus retirés et a la possibilité de répondre, sauf si des raisons juridiques ou de sécurité impératives s'y opposent (art. 17, 20 DSA). Les signalements répétés et manifestement infondés de tiers peuvent être rejetés par la Plateforme.`,
    },
    {
      heading: "Article 13 – Responsabilité de la place de marché envers les consommateurs (P2B art. 6 bis)",
      body: `Avant l'achat, la Plateforme indique clairement aux clients finaux si une annonce provient d'un tiers professionnel, et précise la répartition des droits et obligations qui en résulte (notamment la garantie et le droit de rétractation) entre le Vendeur et la Plateforme. Le Vendeur s'engage à fournir toutes les informations nécessaires à cet étiquetage de manière complète et véridique, et reconnaît que, sous réserve des exceptions prévues au présent accord, la responsabilité principale de l'exécution des contrats de vente lui incombe.`,
    },
    {
      heading: "Article 14 – Limitation de responsabilité",
      body: `La Plateforme n'est pas responsable des dommages résultant d'informations produit incorrectes fournies par le Vendeur, de retards de livraison, de défauts de produit ou d'autres manquements du Vendeur. La responsabilité de la Plateforme pour les dommages indirects et le manque à gagner est exclue, sauf en cas de dol, de faute lourde ou d'atteinte à la vie, au corps ou à la santé. La Plateforme vise un niveau de disponibilité commercialement raisonnable de son infrastructure technique ; aucun droit à une disponibilité ininterrompue n'est garanti.`,
    },
    {
      heading: "Article 15 – Indemnisation et force majeure",
      body: `Le Vendeur indemnise la Plateforme de toute réclamation de tiers résultant d'une violation fautive du présent accord, de la loi applicable ou des droits de tiers par le Vendeur, y compris les frais raisonnables de défense juridique. Aucune partie n'est responsable de l'inexécution de ses obligations dans la mesure où celle-ci résulte d'un cas de force majeure (catastrophes naturelles, décisions des autorités, pannes réseau à grande échelle, etc.) échappant à son contrôle raisonnable ; la partie concernée informe sans délai l'autre partie de la nature et de la durée prévisible de l'événement.`,
    },
    {
      heading: "Article 16 – Suspension, restriction et résiliation du compte",
      body: `La Plateforme peut suspendre, restreindre ou résilier le compte en cas de violations graves ou répétées du présent accord, de contenu illicite ou sur décision d'une autorité. Dans la mesure du possible et légalement permis, le Vendeur se voit accorder une possibilité raisonnable de répondre avant toute suspension (art. 4 du règlement P2B). Le Vendeur peut résilier son compte à tout moment avec un préavis de 30 jours. Les commandes en cours doivent être dûment exécutées même après résiliation ; les créances de versement déjà exigibles restent inchangées, sous réserve d'une retenue conformément à l'article 8.`,
    },
    {
      heading: "Article 17 – Cession",
      body: `Le Vendeur ne peut céder les droits et obligations découlant du présent accord à des tiers sans l'accord écrit préalable de la Plateforme. La Plateforme peut céder le présent accord à une société affiliée dans le cadre d'une restructuration, d'une fusion ou d'un transfert d'activité, à condition que cela n'entraîne pas de détérioration substantielle de la situation juridique du Vendeur.`,
    },
    {
      heading: "Article 18 – Modifications du présent accord",
      body: `Les modifications du présent accord sont communiquées au Vendeur par écrit (e-mail ou notification dans Sellercentral) au moins 15 jours avant leur entrée en vigueur (art. 3 du règlement P2B), sauf lorsqu'un délai plus court est requis en raison d'obligations légales, pour prévenir des risques imprévus, ou au bénéfice du Vendeur. Si le Vendeur ne s'y oppose pas dans le délai imparti et continue d'utiliser la Plateforme, les modifications sont réputées acceptées ; en cas d'opposition, le Vendeur peut résilier son compte conformément à l'article 16.`,
    },
    {
      heading: "Article 19 – Règlement des litiges",
      body: `Les litiges entre la Plateforme et le Vendeur sont d'abord traités via le canal d'assistance interne. Conformément à l'art. 11 du règlement P2B, la Plateforme désigne info@andertal.com comme point de contact interne pour les réclamations. La plateforme européenne de règlement en ligne des litiges (https://ec.europa.eu/consumers/odr/) est disponible pour les litiges non résolus ; pour les litiges relevant du règlement P2B, un médiateur peut également être sollicité conformément à l'art. 12 du règlement P2B. Le droit allemand s'applique, à l'exclusion de la Convention des Nations Unies sur les contrats de vente internationale de marchandises ; dans la mesure légalement permise, le for compétent est Berlin.`,
    },
    {
      heading: "Article 20 – Dispositions finales et contact",
      body: `Si une disposition s'avère invalide, les autres dispositions restent en vigueur (clause de divisibilité) ; les parties s'engagent à remplacer la disposition invalide par une disposition valide se rapprochant le plus possible de son objectif économique. Le présent accord, ainsi que les politiques publiées dans Sellercentral (y compris les articles interdits et les exigences de conformité), constitue l'intégralité de l'accord entre les parties. Contact : info@andertal.com. Dernière mise à jour : juillet 2026. Remarque : ce texte est un modèle de contrat et ne constitue pas un avis juridique ; il n'a pas encore été examiné par un avocat avant son entrée en vigueur.`,
    },
  ],
  es: [
    {
      heading: "Preámbulo",
      body: `Este acuerdo regula la relación jurídica entre el operador de la plataforma Andertal (en adelante, la «Plataforma») y el vendedor registrado (en adelante, el «Vendedor»). Al completar la verificación, el Vendedor acepta todas las condiciones siguientes. Se ha elaborado de conformidad con el Reglamento (UE) 2022/2065 (Ley de Servicios Digitales), el Reglamento (UE) 2019/1150 (Reglamento P2B), el RGPD y el Código Civil alemán (BGB). Este acuerdo está disponible en varios idiomas; en caso de contradicción, prevalece la versión alemana, ya que se aplica el derecho alemán.`,
    },
    {
      heading: "Artículo 1 – Definiciones",
      body: `«Plataforma» designa la infraestructura de marketplace operada por Andertal (sitio web, aplicaciones móviles, API y servicios relacionados). «Vendedor» designa a toda persona física o jurídica que se registra para ofrecer bienes a través de la Plataforma. «Cliente final» designa al comprador de un producto ofrecido por el Vendedor. «Anuncio» designa cada ficha de producto publicada en la Plataforma. «Sellercentral» designa la interfaz de gestión mediante la cual el Vendedor administra su cuenta.`,
    },
    {
      heading: "Artículo 2 – Objeto del contrato y función de la Plataforma",
      body: `La Plataforma proporciona al Vendedor una infraestructura técnica para ofrecer, gestionar y vender bienes a consumidores finales. El Vendedor actúa como comerciante independiente, en su propio nombre y por cuenta propia. La Plataforma no es parte de los contratos de compraventa celebrados entre el Vendedor y los clientes finales; actúa como «servicio de intermediación en línea» en el sentido del art. 2, apartado 2, del Reglamento P2B y como «mercado en línea» en el sentido del art. 3, letra j), de la DSA. Determinadas funciones adicionales (procesamiento de pagos, compra de etiquetas de envío) son prestadas por la Plataforma como proveedor de servicios técnicos por cuenta del Vendedor, sin que ello convierta a la Plataforma en parte del contrato de compraventa subyacente.`,
    },
    {
      heading: "Artículo 3 – Registro, cuenta y verificación",
      body: `El uso de la Plataforma requiere un registro exitoso y, dependiendo de la categoría y el país de origen, una verificación de identidad y de la actividad empresarial (extracto del registro mercantil, documento de identidad del representante autorizado y, en su caso, documento fiscal). El Vendedor garantiza que toda la información y los documentos presentados durante la verificación son veraces, completos y actuales, y se compromete a comunicar de inmediato cualquier cambio. La Plataforma se reserva el derecho de rechazar o volver a solicitar la verificación cuando existan dudas razonables sobre la exactitud de la información. Las credenciales de acceso deben mantenerse confidenciales; el Vendedor es responsable de las acciones realizadas con sus credenciales en la medida en que sea responsable de su uso indebido.`,
    },
    {
      heading: "Artículo 4 – Obligaciones del Vendedor",
      body: `El Vendedor se compromete a:\n• Ofrecer únicamente bienes lícitos y cumplir la normativa aplicable en materia de seguridad de los productos, etiquetado y protección del consumidor, incluido el Reglamento (UE) 2023/988 (GPSR) y los requisitos específicos por categoría/país (WEEE, EPREL, Reglamento sobre baterías — véase la sección de Cumplimiento en Sellercentral).\n• Proporcionar información comercial completa y exacta (NIF, IBAN, dirección) y mantenerla actualizada.\n• Cumplir los pedidos dentro de los plazos de entrega indicados y notificar sin demora a los clientes en caso de retraso.\n• Respetar los derechos de garantía legales y conceder un derecho de desistimiento de 14 días.\n• Abstenerse de fijación de precios, manipulación del mercado o competencia desleal.\n• Presentar la información de los productos (EAN, título, descripción, imágenes) de forma veraz y no engañosa, y no modificar sin autorización las fichas de catálogo compartidas.\n• Responder a las consultas de los clientes a través de los canales de comunicación proporcionados por la Plataforma en un plazo razonable.`,
    },
    {
      heading: "Artículo 5 – Artículos prohibidos y restringidos",
      body: `El Vendedor no podrá ofrecer artículos que infrinjan la legislación aplicable o cuya venta a través de la Plataforma esté expresamente excluida, incluidos, entre otros, productos de marca falsificados, armas y objetos similares, medicamentos con receta sin la autorización correspondiente, bienes robados, productos de tabaco y nicotina sin verificación de edad, y artículos que infrinjan la normativa de control de exportaciones o sanciones. La Plataforma podrá publicar en Sellercentral una lista actualizada y no exhaustiva de categorías prohibidas y restringidas, y modificarla unilateralmente cuando sea necesario por razones normativas; los cambios sustanciales se comunicarán conforme al artículo 18.`,
    },
    {
      heading: "Artículo 6 – Propiedad intelectual y marcas",
      body: `El Vendedor garantiza que posee, o está autorizado a utilizar, todos los derechos necesarios sobre el contenido que carga (imágenes de productos, textos, marcas). El uso del nombre de marca registrada de un tercero está sujeto al proceso independiente de autorización de marca de la Plataforma (Sellercentral → Marcas); publicar un anuncio bajo una marca registrada sin autorización demostrada está prohibido y puede eliminarse sin previo aviso. Los titulares de derechos pueden notificar presuntas infracciones a través del mecanismo de notificación y acción del artículo 12. Al cargar contenido, el Vendedor concede a la Plataforma un derecho de uso simple, limitado a la duración de este acuerdo, para mostrar dicho contenido en la Plataforma y en las actividades de marketing relacionadas.`,
    },
    {
      heading: "Artículo 7 – Protección de datos (RGPD)",
      body: `El Vendedor trata los datos personales de los clientes finales (nombre, dirección, datos del pedido) exclusivamente con el fin de ejecutar el contrato (art. 6, apartado 1, letra b, del RGPD) y solo en la medida necesaria para gestionar el pedido correspondiente. Está prohibida la transferencia a terceros sin base jurídica; en particular, no está permitido el uso de datos de clientes con fines de marketing fuera de la Plataforma sin el consentimiento independiente del cliente. Las solicitudes de los interesados (acceso, supresión, rectificación) deben atenderse en un plazo de 30 días, y el Vendedor debe colaborar con la Plataforma en el cumplimiento de sus propias obligaciones en materia de protección de datos. Se celebrará un acuerdo de tratamiento de datos (DPA) conforme al art. 28 del RGPD cuando sea necesario. El Vendedor aplica medidas técnicas y organizativas adecuadas (art. 32 RGPD) para proteger los datos de los clientes a los que tiene acceso.`,
    },
    {
      heading: "Artículo 8 – Procesamiento de pagos y liquidaciones",
      body: `Los pagos de los clientes finales se procesan a través del proveedor de servicios de pago utilizado por la Plataforma. Las liquidaciones al Vendedor se realizan después de completar el pedido y de que expire cualquier período de devolución aplicable, según el calendario de liquidaciones visible en Sellercentral. La Plataforma tiene derecho a retener temporalmente importes en casos justificados de contracargos, devoluciones o sospecha de fraude, hasta que se resuelva el asunto correspondiente. El Vendedor es responsable de la exactitud de los datos bancarios que proporciona; los retrasos causados por datos incorrectos corren a su cargo.`,
    },
    {
      heading: "Artículo 9 – Comisiones, tarifas y precios",
      body: `La Plataforma cobra una tarifa de transacción de acuerdo con la lista de precios vigente en el momento de la venta, disponible en Sellercentral. Los cambios en la estructura de tarifas se comunican al Vendedor con antelación conforme al artículo 18. El Vendedor determina los precios de venta de sus anuncios bajo su propia responsabilidad; la Plataforma no interviene en dichos precios, salvo mediante las funciones de descuento/campaña permitidas y activadas por el Vendedor. El retraso en el pago de las tarifas genera intereses de demora legales; la Plataforma puede compensar las tarifas adeudadas con los importes pendientes de liquidación.`,
    },
    {
      heading: "Artículo 10 – Obligaciones fiscales",
      body: `El Vendedor es el único responsable del correcto tratamiento del IVA en sus ventas, incluida cualquier obligación de registro en el régimen de ventanilla única (OSS) o en determinados Estados miembros de la UE, así como de la correcta declaración y liquidación de todos los impuestos correspondientes a sus ventas. En la medida en que lo exija la ley, la Plataforma podrá transmitir datos de transacciones a las autoridades fiscales competentes (por ejemplo, en virtud del artículo 22f de la ley alemana del IVA o de las obligaciones de comunicación DAC7). El Vendedor proporcionará a la Plataforma las pruebas necesarias cuando así se le solicite.`,
    },
    {
      heading: "Artículo 11 – Clasificación, visibilidad y publicidad (Reglamento P2B)",
      body: `De conformidad con el art. 5 del Reglamento (UE) 2019/1150, la Plataforma da a conocer los principales parámetros de su algoritmo de clasificación: calidad del producto, valoraciones de los clientes, tasa de cumplimiento de pedidos, precios, actualidad del catálogo y cumplimiento de la cuenta. El Vendedor puede influir en la clasificación mejorando estos factores. Las ubicaciones publicitarias de pago (por ejemplo, a través de la función de marketing/campañas) se etiquetan por separado como tales y no afectan a la clasificación orgánica de otros anuncios.`,
    },
    {
      heading: "Artículo 12 – Moderación de contenidos y mecanismo de notificación y acción (DSA)",
      body: `De conformidad con el art. 16 de la DSA, la Plataforma opera un mecanismo de notificación y acción a través del cual los usuarios, los titulares de derechos y las autoridades pueden notificar anuncios o contenidos presuntamente ilícitos. Las notificaciones recibidas se examinan con prontitud; cuando una notificación esté fundada, la Plataforma podrá eliminar el anuncio afectado, restringir el acceso a él o, en casos de infracciones graves o reiteradas, suspender la cuenta del Vendedor conforme al artículo 16. Por regla general, se informa al Vendedor sobre el contenido eliminado y se le da la oportunidad de responder, salvo que razones legales o de seguridad imperativas lo impidan (art. 17, 20 DSA). Las notificaciones reiteradas y manifiestamente infundadas de terceros podrán ser rechazadas por la Plataforma.`,
    },
    {
      heading: "Artículo 13 – Responsabilidad del mercado frente a los consumidores (P2B art. 6 bis)",
      body: `Antes de la compra, la Plataforma indica claramente a los clientes finales si un anuncio procede de un tercero comercial, y señala la consiguiente distribución de derechos y obligaciones (en particular, garantía y desistimiento) entre el Vendedor y la Plataforma. El Vendedor se compromete a proporcionar toda la información necesaria para este etiquetado de forma completa y veraz, y reconoce que, salvo las excepciones previstas en este acuerdo, la responsabilidad principal del cumplimiento de los contratos de compraventa recae en él.`,
    },
    {
      heading: "Artículo 14 – Limitación de responsabilidad",
      body: `La Plataforma no es responsable de los daños derivados de información de productos incorrecta proporcionada por el Vendedor, retrasos en la entrega, defectos del producto u otros incumplimientos del Vendedor. Se excluye la responsabilidad de la Plataforma por daños indirectos y lucro cesante, salvo en casos de dolo, negligencia grave o lesiones a la vida, el cuerpo o la salud. La Plataforma aspira a un nivel de disponibilidad comercialmente razonable de su infraestructura técnica; no se garantiza un derecho a una disponibilidad ininterrumpida.`,
    },
    {
      heading: "Artículo 15 – Indemnización y fuerza mayor",
      body: `El Vendedor indemnizará a la Plataforma frente a cualquier reclamación de terceros derivada de un incumplimiento culpable de este acuerdo, de la legislación aplicable o de los derechos de terceros por parte del Vendedor, incluidos los costes razonables de defensa jurídica. Ninguna de las partes será responsable del incumplimiento de sus obligaciones en la medida en que dicho incumplimiento resulte de causas de fuerza mayor (catástrofes naturales, órdenes gubernamentales, cortes de red a gran escala, etc.) fuera de su control razonable; la parte afectada informará sin demora a la otra parte sobre la naturaleza y la duración prevista del acontecimiento.`,
    },
    {
      heading: "Artículo 16 – Suspensión, restricción y cancelación de la cuenta",
      body: `La Plataforma podrá suspender, restringir o cancelar la cuenta en caso de infracciones graves o reiteradas de este acuerdo, contenido ilícito o por orden de una autoridad. Siempre que sea posible y legalmente permisible, se dará al Vendedor una oportunidad razonable de responder antes de la suspensión (art. 4 del Reglamento P2B). El Vendedor podrá cancelar su cuenta en cualquier momento con un preaviso de 30 días. Los pedidos pendientes deberán cumplirse debidamente incluso después de la cancelación; los derechos de liquidación ya vencidos no se verán afectados, sin perjuicio de cualquier retención conforme al artículo 8.`,
    },
    {
      heading: "Artículo 17 – Cesión",
      body: `El Vendedor no podrá ceder los derechos y obligaciones derivados de este acuerdo a terceros sin el consentimiento previo por escrito de la Plataforma. La Plataforma podrá ceder este acuerdo a una empresa afiliada en el marco de una reestructuración, fusión o transmisión de negocio, siempre que ello no suponga un empeoramiento sustancial de la posición jurídica del Vendedor.`,
    },
    {
      heading: "Artículo 18 – Modificaciones de este acuerdo",
      body: `Las modificaciones de este acuerdo se comunicarán al Vendedor por escrito (correo electrónico o notificación en Sellercentral) al menos 15 días antes de su entrada en vigor (art. 3 del Reglamento P2B), salvo que se requiera un plazo más corto por obligaciones legales, para evitar riesgos imprevistos o en beneficio del Vendedor. Si el Vendedor no se opone dentro del plazo y continúa utilizando la Plataforma, las modificaciones se considerarán aceptadas; en caso de oposición, el Vendedor podrá cancelar su cuenta conforme al artículo 16.`,
    },
    {
      heading: "Artículo 19 – Resolución de conflictos",
      body: `Los conflictos entre la Plataforma y el Vendedor se abordarán inicialmente a través del canal de asistencia interno. De conformidad con el art. 11 del Reglamento P2B, la Plataforma designa info@andertal.com como punto de contacto interno para reclamaciones. La plataforma europea de resolución de litigios en línea (https://ec.europa.eu/consumers/odr/) está disponible para conflictos no resueltos; para conflictos relacionados con el Reglamento P2B, también se podrá recurrir a un mediador conforme al art. 12 del Reglamento P2B. Se aplicará el derecho alemán, con exclusión de la Convención de las Naciones Unidas sobre los Contratos de Compraventa Internacional de Mercaderías; en la medida legalmente permitida, el fuero competente será Berlín.`,
    },
    {
      heading: "Artículo 20 – Disposiciones finales y contacto",
      body: `Si alguna disposición resultara inválida, las restantes disposiciones seguirán siendo válidas (cláusula de divisibilidad); las partes se comprometen a sustituir la disposición inválida por una disposición válida que se aproxime lo más posible a su finalidad económica. Este acuerdo, junto con las políticas publicadas en Sellercentral (incluidos los artículos prohibidos y los requisitos de cumplimiento), constituye el acuerdo íntegro entre las partes. Contacto: info@andertal.com. Última actualización: julio de 2026. Nota: este texto es una plantilla contractual y no constituye asesoramiento jurídico; aún no ha sido revisado por un abogado antes de su entrada en vigor.`,
    },
  ],
  it: [
    {
      heading: "Preambolo",
      body: `Il presente accordo disciplina il rapporto giuridico tra il gestore della piattaforma Andertal (di seguito «Piattaforma») e il venditore registrato (di seguito «Venditore»). Completando la verifica, il Venditore accetta tutte le condizioni seguenti. È redatto in conformità al Regolamento (UE) 2022/2065 (Digital Services Act), al Regolamento (UE) 2019/1150 (Regolamento P2B), al GDPR e al Codice civile tedesco (BGB). Il presente accordo è disponibile in più lingue; in caso di contraddizione, prevale la versione tedesca, poiché si applica il diritto tedesco.`,
    },
    {
      heading: "Articolo 1 – Definizioni",
      body: `Per «Piattaforma» si intende l'infrastruttura di marketplace gestita da Andertal (sito web, applicazioni mobili, API e servizi correlati). Per «Venditore» si intende qualsiasi persona fisica o giuridica che si registra per offrire beni tramite la Piattaforma. Per «Cliente finale» si intende l'acquirente di un prodotto offerto dal Venditore. Per «Inserzione» si intende ciascuna scheda prodotto pubblicata sulla Piattaforma. Per «Sellercentral» si intende l'interfaccia di gestione tramite cui il Venditore amministra il proprio account.`,
    },
    {
      heading: "Articolo 2 – Oggetto del contratto e ruolo della Piattaforma",
      body: `La Piattaforma fornisce al Venditore un'infrastruttura tecnica per offrire, gestire e vendere beni ai consumatori finali. Il Venditore agisce come commerciante indipendente, in nome proprio e per proprio conto. La Piattaforma non è parte dei contratti di vendita conclusi tra il Venditore e i clienti finali; agisce come «servizio di intermediazione online» ai sensi dell'art. 2, punto 2, del Regolamento P2B e come «mercato online» ai sensi dell'art. 3, lettera j), del DSA. Alcune funzioni aggiuntive (elaborazione dei pagamenti, acquisto di etichette di spedizione) sono fornite dalla Piattaforma come prestatore di servizi tecnici per conto del Venditore, senza che ciò renda la Piattaforma parte del contratto di vendita sottostante.`,
    },
    {
      heading: "Articolo 3 – Registrazione, account e verifica",
      body: `L'utilizzo della Piattaforma richiede una registrazione andata a buon fine e, a seconda della categoria e del paese di origine, una verifica dell'identità e dell'attività d'impresa (estratto del registro delle imprese, documento d'identità del rappresentante autorizzato, se necessario documento fiscale). Il Venditore garantisce che tutte le informazioni e i documenti forniti durante la verifica siano veritieri, completi e aggiornati, e si impegna a comunicare tempestivamente eventuali modifiche. La Piattaforma si riserva il diritto di rifiutare o richiedere nuovamente la verifica in presenza di ragionevoli dubbi sull'esattezza delle informazioni fornite. Le credenziali di accesso devono essere mantenute riservate; il Venditore è responsabile delle azioni compiute utilizzando le proprie credenziali nella misura in cui sia responsabile del loro uso improprio.`,
    },
    {
      heading: "Articolo 4 – Obblighi del Venditore",
      body: `Il Venditore si impegna a:\n• Offrire esclusivamente beni legali e rispettare la normativa applicabile in materia di sicurezza dei prodotti, etichettatura e tutela dei consumatori, incluso il Regolamento (UE) 2023/988 (GPSR) e i requisiti specifici per categoria/paese (WEEE, EPREL, Regolamento sulle batterie — vedi la sezione Conformità in Sellercentral).\n• Fornire informazioni commerciali complete e corrette (partita IVA, IBAN, indirizzo) e mantenerle aggiornate.\n• Evadere gli ordini entro i termini di consegna indicati e informare tempestivamente i clienti in caso di ritardo.\n• Rispettare i diritti di garanzia legali e concedere un diritto di recesso di 14 giorni.\n• Astenersi da accordi sui prezzi, manipolazione del mercato o concorrenza sleale.\n• Presentare le informazioni sui prodotti (EAN, titolo, descrizione, immagini) in modo veritiero e non ingannevole, e non modificare senza autorizzazione le schede di catalogo condivise.\n• Rispondere alle richieste dei clienti tramite i canali di comunicazione forniti dalla Piattaforma entro un termine ragionevole.`,
    },
    {
      heading: "Articolo 5 – Articoli vietati e soggetti a restrizioni",
      body: `Il Venditore non può offrire articoli che violino la normativa applicabile o la cui vendita tramite la Piattaforma sia espressamente esclusa, inclusi, a titolo esemplificativo e non esaustivo, prodotti di marca contraffatti, armi e oggetti assimilabili, farmaci soggetti a prescrizione senza autorizzazione adeguata, beni rubati, prodotti del tabacco e della nicotina senza verifica dell'età, e articoli che violino la normativa sul controllo delle esportazioni o sanzioni. La Piattaforma può pubblicare in Sellercentral un elenco aggiornato e non esaustivo delle categorie vietate e soggette a restrizioni, e modificarlo unilateralmente quando ciò sia richiesto per motivi normativi; le modifiche sostanziali sono comunicate ai sensi dell'articolo 18.`,
    },
    {
      heading: "Articolo 6 – Proprietà intellettuale e marchi",
      body: `Il Venditore garantisce di possedere, o di essere autorizzato a utilizzare, tutti i diritti necessari sui contenuti caricati (immagini dei prodotti, testi, marchi). L'utilizzo del marchio registrato di terzi è soggetto al processo separato di autorizzazione del marchio della Piattaforma (Sellercentral → Marchi); pubblicare un'inserzione con un marchio registrato senza autorizzazione comprovata è vietato e può essere rimosso senza preavviso. I titolari dei diritti possono segnalare presunte violazioni tramite il meccanismo di notifica e azione di cui all'articolo 12. Caricando i contenuti, il Venditore concede alla Piattaforma un diritto d'uso semplice, limitato alla durata del presente accordo, per mostrare tali contenuti sulla Piattaforma e nelle relative attività di marketing.`,
    },
    {
      heading: "Articolo 7 – Protezione dei dati (GDPR)",
      body: `Il Venditore tratta i dati personali dei clienti finali (nome, indirizzo, dati dell'ordine) esclusivamente ai fini dell'esecuzione del contratto (art. 6, par. 1, lett. b, GDPR) e solo nella misura necessaria per l'evasione dell'ordine in questione. È vietato il trasferimento a terzi senza base giuridica; in particolare non è consentito l'uso dei dati dei clienti a fini di marketing al di fuori della Piattaforma senza il consenso separato del cliente. Le richieste degli interessati (accesso, cancellazione, rettifica) devono ricevere risposta entro 30 giorni, e il Venditore deve assistere la Piattaforma nell'adempimento dei propri obblighi in materia di protezione dei dati. Ove necessario, verrà stipulato un accordo sul trattamento dei dati (DPA) ai sensi dell'art. 28 GDPR. Il Venditore adotta misure tecniche e organizzative adeguate (art. 32 GDPR) per proteggere i dati dei clienti a cui ha accesso.`,
    },
    {
      heading: "Articolo 8 – Elaborazione dei pagamenti e versamenti",
      body: `I pagamenti dei clienti finali vengono elaborati tramite il prestatore di servizi di pagamento utilizzato dalla Piattaforma. I versamenti al Venditore vengono effettuati dopo il completamento dell'ordine e la scadenza di eventuali termini di reso applicabili, secondo il calendario dei versamenti visibile in Sellercentral. La Piattaforma ha il diritto di trattenere temporaneamente importi in casi giustificati di storni, resi o sospetta frode, fino alla risoluzione della questione sottostante. Il Venditore è responsabile dell'esattezza dei dati bancari forniti; i ritardi causati da dati errati sono a suo carico.`,
    },
    {
      heading: "Articolo 9 – Commissioni, spese e prezzi",
      body: `La Piattaforma applica una commissione di transazione in base al listino prezzi vigente al momento della vendita, consultabile in Sellercentral. Le modifiche alla struttura delle commissioni sono comunicate al Venditore in anticipo ai sensi dell'articolo 18. Il Venditore determina autonomamente i prezzi di vendita delle proprie inserzioni; la Piattaforma non interviene su tali prezzi, salvo tramite le funzioni di sconto/campagna consentite e attivate dal Venditore. Il ritardo nel pagamento delle commissioni comporta interessi di mora legali; la Piattaforma può compensare le commissioni dovute con gli importi di versamento in sospeso.`,
    },
    {
      heading: "Articolo 10 – Obblighi fiscali",
      body: `Il Venditore è l'unico responsabile del corretto trattamento IVA delle proprie vendite, inclusi eventuali obblighi di registrazione nel regime dello sportello unico (OSS) o in singoli Stati membri dell'UE, nonché della corretta dichiarazione e versamento di tutte le imposte relative alle proprie vendite. Nella misura richiesta dalla legge, la Piattaforma può trasmettere i dati delle transazioni alle autorità fiscali competenti (ad esempio ai sensi dell'articolo 22f della legge tedesca sull'IVA o degli obblighi di comunicazione DAC7). Il Venditore fornisce alla Piattaforma la documentazione necessaria su richiesta.`,
    },
    {
      heading: "Articolo 11 – Posizionamento, visibilità e pubblicità (Regolamento P2B)",
      body: `Ai sensi dell'art. 5 del Regolamento (UE) 2019/1150, la Piattaforma comunica i principali parametri del proprio algoritmo di posizionamento: qualità del prodotto, recensioni dei clienti, tasso di evasione degli ordini, prezzi, aggiornamento del catalogo e conformità dell'account. Il Venditore può influenzare il posizionamento migliorando questi fattori. I posizionamenti pubblicitari a pagamento (ad esempio tramite la funzione marketing/campagne) sono contrassegnati separatamente come tali e non influiscono sul posizionamento organico delle altre inserzioni.`,
    },
    {
      heading: "Articolo 12 – Moderazione dei contenuti e meccanismo di notifica e azione (DSA)",
      body: `Ai sensi dell'art. 16 del DSA, la Piattaforma gestisce un meccanismo di notifica e azione tramite cui utenti, titolari di diritti e autorità possono segnalare inserzioni o contenuti presumibilmente illeciti. Le segnalazioni ricevute vengono esaminate tempestivamente; in caso di segnalazione fondata, la Piattaforma può rimuovere l'inserzione interessata, limitarne l'accesso o, in caso di violazioni gravi o ripetute, sospendere l'account del Venditore ai sensi dell'articolo 16. Il Venditore viene generalmente informato dei contenuti rimossi e gli viene data la possibilità di rispondere, salvo che ragioni legali o di sicurezza imperative lo impediscano (art. 17, 20 DSA). Segnalazioni ripetute e manifestamente infondate da parte di terzi possono essere respinte dalla Piattaforma.`,
    },
    {
      heading: "Articolo 13 – Responsabilità del marketplace nei confronti dei consumatori (P2B art. 6 bis)",
      body: `Prima dell'acquisto, la Piattaforma indica chiaramente ai clienti finali se un'inserzione proviene da un terzo commerciale, e specifica la conseguente ripartizione di diritti e obblighi (in particolare garanzia e recesso) tra il Venditore e la Piattaforma. Il Venditore si impegna a fornire tutte le informazioni necessarie per tale etichettatura in modo completo e veritiero, e riconosce che, fatte salve le eccezioni previste dal presente accordo, la responsabilità principale per l'esecuzione dei contratti di vendita ricade su di lui.`,
    },
    {
      heading: "Articolo 14 – Limitazione di responsabilità",
      body: `La Piattaforma non è responsabile per i danni derivanti da informazioni sui prodotti errate fornite dal Venditore, ritardi nella consegna, difetti del prodotto o altri inadempimenti del Venditore. La responsabilità della Piattaforma per danni indiretti e mancato guadagno è esclusa, salvo in caso di dolo, colpa grave o lesioni alla vita, al corpo o alla salute. La Piattaforma mira a un livello di disponibilità della propria infrastruttura tecnica commercialmente ragionevole; non è garantito alcun diritto a una disponibilità ininterrotta.`,
    },
    {
      heading: "Articolo 15 – Manleva e forza maggiore",
      body: `Il Venditore manleva la Piattaforma da qualsiasi pretesa di terzi derivante da una violazione colposa del presente accordo, della normativa applicabile o dei diritti di terzi da parte del Venditore, inclusi i ragionevoli costi di difesa legale. Nessuna delle parti è responsabile per l'inadempimento dei propri obblighi nella misura in cui tale inadempimento derivi da cause di forza maggiore (calamità naturali, provvedimenti delle autorità, interruzioni di rete su larga scala, ecc.) al di fuori del proprio ragionevole controllo; la parte interessata informa tempestivamente l'altra parte sulla natura e sulla durata prevista dell'evento.`,
    },
    {
      heading: "Articolo 16 – Sospensione, limitazione e cessazione dell'account",
      body: `La Piattaforma può sospendere, limitare o cessare l'account in caso di violazioni gravi o ripetute del presente accordo, contenuti illeciti o su ordine di un'autorità. Per quanto possibile e legalmente consentito, al Venditore viene data una ragionevole possibilità di replica prima della sospensione (art. 4 del Regolamento P2B). Il Venditore può cessare il proprio account in qualsiasi momento con un preavviso di 30 giorni. Gli ordini in corso devono essere debitamente evasi anche dopo la cessazione; i crediti di versamento già maturati restano impregiudicati, fatta salva l'eventuale trattenuta ai sensi dell'articolo 8.`,
    },
    {
      heading: "Articolo 17 – Cessione",
      body: `Il Venditore non può cedere diritti e obblighi derivanti dal presente accordo a terzi senza il previo consenso scritto della Piattaforma. La Piattaforma può cedere il presente accordo a una società collegata nell'ambito di una ristrutturazione, fusione o trasferimento d'azienda, a condizione che ciò non comporti un peggioramento sostanziale della posizione giuridica del Venditore.`,
    },
    {
      heading: "Articolo 18 – Modifiche al presente accordo",
      body: `Le modifiche al presente accordo vengono comunicate al Venditore per iscritto (e-mail o notifica in Sellercentral) almeno 15 giorni prima della loro entrata in vigore (art. 3 del Regolamento P2B), salvo quando sia necessario un termine più breve per obblighi di legge, per prevenire rischi imprevisti o a beneficio del Venditore. Se il Venditore non si oppone entro il termine e continua a utilizzare la Piattaforma, le modifiche si considerano accettate; in caso di opposizione, il Venditore può cessare il proprio account ai sensi dell'articolo 16.`,
    },
    {
      heading: "Articolo 19 – Risoluzione delle controversie",
      body: `Le controversie tra la Piattaforma e il Venditore vengono affrontate innanzitutto tramite il canale di assistenza interno. Ai sensi dell'art. 11 del Regolamento P2B, la Piattaforma designa info@andertal.com quale punto di contatto interno per i reclami. La piattaforma UE di risoluzione delle controversie online (https://ec.europa.eu/consumers/odr/) è disponibile per le controversie non risolte; per le controversie relative al Regolamento P2B è inoltre possibile ricorrere a un mediatore ai sensi dell'art. 12 del Regolamento P2B. Si applica il diritto tedesco, con esclusione della Convenzione delle Nazioni Unite sui contratti di vendita internazionale di merci; nella misura consentita dalla legge, il foro competente è Berlino.`,
    },
    {
      heading: "Articolo 20 – Disposizioni finali e contatti",
      body: `Qualora una disposizione risultasse invalida, le restanti disposizioni rimangono valide (clausola di salvaguardia); le parti si impegnano a sostituire la disposizione invalida con una disposizione valida che si avvicini il più possibile al suo scopo economico. Il presente accordo, unitamente alle politiche pubblicate in Sellercentral (inclusi gli articoli vietati e i requisiti di conformità), costituisce l'intero accordo tra le parti. Contatto: info@andertal.com. Ultimo aggiornamento: luglio 2026. Nota: questo testo è un modello contrattuale e non costituisce consulenza legale; non è ancora stato esaminato da un avvocato prima della sua entrata in vigore.`,
    },
  ],
};

function ContractModal({ locale, title, onClose, closeLabel }) {
  const sections = CONTRACT_SECTIONS[locale] || CONTRACT_SECTIONS.en;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      primaryAction={{ content: closeLabel, onAction: onClose }}
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
  const ui = getUI(locale);
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
        setError(t.invalidFormatError);
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
        <Text as="p" tone="subdued">{ui.loading}</Text>
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
                        {t.qrGenerating}
                      </Text>
                    </InlineStack>
                  ) : qrDataUrl ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {t.qrScanPrompt}
                      </Text>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <img src={qrDataUrl} alt="QR Code" style={{ width: 180, height: 180, border: "1px solid #e5e7eb", borderRadius: 8 }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                          <Spinner size="small" />
                          <Text as="p" variant="bodySm" tone="subdued">
                            {t.waitingSignature}
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
                        {t.agreementSigned(signatureAt)}
                      </Text>
                    </InlineStack>
                    <Button size="slim" onClick={downloadPdf} loading={pdfDownloading}>
                      {t.downloadSignedPdf}
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
              closeLabel={t.closeModal}
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
              title={t.creditCardTitle}
              subtitle={t.creditCardSubtitle}
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
