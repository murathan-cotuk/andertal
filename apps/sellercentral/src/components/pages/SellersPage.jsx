"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, TextField,
  Box, Spinner, Banner, Select,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { lt } from "@/lib/locale-text";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useSellerImpersonation } from "@/context/SellerImpersonationContext";
import { userError } from "@/lib/api-error-messages";

function getStatusMeta(status, locale) {
  const map = {
    registered:          { en: "Registered",           tr: "Kayıt Oldu",       de: "Registriert" },
    documents_submitted: { en: "Documents submitted",  tr: "Evrak Gönderildi", de: "Dokumente eingereicht" },
    pending_approval:    { en: "Pending approval",     tr: "Onay Bekliyor",     de: "Genehmigung ausstehend" },
    approved:            { en: "Approved",             tr: "Onaylandı",         de: "Genehmigt" },
    rejected:            { en: "Rejected",             tr: "Reddedildi",        de: "Abgelehnt" },
    suspended:           { en: "Suspended",            tr: "Askıya Alındı",     de: "Gesperrt" },
  };
  const tones = {
    registered: "info",
    documents_submitted: "attention",
    pending_approval: "warning",
    approved: "success",
    rejected: "critical",
    suspended: "critical",
  };
  const entry = map[status];
  const label = entry ? lt(locale, entry.en, entry.tr, entry.en, entry.en, entry.en, entry.de) : status;
  return { label, tone: tones[status] || "info" };
}

function fmtCents(c, locale) {
  if (!c) {
    const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
    return (0).toLocaleString(loc, { style: "currency", currency: "EUR" });
  }
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return (c / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = lt(locale, "en-GB", "tr-TR", "en-GB", "en-GB", "en-GB", "de-DE");
  return new Date(d).toLocaleDateString(loc, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** API / DB may return boolean or string */
function isSellerSuperuser(s) {
  const v = s?.is_superuser;
  return v === true || v === "true" || v === 1 || v === "1";
}

function StatusBadge({ status, locale }) {
  const meta = getStatusMeta(status, locale);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 140, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 16px" }}>
      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
      <Text as="p" variant="headingMd" fontWeight="bold">{value}</Text>
      {sub && <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>}
    </div>
  );
}

function SellerTable({ rows, router, onImpersonate, onDelete, deletingId, locale, headers }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#6d7175", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((seller, i) => (
            <tr
              key={seller.id}
              style={{ borderBottom: "1px solid #f1f1f1", background: i % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer" }}
              onClick={() => router.push(`/sellers/${seller.id}`)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f5ff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"; }}
            >
              <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                {seller.store_name || <span style={{ color: "#9ca3af" }}>—</span>}
              </td>
              <td style={{ padding: "10px 12px", color: "#374151" }}>{seller.email}</td>
              <td style={{ padding: "10px 12px", color: "#6b7280" }}>{seller.company_name || "—"}</td>
              <td style={{ padding: "10px 12px" }}><StatusBadge status={seller.approval_status || "registered"} locale={locale} /></td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{seller.product_count ?? 0}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtCents(seller.revenue_cents, locale)}</td>
              <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmtCents(seller.commission_cents, locale)}</td>
              <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>
                {seller.iban ? seller.iban.replace(/(.{4})/g, "$1 ").trim() : "—"}
              </td>
              <td style={{ padding: "10px 12px", color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(seller.created_at, locale)}</td>
              <td style={{ padding: "10px 12px" }}>
                <InlineStack gap="200">
                  <Button
                    size="slim"
                    variant="secondary"
                    onClick={(e) => { e.stopPropagation(); router.push(`/sellers/${seller.id}`); }}
                  >
                    Details
                  </Button>
                  <Button
                    size="slim"
                    onClick={(e) => { e.stopPropagation(); onImpersonate(seller); }}
                  >
                    {lt(locale, "Log in as seller", "Satıcı olarak giriş", "Log in as seller", "Log in as seller", "Log in as seller", "Als Seller anmelden")}
                  </Button>
                  <Button
                    size="slim"
                    tone="critical"
                    variant="plain"
                    loading={deletingId === seller.id}
                    disabled={deletingId != null}
                    onClick={(e) => { e.stopPropagation(); onDelete(seller); }}
                  >
                    {lt(locale, "Delete", "Sil", "Delete", "Delete", "Delete", "Löschen")}
                  </Button>
                </InlineStack>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SellersPage() {
  const router = useRouter();
  const locale = useLocale();
  const ui = getUI(locale);
  const client = getMedusaAdminClient();
  const { openTab } = useSellerImpersonation();

  const [sellers, setSellers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [impersonateLoading, setImpersonateLoading] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (seller) => {
    const label = seller.store_name || seller.email || seller.id;
    if (!window.confirm(lt(locale,
      `Delete seller "${label}"? This cannot be undone.`,
      `"${label}" satıcısını sil? Bu işlem geri alınamaz.`,
      `Delete seller "${label}"? This cannot be undone.`,
      `Delete seller "${label}"? This cannot be undone.`,
      `Delete seller "${label}"? This cannot be undone.`,
      `Verkäufer „${label}" löschen? Dies kann nicht rückgängig gemacht werden.`,
    ))) return;
    setDeletingId(seller.id);
    try {
      await client.deleteSellerUser(seller.id);
      setSellers((prev) => prev.filter((s) => s.id !== seller.id));
    } catch (e) {
      setError(userError(e, locale, "Delete failed"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleImpersonate = async (seller) => {
    setImpersonateLoading(seller.id);
    try {
      const r = await client.impersonateSeller(seller.id);
      openTab(
        {
          id: seller.id,
          seller_id: seller.seller_id || seller.id,
          store_name: seller.store_name || seller.email || "Seller",
          email: seller.email || "",
        },
        r.token
      );
    } catch (e) {
      setError(userError(e, locale, "Impersonation failed"));
    } finally {
      setImpersonateLoading(null);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    client.getSellers()
      .then((r) => { setSellers(r.sellers || []); setError(null); })
      .catch((e) => setError(userError(e, locale, "Error loading")))
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

  const totalRevenue = sellers.reduce((a, s) => a + (s.revenue_cents || 0), 0);
  const totalCommission = sellers.reduce((a, s) => a + (s.commission_cents || 0), 0);
  const approvedCount = sellers.filter((s) => s.approval_status === "approved").length;
  const pendingCount = sellers.filter((s) => ["pending_approval", "documents_submitted"].includes(s.approval_status)).length;
  const superuserCount = sellers.filter((s) => isSellerSuperuser(s)).length;
  const sellerOnlyCount = sellers.filter((s) => !isSellerSuperuser(s)).length;

  const superusersFiltered = filtered.filter((s) => isSellerSuperuser(s));
  const sellersFiltered = filtered.filter((s) => !isSellerSuperuser(s));

  const statusOptions = [
    { label: lt(locale, "All statuses", "Tüm durumlar", "All statuses", "All statuses", "All statuses", "Alle Status"), value: "all" },
    ...["registered", "documents_submitted", "pending_approval", "approved", "rejected", "suspended"].map((k) => ({
      label: getStatusMeta(k, locale).label,
      value: k,
    })),
  ];

  const tableHeaders = [
    lt(locale, "Shop name", "Mağaza adı", "Shop name", "Shop name", "Shop name", "Shop-Name"),
    "E-Mail",
    lt(locale, "Company", "Firma", "Company", "Company", "Company", "Firma"),
    ui.status,
    lt(locale, "Products", "Ürünler", "Products", "Products", "Products", "Produkte"),
    lt(locale, "Revenue", "Gelir", "Revenue", "Revenue", "Revenue", "Umsatz"),
    lt(locale, "Commission", "Komisyon", "Commission", "Commission", "Commission", "Provision"),
    "IBAN",
    lt(locale, "Joined", "Katıldı", "Joined", "Joined", "Joined", "Beigetreten"),
    "",
  ];

  return (
    <>
    <Page
      title={lt(locale, "Sellers", "Satıcılar", "Sellers", "Sellers", "Sellers", "Verkäufer")}
      subtitle={lt(locale, "Manage and approve all registered sellers", "Tüm kayıtlı satıcıları yönetin ve onaylayın", "Manage and approve all registered sellers", "Manage and approve all registered sellers", "Manage and approve all registered sellers", "Alle registrierten Verkäufer verwalten und freischalten")}
    >
      <BlockStack gap="500">
        {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard
            label={lt(locale, "Total sellers", "Toplam satıcı", "Total sellers", "Total sellers", "Total sellers", "Gesamt Verkäufer")}
            value={sellers.length}
            sub={`Superuser: ${superuserCount} · ${lt(locale, "Sellers", "Satıcılar", "Sellers", "Sellers", "Sellers", "Verkäufer")}: ${sellerOnlyCount}`}
          />
          <StatCard label={lt(locale, "Active / Approved", "Aktif / Onaylı", "Active / Approved", "Active / Approved", "Active / Approved", "Aktiv / Genehmigt")} value={approvedCount} />
          <StatCard label={lt(locale, "Pending approval", "Onay bekliyor", "Pending approval", "Pending approval", "Pending approval", "Warten auf Genehmigung")} value={pendingCount} />
          <StatCard label={lt(locale, "Total revenue", "Toplam gelir", "Total revenue", "Total revenue", "Total revenue", "Gesamtumsatz")} value={fmtCents(totalRevenue, locale)} />
          <StatCard label={lt(locale, "Commission (total)", "Komisyon (toplam)", "Commission (total)", "Commission (total)", "Commission (total)", "Provision (gesamt)")} value={fmtCents(totalCommission, locale)} />
        </div>

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ flex: 1, maxWidth: 340 }}>
                <TextField
                  label=""
                  labelHidden
                  placeholder={lt(locale, "Search shop name, email or ID…", "Mağaza adı, e-posta veya ID ara…", "Search shop name, email or ID…", "Search shop name, email or ID…", "Search shop name, email or ID…", "Shop-Name, E-Mail oder ID suchen…")}
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
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>
              <Button onClick={load} loading={loading}>{ui.refresh}</Button>
            </InlineStack>

            {loading ? (
              <Box padding="800" style={{ textAlign: "center" }}>
                <Spinner size="small" />
              </Box>
            ) : filtered.length === 0 ? (
              <Box padding="800" background="bg-surface-secondary" borderRadius="200">
                <Text as="p" tone="subdued" alignment="center">{lt(locale, "No sellers found.", "Satıcı bulunamadı.", "No sellers found.", "No sellers found.", "No sellers found.", "Keine Verkäufer gefunden.")}</Text>
              </Box>
            ) : (
              <BlockStack gap="500">
                <div>
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Superuser ({superusersFiltered.length})
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lt(locale, "Platform administrators with full access", "Tam erişimli platform yöneticileri", "Platform administrators with full access", "Platform administrators with full access", "Platform administrators with full access", "Plattform-Administratoren mit Vollzugriff")}
                  </Text>
                  <Box paddingBlockStart="300">
                    {superusersFiltered.length === 0 ? (
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" tone="subdued" alignment="center">{lt(locale, "No superusers for these filters.", "Bu filtreler için süper kullanıcı yok.", "No superusers for these filters.", "No superusers for these filters.", "No superusers for these filters.", "Keine Superuser für diese Filter.")}</Text>
                      </Box>
                    ) : (
                      <SellerTable rows={superusersFiltered} router={router} onImpersonate={handleImpersonate} onDelete={handleDelete} deletingId={deletingId} locale={locale} headers={tableHeaders} />
                    )}
                  </Box>
                </div>
                <div>
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    {lt(locale, "Sellers", "Satıcılar", "Sellers", "Sellers", "Sellers", "Verkäufer")} ({sellersFiltered.length})
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {lt(locale, "Regular shop operators", "Normal mağaza işletmecileri", "Regular shop operators", "Regular shop operators", "Regular shop operators", "Reguläre Shop-Betreiber")}
                  </Text>
                  <Box paddingBlockStart="300">
                    {sellersFiltered.length === 0 ? (
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" tone="subdued" alignment="center">{lt(locale, "No sellers for these filters.", "Bu filtreler için satıcı yok.", "No sellers for these filters.", "No sellers for these filters.", "No sellers for these filters.", "Keine Verkäufer für diese Filter.")}</Text>
                      </Box>
                    ) : (
                      <SellerTable rows={sellersFiltered} router={router} onImpersonate={handleImpersonate} onDelete={handleDelete} deletingId={deletingId} locale={locale} headers={tableHeaders} />
                    )}
                  </Box>
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>

    </>
  );
}
