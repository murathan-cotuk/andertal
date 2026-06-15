"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Text, BlockStack, InlineStack, TextField,
  Button, Banner, Badge, Modal, EmptyState, Divider, Box,
} from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import MarketingAccountsSection from "@/components/settings/MarketingAccountsSection";
import BillbeeSettingsPage from "@/components/pages/settings/BillbeeSettingsPage";
import { confirmDelete } from "@/lib/confirm-delete";

const client = getMedusaAdminClient();

// ─── SMTP ───────────────────────────────────────────────────────────────────

const SMTP_PROVIDERS = [
  { value: "gmail",   label: "Gmail / Google Workspace", host: "smtp.gmail.com",      port: 587, secure: false, hint: "Google Hesabı → Güvenlik → 2FA açık → Uygulama Şifreleri → Mail için şifre oluştur" },
  { value: "outlook", label: "Outlook / Microsoft 365",  host: "smtp.office365.com",  port: 587, secure: false, hint: "Microsoft 365 hesabı — SMTP-Auth etkin olmalı" },
  { value: "yahoo",   label: "Yahoo Mail",               host: "smtp.mail.yahoo.com", port: 587, secure: false, hint: "Yahoo Hesabı → Güvenlik → Uygulama Şifreleri" },
  { value: "sendgrid",label: "SendGrid",                 host: "smtp.sendgrid.net",   port: 587, secure: false, hint: "Kullanıcı adı: apikey — Şifre: SendGrid API Key" },
  { value: "custom",  label: "Özel SMTP Sunucusu",      host: "",                    port: 587, secure: false, hint: "" },
];

function SmtpSection() {
  const [form, setForm] = useState({
    provider: "gmail", host: "smtp.gmail.com", port: 587, secure: false,
    username: "", password: "", from_name: "", from_email: "",
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [err, setErr]           = useState("");

  useEffect(() => {
    client.getSmtpSettings().then((d) => {
      if (d?.smtp) {
        const s = d.smtp;
        setForm((f) => ({
          ...f,
          provider:   s.provider   || "gmail",
          host:       s.host       || "smtp.gmail.com",
          port:       s.port       || 587,
          secure:     !!s.secure,
          username:   s.username   || "",
          password:   "",
          from_name:  s.from_name  || "",
          from_email: s.from_email || "",
        }));
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleProvider = (value) => {
    const p = SMTP_PROVIDERS.find((p) => p.value === value);
    if (p) setForm((f) => ({ ...f, provider: value, host: p.host, port: p.port, secure: p.secure }));
  };

  const handleSave = async () => {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await client.updateSmtpSettings(form);
      setSaved(true);
      setTestResult(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setErr(e?.message || "Kaydetme hatası"); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await client.testSmtpSettings();
      setTestResult({ ok: true, msg: r?.message || "Bağlantı başarılı ✓" });
    } catch (e) {
      setTestResult({ ok: false, msg: e?.message || "Bağlantı başarısız" });
    }
    setTesting(false);
  };

  const selectedProvider = SMTP_PROVIDERS.find((p) => p.value === form.provider);

  if (loading) return <Box padding="400"><Text tone="subdued">Yükleniyor…</Text></Box>;

  return (
    <BlockStack gap="400">
      {/* Provider selection */}
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">E-posta sağlayıcısı</Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {SMTP_PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleProvider(p.value)}
              style={{
                padding: "10px 8px",
                border: `2px solid ${form.provider === p.value ? "#008060" : "#e5e7eb"}`,
                borderRadius: 8,
                background: form.provider === p.value ? "#f0fdf4" : "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: form.provider === p.value ? "#065f46" : "#374151",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {selectedProvider?.hint && (
          <Box padding="300" background="bg-surface-warning" borderRadius="200">
            <Text as="p" variant="bodySm">💡 {selectedProvider.hint}</Text>
          </Box>
        )}
      </BlockStack>

      <Divider />

      {/* Server settings */}
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Sunucu ayarları</Text>
        <InlineStack gap="300" blockAlign="end" wrap={false}>
          <div style={{ flex: 1 }}>
            <TextField
              label="SMTP Host"
              value={form.host}
              onChange={(v) => setForm((f) => ({ ...f, host: v }))}
              placeholder="smtp.gmail.com"
              autoComplete="off"
            />
          </div>
          <div style={{ width: 90 }}>
            <TextField
              label="Port"
              type="number"
              value={String(form.port)}
              onChange={(v) => setForm((f) => ({ ...f, port: Number(v) }))}
              autoComplete="off"
            />
          </div>
        </InlineStack>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!form.secure}
            onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
          />
          SSL/TLS kullan (Port 465)
        </label>
        <TextField
          label="Kullanıcı adı / E-posta"
          value={form.username}
          onChange={(v) => setForm((f) => ({ ...f, username: v }))}
          placeholder="senin@domain.com"
          type="email"
          autoComplete="off"
        />
        <TextField
          label="Şifre / Uygulama şifresi"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder="Boş bırakırsan mevcut şifre korunur"
          type="password"
          helpText="Gmail / Yahoo kullanıyorsanız normal hesap şifresi değil, Uygulama Şifresi kullanın."
          autoComplete="off"
        />
      </BlockStack>

      <Divider />

      {/* From details */}
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Gönderen bilgileri</Text>
        <TextField
          label="Gönderen adı"
          value={form.from_name}
          onChange={(v) => setForm((f) => ({ ...f, from_name: v }))}
          placeholder="Andertal Shop"
          autoComplete="off"
        />
        <TextField
          label="Gönderen e-posta"
          value={form.from_email}
          onChange={(v) => setForm((f) => ({ ...f, from_email: v }))}
          placeholder="noreply@andertal.de"
          type="email"
          helpText="Tüm otomatik e-postalar ve akışlar (flows) bu adresten gönderilir."
          autoComplete="off"
        />
      </BlockStack>

      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}
      {testResult && (
        <Banner tone={testResult.ok ? "success" : "critical"} onDismiss={() => setTestResult(null)}>
          {testResult.msg}
        </Banner>
      )}

      <InlineStack gap="300">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {saved ? "Kaydedildi ✓" : "Kaydet"}
        </Button>
        <Button onClick={handleTest} loading={testing}>
          Bağlantıyı test et
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

/** Manage From identities (same SMTP credentials); test each; one is default / main. */
function SmtpSendersSection({ onToast }) {
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testForId, setTestForId] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [testingId, setTestingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    client.getSmtpSettings()
      .then((d) => setSenders(Array.isArray(d?.senders) ? d.senders : []))
      .catch(() => setSenders([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openTest = (id) => {
    setTestForId(id);
    setTestTo("");
  };

  const runTest = async () => {
    const to = testTo.trim();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!testForId || !to || !emailRe.test(to)) {
      onToast?.({ tone: "critical", text: "Geçerli bir test alıcı e-postası girin." });
      return;
    }
    setTestingId(testForId);
    try {
      await client.testSmtpSender(testForId, { to });
      onToast?.({ tone: "success", text: "Test e-postası gönderildi." });
      setTestForId(null);
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || "Test başarısız." });
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const setMain = async (id) => {
    try {
      await client.setDefaultSmtpSender(id);
      onToast?.({ tone: "success", text: "Ana gönderen güncellendi." });
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || "Kaydedilemedi." });
    }
  };

  const removeSender = async (row) => {
    if (!(await confirmDelete(`„${row.from_email}" gönderenini silmek istiyor musunuz?`))) return;
    try {
      await client.deleteSmtpSender(row.id);
      onToast?.({ tone: "success", text: "Silindi." });
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || "Silinemedi." });
    }
  };

  const addSender = async () => {
    const fe = newEmail.trim();
    if (!fe) {
      onToast?.({ tone: "critical", text: "E-posta adresi gerekli." });
      return;
    }
    setAdding(true);
    try {
      await client.createSmtpSender({ from_email: fe, from_name: newName.trim() || undefined });
      onToast?.({ tone: "success", text: "Gönderen eklendi." });
      setAddOpen(false);
      setNewEmail("");
      setNewName("");
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || "Eklenemedi." });
    }
    setAdding(false);
  };

  if (loading) return <Box padding="400"><Text tone="subdued">Gönderenler yükleniyor…</Text></Box>;

  return (
    <BlockStack gap="400">
      <Text as="h3" variant="headingSm">Gönderen e-postalar</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        Her satır aynı SMTP hesabıyla farklı bir Gönderen (Kimden) adresidir. Flow ve otomatik maillerde varsayılan olarak <strong>ana</strong> gönderen kullanılır; tek adımda başka bir gönderen seçebilirsiniz.
      </Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {senders.map((row) => (
          <div
            key={row.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#fafafa",
            }}
          >
            <span style={{ fontWeight: 600, minWidth: 180 }}>{row.from_email}</span>
            {row.from_name && (
              <span style={{ color: "#4b5563", fontSize: 13 }}>{row.from_name}</span>
            )}
            {row.is_default && (
              <Badge tone="success">Ana</Badge>
            )}
            <span
              title={row.last_test_message || ""}
              style={{
                fontSize: 18,
                color: row.last_test_ok === true ? "#047857" : row.last_test_ok === false ? "#b91c1c" : "#9ca3af",
              }}
            >
              {row.last_test_ok === true ? "✓" : row.last_test_ok === false ? "✗" : "—"}
            </span>
            {!row.is_default && (
              <Button size="slim" onClick={() => setMain(row.id)}>Ana yap</Button>
            )}
            <Button size="slim" onClick={() => openTest(row.id)}>Test</Button>
            <Button size="slim" tone="critical" variant="plain" onClick={() => removeSender(row)}>Sil</Button>
          </div>
        ))}
      </div>
      <Button onClick={() => setAddOpen(true)}>Gönderen ekle</Button>

      <Modal
        open={!!testForId}
        onClose={() => setTestForId(null)}
        title="Göndereni test et"
        primaryAction={{ content: "Gönder", onAction: runTest, loading: testingId != null }}
        secondaryActions={[{ content: "İptal", onAction: () => setTestForId(null) }]}
      >
        <Modal.Section>
          <TextField
            label="Test e-postası gönderilecek adres"
            type="email"
            value={testTo}
            onChange={setTestTo}
            autoComplete="email"
          />
        </Modal.Section>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Gönderen ekle"
        primaryAction={{ content: "Ekle", onAction: addSender, loading: adding }}
        secondaryActions={[{ content: "İptal", onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label="Gönderen e-posta" type="email" value={newEmail} onChange={setNewEmail} autoComplete="off" />
            <TextField label="Gönderen adı (isteğe bağlı)" value={newName} onChange={setNewName} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// ─── Trustpilot (superuser — storefront TrustBox) ─────────────────────────────

function TrustpilotSuperuserSection({ onToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessUnitId, setBusinessUnitId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [evaluateUrl, setEvaluateUrl] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client.getTrustpilotIntegration()
      .then((d) => {
        if (cancelled || !d) return;
        setBusinessUnitId(d.business_unit_id || "");
        setTemplateId(d.template_id || "");
        setEvaluateUrl(d.evaluate_url || "");
        setActive(d.is_active !== false);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    const bu = businessUnitId.trim();
    if (!bu) {
      onToast?.({ tone: "critical", text: "Business Unit ID eingeben (von Trustpilot Business)." });
      return;
    }
    setSaving(true);
    try {
      await client.saveTrustpilotIntegration({
        business_unit_id: bu,
        template_id: templateId.trim() || undefined,
        evaluate_url: evaluateUrl.trim(),
        is_active: active,
      });
      onToast?.({ tone: "success", text: "Trustpilot gespeichert. Shop-Widget lädt die Konfiguration automatisch." });
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || "Speichern fehlgeschlagen." });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Box padding="400"><Text tone="subdued">Trustpilot laden…</Text></Box>
    );
  }

  return (
    <BlockStack gap="400">
      <Text as="p" variant="bodySm" tone="subdued">
        Verbindet das öffentliche TrustBox-Widget auf der Shop-Produktseite mit eurem Trustpilot Business-Konto.
        Die Business Unit ID ist dieselbe wie im TrustBox-Embed-Code bei Trustpilot (öffentlich).
      </Text>
      <TextField
        label="Business Unit ID"
        value={businessUnitId}
        onChange={setBusinessUnitId}
        autoComplete="off"
        placeholder="z. B. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        helpText="Trustpilot Business → Integrationen / Showcase → TrustBox einrichten — dort steht die Business Unit ID im Embed-Code (data-businessunit-id)."
      />
      <TextField
        label="Template-ID (optional)"
        value={templateId}
        onChange={setTemplateId}
        autoComplete="off"
        placeholder="Standard, wenn leer"
        helpText="TrustBox-Vorlage aus dem Trustpilot-Generator; Standard aus dem Backend wenn leer."
      />
      <TextField
        label="Trustpilot-Bewertungs-Link (optional, https)"
        value={evaluateUrl}
        onChange={setEvaluateUrl}
        autoComplete="off"
        placeholder="https://de.trustpilot.com/evaluate/ihre-domain.de"
        helpText="Nach einer Shop-Bewertung erscheint im Kundenkonto ein Link hierher. Öffentliche Trustpilot-„Bewerten“-URL (nicht die Einladungs-JS). Leer lassen = kein Link."
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Widget auf dem Shop aktivieren
      </label>
      <InlineStack gap="300">
        <Button variant="primary" onClick={save} loading={saving}>
          Speichern
        </Button>
      </InlineStack>
      <Banner tone="info">
        Invitation-JavaScript: Schlüssel als{" "}
        <Text as="span" variant="bodySm" fontWeight="semibold">NEXT_PUBLIC_TRUSTPILOT_INVITE_REGISTER_KEY</Text>{" "}
        im Shop (.env). Automatische E-Mails zusätzlich in Trustpilot (Integrationen / Zapier). Shop-Bewertungen werden nicht automatisch als Trustpilot-Text importiert — der optionale Link lädt Kunden ein, dort selbst zu bewerten.
      </Banner>
    </BlockStack>
  );
}

// ─── API Integrations ────────────────────────────────────────────────────────

function maskKey(val) {
  const s = String(val || "");
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.min(20, s.length - 8))}${s.slice(-4)}`;
}

/** Einheitliche Akkordeon-Zeile: Logo | Titel (+ Untertitel) · rechts Chevron */
function IntegrationsAccordion({
  sectionId,
  open,
  onToggle,
  logo,
  title,
  subtitle,
  headerExtra,
  children,
}) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        background: "#fff",
        marginBottom: 10,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`integrations-panel-${sectionId}`}
        id={`integrations-trigger-${sectionId}`}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 14px",
          background: open ? "#f9fafb" : "#fff",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          {logo}
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: 1.25 }}>
              {title}
            </span>
            {subtitle ? (
              <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 3, lineHeight: 1.35 }}>
                {subtitle}
              </span>
            ) : null}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {headerExtra}
          <span
            style={{
              display: "inline-flex",
              color: "#6b7280",
              transition: "transform 0.2s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <ChevronDownIcon width={20} height={20} />
          </span>
        </span>
      </button>
      {open ? (
        <div
          id={`integrations-panel-${sectionId}`}
          role="region"
          aria-labelledby={`integrations-trigger-${sectionId}`}
          style={{
            borderTop: "1px solid #e5e7eb",
            padding: "16px 18px 20px",
            background: "#fff",
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function AccordionLogoWrap({ bg, children }) {
  return (
    <span
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: bg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function LogoMail() {
  return (
    <AccordionLogoWrap bg="#eff6ff">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 6h16v12H4V6zm0 0 8 6 8-6"
          stroke="#2563eb"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </AccordionLogoWrap>
  );
}

function LogoTrustpilot() {
  return (
    <AccordionLogoWrap bg="#ecfdf5">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path fill="#00b67a" d="M12 4l2.09 6.26H21l-5.18 3.76 1.98 6.1L12 16.36 6.19 20.12l1.98-6.1L3 10.26h6.91z" />
      </svg>
    </AccordionLogoWrap>
  );
}

function LogoMarketing() {
  return (
    <AccordionLogoWrap bg="#faf5ff">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 19V5l7-2v16l-7-2zm7 0V3l7 2v14l-7 2z" stroke="#7c3aed" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </AccordionLogoWrap>
  );
}

function LogoBillbee() {
  return (
    <AccordionLogoWrap bg="#fff7ed">
      <span style={{ fontSize: 13, fontWeight: 800, color: "#ea580c", letterSpacing: "-0.02em" }}>Bb</span>
    </AccordionLogoWrap>
  );
}

function LogoApi() {
  return (
    <AccordionLogoWrap bg="#f3f4f6">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 16l-4-4 4-4M16 8l4 4-4 4M13 7l-2 10"
          stroke="#374151"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </AccordionLogoWrap>
  );
}

function IntegrationCard({ integration, onEdit, onToggle, onDelete, onRotateSecret }) {
  const initials = (integration.name || "?").split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${integration.is_active ? "#d1fae5" : "#e5e7eb"}`,
      borderRadius: 10, padding: "16px 18px", display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: integration.is_active ? "#ecfdf5" : "#f3f4f6",
        border: `1px solid ${integration.is_active ? "#a7f3d0" : "#e5e7eb"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
        color: integration.is_active ? "#065f46" : "#6b7280", flexShrink: 0,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineStack align="space-between" blockAlign="start">
          <Text as="span" fontWeight="semibold" variant="bodyMd">{integration.name}</Text>
          <Badge tone={integration.is_active ? "success" : "new"}>
            {integration.is_active ? "Aktiv" : "Inaktiv"}
          </Badge>
        </InlineStack>
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          {integration.api_key && (
            <>
              <span style={{ fontWeight: 600, color: "#374151" }}>Zugangs-ID</span>
              <span style={{ fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {maskKey(integration.api_key)}
              </span>
            </>
          )}
          <span style={{ fontWeight: 600, color: "#374151" }}>Sicherheitsschlüssel</span>
          <span style={{ color: "#9ca3af" }}>Gespeichert — bei Bedarf neu erzeugen</span>
        </div>
        <InlineStack gap="200" blockAlign="center" style={{ marginTop: 10 }}>
          <Button size="slim" onClick={() => onEdit(integration)}>Bearbeiten</Button>
          <Button size="slim" onClick={() => onToggle(integration)}>
            {integration.is_active ? "Deaktivieren" : "Aktivieren"}
          </Button>
          <Button size="slim" onClick={() => onRotateSecret(integration)}>Neuer Schlüssel</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(integration)}>Löschen</Button>
        </InlineStack>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegrationsSettingsPage() {
  const [openSection, setOpenSection] = useState(null);
  const toggleSection = (key) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const [isSuperuser, setIsSuperuser] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState(null);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [formName, setFormName]     = useState("");
  const [createdCreds, setCreatedCreds] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getIntegrations();
      setIntegrations(data.integrations || []);
    } catch (e) {
      setMsg({ tone: "critical", text: e?.message || "Integrationen konnten nicht geladen werden." });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setIsSuperuser(typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  const openCreate = () => { setEditingId(null); setFormName(""); setCreatedCreds(null); setModalOpen(true); };
  const openEdit = (i) => { setEditingId(i.id); setFormName(i.name || ""); setCreatedCreds(null); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingId(null); setFormName(""); setCreatedCreds(null); };

  const save = async () => {
    if (!formName.trim()) { setMsg({ tone: "warning", text: "Bitte einen Namen eingeben." }); return; }
    setSaving(true); setMsg(null);
    try {
      if (editingId) {
        await client.updateIntegration(editingId, { name: formName.trim(), is_active: true });
        setMsg({ tone: "success", text: "Integration aktualisiert." });
        closeModal(); await load();
      } else {
        const data = await client.saveIntegration({ name: formName.trim(), category: "custom", is_active: true });
        const integ = data?.integration;
        if (integ?.api_key && integ?.api_secret) {
          setCreatedCreds({ name: integ.name, zugang: integ.api_key, secret: integ.api_secret });
        }
        setMsg({ tone: "success", text: "Zugangsdaten wurden erzeugt." });
        await load();
      }
    } catch (e) { setMsg({ tone: "critical", text: e?.message || "Fehler beim Speichern." }); }
    finally { setSaving(false); }
  };

  const rotateSecret = async (integration) => {
    if (!(await confirmDelete("Neuen Sicherheitsschlüssel erzeugen? Der alte Wert verliert sofort die Gültigkeit."))) return;
    try {
      const data = await client.updateIntegration(integration.id, { regenerate_secret: true });
      const sec = data?.integration?.api_secret;
      if (sec) {
        setCreatedCreds({ name: integration.name, zugang: data.integration?.api_key || integration.api_key, secret: sec });
        setModalOpen(true); setEditingId(null); setFormName("");
      }
      setMsg({ tone: "success", text: "Neuer Sicherheitsschlüssel gespeichert. Bitte kopieren." });
      await load();
    } catch (e) { setMsg({ tone: "critical", text: e?.message || "Konnte nicht erneuern." }); }
  };

  const toggleActive = async (integration) => {
    try {
      await client.updateIntegration(integration.id, { is_active: !integration.is_active });
      setIntegrations((prev) => prev.map((i) => i.id === integration.id ? { ...i, is_active: !i.is_active } : i));
    } catch (e) { setMsg({ tone: "critical", text: e?.message || "Status konnte nicht geändert werden." }); }
  };

  const remove = async (integration) => {
    if (!(await confirmDelete(`„${integration.name}" wirklich löschen?`))) return;
    try {
      await client.deleteIntegration(integration.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
      setMsg({ tone: "success", text: "Integration gelöscht." });
    } catch (e) { setMsg({ tone: "critical", text: e?.message || "Fehler beim Löschen." }); }
  };

  const copy = (text) => { if (text) navigator.clipboard.writeText(String(text)); };

  const active   = integrations.filter((i) => i.is_active);
  const inactive = integrations.filter((i) => !i.is_active);

  return (
    <Page title="Apps & Integrationen" primaryAction={{ content: "Integration anlegen", onAction: openCreate }}>
      <BlockStack gap="400">
        {msg && <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="email"
            open={openSection === "email"}
            onToggle={() => toggleSection("email")}
            logo={<LogoMail />}
            title="E-Posta"
            subtitle="SMTP ve gönderen adresleri — otomatik e-postalar ve Flow"
          >
            <BlockStack gap="400">
              <SmtpSection />
              <Divider />
              <SmtpSendersSection onToast={setMsg} />
            </BlockStack>
          </IntegrationsAccordion>
        )}

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="trustpilot"
            open={openSection === "trustpilot"}
            onToggle={() => toggleSection("trustpilot")}
            logo={<LogoTrustpilot />}
            title="Trustpilot"
            subtitle="Shop TrustBox — Trustpilot Business (nur Superuser)"
          >
            <TrustpilotSuperuserSection onToast={setMsg} />
          </IntegrationsAccordion>
        )}

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="marketing"
            open={openSection === "marketing"}
            onToggle={() => toggleSection("marketing")}
            logo={<LogoMarketing />}
            title="Marketing-Konten"
            subtitle="Meta · Google Ads · TikTok · Snapchat"
          >
            <MarketingAccountsSection hideFooterHint />
          </IntegrationsAccordion>
        )}

        <IntegrationsAccordion
          sectionId="billbee"
          open={openSection === "billbee"}
          onToggle={() => toggleSection("billbee")}
          logo={<LogoBillbee />}
          title="Billbee"
          subtitle="Auftragsabwicklung und Versand — Shop-Kanal (Marketplace-API)"
        >
          <BillbeeSettingsPage embedded />
        </IntegrationsAccordion>

        <IntegrationsAccordion
          sectionId="api"
          open={openSection === "api"}
          onToggle={() => toggleSection("api")}
          logo={<LogoApi />}
          title="API-Integrationen"
          subtitle="Zugangs-ID und Sicherheitsschlüssel — eigene Tools und Schnittstellen"
          headerExtra={
            !loading && integrations.length > 0 ? (
              <Badge tone="info">{integrations.length}</Badge>
            ) : null
          }
        >
          {loading ? (
            <Box padding="400"><Text tone="subdued">Laden…</Text></Box>
          ) : integrations.length === 0 ? (
            <EmptyState heading="Noch keine Integrationen">
              <p>Eine Integration anlegen: nur den Namen eingeben — Zugangsdaten werden automatisch generiert.</p>
              <Button variant="primary" onClick={openCreate}>Integration anlegen</Button>
            </EmptyState>
          ) : (
            <BlockStack gap="400">
              {active.length > 0 && (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Aktiv ({active.length})</Text>
                    <Button size="slim" onClick={load} loading={loading}>Aktualisieren</Button>
                  </InlineStack>
                  <div style={{ display: "grid", gap: 10 }}>
                    {active.map((i) => (
                      <IntegrationCard key={i.id} integration={i} onEdit={openEdit} onToggle={toggleActive} onDelete={remove} onRotateSecret={rotateSecret} />
                    ))}
                  </div>
                </BlockStack>
              )}
              {inactive.length > 0 && (
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">Inaktiv ({inactive.length})</Text>
                  <div style={{ display: "grid", gap: 10 }}>
                    {inactive.map((i) => (
                      <IntegrationCard key={i.id} integration={i} onEdit={openEdit} onToggle={toggleActive} onDelete={remove} onRotateSecret={rotateSecret} />
                    ))}
                  </div>
                </BlockStack>
              )}
            </BlockStack>
          )}
        </IntegrationsAccordion>
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={createdCreds ? "Zugangsdaten" : editingId ? "Integration bearbeiten" : "Integration anlegen"}
        primaryAction={
          createdCreds
            ? { content: "Schließen", onAction: closeModal }
            : { content: "Speichern", onAction: save, loading: saving }
        }
        secondaryActions={createdCreds ? [] : [{ content: "Abbrechen", onAction: closeModal }]}
      >
        <Modal.Section>
          {createdCreds ? (
            <BlockStack gap="400">
              <Banner tone="warning">
                Einmalig anzeigen: notiere den Sicherheitsschlüssel sicher. Bei Verlust kannst du einen neuen erzeugen.
              </Banner>
              <Text as="p" variant="bodyMd"><strong>{createdCreds.name}</strong></Text>
              <TextField label="Zugangs-ID" value={createdCreds.zugang} readOnly autoComplete="off" multiline={2} />
              <Button onClick={() => copy(createdCreds.zugang)}>Zugangs-ID kopieren</Button>
              <TextField label="Sicherheitsschlüssel" value={createdCreds.secret} readOnly autoComplete="off" multiline={3} />
              <Button onClick={() => copy(createdCreds.secret)}>Sicherheitsschlüssel kopieren</Button>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <TextField
                label="Name"
                value={formName}
                onChange={setFormName}
                autoComplete="off"
                placeholder="z. B. Warenwirtschaft XY, Eigenes Tool…"
                helpText="Andertal erzeugt Zugangs-ID und Sicherheitsschlüssel automatisch nach dem Speichern."
              />
              {editingId && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Der Name kann geändert werden. Zugangs-ID bleibt gleich.
                </Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
