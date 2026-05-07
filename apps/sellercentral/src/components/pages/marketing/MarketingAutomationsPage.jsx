"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

/* ─── Automation definitions ─────────────────────────────────── */
const AUTOMATION_DEFS = [
  {
    id: "review_request",
    category: "Kundenbindung",
    emoji: "⭐",
    accentColor: "#f59e0b",
    accentBg: "#fef3c7",
    title: "Bewertungsanfrage",
    desc: "Bittet Kunden nach der Lieferung automatisch um eine Produktbewertung — der stärkste Hebel für Social Proof.",
    trigger: "Lieferstatus „zugestellt"",
    fields: [
      { key: "delay_days", label: "Verzögerung nach Lieferung", type: "number", suffix: "Tage", default: 3, min: 1, max: 14 },
      { key: "email_subject", label: "E-Mail-Betreff", type: "text", default: "Wie war Ihre Bestellung? Ihre Meinung zählt!" },
      { key: "email_body", label: "E-Mail-Text (optional)", type: "textarea", default: "" },
    ],
    stat_label: "E-Mails versendet",
    status: "live",
  },
  {
    id: "welcome_email",
    category: "Kundenbindung",
    emoji: "👋",
    accentColor: "#3b82f6",
    accentBg: "#dbeafe",
    title: "Willkommens-E-Mail",
    desc: "Begrüßt neue Kunden nach ihrer ersten Bestellung persönlich. Erhöht Wiederkaufrate nachweislich um bis zu 30 %.",
    trigger: "Erste Bestellung eines Kunden",
    fields: [
      { key: "email_subject", label: "E-Mail-Betreff", type: "text", default: "Willkommen — danke für Ihr Vertrauen!" },
      { key: "include_discount", label: "Rabattcode für Zweitkauf beilegen", type: "toggle", default: false },
      { key: "discount_pct", label: "Rabatt", type: "number", suffix: "%", default: 10, min: 5, max: 30, depends_on: "include_discount" },
    ],
    stat_label: "Willkommensmails",
    status: "live",
  },
  {
    id: "reorder_reminder",
    category: "Kundenbindung",
    emoji: "🔄",
    accentColor: "#8b5cf6",
    accentBg: "#ede9fe",
    title: "Nachkauf-Erinnerung",
    desc: "Erinnert Bestandskunden nach einer definierten Zeit daran, Produkte nachzubestellen.",
    trigger: "X Tage nach letzter Bestellung",
    fields: [
      { key: "delay_days", label: "Tage nach letzter Bestellung", type: "number", suffix: "Tage", default: 30, min: 7, max: 180 },
      { key: "email_subject", label: "E-Mail-Betreff", type: "text", default: "Zeit zum Nachbestellen?" },
    ],
    stat_label: "Erinnerungen",
    status: "live",
  },
  {
    id: "abandoned_cart",
    category: "Kundenbindung",
    emoji: "🛒",
    accentColor: "#ec4899",
    accentBg: "#fce7f3",
    title: "Warenkorbabbruch",
    desc: "Reaktiviert Kunden, die den Checkout verlassen haben. Einer der effektivsten Recovery-Flows im E-Commerce.",
    trigger: "Warenkorb verlassen ohne Kauf",
    fields: [
      { key: "delay_hours", label: "Stunden bis zur E-Mail", type: "number", suffix: "h", default: 4, min: 1, max: 72 },
      { key: "include_discount", label: "Rabattcode anbieten", type: "toggle", default: true },
      { key: "discount_pct", label: "Rabatt", type: "number", suffix: "%", default: 5, min: 5, max: 20, depends_on: "include_discount" },
    ],
    stat_label: "Recovered",
    status: "live",
  },
  {
    id: "low_stock_alert",
    category: "Lager & Betrieb",
    emoji: "📦",
    accentColor: "#f97316",
    accentBg: "#ffedd5",
    title: "Lagerbestand-Warnung",
    desc: "Benachrichtigt dich automatisch, wenn der Bestand eines Produkts unter den Schwellenwert fällt. Nie wieder ausverkauft ohne Vorwarnung.",
    trigger: "Lagerbestand < Schwellenwert",
    fields: [
      { key: "threshold", label: "Schwellenwert", type: "number", suffix: "Stück", default: 5, min: 1, max: 500 },
      { key: "alert_email", label: "Benachrichtigungs-E-Mail", type: "email", default: "" },
    ],
    stat_label: "Warnungen gesendet",
    status: "live",
  },
  {
    id: "loyalty_reward",
    category: "Umsatz",
    emoji: "🎁",
    accentColor: "#10b981",
    accentBg: "#d1fae5",
    title: "Treuebelohnung",
    desc: "Belohnt treue Stammkunden nach einer bestimmten Anzahl Bestellungen mit einem automatischen Rabattcode.",
    trigger: "Nach X Bestellungen desselben Kunden",
    fields: [
      { key: "order_threshold", label: "Anzahl Bestellungen", type: "number", suffix: "Bestellungen", default: 3, min: 2, max: 20 },
      { key: "discount_pct", label: "Rabatt", type: "number", suffix: "%", default: 15, min: 5, max: 30 },
    ],
    stat_label: "Codes versendet",
    status: "coming_soon",
  },
  {
    id: "price_drop_alert",
    category: "Umsatz",
    emoji: "📉",
    accentColor: "#06b6d4",
    accentBg: "#cffafe",
    title: "Preisänderungs-Alarm",
    desc: "Informiert Kunden auf der Merkliste, sobald ein gespeichertes Produkt günstiger wird.",
    trigger: "Produktpreis gesenkt",
    fields: [],
    stat_label: "Alerts gesendet",
    status: "coming_soon",
  },
];

const CATEGORIES = [
  { id: "Kundenbindung", color: "#3b82f6", icon: "💙" },
  { id: "Lager & Betrieb", color: "#f97316", icon: "🟠" },
  { id: "Umsatz", color: "#10b981", icon: "💚" },
];

/* ─── Toggle switch ──────────────────────────────────────────── */
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      style={{
        width: 46, height: 26, borderRadius: 13, padding: 0,
        background: on ? "#10b981" : "#d1d5db",
        border: "none", cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
      aria-checked={on}
      role="switch"
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 23 : 3,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
      }} />
    </button>
  );
}

/* ─── Config field renderer ──────────────────────────────────── */
function ConfigField({ field, value, values, onChange }) {
  const visible = !field.depends_on || values[field.depends_on];
  if (!visible) return null;
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #e2e8f0", fontSize: 13, color: "#0f172a",
    background: "#fff", boxSizing: "border-box", outline: "none",
    fontFamily: "inherit",
  };
  if (field.type === "toggle") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{field.label}</span>
      <Toggle on={!!value} onChange={v => onChange(field.key, v)} />
    </div>
  );
  if (field.type === "textarea") return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{field.label}</label>
      <textarea
        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
        value={value ?? ""}
        onChange={e => onChange(field.key, e.target.value)}
        placeholder={field.default || ""}
      />
    </div>
  );
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{field.label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
          min={field.min} max={field.max}
          value={value ?? (field.default ?? "")}
          onChange={e => onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
          placeholder={String(field.default ?? "")}
        />
        {field.suffix && <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{field.suffix}</span>}
      </div>
    </div>
  );
}

/* ─── Single automation card ─────────────────────────────────── */
function AutomationCard({ def, rule, stats, onSave, onToggle, saving }) {
  const isActive = rule?.is_active ?? false;
  const isComingSoon = def.status === "coming_soon";
  const [open, setOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState(() => {
    const base = {};
    def.fields.forEach(f => { base[f.key] = f.default; });
    return { ...base, ...(rule?.config || {}) };
  });
  const [dirty, setDirty] = useState(false);

  const setField = (key, val) => {
    setLocalConfig(c => ({ ...c, [key]: val }));
    setDirty(true);
  };

  const handleSave = async () => {
    await onSave(def.id, { is_active: isActive, config: localConfig });
    setDirty(false);
  };

  const statCount = stats?.count ?? rule?.triggered_count ?? 0;

  return (
    <div style={{
      background: "#fff", borderRadius: 14,
      border: `1px solid ${open ? def.accentColor + "40" : "#e2e8f0"}`,
      boxShadow: open ? `0 4px 24px ${def.accentColor}18` : "0 1px 4px rgba(15,23,42,0.05)",
      transition: "all 0.2s", overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{ padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: def.accentBg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22, flexShrink: 0,
        }}>
          {def.emoji}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{def.title}</span>
            {isComingSoon && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#f1f5f9", color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Demnächst
              </span>
            )}
            {!isComingSoon && isActive && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#d1fae5", color: "#065f46", letterSpacing: "0.05em" }}>
                Aktiv
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{def.desc}</p>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              background: def.accentBg, color: def.accentColor,
            }}>
              ⚡ {def.trigger}
            </span>
            {statCount > 0 && (
              <span style={{ fontSize: 11, color: "#94a3b8" }}>
                {statCount} {def.stat_label}
              </span>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flexShrink: 0 }}>
          <Toggle on={isActive} onChange={v => !isComingSoon && onToggle(def.id, v)} disabled={isComingSoon} />
          {!isComingSoon && def.fields.length > 0 && (
            <button
              onClick={() => setOpen(o => !o)}
              style={{
                fontSize: 11, fontWeight: 600, color: open ? def.accentColor : "#64748b",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                textDecoration: open ? "none" : "underline",
              }}
            >
              {open ? "▲ Schließen" : "⚙ Konfigurieren"}
            </button>
          )}
        </div>
      </div>

      {/* Config panel */}
      {open && def.fields.length > 0 && (
        <div style={{ borderTop: `1px solid ${def.accentColor}30`, padding: "20px 20px", background: "#fafafa" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
            {def.fields.map(field => (
              <ConfigField
                key={field.key}
                field={field}
                value={localConfig[field.key]}
                values={localConfig}
                onChange={setField}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setOpen(false); setDirty(false); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 500 }}>
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                background: dirty ? def.accentColor : "#e5e7eb",
                color: dirty ? "#fff" : "#9ca3af",
                cursor: dirty && !saving ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */
export default function MarketingAutomationsPage() {
  const [rules, setRules] = useState({}); // type → rule object
  const [stats, setStats] = useState({}); // type → { count }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // automation id being saved
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMedusaAdminClient().request("/admin-hub/v1/automations");
      const rulesMap = {};
      for (const r of (data?.rules || [])) rulesMap[r.type] = r;
      setRules(rulesMap);
      const statsMap = {};
      for (const s of (data?.stats || [])) statsMap[s.type] = s;
      setStats(statsMap);
    } catch (e) {
      setError(e?.message || "Daten konnten nicht geladen werden.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (type, { is_active, config }) => {
    setSaving(type);
    setError(""); setSuccessMsg("");
    try {
      await getMedusaAdminClient().request(`/admin-hub/v1/automations/${type}`, {
        method: "PUT",
        body: JSON.stringify({ is_active, config }),
      });
      setRules(r => ({ ...r, [type]: { ...(r[type] || { type }), is_active, config } }));
      setSuccessMsg("Gespeichert ✓");
      setTimeout(() => setSuccessMsg(""), 2500);
    } catch (e) {
      setError(e?.message || "Fehler beim Speichern.");
    }
    setSaving(null);
  };

  const handleToggle = async (type, val) => {
    const existing = rules[type];
    await handleSave(type, { is_active: val, config: existing?.config || {} });
  };

  const activeCount = Object.values(rules).filter(r => r.is_active).length;
  const totalTriggered = Object.values(stats).reduce((s, v) => s + (v?.count || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* ── Hero header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2744 100%)",
        padding: "36px 32px 28px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -40, right: 80, width: 200, height: 200, borderRadius: "50%", background: "rgba(99,102,241,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, right: -20, width: 280, height: 280, borderRadius: "50%", background: "rgba(16,185,129,0.06)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
                Marketing Automationen
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "#94a3b8" }}>
                Automatisierte Workflows, die rund um die Uhr für dich arbeiten.
              </p>
            </div>
            {successMsg && (
              <div style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>
                {successMsg}
              </div>
            )}
          </div>

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
            {[
              { label: "Aktive Flows", value: loading ? "—" : activeCount, color: "#6ee7b7" },
              { label: "Ausgelöst (gesamt)", value: loading ? "—" : totalTriggered.toLocaleString("de-DE"), color: "#93c5fd" },
              { label: "Verfügbare Automationen", value: AUTOMATION_DEFS.filter(d => d.status === "live").length, color: "#c4b5fd" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: 96, borderRadius: 14, background: "#e2e8f0", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : (
          CATEGORIES.map(cat => {
            const defs = AUTOMATION_DEFS.filter(d => d.category === cat.id);
            return (
              <div key={cat.id} style={{ marginBottom: 36 }}>
                {/* Category header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 20, borderRadius: 2, background: cat.color }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {cat.icon} {cat.id}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                </div>

                {/* Automation cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {defs.map(def => (
                    <AutomationCard
                      key={def.id}
                      def={def}
                      rule={rules[def.id]}
                      stats={stats[def.id]}
                      onSave={handleSave}
                      onToggle={handleToggle}
                      saving={saving === def.id}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Info footer */}
        <div style={{ marginTop: 8, padding: "16px 20px", borderRadius: 12, background: "#fff", border: "1px solid #e2e8f0", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          <strong style={{ color: "#64748b" }}>Wie funktionieren Automationen?</strong>
          {" "}Die konfigurierten Regeln werden stündlich geprüft und automatisch ausgeführt. E-Mails werden über die unter{" "}
          <strong style={{ color: "#64748b" }}>Einstellungen → E-Mail</strong> konfigurierte SMTP-Verbindung versendet.
          Stelle sicher, dass SMTP korrekt eingerichtet ist, damit die Automationen ausgelöst werden können.
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
