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
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const MEDUSA_BACKEND_DISPLAY_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "https://belucha-medusa-backend.onrender.com")
    : "https://belucha-medusa-backend.onrender.com";

export default function DashboardHome() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const medusaClient = getMedusaAdminClient();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const [productsData, ordersData] = await Promise.all([
          medusaClient.getAdminHubProducts(),
          medusaClient.getOrders().catch(() => ({ orders: [] })),
        ]);
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
      <Page title="Home">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center" wrap>
                {[1, 2, 3, 4].map((i) => (
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
                  <SkeletonBodyText lines={3} />
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
      <Page title="Home">
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

  return (
    <Page
      title="Home"
      primaryAction={{
        content: "Add product",
        onAction: () => router.push("/products/single-upload"),
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
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
              <Text as="h2" variant="headingMd">
                Medusa API
              </Text>
              <Divider />
              <InlineStack gap="300" blockAlign="center" wrap>
                <Box
                  padding="200"
                  background="bg-fill-success-secondary"
                  borderRadius="200"
                >
                  <Text as="span" variant="bodySm" fontWeight="semibold" tone="success">
                    Connected
                  </Text>
                </Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Backend verileri bu panelde kullanılıyor (ürünler, siparişler).
                </Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                API adresi:{" "}
                <a
                  href={MEDUSA_BACKEND_DISPLAY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  {MEDUSA_BACKEND_DISPLAY_URL}
                </a>
                {" "}(yeni sekmede açılır; backend durum sayfasını gösterir)
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent activity
              </Text>
              <Divider />
              <Text as="p" tone="subdued">
                Recent activity will appear here.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Quick actions
              </Text>
              <Divider />
              <InlineStack gap="300" wrap>
                <Button variant="primary" onClick={() => router.push("/products/single-upload")}>
                  Add product
                </Button>
                <Button onClick={() => router.push("/orders")}>View orders</Button>
                <Button onClick={() => router.push("/analytics")}>View analytics</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
