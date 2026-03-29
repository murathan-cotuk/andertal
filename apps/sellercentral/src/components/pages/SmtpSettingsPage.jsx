"use client";

import { useState, useEffect } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const PROVIDERS = [
  { value: "gmail", label: "Gmail", host: "smtp.gmail.com", port: 587, secure: false, hint: "App-Passwort unter Google-Konto → Sicherheit → 2FA → App-Passwörter erstellen" },
  { value: "outlook", label: "Outlook / Microsoft 365", host: "smtp.office365.com", port: 587, secure: false, hint: "Microsoft 365-Konto mit aktivierter SMTP-Auth" },
  { value: "yahoo", label: "Yahoo Mail", host: "smtp.mail.yahoo.com", port: 587, secure: false, hint: "App-Passwort in Yahoo-Konto-Einstellungen erstellen" },
  { value: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, hint: "Benutzername: apikey — Passwort: SendGrid API Key" },
  { value: "custom", label: "Eigener SMTP-Server", host: "", port: 587, secure: false, hint: "" },
];

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box", ...props.style }}
    />
  );
}

export default function SmtpSettingsPage() {
  const [form, setForm] = useState({ provider: "gmail", host: "smtp.gmail.com", port: 587, secure: false, username: "", password: "", from_name: "", from_email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    getMedusaAdminClient().getSmtpSettings().then((d) => {
      if (d?.smtp) {
        const s = d.smtp;
        setForm((f) => ({
          ...f,
          provider: s.provider || "gmail",
          host: s.host || "",
          port: s.port || 587,
          secure: !!s.secure,
          username: s.username || "",
          password: "",
          from_name: s.from_name || "",
          from_email: s.from_email || "",
        }));
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (value) => {
    const p = PROVIDERS.find((p) => p.value === value);
    if (p) setForm((f) => ({ ...f, provider: value, host: p.host, port: p.port, secure: p.secure }));
  };

  const handleSave = async () => {
    setSaving(true); setErr(""); setSaved(false);
    try {
      await getMedusaAdminClient().updateSmtpSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e?.message || "Fehler");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await getMedusaAdminClient().testSmtpSettings();
      setTestResult({ ok: true, msg: r?.message || "Verbindung erfolgreich ✓" });
    } catch (e) {
      setTestResult({ ok: false, msg: e?.message || "Verbindung fehlgeschlagen" });
    }
    setTesting(false);
  };

  const selectedProvider = PROVIDERS.find((p) => p.value === form.provider);

  if (loading) return <div style={{ padding: 40, color: "#9ca3af", fontSize: 14, textAlign: "center" }}>Laden…</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>E-Mail / SMTP</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>
          Konfiguriere deinen E-Mail-Server für den Versand und Empfang von Kundennachrichten und Benachrichtigungen.
        </p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "24px 20px", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Anbieter</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 20 }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleProviderChange(p.value)}
              style={{ padding: "10px 8px", border: `2px solid ${form.provider === p.value ? "#ff971c" : "#e5e7eb"}`, borderRadius: 8, background: form.provider === p.value ? "#fff7ed" : "#fff", fontSize: 12, fontWeight: 600, color: form.provider === p.value ? "#ff971c" : "#374151", cursor: "pointer" }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {selectedProvider?.hint && (
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400e", marginBottom: 20 }}>
            💡 {selectedProvider.hint}
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "24px 20px", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Servereinstellungen</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
          <Field label="SMTP-Host">
            <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="smtp.gmail.com" />
          </Field>
          <Field label="Port" hint="">
            <Input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} type="number" style={{ width: 90 }} />
          </Field>
        </div>
        <Field label="" hint="">
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
            <input type="checkbox" checked={!!form.secure} onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))} />
            SSL/TLS verwenden (Port 465)
          </label>
        </Field>
        <Field label="Benutzername / E-Mail">
          <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="deine@email.com" type="email" />
        </Field>
        <Field label="Passwort / App-Passwort" hint="Bei Gmail/Yahoo: App-Passwort verwenden, nicht dein normales Passwort.">
          <Input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Leer lassen um beizubehalten" type="password" />
        </Field>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "24px 20px", marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Absenderdaten</h2>
        <Field label="Absendername">
          <Input value={form.from_name} onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))} placeholder="Mein Shop" />
        </Field>
        <Field label="Absender-E-Mail" hint="Diese Adresse wird als Absender für alle ausgehenden E-Mails und Kundennachrichten verwendet.">
          <Input value={form.from_email} onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))} placeholder="shop@meinedomain.de" type="email" />
        </Field>
      </div>

      {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {testResult && (
        <div style={{ background: testResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`, color: testResult.ok ? "#15803d" : "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          {testResult.msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: "10px 24px", background: "#ff971c", color: "#fff", border: "2px solid #000", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 0 2px #000" }}>
          {saving ? "Wird gespeichert…" : saved ? "Gespeichert ✓" : "Einstellungen speichern"}
        </button>
        <button onClick={handleTest} disabled={testing} style={{ padding: "10px 18px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "#fff", fontWeight: 600 }}>
          {testing ? "Teste…" : "Verbindung testen"}
        </button>
      </div>
    </div>
  );
}
