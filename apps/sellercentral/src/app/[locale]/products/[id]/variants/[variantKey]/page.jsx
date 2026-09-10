"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Box, Banner, SkeletonBodyText, SkeletonDisplayText, Card, BlockStack, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";
import VariantEditPage from "@/components/pages/products/VariantEditPage";

export default function ProductVariantDetailRoute() {
  const params = useParams();
  const router = useRouter();
  const idOrHandle = params?.id;
  const variantKeySegment = params?.variantKey;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  const isNewProduct = idOrHandle === "new";

  const fetchProduct = useCallback(async () => {
    if (!idOrHandle || isNewProduct) return;
    try {
      setLoading(true);
      setError(null);
      const data = await client.getAdminHubProduct(idOrHandle);
      setProduct(data || null);
      if (!data) setError("Product not found");
    } catch (err) {
      setError(err?.message || "Failed to load product");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [idOrHandle, isNewProduct]);

  useEffect(() => {
    if (isNewProduct) {
      setError("Save the product first, then open a variant from the matrix.");
      setProduct(null);
      setLoading(false);
      return;
    }
    fetchProduct();
  }, [isNewProduct, fetchProduct]);

  if (isNewProduct) {
    return (
      <DashboardLayout>
        <Box padding="400">
          <Banner tone="warning">{error}</Banner>
          <Box paddingBlockStart="400">
            <Button onClick={() => router.push("/products/new")}>Back to new product</Button>
          </Box>
        </Box>
      </DashboardLayout>
    );
  }

  // First load only — a background refetch after Save keeps <VariantEditPage> mounted
  // so it doesn't reset to the first tab.
  if (loading && !product) {
    return (
      <DashboardLayout>
        <Box padding="400">
          <Card>
            <BlockStack gap="300">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={5} />
            </BlockStack>
          </Card>
        </Box>
      </DashboardLayout>
    );
  }

  if (error || !product) {
    return (
      <DashboardLayout>
        <Box padding="400">
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error || "Product not found"}
          </Banner>
          <Box paddingBlockStart="400">
            <Button onClick={() => router.push(`/products/${idOrHandle}`)}>Back to product</Button>
          </Box>
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <VariantEditPage
        product={product}
        idOrHandle={idOrHandle}
        variantKeySegment={variantKeySegment}
        onReload={fetchProduct}
      />
    </DashboardLayout>
  );
}
