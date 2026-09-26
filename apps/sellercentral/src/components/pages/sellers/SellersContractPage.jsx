"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { lt } from "@/lib/locale-text";
import { confirmDelete } from "@/lib/confirm-delete";

const LOCALE_TABS = [
  { value: "de", label: "DE" },
  { value: "tr", label: "TR" },
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
  { value: "es", label: "ES" },
  { value: "it", label: "IT" },
];

function copy(locale) {
  return {
    title: lt(locale, "Seller contract", "Satıcı sözleşmesi", "Contrat vendeur", "Contrato de vendedor", "Contratto venditore", "Händlervertrag"),
    subtitle: lt(
      locale,
      "Edit the live seller–platform agreement and review signed copies.",
      "Canlı satıcı–platform sözleşmesini düzenleyin ve imzalı kopyaları inceleyin.",
      "Modifier l'accord vendeur–plateforme et consulter les exemplaires signés.",
      "Edite el acuerdo vendedor–plataforma y revise las copias firmadas.",
      "Modifica l'accordo venditore–piattaforma e consulta le copie firmate.",
      "Bearbeiten Sie die Händler-Plattform-Vereinbarung und prüfen Sie unterzeichnete Exemplare.",
    ),
    template: lt(locale, "Contract template", "Sözleşme şablonu", "Modèle de contrat", "Plantilla de contrato", "Modello di contratto", "Vertragsvorlage"),
    signed: lt(locale, "Signed contracts", "İmzalı sözleşmeler", "Contrats signés", "Contratos firmados", "Contratti firmati", "Unterzeichnete Verträge"),
    titleField: lt(locale, "Title", "Başlık", "Titre", "Título", "Titolo", "Titel"),
    version: lt(locale, "Version", "Sürüm", "Version", "Versión", "Versione", "Version"),
    governing: lt(locale, "Governing note", "Esas dil notu", "Note applicable", "Nota aplicable", "Nota vincolante", "Maßgeblichkeitshinweis"),
    sections: lt(locale, "Sections", "Maddeler", "Sections", "Secciones", "Sezioni", "Abschnitte"),
    heading: lt(locale, "Heading", "Başlık", "Titre", "Encabezado", "Intestazione", "Überschrift"),
    body: lt(locale, "Body", "Metin", "Corps", "Cuerpo", "Testo", "Text"),
    addSection: lt(locale, "Add section", "Madde ekle", "Ajouter une section", "Añadir sección", "Aggiungi sezione", "Abschnitt hinzufügen"),
    save: lt(locale, "Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern"),
    reset: lt(locale, "Reset to default", "Varsayılana dön", "Réinitialiser", "Restablecer", "Ripristina", "Auf Standard zurücksetzen"),
    resetConfirm: lt(
      locale,
      "Reset this language to the built-in default text? Unsaved edits will be lost.",
      "Bu dili yerleşik varsayılan metne sıfırlamak istiyor musunuz? Kaydedilmemiş değişiklikler kaybolur.",
      "Réinitialiser cette langue au texte par défaut ?",
      "¿Restablecer este idioma al texto predeterminado?",
      "Ripristinare questa lingua al testo predefinito?",
      "Diese Sprache auf den eingebauten Standardtext zurücksetzen?",
    ),
    saved: lt(locale, "Contract saved.", "Sözleşme kaydedildi.", "Contrat enregistré.", "Contrato guardado.", "Contratto salvato.", "Vertrag gespeichert."),
    loading: lt(locale, "Loading…", "Yükleniyor…", "Chargement…", "Cargando…", "Caricamento…", "Laden…"),
    emptySigned: lt(locale, "No signed contracts yet.", "Henüz imzalı sözleşme yok.", "Aucun contrat signé.", "Aún no hay contratos firmados.", "Nessun contratto firmato.", "Noch keine unterzeichneten Verträge."),
    seller: lt(locale, "Seller", "Satıcı", "Vendeur", "Vendedor", "Venditore", "Verkäufer"),
    signedAt: lt(locale, "Signed at", "İmza zamanı", "Signé le", "Firmado el", "Firmato il", "Unterzeichnet am"),
    pdf: lt(locale, "PDF", "PDF", "PDF", "PDF", "PDF", "PDF"),
    download: lt(locale, "Download", "İndir", "Télécharger", "Descargar", "Scarica", "Herunterladen"),
    noPdf: lt(locale, "No PDF", "PDF yok", "Pas de PDF", "Sin PDF", "Nessun PDF", "Kein PDF"),
    moveUp: lt(locale, "Up", "Yukarı", "Haut", "Arriba", "Su", "Hoch"),
    moveDown: lt(locale, "Down", "Aşağı", "Bas", "Abajo", "Giù", "Runter"),
    remove: lt(locale, "Remove", "Sil", "Supprimer", "Eliminar", "Rimuovi", "Entfernen"),
    sourceDb: lt(locale, "Saved in database (live)", "Veritabanında kayıtlı (canlı)", "Enregistré en base", "Guardado en base de datos", "Salvato nel database", "In der Datenbank gespeichert"),
    sourceDefault: lt(locale, "Built-in default (not customized yet)", "Yerleşik varsayılan (henüz özelleştirilmedi)", "Texte par défaut", "Texto predeterminado", "Testo predefinito", "Eingebauter Standard"),
    superuserOnly: lt(locale, "Superuser only.", "Yalnızca süper kullanıcı.", "Réservé au superuser.", "Solo superusuario.", "Solo superuser.", "Nur Superuser."),
  };
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "fr-FR", "es-ES", "it-IT", "de-DE");
  try {
    return new Date(d).toLocaleString(loc, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

export default function SellersContractPage() {
  const locale = useLocale();
  const t = useMemo(() => copy(locale), [locale]);
  const client = useMemo(() => getMedusaAdminClient(), []);

  const [editLocale, setEditLocale] = useState(() => String(locale || "de").slice(0, 2));
  const [draft, setDraft] = useState(null);
  const [source, setSource] = useState("default");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signed, setSigned] = useState([]);
  const [signedLoading, setSignedLoading] = useState(true);
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const loadTemplate = useCallback(async (loc) => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await client.getSellerAgreementTemplate(loc);
      setDraft({
        locale: data.locale || loc,
        title: data.title || "",
        version: data.version || "",
        governing_note: data.governing_note || "",
        sections: Array.isArray(data.sections) ? data.sections.map((s) => ({ heading: s.heading || "", body: s.body || "" })) : [],
      });
      setSource(data.source === "db" ? "db" : "default");
    } catch (e) {
      setError(e?.message || "Failed to load");
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadSigned = useCallback(async () => {
    setSignedLoading(true);
    try {
      const data = await client.getSignedSellerAgreements();
      setSigned(Array.isArray(data?.contracts) ? data.contracts : []);
    } catch (_) {
      setSigned([]);
    } finally {
      setSignedLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadTemplate(editLocale);
  }, [editLocale, loadTemplate]);

  useEffect(() => {
    loadSigned();
  }, [loadSigned]);

  const updateSection = (idx, patch) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const sections = prev.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s));
      return { ...prev, sections };
    });
  };

  const moveSection = (idx, dir) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.sections];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[j];
      next[j] = tmp;
      return { ...prev, sections: next };
    });
  };

  const removeSection = (idx) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, sections: prev.sections.filter((_, i) => i !== idx) };
    });
  };

  const addSection = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: [...prev.sections, { heading: "", body: "" }],
      };
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await client.saveSellerAgreementTemplate({
        locale: editLocale,
        title: draft.title,
        version: draft.version,
        governing_note: draft.governing_note,
        sections: draft.sections,
      });
      setDraft({
        locale: saved.locale || editLocale,
        title: saved.title || "",
        version: saved.version || "",
        governing_note: saved.governing_note || "",
        sections: Array.isArray(saved.sections) ? saved.sections : [],
      });
      setSource("db");
      setSuccess(t.saved);
    } catch (e) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirmDelete(t.resetConfirm)) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await client.resetSellerAgreementTemplate(editLocale);
      setDraft({
        locale: data.locale || editLocale,
        title: data.title || "",
        version: data.version || "",
        governing_note: data.governing_note || "",
        sections: Array.isArray(data.sections) ? data.sections : [],
      });
      setSource("default");
    } catch (e) {
      setError(e?.message || "Reset failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async (row) => {
    setPdfBusyId(row.id);
    try {
      const blob = await client.downloadAgreementPdf(row.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `andertal-agreement-${row.seller_id || row.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || "PDF download failed");
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <BlockStack gap="500">
      <BlockStack gap="100">
        <Text as="h1" variant="headingLg">{t.title}</Text>
        <Text as="p" variant="bodyMd" tone="subdued">{t.subtitle}</Text>
      </BlockStack>

      {error ? <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner> : null}
      {success ? <Banner tone="success" onDismiss={() => setSuccess("")}>{success}</Banner> : null}

      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <Text as="h2" variant="headingMd">{t.template}</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {source === "db" ? t.sourceDb : t.sourceDefault}
            </Text>
          </InlineStack>

          <InlineStack gap="200" wrap>
            {LOCALE_TABS.map((tab) => (
              <Button
                key={tab.value}
                size="slim"
                variant={editLocale === tab.value ? "primary" : "secondary"}
                onClick={() => setEditLocale(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </InlineStack>

          {loading || !draft ? (
            <Box padding="400"><Spinner size="small" /> <Text as="span" variant="bodySm">{t.loading}</Text></Box>
          ) : (
            <BlockStack gap="400">
              <TextField label={t.titleField} value={draft.title} onChange={(v) => setDraft((p) => ({ ...p, title: v }))} autoComplete="off" />
              <TextField label={t.version} value={draft.version} onChange={(v) => setDraft((p) => ({ ...p, version: v }))} autoComplete="off" helpText="e.g. 2026.09.26" />
              <TextField label={t.governing} value={draft.governing_note} onChange={(v) => setDraft((p) => ({ ...p, governing_note: v }))} multiline={2} autoComplete="off" />

              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">{t.sections} ({draft.sections.length})</Text>
                <Button size="slim" onClick={addSection}>{t.addSection}</Button>
              </InlineStack>

              {draft.sections.map((sec, idx) => (
                <Box key={`sec-${idx}`} borderWidth="025" borderColor="border" borderRadius="200" padding="300">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center" wrap gap="200">
                      <Text as="span" variant="bodySm" tone="subdued">#{idx + 1}</Text>
                      <InlineStack gap="100">
                        <Button size="slim" disabled={idx === 0} onClick={() => moveSection(idx, -1)}>{t.moveUp}</Button>
                        <Button size="slim" disabled={idx === draft.sections.length - 1} onClick={() => moveSection(idx, 1)}>{t.moveDown}</Button>
                        <Button size="slim" tone="critical" onClick={() => removeSection(idx)}>{t.remove}</Button>
                      </InlineStack>
                    </InlineStack>
                    <TextField label={t.heading} value={sec.heading} onChange={(v) => updateSection(idx, { heading: v })} autoComplete="off" />
                    <TextField label={t.body} value={sec.body} onChange={(v) => updateSection(idx, { body: v })} multiline={6} autoComplete="off" />
                  </BlockStack>
                </Box>
              ))}

              <InlineStack gap="200">
                <Button variant="primary" loading={saving} onClick={handleSave}>{t.save}</Button>
                <Button loading={saving} onClick={handleReset}>{t.reset}</Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">{t.signed}</Text>
          {signedLoading ? (
            <Box padding="200"><Spinner size="small" /></Box>
          ) : signed.length === 0 ? (
            <Text as="p" variant="bodyMd" tone="subdued">{t.emptySigned}</Text>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px 10px" }}>{t.seller}</th>
                    <th style={{ padding: "8px 10px" }}>{t.version}</th>
                    <th style={{ padding: "8px 10px" }}>{t.signedAt}</th>
                    <th style={{ padding: "8px 10px" }}>IP</th>
                    <th style={{ padding: "8px 10px" }}>{t.pdf}</th>
                  </tr>
                </thead>
                <tbody>
                  {signed.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px" }}>
                        <BlockStack gap="050">
                          <Link href={`/sellers/${row.id}`} style={{ fontWeight: 600, color: "#136761", textDecoration: "none" }}>
                            {row.store_name || row.company_name || row.email || row.id}
                          </Link>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {[row.authorized_person_name, row.email].filter(Boolean).join(" · ")}
                          </Text>
                        </BlockStack>
                      </td>
                      <td style={{ padding: "10px" }}>{row.agreement_version || "—"}</td>
                      <td style={{ padding: "10px" }}>{fmtDate(row.signature_at || row.agreement_accepted_at, locale)}</td>
                      <td style={{ padding: "10px", fontFamily: "monospace", fontSize: 12 }}>{row.signature_ip || row.agreement_ip || "—"}</td>
                      <td style={{ padding: "10px" }}>
                        {row.has_pdf ? (
                          <Button size="slim" loading={pdfBusyId === row.id} onClick={() => handleDownloadPdf(row)}>
                            {t.download}
                          </Button>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">{t.noPdf}</Text>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
