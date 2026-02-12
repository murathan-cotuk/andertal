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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const medusaClient = getMedusaAdminClient();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const productsData = await medusaClient.getProducts();
        const totalProducts = productsData.products?.length || 0;
        setStats({
          totalProducts,
          totalOrders: 0,
          totalRevenue: 0,
          pendingOrders: 0,
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
