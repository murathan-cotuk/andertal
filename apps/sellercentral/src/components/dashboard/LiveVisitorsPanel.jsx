"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const SORT_OPTIONS = [
  { value: "last_seen_desc", label: "Zuletzt aktiv (neu)" },
  { value: "last_seen_asc", label: "Zuletzt aktiv (alt)" },
  { value: "country_asc", label: "Land A–Z" },
  { value: "page_asc", label: "Seite A–Z" },
  { value: "ip_asc", label: "IP A–Z" },
];

function fmtTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function countryLabel(code) {
  if (!code) return "—";
  try {
    return new Intl.DisplayNames(["de"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function deviceIcon(type) {
  if (type === "mobile") return "📱";
  if (type === "tablet") return "📲";
  return "💻";
}

export default function LiveVisitorsPanel({ defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [count, setCount] = useState(0);
  const [visitors, setVisitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState("last_seen_desc");
  const [country, setCountry] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const client = getMedusaAdminClient();
      const data = await client.getLiveVisitors({ sort, country: country || undefined, q: q || undefined });
      setCount(data?.count ?? (data?.visitors?.length || 0));
      if (expanded) setVisitors(data?.visitors || []);
      setError(null);
    } catch (e) {
      setError(e?.message || "Live-Daten nicht verfügbar");
    } finally {
      setLoading(false);
    }
  }, [sort, country, q, expanded]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, expanded ? 10_000 : 20_000);
    return () => window.clearInterval(id);
  }, [load, expanded]);

  const countries = useMemo(() => {
    const set = new Set(visitors.map((v) => v.country_code).filter(Boolean));
    return [...set].sort();
  }, [visitors]);

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f766e 100%)",
        borderRadius: 14,
        padding: "20px 22px",
        color: "#f8fafc",
        boxShadow: "0 8px 32px rgba(15, 23, 42, 0.25)",
        marginBottom: 20,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          padding: 0,
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.75, marginBottom: 6 }}>
            Live · Shop-Besucher
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "…" : count}
            </span>
            <span style={{ fontSize: 14, opacity: 0.85 }}>aktuell auf der Website</span>
          </div>
        </div>
        <span
          style={{
            fontSize: 22,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            opacity: 0.9,
          }}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {error && (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#fecaca" }}>{error}</p>
      )}

      {expanded && (
        <div style={{ marginTop: 18, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "center" }}>
            <input
              type="search"
              placeholder="IP, Ort, Seite filtern…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                flex: "1 1 180px",
                minWidth: 160,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fff",
                fontSize: 13,
              }}
            />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fff",
                fontSize: 13,
              }}
            >
              <option value="">Alle Länder</option>
              {countries.map((c) => (
                <option key={c} value={c}>{countryLabel(c)} ({c})</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.2)",
                color: "#fff",
                fontSize: 13,
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                  {["Gerät", "IP", "Ort", "Seite", "Aktiv"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 600, opacity: 0.85 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visitors.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>
                      Keine aktiven Besucher in den letzten 3 Minuten
                    </td>
                  </tr>
                )}
                {visitors.map((v) => (
                  <tr key={v.session_id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "10px 12px" }} title={v.user_agent || ""}>
                      {deviceIcon(v.device_type)} {v.device_type || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "ui-monospace, monospace" }}>{v.ip_address || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {[countryLabel(v.country_code), v.city, v.region].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.page_title || v.page_path}>
                      {v.page_path || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>{fmtTime(v.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.65 }}>
            Aktualisierung alle 10 s · Sitzungen ohne Ping &gt; 3 Min. werden entfernt
          </p>
        </div>
      )}
    </div>
  );
}
