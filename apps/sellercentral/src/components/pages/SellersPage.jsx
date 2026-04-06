"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, TextField,
  Box, Spinner, Banner, Select,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const STATUS_META = {
  registered:           { label: "Kayıt Oldu",        tone: "info" },
  documents_submitted:  { label: "Evrak Gönderildi",  tone: "attention" },
  pending_approval:     { label: "Onay Bekliyor",      tone: "warning" },
  approved:             { label: "Onaylandı",          tone: "success" },
  rejected:             { label: "Reddedildi",         tone: "critical" },
  suspended:            { label: "Askıya Alındı",      tone: "critical" },
};

function fmtCents(c) {
  if (!c) return "€0,00";
  return (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE");
}

// ── Status dot ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, tone: "info" };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="headingMd" fontWeight="bold">{value}</Text>
      {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
    </div>
  );
}

export default function SellersPage() {
  const router = useRouter();
  const client = getMedusaAdminClient();

  const [sellers, setSellers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    client.getSellers()
      .then((r) => { setSellers(r.sellers || []); setError(null); })
      .catch((e) => setError(e?.message || "Fehler beim Laden"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let list = sellers;
    if (statusFilter !== "all") list = list.filter((s) => s.approval_status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) =>
        (s.store_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.company_name || "").toLowerCase().includes(q) ||
        (s.seller_id || "").toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [sellers, search, statusFilter]);

  // Summary stats
  const totalRevenue = sellers.reduce((a, s) => a + (s.revenue_cents || 0), 0);
  const totalCommission = sellers.reduce((a, s) => a + (s.commission_cents || 0), 0);
  const approvedCount = sellers.filter((s) => s.approval_status === "approved").length;
  const pendingCount = sellers.filter((s) => ["pending_approval", "documents_submitted"].includes(s.approval_status)).length;

  return (
    <Page
      title="Verkäufer"
      subtitle="Alle registrierten Verkäufer verwalten und freischalten"
    >
      <BlockStack gap="500">
        {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}

        {/* Summary stats */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Gesamt Verkäufer" value={sellers.length} />
          <StatCard label="Aktiv / Genehmigt" value={approvedCount} />
          <StatCard label="Warten auf Genehmigung" value={pendingCount} />
          <StatCard label="Gesamtumsatz" value={fmtCents(totalRevenue)} />
          <StatCard label="Provision (gesamt)" value={fmtCents(totalCommission)} />
        </div>

        <Card>
          {/* Filters */}
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ flex: 1, maxWidth: 340 }}>
                <TextField
                  label=""
                  labelHidden
                  placeholder="Shop-Name, E-Mail oder ID suchen…"
                  value={search}
                  onChange={setSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearch("")}
                />
              </div>
              <div style={{ minWidth: 200 }}>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { label: "Alle Status", value: "all" },
                    ...Object.entries(STATUS_META).map(([k, v]) => ({ label: v.label, value: k })),
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>
              <Button onClick={load} loading={loading}>Aktualisieren</Button>
            </InlineStack>

            {loading ? (
              <Box padding="800" style={{ textAlign: "center" }}>
                <Spinner size="small" />
              </Box>
            ) : filtered.length === 0 ? (
              <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued" alignment="center">Keine Verkäufer gefunden.</Text>
              </Box>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                      {["Shop-Name", "E-Mail", "Firma", "Status", "Produkte", "Umsatz", "Provision", "IBAN", "Beigetreten", ""].map((h, i) => (
                        <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((seller, i) => (
                      <tr
                        key={seller.id}
                        style={{ borderBottom: "1px solid #f1f1f1", background: i % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer" }}
                        onClick={() => router.push(`/sellers/${seller.id}`)}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#f0f5ff"}
                        onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}
                      >
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                          {seller.store_name || <span style={{ color: "#9ca3af" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{seller.email}</td>
                        <td style={{ padding: "10px 12px", color: "#6b7280" }}>{seller.company_name || "—"}</td>
                        <td style={{ padding: "10px 12px" }}><StatusBadge status={seller.approval_status || "registered"} /></td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{seller.product_count ?? 0}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtCents(seller.revenue_cents)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtCents(seller.commission_cents)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                          {seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(seller.created_at)}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <Button
                            size="slim"
                            variant="secondary"
                            onClick={(e) => { e.stopPropagation(); router.push(`/sellers/${seller.id}`); }}
                          >
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
