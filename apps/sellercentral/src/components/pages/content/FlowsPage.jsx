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
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlowsPage() {
  const locale = useLocale();
  const t = T[locale] || T.en;

  const triggerOptions = Object.entries(t.triggers).map(([value, label]) => ({ label, value }));

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

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flowsRes, smtpRes] = await Promise.allSettled([
        client.getFlows?.() ?? Promise.resolve({ flows: [] }),
        client.getSmtpSettings?.() ?? Promise.resolve(null),
      ]);
      setFlows(flowsRes.status === "fulfilled" ? (flowsRes.value?.flows ?? []) : []);
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
    if (!name) { setNewNameErr(t.flowName + " " + t.cancel.toLowerCase()); return; }
    setSaving(true);
    try {
      const res = await client.createFlow?.({ name, trigger: newTrigger, status: "draft" });
      setFlows((prev) => [...prev, res?.flow ?? { id: Date.now(), name, trigger: newTrigger, status: "draft", step_count: 0 }]);
      setCreateOpen(false);
      setNewName(""); setNewTrigger("abandoned_cart"); setNewNameErr("");
    } catch (e) {
      setNewNameErr(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (flow) => {
    setTogglingId(flow.id);
    const nextStatus = flow.status === "active" ? "paused" : "active";
    try {
      await client.updateFlow?.(flow.id, { status: nextStatus });
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
      await client.deleteFlow?.(id);
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
    </Page>
  );
}
