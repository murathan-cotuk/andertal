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
      accountHolder: "Hesap sahibinin adı",
      bic: "BIC / SWIFT",
      bicHelp: "İsteğe bağlı — çoğu SEPA ödemesi için gerekmez.",
      phone: "Telefon numarası",
      phoneCountry: "Ülke kodu",
      street: "Adres (sokak, bina no)",
      city: "Şehir",
      postalCode: "Posta kodu",
      country: "Ülke",
      lucidNumber: "LUCID Kayıt Numarası",
      lucidNumberHelp: "Almanya Ambalaj Kanunu (VerpackG) gereği zorunlu — örn. DE1234567890123 (Zentrale Stelle Verpackungsregister)",
      needLucid: "Almanya'da satış yapmak için LUCID ambalaj kayıt numaranızı girmelisiniz.",
      docTypes: {
        trade_register: "Ticaret sicil belgesi",
        id_passport: "Kimlik / Pasaport",
        tax_document: "Vergi levhası (opsiyonel)",
        epr_certificate: "EPR / LUCID Kayıt Belgesi",
      },
      docHints: {
        trade_register: "Ticaret sicil gazetesi veya ticaret odası faaliyet belgesi. Son 3 ay içinde alınmış olmalı. PDF tercih edilir.",
        id_passport: "Kimlik kartı veya pasaport ön yüz (kimlik için arka yüz de eklenebilir). PDF veya JPG formatında yükleyin.",
        tax_document: "Vergi levhası veya vergi beyan belgesi. PDF olarak yükleyin. Opsiyonel ama önerilir.",
        epr_certificate: "LUCID kaydınızın belgesi veya ekstresi (Zentrale Stelle Verpackungsregister). PDF formatında yükleyin.",
      },
      uploadBtn: "Dosya seç",
      uploaded: "Yüklendi",
      notUploaded: "Henüz yüklenmedi",
      required: "Zorunlu",
      optional: "Opsiyonel",
      submit: "Doğrulama için gönder",
      saving: "Kaydediliyor...",
      saveDraft: "Kaydet",
      savingDraft: "Kaydediliyor...",
      saveDraftOk: "İlerlemeniz kaydedildi. Daha sonra devam edebilirsiniz.",
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
      accountHolder: "Kontoinhaber",
      bic: "BIC / SWIFT",
      bicHelp: "Optional — für die meisten SEPA-Zahlungen nicht nötig.",
      phone: "Telefonnummer",
      phoneCountry: "Vorwahl",
      street: "Straße und Hausnummer",
      city: "Stadt",
      postalCode: "Postleitzahl",
      country: "Land",
      lucidNumber: "LUCID-Registrierungsnummer",
      lucidNumberHelp: "Pflichtfeld nach VerpackG — z.B. DE1234567890123 (Zentrale Stelle Verpackungsregister)",
      needLucid: "Bitte gib deine LUCID-Registrierungsnummer ein. Sie ist nach dem Verpackungsgesetz für den Verkauf auf deutschen Marktplätzen Pflicht.",
      docTypes: {
        trade_register: "Handelsregisterauszug",
        id_passport: "Ausweis / Reisepass",
        tax_document: "Steuerdokument (optional)",
        epr_certificate: "EPR / LUCID-Registrierungsnachweis",
      },
      docHints: {
        trade_register: "Offizieller Handelsregisterauszug (HRB/HRA), nicht älter als 3 Monate. PDF bevorzugt.",
        id_passport: "Vorder- und Rückseite des Personalausweises oder Reisepasses als PDF oder JPG.",
        tax_document: "Steuerbescheid oder Umsatzsteuervoranmeldung als PDF. Optional, aber empfohlen.",
        epr_certificate: "Registrierungsnachweis oder -auszug der Zentralen Stelle Verpackungsregister (LUCID) als PDF.",
      },
      uploadBtn: "Datei auswählen",
      uploaded: "Hochgeladen",
      notUploaded: "Noch nicht hochgeladen",
      required: "Pflichtfeld",
      optional: "Optional",
      submit: "Zur Verifizierung senden",
      saving: "Wird gespeichert...",
      saveDraft: "Speichern",
      savingDraft: "Wird gespeichert...",
      saveDraftOk: "Fortschritt gespeichert. Du kannst später weitermachen.",
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
      accountHolder: "Titulaire du compte",
      bic: "BIC / SWIFT",
      bicHelp: "Facultatif — pas nécessaire pour la plupart des paiements SEPA.",
      phone: "Numéro de téléphone",
      phoneCountry: "Indicatif",
      street: "Adresse (rue, numéro)",
      city: "Ville",
      postalCode: "Code postal",
      country: "Pays",
      lucidNumber: "Numéro d'enregistrement LUCID",
      lucidNumberHelp: "Obligatoire selon la loi allemande sur les emballages (VerpackG) — ex. DE1234567890123",
      needLucid: "Veuillez saisir votre numéro d'enregistrement LUCID pour vendre sur les marketplaces allemandes.",
      docTypes: {
        trade_register: "Extrait du registre du commerce",
        id_passport: "Carte d'identité / Passeport",
        tax_document: "Document fiscal (optionnel)",
        epr_certificate: "Attestation EPR / LUCID",
      },
      docHints: {
        trade_register: "Extrait Kbis ou équivalent, datant de moins de 3 mois. PDF de préférence.",
        id_passport: "Recto-verso de la carte d'identité ou passeport en PDF ou JPG.",
        tax_document: "Avis d'imposition ou déclaration de TVA en PDF. Optionnel mais recommandé.",
        epr_certificate: "Attestation ou extrait d'enregistrement LUCID (Zentrale Stelle Verpackungsregister) en PDF.",
      },
      uploadBtn: "Choisir un fichier",
      uploaded: "Téléchargé",
      notUploaded: "Pas encore téléchargé",
      required: "Obligatoire",
      optional: "Optionnel",
      submit: "Soumettre pour vérification",
      saving: "Enregistrement...",
      saveDraft: "Enregistrer",
      savingDraft: "Enregistrement...",
      saveDraftOk: "Progression enregistrée. Vous pouvez continuer plus tard.",
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
      accountHolder: "Titular de la cuenta",
      bic: "BIC / SWIFT",
      bicHelp: "Opcional — no necesario para la mayoría de pagos SEPA.",
      phone: "Número de teléfono",
      phoneCountry: "Prefijo",
      street: "Dirección (calle, número)",
      city: "Ciudad",
      postalCode: "Código postal",
      country: "País",
      lucidNumber: "Número de registro LUCID",
      lucidNumberHelp: "Obligatorio según la ley alemana de envases (VerpackG) — ej. DE1234567890123",
      needLucid: "Introduce tu número de registro LUCID para vender en marketplaces alemanes.",
      docTypes: {
        trade_register: "Extracto del registro mercantil",
        id_passport: "DNI / Pasaporte",
        tax_document: "Documento fiscal (opcional)",
        epr_certificate: "Certificado EPR / LUCID",
      },
      docHints: {
        trade_register: "Certificado de inscripción en el Registro Mercantil, no anterior a 3 meses. Se prefiere PDF.",
        id_passport: "Anverso y reverso del DNI o pasaporte en PDF o JPG.",
        tax_document: "Liquidación de IVA o resolución fiscal en PDF. Opcional pero recomendado.",
        epr_certificate: "Certificado o extracto de registro LUCID (Zentrale Stelle Verpackungsregister) en PDF.",
      },
      uploadBtn: "Seleccionar archivo",
      uploaded: "Cargado",
      notUploaded: "Aún no cargado",
      required: "Obligatorio",
      optional: "Opcional",
      submit: "Enviar para verificación",
      saving: "Guardando...",
      saveDraft: "Guardar",
      savingDraft: "Guardando...",
      saveDraftOk: "Progreso guardado. Puede continuar más tarde.",
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
      accountHolder: "Intestatario del conto",
      bic: "BIC / SWIFT",
      bicHelp: "Facoltativo — non necessario per la maggior parte dei pagamenti SEPA.",
      phone: "Numero di telefono",
      phoneCountry: "Prefisso",
      street: "Indirizzo (via, numero civico)",
      city: "Città",
      postalCode: "CAP",
      country: "Paese",
      lucidNumber: "Numero di registrazione LUCID",
      lucidNumberHelp: "Obbligatorio ai sensi della legge tedesca sugli imballaggi (VerpackG) — es. DE1234567890123",
      needLucid: "Inserisci il tuo numero di registrazione LUCID per vendere sui marketplace tedeschi.",
      docTypes: {
        trade_register: "Visura camerale",
        id_passport: "Carta d'identità / Passaporto",
        tax_document: "Documento fiscale (opzionale)",
        epr_certificate: "Attestato EPR / LUCID",
      },
      docHints: {
        trade_register: "Visura camerale aggiornata, non anteriore a 3 mesi. Si preferisce PDF.",
        id_passport: "Fronte e retro della carta d'identità o passaporto in PDF o JPG.",
        tax_document: "Dichiarazione IVA o certificato fiscale in PDF. Opzionale ma consigliato.",
        epr_certificate: "Attestato o estratto di registrazione LUCID (Zentrale Stelle Verpackungsregister) in PDF.",
      },
      uploadBtn: "Scegli file",
      uploaded: "Caricato",
      notUploaded: "Non ancora caricato",
      required: "Obbligatorio",
      optional: "Opzionale",
      submit: "Invia per la verifica",
      saving: "Salvataggio in corso...",
      saveDraft: "Salva",
      savingDraft: "Salvataggio in corso...",
      saveDraftOk: "Progresso salvato. Puoi continuare più tardi.",
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
    accountHolder: "Account holder name",
    bic: "BIC / SWIFT",
    bicHelp: "Optional — not needed for most SEPA payments.",
    phone: "Phone number",
    phoneCountry: "Country code",
    street: "Street address",
    city: "City",
    postalCode: "Postal code",
    country: "Country",
    lucidNumber: "LUCID Registration Number",
    lucidNumberHelp: "Required under German Packaging Act (VerpackG) — e.g. DE1234567890123 (Zentrale Stelle Verpackungsregister)",
    needLucid: "Please enter your LUCID registration number. It is required to sell on German marketplaces.",
    docTypes: {
      trade_register: "Trade register extract",
      id_passport: "ID / Passport",
      tax_document: "Tax document (optional)",
      epr_certificate: "EPR / LUCID Registration Certificate",
    },
    docHints: {
      trade_register: "Official trade register extract, not older than 3 months. PDF preferred.",
      id_passport: "Front and back of your ID card or passport as PDF or JPG.",
      tax_document: "Tax assessment or VAT return document as PDF. Optional but recommended.",
      epr_certificate: "Registration certificate or extract from the Zentrale Stelle Verpackungsregister (LUCID) as PDF.",
    },
    uploadBtn: "Choose file",
    uploaded: "Uploaded",
    notUploaded: "Not uploaded yet",
    required: "Required",
    optional: "Optional",
    submit: "Submit for verification",
    saving: "Saving...",
    saveDraft: "Save",
    savingDraft: "Saving...",
    saveDraftOk: "Progress saved. You can continue later.",
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

const DOC_TYPES = ["trade_register", "id_passport", "tax_document", "epr_certificate"];
const DOC_REQUIRED = { trade_register: true, id_passport: true, tax_document: false, epr_certificate: true };

function ContractModal({ locale, title, onClose, closeLabel }) {
  const [sections, setSections] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadingContract, setLoadingContract] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingContract(true);
    setLoadError("");
    fetch(`/api/seller-agreement?locale=${encodeURIComponent(locale || "de")}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSections(Array.isArray(data?.sections) ? data.sections : []);
        setMeta(data || null);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e?.message || "Failed to load agreement");
      })
      .finally(() => {
        if (!cancelled) setLoadingContract(false);
      });
    return () => { cancelled = true; };
  }, [locale]);

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
          {loadingContract ? (
            <Text as="p" variant="bodySm" tone="subdued">…</Text>
          ) : loadError ? (
            <Text as="p" variant="bodySm" tone="critical">{loadError}</Text>
          ) : (
            <BlockStack gap="400">
              {meta?.governing_note ? (
                <Text as="p" variant="bodySm" fontWeight="semibold">{meta.governing_note}</Text>
              ) : null}
              {meta?.version ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Version {meta.version}{meta.updated ? ` · ${meta.updated}` : ""}
                </Text>
              ) : null}
              {sections.map((sec) => (
                <BlockStack gap="100" key={sec.heading}>
                  <Text as="h3" variant="headingSm" fontWeight="bold">{sec.heading}</Text>
                  <div style={{ whiteSpace: "pre-line" }}>
                    <Text as="p" variant="bodySm" tone="subdued">{sec.body}</Text>
                  </div>
                </BlockStack>
              ))}
            </BlockStack>
          )}
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
  const [savingDraft, setSavingDraft] = useState(false);
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
    lucidNumber: "",
    iban: "",
    accountHolder: "",
    bic: "",
    phone: "",
    street: "",
    city: "",
    postalCode: "",
    country: "",
    docs: { trade_register: null, id_passport: null, tax_document: null, epr_certificate: null },
  });

  const snapshotFrom = useCallback((nextForm, nextAgreement, nextDialCode) => {
    return JSON.stringify({
      agreementAccepted: !!nextAgreement,
      phoneDialCode: nextDialCode || "+49",
      companyName: nextForm.companyName || "",
      authorizedPersonName: nextForm.authorizedPersonName || "",
      taxId: nextForm.taxId || "",
      vatId: nextForm.vatId || "",
      lucidNumber: nextForm.lucidNumber || "",
      iban: nextForm.iban || "",
      accountHolder: nextForm.accountHolder || "",
      bic: nextForm.bic || "",
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
        const docs = { trade_register: null, id_passport: null, tax_document: null, epr_certificate: null };
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
          lucidNumber: seller?.lucid_number || "",
          iban: seller?.iban || "",
          accountHolder: seller?.payment_account_holder || "",
          bic: seller?.payment_bic || "",
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

  // Saves whatever fields are currently filled in, with none of the "everything required"
  // checks below — a seller may want to fill this out over several sessions. It never calls
  // startVerification(), so the approval pipeline only actually starts via the separate
  // "Submit for verification" button once every required field is complete.
  const saveDraft = async () => {
    setError("");
    setSuccess("");
    setSavingDraft(true);
    try {
      const documents = DOC_TYPES.map((dt) => form.docs[dt]).filter(Boolean);
      const fullPhone = form.phone.trim() ? `${phoneDialCode}${form.phone.trim()}` : "";
      await client.updateSellerCompanyInfo({
        company_name: form.companyName.trim() || null,
        authorized_person_name: form.authorizedPersonName.trim() || null,
        tax_id: form.taxId.trim() || null,
        vat_id: form.vatId.trim() || null,
        lucid_number: form.lucidNumber.trim() || null,
        phone: fullPhone || null,
        business_address: {
          street: form.street.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        },
        documents,
        payment_account_holder: form.accountHolder.trim() || null,
        payment_bic: form.bic.replace(/\s/g, "").toUpperCase() || null,
      });
      await client.updateSellerIban(form.iban.trim() || null);
      setSuccess(t.saveDraftOk);
      setInitialSnapshot(snapshotFrom(form, agreementAccepted, phoneDialCode));
    } catch (e) {
      const rawMsg = String(e?.message || "");
      if (rawMsg.toLowerCase().includes("invalid input syntax for type json")) {
        setError(t.invalidFormatError);
      } else {
        setError(e?.message || "Save failed.");
      }
    } finally {
      setSavingDraft(false);
    }
  };

  const saveVerification = async () => {
    setError("");
    setSuccess("");
    if (!agreementAccepted) { setError(t.needAgreement); return; }
    if (!form.docs.trade_register || !form.docs.id_passport) { setError(t.needDocs); return; }
    if (!form.lucidNumber.trim()) { setError(t.needLucid); return; }
    setSaving(true);
    try {
      const documents = DOC_TYPES.map((dt) => form.docs[dt]).filter(Boolean);
      const fullPhone = form.phone.trim() ? `${phoneDialCode}${form.phone.trim()}` : "";
      await client.updateSellerCompanyInfo({
        company_name: form.companyName.trim() || null,
        authorized_person_name: form.authorizedPersonName.trim() || null,
        tax_id: form.taxId.trim() || null,
        vat_id: form.vatId.trim() || null,
        lucid_number: form.lucidNumber.trim() || null,
        phone: fullPhone || null,
        business_address: {
          street: form.street.trim() || null,
          city: form.city.trim() || null,
          postal_code: form.postalCode.trim() || null,
          country: form.country.trim() || null,
        },
        documents,
        payment_account_holder: form.accountHolder.trim() || null,
        payment_bic: form.bic.replace(/\s/g, "").toUpperCase() || null,
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
        lucidNumber: snap.lucidNumber || "",
        iban: snap.iban || "",
        accountHolder: snap.accountHolder || "",
        bic: snap.bic || "",
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
              <TextField
                label={t.lucidNumber}
                value={form.lucidNumber}
                onChange={(v) => setForm((p) => ({ ...p, lucidNumber: v }))}
                autoComplete="off"
                helpText={t.lucidNumberHelp}
                placeholder="DE1234567890123"
              />
              <TextField label={t.iban} value={form.iban} onChange={(v) => setForm((p) => ({ ...p, iban: v }))} autoComplete="off" />
              <TextField
                label={t.accountHolder}
                value={form.accountHolder}
                onChange={(v) => setForm((p) => ({ ...p, accountHolder: v }))}
                autoComplete="off"
              />
              <TextField
                label={t.bic}
                value={form.bic}
                onChange={(v) => setForm((p) => ({ ...p, bic: v.toUpperCase() }))}
                autoComplete="off"
                helpText={t.bicHelp}
                placeholder="COBADEFFXXX"
              />
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

          {/* Save (keeps whatever's filled so far) + Submit (requires everything) */}
          <InlineStack align="end" gap="200">
            <Button onClick={saveDraft} loading={savingDraft} disabled={saving}>
              {savingDraft ? t.savingDraft : t.saveDraft}
            </Button>
            <Button variant="primary" onClick={saveVerification} loading={saving} disabled={savingDraft}>
              {saving ? t.saving : t.submit}
            </Button>
          </InlineStack>
        </>
      )}
    </BlockStack>
  );
}
