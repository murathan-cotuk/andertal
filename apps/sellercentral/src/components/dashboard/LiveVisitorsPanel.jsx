"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useLt } from "@/lib/use-locale-text";
import { dateLocaleFor } from "@/lib/locale-text";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

function getSortOptions(lt) {
  return [
    { value: "last_seen_desc", label: lt("Last active (newest)", "Son aktif (yeni)", "Dernière activité (récent)", "Última actividad (reciente)", "Ultima attività (recente)", "Zuletzt aktiv (neu)") },
    { value: "last_seen_asc", label: lt("Last active (oldest)", "Son aktif (eski)", "Dernière activité (ancien)", "Última actividad (antigua)", "Ultima attività (vecchia)", "Zuletzt aktiv (alt)") },
    { value: "country_asc", label: lt("Country A–Z", "Ülke A–Z", "Pays A–Z", "País A–Z", "Paese A–Z", "Land A–Z") },
    { value: "page_asc", label: lt("Page A–Z", "Sayfa A–Z", "Page A–Z", "Página A–Z", "Pagina A–Z", "Seite A–Z") },
    { value: "ip_asc", label: lt("IP A–Z", "IP A–Z", "IP A–Z", "IP A–Z", "IP A–Z", "IP A–Z") },
  ];
}

function deviceIcon(type) {
  if (type === "mobile") return "📱";
  if (type === "tablet") return "📲";
  return "💻";
}

export default function LiveVisitorsPanel({ defaultExpanded = false }) {
  const locale = useLocale();
  const lt = useLt();
  const sortOptions = useMemo(() => getSortOptions(lt), [lt]);
  const dateLoc = dateLocaleFor(locale);

  const fmtTime = useCallback(
    (d) => {
      if (!d) return "—";
      return new Date(d).toLocaleTimeString(dateLoc, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    },
    [dateLoc],
  );

  const countryLabel = useCallback(
    (code) => {
      if (!code) return "—";
      try {
        return new Intl.DisplayNames([dateLoc], { type: "region" }).of(code) || code;
      } catch {
        return code;
      }
    },
    [dateLoc],
  );

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
      setError(e?.message || lt("Live data unavailable", "Canlı veri kullanılamıyor", "Données en direct indisponibles", "Datos en vivo no disponibles", "Dati live non disponibili", "Live-Daten nicht verfügbar"));
    } finally {
      setLoading(false);
    }
  }, [sort, country, q, expanded, lt]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, expanded ? 10_000 : 20_000);
    return () => window.clearInterval(id);
  }, [load, expanded]);

  const countries = useMemo(() => {
    const set = new Set(visitors.map((v) => v.country_code).filter(Boolean));
    return [...set].sort();
  }, [visitors]);

  const tableHeaders = useMemo(
    () => [
      lt("Device", "Cihaz", "Appareil", "Dispositivo", "Dispositivo", "Gerät"),
      "IP",
      lt("Location", "Konum", "Lieu", "Ubicación", "Posizione", "Ort"),
      lt("Page", "Sayfa", "Page", "Página", "Pagina", "Seite"),
      lt("Active", "Aktif", "Actif", "Activo", "Attivo", "Aktiv"),
    ],
    [lt],
  );

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
            {lt("Live · Shop visitors", "Canlı · Mağaza ziyaretçileri", "En direct · Visiteurs boutique", "En vivo · Visitantes de la tienda", "Live · Visitatori negozio", "Live · Shop-Besucher")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 42, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {loading ? "…" : count}
            </span>
            <span style={{ fontSize: 14, opacity: 0.85 }}>
              {lt("currently on the website", "şu anda sitede", "actuellement sur le site", "actualmente en el sitio", "attualmente sul sito", "aktuell auf der Website")}
            </span>
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
              placeholder={lt("Filter IP, location, page…", "IP, konum, sayfa filtrele…", "Filtrer IP, lieu, page…", "Filtrar IP, ubicación, página…", "Filtra IP, posizione, pagina…", "IP, Ort, Seite filtern…")}
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
              <option value="">{lt("All countries", "Tüm ülkeler", "Tous les pays", "Todos los países", "Tutti i paesi", "Alle Länder")}</option>
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
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
              <thead>
                <tr style={{ background: "rgba(0,0,0,0.25)", textAlign: "left" }}>
                  {tableHeaders.map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontWeight: 600, opacity: 0.85 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visitors.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", opacity: 0.7 }}>
                      {lt("No active visitors in the last 3 minutes", "Son 3 dakikada aktif ziyaretçi yok", "Aucun visiteur actif dans les 3 dernières minutes", "Sin visitantes activos en los últimos 3 minutos", "Nessun visitatore attivo negli ultimi 3 minuti", "Keine aktiven Besucher in den letzten 3 Minuten")}
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
            {lt(
              "Updates every 10 s · Sessions without ping > 3 min are removed",
              "Her 10 sn güncellenir · 3 dk ping yoksa oturumlar kaldırılır",
              "Mise à jour toutes les 10 s · Sessions sans ping > 3 min supprimées",
              "Actualización cada 10 s · Sesiones sin ping > 3 min se eliminan",
              "Aggiornamento ogni 10 s · Sessioni senza ping > 3 min rimosse",
              "Aktualisierung alle 10 s · Sitzungen ohne Ping > 3 Min. werden entfernt",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
