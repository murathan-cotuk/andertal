"use client";

/**
 * Shared Sellercentral page building blocks (Konsept s32 "Bausteine für alle Seiten"):
 *  - ScPageHeader: small breadcrumb, large display title, actions on the right
 *  - ScTabs: underline tabs with optional counts (Alle [N] · Aktiv · Entwurf …)
 *  - ScBulkBar: dark bar shown while rows are selected
 * Visual only — callers keep their own state and data logic. Tables stay compact (user preference).
 */

import React from "react";
import Link from "next/link";

const ink = "#1d1b18";

export function ScPageHeader({ breadcrumb = [], title, badge = null, subtitle = null, actions = null }) {
  return (
    <div className="sc-page-header" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "4px 0 14px" }}>
      <div style={{ minWidth: 0 }}>
        {breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: "#5e574e", marginBottom: 2 }}>
            {breadcrumb.map((b, i) => (
              <span key={`${b.label}-${i}`}>
                {i > 0 && <span style={{ margin: "0 4px", color: "#a39a8d" }}>›</span>}
                {b.href ? <Link href={b.href} style={{ color: "#5e574e" }}>{b.label}</Link> : b.label}
              </span>
            ))}
          </nav>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontFamily: '"Bricolage Grotesque", Georgia, serif', fontSize: 26, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.01em", color: ink }}>{title}</h1>
          {badge}
        </div>
        {subtitle && <div style={{ fontSize: 12, color: "#5e574e", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>{actions}</div>}
    </div>
  );
}

/** tabs: [{ id, label, count? }] */
export function ScTabs({ tabs, selected, onSelect }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 2, borderBottom: "1px solid #e6dfd4", marginBottom: 8, overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.id === selected;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t.id)}
            style={{
              border: "none", background: "none", cursor: "pointer", whiteSpace: "nowrap",
              padding: "7px 12px", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? ink : "#5e574e",
              borderBottom: on ? `2px solid ${ink}` : "2px solid transparent", marginBottom: -1,
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: on ? "#7f3f00" : "#8a8175", background: on ? "#fcebd5" : "#f3eee6", borderRadius: 999, padding: "1px 7px" }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ScBulkBar({ label, children }) {
  return (
    <div className="sc-bulk-bar" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", gap: 8, padding: "6px 8px 6px 14px", marginBottom: 8, background: ink, borderRadius: 12, color: "#fff" }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>{children}</div>
    </div>
  );
}

/** KPI tiles (Konsept s32 "KPI-Kachel", s40): items [{ label, value, hint?, hintTone?, onClick? }] */
export function ScKpiTiles({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, marginBottom: 10 }}>
      {items.map((it) => {
        const Tag = it.onClick ? "button" : "div";
        return (
          <Tag
            key={it.label}
            type={it.onClick ? "button" : undefined}
            onClick={it.onClick}
            style={{
              textAlign: "left", background: "#fff", border: "1px solid #e6dfd4", borderRadius: 16, padding: "10px 14px",
              cursor: it.onClick ? "pointer" : "default", font: "inherit",
            }}
          >
            <div style={{ fontSize: 12, color: "#5e574e" }}>{it.label}</div>
            <div style={{ fontFamily: '"Bricolage Grotesque", Georgia, serif', fontSize: 22, fontWeight: 700, color: ink, lineHeight: 1.2 }}>{it.value}</div>
            {it.hint && <div style={{ fontSize: 11, color: it.hintTone === "warn" ? "#a65300" : "#5e574e" }}>{it.hint}</div>}
          </Tag>
        );
      })}
    </div>
  );
}

/** Status pill (Konsept s32 "Status": five tones, every status belongs to exactly one tone). */
const PILL_TONES = {
  positive: { bg: "#e3f1e6", fg: "#1f6b35" },
  neutral: { bg: "#efe9df", fg: "#3a352f" },
  attention: { bg: "#fcebd5", fg: "#7f3f00" },
  info: { bg: "#e3ecf5", fg: "#1f4e79" },
  critical: { bg: "#f8e0dc", fg: "#9b2c1f" },
}
const STATUS_TONE = {
  aktiv: "positive", active: "positive", published: "positive", bezahlt: "positive", paid: "positive", zugestellt: "positive", delivered: "positive", abgeschlossen: "positive", genehmigt: "info", erstattet: "neutral",
  entwurf: "neutral", draft: "neutral", archiviert: "neutral", archived: "neutral", inactive: "neutral",
  offen: "attention", open: "attention", pending: "attention", in_bearbeitung: "attention", retoure_anfrage: "attention", angefragt: "attention", teil_erstattet: "attention",
  versendet: "info", shipped: "info", eingegangen: "info", in_pruefung: "info",
  abgelehnt: "critical", storniert: "critical", refunded: "neutral", retoure: "critical", fehlgeschlagen: "critical", nicht_auf_lager: "critical",
}
export function ScStatusPill({ status, label, tone }) {
  const t = PILL_TONES[tone || STATUS_TONE[String(status || "").toLowerCase()] || "neutral"]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: t.bg, color: t.fg, whiteSpace: "nowrap" }}>
      {label || status}
    </span>
  )
}
