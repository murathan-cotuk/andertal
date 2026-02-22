"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
  Divider,
  Badge,
} from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const idOrHandle = params?.id;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  useEffect(() => {
    if (!idOrHandle) {
      setLoading(false);
      setError("Missing product id");
      return;
    }
    let cancelled = false;
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await client.getAdminHubProduct(idOrHandle);
        if (!cancelled && data) setProduct(data);
        else if (!cancelled) setError("Product not found");
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load product");
          setProduct(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProduct();
    return () => { cancelled = true; };
  }, [idOrHandle]);

  if (loading) {
    return (
      <DashboardLayout>
        <Page title="Product" backAction={{ content: "Inventory", onAction: () => router.push("/products/inventory") }}>
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={3} />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </DashboardLayout>
    );
  }

  if (error || !product) {
    return (
      <DashboardLayout>
        <Page title="Product" backAction={{ content: "Inventory", onAction: () => router.push("/products/inventory") }}>
          <Layout>
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setError(null)}>
                {error || "Product not found"}
              </Banner>
              <Box paddingBlockStart="400">
                <Button onClick={() => router.push("/products/inventory")}>Back to Inventory</Button>
              </Box>
            </Layout.Section>
          </Layout>
        </Page>
      </DashboardLayout>
    );
  }

  const price = product.price != null ? Number(product.price) : (product.variants?.[0]?.prices?.[0]?.amount != null ? Number(product.variants[0].prices[0].amount) / 100 : 0);
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return (
    <DashboardLayout>
      <Page
        title={product.title || "Product"}
        backAction={{ content: "Inventory", onAction: () => router.push("/products/inventory") }}
        primaryAction={{
          content: "Edit",
          onAction: () => router.push(`/products/single-upload?edit=${product.id}`),
        }}
      >
        <Layout>
          {error && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => setError(null)}>{error}</Banner>
            </Layout.Section>
          )}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <Text as="h1" variant="headingLg" fontWeight="bold">{product.title}</Text>
                  <Badge tone={product.status === "published" ? "success" : product.status === "archived" ? "critical" : "attention"}>
                    {product.status || "draft"}
                  </Badge>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">URL</Text>
                  <Text as="p" variant="bodyMd">/products/{product.handle || product.id}</Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Price</Text>
                  <Text as="p" variant="bodyMd">€{price.toFixed(2)}</Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Inventory</Text>
                  <Text as="p" variant="bodyMd">{product.inventory != null ? product.inventory : 0} units</Text>
                </BlockStack>
                {product.sku && (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">SKU</Text>
                    <Text as="p" variant="bodyMd">{product.sku}</Text>
                  </BlockStack>
                )}
                {product.description && (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Description</Text>
                    <Text as="p" variant="bodyMd">{product.description}</Text>
                  </BlockStack>
                )}
                {variants.length > 0 && (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="subdued">Variants</Text>
                    {variants.map((v, i) => (
                      <Box key={i} padding="200" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" variant="bodySm">{v.title || v.name || `Variant ${i + 1}`} · {Array.isArray(v.options) ? v.options.map((o) => o.value).filter(Boolean).join(", ") : "—"}</Text>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </DashboardLayout>
  );
}
