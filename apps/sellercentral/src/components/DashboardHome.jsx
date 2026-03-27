"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Divider,
  SkeletonBodyText,
  SkeletonDisplayText,
  Banner,
  Box,
  DataTable,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

export default function DashboardHome() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [pendingReturns, setPendingReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const medusaClient = getMedusaAdminClient();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const [productsData, ordersData, returnsData] = await Promise.all([
          medusaClient.getAdminHubProducts(),
          medusaClient.getOrders().catch(() => ({ orders: [] })),
          medusaClient.getReturns().catch(() => ({ returns: [] })),
        ]);
        const allReturns = returnsData.returns || [];
        setPendingReturns(allReturns.filter(r => r.status === 'offen'));
        const allProducts = productsData.products || [];
        const products = allProducts.filter((p) => (p.status || "").toLowerCase() !== "draft");
        const orders = ordersData.orders || [];
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(
          (o) => o.status === "pending" || o.status === "open"
        ).length;
        let totalRevenue = 0;
        for (const order of orders) {
          const total = order.total ?? order.total_amount ?? 0;
          totalRevenue += typeof total === "number" ? total / 100 : Number(total) / 100 || 0;
        }
        setStats({
          totalProducts: products.length,
          totalOrders,
          totalRevenue,
          pendingOrders,
        });
        setRecentOrders((orders || []).slice(0, 5));
      } catch (err) {
        console.error("Error fetching dashboard stats:", err);
        setError(err?.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center" wrap>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} padding="400">
                    <BlockStack gap="200">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={1} />
                    </BlockStack>
                  </Card>
                ))}
              </InlineStack>
              <Card>
                <BlockStack gap="200">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={5} />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const statCards = [
    { value: stats.totalProducts, label: "Total products" },
    { value: stats.totalOrders, label: "Orders" },
    { value: `€${stats.totalRevenue.toFixed(2)}`, label: "Total revenue" },
    { value: stats.pendingOrders, label: "Pending orders" },
  ];

  const performanceCards = [
    { value: "—", label: "Impressions", sub: "Last 30 days" },
    { value: "—", label: "Clicks", sub: "Last 30 days" },
    { value: "—", label: "CTR", sub: "Click-through rate" },
    { value: "—", label: "ACoS", sub: "Advertising cost of sales" },
  ];

  const orderRows = recentOrders.length
    ? recentOrders.map((o) => [
        (o.id || o.display_id || "").toString().slice(-8),
        `€${typeof (o.total ?? o.total_amount) === "number" ? ((o.total ?? o.total_amount) / 100).toFixed(2) : "0.00"}`,
        (o.status || "—") + (o.created_at ? ` · ${new Date(o.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""),
        <Button key={o.id} variant="plain" size="slim" onClick={() => router.push(`/orders`)}>View</Button>,
      ])
    : [["No orders yet", "—", "—", ""]];

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: "Add product",
        onAction: () => router.push("/products/single-upload"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Text as="h1" variant="headingLg">Overview</Text>
            <InlineStack gap="400" blockAlign="center" wrap>
              {statCards.map(({ value, label }) => (
                <Card key={label} padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="headingMd" fontWeight="bold">
                      {value}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {label}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Performance (Shop / Ads)</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Impressions, clicks, CTR and ACoS can be connected once analytics are set up.
              </Text>
              <Divider />
              <InlineStack gap="400" wrap>
                {performanceCards.map(({ value, label, sub }) => (
                  <Box key={label} minWidth="120px">
                    <BlockStack gap="100">
                      <Text as="p" variant="headingMd" fontWeight="bold">{value}</Text>
                      <Text as="p" variant="bodySm" fontWeight="medium">{label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{sub}</Text>
                    </BlockStack>
                  </Box>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack blockAlign="center" align="space-between" wrap>
                <Text as="h2" variant="headingMd">Recent orders</Text>
                <Button variant="plain" onClick={() => router.push("/orders")}>View all</Button>
              </InlineStack>
              <Divider />
              <DataTable
                columnContentTypes={["text", "numeric", "text", "text"]}
                headings={["Order", "Total", "Status", ""]}
                rows={orderRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {pendingReturns.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack blockAlign="center" align="space-between" wrap>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">İadeye Cevap Bekleyenler</Text>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, padding: "0 5px" }}>
                      {pendingReturns.length}
                    </span>
                  </InlineStack>
                  <Button variant="plain" onClick={() => router.push("/orders/returns")}>Alle anzeigen</Button>
                </InlineStack>
                <Divider />
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Retoure-Nr.", "Bestellung", "Kunde", "Grund"]}
                  rows={pendingReturns.slice(0, 5).map(r => [
                    `R-${r.return_number || r.id?.slice(0, 8)}`,
                    r.order_number ? `#${r.order_number}` : "—",
                    [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "—",
                    r.reason || "—",
                  ])}
                />
                <Button variant="primary" tone="critical" onClick={() => router.push("/orders/returns")}>
                  Rückgabeanfragen bearbeiten
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Quick actions</Text>
              <Divider />
              <InlineStack gap="300" wrap>
                <Button variant="primary" onClick={() => router.push("/products/single-upload")}>
                  Add product
                </Button>
                <Button onClick={() => router.push("/orders")}>Orders</Button>
                <Button onClick={() => router.push("/products")}>Products</Button>
                <Button onClick={() => router.push("/analytics")}>Analytics</Button>
                <Button onClick={() => router.push("/content/menus")}>Menus</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
