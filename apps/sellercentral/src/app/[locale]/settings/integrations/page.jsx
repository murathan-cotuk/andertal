"use client";

import React, { useState, useEffect } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const CATALOG = [
  {
    name: "billbee",
    slug: "billbee",
    logo: "🐝",
    category: "erp",
    description: "Multichannel-Auftragsabwicklung & Lagerverwaltung",
    fieldLabels: {
      api_key: "Schlüssel",
      api_key_placeholder: "Billbee API-Schlüssel…",
      api_secret: "Basic Auth Passwort",
      api_secret_placeholder: "••••••••",
      basic_auth_username: "Basic Auth Benutzername",
      basic_auth_username_placeholder: "Benutzername eingeben…",
    },
    helpText: "Billbee benötigt: API-Schlüssel + Basic-Auth Benutzername + Basic-Auth Passwort.",
  },
  { name: "xentral", slug: "xentral", logo: "⚡", category: "erp", description: "ERP-System für E-Commerce" },
  { name: "JTL-Wawi", slug: "jtl-wawi", logo: "🏪", category: "erp", description: "Warenwirtschaft & Fulfillment" },
  { name: "Shopify", slug: "shopify", logo: "🛍", category: "marketplace", description: "E-Commerce-Plattform" },
  { name: "Amazon", slug: "amazon", logo: "📦", category: "marketplace", description: "Amazon Seller Central" },
  { name: "eBay", slug: "ebay", logo: "🔵", category: "marketplace", description: "Auktions- und Handelsplattform" },
  { name: "Stripe", slug: "stripe", logo: "💳", category: "payment", description: "Online-Zahlungsabwicklung" },
  { name: "PayPal", slug: "paypal", logo: "🅿", category: "payment", description: "PayPal Zahlungen" },
  { name: "Klarna", slug: "klarna", logo: "🛒", category: "payment", description: "BNPL & Zahlungsabwicklung" },
  { name: "Mailchimp", slug: "mailchimp", logo: "🐒", category: "marketing", description: "E-Mail-Marketing" },
  { name: "Klaviyo", slug: "klaviyo", logo: "📧", category: "marketing", description: "E-Commerce E-Mail & SMS" },
  { name: "Google Analytics", slug: "google-analytics", logo: "📊", category: "analytics", description: "Web-Analyse" },
  {
    name: "PostHog", slug: "posthog", logo: "🦔", category: "analytics",
    description: "Product analytics, session replays & feature flags (GDPR-konform, EU-Cloud)",
    fieldLabels: {
      api_key: "Project API Key",
      api_key_placeholder: "phc_xxxxxxxxxxxxxxxxxxxx",
      api_secret: "Host (optional)",
      api_secret_placeholder: "https://eu.i.posthog.com",
    },
    helpText: "Project API Key aus PostHog → Project Settings → Project API Key. EU-Host: https://eu.i.posthog.com (Standard). Wird im Shop als NEXT_PUBLIC_POSTHOG_KEY gesetzt.",
  },
  {
    name: "Resend", slug: "resend", logo: "✉️", category: "marketing",
    description: "Transaktions-E-Mails per API (Bestellbestätigungen, Passwort-Reset u. a.)",
    fieldLabels: {
      api_key: "API Key",
      api_key_placeholder: "re_xxxxxxxxxxxxxxxxxxxx",
      api_secret: "Standard-Absender",
      api_secret_placeholder: "noreply@belucha.de",
    },
    helpText: "API Key aus Resend Dashboard → API Keys. Standard-Absender muss in Resend verifiziert sein.",
  },
  {
    name: "Unkey", slug: "unkey", logo: "🔑", category: "automation",
    description: "API Key Management — sichere externe Schnittstellen mit kurzlebigen API-Schlüsseln",
    fieldLabels: {
      api_key: "Root Key",
      api_key_placeholder: "unkey_xxxxxxxxxxxxxxxxxxxx",
      api_secret: "API ID",
      api_secret_placeholder: "api_xxxxxxxxxxxxxxxxxxxx",
    },
    helpText: "Root Key + API ID aus Unkey Dashboard. Wird für programmatische API-Schlüssel-Ausstellung verwendet.",
  },
  { name: "Slack", slug: "slack", logo: "💬", category: "communication", description: "Team-Kommunikation" },
  { name: "Zapier", slug: "zapier", logo: "⚡", category: "automation", description: "Workflow-Automatisierung" },
  {
    name: "Trustpilot", slug: "trustpilot", logo: "⭐", category: "reviews",
    description: "Bewertungsplattform — zeige Trustpilot-Widgets in deinem Shop",
    fieldLabels: {
      api_key: "Business Unit ID",
      api_key_placeholder: "z.B. 64a1b2c3d4e5f6a7b8c9d0e1",
      api_secret: "API Secret (optional, für zukünftige Anbindung)",
      api_secret_placeholder: "Trustpilot API Secret …",
    },
    helpText: "Business Unit ID: Trustpilot → Einstellungen → Unternehmensprofil. Optional: In der DB-Spalte `config` (JSON) z. B. {\"template_id\":\"DEIN_TEMPLATE_UUID\"} setzen — sonst Standard-Widget. Shop lädt /store/trustpilot-config.",
  },
];

const CATEGORIES = { erp: "ERP & Warenwirtschaft", marketplace: "Marktplätze", payment: "Zahlungen", marketing: "Marketing", analytics: "Analytics", reviews: "Bewertungen", automation: "Automatisierung", communication: "Kommunikation" };

export default function IntegrationsSettingsPage() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { app, integration? }
  const [form, setForm] = useState({ api_key: "", api_secret: "", webhook_url: "", basic_auth_username: "", basic_auth_password: "" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const client = getMedusaAdminClient();
    const data = await client.getIntegrations();
    setIntegrations(data.integrations || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getIntegration = (slug) => integrations.find(i => i.slug === slug);

  const openModal = (app) => {
    const existing = getIntegration(app.slug);
    setForm({ api_key: "", api_secret: "", webhook_url: existing?.webhook_url || "", basic_auth_username: "", basic_auth_password: "" });
    setModal({ app, integration: existing });
    setTestResult(null);
    setErr("");
  };

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      const client = getMedusaAdminClient();
      const isBillbee = modal.app.slug === "billbee";
      const billbeeConfig = isBillbee
        ? {
          ...(form.basic_auth_username ? { basic_auth_username: form.basic_auth_username } : {}),
          ...(form.basic_auth_password ? { basic_auth_password: form.basic_auth_password } : {}),
        }
        : undefined;
      const payload = {
        name: modal.app.name,
        slug: modal.app.slug,
        logo_url: modal.app.logo,
        category: modal.app.category,
        is_active: true,
        api_key: form.api_key,
        api_secret: form.api_secret,
        webhook_url: form.webhook_url,
        ...(billbeeConfig ? { config: billbeeConfig } : {}),
      };
      if (modal.integration) {
        await client.updateIntegration(modal.integration.id, {
          api_key: form.api_key || undefined,
          api_secret: form.api_secret || undefined,
          webhook_url: form.webhook_url,
          is_active: true,
          ...(billbeeConfig ? { config: billbeeConfig } : {}),
        });
      } else {
        await client.saveIntegration(payload);
      }
      await load();
      setModal(null);
    } catch (e) { setErr(e?.message || "Fehler"); }
    setSaving(false);
  };

  const handleBillbeeTest = async () => {
    if (!modal || modal.app.slug !== "billbee") return;
    setTesting(true);
    setErr("");
    setTestResult(null);
    try {
      const client = getMedusaAdminClient();
      const result = await client.testBillbeeIntegration({
        api_key: form.api_key || "",
        basic_auth_username: form.basic_auth_username || "",
        basic_auth_password: form.api_secret || "",
      });
      setTestResult({ ok: true, message: result?.message || "Verbindung erfolgreich." });
    } catch (e) {
      setTestResult({ ok: false, message: e?.message || "Verbindung fehlgeschlagen." });
    }
    setTesting(false);
  };

  const handleToggle = async (integration) => {
    const client = getMedusaAdminClient();
    await client.updateIntegration(integration.id, { is_active: !integration.is_active });
    setIntegrations(prev => prev.map(i => i.id === integration.id ? { ...i, is_active: !i.is_active } : i));
  };

  const handleDisconnect = async (integration) => {
    if (!confirm(`${integration.name} wirklich trennen?`)) return;
    const client = getMedusaAdminClient();
    await client.deleteIntegration(integration.id);
    setIntegrations(prev => prev.filter(i => i.id !== integration.id));
  };

  const inp = { padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, fontWeight: 500, color: "#374151", display: "block", marginBottom: 3 };

  const filteredCatalog = filter === "all" ? CATALOG : CATALOG.filter(a => a.category === filter);
  const connected = integrations.filter(i => i.is_active);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Apps & Integrationen</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Verbinde externe Dienste und Plattformen mit deinem Shop.</p>
      </div>

      {/* Connected apps */}
      {connected.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Verbunden ({connected.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {connected.map(i => {
              const app = CATALOG.find(a => a.slug === i.slug) || { logo: "🔌", description: "" };
              return (
                <div key={i.id} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 24, flexShrink: 0 }}>{app.logo}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{app.description}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>● Verbunden</span>
                      <button onClick={() => openModal(app)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Einstellungen</button>
                      <button onClick={() => handleDisconnect(i)} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Trennen</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("all")} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${filter === "all" ? "#2563eb" : "#e5e7eb"}`, background: filter === "all" ? "#eff6ff" : "#fff", color: filter === "all" ? "#1d4ed8" : "#374151", fontSize: 13, cursor: "pointer", fontWeight: filter === "all" ? 600 : 400 }}>Alle</button>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: "5px 14px", borderRadius: 20, border: `1px solid ${filter === k ? "#2563eb" : "#e5e7eb"}`, background: filter === k ? "#eff6ff" : "#fff", color: filter === k ? "#1d4ed8" : "#374151", fontSize: 13, cursor: "pointer", fontWeight: filter === k ? 600 : 400 }}>{v}</button>
        ))}
      </div>

      {/* App catalog */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {filteredCatalog.map(app => {
          const connected_integration = getIntegration(app.slug);
          return (
            <div key={app.slug} style={{ background: "#fff", border: `1px solid ${connected_integration ? "#bfdbfe" : "#e5e7eb"}`, borderRadius: 10, padding: "16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>{app.logo}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{app.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginBottom: 10 }}>{app.description}</div>
                {connected_integration ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", fontWeight: 600 }}>✓ Verbunden</span>
                    <button onClick={() => openModal(app)} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}>Bearbeiten</button>
                  </div>
                ) : (
                  <button onClick={() => openModal(app)} style={{ padding: "5px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Verbinden</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 28 }}>{modal.app.logo}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{modal.app.name}</h3>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{modal.app.description}</div>
              </div>
              <button onClick={() => setModal(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280" }}>×</button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 14 }}>
              {modal.app.helpText && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
                  ℹ️ {modal.app.helpText}
                </div>
              )}
              <div>
                <label style={lbl}>{modal.app.fieldLabels?.api_key || "API-Schlüssel"}</label>
                <input style={inp} type={modal.app.slug === "trustpilot" ? "text" : "password"} value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder={modal.integration ? "Zum Ändern neu eingeben…" : (modal.app.fieldLabels?.api_key_placeholder || "API Key eingeben…")} />
              </div>
              {modal.app.slug === "billbee" && (
                <div>
                  <label style={lbl}>{modal.app.fieldLabels?.basic_auth_username || "Basic Auth Benutzername"}</label>
                  <input
                    style={inp}
                    type="text"
                    value={form.basic_auth_username}
                    onChange={e => setForm(f => ({ ...f, basic_auth_username: e.target.value }))}
                    placeholder={modal.integration ? "Zum Ändern neu eingeben…" : (modal.app.fieldLabels?.basic_auth_username_placeholder || "Benutzername eingeben…")}
                  />
                </div>
              )}
              <div>
                <label style={lbl}>{modal.app.fieldLabels?.api_secret || "API-Geheimnis / Secret"}</label>
                <input style={inp} type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))} placeholder={modal.integration ? "Zum Ändern neu eingeben…" : (modal.app.fieldLabels?.api_secret_placeholder || "API Secret eingeben…")} />
              </div>
              {!modal.app.fieldLabels && (
                <div><label style={lbl}>Webhook-URL <span style={{ color: "#9ca3af" }}>(optional)</span></label><input style={inp} value={form.webhook_url} onChange={e => setForm(f => ({ ...f, webhook_url: e.target.value }))} placeholder="https://..." /></div>
              )}
              {modal.integration && (
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, padding: "10px 14px", fontSize: 12, color: "#6b7280" }}>
                  ✓ Bereits verbunden. Felder leer lassen um bestehende Zugangsdaten zu behalten.
                </div>
              )}
              {modal.app.slug === "billbee" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={handleBillbeeTest}
                    disabled={testing}
                    style={{ padding: "7px 14px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 12, cursor: testing ? "default" : "pointer", background: "#fff", fontWeight: 600 }}
                  >
                    {testing ? "Verbindung wird getestet…" : "Verbindung testen"}
                  </button>
                  {testResult && (
                    <span style={{ fontSize: 12, color: testResult.ok ? "#15803d" : "#b91c1c" }}>
                      {testResult.ok ? "✓ " : "✕ "}
                      {testResult.message}
                    </span>
                  )}
                </div>
              )}
            </div>
            {err && <div style={{ margin: "0 24px 12px", color: "#ef4444", fontSize: 12 }}>{err}</div>}
            <div style={{ padding: "12px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setModal(null)} style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "7px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                {saving ? "…" : modal.integration ? "Aktualisieren" : "Verbinden"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
