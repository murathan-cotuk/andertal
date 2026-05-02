"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import FlowEmailBodyEditor from "@/components/content/FlowEmailBodyEditor";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, Button, Badge, BlockStack, InlineStack,
  Box, Spinner, Banner, Modal, TextField, Select, EmptyState, Divider, Collapsible, Checkbox,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const client = getMedusaAdminClient();

/** Locales stored per automation email step (must match backend FLOW_SAVE_LOCALES). */
const FLOW_TEMPLATE_LANGS = ["de", "en", "tr", "fr", "it", "es"];

function emptyLocaleBundle() {
  const o = {};
  for (const loc of FLOW_TEMPLATE_LANGS) o[loc] = { subject: "", body: "" };
  return o;
}

function normalizeSendEmailStep(step) {
  if (step.step_type !== "send_email") return step;
  const i18n = emptyLocaleBundle();
  const existing = step.email_i18n && typeof step.email_i18n === "object" ? step.email_i18n : {};
  for (const loc of FLOW_TEMPLATE_LANGS) {
    const b = existing[loc];
    i18n[loc] = {
      subject: String(b?.subject ?? "").trim(),
      body: String(b?.body ?? "").trim(),
    };
  }
  const fbS = String(step.email_subject || "").trim();
  const fbB = String(step.email_body || "").trim();
  if (fbS || fbB) {
    if (!i18n.de.subject && fbS) i18n.de.subject = fbS;
    if (!i18n.de.body && fbB) i18n.de.body = fbB;
  }
  const rawAtt = step.email_attachments;
  const email_attachments = Array.isArray(rawAtt)
    ? rawAtt.filter((k) => k === "invoice_pdf" || k === "lieferschein_pdf")
    : [];
  return {
    ...step,
    email_i18n: i18n,
    email_subject: i18n.de.subject || fbS,
    email_body: i18n.de.body || fbB,
    email_attachments,
    smtp_sender_id: step.smtp_sender_id || "",
  };
}

// ─── Translations ─────────────────────────────────────────────────────────────

const T = {
  en: {
    title: "Flows",
    subtitle: "Automated email campaigns triggered by customer events",
    createBtn: "Create flow",
    smtpWarningTitle: "Email server not configured",
    smtpWarningBody: "To send flow emails, you need to configure SMTP / Gmail settings first.",
    smtpWarningBodySeller: "Outgoing email must be configured by a platform superuser. Contact your administrator if flows cannot send mail.",
    smtpWarningAction: "Go to SMTP settings",
    emptyHeading: "No flows yet",
    emptyAction: "Create first flow",
    emptyBody: "Create automated email sequences triggered by customer events (abandoned cart, new order, new subscriber, etc.). Each flow can include delay steps and personalised email templates.",
    trigger: "Trigger",
    steps: "steps",
    sent: "sent",
    pause: "Pause",
    activate: "Activate",
    delete: "Delete",
    modalTitle: "New Flow",
    flowName: "Flow name",
    flowNamePlaceholder: "e.g. Abandoned Cart Series",
    triggerLabel: "Trigger",
    createConfirm: "Create",
    cancel: "Cancel",
    howTitle: "How do flows work?",
    howTrigger: "Trigger → Event that starts the flow.",
    howSteps: "Steps → Send email, wait (e.g. 2 days), check condition.",
    howEmail: "Email sending is configured via Settings > Apps & Integrations (SMTP).",
    howEmailSeller: "Outgoing email is configured by the platform superuser under Settings > Apps & Integrations (SMTP).",
    triggers: {
      new_subscriber: "New subscriber",
      abandoned_cart: "Abandoned cart",
      order_placed: "Order placed",
      order_shipped: "Order shipped (tracking)",
      order_delivered: "Order delivered",
      review_request: "Review request",
      win_back: "Win-back (inactive customer)",
    },
    audienceLabel: "Recipients",
    audienceCustomer: "Customers",
    audienceSeller: "Sellers",
    filterAll: "All",
    filterCustomer: "Customer flows",
    filterSeller: "Seller flows",
    templateLangLabel: "Template language",
    translateBtn: "Translate to other languages",
    translating: "Translating…",
    translateDeepLHelp: "Uses DeepL when DEEPL_AUTH_KEY is set on the server.",
    translateOk: "Translations copied into other template languages.",
    filterEmpty: "No flows match this filter.",
    statuses: { active: "Active", draft: "Draft", paused: "Paused" },
    editBtn: "Edit",
    editTitle: "Edit flow",
    saveBtn: "Save",
    stepsHeading: "Steps (after trigger)",
    addStepBtn: "Add step",
    removeStepBtn: "Remove",
    stepTypeLabel: "Step type",
    stepWaitOption: "Wait (hours)",
    stepEmailOption: "Send email",
    waitHoursHelp: "Pause this many hours before the next step.",
    emailSubjectLabel: "Email subject",
    emailSenderLabel: "Sender (From)",
    emailSenderDefaultOption: "Default — main sender",
    emailSenderMainTag: "main",
    emailBodyLabel: "Email body",
    emailSubjectPh: "e.g. Thanks for your order",
    emailBodyPh: "<p>Dear {FIRST_NAME},</p><p>Thanks for shopping <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Body is sent as HTML. Use Visual, HTML source, or Plain text — plain lines become paragraphs when saved.",
    emailBodyHelpText:
      "Plain text mode escapes markup and converts line breaks to HTML. Merge tokens like {FIRST_NAME} work in every mode.",
    emailTplLabel: "Starter template",
    emailTplAppend: "Append to body",
    emailTplGreeting: "Greeting + sign-off",
    emailTplOrder: "Order thank-you",
    emailTplCart: "Abandoned cart reminder",
    emailTplMinimal: "One-line summary only",
    emailBodyModeVisual: "Visual",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Plain text",
    placeholdersHelp:
      "Personalization: use merge tokens from the list below. Test emails use sample values unless you choose a customer.",
    mergeFieldsTitle: "Merge tokens for this step",
    mergeFieldsIntro:
      "Pick a token to append to the subject or HTML body, or copy it. Live sends use real data; tests use samples unless you pick a customer for test sends.",
    mergeFieldsSidebarTitle: "Merge field reference",
    mergeFieldsSidebarIntro: "Browse every supported token. Filtered tokens in the editor match this flow’s trigger.",
    mergeFieldsToggleShow: "Show list",
    mergeFieldsToggleHide: "Hide list",
    mergeFieldsSubject: "Subject",
    mergeFieldsBody: "Body",
    mergeFieldsCopy: "Copy",
    mergeFieldsCopied: "Copied",
    mergeFieldsLoading: "Loading tokens…",
    mergeFieldsErr: "Could not load the token list.",
    testEmailFieldLabel: "Send test emails to",
    testEmailFieldHelp: "Same address is used for every “Send test” below.",
    testCustomerLabel: "Preview placeholders as customer",
    testCustomerHelp:
      "Uses this customer’s profile (and latest order if any). Leave empty for sample data (e.g. Jane Doe). Gender affects {GREETING_DE}, {GREETING_EN}, …",
    testCustomerSampleOption: "Sample data (defaults)",
    emailAttachmentsLabel: "PDF attachments (this email step)",
    emailAttachmentsHelp:
      "Invoice / delivery note PDFs attach when an order exists (live sends). For tests, pick a customer who has an order.",
    attachInvoicePdf: "Invoice (Rechnung)",
    attachLieferscheinPdf: "Delivery note (Lieferschein)",
    testEmailBtn: "Send test email",
    testEmailNeedAddress: "Enter your email above to send a test.",
    testEmailNeedStep: "Add subject and HTML body first.",
    testEmailOk: "Test email sent.",
    testEmailSendFailed: "Test email could not be sent. Check SMTP settings or try again.",
    smtpRequiredForTest: "Configure SMTP first (Settings → Integrations).",
    loadFlowErr: "Could not load flow.",
    saveFlowErr: "Could not save flow.",
    flowSavedOk: "Flow saved.",
    flowStatusLabel: "Flow status",
    noStepsHint: "Add steps—for example wait one hour, then send an email.",
  },
  de: {
    title: "Flows",
    subtitle: "Automatische E-Mail-Kampagnen ausgelöst durch Kundenereignisse",
    createBtn: "Flow erstellen",
    smtpWarningTitle: "E-Mail-Server nicht konfiguriert",
    smtpWarningBody: "Um Flow-E-Mails zu senden, müssen zuerst die SMTP / Gmail-Einstellungen konfiguriert werden.",
    smtpWarningBodySeller: "Der ausgehende E-Mail-Versand muss von einem Plattform-Superuser eingerichtet werden. Bitte den Administrator kontaktieren.",
    smtpWarningAction: "Zu den SMTP-Einstellungen",
    emptyHeading: "Noch keine Flows",
    emptyAction: "Ersten Flow erstellen",
    emptyBody: "Erstelle automatische E-Mail-Sequenzen, die durch Kundenereignisse ausgelöst werden (verlassener Warenkorb, neue Bestellung, neuer Abonnent usw.). Jeder Flow kann Verzögerungsschritte und personalisierte E-Mail-Vorlagen enthalten.",
    trigger: "Auslöser",
    steps: "Schritte",
    sent: "versendet",
    pause: "Pausieren",
    activate: "Aktivieren",
    delete: "Löschen",
    modalTitle: "Neuer Flow",
    flowName: "Flow-Name",
    flowNamePlaceholder: "z. B. Verlassener-Warenkorb-Serie",
    triggerLabel: "Auslöser",
    createConfirm: "Erstellen",
    cancel: "Abbrechen",
    howTitle: "Wie funktionieren Flows?",
    howTrigger: "Auslöser → Ereignis, das den Flow startet.",
    howSteps: "Schritte → E-Mail senden, warten (z. B. 2 Tage), Bedingung prüfen.",
    howEmail: "E-Mail-Versand wird über Einstellungen > Apps & Integrationen (SMTP) konfiguriert.",
    howEmailSeller: "Der E-Mail-Versand wird vom Plattform-Superuser unter Einstellungen > Apps & Integrationen (SMTP) konfiguriert.",
    triggers: {
      new_subscriber: "Neuer Abonnent",
      abandoned_cart: "Verlassener Warenkorb",
      order_placed: "Bestellung aufgegeben",
      order_shipped: "Bestellung versendet (Tracking)",
      order_delivered: "Bestellung geliefert",
      review_request: "Bewertungsanfrage",
      win_back: "Rückgewinnung (inaktiver Kunde)",
    },
    audienceLabel: "Empfänger",
    audienceCustomer: "Kundinnen & Kunden",
    audienceSeller: "Seller",
    filterAll: "Alle",
    filterCustomer: "Kunden-Flows",
    filterSeller: "Seller-Flows",
    templateLangLabel: "Vorlagen-Sprache",
    translateBtn: "In andere Sprachen übersetzen",
    translating: "Übersetzen…",
    translateDeepLHelp: "Nutzt DeepL, wenn DEEPL_AUTH_KEY auf dem Server gesetzt ist.",
    translateOk: "Übersetzungen in die anderen Vorlagen-Sprachen übernommen.",
    filterEmpty: "Keine Flows für diesen Filter.",
    statuses: { active: "Aktiv", draft: "Entwurf", paused: "Pausiert" },
    editBtn: "Bearbeiten",
    editTitle: "Flow bearbeiten",
    saveBtn: "Speichern",
    stepsHeading: "Schritte (nach Auslöser)",
    addStepBtn: "Schritt hinzufügen",
    removeStepBtn: "Entfernen",
    stepTypeLabel: "Schritttyp",
    stepWaitOption: "Warten (Stunden)",
    stepEmailOption: "E-Mail senden",
    waitHoursHelp: "So viele Stunden warten, bevor der nächste Schritt ausgeführt wird.",
    emailSubjectLabel: "Betreff",
    emailSenderLabel: "Absender (Von)",
    emailSenderDefaultOption: "Standard — Haupt-Absender",
    emailSenderMainTag: "Haupt",
    emailBodyLabel: "E-Mail-Text",
    emailSubjectPh: "z. B. Danke für Ihre Bestellung",
    emailBodyPh: "<p>Hallo {FIRST_NAME},</p><p>vielen Dank für Ihren Einkauf: <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Versand als HTML: Visuell bearbeiten, HTML-Quelle oder Klartext — Zeilen werden als Absätze gespeichert.",
    emailBodyHelpText:
      "Klartext maskiert HTML-Zeichen und wandelt Zeilenumbrüche in HTML um. Platzhalter wie {FIRST_NAME} funktionieren überall.",
    emailTplLabel: "Vorlage",
    emailTplAppend: "An Text anhängen",
    emailTplGreeting: "Begrüßung + Grußformel",
    emailTplOrder: "Bestell-Dank",
    emailTplCart: "Warenkorb-Erinnerung",
    emailTplMinimal: "Nur Kurz-Zusammenfassung",
    emailBodyModeVisual: "Visuell",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Klartext",
    placeholdersHelp:
      "Personalisierung: Merge-Tokens aus der Liste unten verwenden. Tests nutzen Beispieldaten, außer Sie wählen einen Kunden.",
    mergeFieldsTitle: "Merge-Tokens für diesen Schritt",
    mergeFieldsIntro:
      "Token an Betreff oder HTML-Text anhängen oder kopieren. Live-Versand mit echten Daten; Tests mit Beispielen, außer beim Test einen Kunden wählen.",
    mergeFieldsSidebarTitle: "Alle Merge-Felder",
    mergeFieldsSidebarIntro: "Alle unterstützten Tokens. Im Editor werden sie nach Flow-Auslöser gefiltert.",
    mergeFieldsToggleShow: "Liste anzeigen",
    mergeFieldsToggleHide: "Liste ausblenden",
    mergeFieldsSubject: "Betreff",
    mergeFieldsBody: "Text",
    mergeFieldsCopy: "Kopieren",
    mergeFieldsCopied: "Kopiert",
    mergeFieldsLoading: "Tokens werden geladen…",
    mergeFieldsErr: "Token-Liste konnte nicht geladen werden.",
    testEmailFieldLabel: "Test-E-Mails senden an",
    testEmailFieldHelp: "Dieselbe Adresse für alle „Test senden“-Schaltflächen.",
    testCustomerLabel: "Platzhalter-Vorschau als Kunde",
    testCustomerHelp:
      "Nutzt Profildaten (und letzte Bestellung, falls vorhanden). Leer lassen für Beispieldaten (z. B. Jane Doe). Geschlecht steuert {GREETING_DE}, …",
    testCustomerSampleOption: "Beispieldaten (Standard)",
    emailAttachmentsLabel: "PDF-Anhänge (dieser E-Mail-Schritt)",
    emailAttachmentsHelp:
      "Rechnung / Lieferschein werden angehängt, wenn eine Bestellung existiert (Live). Test: Kunde mit Bestellung wählen.",
    attachInvoicePdf: "Rechnung (PDF)",
    attachLieferscheinPdf: "Lieferschein (PDF)",
    testEmailBtn: "Test-E-Mail senden",
    testEmailNeedAddress: "Bitte oben eine E-Mail-Adresse eingeben.",
    testEmailNeedStep: "Zuerst Betreff und HTML-Text ausfüllen.",
    testEmailOk: "Test-E-Mail wurde gesendet.",
    testEmailSendFailed: "Test-E-Mail konnte nicht gesendet werden. Bitte SMTP prüfen oder erneut versuchen.",
    smtpRequiredForTest: "Zuerst SMTP einrichten (Einstellungen → Integrationen).",
    noStepsHint: "Schritte hinzufügen—z. B. 1 Stunde warten, dann E-Mail senden.",
    loadFlowErr: "Flow konnte nicht geladen werden.",
    saveFlowErr: "Flow konnte nicht gespeichert werden.",
    flowSavedOk: "Flow gespeichert.",
    flowStatusLabel: "Flow-Status",
  },
  tr: {
    title: "Flows",
    subtitle: "Tetikleyici olaylara göre otomatik e-posta kampanyaları",
    createBtn: "Flow oluştur",
    smtpWarningTitle: "E-posta sunucusu yapılandırılmamış",
    smtpWarningBody: "Flow e-postalarının gönderilebilmesi için önce SMTP / Gmail ayarlarını yapmanız gerekiyor.",
    smtpWarningBodySeller: "Giden e-postayı yalnızca platform süper kullanıcısı yapılandırabilir. E-posta gönderilemiyorsa yöneticinize başvurun.",
    smtpWarningAction: "SMTP ayarlarına git",
    emptyHeading: "Henüz hiç flow yok",
    emptyAction: "İlk flow'u oluştur",
    emptyBody: "Müşteri olayları (terk edilen sepet, yeni sipariş, yeni abone vb.) ile tetiklenen otomatik e-posta dizileri oluşturun. Her flow; gecikme adımları ve kişiselleştirilmiş e-posta şablonları içerebilir.",
    trigger: "Tetikleyici",
    steps: "adım",
    sent: "gönderim",
    pause: "Duraklat",
    activate: "Etkinleştir",
    delete: "Sil",
    modalTitle: "Yeni Flow",
    flowName: "Flow adı",
    flowNamePlaceholder: "ör. Terk Edilen Sepet Serisi",
    triggerLabel: "Tetikleyici",
    createConfirm: "Oluştur",
    cancel: "İptal",
    howTitle: "Flows nasıl çalışır?",
    howTrigger: "Tetikleyici → Flow'u başlatan olay.",
    howSteps: "Adımlar → E-posta gönder, bekle (ör. 2 gün), koşul kontrol et.",
    howEmail: "E-posta gönderimi Ayarlar > Apps & Entegrasyonlar (SMTP) üzerinden yapılandırılır.",
    howEmailSeller: "Giden e-posta, süper kullanıcı tarafından Ayarlar > Apps & Entegrasyonlar (SMTP) üzerinden yapılandırılır.",
    triggers: {
      new_subscriber: "Yeni abone",
      abandoned_cart: "Terk edilen sepet",
      order_placed: "Sipariş oluşturuldu",
      order_shipped: "Sipariş kargoya verildi (takip)",
      order_delivered: "Sipariş teslim edildi",
      review_request: "Yorum isteği",
      win_back: "Pasif müşteri (win-back)",
    },
    audienceLabel: "Alıcılar",
    audienceCustomer: "Müşteriler",
    audienceSeller: "Satıcılar",
    filterAll: "Tümü",
    filterCustomer: "Müşteri akışları",
    filterSeller: "Satıcı akışları",
    templateLangLabel: "Şablon dili",
    translateBtn: "Diğer dillere çevir",
    translating: "Çevriliyor…",
    translateDeepLHelp: "Sunucuda DEEPL_AUTH_KEY tanımlıysa DeepL kullanılır.",
    translateOk: "Çeviriler diğer şablon dillere yazıldı.",
    filterEmpty: "Bu filtreye uyan akış yok.",
    statuses: { active: "Aktif", draft: "Taslak", paused: "Duraklatıldı" },
    editBtn: "Düzenle",
    editTitle: "Flow'u düzenle",
    saveBtn: "Kaydet",
    stepsHeading: "Adımlar (tetikleyiciden sonra)",
    addStepBtn: "Adım ekle",
    removeStepBtn: "Kaldır",
    stepTypeLabel: "Adım türü",
    stepWaitOption: "Bekle (saat)",
    stepEmailOption: "E-posta gönder",
    waitHoursHelp: "Sonraki adımdan önce beklenecek saat.",
    emailSubjectLabel: "E-posta konusu",
    emailSenderLabel: "Gönderen (Kimden)",
    emailSenderDefaultOption: "Varsayılan — ana gönderen",
    emailSenderMainTag: "ana",
    emailBodyLabel: "E-posta metni",
    emailSubjectPh: "ör. Siparişiniz için teşekkürler",
    emailBodyPh: "<p>Merhaba {FIRST_NAME},</p><p><strong>{PRODUCT}</strong> için alışverişinize teşekkürler.</p>",
    emailHtmlHelp: "HTML gönderilir: görsel düzenleyici, ham HTML veya düz metin — satırlar paragrafa dönüşür.",
    emailBodyHelpText:
      "Düz metin modunda özel karakterler kaçırılır; satır sonları HTML’e çevrilir. {FIRST_NAME} gibi alanlar her modda çalışır.",
    emailTplLabel: "Hazır şablon",
    emailTplAppend: "Metne ekle",
    emailTplGreeting: "Karşılama + kapanış",
    emailTplOrder: "Sipariş teşekkürü",
    emailTplCart: "Sepet hatırlatma",
    emailTplMinimal: "Tek satır özet",
    emailBodyModeVisual: "Görsel",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Düz metin",
    placeholdersHelp:
      "Kişiselleştirme: aşağıdaki listeden birleştirme alanlarını kullanın. Testte müşteri seçmezseniz örnek veriler kullanılır.",
    mergeFieldsTitle: "Bu adım için birleştirme alanları",
    mergeFieldsIntro:
      "Konuya veya HTML gövdesine ekle veya kopyala. Canlıda gerçek veri; testte müşteri seçilmezse örnek veri.",
    mergeFieldsSidebarTitle: "Tüm birleştirme alanları",
    mergeFieldsSidebarIntro: "Desteklenen tüm alanlar. Düzenleyicide liste bu akışın tetikleyicisine göre filtrelenir.",
    mergeFieldsToggleShow: "Listeyi göster",
    mergeFieldsToggleHide: "Listeyi gizle",
    mergeFieldsSubject: "Konu",
    mergeFieldsBody: "Gövde",
    mergeFieldsCopy: "Kopyala",
    mergeFieldsCopied: "Kopyalandı",
    mergeFieldsLoading: "Alanlar yükleniyor…",
    mergeFieldsErr: "Alan listesi yüklenemedi.",
    testEmailFieldLabel: "Test e-postası gönderilecek adres",
    testEmailFieldHelp: "Aşağıdaki tüm test gönderimleri bu adresi kullanır.",
    testCustomerLabel: "Önizleme için müşteri",
    testCustomerHelp:
      "Profil bilgisi ve varsa son sipariş kullanılır. Boş bırakırsanız örnek veri (Jane Doe vb.). Cinsiyet {GREETING_TR}, {GREETING_DE} vb. için kullanılır.",
    testCustomerSampleOption: "Örnek veri (varsayılan)",
    emailAttachmentsLabel: "PDF ekleri (bu e-posta adımı)",
    emailAttachmentsHelp:
      "Sipariş varsa fatura / irsaliye PDF eklenir (canlı). Test: siparişi olan müşteri seçin.",
    attachInvoicePdf: "Fatura (Rechnung)",
    attachLieferscheinPdf: "İrsaliye (Lieferschein)",
    testEmailBtn: "Test e-postası gönder",
    testEmailNeedAddress: "Önce yukarıya e-posta yazın.",
    testEmailNeedStep: "Önce konu ve HTML gövde ekleyin.",
    testEmailOk: "Test e-postası gönderildi.",
    testEmailSendFailed: "Test e-postası gönderilemedi. SMTP ayarlarını kontrol edin veya tekrar deneyin.",
    smtpRequiredForTest: "Önce SMTP yapılandırın (Ayarlar → Entegrasyonlar).",
    noStepsHint: "Adım ekleyin—ör. 1 saat bekleyin, sonra e-posta gönderin.",
    loadFlowErr: "Flow yüklenemedi.",
    saveFlowErr: "Flow kaydedilemedi.",
    flowSavedOk: "Flow kaydedildi.",
    flowStatusLabel: "Flow durumu",
  },
  fr: {
    title: "Flux",
    subtitle: "Campagnes e-mail automatiques déclenchées par des événements clients",
    createBtn: "Créer un flux",
    smtpWarningTitle: "Serveur e-mail non configuré",
    smtpWarningBody: "Pour envoyer des e-mails de flux, vous devez d'abord configurer les paramètres SMTP / Gmail.",
    smtpWarningBodySeller: "L'e-mail sortant doit être configuré par un super-utilisateur de la plateforme. Contactez votre administrateur.",
    smtpWarningAction: "Aller aux paramètres SMTP",
    emptyHeading: "Aucun flux pour l'instant",
    emptyAction: "Créer le premier flux",
    emptyBody: "Créez des séquences d'e-mails automatiques déclenchées par des événements clients (panier abandonné, nouvelle commande, nouvel abonné, etc.).",
    trigger: "Déclencheur",
    steps: "étapes",
    sent: "envoyés",
    pause: "Mettre en pause",
    activate: "Activer",
    delete: "Supprimer",
    modalTitle: "Nouveau Flux",
    flowName: "Nom du flux",
    flowNamePlaceholder: "ex. Série Panier Abandonné",
    triggerLabel: "Déclencheur",
    createConfirm: "Créer",
    cancel: "Annuler",
    howTitle: "Comment fonctionnent les flux?",
    howTrigger: "Déclencheur → Événement qui démarre le flux.",
    howSteps: "Étapes → Envoyer e-mail, attendre (ex. 2 jours), vérifier condition.",
    howEmail: "L'envoi d'e-mails est configuré via Paramètres > Apps & Intégrations (SMTP).",
    howEmailSeller: "L'e-mail sortant est configuré par le super-utilisateur via Paramètres > Apps & Intégrations (SMTP).",
    triggers: {
      new_subscriber: "Nouvel abonné",
      abandoned_cart: "Panier abandonné",
      order_placed: "Commande passée",
      order_shipped: "Commande expédiée (suivi)",
      order_delivered: "Commande livrée",
      review_request: "Demande d'avis",
      win_back: "Réactivation (client inactif)",
    },
    audienceLabel: "Destinataires",
    audienceCustomer: "Clients",
    audienceSeller: "Vendeurs",
    filterAll: "Tous",
    filterCustomer: "Flux clients",
    filterSeller: "Flux vendeurs",
    templateLangLabel: "Langue du modèle",
    translateBtn: "Traduire vers les autres langues",
    translating: "Traduction…",
    translateDeepLHelp: "Utilise DeepL si DEEPL_AUTH_KEY est défini sur le serveur.",
    translateOk: "Traductions copiées dans les autres langues du modèle.",
    filterEmpty: "Aucun flux ne correspond à ce filtre.",
    statuses: { active: "Actif", draft: "Brouillon", paused: "En pause" },
    editBtn: "Modifier",
    editTitle: "Modifier le flux",
    saveBtn: "Enregistrer",
    stepsHeading: "Étapes (après déclencheur)",
    addStepBtn: "Ajouter une étape",
    removeStepBtn: "Supprimer",
    stepTypeLabel: "Type d'étape",
    stepWaitOption: "Attendre (heures)",
    stepEmailOption: "Envoyer un e-mail",
    waitHoursHelp: "Heures d'attente avant l'étape suivante.",
    emailSubjectLabel: "Objet",
    emailSenderLabel: "Expéditeur (De)",
    emailSenderDefaultOption: "Par défaut — expéditeur principal",
    emailSenderMainTag: "principal",
    emailBodyLabel: "Corps",
    emailSubjectPh: "ex. Merci pour votre commande",
    emailBodyPh: "<p>Bonjour {FIRST_NAME},</p><p>Merci pour votre achat : <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "HTML : éditeur visuel, source ou texte brut — les lignes deviennent des paragraphes.",
    emailBodyHelpText:
      "Le mode texte échappe le HTML et convertit les sauts de ligne. Les jetons {FIRST_NAME} fonctionnent partout.",
    emailTplLabel: "Modèle de départ",
    emailTplAppend: "Ajouter au corps",
    emailTplGreeting: "Salutation + signature",
    emailTplOrder: "Remerciement commande",
    emailTplCart: "Relance panier",
    emailTplMinimal: "Résumé une ligne",
    emailBodyModeVisual: "Visuel",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Texte brut",
    placeholdersHelp:
      "Personnalisation : utilisez les jetons ci-dessous. Les tests utilisent des exemples sauf si vous choisissez un client.",
    mergeFieldsTitle: "Jetons pour cette étape",
    mergeFieldsIntro:
      "Ajoutez au sujet ou au corps HTML, ou copiez. Envoi réel : données réelles ; test : exemples sauf si un client est choisi.",
    mergeFieldsSidebarTitle: "Référence des champs",
    mergeFieldsSidebarIntro: "Tous les jetons pris en charge. L’éditeur filtre selon le déclencheur.",
    mergeFieldsToggleShow: "Afficher la liste",
    mergeFieldsToggleHide: "Masquer la liste",
    mergeFieldsSubject: "Objet",
    mergeFieldsBody: "Corps",
    mergeFieldsCopy: "Copier",
    mergeFieldsCopied: "Copié",
    mergeFieldsLoading: "Chargement…",
    mergeFieldsErr: "Impossible de charger la liste.",
    testEmailFieldLabel: "Envoyer les e-mails de test à",
    testEmailFieldHelp: "La même adresse pour chaque bouton « Envoyer un test ».",
    testCustomerLabel: "Aperçu des champs pour un client",
    testCustomerHelp:
      "Utilise le profil (et la dernière commande si disponible). Vide = données d’exemple. Le genre remplit {GREETING_DE}, {GREETING_EN}, …",
    testCustomerSampleOption: "Données d’exemple",
    emailAttachmentsLabel: "Pièces PDF (étape e-mail)",
    emailAttachmentsHelp:
      "Facture / bon de livraison si une commande existe (envoi réel). Test : client avec commande.",
    attachInvoicePdf: "Facture (Rechnung)",
    attachLieferscheinPdf: "Bon de livraison (Lieferschein)",
    testEmailBtn: "Envoyer un e-mail de test",
    testEmailNeedAddress: "Indiquez votre e-mail ci-dessus.",
    testEmailNeedStep: "Renseignez d'abord l'objet et le corps HTML.",
    testEmailOk: "E-mail de test envoyé.",
    testEmailSendFailed: "Impossible d’envoyer l’e-mail de test. Vérifiez SMTP ou réessayez.",
    smtpRequiredForTest: "Configurez d'abord SMTP (Paramètres → Intégrations).",
    noStepsHint: "Ajoutez des étapes — ex. attendre 1 heure puis envoyer un e-mail.",
    loadFlowErr: "Impossible de charger le flux.",
    saveFlowErr: "Impossible d'enregistrer le flux.",
    flowSavedOk: "Flux enregistré.",
    flowStatusLabel: "Statut du flux",
  },
  it: {
    title: "Flussi",
    subtitle: "Campagne e-mail automatiche attivate da eventi dei clienti",
    createBtn: "Crea flusso",
    smtpWarningTitle: "Server e-mail non configurato",
    smtpWarningBody: "Per inviare e-mail di flusso, è necessario prima configurare le impostazioni SMTP / Gmail.",
    smtpWarningBodySeller: "L'e-mail in uscita deve essere configurata da un superuser della piattaforma. Contatta l'amministratore.",
    smtpWarningAction: "Vai alle impostazioni SMTP",
    emptyHeading: "Nessun flusso ancora",
    emptyAction: "Crea il primo flusso",
    emptyBody: "Crea sequenze di e-mail automatiche attivate da eventi dei clienti (carrello abbandonato, nuovo ordine, nuovo iscritto, ecc.).",
    trigger: "Trigger",
    steps: "passi",
    sent: "inviati",
    pause: "Metti in pausa",
    activate: "Attiva",
    delete: "Elimina",
    modalTitle: "Nuovo Flusso",
    flowName: "Nome del flusso",
    flowNamePlaceholder: "es. Serie Carrello Abbandonato",
    triggerLabel: "Trigger",
    createConfirm: "Crea",
    cancel: "Annulla",
    howTitle: "Come funzionano i flussi?",
    howTrigger: "Trigger → Evento che avvia il flusso.",
    howSteps: "Passi → Invia e-mail, aspetta (es. 2 giorni), controlla condizione.",
    howEmail: "L'invio di e-mail è configurato tramite Impostazioni > App e Integrazioni (SMTP).",
    howEmailSeller: "L'e-mail in uscita è configurata dal superuser in Impostazioni > App e Integrazioni (SMTP).",
    triggers: {
      new_subscriber: "Nuovo iscritto",
      abandoned_cart: "Carrello abbandonato",
      order_placed: "Ordine effettuato",
      order_shipped: "Ordine spedito (tracking)",
      order_delivered: "Ordine consegnato",
      review_request: "Richiesta recensione",
      win_back: "Riattivazione (cliente inattivo)",
    },
    audienceLabel: "Destinatari",
    audienceCustomer: "Clienti",
    audienceSeller: "Seller",
    filterAll: "Tutti",
    filterCustomer: "Flussi clienti",
    filterSeller: "Flussi seller",
    templateLangLabel: "Lingua modello",
    translateBtn: "Traduci nelle altre lingue",
    translating: "Traduzione…",
    translateDeepLHelp: "Usa DeepL se DEEPL_AUTH_KEY è impostato sul server.",
    translateOk: "Traduzioni copiate nelle altre lingue del modello.",
    filterEmpty: "Nessun flusso corrisponde al filtro.",
    statuses: { active: "Attivo", draft: "Bozza", paused: "In pausa" },
    editBtn: "Modifica",
    editTitle: "Modifica flusso",
    saveBtn: "Salva",
    stepsHeading: "Passi (dopo il trigger)",
    addStepBtn: "Aggiungi passo",
    removeStepBtn: "Rimuovi",
    stepTypeLabel: "Tipo di passo",
    stepWaitOption: "Attendi (ore)",
    stepEmailOption: "Invia e-mail",
    waitHoursHelp: "Ore di attesa prima del passo successivo.",
    emailSubjectLabel: "Oggetto",
    emailSenderLabel: "Mittente (Da)",
    emailSenderDefaultOption: "Predefinito — mittente principale",
    emailSenderMainTag: "principale",
    emailBodyLabel: "Corpo",
    emailSubjectPh: "es. Grazie per il tuo ordine",
    emailBodyPh: "<p>Ciao {FIRST_NAME},</p><p>Grazie per aver acquistato <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "HTML: editor visuale, sorgente o testo semplice — le righe diventano paragrafi.",
    emailBodyHelpText:
      "La modalità testo escapa i tag e converte i newline. I token {FIRST_NAME} funzionano ovunque.",
    emailTplLabel: "Modello iniziale",
    emailTplAppend: "Aggiungi al corpo",
    emailTplGreeting: "Saluto + chiusura",
    emailTplOrder: "Ringraziamento ordine",
    emailTplCart: "Promemoria carrello",
    emailTplMinimal: "Solo riepilogo breve",
    emailBodyModeVisual: "Visuale",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Testo",
    placeholdersHelp:
      "Segnaposto (dati di esempio nei test): {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}. Scegli un cliente sotto per dati reali.",
    testEmailFieldLabel: "Invia e-mail di test a",
    testEmailFieldHelp: "Lo stesso indirizzo per ogni pulsante « Invia test ».",
    testCustomerLabel: "Anteprima come cliente",
    testCustomerHelp:
      "Usa profilo e ultimo ordine se presente. Vuoto = dati di esempio. Il genere influenza {GREETING_DE}, {GREETING_EN}, …",
    testCustomerSampleOption: "Dati di esempio",
    emailAttachmentsLabel: "Allegati PDF (passaggio e-mail)",
    emailAttachmentsHelp:
      "Fattura / bolla di accompagnamento se esiste un ordine (invio reale). Test: cliente con ordine.",
    attachInvoicePdf: "Fattura (Rechnung)",
    attachLieferscheinPdf: "Documento di trasporto (Lieferschein)",
    testEmailBtn: "Invia e-mail di test",
    testEmailNeedAddress: "Inserisci sopra un indirizzo e-mail.",
    testEmailNeedStep: "Compila prima oggetto e corpo HTML.",
    testEmailOk: "E-mail di test inviata.",
    testEmailSendFailed: "Impossibile inviare l’e-mail di test. Controlla SMTP o riprova.",
    smtpRequiredForTest: "Configura prima SMTP (Impostazioni → Integrazioni).",
    noStepsHint: "Aggiungi passi — es. attendi 1 ora poi invia un'e-mail.",
    loadFlowErr: "Impossibile caricare il flusso.",
    saveFlowErr: "Impossibile salvare il flusso.",
    flowSavedOk: "Flusso salvato.",
    flowStatusLabel: "Stato flusso",
  },
  es: {
    title: "Flujos",
    subtitle: "Campañas de correo automáticas activadas por eventos de clientes",
    createBtn: "Crear flujo",
    smtpWarningTitle: "Servidor de correo no configurado",
    smtpWarningBody: "Para enviar correos de flujo, primero debes configurar los ajustes SMTP / Gmail.",
    smtpWarningBodySeller: "El correo saliente debe configurarlo un superusuario de la plataforma. Contacta al administrador.",
    smtpWarningAction: "Ir a ajustes SMTP",
    emptyHeading: "Aún no hay flujos",
    emptyAction: "Crear primer flujo",
    emptyBody: "Crea secuencias de correo automáticas activadas por eventos de clientes (carrito abandonado, nuevo pedido, nuevo suscriptor, etc.).",
    trigger: "Disparador",
    steps: "pasos",
    sent: "enviados",
    pause: "Pausar",
    activate: "Activar",
    delete: "Eliminar",
    modalTitle: "Nuevo Flujo",
    flowName: "Nombre del flujo",
    flowNamePlaceholder: "ej. Serie Carrito Abandonado",
    triggerLabel: "Disparador",
    createConfirm: "Crear",
    cancel: "Cancelar",
    howTitle: "¿Cómo funcionan los flujos?",
    howTrigger: "Disparador → Evento que inicia el flujo.",
    howSteps: "Pasos → Enviar correo, esperar (ej. 2 días), verificar condición.",
    howEmail: "El envío de correos se configura en Ajustes > Apps e Integraciones (SMTP).",
    howEmailSeller: "El correo saliente lo configura el superusuario en Ajustes > Apps e Integraciones (SMTP).",
    triggers: {
      new_subscriber: "Nuevo suscriptor",
      abandoned_cart: "Carrito abandonado",
      order_placed: "Pedido realizado",
      order_shipped: "Pedido enviado (seguimiento)",
      order_delivered: "Pedido entregado",
      review_request: "Solicitud de reseña",
      win_back: "Reactivación (cliente inactivo)",
    },
    audienceLabel: "Destinatarios",
    audienceCustomer: "Clientes",
    audienceSeller: "Vendedores",
    filterAll: "Todos",
    filterCustomer: "Flujos cliente",
    filterSeller: "Flujos vendedor",
    templateLangLabel: "Idioma de plantilla",
    translateBtn: "Traducir a otros idiomas",
    translating: "Traduciendo…",
    translateDeepLHelp: "Usa DeepL si DEEPL_AUTH_KEY está definido en el servidor.",
    translateOk: "Traducciones copiadas al resto de idiomas de la plantilla.",
    filterEmpty: "Ningún flujo coincide con este filtro.",
    statuses: { active: "Activo", draft: "Borrador", paused: "En pausa" },
    editBtn: "Editar",
    editTitle: "Editar flujo",
    saveBtn: "Guardar",
    stepsHeading: "Pasos (tras el disparador)",
    addStepBtn: "Añadir paso",
    removeStepBtn: "Quitar",
    stepTypeLabel: "Tipo de paso",
    stepWaitOption: "Esperar (horas)",
    stepEmailOption: "Enviar correo",
    waitHoursHelp: "Horas de espera antes del siguiente paso.",
    emailSubjectLabel: "Asunto",
    emailSenderLabel: "Remitente (De)",
    emailSenderDefaultOption: "Predeterminado — remitente principal",
    emailSenderMainTag: "principal",
    emailBodyLabel: "Cuerpo",
    emailSubjectPh: "ej. Gracias por tu pedido",
    emailBodyPh: "<p>Hola {FIRST_NAME},</p><p>Gracias por comprar <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "HTML: editor visual, código o texto plano — las líneas pasan a párrafos.",
    emailBodyHelpText:
      "El modo texto escapa HTML y convierte saltos de línea. Los marcadores {FIRST_NAME} funcionan en todos.",
    emailTplLabel: "Plantilla inicial",
    emailTplAppend: "Añadir al cuerpo",
    emailTplGreeting: "Saludo + despedida",
    emailTplOrder: "Agradecimiento pedido",
    emailTplCart: "Recordatorio carrito",
    emailTplMinimal: "Solo resumen breve",
    emailBodyModeVisual: "Visual",
    emailBodyModeHtml: "HTML",
    emailBodyModeText: "Texto",
    placeholdersHelp:
      "Personalización: usa los tokens de la lista. Las pruebas usan datos de ejemplo salvo que elijas un cliente.",
    mergeFieldsTitle: "Tokens para este paso",
    mergeFieldsIntro:
      "Añade al asunto o al cuerpo HTML, o copia. Envío real con datos reales; pruebas con ejemplos salvo que elijas un cliente.",
    mergeFieldsSidebarTitle: "Referencia de campos",
    mergeFieldsSidebarIntro: "Todos los tokens admitidos. El editor filtra por disparador.",
    mergeFieldsToggleShow: "Mostrar lista",
    mergeFieldsToggleHide: "Ocultar lista",
    mergeFieldsSubject: "Asunto",
    mergeFieldsBody: "Cuerpo",
    mergeFieldsCopy: "Copiar",
    mergeFieldsCopied: "Copiado",
    mergeFieldsLoading: "Cargando…",
    mergeFieldsErr: "No se pudo cargar la lista.",
    testEmailFieldLabel: "Enviar correos de prueba a",
    testEmailFieldHelp: "La misma dirección para cada « Enviar prueba ».",
    testCustomerLabel: "Vista previa como cliente",
    testCustomerHelp:
      "Usa el perfil (y el último pedido si existe). Vacío = datos de ejemplo. El género afecta a {GREETING_DE}, {GREETING_EN}, …",
    testCustomerSampleOption: "Datos de ejemplo",
    emailAttachmentsLabel: "Adjuntos PDF (paso de correo)",
    emailAttachmentsHelp:
      "Factura / albarán si hay pedido (envío real). Prueba: cliente con pedido.",
    attachInvoicePdf: "Factura (Rechnung)",
    attachLieferscheinPdf: "Albarán (Lieferschein)",
    testEmailBtn: "Enviar correo de prueba",
    testEmailNeedAddress: "Escribe tu correo arriba.",
    testEmailNeedStep: "Completa primero asunto y cuerpo HTML.",
    testEmailOk: "Correo de prueba enviado.",
    testEmailSendFailed: "No se pudo enviar el correo de prueba. Revisa SMTP o inténtalo de nuevo.",
    smtpRequiredForTest: "Configura SMTP primero (Ajustes → Integraciones).",
    noStepsHint: "Añade pasos — ej. esperar 1 hora y enviar un correo.",
    loadFlowErr: "No se pudo cargar el flujo.",
    saveFlowErr: "No se pudo guardar el flujo.",
    flowSavedOk: "Flujo guardado.",
    flowStatusLabel: "Estado del flujo",
  },
};

const MERGE_CATEGORY_ORDER = ["customer", "order", "shipping", "product_cart", "shop", "engagement"];

function groupMergeCatalogFields(catalog) {
  if (!catalog?.fields?.length) return [];
  const map = new Map();
  for (const f of catalog.fields) {
    const cat = f.category || "other";
    if (!map.has(cat)) {
      map.set(cat, {
        category: cat,
        label: catalog.categories?.[cat] || cat,
        items: [],
      });
    }
    map.get(cat).items.push(f);
  }
  return MERGE_CATEGORY_ORDER.filter((k) => map.has(k)).map((k) => map.get(k));
}

function FlowMergeFieldsPanel({ t, catalog, loading, errorText, stepIdx, onAppendSubject, onAppendBody }) {
  const [copiedTok, setCopiedTok] = useState(null);
  const grouped = useMemo(() => groupMergeCatalogFields(catalog), [catalog]);

  const copyToken = (token) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopiedTok(token);
      setTimeout(() => setCopiedTok(null), 1600);
    }).catch(() => {});
  };

  if (loading) {
    return <Text as="p" variant="bodySm" tone="subdued">{t.mergeFieldsLoading}</Text>;
  }
  if (!catalog?.fields?.length) {
    return errorText ? (
      <Text as="p" variant="bodySm" tone="critical">{errorText}</Text>
    ) : null;
  }

  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm" tone="subdued">{catalog.syntax}</Text>
      <Text as="p" variant="bodySm" tone="subdued">{t.mergeFieldsIntro}</Text>
      {grouped.map((grp) => (
        <BlockStack key={grp.category} gap="150">
          <Text as="h4" variant="headingXs">{grp.label}</Text>
          <BlockStack gap="100">
            {grp.items.map((f) => (
              <Box
                key={f.key}
                paddingBlockEnd="200"
                borderBlockEndWidth="025"
                borderColor="border-secondary"
              >
                <BlockStack gap="100">
                  <InlineStack align="space-between" blockAlign="start" wrap>
                    <BlockStack gap="050">
                      <code
                        style={{
                          fontSize: 12,
                          background: "#f3f4f6",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {f.token}
                      </code>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {f.description}
                        {f.sample ? ` · ${f.sample}` : ""}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="100" blockAlign="center" wrap>
                      {stepIdx != null && onAppendSubject && onAppendBody && (
                        <>
                          <Button size="slim" onClick={() => onAppendSubject(f.token)}>{t.mergeFieldsSubject}</Button>
                          <Button size="slim" onClick={() => onAppendBody(f.token)}>{t.mergeFieldsBody}</Button>
                        </>
                      )}
                      <Button size="slim" variant="plain" onClick={() => copyToken(f.token)}>
                        {copiedTok === f.token ? t.mergeFieldsCopied : t.mergeFieldsCopy}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      ))}
    </BlockStack>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const locale = useLocale();
  const t = T[locale] || T.en;

  const allTriggerOptions = useMemo(
    () => Object.entries(t.triggers).map(([value, label]) => ({ label, value })),
    [t],
  );
  const sellerTriggerValues = useMemo(() => new Set(["order_placed", "order_shipped", "order_delivered"]), []);

  const [newAudience, setNewAudience] = useState("customer");
  const [editAudience, setEditAudience] = useState("customer");
  const [flowAudienceFilter, setFlowAudienceFilter] = useState("all");
  const [stepTemplateLang, setStepTemplateLang] = useState({});
  const [translateBusyIdx, setTranslateBusyIdx] = useState(null);

  const triggerOptionsForCreate = useMemo(() => {
    if (newAudience === "seller") return allTriggerOptions.filter((o) => sellerTriggerValues.has(o.value));
    return allTriggerOptions;
  }, [allTriggerOptions, newAudience, sellerTriggerValues]);

  const triggerOptionsForEdit = useMemo(() => {
    if (editAudience === "seller") return allTriggerOptions.filter((o) => sellerTriggerValues.has(o.value));
    return allTriggerOptions;
  }, [allTriggerOptions, editAudience, sellerTriggerValues]);

  const statusEditOptions = [
    { label: t.statuses.draft, value: "draft" },
    { label: t.statuses.active, value: "active" },
    { label: t.statuses.paused, value: "paused" },
  ];
  const stepTypeOptions = [
    { label: t.stepWaitOption, value: "wait_hours" },
    { label: t.stepEmailOption, value: "send_email" },
  ];

  const audienceSelectOptions = useMemo(
    () => [
      { label: t.audienceCustomer, value: "customer" },
      { label: t.audienceSeller, value: "seller" },
    ],
    [t.audienceCustomer, t.audienceSeller],
  );

  const templateLangSelectOptions = useMemo(
    () => FLOW_TEMPLATE_LANGS.map((lo) => ({ label: lo.toUpperCase(), value: lo })),
    [],
  );

  const [testFlowCustomerId, setTestFlowCustomerId] = useState("");
  const [testFlowCustomers, setTestFlowCustomers] = useState([]);
  const [testFlowCustomersLoading, setTestFlowCustomersLoading] = useState(false);

  const testCustomerSelectOptions = useMemo(() => {
    const base = [{ label: t.testCustomerSampleOption, value: "" }];
    const rows = (testFlowCustomers || []).map((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      const label = name ? `${c.email} — ${name}` : String(c.email || c.id || "");
      return { label, value: c.id };
    });
    return [...base, ...rows];
  }, [testFlowCustomers, t.testCustomerSampleOption]);

  const flowEmailTemplates = useMemo(
    () => [
      {
        id: "greeting",
        label: t.emailTplGreeting,
        html: `<p>Hallo {FIRST_NAME},</p>\n<p>&nbsp;</p>\n<p>Viele Grüße<br/>{STORE_NAME}</p>`,
      },
      {
        id: "order",
        label: t.emailTplOrder,
        html: `<p>Hallo {FIRST_NAME},</p>\n<p>vielen Dank für Ihre Bestellung <strong>#{ORDER_NUMBER}</strong>.</p>\n<p>Gesamt: {ORDER_TOTAL}</p>\n<p>&nbsp;</p>\n<p>{STORE_NAME}</p>`,
      },
      {
        id: "cart",
        label: t.emailTplCart,
        html: `<p>Hallo {FIRST_NAME},</p>\n<p>Sie haben noch Artikel im Warenkorb — z.&nbsp;B. <strong>{PRODUCT_NAME}</strong>.</p>\n<p><a href="{CART_URL}">Zum Warenkorb</a></p>\n<p>{STORE_NAME}</p>`,
      },
      {
        id: "minimal",
        label: t.emailTplMinimal,
        html: `<p>{LINE_ITEMS_SUMMARY}</p>`,
      },
    ],
    [t.emailTplGreeting, t.emailTplOrder, t.emailTplCart, t.emailTplMinimal],
  );

  const [flows, setFlows]               = useState([]);

  const filteredFlows = useMemo(() => {
    if (flowAudienceFilter === "customer") {
      return flows.filter((f) => (f.audience || "customer") === "customer");
    }
    if (flowAudienceFilter === "seller") {
      return flows.filter((f) => String(f.audience || "") === "seller");
    }
    return flows;
  }, [flows, flowAudienceFilter]);

  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [togglingId, setTogglingId]     = useState("");
  const [createOpen, setCreateOpen]     = useState(false);
  const [newName, setNewName]           = useState("");
  const [newTrigger, setNewTrigger]     = useState("abandoned_cart");
  const [newNameErr, setNewNameErr]     = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState(null);
  const [smtpSenders, setSmtpSenders] = useState([]);
  const [isSuperuser, setIsSuperuser] = useState(false);

  const [editOpen, setEditOpen]         = useState(false);
  const [editLoading, setEditLoading]   = useState(false);
  const [editSaving, setEditSaving]     = useState(false);
  const [editErr, setEditErr]           = useState("");
  const [editingFlowId, setEditingFlowId] = useState("");
  const [editName, setEditName]         = useState("");
  const [editTrigger, setEditTrigger]   = useState("abandoned_cart");
  const [editStatus, setEditStatus]     = useState("draft");
  const [editSteps, setEditSteps]       = useState([]);
  const [pageMergeCatalog, setPageMergeCatalog] = useState(null);
  const [pageMergeLoading, setPageMergeLoading] = useState(true);
  const [pageMergeErr, setPageMergeErr] = useState("");
  const [sidebarMergeOpen, setSidebarMergeOpen] = useState(false);
  const [editStepMergeOpen, setEditStepMergeOpen] = useState({});
  const [editMergeCatalog, setEditMergeCatalog] = useState(null);
  const [editMergeLoading, setEditMergeLoading] = useState(false);
  const [editMergeErr, setEditMergeErr] = useState("");
  const [testFlowEmailTo, setTestFlowEmailTo] = useState("");
  const [flowTestBanner, setFlowTestBanner]   = useState(null);
  const [flowTestToast, setFlowTestToast]     = useState(null);
  const [testSendingStepIdx, setTestSendingStepIdx] = useState(null);
  const flowEmailBodyRefs = useRef({});
  const flowTestBannerRef = useRef(null);
  const flowTestToastTimerRef = useRef(null);

  const senderSelectOptions = useMemo(() => {
    const opts = [{ label: t.emailSenderDefaultOption, value: "" }];
    for (const s of smtpSenders || []) {
      const name = String(s.from_name || "").trim();
      const email = String(s.from_email || "").trim();
      const main = s.is_default ? ` (${t.emailSenderMainTag})` : "";
      const label = name ? `${name} <${email}>${main}` : `${email}${main}`;
      opts.push({ label, value: String(s.id) });
    }
    return opts;
  }, [smtpSenders, t.emailSenderDefaultOption, t.emailSenderMainTag]);

  const showFlowTestFeedback = useCallback((tone, message) => {
    setFlowTestBanner({ tone, message });
    setFlowTestToast({ tone, message });
    if (flowTestToastTimerRef.current) clearTimeout(flowTestToastTimerRef.current);
    flowTestToastTimerRef.current = setTimeout(() => setFlowTestToast(null), 8000);
  }, []);

  useEffect(() => {
    return () => {
      if (flowTestToastTimerRef.current) clearTimeout(flowTestToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!flowTestBanner?.message) return;
    queueMicrotask(() => {
      flowTestBannerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
  }, [flowTestBanner]);

  useEffect(() => {
    if (!editOpen) return;
    client.getSmtpSettings().then((v) => {
      const ok = !!(v?.smtp_configured === true || v?.smtp?.host || v?.smtp?.smtp_host);
      setSmtpConfigured(ok);
      setSmtpSenders(Array.isArray(v?.senders) ? v.senders : []);
    }).catch(() => {
      setSmtpConfigured(null);
      setSmtpSenders([]);
    });
  }, [editOpen]);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPageMergeLoading(true);
    setPageMergeErr("");
    client
      .getFlowEmailMergeFields(locale, "")
      .then((data) => {
        if (!cancelled) setPageMergeCatalog(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setPageMergeCatalog(null);
          setPageMergeErr(typeof e?.message === "string" ? e.message : "merge-fields-error");
        }
      })
      .finally(() => {
        if (!cancelled) setPageMergeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (!editOpen) {
      setEditMergeCatalog(null);
      setEditMergeErr("");
      return;
    }
    let cancelled = false;
    setEditMergeLoading(true);
    setEditMergeErr("");
    client
      .getFlowEmailMergeFields(locale, editTrigger)
      .then((data) => {
        if (!cancelled) setEditMergeCatalog(data);
      })
      .catch(() => {
        if (!cancelled) {
          setEditMergeCatalog(null);
          setEditMergeErr("merge-fields-error");
        }
      })
      .finally(() => {
        if (!cancelled) setEditMergeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editOpen, locale, editTrigger]);

  useEffect(() => {
    if (!editOpen || editAudience !== "customer") return;
    let cancelled = false;
    setTestFlowCustomersLoading(true);
    client
      .getCustomers({ search: "", limit: 100 })
      .then((data) => {
        if (!cancelled) setTestFlowCustomers(data?.customers || []);
      })
      .catch(() => {
        if (!cancelled) setTestFlowCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setTestFlowCustomersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editOpen, editAudience]);

  useEffect(() => {
    if (editAudience !== "customer") setTestFlowCustomerId("");
  }, [editAudience]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flowsRes, smtpRes] = await Promise.allSettled([
        client.getFlows(),
        client.getSmtpSettings?.() ?? Promise.resolve(null),
      ]);
      if (flowsRes.status === "fulfilled") {
        setFlows(flowsRes.value?.flows ?? []);
      } else {
        const msg = flowsRes.reason?.message || "Flows unavailable";
        setFlows([]);
        setError(msg);
      }
      if (smtpRes.status === "fulfilled" && smtpRes.value) {
        const v = smtpRes.value;
        setSmtpConfigured(!!(
          v.smtp_configured === true
          || v.smtp?.host
          || v.smtp?.smtp_host
        ));
      } else if (smtpRes.status === "fulfilled") {
        setSmtpConfigured(false);
      } else {
        setSmtpConfigured(null);
      }
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setNewNameErr(t.flowName);
      return;
    }
    setSaving(true);
    try {
      const res = await client.createFlow({ name, trigger: newTrigger, status: "draft", audience: newAudience });
      const flow = res?.flow;
      if (flow) setFlows((prev) => [...prev, { ...flow, step_count: flow.step_count ?? 0 }]);
      setCreateOpen(false);
      setNewName("");
      setNewTrigger(newAudience === "seller" ? "order_placed" : "abandoned_cart");
      setNewAudience("customer");
      setNewNameErr("");
    } catch (e) {
      setNewNameErr(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (flow) => {
    setEditErr("");
    setFlowTestBanner(null);
    setFlowTestToast(null);
    setTestSendingStepIdx(null);
    setStepTemplateLang({});
    setEditStepMergeOpen({});
    setTestFlowCustomerId("");
    setEditingFlowId(flow.id);
    setEditLoading(true);
    setEditOpen(true);
    try {
      const d = await client.getFlow(flow.id);
      const f = d?.flow;
      setEditName(f?.name || "");
      setEditAudience(String(f?.audience || "customer") === "seller" ? "seller" : "customer");
      setEditTrigger(f?.trigger || "abandoned_cart");
      setEditStatus(f?.status || "draft");
      setEditSteps(
        (d?.steps || []).map((s) => {
          const base = {
            id: s.id,
            step_type: s.step_type === "send_email" ? "send_email" : "wait_hours",
            wait_hours: s.wait_hours != null ? Number(s.wait_hours) : 1,
            email_subject: s.email_subject || "",
            email_body: s.email_body || "",
            email_i18n: s.email_i18n || null,
            email_attachments: Array.isArray(s.email_attachments) ? s.email_attachments : [],
            smtp_sender_id: s.smtp_sender_id || "",
          };
          return base.step_type === "send_email" ? normalizeSendEmailStep(base) : base;
        }),
      );
    } catch (e) {
      setEditErr(e?.message || t.loadFlowErr);
      setEditSteps([]);
    } finally {
      setEditLoading(false);
    }
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditErr("");
    setEditingFlowId("");
    setEditSteps([]);
    setTestFlowEmailTo("");
    setFlowTestBanner(null);
    setFlowTestToast(null);
    setTestSendingStepIdx(null);
    flowEmailBodyRefs.current = {};
    setStepTemplateLang({});
    setEditStepMergeOpen({});
    setTestFlowCustomerId("");
    setTranslateBusyIdx(null);
  };

  const sendTestFlowEmail = async (stepIdx) => {
    const to = testFlowEmailTo.trim();
    if (!editingFlowId) return;
    if (!to) {
      showFlowTestFeedback("critical", t.testEmailNeedAddress);
      return;
    }
    if (smtpConfigured === false) {
      showFlowTestFeedback("critical", t.smtpRequiredForTest);
      return;
    }
    const step = editSteps[stepIdx];
    if (!step || step.step_type !== "send_email") {
      showFlowTestFeedback("critical", t.testEmailNeedStep);
      return;
    }

    const lang = stepTemplateLang[stepIdx] || "de";
    const flushFn = flowEmailBodyRefs.current[stepIdx]?.flushEmailBody;
    let htmlBody = String(step.email_i18n?.[lang]?.body ?? step.email_body ?? "").trim();
    if (typeof flushFn === "function") {
      try {
        const flushed = flushFn();
        if (typeof flushed === "string") htmlBody = flushed.trim();
      } catch (_) {}
    }

    const subj = String(step.email_i18n?.[lang]?.subject ?? step.email_subject ?? "").trim();
    if (!subj || !htmlBody) {
      showFlowTestFeedback("critical", t.testEmailNeedStep);
      return;
    }

    setTestSendingStepIdx(stepIdx);
    setFlowTestBanner(null);
    setFlowTestToast(null);
    try {
      const payload = {
        to,
        email_subject: subj,
        email_body: htmlBody,
      };
      const senderSel = String(step.smtp_sender_id || "").trim();
      if (senderSel) payload.smtp_sender_id = senderSel;
      if (editAudience === "customer" && testFlowCustomerId) {
        payload.customer_id = testFlowCustomerId;
      }
      const att = step.email_attachments;
      if (
        editAudience === "customer"
        && testFlowCustomerId
        && Array.isArray(att)
        && att.length
      ) {
        payload.attachments = att.filter((k) => k === "invoice_pdf" || k === "lieferschein_pdf");
      }
      await client.sendFlowTestEmail(editingFlowId, payload);
      showFlowTestFeedback("success", t.testEmailOk);
    } catch (e) {
      showFlowTestFeedback("critical", e?.message || t.testEmailSendFailed || "Error");
    } finally {
      setTestSendingStepIdx(null);
    }
  };

  useEffect(() => {
    if (newAudience === "seller" && !sellerTriggerValues.has(newTrigger)) {
      setNewTrigger("order_placed");
    }
  }, [newAudience, newTrigger, sellerTriggerValues]);

  useEffect(() => {
    if (editAudience === "seller" && !sellerTriggerValues.has(editTrigger)) {
      setEditTrigger("order_placed");
    }
  }, [editAudience, editTrigger, sellerTriggerValues]);

  const patchEditStep = (idx, patch) => {
    setEditSteps((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (patch.step_type === "wait_hours") {
          next.email_subject = "";
          next.email_body = "";
          next.email_i18n = undefined;
          next.smtp_sender_id = "";
          if (next.wait_hours == null || Number.isNaN(Number(next.wait_hours))) next.wait_hours = 1;
        }
        if (patch.step_type === "send_email") {
          next.wait_hours = 0;
          return normalizeSendEmailStep(next);
        }
        return next;
      }),
    );
  };

  const appendToStepEmail = useCallback((stepIdx, part, token) => {
    const lang = stepTemplateLang[stepIdx] || "de";
    setEditSteps((prev) =>
      prev.map((row, i) => {
        if (i !== stepIdx || row.step_type !== "send_email") return row;
        const base = row.email_i18n && typeof row.email_i18n === "object" ? row.email_i18n : emptyLocaleBundle();
        const i18n = { ...base };
        const cur = { ...(i18n[lang] || { subject: "", body: "" }) };
        if (part === "subject") cur.subject = String(cur.subject || "") + token;
        else cur.body = String(cur.body || "") + token;
        i18n[lang] = cur;
        const next = { ...row, email_i18n: i18n };
        if (lang === "de") {
          next.email_subject = cur.subject;
          next.email_body = cur.body;
        }
        return next;
      }),
    );
  }, [stepTemplateLang]);

  const patchStepEmailI18n = useCallback((idx, lang, part, value) => {
    setEditSteps((prev) =>
      prev.map((row, i) => {
        if (i !== idx || row.step_type !== "send_email") return row;
        const i18n = { ...(row.email_i18n || emptyLocaleBundle()) };
        const cur = { ...(i18n[lang] || { subject: "", body: "" }) };
        if (part === "subject") cur.subject = value;
        else cur.body = value;
        i18n[lang] = cur;
        const next = { ...row, email_i18n: i18n };
        if (lang === "de") {
          next.email_subject = cur.subject;
          next.email_body = cur.body;
        }
        return next;
      }),
    );
  }, []);

  const addEditStep = () => {
    setEditSteps((prev) => [
      ...prev,
      { step_type: "wait_hours", wait_hours: 1, email_subject: "", email_body: "" },
    ]);
  };

  const removeEditStep = (idx) => {
    setEditSteps((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      setStepTemplateLang((langPrev) => {
        const nextLang = {};
        prev.forEach((_, oldIdx) => {
          if (oldIdx === idx) return;
          const ni = oldIdx < idx ? oldIdx : oldIdx - 1;
          if (langPrev[oldIdx] != null) nextLang[ni] = langPrev[oldIdx];
        });
        return nextLang;
      });
      setEditStepMergeOpen((mergePrev) => {
        const nextMerge = {};
        Object.keys(mergePrev).forEach((k) => {
          const oldIdx = Number(k);
          if (Number.isNaN(oldIdx)) return;
          if (oldIdx === idx) return;
          const ni = oldIdx < idx ? oldIdx : oldIdx - 1;
          if (mergePrev[oldIdx]) nextMerge[ni] = true;
        });
        return nextMerge;
      });
      return filtered;
    });
  };

  const translateStepLocales = async (idx) => {
    const lang = stepTemplateLang[idx] || "de";
    const step = editSteps[idx];
    if (!step || step.step_type !== "send_email") return;
    const bundle = step.email_i18n?.[lang];
    const subject = String(bundle?.subject ?? "").trim();
    const html = String(bundle?.body ?? "").trim();
    if (!subject || !html) {
      showFlowTestFeedback("critical", t.testEmailNeedStep);
      return;
    }
    setTranslateBusyIdx(idx);
    try {
      const r = await client.translateFlowEmail({
        source_locale: lang,
        target_locales: FLOW_TEMPLATE_LANGS.filter((l) => l !== lang),
        subject,
        html,
      });
      const trans = r?.translations || {};
      setEditSteps((prev) =>
        prev.map((row, i) => {
          if (i !== idx || row.step_type !== "send_email") return row;
          const i18n = { ...(row.email_i18n || emptyLocaleBundle()) };
          for (const lo of Object.keys(trans)) {
            const b = trans[lo];
            if (b?.subject && b?.body) i18n[lo] = { subject: String(b.subject), body: String(b.body) };
          }
          const next = { ...row, email_i18n: i18n };
          next.email_subject = String(i18n.de?.subject || row.email_subject || "");
          next.email_body = String(i18n.de?.body || row.email_body || "");
          return next;
        }),
      );
      showFlowTestFeedback("success", t.translateOk);
    } catch (e) {
      showFlowTestFeedback("critical", e?.message || t.translateDeepLHelp);
    } finally {
      setTranslateBusyIdx(null);
    }
  };

  const saveEditModal = async () => {
    const name = editName.trim();
    if (!name) {
      setEditErr(t.flowName);
      return;
    }
    setEditSaving(true);
    setEditErr("");
    try {
      const stepsPayload = editSteps.map((s, idx) => {
        if (s.step_type === "wait_hours") {
          return { step_type: "wait_hours", wait_hours: Math.max(0, parseInt(s.wait_hours, 10) || 0) };
        }
        const lang = stepTemplateLang[idx] || "de";
        let email_body = String(s.email_i18n?.[lang]?.body ?? s.email_body ?? "").trim();
        const flushFn = flowEmailBodyRefs.current[idx]?.flushEmailBody;
        if (typeof flushFn === "function") {
          try {
            const flushed = flushFn();
            if (typeof flushed === "string") email_body = flushed.trim();
          } catch (_) {}
        }
        const email_subject = String(s.email_i18n?.[lang]?.subject ?? s.email_subject ?? "").trim();
        const i18n = { ...(s.email_i18n || emptyLocaleBundle()) };
        i18n[lang] = { subject: email_subject, body: email_body };
        const deS = String(i18n.de?.subject || "").trim();
        const deB = String(i18n.de?.body || "").trim();
        const att = Array.isArray(s.email_attachments)
          ? s.email_attachments.filter((k) => k === "invoice_pdf" || k === "lieferschein_pdf")
          : [];
        const sid = String(s.smtp_sender_id || "").trim();
        return {
          step_type: "send_email",
          email_subject: deS || email_subject,
          email_body: deB || email_body,
          email_i18n: i18n,
          email_attachments: att,
          smtp_sender_id: sid || null,
        };
      });
      const res = await client.updateFlow(editingFlowId, {
        name,
        trigger: editTrigger,
        status: editStatus,
        audience: editAudience,
        steps: stepsPayload,
      });
      const f = res?.flow;
      const sc = res?.steps?.length ?? f?.step_count ?? editSteps.length;
      setFlows((prev) =>
        prev.map((row) =>
          row.id === editingFlowId ? { ...row, ...f, step_count: sc } : row,
        ),
      );
      if (Array.isArray(res?.steps)) {
        setEditSteps(
          res.steps.map((s) => {
            const row = {
              id: s.id,
              step_type: s.step_type === "send_email" ? "send_email" : "wait_hours",
              wait_hours: s.wait_hours != null ? Number(s.wait_hours) : 1,
              email_subject: s.email_subject || "",
              email_body: s.email_body || "",
              email_i18n: s.email_i18n || null,
              email_attachments: Array.isArray(s.email_attachments) ? s.email_attachments : [],
              smtp_sender_id: s.smtp_sender_id || "",
            };
            return row.step_type === "send_email" ? normalizeSendEmailStep(row) : row;
          }),
        );
      }
      showFlowTestFeedback("success", t.flowSavedOk);
    } catch (e) {
      setEditErr(e?.message || t.saveFlowErr);
    } finally {
      setEditSaving(false);
    }
  };

  const toggleStatus = async (flow) => {
    setTogglingId(flow.id);
    const nextStatus = flow.status === "active" ? "paused" : "active";
    try {
      await client.updateFlow(flow.id, { status: nextStatus });
      setFlows((prev) => prev.map((f) => f.id === flow.id ? { ...f, status: nextStatus } : f));
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setTogglingId("");
    }
  };

  const deleteFlow = async (id) => {
    setTogglingId(id);
    try {
      await client.deleteFlow(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      setError(e?.message || "Error");
    } finally {
      setTogglingId("");
    }
  };

  const statusBadgeTone = { active: "success", draft: "info", paused: "warning" };

  return (
    <Page
      title={t.title}
      subtitle={t.subtitle}
      primaryAction={{
        content: t.createBtn,
        onAction: () => {
          setNewName("");
          setNewTrigger("abandoned_cart");
          setNewAudience("customer");
          setNewNameErr("");
          setCreateOpen(true);
        },
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>
          </Layout.Section>
        )}

        {smtpConfigured === false && (
          <Layout.Section>
            <Banner
              tone="warning"
              title={t.smtpWarningTitle}
              action={
                isSuperuser
                  ? { content: t.smtpWarningAction, url: "/settings/integrations" }
                  : undefined
              }
            >
              {isSuperuser ? t.smtpWarningBody : t.smtpWarningBodySeller}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {loading ? (
            <Card><Box padding="600"><InlineStack align="center"><Spinner /></InlineStack></Box></Card>
          ) : flows.length === 0 ? (
            <Card>
              <EmptyState
                heading={t.emptyHeading}
                action={{ content: t.emptyAction, onAction: () => setCreateOpen(true) }}
                image=""
              >
                <p>{t.emptyBody}</p>
              </EmptyState>
            </Card>
          ) : (
            <BlockStack gap="300">
              <InlineStack gap="200" wrap>
                <Button size="slim" pressed={flowAudienceFilter === "all"} onClick={() => setFlowAudienceFilter("all")}>
                  {t.filterAll}
                </Button>
                <Button size="slim" pressed={flowAudienceFilter === "customer"} onClick={() => setFlowAudienceFilter("customer")}>
                  {t.filterCustomer}
                </Button>
                <Button size="slim" pressed={flowAudienceFilter === "seller"} onClick={() => setFlowAudienceFilter("seller")}>
                  {t.filterSeller}
                </Button>
              </InlineStack>
              {filteredFlows.length === 0 ? (
                <Card>
                  <Box padding="400">
                    <Text as="p" variant="bodyMd" tone="subdued">{t.filterEmpty}</Text>
                  </Box>
                </Card>
              ) : filteredFlows.map((flow) => {
                const statusLabel = t.statuses[flow.status] ?? flow.status;
                const badgeTone   = statusBadgeTone[flow.status] ?? "default";
                const isToggling  = togglingId === flow.id;
                const audSeller = String(flow.audience || "") === "seller";
                return (
                  <Card key={flow.id}>
                    <InlineStack align="space-between" blockAlign="center" wrap={false}>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Text as="h2" variant="headingSm">{flow.name}</Text>
                          <Badge tone={badgeTone}>{statusLabel}</Badge>
                          <Badge tone={audSeller ? "attention" : "info"}>{audSeller ? t.audienceSeller : t.audienceCustomer}</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {t.trigger}: {t.triggers[flow.trigger] ?? flow.trigger}
                          {flow.step_count != null && <> · {flow.step_count} {t.steps}</>}
                          {flow.sent_count != null && <> · {flow.sent_count.toLocaleString()} {t.sent}</>}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200" wrap={false}>
                        <Button size="slim" disabled={isToggling} onClick={() => openEditModal(flow)}>
                          {t.editBtn}
                        </Button>
                        <Button
                          size="slim"
                          variant={flow.status === "active" ? "secondary" : "primary"}
                          loading={isToggling}
                          onClick={() => toggleStatus(flow)}
                        >
                          {flow.status === "active" ? t.pause : t.activate}
                        </Button>
                        <Button size="slim" tone="critical" variant="plain" disabled={isToggling} onClick={() => deleteFlow(flow.id)}>
                          {t.delete}
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="300">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">{t.howTitle}</Text>
                <Divider />
                <Text as="p" variant="bodySm" tone="subdued">{t.howTrigger}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{t.howSteps}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{isSuperuser ? t.howEmail : t.howEmailSeller}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <Text as="h2" variant="headingSm">{t.mergeFieldsSidebarTitle}</Text>
                  <Button size="slim" variant="plain" onClick={() => setSidebarMergeOpen((o) => !o)}>
                    {sidebarMergeOpen ? t.mergeFieldsToggleHide : t.mergeFieldsToggleShow}
                  </Button>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">{t.mergeFieldsSidebarIntro}</Text>
                {!sidebarMergeOpen && pageMergeCatalog?.syntax && (
                  <Text as="p" variant="bodySm" tone="subdued">{pageMergeCatalog.syntax}</Text>
                )}
                <Collapsible id="flow-merge-fields-sidebar" open={sidebarMergeOpen} transition={{ duration: "200ms", timingFunction: "ease-in-out" }}>
                  <Box maxHeight="380px" overflowY="auto">
                    <FlowMergeFieldsPanel
                      t={t}
                      catalog={pageMergeCatalog}
                      loading={pageMergeLoading}
                      errorText={pageMergeErr === "merge-fields-error" ? t.mergeFieldsErr : pageMergeErr}
                      stepIdx={null}
                    />
                  </Box>
                </Collapsible>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.modalTitle}
        primaryAction={{ content: t.createConfirm, onAction: handleCreate, loading: saving }}
        secondaryActions={[{ content: t.cancel, onAction: () => setCreateOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label={t.flowName}
              value={newName}
              onChange={(v) => { setNewName(v); setNewNameErr(""); }}
              placeholder={t.flowNamePlaceholder}
              error={newNameErr}
              autoComplete="off"
            />
            <Select
              label={t.audienceLabel}
              options={audienceSelectOptions}
              value={newAudience}
              onChange={setNewAudience}
            />
            <Select
              label={t.triggerLabel}
              options={triggerOptionsForCreate}
              value={newTrigger}
              onChange={setNewTrigger}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEditModal}
        title={t.editTitle}
        large
        primaryAction={{ content: t.saveBtn, onAction: saveEditModal, loading: editSaving, disabled: editLoading }}
        secondaryActions={[{ content: t.cancel, onAction: closeEditModal }]}
      >
        <Modal.Section>
          {editLoading ? (
            <Box padding="400"><InlineStack align="center"><Spinner /></InlineStack></Box>
          ) : (
            <BlockStack gap="400">
              {editErr && <Banner tone="critical" onDismiss={() => setEditErr("")}>{editErr}</Banner>}
              {flowTestBanner && (
                <div ref={flowTestBannerRef}>
                  <Banner tone={flowTestBanner.tone} onDismiss={() => setFlowTestBanner(null)}>
                    {flowTestBanner.message}
                  </Banner>
                </div>
              )}
              <TextField label={t.flowName} value={editName} onChange={setEditName} autoComplete="off" />
              <Select
                label={t.audienceLabel}
                options={audienceSelectOptions}
                value={editAudience}
                onChange={setEditAudience}
              />
              <Select label={t.triggerLabel} options={triggerOptionsForEdit} value={editTrigger} onChange={setEditTrigger} />
              <Select label={t.flowStatusLabel} options={statusEditOptions} value={editStatus} onChange={setEditStatus} />
              <Divider />
              <Text as="h3" variant="headingSm">{t.stepsHeading}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{t.noStepsHint}</Text>
              <TextField
                label={t.testEmailFieldLabel}
                type="email"
                value={testFlowEmailTo}
                onChange={setTestFlowEmailTo}
                helpText={t.testEmailFieldHelp}
                autoComplete="email"
              />
              {editAudience === "customer" && (
                <Select
                  label={t.testCustomerLabel}
                  options={testCustomerSelectOptions}
                  value={testFlowCustomerId}
                  onChange={setTestFlowCustomerId}
                  disabled={testFlowCustomersLoading}
                  helpText={t.testCustomerHelp}
                />
              )}
              <Button onClick={addEditStep}>{t.addStepBtn}</Button>
              <BlockStack gap="300">
                {editSteps.map((step, idx) => (
                  <Card key={idx}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <Box minWidth="200px">
                          <Select
                            label={t.stepTypeLabel}
                            options={stepTypeOptions}
                            value={step.step_type}
                            onChange={(v) => patchEditStep(idx, { step_type: v })}
                          />
                        </Box>
                        <Button tone="critical" variant="plain" size="slim" onClick={() => removeEditStep(idx)}>
                          {t.removeStepBtn}
                        </Button>
                      </InlineStack>
                      {step.step_type === "wait_hours" ? (
                        <TextField
                          label={t.stepWaitOption}
                          type="number"
                          min={0}
                          value={String(step.wait_hours ?? 0)}
                          onChange={(v) => patchEditStep(idx, { wait_hours: Math.max(0, parseInt(v, 10) || 0) })}
                          helpText={t.waitHoursHelp}
                          autoComplete="off"
                        />
                      ) : (
                        <BlockStack gap="200">
                          {(() => {
                            const lang = stepTemplateLang[idx] || "de";
                            const bundle = step.email_i18n?.[lang] || { subject: "", body: "" };
                            return (
                              <>
                          <Select
                            label={t.templateLangLabel}
                            options={templateLangSelectOptions}
                            value={lang}
                            onChange={(v) => setStepTemplateLang((p) => ({ ...p, [idx]: v }))}
                          />
                          <Select
                            label={t.emailSenderLabel}
                            options={senderSelectOptions}
                            value={step.smtp_sender_id ? String(step.smtp_sender_id) : ""}
                            onChange={(v) => patchEditStep(idx, { smtp_sender_id: v })}
                            disabled={isSuperuser === false && senderSelectOptions.length <= 1}
                          />
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Button
                              size="slim"
                              loading={translateBusyIdx === idx}
                              disabled={translateBusyIdx !== null}
                              onClick={() => translateStepLocales(idx)}
                            >
                              {translateBusyIdx === idx ? t.translating : t.translateBtn}
                            </Button>
                            <Text as="span" variant="bodySm" tone="subdued">{t.translateDeepLHelp}</Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">{t.emailHtmlHelp}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{t.placeholdersHelp}</Text>
                          {editAudience === "customer" && (
                            <BlockStack gap="150">
                              <Text as="span" variant="bodySm" fontWeight="semibold">{t.emailAttachmentsLabel}</Text>
                              <Checkbox
                                label={t.attachInvoicePdf}
                                checked={(step.email_attachments || []).includes("invoice_pdf")}
                                onChange={(checked) => {
                                  setEditSteps((prev) =>
                                    prev.map((row, i) => {
                                      if (i !== idx || row.step_type !== "send_email") return row;
                                      const set = new Set(row.email_attachments || []);
                                      if (checked) set.add("invoice_pdf");
                                      else set.delete("invoice_pdf");
                                      return { ...row, email_attachments: Array.from(set) };
                                    }),
                                  );
                                }}
                              />
                              <Checkbox
                                label={t.attachLieferscheinPdf}
                                checked={(step.email_attachments || []).includes("lieferschein_pdf")}
                                onChange={(checked) => {
                                  setEditSteps((prev) =>
                                    prev.map((row, i) => {
                                      if (i !== idx || row.step_type !== "send_email") return row;
                                      const set = new Set(row.email_attachments || []);
                                      if (checked) set.add("lieferschein_pdf");
                                      else set.delete("lieferschein_pdf");
                                      return { ...row, email_attachments: Array.from(set) };
                                    }),
                                  );
                                }}
                              />
                              <Text as="p" variant="bodySm" tone="subdued">{t.emailAttachmentsHelp}</Text>
                            </BlockStack>
                          )}
                          <BlockStack gap="100">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h4" variant="headingSm">{t.mergeFieldsTitle}</Text>
                              <Button
                                size="slim"
                                variant="plain"
                                onClick={() => setEditStepMergeOpen((p) => ({ ...p, [idx]: !p[idx] }))}
                              >
                                {editStepMergeOpen[idx] ? t.mergeFieldsToggleHide : t.mergeFieldsToggleShow}
                              </Button>
                            </InlineStack>
                            <Collapsible
                              id={`flow-edit-merge-${editingFlowId}-${idx}`}
                              open={!!editStepMergeOpen[idx]}
                              transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
                            >
                              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                                <Box maxHeight="320px" overflowY="auto">
                                  <FlowMergeFieldsPanel
                                    t={t}
                                    catalog={editMergeCatalog}
                                    loading={editMergeLoading}
                                    errorText={editMergeErr === "merge-fields-error" ? t.mergeFieldsErr : editMergeErr}
                                    stepIdx={idx}
                                    onAppendSubject={(tok) => appendToStepEmail(idx, "subject", tok)}
                                    onAppendBody={(tok) => appendToStepEmail(idx, "body", tok)}
                                  />
                                </Box>
                              </Box>
                            </Collapsible>
                          </BlockStack>
                          <TextField
                            label={t.emailSubjectLabel}
                            value={bundle.subject ?? ""}
                            onChange={(v) => patchStepEmailI18n(idx, lang, "subject", v)}
                            placeholder={t.emailSubjectPh}
                            autoComplete="off"
                          />
                          <FlowEmailBodyEditor
                            key={`${editingFlowId}-${idx}-${lang}`}
                            ref={(inst) => {
                              if (inst) flowEmailBodyRefs.current[idx] = inst;
                              else delete flowEmailBodyRefs.current[idx];
                            }}
                            label={t.emailBodyLabel}
                            value={bundle.body ?? ""}
                            onChange={(v) => patchStepEmailI18n(idx, lang, "body", v)}
                            placeholder={t.emailBodyPh}
                            helpText={t.emailBodyHelpText}
                            templates={flowEmailTemplates}
                            templateSelectLabel={t.emailTplLabel}
                            templateAppendLabel={t.emailTplAppend}
                            modes={{
                              visual: t.emailBodyModeVisual,
                              html: t.emailBodyModeHtml,
                              text: t.emailBodyModeText,
                            }}
                            minHeight="280px"
                          />
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Button
                              size="slim"
                              disabled={
                                smtpConfigured === false
                                || !testFlowEmailTo.trim()
                                || testSendingStepIdx !== null
                              }
                              loading={testSendingStepIdx === idx}
                              onClick={() => sendTestFlowEmail(idx)}
                            >
                              {t.testEmailBtn}
                            </Button>
                            {smtpConfigured === false && (
                              <Text as="span" variant="bodySm" tone="subdued">{t.smtpRequiredForTest}</Text>
                            )}
                          </InlineStack>
                              </>
                            );
                          })()}
                        </BlockStack>
                      )}
                    </BlockStack>
                  </Card>
                ))}
              </BlockStack>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>

      {flowTestToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10050,
            maxWidth: "min(520px, calc(100vw - 32px))",
            background: flowTestToast.tone === "success" ? "#047857" : "#b91c1c",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
            pointerEvents: "none",
            textAlign: "center",
          }}
        >
          {flowTestToast.message}
        </div>
      )}
    </Page>
  );
}
