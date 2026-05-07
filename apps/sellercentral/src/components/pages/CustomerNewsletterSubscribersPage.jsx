"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Box, TextField, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function CustomerNewsletterSubscribersPage() {
  const router = useRouter();
  const locale = useLocale();
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subscribers, setSubscribers] = useState([]);
  const [newEmail, setNewEmail] = useState("");

  const copyByLocale = {
    de: {
      pageTitle: "Newsletter-Abonnenten",
      heading: "Newsletter CRM",
      searchPh: "E-Mail, Name oder Quelle…",
      searchLabel: "Suche",
      addPh: "Neue E-Mail hinzufügen",
      addBtn: "Abonnent hinzufügen",
      total: "Abonnenten",
      noData: "Keine Newsletter-Abonnenten gefunden.",
      loading: "Laden…",
      allStatuses: "Alle Status",
      colEmail: "E-Mail",
      colName: "Name",
      colSource: "Quelle",
      colStatus: "Status",
      colLocale: "Sprache",
      colDate: "Abonniert am",
      colActions: "Aktionen",
      open: "Öffnen",
      delete: "Löschen",
      status_active: "Kayıtlı",
      status_unsubscribed: "Çıkmış",
      status_deactivated: "Deaktif",
    },
    tr: {
      pageTitle: "Newsletter Aboneleri",
      heading: "Newsletter CRM",
      searchPh: "E-posta, isim veya kaynak…",
      searchLabel: "Arama",
      addPh: "Yeni e-posta ekle",
      addBtn: "Abone ekle",
      total: "Abone",
      noData: "Newsletter abonesi bulunamadı.",
      loading: "Yükleniyor…",
      allStatuses: "Tüm durumlar",
      colEmail: "E-posta",
      colName: "İsim",
      colSource: "Kaynak",
      colStatus: "Durum",
      colLocale: "Dil",
      colDate: "Abonelik tarihi",
      colActions: "Aksiyonlar",
      open: "Aç",
      delete: "Sil",
      status_active: "Kayıtlı",
      status_unsubscribed: "Çıkmış",
      status_deactivated: "Deaktif",
    },
    en: {
      pageTitle: "Newsletter Subscribers",
      heading: "Newsletter CRM",
      searchPh: "Email, name or source…",
      searchLabel: "Search",
      addPh: "Add a new email",
      addBtn: "Add subscriber",
      total: "Subscribers",
      noData: "No newsletter subscribers found.",
      loading: "Loading…",
      allStatuses: "All statuses",
      colEmail: "Email",
      colName: "Name",
      colSource: "Source",
      colStatus: "Status",
      colLocale: "Locale",
      colDate: "Subscribed at",
      colActions: "Actions",
      open: "Open",
      delete: "Delete",
      status_active: "Registered",
      status_unsubscribed: "Unsubscribed",
      status_deactivated: "Deactivated",
    },
    fr: {
      pageTitle: "Abonnés newsletter",
      heading: "Newsletter CRM",
      searchPh: "E-mail, nom ou source…",
      searchLabel: "Recherche",
      addPh: "Ajouter un nouvel e-mail",
      addBtn: "Ajouter un abonné",
      total: "Abonnés",
      noData: "Aucun abonné newsletter trouvé.",
      loading: "Chargement…",
      allStatuses: "Tous les statuts",
      colEmail: "E-mail",
      colName: "Nom",
      colSource: "Source",
      colStatus: "Statut",
      colLocale: "Langue",
      colDate: "Abonné le",
      colActions: "Actions",
      open: "Ouvrir",
      delete: "Supprimer",
      status_active: "Inscrit",
      status_unsubscribed: "Désabonné",
      status_deactivated: "Désactivé",
    },
    it: {
      pageTitle: "Iscritti newsletter",
      heading: "Newsletter CRM",
      searchPh: "Email, nome o sorgente…",
      searchLabel: "Ricerca",
      addPh: "Aggiungi una nuova email",
      addBtn: "Aggiungi iscritto",
      total: "Iscritti",
      noData: "Nessun iscritto newsletter trovato.",
      loading: "Caricamento…",
      allStatuses: "Tutti gli stati",
      colEmail: "Email",
      colName: "Nome",
      colSource: "Sorgente",
      colStatus: "Stato",
      colLocale: "Lingua",
      colDate: "Iscritto il",
      colActions: "Azioni",
      open: "Apri",
      delete: "Elimina",
      status_active: "Iscritto",
      status_unsubscribed: "Disiscritto",
      status_deactivated: "Disattivato",
    },
    es: {
      pageTitle: "Suscriptores newsletter",
      heading: "Newsletter CRM",
      searchPh: "Email, nombre o fuente…",
      searchLabel: "Búsqueda",
      addPh: "Agregar nuevo email",
      addBtn: "Agregar suscriptor",
      total: "Suscriptores",
      noData: "No se encontraron suscriptores.",
      loading: "Cargando…",
      allStatuses: "Todos los estados",
      colEmail: "Email",
      colName: "Nombre",
      colSource: "Fuente",
      colStatus: "Estado",
      colLocale: "Idioma",
      colDate: "Suscrito el",
      colActions: "Acciones",
      open: "Abrir",
      delete: "Eliminar",
      status_active: "Registrado",
      status_unsubscribed: "Dado de baja",
      status_deactivated: "Desactivado",
    },
  };
  const t = copyByLocale[locale] || copyByLocale.en;

  useEffect(() => {
    const ok = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(ok);
    setAuthChecked(true);
  }, []);

  const loadSubscribers = React.useCallback(() => {
    if (!isSuperuser) return;
    setLoading(true);
    getMedusaAdminClient()
      .getNewsletterSubscribers({
        q: search || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      })
      .then((d) => {
        setSubscribers(Array.isArray(d?.subscribers) ? d.subscribers : []);
      })
      .catch(() => setSubscribers([]))
      .finally(() => setLoading(false));
  }, [isSuperuser, search, statusFilter]);

  useEffect(() => {
    if (!isSuperuser) return;
    loadSubscribers();
  }, [isSuperuser, loadSubscribers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter((s) =>
      [s.email, s.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [subscribers, search]);

  if (!authChecked || !isSuperuser) return null;

  const setStatus = async (id, status) => {
    if (!id) return;
    setBusyId(id);
    try {
      await getMedusaAdminClient().updateNewsletterSubscriber(id, { status });
      await loadSubscribers();
    } finally {
      setBusyId("");
    }
  };

  const createSubscriber = async () => {
    const email = String(newEmail || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setSaving(true);
    try {
      await getMedusaAdminClient().createNewsletterSubscriber({
        email,
        source: "manual",
        status: "active",
        preferred_locale: locale,
      });
      setNewEmail("");
      await loadSubscribers();
    } finally {
      setSaving(false);
    }
  };

  const removeSubscriber = async (id) => {
    if (!id) return;
    if (!window.confirm("Diesen Abonnenten wirklich löschen?")) return;
    setBusyId(id);
    try {
      await getMedusaAdminClient().deleteNewsletterSubscriber(id);
      await loadSubscribers();
    } finally {
      setBusyId("");
    }
  };

  const statusBadge = (statusRaw) => {
    const status = String(statusRaw || "active").toLowerCase();
    if (status === "active") return { label: "Kayıtlı", bg: "#dcfce7", color: "#166534" };
    if (status === "unsubscribed") return { label: "Çıkmış", bg: "#fee2e2", color: "#991b1b" };
    if (status === "deactivated") return { label: "Deaktif", bg: "#e5e7eb", color: "#374151" };
    return { label: status, bg: "#f3f4f6", color: "#4b5563" };
  };

  return (
    <Page title={t.pageTitle}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="h2" variant="headingSm">
                  {t.heading}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {filtered.length} {t.total}
                </Text>
              </InlineStack>

              <InlineStack gap="300" wrap>
                <div style={{ minWidth: 320, flex: 1 }}>
                  <TextField
                    label={t.searchLabel}
                    labelHidden
                    value={search}
                    onChange={setSearch}
                    autoComplete="off"
                    placeholder={t.searchPh}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ minWidth: 170, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8 }}
                >
                  <option value="all">{t.allStatuses}</option>
                  <option value="active">{t.status_active}</option>
                  <option value="unsubscribed">{t.status_unsubscribed}</option>
                  <option value="deactivated">{t.status_deactivated}</option>
                </select>
                <Button onClick={loadSubscribers} disabled={loading}>
                  Refresh
                </Button>
              </InlineStack>

              <InlineStack gap="200" wrap={false}>
                <Box maxWidth="420px" width="100%">
                  <TextField
                    label={t.addPh}
                    labelHidden
                    value={newEmail}
                    onChange={setNewEmail}
                    autoComplete="off"
                    placeholder={t.addPh}
                  />
                </Box>
                <Button variant="primary" onClick={createSubscriber} loading={saving}>
                  {t.addBtn}
                </Button>
              </InlineStack>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {[t.colEmail, t.colName, t.colSource, t.colStatus, t.colLocale, t.colDate, t.colActions].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "10px 12px",
                            textAlign: "left",
                            fontWeight: 600,
                            fontSize: 11,
                            color: "#6b7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          {t.loading}
                        </td>
                      </tr>
                    )}
                    {!loading && filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 36, textAlign: "center", color: "#9ca3af" }}>
                          {t.noData}
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      filtered.map((s, i) => (
                        <tr
                          key={s.id || i}
                          style={{ borderBottom: "1px solid #f3f4f6" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#fafafa";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "";
                          }}
                        >
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {s.email || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {[s.first_name, s.last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12, textTransform: "capitalize" }}>
                            {String(s.source || "landing_page").replace(/_/g, " ")}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            <select
                              value={String(s.status || "active")}
                              disabled={busyId === s.id}
                              onChange={(e) => setStatus(s.id, e.target.value)}
                              style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 8 }}
                            >
                              <option value="active">{t.status_active}</option>
                              <option value="unsubscribed">{t.status_unsubscribed}</option>
                              <option value="deactivated">{t.status_deactivated}</option>
                            </select>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {String(s.preferred_locale || "—").toUpperCase()}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            {fmtDate(s.subscribed_at)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 12 }}>
                            <InlineStack gap="200">
                              <Button size="slim" onClick={() => router.push(`/customers/newsletter/${s.id}`)}>
                                {t.open}
                              </Button>
                              <Button size="slim" tone="critical" onClick={() => removeSubscriber(s.id)} disabled={busyId === s.id}>
                                {t.delete}
                              </Button>
                            </InlineStack>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
