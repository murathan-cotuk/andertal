"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Box, Banner, SkeletonBodyText, SkeletonDisplayText, Card, BlockStack, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import { userError } from "@/lib/api-error-messages";
import DashboardLayout from "@/components/DashboardLayout";
import ProductEditPage from "@/components/pages/products/ProductEditPage";

export default function ProductDetailRoute() {
  const params = useParams();
  const router = useRouter();
  // After the first save of a new product the page stays mounted: createdId takes over from the
  // "new" route param (address bar updated in place, no reload → no "leave site?" prompt).
  const [createdId, setCreatedId] = useState(null);
  const routeId = params?.id;
  const idOrHandle = createdId || routeId;
  const [product, setProduct] = useState(null);
  const [sellerListings, setSellerListings] = useState([]);
  const [eanSiblings, setEanSiblings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  const isNewProduct = idOrHandle === "new";

  const handleCreated = useCallback((created, qs = "") => {
    const id = String(created?.id || "");
    if (!id) return;
    setCreatedId(id);
    if (typeof window !== "undefined") {
      const nextPath = window.location.pathname.replace(/\/new\/?$/, `/${encodeURIComponent(id)}`);
      window.history.replaceState(window.history.state, "", `${nextPath}${qs || ""}`);
    }
  }, []);

  const fetchProduct = useCallback(async () => {
    if (!idOrHandle || isNewProduct) return;
    try {
      setLoading(true);
      setError(null);
      const { product: data, seller_listings, ean_siblings } = await client.getAdminHubProductFull(idOrHandle);
      setProduct(data || null);
      setSellerListings(seller_listings || []);
      setEanSiblings(ean_siblings || []);
      if (!data) setError("Product not found");
    } catch (err) {
      setError(userError(err, null, "Failed to load product"));
      setProduct(null);
      setSellerListings([]);
      setEanSiblings([]);
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

  // Only show the full-page skeleton on the FIRST load. A background refetch
  // (after Save → onReload) must keep <ProductEditPage> mounted, otherwise it
  // remounts and jumps back to the first tab / loses transient UI state.
  if (!isNewProduct && loading && !product) {
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
        onCreated={handleCreated}
        sellerListings={sellerListings}
        eanSiblings={eanSiblings}
      />
    </DashboardLayout>
  );
}
