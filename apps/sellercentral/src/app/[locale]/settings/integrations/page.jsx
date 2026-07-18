"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Page, Text, BlockStack, InlineStack, TextField,
  Button, Banner, Badge, Modal, EmptyState, Divider, Box,
} from "@shopify/polaris";
import { ChevronDownIcon } from "@shopify/polaris-icons";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import MarketingAccountsSection from "@/components/settings/MarketingAccountsSection";
import BillbeeSettingsPage from "@/components/pages/settings/BillbeeSettingsPage";
import { confirmDelete } from "@/lib/confirm-delete";
import { useUI } from "@/lib/ui-strings";
import { getIntegrationsCopy, getSmtpProviders } from "@/lib/integrations-i18n";

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

function IntegrationCard({ integration, onEdit, onToggle, onDelete, onRotateSecret, copy, ui }) {
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
            {integration.is_active ? copy.activeBadge : copy.inactiveBadge}
          </Badge>
        </InlineStack>
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
          {integration.api_key && (
            <>
              <span style={{ fontWeight: 600, color: "#374151" }}>{copy.accessId}</span>
              <span style={{ fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {maskKey(integration.api_key)}
              </span>
            </>
          )}
          <span style={{ fontWeight: 600, color: "#374151" }}>{copy.securityKey}</span>
          <span style={{ color: "#9ca3af" }}>{copy.keyStored}</span>
        </div>
        <InlineStack gap="200" blockAlign="center" style={{ marginTop: 10 }}>
          <Button size="slim" onClick={() => onEdit(integration)}>{ui.edit}</Button>
          <Button size="slim" onClick={() => onToggle(integration)}>
            {integration.is_active ? copy.deactivate : copy.activate}
          </Button>
          <Button size="slim" onClick={() => onRotateSecret(integration)}>{copy.newKey}</Button>
          <Button size="slim" tone="critical" variant="plain" onClick={() => onDelete(integration)}>{ui.delete}</Button>
        </InlineStack>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegrationsSettingsPage() {
  const locale = useLocale();
  const ui = useUI();
  const copy = useMemo(() => getIntegrationsCopy(locale), [locale]);
  const smtpProviders = useMemo(() => getSmtpProviders(locale), [locale]);
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
      setMsg({ tone: "critical", text: e?.message || copy.loadError });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (su) load();
    else setLoading(false);
  }, [load]);

  const openCreate = () => { setEditingId(null); setFormName(""); setCreatedCreds(null); setModalOpen(true); };
  const openEdit = (i) => { setEditingId(i.id); setFormName(i.name || ""); setCreatedCreds(null); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingId(null); setFormName(""); setCreatedCreds(null); };

  const save = async () => {
    if (!formName.trim()) { setMsg({ tone: "warning", text: copy.enterName }); return; }
    setSaving(true); setMsg(null);
    try {
      if (editingId) {
        await client.updateIntegration(editingId, { name: formName.trim(), is_active: true });
        setMsg({ tone: "success", text: copy.updated });
        closeModal(); await load();
      } else {
        const data = await client.saveIntegration({ name: formName.trim(), category: "custom", is_active: true });
        const integ = data?.integration;
        if (integ?.api_key && integ?.api_secret) {
          setCreatedCreds({ name: integ.name, zugang: integ.api_key, secret: integ.api_secret });
        }
        setMsg({ tone: "success", text: copy.credentialsCreated });
        await load();
      }
    } catch (e) { setMsg({ tone: "critical", text: e?.message || copy.saveError }); }
    finally { setSaving(false); }
  };

  const rotateSecret = async (integration) => {
    if (!(await confirmDelete(copy.rotateConfirm))) return;
    try {
      const data = await client.updateIntegration(integration.id, { regenerate_secret: true });
      const sec = data?.integration?.api_secret;
      if (sec) {
        setCreatedCreds({ name: integration.name, zugang: data.integration?.api_key || integration.api_key, secret: sec });
        setModalOpen(true); setEditingId(null); setFormName("");
      }
      setMsg({ tone: "success", text: copy.rotateSaved });
      await load();
    } catch (e) { setMsg({ tone: "critical", text: e?.message || copy.rotateError }); }
  };

  const toggleActive = async (integration) => {
    try {
      await client.updateIntegration(integration.id, { is_active: !integration.is_active });
      setIntegrations((prev) => prev.map((i) => i.id === integration.id ? { ...i, is_active: !i.is_active } : i));
    } catch (e) { setMsg({ tone: "critical", text: e?.message || copy.statusError }); }
  };

  const remove = async (integration) => {
    if (!(await confirmDelete(copy.deleteConfirm(integration.name)))) return;
    try {
      await client.deleteIntegration(integration.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
      setMsg({ tone: "success", text: copy.deleted });
    } catch (e) { setMsg({ tone: "critical", text: e?.message || copy.deleteError }); }
  };

  const copyText = (text) => { if (text) navigator.clipboard.writeText(String(text)); };

  const active   = integrations.filter((i) => i.is_active);
  const inactive = integrations.filter((i) => !i.is_active);

  return (
    <Page
      title={copy.pageTitle}
      primaryAction={isSuperuser ? { content: copy.createIntegration, onAction: openCreate } : undefined}
    >
      <BlockStack gap="400">
        {msg && <Banner tone={msg.tone} onDismiss={() => setMsg(null)}>{msg.text}</Banner>}

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

        <IntegrationsAccordion
          sectionId="billbee"
          open={openSection === "billbee"}
          onToggle={() => toggleSection("billbee")}
          logo={<LogoBillbee />}
          title={copy.billbeeTitle}
          subtitle={copy.billbeeSub}
        >
          <BillbeeSettingsPage embedded />
        </IntegrationsAccordion>

        {isSuperuser && (
          <IntegrationsAccordion
            sectionId="api"
            open={openSection === "api"}
            onToggle={() => toggleSection("api")}
            logo={<LogoApi />}
            title={copy.apiTitle}
            subtitle={copy.apiSub}
            headerExtra={
              !loading && integrations.length > 0 ? (
                <Badge tone="info">{integrations.length}</Badge>
              ) : null
            }
          >
            {loading ? (
              <Box padding="400"><Text tone="subdued">{ui.loading}</Text></Box>
            ) : integrations.length === 0 ? (
              <EmptyState heading={copy.noIntegrations}>
                <p>{copy.noIntegrationsBody}</p>
                <Button variant="primary" onClick={openCreate}>{copy.createIntegration}</Button>
              </EmptyState>
            ) : (
              <BlockStack gap="400">
                {active.length > 0 && (
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingSm">{copy.active(active.length)}</Text>
                      <Button size="slim" onClick={load} loading={loading}>{ui.refresh}</Button>
                    </InlineStack>
                    <div style={{ display: "grid", gap: 10 }}>
                      {active.map((i) => (
                        <IntegrationCard key={i.id} integration={i} onEdit={openEdit} onToggle={toggleActive} onDelete={remove} onRotateSecret={rotateSecret} copy={copy} ui={ui} />
                      ))}
                    </div>
                  </BlockStack>
                )}
                {inactive.length > 0 && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">{copy.inactive(inactive.length)}</Text>
                    <div style={{ display: "grid", gap: 10 }}>
                      {inactive.map((i) => (
                        <IntegrationCard key={i.id} integration={i} onEdit={openEdit} onToggle={toggleActive} onDelete={remove} onRotateSecret={rotateSecret} copy={copy} ui={ui} />
                      ))}
                    </div>
                  </BlockStack>
                )}
              </BlockStack>
            )}
          </IntegrationsAccordion>
        )}
      </BlockStack>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={createdCreds ? copy.modalCredentials : editingId ? copy.modalEdit : copy.modalCreate}
        primaryAction={
          createdCreds
            ? { content: ui.close, onAction: closeModal }
            : { content: ui.save, onAction: save, loading: saving }
        }
        secondaryActions={createdCreds ? [] : [{ content: ui.cancel, onAction: closeModal }]}
      >
        <Modal.Section>
          {createdCreds ? (
            <BlockStack gap="400">
              <Banner tone="warning">
                {copy.oneTimeWarning}
              </Banner>
              <Text as="p" variant="bodyMd"><strong>{createdCreds.name}</strong></Text>
              <TextField label={copy.accessId} value={createdCreds.zugang} readOnly autoComplete="off" multiline={2} />
              <Button onClick={() => copyText(createdCreds.zugang)}>{copy.copyAccessId}</Button>
              <TextField label={copy.securityKey} value={createdCreds.secret} readOnly autoComplete="off" multiline={3} />
              <Button onClick={() => copyText(createdCreds.secret)}>{copy.copySecurityKey}</Button>
            </BlockStack>
          ) : (
            <BlockStack gap="400">
              <TextField
                label={ui.colName}
                value={formName}
                onChange={setFormName}
                autoComplete="off"
                placeholder={copy.namePlaceholder}
                helpText={copy.nameHelp}
              />
              {editingId && (
                <Text as="p" tone="subdued" variant="bodySm">
                  {copy.nameEditHint}
                </Text>
              )}
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
