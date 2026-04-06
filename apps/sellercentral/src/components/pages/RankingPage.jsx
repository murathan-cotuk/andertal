"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, Button, Badge, BlockStack, InlineStack,
  Box, Spinner, Banner, Select, Tabs, TextField, Modal,
  ProgressBar, Tooltip,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const STRATEGIES = [
  { label: "Standard (Default)", value: "default" },
  { label: "Neuheiten", value: "neuheiten" },
  { label: "Bestsellers", value: "bestsellers" },
  { label: "Sales / Angebote", value: "sales" },
  { label: "Suche (Search)", value: "search" },
];

const WEIGHT_FIELDS = [
  { key: "w_popularity",  label: "Popularität",   desc: "Verkäufe, GMV, Klicks" },
  { key: "w_freshness",   label: "Frische",        desc: "Neu eingestellte Produkte bevorzugen" },
  { key: "w_content",     label: "Inhalt",         desc: "Titel, Beschreibung, Bild, Preis" },
  { key: "w_discount",    label: "Rabatt",         desc: "Prozent Preisreduktion" },
  { key: "w_seller",      label: "Verkäufer",      desc: "Ø Bewertung des Verkäufers" },
  { key: "w_velocity",    label: "Trendgeschwindigkeit", desc: "7d vs 30d Verhältnis" },
];

const PARAM_FIELDS = [
  { key: "freshness_halflife_days", label: "Frische-Halbwertszeit (Tage)", desc: "In wie vielen Tagen verliert ein neues Produkt 50% seines Frische-Bonus" },
  { key: "exploration_k",           label: "Entdeckungs-Faktor (k)",       desc: "Wie stark neue Produkte initial hochgestuft werden (0.0–1.0)" },
  { key: "diversity_max_consecutive", label: "Max. aufeinanderfolgende Seller", desc: "Ab dieser Anzahl greifen Diversitäts-Strafen" },
  { key: "urgency_threshold",       label: "Lagerbestand-Dringlichkeit",   desc: "Produkte mit Bestand ≤ diesen Wert erhalten kleinen Urgency-Bonus" },
];

function ScoreBar({ value, max = 1, color = "#4f46e5", label }) {
  const pct = Math.min(100, ((value || 0) / max) * 100);
  return (
    <Tooltip content={`${(value || 0).toFixed(4)}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {label && <span style={{ fontSize: 11, color: "#6b7280", width: 80, flexShrink: 0 }}>{label}</span>}
        <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 4, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, background: color, height: "100%", borderRadius: 4, transition: "width .3s" }} />
        </div>
        <span style={{ fontSize: 11, color: "#374151", width: 42, textAlign: "right", flexShrink: 0 }}>{(pct).toFixed(0)}%</span>
      </div>
    </Tooltip>
  );
}

function WeightSumBadge({ config }) {
  const sum = WEIGHT_FIELDS.reduce((a, f) => a + parseFloat(config[f.key] || 0), 0);
  const diff = Math.abs(sum - 1.0);
  if (diff < 0.001) return <Badge tone="success">Summe: 1.00</Badge>;
  return <Badge tone="critical">Summe: {sum.toFixed(2)} (soll 1.00)</Badge>;
}

// ── Config Editor ────────────────────────────────────────────────────────────

function ConfigEditor({ configs, onSave, saving }) {
  const [strategy, setStrategy] = useState("default");
  const [local, setLocal] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const cfg = configs.find((c) => c.strategy === strategy)?.config || {};
    setLocal({ ...cfg });
  }, [strategy, configs]);

  const set = (key, val) => setLocal((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));

  const handleSave = async () => {
    setErr("");
    const sum = WEIGHT_FIELDS.reduce((a, f) => a + parseFloat(local[f.key] || 0), 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      setErr(`Gewichtssumme muss 1.00 sein (aktuell: ${sum.toFixed(3)})`);
      return;
    }
    await onSave(strategy, local);
  };

  if (!local) return <Box padding="400"><Spinner size="small" /></Box>;

  return (
    <BlockStack gap="400">
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <div style={{ minWidth: 220 }}>
          <Select
            label="Strategie"
            options={STRATEGIES}
            value={strategy}
            onChange={setStrategy}
          />
        </div>
        <div style={{ paddingTop: 20 }}>
          <WeightSumBadge config={local} />
        </div>
      </InlineStack>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BlockStack gap="300">
          <Text as="p" variant="bodyMd" fontWeight="semibold">Gewichtungen (Summe = 1.0)</Text>
          {WEIGHT_FIELDS.map((f) => (
            <div key={f.key}>
              <Tooltip content={f.desc}>
                <TextField
                  label={f.label}
                  type="number"
                  value={String(local[f.key] ?? "")}
                  onChange={(v) => set(f.key, v)}
                  step={0.01}
                  min={0}
                  max={1}
                  autoComplete="off"
                />
              </Tooltip>
            </div>
          ))}
        </BlockStack>

        <BlockStack gap="300">
          <Text as="p" variant="bodyMd" fontWeight="semibold">Parameter</Text>
          {PARAM_FIELDS.map((f) => (
            <div key={f.key}>
              <Tooltip content={f.desc}>
                <TextField
                  label={f.label}
                  type="number"
                  value={String(local[f.key] ?? "")}
                  onChange={(v) => set(f.key, parseFloat(v))}
                  step={f.key === "exploration_k" ? 0.05 : 1}
                  min={0}
                  autoComplete="off"
                />
              </Tooltip>
            </div>
          ))}
        </BlockStack>
      </div>

      {err && <Banner tone="critical">{err}</Banner>}
      <InlineStack gap="300">
        <Button variant="primary" onClick={handleSave} loading={saving}>
          Speichern
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

// ── Product Ranking Table ────────────────────────────────────────────────────

function RankingTable({ products, isSuperuser, onBreakdown, strategy }) {
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) =>
    !search.trim() ||
    (p.title || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.handle || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.product_id || "").toLowerCase().includes(search.toLowerCase())
  );

  const maxScore = products.reduce((m, p) => Math.max(m, parseFloat(p.final_score) || 0), 0.001);

  return (
    <BlockStack gap="300">
      <div style={{ maxWidth: 340 }}>
        <TextField
          label=""
          labelHidden
          placeholder="Produkt suchen…"
          value={search}
          onChange={setSearch}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => setSearch("")}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
              {["#", "Produkt", "Popularität", "Frische", "Velocity", "Inhalt", "Rabatt%", "Bewertung", "Final Score", ""].map((h, i) => (
                <th key={i} style={{ padding: "8px 10px", textAlign: i >= 2 && i <= 7 ? "center" : "left", fontWeight: 600, color: "#6d7175", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const finalScore = parseFloat(p.final_score) || 0;
              return (
                <tr key={p.product_id} style={{ borderBottom: "1px solid #f1f1f1", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "8px 10px", color: "#9ca3af", fontWeight: 700, width: 36 }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", maxWidth: 220 }}>
                    <Text as="p" variant="bodySm" fontWeight="semibold" truncate>{p.title || "—"}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{p.product_id?.slice(0, 8)}…</Text>
                  </td>
                  <td style={{ padding: "8px 10px", minWidth: 120 }}>
                    <ScoreBar value={parseFloat(p.popularity_score)} color="#6366f1" />
                  </td>
                  <td style={{ padding: "8px 10px", minWidth: 120 }}>
                    <ScoreBar value={parseFloat(p.freshness_override || p.freshness_score)} color="#10b981" />
                  </td>
                  <td style={{ padding: "8px 10px", minWidth: 120 }}>
                    <ScoreBar value={parseFloat(p.velocity_score)} color="#f59e0b" />
                  </td>
                  <td style={{ padding: "8px 10px", minWidth: 80 }}>
                    <ScoreBar value={parseFloat(p.content_score)} color="#3b82f6" />
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {parseFloat(p.discount_pct) > 0 ? (
                      <Badge tone="success">{parseFloat(p.discount_pct).toFixed(0)}%</Badge>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {parseFloat(p.review_avg) > 0 ? (
                      <span>⭐ {parseFloat(p.review_avg).toFixed(1)} ({p.review_count})</span>
                    ) : <span style={{ color: "#9ca3af" }}>—</span>}
                  </td>
                  <td style={{ padding: "8px 10px", minWidth: 140 }}>
                    <ScoreBar value={finalScore} max={maxScore} color="#8b5cf6" />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <Button size="slim" onClick={() => onBreakdown(p.product_id)}>
                      Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <Box padding="600">
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">Keine Produkte gefunden.</Text>
          </Box>
        )}
      </div>
    </BlockStack>
  );
}

// ── Breakdown Modal ──────────────────────────────────────────────────────────

function BreakdownModal({ productId, strategy, onClose, client }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    client.getRankingBreakdown(productId, strategy)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productId, strategy]);

  const contribs = data?.weighted_contributions || {};
  const maxContrib = Math.max(...Object.values(contribs).map(Math.abs), 0.001);

  return (
    <Modal
      open={!!productId}
      onClose={onClose}
      title={data?.title ? `Score-Analyse: ${data.title}` : "Score-Analyse"}
      size="large"
    >
      <Modal.Section>
        {loading && <Box padding="600"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
        {!loading && !data && <Banner tone="critical">Produkt nicht gefunden. Zuerst berechnen.</Banner>}
        {!loading && data && (
          <BlockStack gap="400">
            <InlineStack gap="400" blockAlign="center" wrap>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
                <Text as="p" variant="bodySm" tone="subdued">Rang</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">#{data.rank_position}</Text>
              </div>
              <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
                <Text as="p" variant="bodySm" tone="subdued">Final Score</Text>
                <Text as="p" variant="headingLg" fontWeight="bold">{data.final_score?.toFixed(4)}</Text>
              </div>
              <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
                <Text as="p" variant="bodySm" tone="subdued">Strategie</Text>
                <Text as="p" variant="headingMd" fontWeight="bold">{data.strategy}</Text>
              </div>
            </InlineStack>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Raw signals */}
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Rohdaten (Signale)</Text>
                {[
                  ["Verkäufe 7d", data.signals.sales_7d],
                  ["Verkäufe 30d", data.signals.sales_30d],
                  ["Verkäufe 90d", data.signals.sales_90d],
                  ["GMV 30d", `€${((data.signals.gmv_30d_cents || 0) / 100).toFixed(2)}`],
                  ["Impressionen 30d", data.signals.impressions_30d],
                  ["Klicks 30d", data.signals.clicks_30d],
                  ["CTR 30d", `${((data.signals.ctr_30d || 0) * 100).toFixed(1)}%`],
                  ["Warenkörbe 30d", data.signals.add_to_cart_30d],
                  ["Ø Bewertung", `${data.signals.review_avg} (${data.signals.review_count})`],
                  ["Rückgaben 30d", data.signals.return_count_30d],
                  ["Rabatt", `${data.signals.discount_pct}%`],
                  ["Lagerbestand", data.signals.inventory],
                  ["Alter", `${data.signals.days_since_published} Tage`],
                ].map(([label, val]) => (
                  <InlineStack key={label} align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
                    <Text as="span" variant="bodySm" fontWeight="semibold">{val}</Text>
                  </InlineStack>
                ))}
              </BlockStack>

              {/* Score contributions */}
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">Gewichtete Beiträge zum Finale Score</Text>
                {[
                  { key: "popularity",        label: "Popularität",    color: "#6366f1" },
                  { key: "freshness",          label: "Frische",        color: "#10b981" },
                  { key: "content",            label: "Inhalt",         color: "#3b82f6" },
                  { key: "discount",           label: "Rabatt",         color: "#f59e0b" },
                  { key: "seller",             label: "Verkäufer",      color: "#ec4899" },
                  { key: "velocity",           label: "Trend",          color: "#f97316" },
                  { key: "exploration_bonus",  label: "+ Entdeckungs-Bonus", color: "#14b8a6" },
                  { key: "urgency_bonus",      label: "+ Dringlichkeit", color: "#a855f7" },
                  { key: "return_penalty",     label: "− Rückgabe-Strafe", color: "#ef4444" },
                ].map(({ key, label, color }) => {
                  const val = contribs[key] || 0;
                  return (
                    <div key={key}>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="span" variant="bodySm">{label}</Text>
                        <Text as="span" variant="bodySm" fontWeight="semibold"
                          tone={val < 0 ? "critical" : val > 0 ? "success" : "subdued"}>
                          {val >= 0 ? "+" : ""}{val.toFixed(4)}
                        </Text>
                      </InlineStack>
                      <div style={{ background: "#e5e7eb", borderRadius: 3, height: 6, marginTop: 2 }}>
                        <div style={{
                          width: `${Math.min(100, (Math.abs(val) / maxContrib) * 100)}%`,
                          background: color,
                          height: "100%",
                          borderRadius: 3,
                          opacity: val < 0 ? 0.6 : 1,
                        }} />
                      </div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "2px solid #e5e7eb" }}>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Final Score</Text>
                    <Text as="span" variant="bodyMd" fontWeight="bold" tone="success">
                      {data.final_score?.toFixed(6)}
                    </Text>
                  </InlineStack>
                </div>
              </BlockStack>
            </div>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}

// ── Main RankingPage ─────────────────────────────────────────────────────────

export default function RankingPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [strategy, setStrategy] = useState("default");
  const [configs, setConfigs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [success, setSuccess] = useState(null);
  const [breakdownId, setBreakdownId] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const client = getMedusaAdminClient();

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data = await client.getRankingConfig();
      if (data?.configs) setConfigs(data.configs);
    } catch (_) {}
    finally { setLoadingConfig(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await client.getRankingProducts({ strategy });
      if (data?.products) setProducts(data.products);
    } catch (_) {}
    finally { setLoadingProducts(false); }
  }, [strategy]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { if (activeTab === 1) loadProducts(); }, [activeTab, loadProducts]);

  const handleCompute = async () => {
    setComputing(true);
    setErr(null);
    try {
      await client.triggerRankingCompute();
      setSuccess("Berechnung gestartet. Ergebnisse in ~30 Sekunden verfügbar.");
      setTimeout(() => { setSuccess(null); loadProducts(); }, 6000);
    } catch (e) {
      setErr(e?.message || "Fehler");
    } finally {
      setComputing(false);
    }
  };

  const handleSaveConfig = async (strat, cfg) => {
    setSaving(true);
    setErr(null);
    try {
      await client.updateRankingConfig(strat, cfg);
      setSuccess("Konfiguration gespeichert.");
      loadConfig();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setErr(e?.message || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "config", content: "Gewichtungen & Konfiguration" },
    { id: "products", content: "Produktranking" },
  ];

  return (
    <Page
      title="Sıralaması Algoritması"
      subtitle="Ürün görünürlüğü ve sıralamayı yönet"
      primaryAction={
        isSuperuser ? {
          content: computing ? "Berechne…" : "Jetzt berechnen",
          onAction: handleCompute,
          loading: computing,
        } : undefined
      }
    >
      <BlockStack gap="400">
        {err && <Banner tone="critical" onDismiss={() => setErr(null)}>{err}</Banner>}
        {success && <Banner tone="success" onDismiss={() => setSuccess(null)}>{success}</Banner>}

        {/* Info banner */}
        <Card>
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">Nasıl çalışır?</Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {[
                { icon: "📊", title: "Popülerlik", desc: "Satışlar, GMV, tıklamalar — son 30 gün" },
                { icon: "✨", title: "Tazelik", desc: "Yeni ürünler keşif bonusu alır (üstel azalma)" },
                { icon: "⚡", title: "Trend Hızı", desc: "7g/30g satış oranı — ivmelenen ürünler öne çıkar" },
                { icon: "🏷️", title: "İndirim", desc: "Sales stratejisinde ağırlıklı sinyal" },
                { icon: "🌟", title: "Satıcı Skoru", desc: "Satıcının genel puan ortalaması" },
                { icon: "🔀", title: "Çeşitlilik", desc: "Aynı satıcı üst üste çok gelmesin" },
              ].map(({ icon, title, desc }) => (
                <div key={title} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <div>
                    <Text as="p" variant="bodySm" fontWeight="semibold">{title}</Text>
                    <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                  </div>
                </div>
              ))}
            </div>
          </BlockStack>
        </Card>

        <Card>
          <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab} />
          <Box paddingBlockStart="400">
            {activeTab === 0 && (
              loadingConfig
                ? <Box padding="600"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
                : <ConfigEditor configs={configs} onSave={handleSaveConfig} saving={saving} />
            )}

            {activeTab === 1 && (
              <BlockStack gap="300">
                <InlineStack gap="300" blockAlign="center">
                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Strategie"
                      options={STRATEGIES}
                      value={strategy}
                      onChange={setStrategy}
                    />
                  </div>
                  <div style={{ paddingTop: 20 }}>
                    <Button onClick={loadProducts} loading={loadingProducts}>Laden</Button>
                  </div>
                  <div style={{ paddingTop: 20 }}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {products.length} Produkte · Automatische Neuberechnung alle 2h
                    </Text>
                  </div>
                </InlineStack>

                {loadingProducts
                  ? <Box padding="600"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>
                  : <RankingTable
                      products={products}
                      isSuperuser={isSuperuser}
                      strategy={strategy}
                      onBreakdown={setBreakdownId}
                    />
                }
              </BlockStack>
            )}
          </Box>
        </Card>
      </BlockStack>

      {breakdownId && (
        <BreakdownModal
          productId={breakdownId}
          strategy={strategy}
          onClose={() => setBreakdownId(null)}
          client={client}
        />
      )}
    </Page>
  );
}
