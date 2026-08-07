"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const ENTITY_TYPES = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
  { id: "collections", label: "Collections" },
  { id: "pages", label: "Pages" },
  { id: "blogs", label: "Blog posts" },
];

const SCORE_COLOR = {
  good: "#15803d",
  needs_work: "#b45309",
  poor: "#b91c1c",
};

function LengthBar({ label, value, idealMin, idealMax, status }) {
  const len = String(value || "").length;
  const pct = Math.min(100, Math.round((len / Math.max(idealMax, 1)) * 100));
  const color = status === "ok" ? "#15803d" : status === "warn" ? "#b45309" : status === "missing" ? "#94a3b8" : "#b91c1c";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: 600 }}>
          {len} / ideal {idealMin}–{idealMax}
        </span>
      </div>
      <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .2s" }} />
      </div>
    </div>
  );
}

function StatChip({ label, value, warn }) {
  return (
    <div
      style={{
        minWidth: 72,
        padding: "8px 10px",
        borderRadius: 10,
        background: warn ? "#fef2f2" : "#f8fafc",
        border: `1px solid ${warn ? "#fecaca" : "#e2e8f0"}`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: warn ? "#b91c1c" : "#0f172a" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function SeoHubPage() {
  const [type, setType] = useState("products");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [entity, setEntity] = useState(null);
  const [draft, setDraft] = useState({ meta_title: "", meta_description: "", meta_keywords: "" });
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  const [liveResult, setLiveResult] = useState(null);
  const [rules, setRules] = useState(null);
  const [autoMsg, setAutoMsg] = useState("");
  const limit = 40;

  const client = useMemo(() => getMedusaAdminClient(), []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await client.getSeoEntities({ type, q, limit, offset });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
      if (data?.rules) setRules(data.rules);
    } catch (e) {
      setErr(e?.message || "Failed to load SEO entities");
      setItems([]);
      setTotal(0);
    }
    setLoading(false);
  }, [client, type, q, offset]);

  useEffect(() => {
    client.getSeoRules().then(setRules).catch(() => {});
  }, [client]);

  useEffect(() => {
    setSelectedId(null);
    setEntity(null);
    setOffset(0);
  }, [type]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openEntity = async (id) => {
    setSelectedId(id);
    setLiveResult(null);
    try {
      const data = await client.getSeoEntity(type, id);
      const e = data?.entity;
      setEntity(e || null);
      setDraft({
        meta_title: e?.meta_title || "",
        meta_description: e?.meta_description || "",
        meta_keywords: e?.meta_keywords || "",
      });
      setLiveUrl(e?.url || "");
    } catch (e) {
      setErr(e?.message || "Failed to load entity");
    }
  };

  const save = async () => {
    if (!selectedId) return;
    setSaving(true);
    setErr("");
    try {
      const data = await client.patchSeoEntity(type, selectedId, draft);
      setEntity(data?.entity || null);
      await loadList();
    } catch (e) {
      setErr(e?.message || "Save failed");
    }
    setSaving(false);
  };

  const runAnalyze = async () => {
    setAnalyzing(true);
    setErr("");
    try {
      const data = await client.analyzeSeo({
        type,
        html: entity?.content_html || "",
        meta_title: draft.meta_title,
        meta_description: draft.meta_description,
        meta_keywords: draft.meta_keywords,
        url: liveUrl || undefined,
      });
      if (entity) {
        setEntity({
          ...entity,
          analysis: data.analysis || entity.analysis,
          evaluation: data.evaluation || entity.evaluation,
        });
      }
      setLiveResult(data.live || null);
    } catch (e) {
      setErr(e?.message || "Analyze failed");
    }
    setAnalyzing(false);
  };

  const autoGenerate = async () => {
    setAutoMsg("");
    setErr("");
    try {
      const data = await client.autoGenerateProductSeo({ only_missing: true, limit: 500 });
      setAutoMsg(`Updated ${data?.updated ?? 0} of ${data?.scanned ?? 0} products (missing fields only).`);
      if (type === "products") await loadList();
    } catch (e) {
      setErr(e?.message || "Auto-generate failed");
    }
  };

  const evalLive = useMemo(() => {
    if (!entity?.evaluation && !draft) return null;
    const titleLen = draft.meta_title.length;
    const descLen = draft.meta_description.length;
    const titleIdeal = rules?.title || { min: 50, max: 65 };
    const descIdeal = rules?.description || { min: 150, max: 300 };
    const titleStatus =
      !titleLen ? "missing" : titleLen >= titleIdeal.min && titleLen <= titleIdeal.max ? "ok" : titleLen < 30 || titleLen > 70 ? "error" : "warn";
    const descStatus =
      !descLen ? "missing" : descLen >= descIdeal.min && descLen <= descIdeal.max ? "ok" : descLen < 70 || descLen > 320 ? "error" : "warn";
    const kwStatus = draft.meta_keywords.trim() ? "ok" : "missing";
    return {
      title: { length: titleLen, status: titleStatus, idealMin: titleIdeal.min, idealMax: titleIdeal.max },
      description: { length: descLen, status: descStatus, idealMin: descIdeal.min, idealMax: descIdeal.max },
      keywords: { status: kwStatus, count: draft.meta_keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).length },
    };
  }, [draft, entity, rules]);

  const analysis = entity?.analysis || { headings: {}, images: 0, links: 0, imagesWithoutAlt: 0 };
  const headings = analysis.headings || {};

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "8px 4px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 750, color: "#0f172a" }}>SEO Hub</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", maxWidth: 560 }}>
            Meta title, description and keywords for every page type — synced with product/category editors. Categories require 50–65 / 150–300 characters.
          </p>
        </div>
        {type === "products" ? (
          <button
            type="button"
            onClick={autoGenerate}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Auto-generate product meta
          </button>
        ) : null}
      </div>

      {autoMsg ? (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, fontSize: 13, color: "#065f46" }}>
          {autoMsg}
        </div>
      ) : null}
      {err ? (
        <div style={{ marginBottom: 12, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#991b1b" }}>
          {err}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.04)" }}>
          <div style={{ padding: 14, borderBottom: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
              Content type
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <input
              value={q}
              onChange={(e) => { setOffset(0); setQ(e.target.value); }}
              placeholder="Search title / handle…"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
            />
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{total} items</div>
          </div>
          <div style={{ maxHeight: "70vh", overflow: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No items</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openEntity(item.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: "1px solid #f1f5f9",
                    background: selectedId === item.id ? "#f8fafc" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 13, fontWeight: 650, color: "#0f172a" }}>{item.label}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: SCORE_COLOR[item.score] || "#64748b", textTransform: "uppercase" }}>
                      {item.score === "needs_work" ? "warn" : item.score}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, fontFamily: "ui-monospace, monospace" }}>
                    /{item.handle || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.meta_title || "No meta title"}
                  </div>
                </button>
              ))
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 10, borderTop: "1px solid #e2e8f0" }}>
            <button type="button" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - limit))} style={{ fontSize: 12, cursor: offset <= 0 ? "default" : "pointer" }}>
              ← Prev
            </button>
            <button type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} style={{ fontSize: 12, cursor: offset + limit >= total ? "default" : "pointer" }}>
              Next →
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!entity ? (
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              Select an item to edit SEO metadata and run analysis.
            </div>
          ) : (
            <>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#94a3b8", textTransform: "uppercase" }}>{entity.type}</div>
                    <h2 style={{ margin: "4px 0 0", fontSize: 18, color: "#0f172a" }}>{entity.label}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#0f172a",
                      color: "#fff",
                      fontWeight: 650,
                      fontSize: 13,
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    {saving ? "Saving…" : "Save SEO"}
                  </button>
                </div>

                {type === "categories" ? (
                  <div style={{ marginBottom: 12, padding: "8px 10px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
                    Category rule: meta title <strong>50–65</strong> chars, description <strong>150–300</strong>, keywords required. Save is blocked if rules fail.
                  </div>
                ) : null}

                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 12 }}>
                  Meta title
                  <input
                    value={draft.meta_title}
                    onChange={(e) => setDraft((d) => ({ ...d, meta_title: e.target.value }))}
                    style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                </label>
                <LengthBar
                  label="Title length"
                  value={draft.meta_title}
                  idealMin={evalLive?.title?.idealMin || 50}
                  idealMax={evalLive?.title?.idealMax || 65}
                  status={evalLive?.title?.status}
                />

                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 12 }}>
                  Meta description
                  <textarea
                    value={draft.meta_description}
                    onChange={(e) => setDraft((d) => ({ ...d, meta_description: e.target.value }))}
                    rows={4}
                    style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, resize: "vertical" }}
                  />
                </label>
                <LengthBar
                  label="Description length"
                  value={draft.meta_description}
                  idealMin={evalLive?.description?.idealMin || 150}
                  idealMax={evalLive?.description?.idealMax || 300}
                  status={evalLive?.description?.status}
                />

                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Keywords {evalLive?.keywords?.status === "missing" ? <span style={{ color: "#b91c1c" }}>(missing)</span> : <span style={{ color: "#15803d" }}>({evalLive?.keywords?.count || 0})</span>}
                  <input
                    value={draft.meta_keywords}
                    onChange={(e) => setDraft((d) => ({ ...d, meta_keywords: e.target.value }))}
                    placeholder="keyword1, keyword2, keyword3"
                    style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 11px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                </label>
              </div>

              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>SEO Meta in 1 Click</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, fontSize: 12, marginBottom: 14 }}>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>URL</div><div style={{ wordBreak: "break-all", color: "#0f172a" }}>{entity.url || "—"}</div></div>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>Canonical</div><div style={{ wordBreak: "break-all", color: "#0f172a" }}>{entity.canonical || "—"}</div></div>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>Robots</div><div style={{ color: "#0f172a" }}>{entity.robots || "—"}</div></div>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>Lang</div><div style={{ color: "#0f172a" }}>{entity.lang || "—"}</div></div>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>Author</div><div style={{ color: "#0f172a" }}>{entity.author || "—"}</div></div>
                  <div><div style={{ color: "#94a3b8", marginBottom: 2 }}>Publisher</div><div style={{ color: "#0f172a" }}>{entity.publisher || "—"}</div></div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  <StatChip label="H1" value={headings.h1 || 0} warn={(headings.h1 || 0) !== 1} />
                  <StatChip label="H2" value={headings.h2 || 0} />
                  <StatChip label="H3" value={headings.h3 || 0} />
                  <StatChip label="H4" value={headings.h4 || 0} />
                  <StatChip label="H5" value={headings.h5 || 0} />
                  <StatChip label="H6" value={headings.h6 || 0} />
                  <StatChip label="Images" value={analysis.images || 0} warn={(analysis.imagesWithoutAlt || 0) > 0} />
                  <StatChip label="No alt" value={analysis.imagesWithoutAlt || 0} warn={(analysis.imagesWithoutAlt || 0) > 0} />
                  <StatChip label="Links" value={analysis.links || 0} />
                </div>

                {type === "products" && (headings.h1 || 0) > 0 ? (
                  <div style={{ marginBottom: 12, padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
                    Product description contains H1. On save, H1 tags are automatically converted to H2.
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={liveUrl}
                    onChange={(e) => setLiveUrl(e.target.value)}
                    placeholder="https://… live URL to fetch & analyze"
                    style={{ flex: 1, minWidth: 220, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={runAnalyze}
                    disabled={analyzing}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      fontWeight: 650,
                      fontSize: 13,
                      cursor: analyzing ? "wait" : "pointer",
                    }}
                  >
                    {analyzing ? "Analyzing…" : "Analyze"}
                  </button>
                </div>

                {liveResult ? (
                  <div style={{ marginTop: 14, padding: 12, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}>
                    {liveResult.error ? (
                      <div style={{ color: "#b91c1c" }}>{liveResult.error}</div>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>Live fetch ({liveResult.status}) — {liveResult.finalUrl}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div><span style={{ color: "#94a3b8" }}>Title tag:</span> {liveResult.titleTag || "—"}</div>
                          <div><span style={{ color: "#94a3b8" }}>Meta description:</span> {liveResult.metaDescription || "—"}</div>
                          <div><span style={{ color: "#94a3b8" }}>Canonical:</span> {liveResult.canonical || "—"}</div>
                          <div><span style={{ color: "#94a3b8" }}>Robots:</span> {liveResult.robots || "—"}</div>
                          <div><span style={{ color: "#94a3b8" }}>Lang:</span> {liveResult.lang || "—"}</div>
                          <div>
                            <span style={{ color: "#94a3b8" }}>H1–H6:</span>{" "}
                            {liveResult.analysis
                              ? `H1:${liveResult.analysis.headings?.h1 || 0} H2:${liveResult.analysis.headings?.h2 || 0} H3:${liveResult.analysis.headings?.h3 || 0} · img:${liveResult.analysis.images || 0} · a:${liveResult.analysis.links || 0}`
                              : "—"}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
