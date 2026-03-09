"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Box, Banner, SkeletonBodyText, SkeletonDisplayText, Card, BlockStack, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";
import ProductEditPage from "@/components/pages/products/ProductEditPage";

export default function ProductDetailRoute() {
  const params = useParams();
  const router = useRouter();
  const idOrHandle = params?.id;
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
      setProduct({
        title: "",
        handle: "",
        sku: "",
        description: "",
        status: "draft",
        price: 0,
        inventory: 0,
        metadata: {},
        variants: [],
      });
      setLoading(false);
      return;
    }
    fetchProduct();
  }, [isNewProduct, fetchProduct]);

  if (!isNewProduct && loading) {
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

  if (!isNewProduct && (error || !product)) {
    return (
      <DashboardLayout>
        <Box padding="400">
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error || "Product not found"}
          </Banner>
          <Box paddingBlockStart="400">
            <Button onClick={() => router.push("/products/inventory")}>Back to Inventory</Button>
          </Box>
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ProductEditPage
        product={product}
        idOrHandle={idOrHandle}
        isNew={isNewProduct}
        onReload={fetchProduct}
      />
    </DashboardLayout>
  );
}
