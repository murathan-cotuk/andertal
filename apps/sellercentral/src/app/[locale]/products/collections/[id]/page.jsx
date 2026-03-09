"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Banner, SkeletonBodyText, SkeletonDisplayText, Card, BlockStack, Button } from "@shopify/polaris";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";
import DashboardLayout from "@/components/DashboardLayout";
import CollectionEditPage from "@/components/pages/products/CollectionEditPage";

export default function CollectionDetailRoute() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const client = getMedusaAdminClient();

  const fetchCollection = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await client.getCollection(id);
      setCollection(data || null);
      if (!data) setError("Collection not found. It may be managed by a category.");
    } catch (err) {
      setError(err?.message || "Failed to load collection");
      setCollection(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCollection();
  }, [fetchCollection]);

  if (loading) {
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

  if (error || !collection) {
    return (
      <DashboardLayout>
        <Box padding="400">
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error || "Collection not found"}
          </Banner>
          <Box paddingBlockStart="400">
            <Button onClick={() => router.push("/products/collections")}>Back to Collections</Button>
          </Box>
        </Box>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <CollectionEditPage collection={collection} isNew={false} onReload={fetchCollection} />
    </DashboardLayout>
  );
}
