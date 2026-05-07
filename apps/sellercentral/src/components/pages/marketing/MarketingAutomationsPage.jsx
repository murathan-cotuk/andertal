"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
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
    trigger: "Lieferstatus „zugestellt“",
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

/* ─── Flow execution log (store_flow_execution_logs) — all sellers; scope enforced by API ─── */
function formatDt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(iso);
  }
}

function statusColor(st) {
  const s = String(st || "").toLowerCase();
  if (s === "sent") return { bg: "#d1fae5", fg: "#047857", border: "#6ee7b7" };
  if (s === "failed") return { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" };
  if (s === "skipped") return { bg: "#f3f4f6", fg: "#4b5563", border: "#d1d5db" };
  if (s === "pending") return { bg: "#fef3c7", fg: "#b45309", border: "#fcd34d" };
  return { bg: "#e0e7ff", fg: "#3730a3", border: "#a5b4fc" };
}

function FlowExecutionLogPanel() {
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [execStats, setExecStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const limit = 25;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsSuperuser(localStorage.getItem("sellerIsSuperuser") === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || localStorage.getItem("sellerIsSuperuser") !== "true") return;
    getMedusaAdminClient().getFlowExecutionLogStats({ days: 30 }).then(setExecStats).catch(() => setExecStats(null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const client = getMedusaAdminClient();
      const data = await client.getFlowExecutionLogs({
        limit,
        offset,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (e) {
      setErr(e?.message || "Protokoll konnte nicht geladen werden.");
      setLogs([]);
      setTotal(0);
    }
    setLoading(false);
    if (typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true") {
      getMedusaAdminClient().getFlowExecutionLogStats({ days: 30 }).then(setExecStats).catch(() => {});
    }
  }, [offset, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPrev = offset > 0;
  const hasNext = offset + logs.length < total;

  return (
    <div style={{
      marginTop: 28,
      marginBottom: 24,
      padding: "20px 22px",
      borderRadius: 14,
      background: "#fff",
      border: "1px solid #e2e8f0",
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            E-Mail-Flow Aktivität
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", maxWidth: 620 }}>
            {isSuperuser ? (
              <>
                Protokoll der Flow-Schritte (Versand, übersprungen, fehlgeschlagen) für die gesamte Plattform — inkl. Content → Flows und optionaler Warteschlange.
              </>
            ) : (
              <>
                Nur Einträge zu{" "}
                <strong style={{ color: "#475569" }}>Ihren Bestellungen</strong>{" "}
                (über <code style={{ fontSize: 11 }}>order_id</code> → <code style={{ fontSize: 11 }}>seller_id</code>).
                Flows ohne Bestellbezug (z. B. reiner Newsletter) erscheinen hier nicht.
              </>
            )}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            value={statusFilter}
            onChange={(e) => { setOffset(0); setStatusFilter(e.target.value); }}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 13,
              background: "#fff",
              color: "#334155",
            }}
          >
            <option value="">Alle Status</option>
            <option value="pending">pending</option>
            <option value="sent">sent</option>
            <option value="skipped">skipped</option>
            <option value="failed">failed</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              fontSize: 13,
              fontWeight: 600,
              color: "#334155",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#b91c1c" }}>
          {err}
        </div>
      )}

      {isSuperuser && execStats != null && typeof execStats.total_in_window === "number" && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, color: "#475569" }}>
          <strong style={{ color: "#334155" }}>{execStats.days || 30}-Tage‑Überblick:</strong>{" "}
          {execStats.total_in_window.toLocaleString("de-DE")} Ausführungen
          {Array.isArray(execStats.by_status) && execStats.by_status.length > 0 && (
            <> · {execStats.by_status.map((r) => `${r.status}: ${r.c}`).join(", ")}</>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Laden…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            Noch keine Einträge oder Filter passt auf keine Zeilen.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Zeit</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Trigger</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Flow</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Schritt</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Empfänger</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>Versuche</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => {
                const sc = statusColor(row.status);
                const id = row.id;
                const open = expandedId === id;
                return (
                  <Fragment key={id}>
                    <tr
                      style={{ borderBottom: "1px solid #f1f5f9", cursor: row.error_message ? "pointer" : "default" }}
                      onClick={() => {
                        if (!row.error_message && !open) return;
                        setExpandedId(open ? null : id);
                      }}
                    >
                      <td style={{ padding: "10px 6px", color: "#334155", whiteSpace: "nowrap" }}>{formatDt(row.created_at)}</td>
                      <td style={{ padding: "10px 6px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 11,
                          background: sc.bg,
                          color: sc.fg,
                          border: `1px solid ${sc.border}`,
                        }}>
                          {row.status || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px", color: "#475569", maxWidth: 120 }} title={row.trigger_key}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.trigger_key || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px", color: "#475569", maxWidth: 160 }} title={row.flow_name || ""}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.flow_name || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px", color: "#64748b" }}>{row.step_order ?? "—"}</td>
                      <td style={{ padding: "10px 6px", color: "#475569", maxWidth: 200 }} title={row.recipient_email || ""}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.recipient_email || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 6px", color: "#64748b" }}>{row.attempts ?? "—"}</td>
                    </tr>
                    {open && row.error_message ? (
                      <tr style={{ background: "#fafafa" }}>
                        <td colSpan={7} style={{ padding: "10px 12px", fontSize: 11, color: "#b91c1c", wordBreak: "break-word", fontFamily: "ui-monospace, monospace" }}>
                          <strong style={{ color: "#7f1d1d" }}>Fehler: </strong>
                          {row.error_message}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {total.toLocaleString("de-DE")} Einträge gesamt · Anzeige {offset + 1}–{offset + logs.length}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={!hasPrev || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: "#334155",
                cursor: !hasPrev || loading ? "not-allowed" : "pointer",
                opacity: !hasPrev || loading ? 0.45 : 1,
              }}
            >
              Zurück
            </button>
            <button
              type="button"
              disabled={!hasNext || loading}
              onClick={() => setOffset(offset + limit)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: "#334155",
                cursor: !hasNext || loading ? "not-allowed" : "pointer",
                opacity: !hasNext || loading ? 0.45 : 1,
              }}
            >
              Weiter
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

        <FlowExecutionLogPanel />

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
