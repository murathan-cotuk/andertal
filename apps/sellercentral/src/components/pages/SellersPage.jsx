"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Page, Card, Text, BlockStack, InlineStack, Badge, Button, TextField,
  Box, Spinner, Banner, Select,
} from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { getUI } from "@/lib/ui-strings";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { useSellerImpersonation } from "@/context/SellerImpersonationContext";

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
  const label = entry ? (locale === "en" ? entry.en : locale === "tr" ? entry.tr : entry.de) : status;
  return { label, tone: tones[status] || "info" };
}

function fmtCents(c, locale) {
  if (!c) {
    const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
    return (0).toLocaleString(loc, { style: "currency", currency: "EUR" });
  }
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
  return (c / 100).toLocaleString(loc, { style: "currency", currency: "EUR" });
}

function fmtDate(d, locale) {
  if (!d) return "—";
  const loc = locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE";
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

function SellerTable({ rows, router, onImpersonate, locale, headers }) {
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
                    {locale === "en" ? "Log in as seller" : locale === "tr" ? "Satıcı olarak giriş" : "Als Seller anmelden"}
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
      setError(e?.message || (locale === "en" ? "Impersonation failed" : locale === "tr" ? "Giriş başarısız" : "Impersonation fehlgeschlagen"));
    } finally {
      setImpersonateLoading(null);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    client.getSellers()
      .then((r) => { setSellers(r.sellers || []); setError(null); })
      .catch((e) => setError(e?.message || (locale === "en" ? "Error loading" : locale === "tr" ? "Yükleme hatası" : "Fehler beim Laden")))
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
    { label: locale === "en" ? "All statuses" : locale === "tr" ? "Tüm durumlar" : "Alle Status", value: "all" },
    ...["registered", "documents_submitted", "pending_approval", "approved", "rejected", "suspended"].map((k) => ({
      label: getStatusMeta(k, locale).label,
      value: k,
    })),
  ];

  const tableHeaders = [
    locale === "en" ? "Shop name" : locale === "tr" ? "Mağaza adı" : "Shop-Name",
    "E-Mail",
    locale === "en" ? "Company" : locale === "tr" ? "Firma" : "Firma",
    ui.status,
    locale === "en" ? "Products" : locale === "tr" ? "Ürünler" : "Produkte",
    locale === "en" ? "Revenue" : locale === "tr" ? "Gelir" : "Umsatz",
    locale === "en" ? "Commission" : locale === "tr" ? "Komisyon" : "Provision",
    "IBAN",
    locale === "en" ? "Joined" : locale === "tr" ? "Katıldı" : "Beigetreten",
    "",
  ];

  return (
    <>
    <Page
      title={locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : "Verkäufer"}
      subtitle={locale === "en" ? "Manage and approve all registered sellers" : locale === "tr" ? "Tüm kayıtlı satıcıları yönetin ve onaylayın" : "Alle registrierten Verkäufer verwalten und freischalten"}
    >
      <BlockStack gap="500">
        {error && <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard
            label={locale === "en" ? "Total sellers" : locale === "tr" ? "Toplam satıcı" : "Gesamt Verkäufer"}
            value={sellers.length}
            sub={`Superuser: ${superuserCount} · ${locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : "Verkäufer"}: ${sellerOnlyCount}`}
          />
          <StatCard label={locale === "en" ? "Active / Approved" : locale === "tr" ? "Aktif / Onaylı" : "Aktiv / Genehmigt"} value={approvedCount} />
          <StatCard label={locale === "en" ? "Pending approval" : locale === "tr" ? "Onay bekliyor" : "Warten auf Genehmigung"} value={pendingCount} />
          <StatCard label={locale === "en" ? "Total revenue" : locale === "tr" ? "Toplam gelir" : "Gesamtumsatz"} value={fmtCents(totalRevenue, locale)} />
          <StatCard label={locale === "en" ? "Commission (total)" : locale === "tr" ? "Komisyon (toplam)" : "Provision (gesamt)"} value={fmtCents(totalCommission, locale)} />
        </div>

        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ flex: 1, maxWidth: 340 }}>
                <TextField
                  label=""
                  labelHidden
                  placeholder={locale === "en" ? "Search shop name, email or ID…" : locale === "tr" ? "Mağaza adı, e-posta veya ID ara…" : "Shop-Name, E-Mail oder ID suchen…"}
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
                <Text as="p" tone="subdued" alignment="center">{locale === "en" ? "No sellers found." : locale === "tr" ? "Satıcı bulunamadı." : "Keine Verkäufer gefunden."}</Text>
              </Box>
            ) : (
              <BlockStack gap="500">
                <div>
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    Superuser ({superusersFiltered.length})
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {locale === "en" ? "Platform administrators with full access" : locale === "tr" ? "Tam erişimli platform yöneticileri" : "Plattform-Administratoren mit Vollzugriff"}
                  </Text>
                  <Box paddingBlockStart="300">
                    {superusersFiltered.length === 0 ? (
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" tone="subdued" alignment="center">{locale === "en" ? "No superusers for these filters." : locale === "tr" ? "Bu filtreler için süper kullanıcı yok." : "Keine Superuser für diese Filter."}</Text>
                      </Box>
                    ) : (
                      <SellerTable rows={superusersFiltered} router={router} onImpersonate={handleImpersonate} locale={locale} headers={tableHeaders} />
                    )}
                  </Box>
                </div>
                <div>
                  <Text as="h2" variant="headingSm" fontWeight="semibold">
                    {locale === "en" ? "Sellers" : locale === "tr" ? "Satıcılar" : "Verkäufer"} ({sellersFiltered.length})
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {locale === "en" ? "Regular shop operators" : locale === "tr" ? "Normal mağaza işletmecileri" : "Reguläre Shop-Betreiber"}
                  </Text>
                  <Box paddingBlockStart="300">
                    {sellersFiltered.length === 0 ? (
                      <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" tone="subdued" alignment="center">{locale === "en" ? "No sellers for these filters." : locale === "tr" ? "Bu filtreler için satıcı yok." : "Keine Verkäufer für diese Filter."}</Text>
                      </Box>
                    ) : (
                      <SellerTable rows={sellersFiltered} router={router} onImpersonate={handleImpersonate} locale={locale} headers={tableHeaders} />
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
