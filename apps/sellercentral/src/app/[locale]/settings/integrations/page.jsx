"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import {
  Page, Text, BlockStack, InlineStack, TextField,
  Button, Banner, Badge, Modal, Divider, Box,
} from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import MarketingAccountsSection from "@/components/settings/MarketingAccountsSection";
import AppStoreHub, { useInstalledApps } from "@/components/settings/AppStoreHub";
import { confirmDelete } from "@/lib/confirm-delete";
import { useUI } from "@/lib/ui-strings";
import { getIntegrationsCopy, getSmtpProviders } from "@/lib/integrations-i18n";
import { appDisplayName, getAppStoreCopy } from "@/lib/app-store-i18n";
import { lt } from "@/lib/locale-text";

const client = getMedusaAdminClient();

function SmtpSection({ copy, ui, smtpProviders }) {
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
    const p = smtpProviders.find((p) => p.value === value);
    if (p) setForm((f) => ({ ...f, provider: value, host: p.host, port: p.port, secure: p.secure }));
  };

  const handleSave = async () => {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await client.updateSmtpSettings(form);
      setSaved(true);
      setTestResult(null);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setErr(e?.message || copy.smtpSaveError); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await client.testSmtpSettings();
      setTestResult({ ok: true, msg: r?.message || copy.smtpTestOk });
    } catch (e) {
      setTestResult({ ok: false, msg: e?.message || copy.smtpTestFail });
    }
    setTesting(false);
  };

  const selectedProvider = smtpProviders.find((p) => p.value === form.provider);

  if (loading) return <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>;

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">{copy.smtpProvider}</Text>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {smtpProviders.map((p) => (
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

      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">{copy.smtpServer}</Text>
        <InlineStack gap="300" blockAlign="end" wrap={false}>
          <div style={{ flex: 1 }}>
            <TextField
              label={copy.smtpHost}
              value={form.host}
              onChange={(v) => setForm((f) => ({ ...f, host: v }))}
              placeholder="smtp.gmail.com"
              autoComplete="off"
            />
          </div>
          <div style={{ width: 90 }}>
            <TextField
              label={copy.smtpPort}
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
          {copy.smtpSsl}
        </label>
        <TextField
          label={copy.smtpUsername}
          value={form.username}
          onChange={(v) => setForm((f) => ({ ...f, username: v }))}
          placeholder="you@domain.com"
          type="email"
          autoComplete="off"
        />
        <TextField
          label={copy.smtpPassword}
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder={copy.smtpPasswordPlaceholder}
          type="password"
          helpText={copy.smtpPasswordHelp}
          autoComplete="off"
        />
      </BlockStack>

      <Divider />

      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">{copy.smtpFrom}</Text>
        <TextField
          label={copy.smtpFromName}
          value={form.from_name}
          onChange={(v) => setForm((f) => ({ ...f, from_name: v }))}
          placeholder="Andertal Shop"
          autoComplete="off"
        />
        <TextField
          label={copy.smtpFromEmail}
          value={form.from_email}
          onChange={(v) => setForm((f) => ({ ...f, from_email: v }))}
          placeholder="noreply@andertal.de"
          type="email"
          helpText={copy.smtpFromEmailHelp}
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
          {saved ? copy.smtpSaved : ui.save}
        </Button>
        <Button onClick={handleTest} loading={testing}>
          {copy.smtpTest}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

/** Alternative outbound provider for flow-automation emails (Content → Flows), used instead of
 * SMTP when connected. Resend rejects sends whose "from" domain isn't verified in the Resend
 * account — the test button lists verified domains so a mismatch is visible immediately instead
 * of silently falling back to whatever sender the flow step wasn't actually able to use. */
function ResendSection({ copy, ui }) {
  const locale = useLocale();
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getMedusaAdminClient().getResendIntegration()
      .then((d) => {
        if (d?.configured || d?.api_key) {
          setApiKey(d.api_key || "");
          setIsActive(d.is_active !== false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setErr("");
    try {
      const r = await getMedusaAdminClient().testResendIntegration({ api_key: apiKey.trim() });
      const domains = Array.isArray(r?.domains) ? r.domains : [];
      const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
      const msg = domains.length === 0
        ? lt(locale, "Connected, but no domains found in this Resend account.", "Bağlandı, ancak bu Resend hesabında hiç alan adı yok.", "Connecté, mais aucun domaine trouvé dans ce compte Resend.", "Conectado, pero no se encontraron dominios en esta cuenta de Resend.", "Connesso, ma nessun dominio trovato in questo account Resend.", "Verbunden, aber keine Domains in diesem Resend-Konto gefunden.")
        : lt(locale, `Connected. Verified domains: ${verified.join(", ") || "none"}.`, `Bağlandı. Doğrulanmış alan adları: ${verified.join(", ") || "yok"}.`, `Connecté. Domaines vérifiés : ${verified.join(", ") || "aucun"}.`, `Conectado. Dominios verificados: ${verified.join(", ") || "ninguno"}.`, `Connesso. Domini verificati: ${verified.join(", ") || "nessuno"}.`, `Verbunden. Verifizierte Domains: ${verified.join(", ") || "keine"}.`);
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: e?.message || copy.connectionFailed });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) { setErr(copy.keysRequired); return; }
    setSaving(true); setErr(""); setSaved(false);
    try {
      await getMedusaAdminClient().saveResendIntegration({ api_key: apiKey.trim(), is_active: isActive });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e?.message || copy.saveError);
    }
    setSaving(false);
  };

  if (loading) return <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>;

  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm">Resend</Text>
        {saved && <Badge tone="success">{copy.saved}</Badge>}
      </InlineStack>
      <Text as="p" variant="bodySm" tone="subdued">
        {lt(locale, "Used instead of SMTP for Content → Flows emails when connected.", "Bağlandığında Content → Flows e-postaları için SMTP yerine kullanılır.", "Utilisé à la place du SMTP pour les e-mails Content → Flows lorsqu'il est connecté.", "Se usa en lugar de SMTP para los correos de Content → Flows cuando está conectado.", "Usato al posto di SMTP per le e-mail Content → Flows quando connesso.", "Wird bei Verbindung anstelle von SMTP für Content → Flows-E-Mails verwendet.")}
      </Text>
      <TextField
        label={lt(locale, "API key", "API anahtarı", "Clé API", "Clave API", "Chiave API", "API-Schlüssel")}
        type={showKey ? "text" : "password"}
        value={apiKey}
        onChange={(v) => { setApiKey(v); setTestResult(null); }}
        placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
        autoComplete="off"
        monospaced
        suffix={
          <Button variant="plain" size="slim" onClick={() => setShowKey((s) => !s)}>
            {showKey ? copy.hide : copy.show}
          </Button>
        }
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        {copy.active}
      </label>

      {err && <Banner tone="critical" onDismiss={() => setErr("")}>{err}</Banner>}
      {testResult && (
        <Banner tone={testResult.ok ? "success" : "critical"} onDismiss={() => setTestResult(null)}>
          {testResult.msg}
        </Banner>
      )}

      <InlineStack gap="300">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {saved ? copy.saved : ui.save}
        </Button>
        <Button onClick={handleTest} loading={testing} disabled={!apiKey.trim()}>
          {ui.test || copy.smtpTest}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

/** Manage From identities (same SMTP credentials); test each; one is default / main. */
function SmtpSendersSection({ onToast, copy, ui }) {
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testForId, setTestForId] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [testingId, setTestingId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editing, setEditing] = useState(false);

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
      onToast?.({ tone: "critical", text: copy.testEmailInvalid });
      return;
    }
    setTestingId(testForId);
    try {
      await client.testSmtpSender(testForId, { to });
      onToast?.({ tone: "success", text: copy.testEmailSent });
      setTestForId(null);
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.testFailed });
      await load();
    } finally {
      setTestingId(null);
    }
  };

  const setMain = async (id) => {
    try {
      await client.setDefaultSmtpSender(id);
      onToast?.({ tone: "success", text: copy.mainUpdated });
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.saveFailed });
    }
  };

  const removeSender = async (row) => {
    if (!(await confirmDelete(copy.deleteSenderConfirm(row.from_email)))) return;
    try {
      await client.deleteSmtpSender(row.id);
      onToast?.({ tone: "success", text: copy.deletedShort });
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.deleteFailed });
    }
  };

  const addSender = async () => {
    const fe = newEmail.trim();
    if (!fe) {
      onToast?.({ tone: "critical", text: copy.emailRequired });
      return;
    }
    setAdding(true);
    try {
      await client.createSmtpSender({ from_email: fe, from_name: newName.trim() || undefined });
      onToast?.({ tone: "success", text: copy.senderAdded });
      setAddOpen(false);
      setNewEmail("");
      setNewName("");
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.addFailed });
    }
    setAdding(false);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setEditEmail(row.from_email || "");
    setEditName(row.from_name || "");
  };

  const saveEdit = async () => {
    const fe = editEmail.trim();
    if (!fe) {
      onToast?.({ tone: "critical", text: copy.emailRequired });
      return;
    }
    setEditing(true);
    try {
      await client.updateSmtpSender(editRow.id, { from_email: fe, from_name: editName.trim() || undefined });
      onToast?.({ tone: "success", text: copy.senderUpdated });
      setEditRow(null);
      await load();
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.updateFailed });
    }
    setEditing(false);
  };

  if (loading) return <Box padding="400"><Text tone="subdued">{copy.sendersLoading}</Text></Box>;

  return (
    <BlockStack gap="400">
      <Text as="h3" variant="headingSm">{copy.sendersTitle}</Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {copy.sendersSub}
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
              <Badge tone="success">{copy.mainSender}</Badge>
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
              <Button size="slim" onClick={() => setMain(row.id)}>{copy.setMain}</Button>
            )}
            <Button size="slim" onClick={() => openEdit(row)}>{ui.edit}</Button>
            <Button size="slim" onClick={() => openTest(row.id)}>Test</Button>
            <Button size="slim" tone="critical" variant="plain" onClick={() => removeSender(row)}>{ui.delete}</Button>
          </div>
        ))}
      </div>
      <Button onClick={() => setAddOpen(true)}>{copy.addSender}</Button>

      <Modal
        open={!!testForId}
        onClose={() => setTestForId(null)}
        title={copy.testSender}
        primaryAction={{ content: ui.send, onAction: runTest, loading: testingId != null }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setTestForId(null) }]}
      >
        <Modal.Section>
          <TextField
            label={copy.testEmailLabel}
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
        title={copy.addSender}
        primaryAction={{ content: ui.add, onAction: addSender, loading: adding }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setAddOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label={copy.senderEmail} type="email" value={newEmail} onChange={setNewEmail} autoComplete="off" />
            <TextField label={copy.senderNameOptional} value={newName} onChange={setNewName} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={copy.editSender}
        primaryAction={{ content: ui.save, onAction: saveEdit, loading: editing }}
        secondaryActions={[{ content: ui.cancel, onAction: () => setEditRow(null) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField label={copy.senderEmail} type="email" value={editEmail} onChange={setEditEmail} autoComplete="off" />
            <TextField label={copy.senderNameOptional} value={editName} onChange={setEditName} autoComplete="off" />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}

// ─── Trustpilot (superuser — storefront TrustBox) ─────────────────────────────

function TrustpilotSuperuserSection({ onToast, copy, ui }) {
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
      onToast?.({ tone: "critical", text: copy.trustpilotBuRequired });
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
      onToast?.({ tone: "success", text: copy.trustpilotSaved });
    } catch (e) {
      onToast?.({ tone: "critical", text: e?.message || copy.saveFailed });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Box padding="400"><Text tone="subdued">{copy.trustpilotLoading}</Text></Box>
    );
  }

  return (
    <BlockStack gap="400">
      <Text as="p" variant="bodySm" tone="subdued">
        {copy.trustpilotIntro}
      </Text>
      <TextField
        label={copy.businessUnitId}
        value={businessUnitId}
        onChange={setBusinessUnitId}
        autoComplete="off"
        placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        helpText={copy.businessUnitHelp}
      />
      <TextField
        label={copy.templateId}
        value={templateId}
        onChange={setTemplateId}
        autoComplete="off"
        placeholder={copy.templatePlaceholder}
        helpText={copy.templateHelp}
      />
      <TextField
        label={copy.evaluateUrl}
        value={evaluateUrl}
        onChange={setEvaluateUrl}
        autoComplete="off"
        placeholder="https://www.trustpilot.com/evaluate/your-domain.com"
        helpText={copy.evaluateHelp}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        {copy.widgetActive}
      </label>
      <InlineStack gap="300">
        <Button variant="primary" onClick={save} loading={saving}>
          {ui.save}
        </Button>
      </InlineStack>
      <Banner tone="info">
        {copy.trustpilotBanner}
      </Banner>
    </BlockStack>
  );
}

// ─── API Integrations ────────────────────────────────────────────────────────

function maskKey(val) {
  const s = String(val || "");
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}${"•".repeat(Math.min(16, s.length - 8))}${s.slice(-4)}`;
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

function LogoDocuments() {
  return (
    <AccordionLogoWrap bg="#eff6ff">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#1d4ed8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2v6h6" stroke="#1d4ed8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </AccordionLogoWrap>
  );
}

const DOCUMENT_TYPE_KEYS = ["invoice", "lieferschein", "retourelabel"];

function documentSourcesCopy(locale) {
  const t = (en, tr, fr, es, it, de) => lt(locale, en, tr, fr, es, it, de);
  return {
    title: t("Document sources", "Belge kaynakları", "Sources des documents", "Fuentes de documentos", "Fonti dei documenti", "Beleg-Quellen"),
    sub: t(
      "Choose whether invoices, delivery notes and return labels come from Andertal or your own ERP.",
      "Fatura, irsaliye ve iade etiketinin Andertal'dan mı yoksa kendi ERP sisteminizden mi geleceğini seçin.",
      "Choisissez si les factures, bons de livraison et étiquettes de retour proviennent d'Andertal ou de votre propre ERP.",
      "Elige si las facturas, albaranes y etiquetas de devolución provienen de Andertal o de tu propio ERP.",
      "Scegli se fatture, bolle di consegna ed etichette di reso provengono da Andertal o dal tuo ERP.",
      "Wähle, ob Rechnungen, Lieferscheine und Retourenetiketten von Andertal oder deinem eigenen ERP-System kommen.",
    ),
    intro: t(
      "By default Andertal generates these documents for you automatically. If your own system (ERP, accounting software, warehouse system) already produces them, switch a document type to \"My own system\" — connected apps from the App Store appear below.",
      "Varsayılan olarak bu belgeleri Andertal sizin için otomatik oluşturur. Kendi sisteminiz (ERP, muhasebe yazılımı, depo sistemi) bunları zaten üretiyorsa, ilgili belge türünü \"Kendi sistemim\"e çevirin — App Store’dan bağlanan uygulamalar altta görünür.",
      "Par défaut, Andertal génère ces documents automatiquement. Si votre propre système les produit déjà, basculez sur « Mon propre système » — les apps connectées de l’App Store apparaissent en dessous.",
      "Por defecto Andertal genera estos documentos. Si tu propio sistema ya los produce, cambia a «Mi propio sistema» — las apps conectadas del App Store aparecen debajo.",
      "Per impostazione predefinita Andertal genera questi documenti. Se il tuo sistema li produce già, imposta \"Il mio sistema\" — le app connesse dell’App Store appaiono sotto.",
      "Standardmäßig erstellt Andertal diese Dokumente. Falls dein eigenes System sie bereits erzeugt, stelle auf „Mein eigenes System“ um — verbundene Apps aus dem App Store erscheinen darunter.",
    ),
    invoice: t("Invoice", "Fatura", "Facture", "Factura", "Fattura", "Rechnung"),
    lieferschein: t("Delivery note", "İrsaliye", "Bon de livraison", "Albarán", "Bolla di consegna", "Lieferschein"),
    retourelabel: t("Return label", "İade etiketi", "Étiquette de retour", "Etiqueta de devolución", "Etichetta di reso", "Retourenetikett"),
    platform: t("Andertal generates it", "Andertal oluştursun", "Andertal génère", "Andertal genera", "Andertal genera", "Andertal erstellt"),
    customerApi: t("My own system", "Kendi sistemim", "Mon propre système", "Mi propio sistema", "Il mio sistema", "Mein eigenes System"),
    save: t("Save", "Kaydet", "Enregistrer", "Guardar", "Salva", "Speichern"),
    saved: t("Saved.", "Kaydedildi.", "Enregistré.", "Guardado.", "Salvato.", "Gespeichert."),
    saveError: t("Could not save", "Kaydedilemedi", "Échec de l'enregistrement", "No se pudo guardar", "Salvataggio non riuscito", "Speichern fehlgeschlagen"),
    connectedTitle: t("Connected integrations", "Bağlı entegrasyonlar", "Intégrations connectées", "Integraciones conectadas", "Integrazioni connesse", "Verbundene Integrationen"),
    findInStore: t("Find your product in the App Store", "Ürününü App Store’da bul", "Trouver votre produit dans l’App Store", "Encuentra tu producto en el App Store", "Trova il tuo prodotto nell’App Store", "Dein Produkt im App Store finden"),
    findInStoreBody: t(
      "Install the ERP or accounting app you use, then configure the connection.",
      "Kullandığınız ERP veya muhasebe uygulamasını yükleyin, ardından bağlantıyı yapılandırın.",
      "Installez l’app ERP ou comptable que vous utilisez, puis configurez la connexion.",
      "Instala la app de ERP o contabilidad que uses y configura la conexión.",
      "Installa l’app ERP o contabile che usi, poi configura la connessione.",
      "Installiere die ERP- oder Buchhaltungs-App, die du nutzt, und konfiguriere danach die Verbindung.",
    ),
    goConfigure: t("Connect", "Bağlan", "Connecter", "Conectar", "Collega", "Verbinden"),
  };
}

function DocumentSourcesSection({ ui, onFindInStore, onConfigureApp }) {
  const locale = useLocale();
  const t = useMemo(() => documentSourcesCopy(locale), [locale]);
  const storeCopy = useMemo(() => getAppStoreCopy(locale), [locale]);
  const [sources, setSources] = useState({ invoice: "platform", lieferschein: "platform", retourelabel: "platform" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const { installations, loading: loadingApps } = useInstalledApps();

  useEffect(() => {
    client.getDocumentSources()
      .then((ds) => setSources((s) => ({ ...s, ...(ds?.document_sources || {}) })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setType = (key, value) => setSources((s) => ({ ...s, [key]: value }));
  const anyCustomerApi = DOCUMENT_TYPE_KEYS.some((k) => sources[k] === "customer_api");

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await client.updateDocumentSources(sources);
      setMsg({ tone: "success", text: t.saved });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) { setMsg({ tone: "critical", text: e?.message || t.saveError }); }
    setSaving(false);
  };

  if (loading) return <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>;

  return (
    <BlockStack gap="400">
      {msg && <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}
      <Text as="p" variant="bodySm" tone="subdued">{t.intro}</Text>
      <BlockStack gap="300">
        {DOCUMENT_TYPE_KEYS.map((key) => (
          <InlineStack key={key} gap="200" blockAlign="center" wrap>
            <Box minWidth="160px"><Text as="span" fontWeight="semibold">{t[key]}</Text></Box>
            <Button size="slim" variant={sources[key] !== "customer_api" ? "primary" : "secondary"} onClick={() => setType(key, "platform")}>
              {t.platform}
            </Button>
            <Button size="slim" variant={sources[key] === "customer_api" ? "primary" : "secondary"} onClick={() => setType(key, "customer_api")}>
              {t.customerApi}
            </Button>
          </InlineStack>
        ))}
      </BlockStack>
      <Box><Button variant="primary" onClick={save} loading={saving}>{t.save}</Button></Box>

      {anyCustomerApi && (
        <>
          <Divider />
          <BlockStack gap="300">
            <Text as="h3" variant="headingSm">{t.connectedTitle}</Text>
            {loadingApps ? (
              <Text as="p" tone="subdued" variant="bodySm">{ui.loading}</Text>
            ) : installations.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">{t.findInStoreBody}</Text>
                <Button onClick={onFindInStore}>{t.findInStore}</Button>
              </BlockStack>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {installations.map((inst) => {
                  const connected = !!inst.connected;
                  const apiKey = inst.api_key || inst.settings?.api_key || inst.client_id || "";
                  return (
                    <div
                      key={inst.id}
                      style={{
                        background: "#fff",
                        border: `1px solid ${connected ? "#d1fae5" : "#e5e7eb"}`,
                        borderRadius: 10,
                        padding: "14px 16px",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="start" wrap>
                        <BlockStack gap="100">
                          <Text as="span" fontWeight="semibold">{appDisplayName(inst)}</Text>
                          {apiKey ? (
                            <Text as="p" variant="bodySm" tone="subdued">
                              {storeCopy.apiKey}: {maskKey(apiKey)}
                            </Text>
                          ) : null}
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={connected ? "success" : "critical"}>
                            {connected ? storeCopy.connectionOk : storeCopy.connectionFail}
                          </Badge>
                          {!connected ? (
                            <Button size="slim" variant="primary" onClick={() => onConfigureApp?.(inst)}>
                              {t.goConfigure}
                            </Button>
                          ) : (
                            <Button size="slim" onClick={() => onConfigureApp?.(inst)}>
                              {storeCopy.configure}
                            </Button>
                          )}
                        </InlineStack>
                      </InlineStack>
                    </div>
                  );
                })}
              </div>
            )}
          </BlockStack>
        </>
      )}
    </BlockStack>
  );
}


function IntegrationsSettingsPageInner() {
  const locale = useLocale();
  const ui = useUI();
  const copy = useMemo(() => getIntegrationsCopy(locale), [locale]);
  const smtpProviders = useMemo(() => getSmtpProviders(locale), [locale]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openSection, setOpenSection] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [msg, setMsg] = useState(null);

  const tab = searchParams.get("tab") === "installed" ? "installed" : "store";
  const appHandle = searchParams.get("app") || "";

  const setHubTab = (nextTab) => {
    const params = new URLSearchParams();
    params.set("tab", nextTab);
    router.replace("/settings/integrations?" + params.toString());
  };

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  const toggleSection = (key) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  return (
    <Page title={copy.pageTitle}>
      <BlockStack gap="400">
        {msg && <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}

        <AppStoreHub
          selectedTab={tab}
          onTabChange={setHubTab}
          highlightHandle={appHandle}
          onFindStoreConsumed={() => {
            if (appHandle) router.replace("/settings/integrations?tab=store");
          }}
        />

        <IntegrationsAccordion
          sectionId="documents"
          open={openSection === "documents"}
          onToggle={() => toggleSection("documents")}
          logo={<LogoDocuments />}
          title={documentSourcesCopy(locale).title}
          subtitle={documentSourcesCopy(locale).sub}
        >
          <DocumentSourcesSection
            ui={ui}
            onFindInStore={() => setHubTab("store")}
            onConfigureApp={() => setHubTab("installed")}
          />
        </IntegrationsAccordion>

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="email"
            open={openSection === "email"}
            onToggle={() => toggleSection("email")}
            logo={<LogoMail />}
            title={copy.emailTitle}
            subtitle={copy.emailSub}
          >
            <BlockStack gap="400">
              <SmtpSection copy={copy} ui={ui} smtpProviders={smtpProviders} />
              <Divider />
              <SmtpSendersSection onToast={setMsg} copy={copy} ui={ui} />
              <Divider />
              <ResendSection copy={copy} ui={ui} />
            </BlockStack>
          </IntegrationsAccordion>
        )}

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="trustpilot"
            open={openSection === "trustpilot"}
            onToggle={() => toggleSection("trustpilot")}
            logo={<LogoTrustpilot />}
            title={copy.trustpilotTitle}
            subtitle={copy.trustpilotSub}
          >
            <TrustpilotSuperuserSection onToast={setMsg} copy={copy} ui={ui} />
          </IntegrationsAccordion>
        )}

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="marketing"
            open={openSection === "marketing"}
            onToggle={() => toggleSection("marketing")}
            logo={<LogoMarketing />}
            title={copy.marketingTitle}
            subtitle={copy.marketingSub}
          >
            <MarketingAccountsSection hideFooterHint />
          </IntegrationsAccordion>
        )}
      </BlockStack>
    </Page>
  );
}

export default function IntegrationsSettingsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsSettingsPageInner />
    </Suspense>
  );
}
