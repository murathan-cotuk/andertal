"use client";

import { useEffect, useState, useCallback, Fragment, useMemo } from "react";
import { useLocale } from "next-intl";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { getAutomationsCopy } from "@/lib/marketing-i18n";

/* ─── Active flows table (read-only — flows are authored under Content → Flows) ── */
function ActiveFlowsPanel({ copy, flows, loading }) {
  const activeFlows = flows.filter((f) => f.status === "active");
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(15,23,42,0.05)", padding: "20px 22px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{copy.activeFlowsTitle}</h2>
        <a
          href="/content/flows"
          style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", textDecoration: "none" }}
        >
          {copy.manageInFlows} →
        </a>
      </div>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{copy.loading}</div>
      ) : activeFlows.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{copy.noActiveFlows}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colName}</th>
              <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colTrigger}</th>
              <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colAudience}</th>
              <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colSent}</th>
            </tr>
          </thead>
          <tbody>
            {activeFlows.map((f) => (
              <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 6px", color: "#0f172a", fontWeight: 600 }}>{f.name}</td>
                <td style={{ padding: "10px 6px", color: "#475569", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{f.trigger}</td>
                <td style={{ padding: "10px 6px", color: "#64748b" }}>{f.audience === "seller" ? copy.audienceSeller : copy.audienceCustomer}</td>
                <td style={{ padding: "10px 6px", color: "#64748b" }}>{f.sent_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FlowExecutionLogPanel({ copy }) {
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

  const formatDt = useCallback((iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(copy.dateLocale, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(iso);
    }
  }, [copy.dateLocale]);

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
      setErr(e?.message || copy.logLoadError);
      setLogs([]);
      setTotal(0);
    }
    setLoading(false);
    if (typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true") {
      getMedusaAdminClient().getFlowExecutionLogStats({ days: 30 }).then(setExecStats).catch(() => {});
    }
  }, [offset, statusFilter, copy.logLoadError]);

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
            {copy.flowActivityTitle}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b", maxWidth: 620 }}>
            {isSuperuser ? copy.flowActivitySuperuser : copy.flowActivitySeller}
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
            <option value="">{copy.allStatuses}</option>
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
            {copy.refresh}
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
          <strong style={{ color: "#334155" }}>{copy.dayOverview(execStats.days || 30)}:</strong>{" "}
          {execStats.total_in_window.toLocaleString(copy.dateLocale)} {copy.executions}
          {Array.isArray(execStats.by_status) && execStats.by_status.length > 0 && (
            <> · {execStats.by_status.map((r) => `${r.status}: ${r.c}`).join(", ")}</>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        {loading && logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{copy.loading}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
            {copy.noLogEntries}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colTime}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colStatus}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colTrigger}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colFlow}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colStep}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colRecipient}</th>
                <th style={{ padding: "8px 6px", fontWeight: 600 }}>{copy.colAttempts}</th>
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
                          <strong style={{ color: "#7f1d1d" }}>{copy.errorPrefix}</strong>
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
            {copy.entriesTotal(total, offset + 1, offset + logs.length)}
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
              {copy.prev}
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
              {copy.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusColor(st) {
  const s = String(st || "").toLowerCase();
  if (s === "sent") return { bg: "#d1fae5", fg: "#047857", border: "#6ee7b7" };
  if (s === "failed") return { bg: "#fee2e2", fg: "#b91c1c", border: "#fca5a5" };
  if (s === "skipped") return { bg: "#f3f4f6", fg: "#4b5563", border: "#d1d5db" };
  if (s === "pending") return { bg: "#fef3c7", fg: "#b45309", border: "#fcd34d" };
  return { bg: "#e0e7ff", fg: "#3730a3", border: "#a5b4fc" };
}

export default function MarketingAutomationsPage() {
  const locale = useLocale();
  const copy = useMemo(() => getAutomationsCopy(locale), [locale]);

  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMedusaAdminClient().getFlows();
      setFlows(Array.isArray(data?.flows) ? data.flows : []);
    } catch (e) {
      setError(e?.message || copy.loadError);
      setFlows([]);
    }
    setLoading(false);
  }, [copy.loadError]);

  useEffect(() => { load(); }, [load]);

  const activeCount = flows.filter((f) => f.status === "active").length;
  const totalSent = flows.reduce((s, f) => s + (f.sent_count || 0), 0);
  const dateLoc = copy.dateLocale;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f2744 100%)",
        padding: "36px 32px 28px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: 80, width: 200, height: 200, borderRadius: "50%", background: "rgba(99,102,241,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, right: -20, width: 280, height: 280, borderRadius: "50%", background: "rgba(16,185,129,0.06)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
                {copy.pageTitle}
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "#94a3b8" }}>
                {copy.pageSubtitle}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
            {[
              { label: copy.statActiveFlows, value: loading ? "—" : activeCount, color: "#6ee7b7" },
              { label: copy.statTriggered, value: loading ? "—" : totalSent.toLocaleString(dateLoc), color: "#93c5fd" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px" }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#b91c1c" }}>
            {error}
          </div>
        )}

        <ActiveFlowsPanel copy={copy} flows={flows} loading={loading} />

        <FlowExecutionLogPanel copy={copy} />

        <div style={{ marginTop: 8, padding: "16px 20px", borderRadius: 12, background: "#fff", border: "1px solid #e2e8f0", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
          <strong style={{ color: "#64748b" }}>{copy.howItWorksTitle}</strong>
          {" "}{copy.howItWorksBody}
        </div>
      </div>
    </div>
  );
}
