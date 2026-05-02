"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import {
  Page, Layout, Card, Text, Button, Badge, BlockStack, InlineStack,
  Box, Spinner, Banner, Modal, TextField, Select, EmptyState, Divider,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const client = getMedusaAdminClient();

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
      order_delivered: "Order delivered",
      review_request: "Review request",
      win_back: "Win-back (inactive customer)",
    },
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
    emailBodyLabel: "Email body",
    emailSubjectPh: "e.g. Thanks for your order",
    emailBodyPh: "<p>Dear {FIRST_NAME},</p><p>Thanks for shopping <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Body is sent as HTML. You can use headings, links, and styles.",
    placeholdersHelp:
      "Placeholders (sample data in test sends): {CUSTOMER}, {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Send test emails to",
    testEmailFieldHelp: "Same address is used for every “Send test” below.",
    testEmailBtn: "Send test email",
    testEmailNeedAddress: "Enter your email above to send a test.",
    testEmailNeedStep: "Add subject and HTML body first.",
    testEmailOk: "Test email sent.",
    smtpRequiredForTest: "Configure SMTP first (Settings → Integrations).",
    loadFlowErr: "Could not load flow.",
    saveFlowErr: "Could not save flow.",
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
      order_delivered: "Bestellung geliefert",
      review_request: "Bewertungsanfrage",
      win_back: "Rückgewinnung (inaktiver Kunde)",
    },
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
    emailBodyLabel: "E-Mail-Text",
    emailSubjectPh: "z. B. Danke für Ihre Bestellung",
    emailBodyPh: "<p>Hallo {FIRST_NAME},</p><p>vielen Dank für Ihren Einkauf: <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Der Text wird als HTML versendet (Überschriften, Links, Styles).",
    placeholdersHelp:
      "Platzhalter (Test mit Beispieldaten): {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Test-E-Mails senden an",
    testEmailFieldHelp: "Dieselbe Adresse für alle „Test senden“-Schaltflächen.",
    testEmailBtn: "Test-E-Mail senden",
    testEmailNeedAddress: "Bitte oben eine E-Mail-Adresse eingeben.",
    testEmailNeedStep: "Zuerst Betreff und HTML-Text ausfüllen.",
    testEmailOk: "Test-E-Mail wurde gesendet.",
    smtpRequiredForTest: "Zuerst SMTP einrichten (Einstellungen → Integrationen).",
    noStepsHint: "Schritte hinzufügen—z. B. 1 Stunde warten, dann E-Mail senden.",
    loadFlowErr: "Flow konnte nicht geladen werden.",
    saveFlowErr: "Flow konnte nicht gespeichert werden.",
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
      order_delivered: "Sipariş teslim edildi",
      review_request: "Yorum isteği",
      win_back: "Pasif müşteri (win-back)",
    },
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
    emailBodyLabel: "E-posta metni",
    emailSubjectPh: "ör. Siparişiniz için teşekkürler",
    emailBodyPh: "<p>Merhaba {FIRST_NAME},</p><p><strong>{PRODUCT}</strong> için alışverişinize teşekkürler.</p>",
    emailHtmlHelp: "Gövde HTML olarak gönderilir.",
    placeholdersHelp:
      "Yer tutucular (testte örnek veri): {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Test e-postası gönderilecek adres",
    testEmailFieldHelp: "Aşağıdaki tüm test gönderimleri bu adresi kullanır.",
    testEmailBtn: "Test e-postası gönder",
    testEmailNeedAddress: "Önce yukarıya e-posta yazın.",
    testEmailNeedStep: "Önce konu ve HTML gövde ekleyin.",
    testEmailOk: "Test e-postası gönderildi.",
    smtpRequiredForTest: "Önce SMTP yapılandırın (Ayarlar → Entegrasyonlar).",
    noStepsHint: "Adım ekleyin—ör. 1 saat bekleyin, sonra e-posta gönderin.",
    loadFlowErr: "Flow yüklenemedi.",
    saveFlowErr: "Flow kaydedilemedi.",
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
      order_delivered: "Commande livrée",
      review_request: "Demande d'avis",
      win_back: "Réactivation (client inactif)",
    },
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
    emailBodyLabel: "Corps",
    emailSubjectPh: "ex. Merci pour votre commande",
    emailBodyPh: "<p>Bonjour {FIRST_NAME},</p><p>Merci pour votre achat : <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Le corps est envoyé en HTML.",
    placeholdersHelp:
      "Variables (données d'exemple pour les tests) : {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Envoyer les e-mails de test à",
    testEmailFieldHelp: "La même adresse pour chaque bouton « Envoyer un test ».",
    testEmailBtn: "Envoyer un e-mail de test",
    testEmailNeedAddress: "Indiquez votre e-mail ci-dessus.",
    testEmailNeedStep: "Renseignez d'abord l'objet et le corps HTML.",
    testEmailOk: "E-mail de test envoyé.",
    smtpRequiredForTest: "Configurez d'abord SMTP (Paramètres → Intégrations).",
    noStepsHint: "Ajoutez des étapes — ex. attendre 1 heure puis envoyer un e-mail.",
    loadFlowErr: "Impossible de charger le flux.",
    saveFlowErr: "Impossible d'enregistrer le flux.",
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
      order_delivered: "Ordine consegnato",
      review_request: "Richiesta recensione",
      win_back: "Riattivazione (cliente inattivo)",
    },
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
    emailBodyLabel: "Corpo",
    emailSubjectPh: "es. Grazie per il tuo ordine",
    emailBodyPh: "<p>Ciao {FIRST_NAME},</p><p>Grazie per aver acquistato <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "Il corpo viene inviato come HTML.",
    placeholdersHelp:
      "Segnaposto (dati di esempio nei test): {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Invia e-mail di test a",
    testEmailFieldHelp: "Lo stesso indirizzo per ogni pulsante « Invia test ».",
    testEmailBtn: "Invia e-mail di test",
    testEmailNeedAddress: "Inserisci sopra un indirizzo e-mail.",
    testEmailNeedStep: "Compila prima oggetto e corpo HTML.",
    testEmailOk: "E-mail di test inviata.",
    smtpRequiredForTest: "Configura prima SMTP (Impostazioni → Integrazioni).",
    noStepsHint: "Aggiungi passi — es. attendi 1 ora poi invia un'e-mail.",
    loadFlowErr: "Impossibile caricare il flusso.",
    saveFlowErr: "Impossibile salvare il flusso.",
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
      order_delivered: "Pedido entregado",
      review_request: "Solicitud de reseña",
      win_back: "Reactivación (cliente inactivo)",
    },
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
    emailBodyLabel: "Cuerpo",
    emailSubjectPh: "ej. Gracias por tu pedido",
    emailBodyPh: "<p>Hola {FIRST_NAME},</p><p>Gracias por comprar <strong>{PRODUCT}</strong>.</p>",
    emailHtmlHelp: "El cuerpo se envía como HTML.",
    placeholdersHelp:
      "Marcadores (datos de ejemplo en pruebas): {CUSTOMER_NAME}, {FIRST_NAME}, {LAST_NAME}, {EMAIL}, {PRODUCT}, {ORDER_NUMBER}, {STORE_NAME}.",
    testEmailFieldLabel: "Enviar correos de prueba a",
    testEmailFieldHelp: "La misma dirección para cada « Enviar prueba ».",
    testEmailBtn: "Enviar correo de prueba",
    testEmailNeedAddress: "Escribe tu correo arriba.",
    testEmailNeedStep: "Completa primero asunto y cuerpo HTML.",
    testEmailOk: "Correo de prueba enviado.",
    smtpRequiredForTest: "Configura SMTP primero (Ajustes → Integraciones).",
    noStepsHint: "Añade pasos — ej. esperar 1 hora y enviar un correo.",
    loadFlowErr: "No se pudo cargar el flujo.",
    saveFlowErr: "No se pudo guardar el flujo.",
    flowStatusLabel: "Estado del flujo",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const locale = useLocale();
  const t = T[locale] || T.en;

  const triggerOptions = Object.entries(t.triggers).map(([value, label]) => ({ label, value }));
  const statusEditOptions = [
    { label: t.statuses.draft, value: "draft" },
    { label: t.statuses.active, value: "active" },
    { label: t.statuses.paused, value: "paused" },
  ];
  const stepTypeOptions = [
    { label: t.stepWaitOption, value: "wait_hours" },
    { label: t.stepEmailOption, value: "send_email" },
  ];

  const [flows, setFlows]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [saving, setSaving]             = useState(false);
  const [togglingId, setTogglingId]     = useState("");
  const [createOpen, setCreateOpen]     = useState(false);
  const [newName, setNewName]           = useState("");
  const [newTrigger, setNewTrigger]     = useState("abandoned_cart");
  const [newNameErr, setNewNameErr]     = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState(null);
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
  const [testFlowEmailTo, setTestFlowEmailTo] = useState("");
  const [flowTestBanner, setFlowTestBanner]   = useState(null);
  const [testSendingStepIdx, setTestSendingStepIdx] = useState(null);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

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
      const res = await client.createFlow({ name, trigger: newTrigger, status: "draft" });
      const flow = res?.flow;
      if (flow) setFlows((prev) => [...prev, { ...flow, step_count: flow.step_count ?? 0 }]);
      setCreateOpen(false);
      setNewName(""); setNewTrigger("abandoned_cart"); setNewNameErr("");
    } catch (e) {
      setNewNameErr(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (flow) => {
    setEditErr("");
    setFlowTestBanner(null);
    setTestSendingStepIdx(null);
    setEditingFlowId(flow.id);
    setEditLoading(true);
    setEditOpen(true);
    try {
      const d = await client.getFlow(flow.id);
      const f = d?.flow;
      setEditName(f?.name || "");
      setEditTrigger(f?.trigger || "abandoned_cart");
      setEditStatus(f?.status || "draft");
      setEditSteps(
        (d?.steps || []).map((s) => ({
          id: s.id,
          step_type: s.step_type === "send_email" ? "send_email" : "wait_hours",
          wait_hours: s.wait_hours != null ? Number(s.wait_hours) : 1,
          email_subject: s.email_subject || "",
          email_body: s.email_body || "",
        })),
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
    setTestSendingStepIdx(null);
  };

  const sendTestFlowEmail = async (stepIdx) => {
    const to = testFlowEmailTo.trim();
    if (!editingFlowId) return;
    if (!to) {
      setFlowTestBanner({ tone: "critical", message: t.testEmailNeedAddress });
      return;
    }
    if (smtpConfigured === false) {
      setFlowTestBanner({ tone: "critical", message: t.smtpRequiredForTest });
      return;
    }
    const step = editSteps[stepIdx];
    if (!step || step.step_type !== "send_email") return;
    const subj = String(step.email_subject || "").trim();
    const htmlBody = String(step.email_body || "").trim();
    if (!subj || !htmlBody) {
      setFlowTestBanner({ tone: "critical", message: t.testEmailNeedStep });
      return;
    }
    setTestSendingStepIdx(stepIdx);
    setFlowTestBanner(null);
    try {
      await client.sendFlowTestEmail(editingFlowId, {
        to,
        email_subject: subj,
        email_body: htmlBody,
      });
      setFlowTestBanner({ tone: "success", message: t.testEmailOk });
    } catch (e) {
      setFlowTestBanner({ tone: "critical", message: e?.message || "Error" });
    } finally {
      setTestSendingStepIdx(null);
    }
  };

  const patchEditStep = (idx, patch) => {
    setEditSteps((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (patch.step_type === "wait_hours") {
          next.email_subject = "";
          next.email_body = "";
          if (next.wait_hours == null || Number.isNaN(Number(next.wait_hours))) next.wait_hours = 1;
        }
        if (patch.step_type === "send_email") {
          next.wait_hours = 0;
        }
        return next;
      }),
    );
  };

  const addEditStep = () => {
    setEditSteps((prev) => [
      ...prev,
      { step_type: "wait_hours", wait_hours: 1, email_subject: "", email_body: "" },
    ]);
  };

  const removeEditStep = (idx) => {
    setEditSteps((prev) => prev.filter((_, i) => i !== idx));
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
      const stepsPayload = editSteps.map((s) =>
        s.step_type === "wait_hours"
          ? { step_type: "wait_hours", wait_hours: Math.max(0, parseInt(s.wait_hours, 10) || 0) }
          : {
              step_type: "send_email",
              email_subject: String(s.email_subject || "").trim(),
              email_body: String(s.email_body || "").trim(),
            },
      );
      const res = await client.updateFlow(editingFlowId, {
        name,
        trigger: editTrigger,
        status: editStatus,
        steps: stepsPayload,
      });
      const f = res?.flow;
      const sc = res?.steps?.length ?? f?.step_count ?? editSteps.length;
      setFlows((prev) =>
        prev.map((row) =>
          row.id === editingFlowId ? { ...row, ...f, step_count: sc } : row,
        ),
      );
      closeEditModal();
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
      primaryAction={{ content: t.createBtn, onAction: () => { setNewName(""); setNewTrigger("abandoned_cart"); setNewNameErr(""); setCreateOpen(true); } }}
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
              {flows.map((flow) => {
                const statusLabel = t.statuses[flow.status] ?? flow.status;
                const badgeTone   = statusBadgeTone[flow.status] ?? "default";
                const isToggling  = togglingId === flow.id;
                return (
                  <Card key={flow.id}>
                    <InlineStack align="space-between" blockAlign="center" wrap={false}>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingSm">{flow.name}</Text>
                          <Badge tone={badgeTone}>{statusLabel}</Badge>
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
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">{t.howTitle}</Text>
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">{t.howTrigger}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{t.howSteps}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{isSuperuser ? t.howEmail : t.howEmailSeller}</Text>
            </BlockStack>
          </Card>
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
              label={t.triggerLabel}
              options={triggerOptions}
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
                <Banner tone={flowTestBanner.tone} onDismiss={() => setFlowTestBanner(null)}>
                  {flowTestBanner.message}
                </Banner>
              )}
              <TextField label={t.flowName} value={editName} onChange={setEditName} autoComplete="off" />
              <Select label={t.triggerLabel} options={triggerOptions} value={editTrigger} onChange={setEditTrigger} />
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
                          <Text as="p" variant="bodySm" tone="subdued">{t.emailHtmlHelp}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{t.placeholdersHelp}</Text>
                          <TextField
                            label={t.emailSubjectLabel}
                            value={step.email_subject}
                            onChange={(v) => patchEditStep(idx, { email_subject: v })}
                            placeholder={t.emailSubjectPh}
                            autoComplete="off"
                          />
                          <TextField
                            label={t.emailBodyLabel}
                            value={step.email_body}
                            onChange={(v) => patchEditStep(idx, { email_body: v })}
                            placeholder={t.emailBodyPh}
                            multiline={12}
                            autoComplete="off"
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
    </Page>
  );
}
