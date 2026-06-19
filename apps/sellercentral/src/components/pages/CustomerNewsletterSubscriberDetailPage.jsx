"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Page, Layout, Card, Text, BlockStack, InlineStack, TextField, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { dateLocaleFor } from "@/lib/locale-text";

import { confirmDelete } from "@/lib/confirm-delete";

function fmtDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(dateLocaleFor(locale), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_OPTIONS = ["active", "unsubscribed", "deactivated"];
const LOCALE_OPTIONS = ["de", "en", "tr", "fr", "it", "es"];

export default function CustomerNewsletterSubscriberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const subscriberId = String(params?.id || "");
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subscriber, setSubscriber] = useState(null);
  const [emails, setEmails] = useState([]);
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    source: "",
    status: "active",
    preferred_locale: "",
    notes: "",
  });

  const copy = useMemo(() => {
    const map = {
      tr: { title: "Newsletter Abone Detayı", back: "Listeye dön", save: "Kaydet", remove: "Sil", sent: "Gönderilen e-mailler", none: "Henüz gönderim kaydı yok.", basic: "Abone bilgileri", loading: "Yükleniyor…", notFound: "Bulunamadı.", email: "E-posta", firstName: "Ad", lastName: "Soyad", status: "Durum", preferredLocale: "Tercih edilen dil", source: "Kaynak", notes: "Notlar", deleteConfirm: "Abonenin kaydı silinsin mi?", colSubject: "Konu", colProvider: "Sağlayıcı", colStatus: "Durum", colTrigger: "Tetikleyici", colSentAt: "Gönderim" },
      de: { title: "Newsletter-Abonnent", back: "Zur Liste", save: "Speichern", remove: "Löschen", sent: "Gesendete E-Mails", none: "Noch keine Versandhistorie.", basic: "Abonnenten-Daten", loading: "Laden…", notFound: "Nicht gefunden.", email: "E-Mail", firstName: "Vorname", lastName: "Nachname", status: "Status", preferredLocale: "Bevorzugte Sprache", source: "Quelle", notes: "Notizen", deleteConfirm: "Abonnent wirklich löschen?", colSubject: "Betreff", colProvider: "Anbieter", colStatus: "Status", colTrigger: "Auslöser", colSentAt: "Gesendet am" },
      en: { title: "Newsletter Subscriber", back: "Back to list", save: "Save", remove: "Delete", sent: "Sent emails", none: "No email history yet.", basic: "Subscriber data", loading: "Loading…", notFound: "Not found.", email: "Email", firstName: "First name", lastName: "Last name", status: "Status", preferredLocale: "Preferred locale", source: "Source", notes: "Notes", deleteConfirm: "Delete this subscriber?", colSubject: "Subject", colProvider: "Provider", colStatus: "Status", colTrigger: "Trigger", colSentAt: "Sent at" },
      fr: { title: "Abonné newsletter", back: "Retour à la liste", save: "Enregistrer", remove: "Supprimer", sent: "E-mails envoyés", none: "Aucun envoi pour le moment.", basic: "Données abonné", loading: "Chargement…", notFound: "Introuvable.", email: "E-mail", firstName: "Prénom", lastName: "Nom", status: "Statut", preferredLocale: "Langue préférée", source: "Source", notes: "Notes", deleteConfirm: "Supprimer cet abonné ?", colSubject: "Objet", colProvider: "Fournisseur", colStatus: "Statut", colTrigger: "Déclencheur", colSentAt: "Envoyé le" },
      it: { title: "Iscritto newsletter", back: "Torna alla lista", save: "Salva", remove: "Elimina", sent: "Email inviate", none: "Nessuno storico invii.", basic: "Dati iscritto", loading: "Caricamento…", notFound: "Non trovato.", email: "E-mail", firstName: "Nome", lastName: "Cognome", status: "Stato", preferredLocale: "Lingua preferita", source: "Fonte", notes: "Note", deleteConfirm: "Eliminare questo iscritto?", colSubject: "Oggetto", colProvider: "Provider", colStatus: "Stato", colTrigger: "Trigger", colSentAt: "Inviato il" },
      es: { title: "Suscriptor newsletter", back: "Volver a la lista", save: "Guardar", remove: "Eliminar", sent: "Emails enviados", none: "Sin historial de envíos.", basic: "Datos del suscriptor", loading: "Cargando…", notFound: "No encontrado.", email: "Correo", firstName: "Nombre", lastName: "Apellido", status: "Estado", preferredLocale: "Idioma preferido", source: "Origen", notes: "Notas", deleteConfirm: "¿Eliminar este suscriptor?", colSubject: "Asunto", colProvider: "Proveedor", colStatus: "Estado", colTrigger: "Disparador", colSentAt: "Enviado el" },
    };
    return map[locale] || map.en;
  }, [locale]);

  const load = React.useCallback(async () => {
    if (!subscriberId) return;
    setLoading(true);
    try {
      const d = await getMedusaAdminClient().getNewsletterSubscriber(subscriberId);
      const s = d?.subscriber || null;
      setSubscriber(s);
      setEmails(Array.isArray(d?.emails) ? d.emails : []);
      if (s) {
        setForm({
          email: s.email || "",
          first_name: s.first_name || "",
          last_name: s.last_name || "",
          source: s.source || "manual",
          status: s.status || "active",
          preferred_locale: s.preferred_locale || "",
          notes: s.notes || "",
        });
      }
    } catch {
      setSubscriber(null);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [subscriberId]);

  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(ok);
    if (!ok) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    if (isSuperuser) load();
  }, [isSuperuser, load]);

  if (!isSuperuser) return null;

  const onSave = async () => {
    if (!subscriberId) return;
    setSaving(true);
    try {
      await getMedusaAdminClient().updateNewsletterSubscriber(subscriberId, {
        status: form.status,
        first_name: form.first_name,
        last_name: form.last_name,
        preferred_locale: form.preferred_locale || null,
        notes: form.notes,
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!subscriberId) return;
    if (!(await confirmDelete(copy.deleteConfirm))) return;
    setDeleting(true);
    try {
      await getMedusaAdminClient().deleteNewsletterSubscriber(subscriberId);
      router.push("/customers/newsletter");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Page title={copy.title}>
      <Layout>
        <Layout.Section>
          <InlineStack align="space-between">
            <Button onClick={() => router.push("/customers/newsletter")}>{copy.back}</Button>
          </InlineStack>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">{copy.basic}</Text>
              {loading ? (
                <Text as="p">{copy.loading}</Text>
              ) : !subscriber ? (
                <Text as="p">{copy.notFound}</Text>
              ) : (
                <>
                  <TextField label={copy.email} value={form.email} disabled autoComplete="off" />
                  <InlineStack gap="300" wrap={false}>
                    <div style={{ flex: 1 }}>
                      <TextField label={copy.firstName} value={form.first_name} onChange={(v) => setForm((p) => ({ ...p, first_name: v }))} autoComplete="off" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField label={copy.lastName} value={form.last_name} onChange={(v) => setForm((p) => ({ ...p, last_name: v }))} autoComplete="off" />
                    </div>
                  </InlineStack>
                  <InlineStack gap="300" wrap={false}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#6b7280" }}>{copy.status}</label>
                      <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: 6, fontSize: 12, color: "#6b7280" }}>{copy.preferredLocale}</label>
                      <select value={form.preferred_locale || ""} onChange={(e) => setForm((p) => ({ ...p, preferred_locale: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                        <option value="">—</option>
                        {LOCALE_OPTIONS.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </div>
                  </InlineStack>
                  <TextField label={copy.source} value={form.source} disabled autoComplete="off" />
                  <TextField label={copy.notes} value={form.notes} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} autoComplete="off" multiline={4} />
                  <InlineStack gap="200">
                    <Button variant="primary" loading={saving} onClick={onSave}>{copy.save}</Button>
                    <Button tone="critical" loading={deleting} onClick={onDelete}>{copy.remove}</Button>
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">{copy.sent}</Text>
              {emails.length === 0 ? (
                <Text as="p" tone="subdued">{copy.none}</Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        {[copy.colSubject, copy.colProvider, copy.colStatus, copy.colTrigger, copy.colSentAt].map((h) => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map((m) => (
                        <tr key={m.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 12px" }}>{m.subject || "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{m.provider || "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{m.delivery_status || "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{m.flow_trigger_key || "—"}</td>
                          <td style={{ padding: "10px 12px" }}>{fmtDate(m.sent_at, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
