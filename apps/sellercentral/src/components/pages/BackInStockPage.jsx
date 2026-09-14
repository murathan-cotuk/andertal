"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Page, Card, BlockStack, InlineStack, Text, Badge, Banner, Spinner, Box, Tabs } from "@shopify/polaris";
import { useRouter } from "@/i18n/navigation";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

// TASKS.md #5 — "benachrichtige mich" (notify me when back in stock). A guest on an out-of-stock
// product page can leave their email in the buybox (apps/shop's ProductPurchaseActions.jsx);
// src/routes/back-in-stock.js emails them once the product has inventory again. This page is
// where a superuser sees who's waiting for what — Tab 1 is the raw subscriber list, Tab 2 groups
// the same data by category so it's obvious which categories have the most pent-up demand.
function fmtDate(d, locale) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(locale === "en" ? "en-GB" : locale === "tr" ? "tr-TR" : "de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return "—";
  }
}

const copy = (locale) => {
  const t = (en, tr, de) => (locale === "en" ? en : locale === "tr" ? tr : de);
  return {
    title: t("Back in stock", "Stoğa girince haber ver", "Wieder verfügbar"),
    subtitle: t(
      "Customers who asked to be emailed when a sold-out product comes back — and which products/categories have the most people waiting.",
      "Tükenen bir ürün stoğa girince haber verilmesini isteyen müşteriler — ve hangi ürün/kategoride kaç kişinin beklediği.",
      "Kunden, die per E-Mail benachrichtigt werden möchten, sobald ein ausverkauftes Produkt wieder verfügbar ist — und welche Produkte/Kategorien am meisten Nachfrage haben.",
    ),
    tabCustomers: t("Customers", "Müşteriler", "Kunden"),
    tabCategories: t("By category", "Kategoriye göre", "Nach Kategorie"),
    empty: t("Nobody is waiting on a restock right now.", "Şu anda stok bekleyen kimse yok.", "Aktuell wartet niemand auf einen Restock."),
    loadError: t("Could not load the list.", "Liste yüklenemedi.", "Liste konnte nicht geladen werden."),
    colEmail: t("Email", "E-posta", "E-Mail"),
    colProduct: t("Waiting for", "Beklediği ürün", "Wartet auf"),
    colSince: t("Since", "Tarih", "Seit"),
    colStatus: t("Status", "Durum", "Status"),
    notifiedBadge: t("Notified", "Bildirildi", "Benachrichtigt"),
    waitingBadge: t("Waiting", "Bekliyor", "Wartet"),
    uncategorized: t("Uncategorized", "Kategorisiz", "Ohne Kategorie"),
    peopleWaiting: (n) => t(`${n} waiting`, `${n} kişi bekliyor`, `${n} wartend`),
    openProduct: t("Open product", "Ürünü aç", "Produkt öffnen"),
  };
};

export default function BackInStockPage() {
  const locale = useLocale();
  const router = useRouter();
  const c = copy(locale);
  const [tab, setTab] = useState(0);
  const [subscribers, setSubscribers] = useState(null);
  const [productCounts, setProductCounts] = useState([]);
  const [categoryNameById, setCategoryNameById] = useState({});
  const [error, setError] = useState("");
  const [isSuperuser, setIsSuperuser] = useState(null);

  useEffect(() => {
    const su = typeof window !== "undefined" && localStorage.getItem("sellerIsSuperuser") === "true";
    setIsSuperuser(su);
    if (!su) { router.replace("/"); return; }
    let cancelled = false;
    const client = getMedusaAdminClient();
    Promise.all([client.getBackInStockSubscribers(), client.getAdminHubCategories().catch(() => ({ categories: [] }))])
      .then(([bis, cats]) => {
        if (cancelled) return;
        setSubscribers(bis.subscribers);
        setProductCounts(bis.product_counts);
        const map = {};
        for (const cat of cats.categories || []) map[cat.id] = cat.name;
        setCategoryNameById(map);
      })
      .catch(() => { if (!cancelled) { setSubscribers([]); setError(c.loadError); } });
    return () => { cancelled = true; };
  }, []);

  const categoryGroups = useMemo(() => {
    const byCategory = new Map();
    for (const p of productCounts) {
      const catName = (p.category_id && categoryNameById[p.category_id]) || c.uncategorized;
      if (!byCategory.has(catName)) byCategory.set(catName, []);
      byCategory.get(catName).push(p);
    }
    return [...byCategory.entries()]
      .map(([name, products]) => ({
        name,
        products: products.sort((a, b) => b.waiting_count - a.waiting_count),
        total: products.reduce((sum, p) => sum + p.waiting_count, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [productCounts, categoryNameById, c.uncategorized]);

  if (!isSuperuser) return null;

  const tabs = [
    { id: "customers", content: `${c.tabCustomers}${subscribers ? ` (${subscribers.length})` : ""}` },
    { id: "categories", content: `${c.tabCategories}${productCounts.length ? ` (${productCounts.length})` : ""}` },
  ];

  return (
    <Page title={c.title}>
      <BlockStack gap="400">
        <Text as="p" tone="subdued">{c.subtitle}</Text>
        {error && <Banner tone="critical" onDismiss={() => setError("")}>{error}</Banner>}
        <Card padding="0">
          <Tabs tabs={tabs} selected={tab} onSelect={setTab} />
          {subscribers === null ? (
            <Box padding="800">
              <InlineStack align="center"><Spinner size="small" /></InlineStack>
            </Box>
          ) : tab === 0 ? (
            subscribers.length === 0 ? (
              <Box padding="600">
                <Text as="p" tone="subdued" alignment="center">{c.empty}</Text>
              </Box>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f6f6f7", textAlign: "left" }}>
                    {[c.colEmail, c.colProduct, c.colSince, c.colStatus, ""].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6d7175", textTransform: "uppercase", borderBottom: "1px solid #e1e3e5" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subscribers.map((s) => (
                    <tr key={s.id} style={{ borderTop: "1px solid #f1f1f1", cursor: "pointer" }} onClick={() => router.push(`/products/${s.product.id}`)}>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#111827" }}>{s.email}</td>
                      <td style={{ padding: "12px 16px" }}>{s.product.title || "—"}</td>
                      <td style={{ padding: "12px 16px", color: "#6d7175" }}>{fmtDate(s.created_at, locale)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <Badge tone={s.notified_at ? "success" : "attention"}>{s.notified_at ? c.notifiedBadge : c.waitingBadge}</Badge>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ color: "#2563eb", fontWeight: 600, fontSize: 12 }}>{c.openProduct} →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : categoryGroups.length === 0 ? (
            <Box padding="600">
              <Text as="p" tone="subdued" alignment="center">{c.empty}</Text>
            </Box>
          ) : (
            <BlockStack gap="0">
              {categoryGroups.map((group) => (
                <Box key={group.name} padding="400" borderBlockEndWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">{group.name}</Text>
                    <Badge tone="attention">{c.peopleWaiting(group.total)}</Badge>
                  </InlineStack>
                  <Box paddingBlockStart="200">
                    <BlockStack gap="150">
                      {group.products.map((p) => (
                        <InlineStack key={p.product_id} align="space-between" blockAlign="center">
                          <span
                            style={{ fontSize: 13, color: "#4a4a4a", cursor: "pointer" }}
                            onClick={() => router.push(`/products/${p.product_id}`)}
                          >
                            {p.title || "—"}
                          </span>
                          <Badge>{String(p.waiting_count)}</Badge>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Box>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
